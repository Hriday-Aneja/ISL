"""WebSocket service for the existing 24-class INCLUDE Transformer.

The browser sends JPEG frames from the call's already-open camera stream. This
service owns MediaPipe, the exact live_inference preprocessing, and one model
instance shared by all connections. A client explicitly starts and stops a
clip so the model only sees one sign gesture at a time.
"""
import argparse
import asyncio
import fnmatch
import json
import os
import threading
import time
from concurrent.futures import ThreadPoolExecutor
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

# Browsers always send an Origin header on a WebSocket handshake, and a web page can open
# ws://127.0.0.1:<port> regardless of CORS. Without a check, ANY website the user visits could
# stream frames to this local service. Non-browser clients (scripts, tools/protocol_check.py)
# send no Origin and are allowed. Entries are fnmatch patterns.
DEFAULT_ALLOWED_ORIGINS = (
    "http://localhost",
    "http://localhost:*",
    "http://127.0.0.1",
    "http://127.0.0.1:*",
    "https://samvaad-khaki.vercel.app",
    "chrome-extension://*",  # the Samvaad extension panel; pin one with --allowed-origin + --no-default-origins
)


class InvalidFrame(ValueError):
    """A binary message that is not a decodable JPEG."""


def parse_args():
    parser = argparse.ArgumentParser(description="Samvaad ISL recognition WebSocket service")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--model", type=Path, default=DEFAULT_CHECKPOINT)
    parser.add_argument("--labels", type=Path, default=INCLUDE_ROOT / "label_maps" / "label_map_include.json")
    parser.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    parser.add_argument("--min-frames", type=int, default=8)
    parser.add_argument("--max-frames", type=int, default=256)
    parser.add_argument(
        "--allowed-origin",
        action="append",
        default=[],
        metavar="PATTERN",
        help="extra browser Origin allowed to connect (fnmatch pattern, repeatable). "
        "Also read from SAMVAAD_ALLOWED_ORIGINS (comma-separated).",
    )
    parser.add_argument(
        "--no-default-origins",
        action="store_true",
        help="allow only --allowed-origin / SAMVAAD_ALLOWED_ORIGINS entries (e.g. pin one extension id)",
    )
    parser.add_argument(
        "--allow-any-origin",
        action="store_true",
        help="DISABLE the Origin check (development only; any website can use the service)",
    )
    return parser.parse_args()


def build_allowed_origins(args):
    """Return the tuple of allowed Origin patterns, or None when the check is disabled."""
    if args.allow_any_origin:
        return None
    from_env = [o.strip() for o in os.environ.get("SAMVAAD_ALLOWED_ORIGINS", "").split(",") if o.strip()]
    base = () if args.no_default_origins else DEFAULT_ALLOWED_ORIGINS
    return tuple(base) + tuple(args.allowed_origin) + tuple(from_env)


def origin_allowed(origin, allowed_origins):
    """No Origin header = not a browser = allowed. allowed_origins=None disables the check."""
    if allowed_origins is None or origin is None:
        return True
    return any(fnmatch.fnmatchcase(origin, pattern) for pattern in allowed_origins)


def get_origin(websocket):
    """Origin header across websockets 12-15 (legacy and new asyncio connection objects)."""
    request = getattr(websocket, "request", None)
    headers = getattr(request, "headers", None) if request is not None else None
    if headers is None:
        headers = getattr(websocket, "request_headers", None)
    return headers.get("Origin") if headers is not None else None


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
        # One model instance is shared by every connection; classify() runs on worker threads,
        # so serialise it (also keeps GPU memory use predictable).
        self._classify_lock = threading.Lock()

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
        with self._classify_lock:
            return self._classify(frames, times, frame_width, frame_height)

    def _classify(self, frames, times, frame_width, frame_height):
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


class Trackers:
    """MediaPipe Hands + Pose for ONE connection. Not thread-safe: always used from that
    connection's single worker thread (see Worker)."""

    def __init__(self):
        self.hands = mp_hands.Hands(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            max_num_hands=2,
        )
        self.pose = mp_pose.Pose(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        )

    def process(self, jpeg_bytes):
        """JPEG bytes -> (landmark frame, width, height). Raises InvalidFrame for a bad JPEG."""
        image = cv2.imdecode(np.frombuffer(jpeg_bytes, dtype=np.uint8), cv2.IMREAD_COLOR)
        if image is None:
            raise InvalidFrame("Invalid JPEG frame")
        rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        height, width = image.shape[:2]
        return extract_frame(self.hands.process(rgb), self.pose.process(rgb)), width, height

    def close(self):
        self.hands.close()
        self.pose.close()


class Worker:
    """A dedicated single thread per connection.

    MediaPipe, JPEG decoding and the Transformer forward pass are blocking and CPU-heavy. Running
    them on the event loop froze every other client (web app + extension at the same time) for the
    whole inference. One thread per connection keeps MediaPipe objects thread-affine and the
    connections independent of each other.
    """

    def __init__(self):
        self._executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="samvaad-conn")

    async def run(self, fn, *args):
        return await asyncio.get_running_loop().run_in_executor(self._executor, fn, *args)

    def shutdown(self):
        self._executor.shutdown(wait=False)


class Capture:
    """The clip currently being recorded on one connection."""

    def __init__(self):
        self.active = False
        self.started_at = 0.0
        self.reset()

    def reset(self):
        self.frames = []
        self.times = []
        self.width = 0
        self.height = 0

    def start(self):
        self.reset()
        self.active = True
        self.started_at = time.perf_counter()


async def send_json(websocket, payload):
    await websocket.send(json.dumps(payload))


async def finish_capture(websocket, service, worker, capture):
    """Classify the recorded clip and send either a prediction or an error. Never raises
    anything except a closed connection, so a failed classification cannot end the session."""
    capture.active = False
    frames, times, width, height = capture.frames, capture.times, capture.width, capture.height
    capture.reset()
    try:
        result = await worker.run(service.classify, frames, times, width, height)
        payload = {"type": "prediction", **result}
    except Exception as error:
        payload = {"type": "error", "message": str(error)}
    await send_json(websocket, payload)


async def handle_command(websocket, service, worker, capture, raw):
    """Handle one text (JSON) command. A malformed command gets an error reply; it does not close
    the connection."""
    try:
        command = json.loads(raw)
    except ValueError:
        await send_json(websocket, {"type": "error", "message": "Malformed JSON command"})
        return
    if not isinstance(command, dict):
        await send_json(websocket, {"type": "error", "message": "Command must be a JSON object"})
        return
    kind = command.get("type")
    if kind == "start":
        capture.start()
        await send_json(websocket, {"type": "status", "status": "capturing"})
    elif kind == "stop" and capture.active:
        await finish_capture(websocket, service, worker, capture)
    # Unknown / out-of-order commands are ignored, as before (older clients may send others).


async def handle_frame(websocket, service, worker, trackers, capture, message):
    """Handle one binary JPEG frame."""
    if not capture.active:
        return
    try:
        frame, capture.width, capture.height = await worker.run(trackers.process, message)
    except InvalidFrame as error:
        await send_json(websocket, {"type": "error", "message": str(error)})
        return
    except Exception as error:  # one bad frame must not end the session
        await send_json(websocket, {"type": "error", "message": f"Frame processing failed: {error}"})
        return
    capture.frames.append(frame)
    capture.times.append(time.perf_counter())
    if len(capture.frames) >= service.max_frames:
        await finish_capture(websocket, service, worker, capture)
        await send_json(websocket, {"type": "status", "status": "idle"})


async def handle_connection(websocket, service, allowed_origins=DEFAULT_ALLOWED_ORIGINS, trackers_factory=Trackers):
    origin = get_origin(websocket)
    if not origin_allowed(origin, allowed_origins):
        print(json.dumps({"event": "origin_rejected", "origin": origin}))
        await websocket.close(code=1008, reason="Origin not allowed")
        return

    worker = Worker()
    capture = Capture()
    trackers = None
    try:
        await send_json(websocket, {"type": "ready", "service": service.info()})
        trackers = await worker.run(trackers_factory)
        async for message in websocket:
            if isinstance(message, str):
                await handle_command(websocket, service, worker, capture, message)
            else:
                await handle_frame(websocket, service, worker, trackers, capture, message)
    except websockets.exceptions.ConnectionClosed:
        return
    except Exception as error:
        try:
            await send_json(websocket, {"type": "error", "message": str(error)})
        except websockets.exceptions.ConnectionClosed:
            pass
    finally:
        if capture.active:
            elapsed = time.perf_counter() - capture.started_at
            print(f"client disconnected during capture after {len(capture.frames)} frames ({elapsed:.1f}s)")
        if trackers is not None:
            try:
                await worker.run(trackers.close)
            except Exception:
                pass
        worker.shutdown()


async def run(args):
    service = RecognitionService(args)
    allowed_origins = build_allowed_origins(args)
    print(json.dumps({"event": "model_loaded", **service.info()}))
    if allowed_origins is None:
        print("WARNING: --allow-any-origin set; any website can connect to this service")
    else:
        print(json.dumps({"event": "allowed_origins", "origins": list(allowed_origins)}))
    async with websockets.serve(
        lambda ws: handle_connection(ws, service, allowed_origins), args.host, args.port
    ):
        print(f"ISL recognition service listening on ws://{args.host}:{args.port}")
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(run(parse_args()))
