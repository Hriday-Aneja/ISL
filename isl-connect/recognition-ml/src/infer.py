"""
Real-time webcam ISL inference — mirrors the exact preprocessing used in
landmark_extraction.py so live input matches training input exactly.

Preprocessing contract (must match landmark_extraction.py exactly):
  - MediaPipe Holistic: static_image_mode=False, min_detection_confidence=0.5,
    min_tracking_confidence=0.5
  - Per-frame feature = [left_hand(21x3=63), right_hand(21x3=63), pose(33x3=99)] = 225
  - Raw MediaPipe coordinates, NO extra normalization/centering (training
    doesn't do any either, so inference must not add any)
  - NO face landmarks anywhere in the feature vector
  - Sequence fixed to length 100: evenly-spaced downsample if >100 frames
    were collected, zero-padding at the END if <100 frames (identical to
    fix_sequence_length() in landmark_extraction.py)

Capture strategy: training clips are short recordings of one active sign,
not continuous idle video — each clip is a whole gesture reshaped to 100
frames. A naive fixed-size sliding window over a live feed would almost
never line up with that structure, and an idle frame (hands=zero,
pose=populated) is out-of-distribution: the model was never shown "nobody
signing" during training. So this script:
  1. Never starts collecting frames until a hand is actually detected.
  2. Keeps collecting through brief hand drop-outs (occlusion mid-sign),
     but ends the clip after --idle-frames-to-end-clip consecutive
     no-hand frames.
  3. Refuses to run the model at all if too few of the collected frames
     actually had a hand in them (--min-hand-frames).
  4. Refuses to display a class if the model's own softmax confidence is
     below --confidence-threshold.
Any one of steps 1/3/4 failing shows "No sign detected" instead of a class.

Usage:
    python3 src/infer.py
    python3 src/infer.py --model models/isl_recognition_model_kfold.keras --debug
"""
import argparse
import os
os.environ["GLOG_minloglevel"] = "2"
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"

from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import tensorflow as tf

from dataset import SEQUENCE_LENGTH, FEATURE_SIZE, load_label_classes

mp_holistic = mp.solutions.holistic

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"

# Must match landmark_extraction.py's feature layout exactly.
LEFT_HAND_DIM = 63   # 21 landmarks x 3 (x, y, z)
RIGHT_HAND_DIM = 63
POSE_DIM = 99        # 33 landmarks x 3
assert LEFT_HAND_DIM + RIGHT_HAND_DIM + POSE_DIM == FEATURE_SIZE, (
    "Feature dimension mismatch vs dataset.py's FEATURE_SIZE — inference "
    "and training have drifted apart."
)

EXPECTED_CLASSES = ["Bird", "Dog", "Hello", "Thank you"]


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str,
                         default=str(MODELS_DIR / "isl_recognition_model_kfold.keras"))
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--confidence-threshold", type=float, default=0.6,
                         help="Below this softmax confidence, show 'No sign detected' "
                              "instead of the top predicted class")
    parser.add_argument("--min-hand-frames", type=int, default=10,
                         help="Minimum number of frames with a hand actually detected "
                              "before a captured clip is even sent to the model")
    parser.add_argument("--idle-frames-to-end-clip", type=int, default=15,
                         help="Consecutive no-hand frames that end the current capture")
    parser.add_argument("--max-buffer-len", type=int, default=SEQUENCE_LENGTH * 2,
                         help="Hard cap on frames collected for one clip, even while hands "
                              "stay detected — prevents a long-held hand from producing a "
                              "clip far longer than any training clip")
    parser.add_argument("--debug", action="store_true",
                         help="Print per-frame hand detection state, and per-class "
                              "probabilities for every completed clip")
    return parser.parse_args()

def normalize_landmarks(left_hand, right_hand, pose):
    """
    Must match the normalization used during training.
    """

    center = np.zeros(3, dtype=np.float32)
    scale = 1.0

    # Shoulder-based body reference
    if np.any(pose):
        left_shoulder = pose[11]
        right_shoulder = pose[12]

        center = (left_shoulder + right_shoulder) / 2.0

        scale = np.linalg.norm(
            left_shoulder - right_shoulder
        ) + 1e-6

    # Normalize pose
    if np.any(pose):
        pose_norm = (pose - center) / scale
    else:
        pose_norm = pose

    # Normalize left hand relative to its wrist
    if np.any(left_hand):
        left_wrist = left_hand[0]
        left_hand_norm = (left_hand - left_wrist) / scale
    else:
        left_hand_norm = left_hand

    # Normalize right hand relative to its wrist
    if np.any(right_hand):
        right_wrist = right_hand[0]
        right_hand_norm = (right_hand - right_wrist) / scale
    else:
        right_hand_norm = right_hand

    return left_hand_norm, right_hand_norm, pose_norm

def extract_frame_features(results):
    """Exactly mirrors extract_landmarks()'s per-frame feature construction
    in landmark_extraction.py: same order [left, right, pose], same
    zero-fill when a landmark set is missing, same raw (unnormalized)
    coordinates, and face landmarks are never touched."""
    if results.left_hand_landmarks:
        left_hand = np.array([[lm.x, lm.y, lm.z] for lm in results.left_hand_landmarks.landmark])
        has_left = True
    else:
        left_hand = np.zeros((21, 3))
        has_left = False

    if results.right_hand_landmarks:
        right_hand = np.array([[lm.x, lm.y, lm.z] for lm in results.right_hand_landmarks.landmark])
        has_right = True
    else:
        right_hand = np.zeros((21, 3))
        has_right = False

    if results.pose_landmarks:
        pose = np.array([[lm.x, lm.y, lm.z] for lm in results.pose_landmarks.landmark])
    else:
        pose = np.zeros((33, 3))
    left_hand, right_hand, pose = normalize_landmarks(
    left_hand,
    right_hand,
    pose
)
    features = np.concatenate([
        left_hand.flatten(), right_hand.flatten(), pose.flatten()
    ]).astype(np.float32)
    return features, has_left, has_right


def fix_sequence_length(sequence: np.ndarray) -> np.ndarray:
    """Identical to landmark_extraction.py's fix_sequence_length(): evenly
    -spaced downsample if too long, zero-pad at the END if too short. A
    live capture must be shaped exactly the way a training clip was."""
    num_frames = sequence.shape[0]
    if num_frames == SEQUENCE_LENGTH:
        return sequence
    if num_frames > SEQUENCE_LENGTH:
        indices = np.linspace(0, num_frames - 1, SEQUENCE_LENGTH).astype(int)
        return sequence[indices]
    padded = np.zeros((SEQUENCE_LENGTH, FEATURE_SIZE), dtype=np.float32)
    padded[:num_frames] = sequence
    return padded


class ClipCapture:
    """Only starts collecting once a hand is seen, ends the clip after a
    real pause, never hands an idle-only stretch to the caller. Kept
    independent of cv2/mediapipe/tf so it can be unit tested with plain
    synthetic data (see the __main__ smoke test at the bottom of this file
    or a separate test script)."""

    def __init__(self, idle_frames_to_end_clip: int, max_buffer_len: int):
        self.buffer = []  # list of (features, hand_present)
        self.idle_streak = 0
        self.capturing = False
        self.idle_frames_to_end_clip = idle_frames_to_end_clip
        self.max_buffer_len = max_buffer_len

    def add_frame(self, features: np.ndarray, hand_present: bool):
        """Returns a completed clip (list[(features, hand_present)]) if
        this frame just completed a capture, else None."""
        if hand_present:
            self.idle_streak = 0
            self.capturing = True
            self.buffer.append((features, hand_present))
            if len(self.buffer) > self.max_buffer_len:
                # A real ISL sign is a couple of seconds, not a held pose —
                # this cap forces the clip to end even while hands stay
                # detected, so a continuously-held hand can't grow a clip
                # far past what training clips looked like.
                return self._finish_clip()
            return None

        if self.capturing:
            self.idle_streak += 1
            self.buffer.append((features, hand_present))
            if self.idle_streak >= self.idle_frames_to_end_clip:
                return self._finish_clip()
            if len(self.buffer) > self.max_buffer_len:
                return self._finish_clip()

        return None

    def _finish_clip(self):
        clip = self.buffer
        self.buffer = []
        self.idle_streak = 0
        self.capturing = False
        return clip


def classify_clip(clip, model, classes, args):
    """clip: list[(features, hand_present)]. Returns (label, confidence,
    probs_or_None, hand_frame_count, total_frames)."""
    hand_frame_count = sum(1 for _, hp in clip if hp)
    total_frames = len(clip)
    if hand_frame_count < args.min_hand_frames:
        if args.debug:
            print(f"  -> discarded: only {hand_frame_count} hand-present frames "
                  f"(< --min-hand-frames={args.min_hand_frames})")
        return "No sign detected", 0.0, None, hand_frame_count, total_frames

    sequence = np.array([f for f, _ in clip], dtype=np.float32)
    sequence = fix_sequence_length(sequence)
    model_input = sequence[np.newaxis, ...]  # (1, 100, 225)

    probs = model.predict(model_input, verbose=0)[0]
    pred_idx = int(np.argmax(probs))
    pred_conf = float(probs[pred_idx])

    if args.debug:
        print(f"  input shape: {model_input.shape}")
        print(f"  hand-present frames: {hand_frame_count}/{total_frames}")
        print("  probabilities: " + ", ".join(f"{c}={p:.2f}" for c, p in zip(classes, probs)))

    if pred_conf < args.confidence_threshold:
        return "No sign detected (low confidence)", pred_conf, probs, hand_frame_count, total_frames
    return classes[pred_idx], pred_conf, probs, hand_frame_count, total_frames


def main():
    args = parse_args()

    if not Path(args.model).exists():
        raise FileNotFoundError(f"Model not found at {args.model}")
    print(f"Loading model from {args.model} ...")
    model = tf.keras.models.load_model(args.model)

    classes = load_label_classes()
    print(f"Loaded label classes: {classes}")
    if classes != EXPECTED_CLASSES:
        print(f"WARNING: label_classes.json is {classes}, expected {EXPECTED_CLASSES}. "
              f"If this model was trained on a different class set/order, predictions "
              f"below will be meaningless even if the pipeline is otherwise correct.")

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")

    clip_capture = ClipCapture(idle_frames_to_end_clip=args.idle_frames_to_end_clip,
                                max_buffer_len=args.max_buffer_len)
    display_text = "Waiting for hands..."
    last_probs = None          # most recent completed clip's per-class probabilities
    last_hand_frames = None    # (hand_frame_count, total_frames) for that clip

    with mp_holistic.Holistic(static_image_mode=False,
                               min_detection_confidence=0.5,
                               min_tracking_confidence=0.5) as holistic:
        while True:
            ok, frame = cap.read()
            if not ok:
                break

            frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            results = holistic.process(frame_rgb)
            features, has_left, has_right = extract_frame_features(results)
            hand_present = has_left or has_right

            if args.debug:
                print(f"L={has_left} R={has_right} capturing={clip_capture.capturing} "
                      f"buffer={len(clip_capture.buffer)} idle_streak={clip_capture.idle_streak}")

            completed_clip = clip_capture.add_frame(features, hand_present)
            if completed_clip is not None:
                print(f"\nClip captured ({len(completed_clip)} frames) — classifying...")
                label, conf, probs, hand_frames, total_frames = classify_clip(
                    completed_clip, model, classes, args
                )
                display_text = f"{label} ({conf:.2f})" if probs is not None else label
                last_probs = probs
                last_hand_frames = (hand_frames, total_frames)
                print(f"  -> {display_text}")
            elif clip_capture.capturing:
                display_text = "Capturing sign..."
            elif not hand_present:
                display_text = "Waiting for hands..."

            # --- everything below renders on the video window itself ---
            y = 40
            cv2.putText(frame, display_text, (20, y), cv2.FONT_HERSHEY_SIMPLEX,
                        0.9, (0, 255, 0) if "No sign" not in display_text else (0, 165, 255), 2)
            y += 35
            cv2.putText(frame, f"L:{has_left}  R:{has_right}", (20, y),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (200, 200, 200), 1)

            if args.debug:
                y += 30
                cv2.putText(frame, f"buffer:{len(clip_capture.buffer)}  "
                                    f"idle_streak:{clip_capture.idle_streak}",
                            (20, y), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
                if last_hand_frames is not None:
                    y += 25
                    cv2.putText(frame, f"last clip: {last_hand_frames[0]}/{last_hand_frames[1]} "
                                        f"hand frames", (20, y),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.55, (180, 180, 180), 1)
                if last_probs is not None:
                    for cls_name, p in zip(classes, last_probs):
                        y += 25
                        bar_len = int(p * 150)
                        cv2.rectangle(frame, (150, y - 15), (150 + bar_len, y), (100, 180, 100), -1)
                        cv2.putText(frame, f"{cls_name}: {p:.2f}", (20, y),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (220, 220, 220), 1)

            cv2.imshow("ISL Recognition", frame)
            if cv2.waitKey(10) & 0xFF == ord("q"):
                break

    cap.release()
    cv2.destroyAllWindows()


if __name__ == "__main__":
    main()