"""
Pool all .npy features across the existing train/val/test folders and
write one clean stratified split to a separate output directory.

Why: the original train/val/test split left individual classes badly
imbalanced across splits at this dataset size — e.g. Bird was ~32% of
train+val but only ~5% of test, which is consistent with the model
defaulting to predicting Bird whenever it's unsure. This script does not
touch or overwrite the original data/features/ — it reads from it and
writes a new split elsewhere, so you can compare results from both.

Usage:
    python3 src/resplit_dataset.py
    python3 src/resplit_dataset.py --train-frac 0.7 --val-frac 0.15 --test-frac 0.15

Then point train.py / evaluate.py / train_kfold.py at the new split with:
    python3 src/train.py --data-dir data/features_stratified
"""
import argparse
import shutil
from pathlib import Path

from sklearn.model_selection import train_test_split

from dataset import FEATURE_DIR, discover_classes


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--source-dir", type=str, default=str(FEATURE_DIR))
    parser.add_argument("--output-dir", type=str,
                         default=str(Path(__file__).resolve().parent.parent / "data" / "features_stratified"))
    parser.add_argument("--train-frac", type=float, default=0.7)
    parser.add_argument("--val-frac", type=float, default=0.15)
    parser.add_argument("--test-frac", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args()


def collect_all_files(source_dir: Path, classes: list[str]):
    """Pool every .npy file across the existing train/val/test folders."""
    files, labels = [], []
    for split in ["train", "val", "test"]:
        split_dir = source_dir / split
        if not split_dir.exists():
            continue
        for cls in classes:
            cls_dir = split_dir / cls
            if not cls_dir.exists():
                continue
            for npy_path in sorted(cls_dir.glob("*.npy")):
                files.append(npy_path)
                labels.append(cls)
    return files, labels


def main():
    args = parse_args()
    if abs(args.train_frac + args.val_frac + args.test_frac - 1.0) > 1e-6:
        raise ValueError("--train-frac + --val-frac + --test-frac must sum to 1.0")

    source_dir = Path(args.source_dir)
    output_dir = Path(args.output_dir)
    classes = discover_classes(source_dir)

    files, labels = collect_all_files(source_dir, classes)
    print(f"Pooled {len(files)} total .npy files across {len(classes)} classes")
    counts = {c: labels.count(c) for c in classes}
    print(f"Per-class counts: {counts}")

    for cls, n in counts.items():
        if n < 3:
            print(f"WARNING: class '{cls}' has only {n} samples — a 3-way stratified "
                  f"split may fail or leave a split with 0 samples for this class.")

    # Carve off test first, then split the remainder into train/val.
    files_trainval, files_test, labels_trainval, labels_test = train_test_split(
        files, labels, test_size=args.test_frac, stratify=labels, random_state=args.seed
    )
    relative_val_frac = args.val_frac / (args.train_frac + args.val_frac)
    files_train, files_val, labels_train, labels_val = train_test_split(
        files_trainval, labels_trainval, test_size=relative_val_frac,
        stratify=labels_trainval, random_state=args.seed
    )

    split_assignment = {
        "train": list(zip(files_train, labels_train)),
        "val": list(zip(files_val, labels_val)),
        "test": list(zip(files_test, labels_test)),
    }

    print()
    for split, items in split_assignment.items():
        split_counts = {c: 0 for c in classes}
        for _, label in items:
            split_counts[label] += 1
        print(f"{split}: {len(items)} samples -> {split_counts}")

    if output_dir.exists():
        print(f"\nRemoving previous {output_dir} before writing (source data/features/ is untouched)...")
        shutil.rmtree(output_dir)

    for split, items in split_assignment.items():
        for src_path, label in items:
            dest_dir = output_dir / split / label
            dest_dir.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src_path, dest_dir / src_path.name)

    print(f"\nWrote new stratified split to {output_dir}")
    print("Original data/features/ was not modified — both are available to compare.")
    print(f"\nTo train/evaluate against this split:")
    print(f"  python3 src/train.py --data-dir {output_dir}")
    print(f"  python3 src/evaluate.py --data-dir {output_dir} --model models/isl_recognition_model.keras")
    print(f"  python3 src/train_kfold.py --data-dir {output_dir}")


if __name__ == "__main__":
    main()