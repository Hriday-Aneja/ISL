from datasets import load_dataset
from pathlib import Path
import shutil

# Load INCLUDE dataset
ds = load_dataset("ai4bharat/INCLUDE")

# Our 4-class pilot
target_labels = {
    "Dog",
    "Bird",
    "Hello",
    "Thank you"
}

# This script is inside recognition-ml/src/
# Raw data is inside recognition-ml/data/raw/
raw_dir = Path("data/raw")
output_dir = Path("data/processed")

# Create output folders
for split in ["train", "val", "test"]:
    for label in target_labels:
        (output_dir / split / label).mkdir(
            parents=True,
            exist_ok=True
        )


for split in ["train", "val", "test"]:

    for item in ds[split]:

        label = item["label"]
        clean_label = label.split(". ", 1)[-1]

        # Only our 4 pilot classes
        if clean_label not in target_labels:
            continue

        # Only INCLUDE-50 samples
        if not item["include_50"]:
            continue

        # Example:
        # Animals/1. Dog/MVI_2978.MOV
        # Greetings/48. Hello/MVI_0029.MOV
        video_path = Path(item["video_path"])

        source = raw_dir / video_path

        destination = (
            output_dir
            / split
            / clean_label
            / video_path.name
        )

        if source.exists():
            shutil.copy2(source, destination)

        else:
            print("MISSING:", source)


print("\nDone!")