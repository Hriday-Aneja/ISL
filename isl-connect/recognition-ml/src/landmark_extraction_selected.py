import argparse
import os
import random
from pathlib import Path

os.environ["GLOG_minloglevel"] = "2"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

import cv2
import mediapipe as mp
import numpy as np


PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_DATASET_DIR = PROJECT_DIR / "data" / "raw_selected"
DEFAULT_FEATURE_DIR = PROJECT_DIR / "data" / "features_selected"

SEQUENCE_LENGTH = 100
FEATURE_SIZE = 225
VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv"}

mp_holistic = mp.solutions.holistic


def normalize_landmarks(left_hand, right_hand, pose):
    center = np.zeros(3, dtype=np.float32)
    scale = 1.0

    if np.any(pose):
        left_shoulder = pose[11]
        right_shoulder = pose[12]
        center = (left_shoulder + right_shoulder) / 2.0
        scale = np.linalg.norm(left_shoulder - right_shoulder) + 1e-6

    pose_norm = (pose - center) / scale if np.any(pose) else pose

    if np.any(left_hand):
        left_hand = (left_hand - left_hand[0]) / scale
    if np.any(right_hand):
        right_hand = (right_hand - right_hand[0]) / scale

    return left_hand, right_hand, pose_norm


def _landmark_array(landmarks, count):
    if landmarks is None:
        return np.zeros((count, 3), dtype=np.float32)
    return np.asarray(
        [[landmark.x, landmark.y, landmark.z] for landmark in landmarks.landmark],
        dtype=np.float32,
    )


def extract_landmarks(video_path):
    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        print(f"Could not open: {video_path}")
        return None

    frames = []
    try:
        with mp_holistic.Holistic(
            static_image_mode=False,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as holistic:
            while True:
                success, frame = capture.read()
                if not success:
                    break

                results = holistic.process(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
                left_hand = _landmark_array(results.left_hand_landmarks, 21)
                right_hand = _landmark_array(results.right_hand_landmarks, 21)
                pose = _landmark_array(results.pose_landmarks, 33)
                left_hand, right_hand, pose = normalize_landmarks(
                    left_hand, right_hand, pose
                )

                frame_features = np.concatenate(
                    [left_hand.ravel(), right_hand.ravel(), pose.ravel()]
                )
                if frame_features.size != FEATURE_SIZE:
                    raise ValueError(
                        f"Expected {FEATURE_SIZE} features, got {frame_features.size}"
                    )
                frames.append(frame_features)
    finally:
        capture.release()

    if not frames:
        print(f"No frames found: {video_path}")
        return None
    return np.asarray(frames, dtype=np.float32)


def fix_sequence_length(sequence):
    if sequence.shape[0] == SEQUENCE_LENGTH:
        return sequence
    if sequence.shape[0] > SEQUENCE_LENGTH:
        indices = np.linspace(
            0, sequence.shape[0] - 1, SEQUENCE_LENGTH
        ).astype(int)
        return sequence[indices]

    padded = np.zeros((SEQUENCE_LENGTH, FEATURE_SIZE), dtype=np.float32)
    padded[: sequence.shape[0]] = sequence
    return padded


def discover_selected_videos(dataset_dir):
    if not dataset_dir.exists():
        raise FileNotFoundError(f"Selected dataset folder not found: {dataset_dir}")

    classes = {}
    for class_dir in sorted(dataset_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        videos = sorted(
            path
            for path in class_dir.iterdir()
            if path.is_file() and path.suffix.lower() in VIDEO_EXTENSIONS
        )
        if videos:
            classes[class_dir.name] = videos
    if not classes:
        raise FileNotFoundError(f"No video class folders found under {dataset_dir}")
    return classes


def split_videos(videos, seed):
    shuffled = list(videos)
    random.Random(seed).shuffle(shuffled)
    if len(shuffled) < 3:
        raise ValueError("Each class needs at least 3 videos for train/val/test")

    test_count = max(1, round(len(shuffled) * 0.15))
    val_count = max(1, round(len(shuffled) * 0.15))
    train_count = len(shuffled) - test_count - val_count
    if train_count < 1:
        raise ValueError("Not enough videos to create a non-empty training split")

    return {
        "train": shuffled[:train_count],
        "val": shuffled[train_count : train_count + val_count],
        "test": shuffled[train_count + val_count :],
    }


def process_dataset(dataset_dir, feature_dir, seed, overwrite=False):
    class_videos = discover_selected_videos(dataset_dir)
    print(f"Found {len(class_videos)} classes")

    total = 0
    successful = 0
    failed = 0

    for class_index, (class_name, videos) in enumerate(class_videos.items()):
        splits = split_videos(videos, seed + class_index)
        print(f"{class_name}: {len(videos)} videos -> "
              f"train={len(splits['train'])}, val={len(splits['val'])}, "
              f"test={len(splits['test'])}")

        for split, split_videos_list in splits.items():
            output_class_dir = feature_dir / split / class_name
            output_class_dir.mkdir(parents=True, exist_ok=True)

            for video_path in split_videos_list:
                total += 1
                output_path = output_class_dir / f"{video_path.stem}.npy"
                if output_path.exists() and not overwrite:
                    print(f"Already exists: {output_path}")
                    successful += 1
                    continue

                print(f"Processing: {video_path}")
                sequence = extract_landmarks(video_path)
                if sequence is None:
                    failed += 1
                    continue

                sequence = fix_sequence_length(sequence)
                np.save(output_path, sequence)
                print(f"Saved: {output_path} {sequence.shape}")
                successful += 1

    print("\nDataset processing complete")
    print(f"Total videos : {total}")
    print(f"Successful   : {successful}")
    print(f"Failed       : {failed}")


def parse_args():
    parser = argparse.ArgumentParser(
        description="Extract 225-dimension MediaPipe features for raw_selected."
    )
    parser.add_argument("--dataset-dir", type=Path, default=DEFAULT_DATASET_DIR)
    parser.add_argument("--feature-dir", type=Path, default=DEFAULT_FEATURE_DIR)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    process_dataset(args.dataset_dir, args.feature_dir, args.seed, args.overwrite)