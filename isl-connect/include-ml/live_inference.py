"""Live webcam inference for the AI4Bharat INCLUDE Transformer.

Run from include-ml:
    venv\\Scripts\\python.exe live_inference.py

Feature layout: pose (25 x 2), hand1 (21 x 2), hand2 (21 x 2) = 134.
Press q or Escape to quit.
"""
import argparse
import json
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import torch

ROOT = Path(__file__).resolve().parent
INCLUDE_ROOT = ROOT / "INCLUDE-master"
MODEL_PATH = ROOT / "models" / "transformer_small" / "transformer.pth"
LABEL_PATH = INCLUDE_ROOT / "label_maps" / "label_map_include.json"
sys.path.insert(0, str(INCLUDE_ROOT))
from configs import TransformerConfig  # noqa: E402
from models import Transformer  # noqa: E402

POSE_LANDMARKS = 25
HAND_LANDMARKS = 21
# runner.py passes max_frame_len=169 to every KeypointsDataset used for the
# trained transformer run. The model has positional capacity for 256, but the
# training tensor length is 169.
SEQUENCE_LENGTH = 169
FRAME_WIDTH = 1920.0
FRAME_HEIGHT = 1080.0
mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose


def parse_args():
    parser = argparse.ArgumentParser(description="Live INCLUDE sign inference")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--labels", type=Path, default=LABEL_PATH)
    parser.add_argument("--sequence-length", type=int, default=SEQUENCE_LENGTH)
    parser.add_argument("--inference-interval", type=int, default=15)
    parser.add_argument("--min-frames", type=int, default=20)
    parser.add_argument("--confidence-threshold", type=float, default=0.0)
    return parser.parse_args()


def landmark_xy(landmarks, count):
    if landmarks is None:
        return np.full((count, 2), np.nan, dtype=np.float32)
    return np.asarray([[p.x, p.y] for p in landmarks.landmark[:count]], dtype=np.float32)


def swap_hands(pose, hand1, hand2):
    """Match generate_keypoints_missing.py's wrist-based hand assignment."""
    first_missing = np.isnan(hand1[0]).any()
    second_missing = np.isnan(hand2[0]).any()
    if first_missing == second_missing or np.isnan(pose[15]).any() or np.isnan(pose[16]).any():
        return hand1, hand2
    hand = hand2 if first_missing else hand1
    left = np.sum((pose[15] - hand[0]) ** 2)
    right = np.sum((pose[16] - hand[0]) ** 2)
    if (left < right and not first_missing) or (right < left and first_missing):
        return hand2, hand1
    return hand1, hand2


def extract_frame(hand_results, pose_results):
    pose = landmark_xy(pose_results.pose_landmarks if pose_results else None, 25)
    detected = hand_results.multi_hand_landmarks if hand_results and hand_results.multi_hand_landmarks else []
    hand1 = landmark_xy(detected[0] if len(detected) > 0 else None, HAND_LANDMARKS)
    hand2 = landmark_xy(detected[1] if len(detected) > 1 else None, HAND_LANDMARKS)
    hand1, hand2 = swap_hands(pose, hand1, hand2)
    return pose, hand1, hand2, bool(detected)


def interpolate(stream):
    """Match pandas linear interpolation with edge filling in dataset.py."""
    result = stream.copy()
    for landmark in range(stream.shape[1]):
        for coordinate in range(2):
            values = stream[:, landmark, coordinate]
            valid = np.flatnonzero(~np.isnan(values))
            result[:, landmark, coordinate] = 0.0 if len(valid) == 0 else np.interp(
                np.arange(len(values)), valid, values[valid]
            )
    return result


def prepare_sequence(frames, sequence_length):
    """Return the model input shape (1, sequence_length, 134)."""
    pose = interpolate(np.stack([frame[0] for frame in frames]))
    hand1 = interpolate(np.stack([frame[1] for frame in frames]))
    hand2 = interpolate(np.stack([frame[2] for frame in frames]))
    scale = np.array([FRAME_WIDTH, FRAME_HEIGHT], dtype=np.float32)
    data = np.concatenate([
        (pose * scale).reshape(len(frames), 50),
        (hand1 * scale).reshape(len(frames), 42),
        (hand2 * scale).reshape(len(frames), 42),
    ], axis=1).astype(np.float32)
    if len(data) > sequence_length:
        data = data[-sequence_length:]
    elif len(data) < sequence_length:
        data = np.pad(data, ((0, sequence_length - len(data)), (0, 0)))
    return torch.from_numpy(data).unsqueeze(0)


def load_model(model_path, device):
    checkpoint = torch.load(model_path, map_location=device)
    if not isinstance(checkpoint, dict) or "model" not in checkpoint:
        raise ValueError(f"Expected a checkpoint with a 'model' key: {model_path}")
    model = Transformer(TransformerConfig(size="small", max_position_embeddings=256), n_classes=263).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model


def main():
    args = parse_args()
    if args.sequence_length > 256:
        raise ValueError("--sequence-length cannot exceed 256")
    if not args.model.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {args.model}")
    if not args.labels.is_file():
        raise FileNotFoundError(f"Label map not found: {args.labels}")
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")
    with args.labels.open(encoding="utf-8") as handle:
        label_map = json.load(handle)
    labels = [label for label, _ in sorted(label_map.items(), key=lambda item: item[1])]
    if len(labels) != 263:
        raise ValueError(f"Expected 263 INCLUDE labels, found {len(labels)}")
    model = load_model(args.model, device)
    camera = cv2.VideoCapture(args.camera)
    if not camera.isOpened():
        raise RuntimeError(f"Could not open webcam {args.camera}")
    frames = deque(maxlen=args.sequence_length)
    frame_count = 0
    prediction, confidence, top_predictions = "Waiting for sign...", 0.0, []
    previous_time = time.perf_counter()
    try:
        with mp_hands.Hands(static_image_mode=False, min_detection_confidence=0.5,
                            min_tracking_confidence=0.5, max_num_hands=2) as hands, \
             mp_pose.Pose(static_image_mode=False, min_detection_confidence=0.5,
                          min_tracking_confidence=0.5) as pose:
            while True:
                ok, frame = camera.read()
                if not ok:
                    raise RuntimeError("Webcam stopped returning frames")
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frames.append(extract_frame(hands.process(rgb), pose.process(rgb)))
                frame_count += 1
                if len(frames) >= args.min_frames and frame_count % args.inference_interval == 0:
                    if sum(int(item[3]) for item in frames):
                        model_input = prepare_sequence(list(frames), args.sequence_length).to(device)
                        with torch.inference_mode():
                            probabilities = torch.softmax(model(model_input), dim=-1)[0]
                        values, indices = torch.topk(probabilities, k=3)
                        top_predictions = [(labels[int(i)], float(v)) for v, i in zip(values.cpu(), indices.cpu())]
                        prediction, confidence = top_predictions[0]
                        if args.confidence_threshold and confidence < args.confidence_threshold:
                            prediction = "Uncertain"
                fps = 1.0 / max(time.perf_counter() - previous_time, 1e-6)
                previous_time = time.perf_counter()
                cv2.putText(frame, f"Sign: {prediction} ({confidence:.2f})", (20, 35),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
                cv2.putText(frame, f"FPS: {fps:.1f}  Buffer: {len(frames)}", (20, 65),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1)
                for rank, (label, probability) in enumerate(top_predictions[1:], 2):
                    cv2.putText(frame, f"{rank}. {label} ({probability:.2f})", (20, 65 + rank * 25),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                cv2.imshow("INCLUDE Live Inference", frame)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
    finally:
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
