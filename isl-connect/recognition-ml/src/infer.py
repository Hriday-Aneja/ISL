"""
Live webcam inference for the ISL recognition prototype.

Expected model input:
    (batch, 100 frames, 225 features)

225 features =:
    pose:       33 landmarks * 3 = 99
    left hand:  21 landmarks * 3 = 63
    right hand: 21 landmarks * 3 = 63
    total = 225

The feature order must match landmark_extraction.py:
pose -> left hand -> right hand.

Run from recognition-ml:
    python src/infer.py
"""

from collections import Counter, deque
from pathlib import Path
import argparse
import json
import time

import cv2
import numpy as np
import mediapipe as mp
import tensorflow as tf


SEQUENCE_LENGTH = 100
NUM_FEATURES = 225

mp_holistic = mp.solutions.holistic
mp_drawing = mp.solutions.drawing_utils


def landmark_block(landmarks, count):
    """Return count XYZ landmarks, using zeros when a landmark is missing."""
    if landmarks is None:
        return np.zeros((count, 3), dtype=np.float32)

    values = np.array(
        [[lm.x, lm.y, lm.z] for lm in landmarks.landmark],
        dtype=np.float32,
    )

    # Safety: keep the expected shape even if MediaPipe changes.
    if values.shape != (count, 3):
        out = np.zeros((count, 3), dtype=np.float32)
        n = min(len(values), count)
        out[:n] = values[:n]
        return out

    return values


def extract_features(results):
    """
    Build one 225-feature frame.

    IMPORTANT: pose -> left hand -> right hand.
    """
    pose = landmark_block(results.pose_landmarks, 33)
    left = landmark_block(results.left_hand_landmarks, 21)
    right = landmark_block(results.right_hand_landmarks, 21)

    features = np.concatenate([pose, left, right], axis=0)
    return features.reshape(-1).astype(np.float32)


def load_labels(labels_path):
    with open(labels_path, "r", encoding="utf-8") as f:
        data = json.load(f)

    # Support common formats used by the project.
    if isinstance(data, list):
        return [str(x) for x in data]

    if isinstance(data, dict):
        for key in ("classes", "labels", "class_names"):
            if key in data:
                value = data[key]
                if isinstance(value, list):
                    return [str(x) for x in value]
                if isinstance(value, dict):
                    # Handles {"0": "Bird", ...}
                    try:
                        return [str(value[str(i)]) for i in range(len(value))]
                    except (KeyError, TypeError):
                        return [str(v) for _, v in sorted(value.items())]

        # Handles {"Bird": 0, "Dog": 1, ...}
        if all(isinstance(v, int) for v in data.values()):
            return [str(k) for k, _ in sorted(data.items(), key=lambda x: x[1])]

    raise ValueError(f"Could not understand label file: {labels_path}")


def resolve_path(root, value):
    path = Path(value)
    return path if path.is_absolute() else root / path


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--model",
        default="models/isl_recognition_model_kfold.keras",
        help="Path to trained Keras model",
    )
    parser.add_argument(
        "--labels",
        default="models/label_classes.json",
        help="Path to class-label JSON",
    )
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.55,
        help="Confidence threshold for showing a stable prediction",
    )
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    model_path = resolve_path(root, args.model)
    labels_path = resolve_path(root, args.labels)

    if not model_path.exists():
        raise FileNotFoundError(f"Model not found: {model_path}")

    if not labels_path.exists():
        raise FileNotFoundError(f"Labels not found: {labels_path}")

    print(f"Loading model: {model_path}")
    model = tf.keras.models.load_model(model_path)

    labels = load_labels(labels_path)
    print(f"Classes: {labels}")
    print(f"Model input shape: {model.input_shape}")

    expected_features = model.input_shape[-1]
    expected_frames = model.input_shape[-2]

    if expected_features != NUM_FEATURES:
        raise ValueError(
            f"Model expects {expected_features} features, but live extraction "
            f"produces {NUM_FEATURES}."
        )

    if expected_frames != SEQUENCE_LENGTH:
        raise ValueError(
            f"Model expects {expected_frames} frames, but live inference "
            f"is configured for {SEQUENCE_LENGTH}."
        )

    if len(labels) != model.output_shape[-1]:
        raise ValueError(
            f"Label count ({len(labels)}) does not match model outputs "
            f"({model.output_shape[-1]})."
        )

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")

    # Keep exactly the same sequence length expected by the model.
    frame_buffer = deque(maxlen=SEQUENCE_LENGTH)

    # Smooth predictions across recent windows.
    recent_predictions = deque(maxlen=7)

    last_label = "Waiting..."
    last_confidence = 0.0
    last_inference_time = 0.0

    print("\nCamera started.")
    print("Make a sign in front of the camera.")
    print("Q = quit | R = reset buffer\n")

    try:
        with mp_holistic.Holistic(
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ) as holistic:

            while True:
                ok, frame = cap.read()
                if not ok:
                    print("Could not read frame from camera.")
                    break

                # Mirror webcam for a natural preview.
                frame = cv2.flip(frame, 1)

                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                results = holistic.process(rgb)

                features = extract_features(results)
                frame_buffer.append(features)

                # Draw the same landmark types used by the prototype.
                mp_drawing.draw_landmarks(
                    frame,
                    results.left_hand_landmarks,
                    mp_holistic.HAND_CONNECTIONS,
                )
                mp_drawing.draw_landmarks(
                    frame,
                    results.right_hand_landmarks,
                    mp_holistic.HAND_CONNECTIONS,
                )
                mp_drawing.draw_landmarks(
                    frame,
                    results.pose_landmarks,
                    mp_holistic.POSE_CONNECTIONS,
                )

                if len(frame_buffer) == SEQUENCE_LENGTH:
                    sequence = np.asarray(frame_buffer, dtype=np.float32)
                    model_input = np.expand_dims(sequence, axis=0)

                    probabilities = model.predict(model_input, verbose=0)[0]
                    predicted_index = int(np.argmax(probabilities))
                    confidence = float(probabilities[predicted_index])

                    recent_predictions.append(predicted_index)

                    # Majority vote prevents the text from flickering.
                    majority_index, majority_count = Counter(
                        recent_predictions
                    ).most_common(1)[0]

                    majority_confidence = float(
                        probabilities[majority_index]
                    )

                    if (
                        majority_count >= 4
                        and majority_confidence >= args.threshold
                    ):
                        last_label = labels[majority_index]
                        last_confidence = majority_confidence
                    elif confidence >= args.threshold:
                        last_label = labels[predicted_index]
                        last_confidence = confidence
                    else:
                        last_label = "Uncertain"
                        last_confidence = confidence

                    last_inference_time = time.time()

                # UI
                cv2.rectangle(frame, (10, 10), (470, 105), (0, 0, 0), -1)

                if len(frame_buffer) < SEQUENCE_LENGTH:
                    text = f"Collecting: {len(frame_buffer)}/{SEQUENCE_LENGTH}"
                    color = (255, 255, 255)
                else:
                    text = f"{last_label}  ({last_confidence * 100:.1f}%)"
                    color = (0, 255, 0) if last_label != "Uncertain" else (0, 165, 255)

                cv2.putText(
                    frame,
                    text,
                    (25, 52),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.9,
                    color,
                    2,
                    cv2.LINE_AA,
                )

                cv2.putText(
                    frame,
                    "Q: quit   R: reset",
                    (25, 88),
                    cv2.FONT_HERSHEY_SIMPLEX,
                    0.55,
                    (220, 220, 220),
                    1,
                    cv2.LINE_AA,
                )

                cv2.imshow("ISL Recognition - Live", frame)

                key = cv2.waitKey(1) & 0xFF
                if key == ord("q"):
                    break
                if key == ord("r"):
                    frame_buffer.clear()
                    recent_predictions.clear()
                    last_label = "Waiting..."
                    last_confidence = 0.0

    finally:
        cap.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()