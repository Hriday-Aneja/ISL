"""
Record raw webcam signing clips for one signer, for fine-tuning the
existing 24-class model on personal data.

This script ONLY records raw video — it does not touch MediaPipe, the
225-feature representation, or the trained model. Extraction happens as a
separate step (extract_personal_features.py), mirroring how the base
dataset is built: raw_selected/ -> landmark_extraction_selected.py ->
features_selected/. Personal recordings never touch either of those
folders; they go to data/personal_raw/ and (after extraction)
data/personal_features/, both scoped by --signer.

The class list is read from the ACTUAL current label mapping
(models/label_classes.json if it exists, else discovered from
data/features_selected/) — never from data/classes.json, which is a
stale 50-class draft unrelated to the current 24-class set.

Controls (with the camera window focused):
    n / p   - next / previous class in the list
    r       - start/stop recording a clip (toggle)
    q       - quit

Usage:
    python3 src/record_personal_data.py --signer priya
    python3 src/record_personal_data.py --signer priya --classes Bird Dog Hello
"""
import argparse
import sys
from pathlib import Path

import cv2

from dataset import FEATURE_DIR, LABELS_PATH, discover_classes, load_label_classes

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT_DIR = PROJECT_DIR / "data" / "personal_raw"
DEFAULT_FEATURE_DIR_FOR_CLASSES = PROJECT_DIR / "data" / "features_selected"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--signer", type=str, required=True,
                         help="Signer identity — recordings are kept separate per signer")
    parser.add_argument("--output-dir", type=str, default=str(DEFAULT_OUTPUT_DIR))
    parser.add_argument("--classes", nargs="+", default=None,
                         help="Which classes to offer (default: the current 24-class "
                              "label mapping from models/label_classes.json, falling back "
                              "to whatever's discovered under data/features_selected/)")
    parser.add_argument("--camera", type=int, default=0)
    parser.add_argument("--fps", type=int, default=20)
    return parser.parse_args()


def resolve_classes(explicit_classes):
    if explicit_classes:
        return explicit_classes
    if LABELS_PATH.exists():
        return load_label_classes()
    print(f"NOTE: {LABELS_PATH} not found — falling back to classes discovered under "
          f"{DEFAULT_FEATURE_DIR_FOR_CLASSES}. Run this after the base model has been "
          f"trained at least once for the authoritative label order.")
    return discover_classes(DEFAULT_FEATURE_DIR_FOR_CLASSES)


def next_clip_path(output_dir: Path, signer: str, class_name: str) -> Path:
    class_dir = output_dir / signer / class_name
    class_dir.mkdir(parents=True, exist_ok=True)
    existing = list(class_dir.glob(f"{signer}_{class_name}_*.mp4"))
    n = len(existing) + 1
    while (class_dir / f"{signer}_{class_name}_{n:03d}.mp4").exists():
        n += 1
    return class_dir / f"{signer}_{class_name}_{n:03d}.mp4"


def main():
    args = parse_args()
    classes = resolve_classes(args.classes)
    if not classes:
        print("No classes to record — pass --classes or train the base model first.")
        sys.exit(1)
    print(f"Signer: {args.signer}")
    print(f"Classes ({len(classes)}): {classes}")
    print("Controls: n=next class, p=previous class, r=start/stop recording, q=quit\n")

    output_dir = Path(args.output_dir)
    saved_counts = {
        c: len(list((output_dir / args.signer / c).glob("*.mp4"))) if (output_dir / args.signer / c).exists() else 0
        for c in classes
    }

    cap = cv2.VideoCapture(args.camera)
    if not cap.isOpened():
        raise RuntimeError(f"Could not open camera {args.camera}")
    frame_w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)) or 640
    frame_h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT)) or 480
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")

    class_idx = 0
    recording = False
    writer = None
    current_clip_path = None
    frames_written = 0

    while True:
        ok, frame = cap.read()
        if not ok:
            break

        current_class = classes[class_idx]

        if recording:
            writer.write(frame)
            frames_written += 1

        status = f"REC ({frames_written} frames)" if recording else "Idle"
        color = (0, 0, 255) if recording else (0, 255, 0)
        cv2.putText(frame, f"Signer: {args.signer}", (20, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
        cv2.putText(frame, f"Class [{class_idx + 1}/{len(classes)}]: {current_class}", (20, 65),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)
        cv2.putText(frame, status, (20, 100), cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
        cv2.putText(frame, f"Saved for this class: {saved_counts[current_class]}", (20, 130),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.55, (200, 200, 200), 1)
        cv2.putText(frame, "n=next  p=prev  r=record  q=quit", (20, frame_h - 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (180, 180, 180), 1)
        cv2.imshow("Personal Data Recorder", frame)

        key = cv2.waitKey(10) & 0xFF
        if key == ord("q"):
            break
        elif key == ord("n") and not recording:
            class_idx = (class_idx + 1) % len(classes)
        elif key == ord("p") and not recording:
            class_idx = (class_idx - 1) % len(classes)
        elif key == ord("r"):
            if not recording:
                current_clip_path = next_clip_path(output_dir, args.signer, current_class)
                writer = cv2.VideoWriter(str(current_clip_path), fourcc, args.fps, (frame_w, frame_h))
                frames_written = 0
                recording = True
                print(f"Recording -> {current_clip_path}")
            else:
                writer.release()
                writer = None
                recording = False
                saved_counts[current_class] += 1
                print(f"Saved {current_clip_path} ({frames_written} frames)")

    if writer is not None:
        writer.release()
    cap.release()
    cv2.destroyAllWindows()

    print("\nFinal counts:")
    for c in classes:
        print(f"  {c}: {saved_counts[c]}")


if __name__ == "__main__":
    main()