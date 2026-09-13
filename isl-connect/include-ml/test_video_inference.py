"""Run the trained INCLUDE Transformer on one INCLUDE video.

Run from include-ml, for example:
    venv\\Scripts\\python.exe test_video_inference.py "dataset\\Places\\35. Bank\\MVI_3335.MOV"
"""
import argparse
import json
import re
import sys
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
FEATURE_DIMENSION = 134
SEQUENCE_LENGTH = 169
NUMBER_OF_CLASSES = 263
FRAME_WIDTH = 1920.0
FRAME_HEIGHT = 1080.0


def parse_args():
    parser = argparse.ArgumentParser(description="Test INCLUDE video inference")
    parser.add_argument("video", type=Path, help="path to one INCLUDE .MOV video")
    parser.add_argument("--model", type=Path, default=MODEL_PATH)
    parser.add_argument("--labels", type=Path, default=LABEL_PATH)
    return parser.parse_args()


def process_landmarks(landmarks):
    if landmarks is None:
        return [], []
    return (
        [landmark.x for landmark in landmarks.landmark],
        [landmark.y for landmark in landmarks.landmark],
    )


def process_hand_keypoints(results):
    hand1_x, hand1_y, hand2_x, hand2_y = [], [], [], []
    detected = results.multi_hand_landmarks
    if detected:
        if len(detected) > 0:
            hand1_x, hand1_y = process_landmarks(detected[0])
        if len(detected) > 1:
            hand2_x, hand2_y = process_landmarks(detected[1])
    return hand1_x, hand1_y, hand2_x, hand2_y


def process_pose_keypoints(results):
    pose = results.pose_landmarks
    if pose is None:
        return [], []
    return (
        [pose.landmark[index].x for index in range(POSE_LANDMARKS)],
        [pose.landmark[index].y for index in range(POSE_LANDMARKS)],
    )


def should_swap_hand(left_wrist, right_wrist, hand, input_hand):
    left_distance = sum((left - point) ** 2 for left, point in zip(left_wrist, hand))
    right_distance = sum((right - point) ** 2 for right, point in zip(right_wrist, hand))
    return (left_distance < right_distance and input_hand == "h2") or (
        right_distance < left_distance and input_hand == "h1"
    )


def extract_frame(hand_results, pose_results):
    hand1_x, hand1_y, hand2_x, hand2_y = process_hand_keypoints(hand_results)
    pose_x, pose_y = process_pose_keypoints(pose_results)

    if len(pose_x) >= 17 and len(pose_y) >= 17:
        if len(hand1_x) > 0 and len(hand2_x) == 0 and should_swap_hand(
            (pose_x[15], pose_y[15]),
            (pose_x[16], pose_y[16]),
            (hand1_x[0], hand1_y[0]),
            "h1",
        ):
            hand1_x, hand1_y, hand2_x, hand2_y = hand2_x, hand2_y, hand1_x, hand1_y
        elif len(hand1_x) == 0 and len(hand2_x) > 0 and should_swap_hand(
            (pose_x[15], pose_y[15]),
            (pose_x[16], pose_y[16]),
            (hand2_x[0], hand2_y[0]),
            "h2",
        ):
            hand1_x, hand1_y, hand2_x, hand2_y = hand2_x, hand2_y, hand1_x, hand1_y

    return (
        pose_x or [np.nan] * POSE_LANDMARKS,
        pose_y or [np.nan] * POSE_LANDMARKS,
        hand1_x or [np.nan] * HAND_LANDMARKS,
        hand1_y or [np.nan] * HAND_LANDMARKS,
        hand2_x or [np.nan] * HAND_LANDMARKS,
        hand2_y or [np.nan] * HAND_LANDMARKS,
    )


def combine_xy(x_values, y_values):
    x = np.asarray(x_values).reshape((-1, 1))
    y = np.asarray(y_values).reshape((-1, 1))
    return np.concatenate((x, y), axis=-1).astype(np.float32)


def interpolate_and_scale(arr, width, height):
    result = arr.copy()
    for landmark in range(arr.shape[1]):
        x_values = arr[:, landmark, 0]
        y_values = arr[:, landmark, 1]
        for coordinate, values in enumerate((x_values, y_values)):
            valid = np.flatnonzero(~np.isnan(values))
            result[:, landmark, coordinate] = (
                0.0
                if len(valid) == 0
                else np.interp(np.arange(len(values)), valid, values[valid])
            )
    result[:, :, 0] *= width
    result[:, :, 1] *= height
    return result


def prepare_features(frames):
    pose = np.stack([combine_xy(frame[0], frame[1]) for frame in frames])
    hand1 = np.stack([combine_xy(frame[2], frame[3]) for frame in frames])
    hand2 = np.stack([combine_xy(frame[4], frame[5]) for frame in frames])
    pose = interpolate_and_scale(pose, FRAME_WIDTH, FRAME_HEIGHT)
    hand1 = interpolate_and_scale(hand1, FRAME_WIDTH, FRAME_HEIGHT)
    hand2 = interpolate_and_scale(hand2, FRAME_WIDTH, FRAME_HEIGHT)

    features = np.concatenate(
        (
            pose.reshape(len(frames), POSE_LANDMARKS * 2),
            hand1.reshape(len(frames), HAND_LANDMARKS * 2),
            hand2.reshape(len(frames), HAND_LANDMARKS * 2),
        ),
        axis=-1,
    ).astype(np.float32)
    if features.shape[0] > SEQUENCE_LENGTH:
        features = features[-SEQUENCE_LENGTH:]
    elif features.shape[0] < SEQUENCE_LENGTH:
        features = np.pad(
            features,
            ((0, SEQUENCE_LENGTH - features.shape[0]), (0, 0)),
            mode="constant",
        )
    assert features.shape[1] == FEATURE_DIMENSION
    assert features.shape[0] == SEQUENCE_LENGTH
    return torch.from_numpy(features).unsqueeze(0)


def expected_label(video_path):
    parts = [part for part in video_path.parts if part not in (".", "")]
    label_part = parts[-2]
    if label_part.lower() == "extra":
        label_part = parts[-3]
    return re.sub(r"[^A-Za-z]", "", label_part).lower()


def extract_video_frames(video_path):
    frames = []
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"Could not open video: {video_path}")

    try:
        with mp.solutions.hands.Hands(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
            max_num_hands=2,
        ) as hands, mp.solutions.pose.Pose(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as pose:
            while True:
                ok, image = capture.read()
                if not ok:
                    break
                image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
                frames.append(extract_frame(hands.process(image), pose.process(image)))
    finally:
        capture.release()

    if not frames:
        raise RuntimeError(f"Video contains no readable frames: {video_path}")
    return frames


def load_model(model_path, device):
    checkpoint = torch.load(model_path, map_location=device)
    if not isinstance(checkpoint, dict) or "model" not in checkpoint:
        raise ValueError(f"Expected a checkpoint with a 'model' key: {model_path}")
    model = Transformer(
        TransformerConfig(size="small", max_position_embeddings=256),
        n_classes=NUMBER_OF_CLASSES,
    ).to(device)
    model.load_state_dict(checkpoint["model"])
    model.eval()
    return model


def load_labels(labels_path):
    with labels_path.open(encoding="utf-8") as handle:
        label_map = json.load(handle)
    assert len(label_map) == NUMBER_OF_CLASSES
    assert set(label_map.values()) == set(range(NUMBER_OF_CLASSES))
    return [label for label, _ in sorted(label_map.items(), key=lambda item: item[1])]


def main():
    args = parse_args()
    if args.video.suffix.lower() != ".mov":
        raise ValueError("The input video must have a .MOV extension")
    if not args.video.is_file():
        raise FileNotFoundError(f"Video not found: {args.video}")
    if not args.model.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {args.model}")
    if not args.labels.is_file():
        raise FileNotFoundError(f"Label map not found: {args.labels}")

    labels = load_labels(args.labels)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model = load_model(args.model, device)
    frames = extract_video_frames(args.video)
    model_input = prepare_features(frames).to(device)

    with torch.inference_mode():
        probabilities = torch.softmax(model(model_input), dim=-1)[0]
    values, indices = torch.topk(probabilities, k=5)
    predictions = [
        (labels[int(index)], float(value))
        for value, index in zip(values.cpu(), indices.cpu())
    ]

    print(f"Video filename: {args.video.name}")
    print(f"Expected/actual label: {expected_label(args.video)}")
    print(f"Extracted frames: {len(frames)}")
    print(f"Feature shape: {tuple(model_input.shape[1:])}")
    print(f"Predicted label: {predictions[0][0]}")
    print(f"Confidence: {predictions[0][1]:.6f}")
    print("Top-5 predictions:")
    for rank, (label, confidence) in enumerate(predictions, start=1):
        print(f"  {rank}. {label}: {confidence:.6f}")
    print(f"CUDA device: {torch.cuda.get_device_name(0) if device.type == 'cuda' else 'not available (using CPU)'}")


if __name__ == "__main__":
    main()
