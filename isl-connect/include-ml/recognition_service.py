"""WebSocket service for the existing 24-class INCLUDE Transformer.

The browser sends JPEG frames from the call's already-open camera stream. This
service owns MediaPipe, the exact live_inference preprocessing, and one model
instance shared by all connections. A client explicitly starts and stops a
clip so the model only sees one sign gesture at a time.
"""
import argparse
import asyncio
import json
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import torch
import websockets

from custom_common import DEFAULT_CHECKPOINT, INCLUDE_ROOT
from custom_model import load_checkpoint
from live_inference import extract_frame, prepare_sequence, resample_to_fps

mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose


def parse_args():
    parser = argparse.ArgumentParser(description="Samvaad ISL recognition WebSocket service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--labels", type=Path, default=INCLUDE_ROOT / "label_maps" / "label_map_include.json")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--min-frames", type=int, default=8)
    parser.add_argument("--max-frames", type=int, default=256)
    return parser.parse_args()


class RecognitionService:
    def __init__(self, args):
        self.device = (
            torch.device("cuda" if torch.cuda.is_available() else "cpu")
            if args.device == "auto"
            else torch.device(args.device)
        )
        if not args.model.is_file():
            raise FileNotFoundError(f"Model checkpoint not found: {args.model}")
        self.model, self.meta = load_checkpoint(args.model, self.device, legacy_labels_path=args.labels)
        self.labels = self.meta["labels"]
        if len(self.labels) != 24 or self.meta.get("input_size") != 134:
            raise ValueError(
                f"Expected the 24-class, 134-feature custom checkpoint; got "
                f"classes={len(self.labels)}, input_size={self.meta.get('input_size')}"
            )
        self.sequence_length = int(self.meta["max_frame_len"])
        self.train_fps = float(self.meta.get("train_fps") or 0)
        self.min_frames = args.min_frames
        self.max_frames = min(args.max_frames, self.sequence_length)

    def info(self):
        return {
            "classes": len(self.labels),
            "labels": self.labels,
            "sequence_length": self.sequence_length,
            "feature_size": int(self.meta["input_size"]),
            "train_fps": self.train_fps,
            "preprocessing_version": self.meta.get("preprocessing_version"),
            # Additive field: whether training clips were mirrored before MediaPipe. Clients that
            # send frames (e.g. the Chrome extension) must flip to match; older clients ignore it.
            "flip_horizontal": self.meta.get("flip_horizontal"),
            "model": "DeterministicEvalTransformer",
            "device": str(self.device),
        }

    def classify(self, frames, times, frame_width, frame_height):
        if len(frames) < self.min_frames:
            raise ValueError(f"Capture is too short ({len(frames)} frames; need at least {self.min_frames})")
        sampled = resample_to_fps(frames, times, self.train_fps) if self.train_fps else frames
        model_input, attention_mask = prepare_sequence(
            sampled,
            self.sequence_length,
            frame_width,
            frame_height,
        )
        model_input = model_input.to(self.device)
        attention_mask = attention_mask.to(self.device)
        started = time.perf_counter()
        with torch.inference_mode():
            probabilities = torch.softmax(
                self.model(model_input, attention_mask=attention_mask), dim=-1
            )[0]
        elapsed_ms = round((time.perf_counter() - started) * 1000, 1)
        values, indices = torch.topk(probabilities, k=min(5, len(self.labels)))
        top = [
            {"label": self.labels[int(index)], "confidence": round(float(value), 6)}
            for value, index in zip(values.cpu(), indices.cpu())
        ]
        return {
            "label": top[0]["label"],
            "confidence": top[0]["confidence"],
            "top": top,
            "frames": len(frames),
            "model_frames": len(sampled),
            "inference_ms": elapsed_ms,
        }


async def send_json(websocket, payload):
    await websocket.send(json.dumps(payload))


async def handle_connection(websocket, service):
    frames = []
    times = []
    frame_width = frame_height = 0
    capturing = False
    started_at = 0.0
    try:
        await send_json(websocket, {"type": "ready", "service": service.info()})
        with mp_hands.Hands(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            max_num_hands=2,
        ) as hands, mp_pose.Pose(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            async for message in websocket:
                if isinstance(message, str):
                    command = json.loads(message)
                    if command.get("type") == "start":
                        frames, times = [], []
                        frame_width = frame_height = 0
                        capturing = True
                        started_at = time.perf_counter()
                        await send_json(websocket, {"type": "status", "status": "capturing"})
                    elif command.get("type") == "stop" and capturing:
                        capturing = False
                        try:
                            result = service.classify(frames, times, frame_width, frame_height)
                            await send_json(websocket, {"type": "prediction", **result})
                        except Exception as error:
                            await send_json(websocket, {"type": "error", "message": str(error)})
                        frames, times = [], []
                    continue

                if not capturing:
                    continue
                image = cv2.imdecode(np.frombuffer(message, dtype=np.uint8), cv2.IMREAD_COLOR)
                if image is None:
                    await send_json(websocket, {"type": "error", "message": "Invalid JPEG frame"})
                    continue
                rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                frame_height, frame_width = image.shape[:2]
                frame = extract_frame(hands.process(rgb), pose.process(rgb))
                frames.append(frame)
                times.append(time.perf_counter())
                if len(frames) >= service.max_frames:
                    capturing = False
                    result = service.classify(frames, times, frame_width, frame_height)
                    await send_json(websocket, {"type": "prediction", **result})
                    frames, times = [], []
                    await send_json(websocket, {"type": "status", "status": "idle"})
    except websockets.exceptions.ConnectionClosed:
        return
    except Exception as error:
        try:
            await send_json(websocket, {"type": "error", "message": str(error)})
        except websockets.exceptions.ConnectionClosed:
            pass
    finally:
        elapsed = time.perf_counter() - started_at if started_at else 0
        if capturing and elapsed > 0:
            print(f"client disconnected during capture after {len(frames)} frames")


async def run(args):
    service = RecognitionService(args)
    print(json.dumps({"event": "model_loaded", **service.info()}))
    async with websockets.serve(lambda ws: handle_connection(ws, service), args.host, args.port):
        print(f"ISL recognition service listening on ws://{args.host}:{args.port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))