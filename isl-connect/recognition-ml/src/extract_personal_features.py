"""
Extract 225-dim features from personal raw recordings, using the EXACT
same extraction/normalization code as the base dataset
(landmark_extraction_selected.py) — imported directly, not reimplemented,
so there is no risk of the personal-data preprocessing drifting from what
the model was actually trained on.

Reads:  data/personal_raw/{signer}/{class_name}/*.mp4
Writes: data/personal_features/{signer}/{class_name}/*.npy

Never touches data/raw_selected/ or data/features_selected/.

Class folder names are validated against the current 24-class label
mapping (models/label_classes.json) — a personal folder whose name isn't
an exact match (e.g. a typo, or different casing) is reported and skipped
rather than silently creating a 25th "class" that would desync from the
model's output layer.

Usage:
    python3 src/extract_personal_features.py --signer priya
    python3 src/extract_personal_features.py            # all signers found
    python3 src/extract_personal_features.py --signer priya --overwrite
"""
import argparse
from pathlib import Path

import numpy as np

from dataset import load_label_classes
from landmark_extraction_selected import (
    VIDEO_EXTENSIONS,
    extract_landmarks,
    fix_sequence_length,
)

PROJECT_DIR = Path(__file__).resolve().parent.parent
DEFAULT_RAW_DIR = PROJECT_DIR / "data" / "personal_raw"
DEFAULT_FEATURE_DIR = PROJECT_DIR / "data" / "personal_features"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--raw-dir", type=str, default=str(DEFAULT_RAW_DIR))
    parser.add_argument("--feature-dir", type=str, default=str(DEFAULT_FEATURE_DIR))
    parser.add_argument("--signer", type=str, default=None,
                         help="Process only this signer (default: every signer folder found)")
    parser.add_argument("--overwrite", action="store_true")
    return parser.parse_args()


def main():
    args = parse_args()
    raw_dir = Path(args.raw_dir)
    feature_dir = Path(args.feature_dir)

    if not raw_dir.exists():
        raise FileNotFoundError(f"{raw_dir} not found — record some clips first "
                                 f"with record_personal_data.py")

    valid_classes = set(load_label_classes())
    print(f"Validating against {len(valid_classes)} known classes from label_classes.json")

    signer_dirs = [raw_dir / args.signer] if args.signer else sorted(
        d for d in raw_dir.iterdir() if d.is_dir()
    )

    total = successful = failed = skipped_unknown_class = 0

    for signer_dir in signer_dirs:
        signer = signer_dir.name
        print(f"\n=== Signer: {signer} ===")

        for class_dir in sorted(signer_dir.iterdir()):
            if not class_dir.is_dir():
                continue
            class_name = class_dir.name
            if class_name not in valid_classes:
                print(f"  SKIPPING unrecognized class folder '{class_name}' — "
                      f"not in the current 24-class label mapping. Check for typos/casing.")
                skipped_unknown_class += 1
                continue

            videos = sorted(
                p for p in class_dir.iterdir()
                if p.is_file() and p.suffix.lower() in VIDEO_EXTENSIONS
            )
            if not videos:
                continue

            output_class_dir = feature_dir / signer / class_name
            output_class_dir.mkdir(parents=True, exist_ok=True)

            for video_path in videos:
                total += 1
                output_path = output_class_dir / f"{video_path.stem}.npy"
                if output_path.exists() and not args.overwrite:
                    print(f"  Already exists: {output_path}")
                    successful += 1
                    continue

                print(f"  Processing: {video_path}")
                sequence = extract_landmarks(video_path)
                if sequence is None:
                    failed += 1
                    continue

                sequence = fix_sequence_length(sequence)
                np.save(output_path, sequence)
                print(f"  Saved: {output_path} {sequence.shape}")
                successful += 1

    print("\nPersonal feature extraction complete")
    print(f"Total videos          : {total}")
    print(f"Successful            : {successful}")
    print(f"Failed                : {failed}")
    print(f"Skipped (unknown class): {skipped_unknown_class}")


if __name__ == "__main__":
    main()