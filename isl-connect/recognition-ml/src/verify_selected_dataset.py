from pathlib import Path
import numpy as np

RAW_DIR = Path("data/raw_selected")
FEATURE_DIR = Path("data/features_selected")

VIDEO_EXTENSIONS = {".mov", ".mp4", ".avi", ".mkv"}

total_raw = 0
total_npy = 0

missing = []
extra = []
duplicates = []
wrong_shapes = []

classes = sorted(
    d.name for d in RAW_DIR.iterdir()
    if d.is_dir() and d.name not in {"train", "val", "test"}
)

for cls in classes:

    raw_dir = RAW_DIR / cls

    raw_stems = [
        f.stem
        for f in raw_dir.iterdir()
        if f.is_file() and f.suffix.lower() in VIDEO_EXTENSIONS
    ]

    # Collect features from train + val + test
    feature_files = []

    for split in ["train", "val", "test"]:
        split_dir = FEATURE_DIR / split / cls

        if split_dir.exists():
            feature_files.extend(
                f for f in split_dir.iterdir()
                if f.is_file() and f.suffix.lower() == ".npy"
            )

    feature_stems = [f.stem for f in feature_files]

    total_raw += len(raw_stems)
    total_npy += len(feature_files)

    # Missing
    for stem in sorted(set(raw_stems) - set(feature_stems)):
        missing.append(f"{cls}/{stem}")

    # Extra
    for stem in sorted(set(feature_stems) - set(raw_stems)):
        extra.append(f"{cls}/{stem}")

    # Duplicate stems
    seen = set()

    for stem in feature_stems:
        if stem in seen:
            duplicates.append(f"{cls}/{stem}")
        seen.add(stem)

    # Shape check
    for feature_file in feature_files:
        try:
            arr = np.load(feature_file)

            if arr.shape != (100, 225):
                wrong_shapes.append(
                    f"{cls}/{feature_file.name} -> {arr.shape}"
                )

        except Exception as e:
            wrong_shapes.append(
                f"{cls}/{feature_file.name} -> LOAD ERROR: {e}"
            )


print("\n==============================")
print("DATASET VERIFICATION REPORT")
print("==============================")

print(f"\nTotal raw videos : {total_raw}")
print(f"Total .npy files: {total_npy}")

print("\nMissing features:")
if missing:
    for x in missing:
        print("  ", x)
else:
    print("  None")

print("\nExtra features:")
if extra:
    for x in extra:
        print("  ", x)
else:
    print("  None")

print("\nDuplicate features:")
if duplicates:
    for x in duplicates:
        print("  ", x)
else:
    print("  None")

print("\nWrong shapes:")
if wrong_shapes:
    for x in wrong_shapes:
        print("  ", x)
else:
    print("  None")

print("\n==============================")

if (
    total_raw == total_npy
    and not missing
    and not extra
    and not duplicates
    and not wrong_shapes
):
    print("FINAL RESULT: PASS")
    print("All raw videos have exactly one valid (100, 225) feature.")
else:
    print("FINAL RESULT: FAIL")

print("==============================")