#!/usr/bin/env python3
"""
Export demo data for the "See Samvaad in action" section.

Writes, for each sign you pick:
    public/demo/<slug>.json          landmarks + top predictions (format in the README)
    public/demo/videos/<slug>.mp4    the matching clip (optional, with --videos)

It reads your existing (100, 225) feature .npy files, in the layout used by
recognition-ml/src/landmark_extraction_selected.py:

    per frame = [ left_hand 21x3 | right_hand 21x3 | pose 33x3 ]   (225 values)

IMPORTANT - normalisation. Those features are centred on the shoulders and divided by the
shoulder width, so absolute screen position is gone. Two ways to get drawable coordinates:

  1. Default (from .npy): positions are RECONSTRUCTED around a fixed centre. The hands attach to
     the pose wrists. This looks right but will not line up pixel-for-pixel with the video.
  2. --from-video DIR: re-runs MediaPipe Holistic on the original video to get true image
     coordinates, sampled to 100 frames exactly like fix_sequence_length(). Use this when you
     want the skeleton to sit exactly on the signer in the video (needs opencv + mediapipe).

Predictions come from one of:
    --model models/xxx.keras --labels models/label_classes.json   (needs tensorflow)
    --predictions predictions.json   {"Hello": [{"label": "Hello", "p": 0.94}, ...], ...}

Examples
    python scripts/export_demo_data.py \\
        --features ../isl-connect/recognition-ml/data/features_selected/test \\
        --model ../isl-connect/recognition-ml/models/isl_recognition_model_kfold.keras \\
        --labels ../isl-connect/recognition-ml/models/label_classes.json \\
        --videos ../isl-connect/recognition-ml/data/raw_selected \\
        --out public/demo

    python scripts/export_demo_data.py --features feats --predictions preds.json --from-video raw
"""
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np

SEQ_LEN = 100
FEATURES = 225
DECIMALS = 3
VIDEO_EXT = {".mp4", ".mov", ".avi", ".mkv", ".webm"}

# Display layout used when reconstructing from normalised features.
CENTER = (0.5, 0.40)  # where the shoulder midpoint lands (fraction of the frame)
SHOULDER_WIDTH = 0.26  # shoulder width as a fraction of frame width
ASPECT = 16 / 9  # frame width / height; the web demo's panels are 16:9 by default


def slugify(label: str) -> str:
    """Must match slugify() in src/components/signdemo/lib/signs.ts."""
    return re.sub(r"^-+|-+$", "", re.sub(r"[^a-z0-9]+", "-", label.strip().lower()))


def r(a: np.ndarray) -> list:
    return np.round(a.astype(np.float64), DECIMALS).tolist()


# --------------------------------------------------------------------------- features -> frames
def split_features(seq: np.ndarray):
    """(T, 225) -> left (T,21,3), right (T,21,3), pose (T,33,3), following the extractor's order."""
    left = seq[:, 0:63].reshape(-1, 21, 3)
    right = seq[:, 63:126].reshape(-1, 21, 3)
    pose = seq[:, 126:225].reshape(-1, 33, 3)
    return left, right, pose


def frames_from_features(seq: np.ndarray, aspect: float = ASPECT) -> list[dict]:
    """Rebuild drawable image-space coordinates from normalised features."""
    left, right, pose = split_features(seq)
    cx, cy = CENTER
    out = []
    for t in range(len(seq)):
        has_pose = np.any(pose[t])
        # Normalised units are "shoulder widths". x is a fraction of frame WIDTH, y of HEIGHT,
        # so one shoulder width spans SHOULDER_WIDTH in x and SHOULDER_WIDTH * aspect in y.
        sx, sy = SHOULDER_WIDTH, SHOULDER_WIDTH * aspect

        def to_img(p):  # p: (n, >=2) in shoulder-width units
            return np.stack([cx + p[:, 0] * sx, cy + p[:, 1] * sy], axis=1)

        pose_img = to_img(pose[t]) if has_pose else np.zeros((0, 2))
        frame = {"pose": r(pose_img) if has_pose else [], "left_hand": [], "right_hand": []}
        for name, hand, wrist_idx in (("left_hand", left[t], 15), ("right_hand", right[t], 16)):
            if not np.any(hand) or not has_pose:
                continue
            wrist = pose_img[wrist_idx]
            pts = np.stack([wrist[0] + hand[:, 0] * sx, wrist[1] + hand[:, 1] * sy], axis=1)
            frame[name] = r(pts)
        out.append(frame)
    return out


def frames_from_video(video: Path) -> list[dict]:
    """Run MediaPipe Holistic on the video and sample 100 frames like fix_sequence_length()."""
    import cv2  # noqa: WPS433 (optional dependency)
    import mediapipe as mp

    cap = cv2.VideoCapture(str(video))
    if not cap.isOpened():
        raise RuntimeError(f"cannot open {video}")
    raw = []
    with mp.solutions.holistic.Holistic(
        static_image_mode=False, min_detection_confidence=0.5, min_tracking_confidence=0.5
    ) as holistic:
        while True:
            ok, bgr = cap.read()
            if not ok:
                break
            res = holistic.process(cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB))

            def pts(lm):
                return [] if lm is None else [[l.x, l.y] for l in lm.landmark]

            raw.append(
                {
                    "pose": pts(res.pose_landmarks),
                    "left_hand": pts(res.left_hand_landmarks),
                    "right_hand": pts(res.right_hand_landmarks),
                }
            )
    cap.release()
    if not raw:
        raise RuntimeError(f"no frames in {video}")
    if len(raw) > SEQ_LEN:
        idx = np.linspace(0, len(raw) - 1, SEQ_LEN).astype(int)
        raw = [raw[i] for i in idx]
    frames = []
    for f in raw:
        frames.append({k: np.round(np.array(v), DECIMALS).tolist() if v else [] for k, v in f.items()})
    return frames


# --------------------------------------------------------------------------- predictions
def load_label_list(path: Path) -> list[str]:
    data = json.loads(path.read_text())
    if isinstance(data, list):
        return [str(x) for x in data]
    if isinstance(data, dict):
        if all(isinstance(v, int) for v in data.values()):  # {label: index}
            return [k for k, _ in sorted(data.items(), key=lambda kv: kv[1])]
        return [data[k] for k in sorted(data, key=lambda k: int(k))]  # {"0": label}
    raise ValueError(f"unrecognised label file format: {path}")


def top_k(probs: np.ndarray, labels: list[str], k: int = 3) -> list[dict]:
    order = np.argsort(probs)[::-1][:k]
    return [{"label": labels[i], "p": round(float(probs[i]), DECIMALS)} for i in order]


# --------------------------------------------------------------------------- discovery
def find_samples(features_dir: Path, pick: str) -> dict[str, Path]:
    """class name -> chosen .npy. Accepts <dir>/<class>/*.npy or <dir>/<split>/<class>/*.npy."""
    by_class: dict[str, list[Path]] = {}
    for f in sorted(features_dir.rglob("*.npy")):
        by_class.setdefault(f.parent.name, []).append(f)
    chosen = {}
    for cls, files in by_class.items():
        chosen[cls] = files[0] if pick == "first" else files[len(files) // 2]
    return chosen


def find_video(videos_dir: Path | None, cls: str, stem: str) -> Path | None:
    if not videos_dir:
        return None
    for folder in (videos_dir / cls, videos_dir):
        if folder.is_dir():
            for p in sorted(folder.rglob(f"{stem}.*")):
                if p.suffix.lower() in VIDEO_EXT:
                    return p
    return None


def write_video(src: Path, dst: Path) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if shutil.which("ffmpeg"):
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-an",
            "-vf", "scale='min(960,iw)':-2", "-c:v", "libx264", "-preset", "veryfast",
            "-crf", "26", "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(dst),
        ]
        subprocess.run(cmd, check=True)
    else:
        print("  ffmpeg not found; copying the video unchanged", file=sys.stderr)
        shutil.copyfile(src, dst)


# --------------------------------------------------------------------------- main
def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--features", required=True, type=Path, help="folder of (100,225) .npy files, grouped by class")
    ap.add_argument("--out", type=Path, default=Path("public/demo"), help="output folder (default public/demo)")
    ap.add_argument("--model", type=Path, help="Keras model (.keras/.h5) to compute predictions")
    ap.add_argument("--labels", type=Path, help="label_classes.json (class order of the model)")
    ap.add_argument("--predictions", type=Path, help="precomputed predictions JSON instead of --model")
    ap.add_argument("--videos", type=Path, help="folder of original videos (<class>/<stem>.mp4) to copy as demo clips")
    ap.add_argument("--from-video", type=Path, help="re-extract true image coordinates from videos in this folder")
    ap.add_argument("--signs", nargs="*", help="only export these class names")
    ap.add_argument("--pick", choices=["first", "middle"], default="middle", help="which sample per class")
    ap.add_argument("--fps", type=float, default=25.0, help="fps stored in the JSON (default 25)")
    args = ap.parse_args()

    samples = find_samples(args.features, args.pick)
    if args.signs:
        wanted = {s.lower() for s in args.signs}
        samples = {c: p for c, p in samples.items() if c.lower() in wanted}
    if not samples:
        print("No .npy samples found.", file=sys.stderr)
        return 1

    model = labels = precomputed = None
    if args.model:
        if not args.labels:
            ap.error("--model needs --labels")
        import tensorflow as tf  # noqa: WPS433

        model = tf.keras.models.load_model(args.model)
        labels = load_label_list(args.labels)
    elif args.predictions:
        precomputed = json.loads(args.predictions.read_text())
    else:
        ap.error("provide --model + --labels, or --predictions")

    args.out.mkdir(parents=True, exist_ok=True)
    written = 0
    for cls, npy in sorted(samples.items()):
        seq = np.load(npy).astype(np.float32)
        if seq.shape != (SEQ_LEN, FEATURES):
            print(f"skip {cls}: {npy.name} has shape {seq.shape}, expected {(SEQ_LEN, FEATURES)}", file=sys.stderr)
            continue

        if model is not None:
            probs = model.predict(seq[None], verbose=0)[0]
            preds = top_k(probs, labels)
        else:
            preds = precomputed.get(cls) or precomputed.get(cls.lower())
            if not preds:
                print(f"skip {cls}: no predictions for it", file=sys.stderr)
                continue
            preds = sorted(preds, key=lambda p: -p["p"])[:3]

        slug = slugify(cls)
        video_src = find_video(args.videos, cls, npy.stem)
        video_rel = None
        if video_src:
            write_video(video_src, args.out / "videos" / f"{slug}.mp4")
            video_rel = f"/demo/videos/{slug}.mp4"

        if args.from_video:
            vsrc = find_video(args.from_video, cls, npy.stem)
            if not vsrc:
                print(f"skip {cls}: no source video for {npy.stem} in --from-video", file=sys.stderr)
                continue
            frames = frames_from_video(vsrc)
        else:
            frames = frames_from_features(seq)

        doc = {"sign": cls, "video": video_rel, "fps": args.fps, "frames": frames, "predictions": preds}
        out = args.out / f"{slug}.json"
        out.write_text(json.dumps(doc, separators=(",", ":"), ensure_ascii=False))
        written += 1
        top = preds[0]
        flag = "" if top["label"].lower() == cls.lower() else "   <-- model predicted a different class!"
        print(f"{cls:<14} {out}  {out.stat().st_size / 1024:6.1f} KB  top: {top['label']} {top['p']:.2f}{flag}")

    print(f"\nWrote {written} sign(s) to {args.out}")
    return 0 if written else 1


if __name__ == "__main__":
    raise SystemExit(main())
