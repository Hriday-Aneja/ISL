"""
Loads the .npy landmark features produced by landmark_extraction.py and
builds train/val/test arrays, preserving the existing split (features are
already sorted into data/features/{split}/{class}/*.npy — this module does
not reshuffle or re-split anything).

Each .npy file has shape (SEQUENCE_LENGTH, FEATURE_SIZE) = (100, 225).
"""
import json
from pathlib import Path

import numpy as np

FEATURE_DIR = Path(__file__).resolve().parent.parent / "data" / "features"
LABELS_PATH = Path(__file__).resolve().parent.parent / "models" / "label_classes.json"

SEQUENCE_LENGTH = 100
FEATURE_SIZE = 225


def discover_classes(feature_dir: Path = FEATURE_DIR) -> list[str]:
    """
    Class list is derived from the actual class folders present under
    data/features/, NOT from data/classes.json — that file currently holds
    a much larger 50-class draft list left over from earlier dataset
    exploration and does not match the 4-class pilot (Dog, Bird, Hello,
    Thank you). Sourcing classes from the feature folders keeps this
    pipeline correct regardless of which list is stale.
    """
    classes = set()
    for split in ["train", "val", "test"]:
        split_dir = feature_dir / split
        if not split_dir.exists():
            continue
        classes.update(p.name for p in split_dir.iterdir() if p.is_dir())
    if not classes:
        raise FileNotFoundError(
            f"No class folders found under {feature_dir}. "
            "Expected data/features/{train,val,test}/{class_name}/*.npy"
        )
    return sorted(classes)


def load_split(split: str, classes: list[str], feature_dir: Path = FEATURE_DIR):
    """
    Returns (X, y, filenames) for one split.
    X: float32 array, shape (n_samples, SEQUENCE_LENGTH, FEATURE_SIZE)
    y: int array, shape (n_samples,) — index into `classes`
    filenames: list[str], the source .npy path per sample (for error inspection)
    """
    split_dir = feature_dir / split
    if not split_dir.exists():
        raise FileNotFoundError(f"Split folder not found: {split_dir}")

    label_to_idx = {c: i for i, c in enumerate(classes)}
    X, y, filenames = [], [], []

    for class_dir in sorted(split_dir.iterdir()):
        if not class_dir.is_dir():
            continue
        if class_dir.name not in label_to_idx:
            print(f"WARNING: '{class_dir.name}' not in class list, skipping {class_dir}")
            continue

        for npy_path in sorted(class_dir.glob("*.npy")):
            arr = np.load(npy_path)
            if arr.shape != (SEQUENCE_LENGTH, FEATURE_SIZE):
                print(f"WARNING: unexpected shape {arr.shape} in {npy_path}, skipping")
                continue
            X.append(arr)
            y.append(label_to_idx[class_dir.name])
            filenames.append(str(npy_path))

    if not X:
        raise FileNotFoundError(f"No valid .npy features found under {split_dir}")

    return np.stack(X).astype(np.float32), np.array(y, dtype=np.int64), filenames


def load_all_splits(feature_dir: Path = FEATURE_DIR):
    """
    Convenience loader: discovers classes, loads train/val/test, and saves
    the label encoding to models/label_classes.json so evaluate.py and
    infer.py use the exact same class-index mapping the model was trained with.
    """
    classes = discover_classes(feature_dir)

    LABELS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LABELS_PATH, "w") as f:
        json.dump(classes, f, indent=2)

    data = {}
    for split in ["train", "val", "test"]:
        data[split] = load_split(split, classes, feature_dir)

    return classes, data


def load_label_classes() -> list[str]:
    """Load the label encoding saved during training — evaluate.py/infer.py use this."""
    if not LABELS_PATH.exists():
        raise FileNotFoundError(
            f"{LABELS_PATH} not found — run train.py first, it saves the label mapping."
        )
    with open(LABELS_PATH) as f:
        return json.load(f)


if __name__ == "__main__":
    classes, data = load_all_splits()
    print(f"Classes ({len(classes)}): {classes}")
    for split, (X, y, _) in data.items():
        print(f"{split}: X={X.shape} y={y.shape} counts={np.bincount(y, minlength=len(classes)).tolist()}")
