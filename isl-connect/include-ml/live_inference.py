"""Live webcam inference for INCLUDE-style Transformers.

Loads, by default, the from-scratch custom checkpoint written by
train_custom.py (models/custom_scratch/custom_best.pth). Labels, class count,
clip length, mirror setting and training frame rate are read FROM THE
CHECKPOINT, so nothing is hardcoded to 263 classes. If that file does not
exist it falls back to the original INCLUDE checkpoint (263 classes).

Run from include-ml:
    python live_inference.py                      # custom checkpoint if present
    python live_inference.py --model models\\transformer_small\\transformer.pth   # original INCLUDE

Feature layout: pose (25 x 2), hand1 (21 x 2), hand2 (21 x 2) = 134.

Recording is manual: press SPACE to start a sign, SPACE again to stop and
classify (or it stops by itself at the model's clip length). q / Esc quits.

Training/live parity: the model was trained on clips with a fixed frame rate
(`train_fps` in the checkpoint). A live loop running MediaPipe on CPU often
delivers fewer frames per second than the camera's nominal rate, which would
make every sign look slower than in training. Each clip's frames are therefore
timestamped and resampled to train_fps (nearest frame) before classification;
disable with --no-resample.
"""
import argparse
import json
import time
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
import torch

from custom_common import DEFAULT_CHECKPOINT, FRAME_HEIGHT, FRAME_WIDTH, ROOT, INCLUDE_ROOT  # sets sys.path + shims
from custom_model import load_checkpoint

MODEL_PATH = ROOT / "models" / "transformer_small" / "transformer.pth"  # original INCLUDE checkpoint
LABEL_PATH = INCLUDE_ROOT / "label_maps" / "label_map_include.json"
CAPTURES_DIR = ROOT / "captures"
POSE_LANDMARKS = 25
HAND_LANDMARKS = 21
LEGACY_SEQUENCE_LENGTH = 169  # runner.py/train_nn.py use max_frame_len=169 for the original INCLUDE run
CAM_ASPECT_TOLERANCE = 0.05
mp_hands = mp.solutions.hands
mp_pose = mp.solutions.pose


def parse_args():
    p = argparse.ArgumentParser(description="Live sign inference")
    p.add_argument("--camera", type=int, default=0)
    p.add_argument("--model", type=Path, default=None,
                   help="checkpoint. Default: models/custom_scratch/custom_best.pth if it exists, else original INCLUDE")
    p.add_argument("--labels", type=Path, default=None,
                   help="optional label map override. Custom checkpoints carry their own labels; the original "
                        "INCLUDE checkpoint uses label_map_include.json by default")
    p.add_argument("--sequence-length", type=int, default=None, help="default: from the checkpoint")
    p.add_argument("--min-frames", type=int, default=5)
    p.add_argument("--confidence-threshold", type=float, default=0.0)
    p.add_argument("--cam-width", type=int, default=1920)
    p.add_argument("--cam-height", type=int, default=1080)
    p.add_argument("--cam-fps", type=float, default=0.0)
    p.add_argument("--no-save-features", action="store_true")
    p.add_argument("--mirror", action="store_true", help="force the horizontal flip ON")
    p.add_argument("--no-mirror", action="store_true", help="force the horizontal flip OFF")
    p.add_argument("--no-resample", action="store_true", help="classify raw camera frames without resampling to train_fps")
    p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    p.add_argument("--hand-min-detection-confidence", type=float, default=0.5)
    p.add_argument("--hand-min-tracking-confidence", type=float, default=0.5)
    p.add_argument("--pose-min-detection-confidence", type=float, default=0.5)
    p.add_argument("--pose-min-tracking-confidence", type=float, default=0.5)
    return p.parse_args()


def landmark_xy(landmarks, count):
    if landmarks is None:
        return np.full((count, 2), np.nan, dtype=np.float32)
    return np.asarray([[p.x, p.y] for p in landmarks.landmark[:count]], dtype=np.float32)


def swap_hands(pose, hand1, hand2):
    """Same rule as generate_keypoints.py / extract_keypoints_custom.py."""
    first_missing = np.isnan(hand1[0]).any()
    second_missing = np.isnan(hand2[0]).any()
    if first_missing == second_missing or np.isnan(pose[15]).any() or np.isnan(pose[16]).any():
        return hand1, hand2
    hand = hand2 if first_missing else hand1
    left = np.sum((pose[15] - hand[0]) ** 2)
    right = np.sum((pose[16] - hand[0]) ** 2)
    # a lone "h1" swaps when closer to the RIGHT wrist (pose[16]); a lone "h2" when closer to the LEFT (pose[15])
    if (right < left and not first_missing) or (left < right and first_missing):
        return hand2, hand1
    return hand1, hand2


def extract_frame(hand_results, pose_results):
    pose = landmark_xy(pose_results.pose_landmarks if pose_results else None, POSE_LANDMARKS)
    detected = hand_results.multi_hand_landmarks if hand_results and hand_results.multi_hand_landmarks else []
    hand1 = landmark_xy(detected[0] if len(detected) > 0 else None, HAND_LANDMARKS)
    hand2 = landmark_xy(detected[1] if len(detected) > 1 else None, HAND_LANDMARKS)
    hand1, hand2 = swap_hands(pose, hand1, hand2)
    return pose, hand1, hand2, bool(detected)


def interpolate(stream):
    """Linear interpolation with edge filling, as dataset.py does (pandas, limit_direction='both')."""
    result = stream.copy()
    for landmark in range(stream.shape[1]):
        for coordinate in range(2):
            values = stream[:, landmark, coordinate]
            valid = np.flatnonzero(~np.isnan(values))
            result[:, landmark, coordinate] = 0.0 if len(valid) == 0 else np.interp(
                np.arange(len(values)), valid, values[valid])
    return result


def resample_to_fps(frames, times, fps):
    """Pick, for each tick of a uniform fps grid over the clip's duration, the nearest recorded frame."""
    if len(frames) < 2:
        return frames
    times = np.asarray(times, dtype=np.float64)
    grid = times[0] + np.arange(int(round((times[-1] - times[0]) * fps)) + 1) / fps
    nearest = np.abs(times[None, :] - grid[:, None]).argmin(axis=1)
    return [frames[i] for i in nearest]


def prepare_sequence(frames, sequence_length):
    """Return the model input, shape (1, sequence_length, 134): interpolate, x*1920 / y*1080, zero-pad at the END."""
    pose = interpolate(np.stack([f[0] for f in frames]))
    hand1 = interpolate(np.stack([f[1] for f in frames]))
    hand2 = interpolate(np.stack([f[2] for f in frames]))
    scale = np.array([FRAME_WIDTH, FRAME_HEIGHT], dtype=np.float32)
    data = np.concatenate([(pose * scale).reshape(len(frames), 50), (hand1 * scale).reshape(len(frames), 42),
                           (hand2 * scale).reshape(len(frames), 42)], axis=1).astype(np.float32)
    if len(data) > sequence_length:
        data = data[-sequence_length:]
    elif len(data) < sequence_length:
        data = np.pad(data, ((0, sequence_length - len(data)), (0, 0)))
    return torch.from_numpy(data).unsqueeze(0)


def clip_diagnostics(frames):
    pose = np.stack([f[0] for f in frames])
    hand1 = np.stack([f[1] for f in frames])
    hand2 = np.stack([f[2] for f in frames])
    stats = {n: float((~np.isnan(b).any(axis=(1, 2))).mean()) for n, b in (("pose", pose), ("hand1", hand1), ("hand2", hand2))}
    return stats, pose, hand1, hand2


def save_capture_features(path, frames, model_input, cam_width, cam_height, cam_fps, measured_fps, raw_count, top):
    _, pose, hand1, hand2 = clip_diagnostics(frames)
    np.savez(path, pose=pose, hand1=hand1, hand2=hand2, model_input=model_input.squeeze(0).cpu().numpy(),
             cam_width=cam_width, cam_height=cam_height, cam_fps=cam_fps, measured_fps=measured_fps,
             raw_frame_count=raw_count, frame_width_used_for_scaling=FRAME_WIDTH,
             frame_height_used_for_scaling=FRAME_HEIGHT,
             top_predictions=np.array([f"{label}:{conf:.6f}" for label, conf in top]))


def main():
    args = parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else torch.device(args.device)
    print(f"Using device: {device}")
    if device.type == "cuda":
        print(f"GPU: {torch.cuda.get_device_name(0)}")

    model_path = args.model or (DEFAULT_CHECKPOINT if DEFAULT_CHECKPOINT.is_file() else MODEL_PATH)
    if not model_path.is_file():
        raise FileNotFoundError(f"Model checkpoint not found: {model_path}")
    legacy_labels = args.labels or LABEL_PATH
    model, meta = load_checkpoint(model_path, device, legacy_labels_path=legacy_labels)
    labels = meta["labels"]
    if args.labels and meta.get("custom"):
        override = json.load(args.labels.open(encoding="utf-8"))
        override = [k for k, _ in sorted(override.items(), key=lambda kv: kv[1])]
        if len(override) != len(labels):
            raise ValueError(f"--labels has {len(override)} entries but the checkpoint has {len(labels)} classes")
        labels = override
    kind = "custom from-scratch" if meta.get("custom") else "original INCLUDE"
    print(f"Model: {model_path.name} ({kind}), {len(labels)} classes: "
          f"{labels if len(labels) <= 30 else str(labels[:30]) + ' ...'}")

    sequence_length = args.sequence_length or int(meta.get("max_frame_len", LEGACY_SEQUENCE_LENGTH))
    if sequence_length > 256:
        raise ValueError("--sequence-length cannot exceed 256")
    train_fps = meta.get("train_fps")
    resample_fps = None if (args.no_resample or not train_fps) else float(train_fps)
    if args.mirror and args.no_mirror:
        raise SystemExit("--mirror and --no-mirror are mutually exclusive")
    if args.mirror or args.no_mirror:
        mirror, mirror_why = args.mirror, "set on the command line"
    elif meta.get("flip_horizontal") is not None:
        mirror, mirror_why = bool(meta["flip_horizontal"]), "matches how the training clips were extracted"
    else:
        mirror, mirror_why = True, "default for the original INCLUDE checkpoint"
    print(f"Clip length: {sequence_length} frames   resample to {resample_fps or 'off'} fps   "
          f"horizontal mirror: {'ON' if mirror else 'OFF'} ({mirror_why})")

    camera = cv2.VideoCapture(args.camera)
    if not camera.isOpened():
        raise RuntimeError(f"Could not open webcam {args.camera}")
    camera.set(cv2.CAP_PROP_FRAME_WIDTH, args.cam_width)
    camera.set(cv2.CAP_PROP_FRAME_HEIGHT, args.cam_height)
    if args.cam_fps:
        camera.set(cv2.CAP_PROP_FPS, args.cam_fps)
    actual_width = int(camera.get(cv2.CAP_PROP_FRAME_WIDTH))
    actual_height = int(camera.get(cv2.CAP_PROP_FRAME_HEIGHT))
    actual_fps = camera.get(cv2.CAP_PROP_FPS)
    aspect = actual_width / actual_height if actual_height else 0.0
    print(f"Actual capture: {actual_width}x{actual_height} @ {actual_fps:.1f} fps (aspect {aspect:.4f}, 16:9 = {16 / 9:.4f})")
    if abs(aspect - 16 / 9) > CAM_ASPECT_TOLERANCE:
        print("WARNING: capture is not 16:9; dataset.py scales x by 1920 and y by 1080, so geometry will be distorted "
              "unless the training clips had the same aspect ratio.")
    CAPTURES_DIR.mkdir(exist_ok=True)

    def classify(clip_frames, clip_times):
        raw_count = len(clip_frames)
        duration = clip_times[-1] - clip_times[0] if raw_count > 1 else 0.0
        measured_fps = (raw_count - 1) / duration if duration > 0 else 0.0
        frames = resample_to_fps(clip_frames, clip_times, resample_fps) if resample_fps else clip_frames
        stats, _, _, _ = clip_diagnostics(frames)
        model_input = prepare_sequence(frames, sequence_length).to(device)
        with torch.inference_mode():
            probabilities = torch.softmax(model(model_input), dim=-1)[0]
        values, indices = torch.topk(probabilities, k=min(5, len(labels)))
        top = [(labels[int(i)], float(v)) for v, i in zip(values.cpu(), indices.cpu())]
        label, conf = top[0]
        if args.confidence_threshold and conf < args.confidence_threshold:
            label = "Uncertain"
        print(f"[clip] {raw_count} camera frames over {duration:.2f}s (measured {measured_fps:.1f} fps) -> "
              f"{len(frames)} model frames   detection: pose={stats['pose']:.0%} hand1={stats['hand1']:.0%} hand2={stats['hand2']:.0%}")
        if resample_fps and measured_fps and abs(measured_fps - resample_fps) / resample_fps > 0.25:
            print(f"  note: live loop runs at {measured_fps:.1f} fps vs {resample_fps:.0f} fps in training; "
                  f"frames were resampled to compensate.")
        print("Top predictions:")
        for rank, (lbl, c) in enumerate(top, 1):
            print(f"  {rank}. {lbl}: {c:.6f}")
        if not args.no_save_features:
            feat_path = CAPTURES_DIR / f"features_{int(time.time())}.npz"
            save_capture_features(feat_path, frames, model_input, actual_width, actual_height, actual_fps,
                                  measured_fps, raw_count, top)
            print(f"Saved features: {feat_path}")
        return label, conf, top[:3]

    max_seconds = sequence_length / resample_fps if resample_fps else None
    clip_frames, clip_times = [], []
    recording, rec_start = False, 0.0
    video_writer, video_path = None, None
    prediction, confidence, top_predictions = "Waiting...", 0.0, []
    previous_time = time.perf_counter()
    try:
        with mp_hands.Hands(static_image_mode=False, min_detection_confidence=args.hand_min_detection_confidence,
                            min_tracking_confidence=args.hand_min_tracking_confidence, max_num_hands=2) as hands, \
             mp_pose.Pose(static_image_mode=False, min_detection_confidence=args.pose_min_detection_confidence,
                          min_tracking_confidence=args.pose_min_tracking_confidence) as pose:
            frames_seen = pose_hits = hand1_hits = hand2_hits = 0
            while True:
                ok, frame = camera.read()
                if not ok:
                    raise RuntimeError("Webcam stopped returning frames")
                now = time.perf_counter()
                if mirror:
                    frame = cv2.flip(frame, 1)  # BEFORE MediaPipe, same place extract_keypoints_custom.py flips
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                frame_data = extract_frame(hands.process(rgb), pose.process(rgb))
                pose_kp, hand1_kp, hand2_kp, _ = frame_data

                if recording:
                    clip_frames.append(frame_data)
                    clip_times.append(now)
                    frames_seen += 1
                    pose_hits += int(not np.isnan(pose_kp).any())
                    hand1_hits += int(not np.isnan(hand1_kp).any())
                    hand2_hits += int(not np.isnan(hand2_kp).any())
                    if video_writer is not None:
                        video_writer.write(frame)
                    full = (now - rec_start >= max_seconds) if max_seconds else (len(clip_frames) >= sequence_length)
                    if full:
                        prediction, confidence, top_predictions = classify(clip_frames, clip_times)
                        recording, clip_frames, clip_times = False, [], []
                        if video_writer is not None:
                            video_writer.release()
                            video_writer = None
                            print(f"Saved clip: {video_path}")

                key = cv2.waitKey(1) & 0xFF
                if key == ord(" "):
                    if not recording:
                        recording, rec_start = True, time.perf_counter()
                        clip_frames, clip_times = [], []
                        frames_seen = pose_hits = hand1_hits = hand2_hits = 0
                        prediction, confidence, top_predictions = "Recording...", 0.0, []
                        video_path = CAPTURES_DIR / f"capture_{int(time.time())}.mov"
                        height, width = frame.shape[:2]
                        video_writer = cv2.VideoWriter(str(video_path), cv2.VideoWriter_fourcc(*"mp4v"), 20.0, (width, height))
                    else:
                        recording = False
                        if video_writer is not None:
                            video_writer.release()
                            video_writer = None
                            print(f"Saved clip: {video_path}")
                        if len(clip_frames) >= args.min_frames:
                            prediction, confidence, top_predictions = classify(clip_frames, clip_times)
                        else:
                            prediction, confidence, top_predictions = "Too short, try again", 0.0, []
                        clip_frames, clip_times = [], []
                elif key in (ord("q"), 27):
                    break

                fps = 1.0 / max(time.perf_counter() - previous_time, 1e-6)
                previous_time = time.perf_counter()
                status = f"REC {len(clip_frames)} frames" if recording else "Press SPACE to record a sign"
                color = (0, 0, 255) if recording else (220, 220, 220)
                cv2.putText(frame, f"Sign: {prediction} ({confidence:.2f})", (20, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.75, (0, 255, 0), 2)
                cv2.putText(frame, f"FPS: {fps:.1f}  {status}", (20, 65), cv2.FONT_HERSHEY_SIMPLEX, 0.55, color, 1)
                for rank, (label, probability) in enumerate(top_predictions[1:], 2):
                    cv2.putText(frame, f"{rank}. {label} ({probability:.2f})", (20, 65 + rank * 25),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
                if recording and frames_seen:
                    dot = lambda present: (0, 255, 0) if present else (0, 0, 255)
                    cv2.circle(frame, (20, 95), 6, dot(not np.isnan(pose_kp).any()), -1)
                    cv2.circle(frame, (40, 95), 6, dot(not np.isnan(hand1_kp).any()), -1)
                    cv2.circle(frame, (60, 95), 6, dot(not np.isnan(hand2_kp).any()), -1)
                    cv2.putText(frame, f"pose={pose_hits / frames_seen:.0%} hand1={hand1_hits / frames_seen:.0%} "
                                       f"hand2={hand2_hits / frames_seen:.0%}", (75, 100),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)
                cv2.imshow("Live Inference", frame)
    finally:
        if video_writer is not None:
            video_writer.release()
        camera.release()
        cv2.destroyAllWindows()


if __name__ == "__main__":
    main()
