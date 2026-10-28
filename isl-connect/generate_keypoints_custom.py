"""Turn a custom raw-video dataset into the same on-disk keypoint format
generate_keypoints.py produces for INCLUDE, plus a matching label map and
train/val/test split -- so dataset.py's KeypointsDataset and the Transformer
can be reused completely unmodified.

Expects videos laid out as:

    <raw_root>/<signer>/<sign_name>/*.mp4   (or .mov/.MOV/.MP4)

e.g. raw_dataset/Hriday/Beautiful/001.mp4 -- one folder per signer, with one
folder per sign INSIDE it. process_video() (imported straight from
generate_keypoints.py, not reimplemented) derives the label from a video's
PARENT folder, alpha-chars-only + lowercased, so "Beautiful" -> "beautiful".
That's exactly the sign-name folder here, so no path juggling is needed.

Usage (run from include-ml):
    venv\\Scripts\\python.exe generate_keypoints_custom.py ^
        --raw_root raw_dataset ^
        --dataset myisl ^
        --save_dir custom_data

Then train with:
    venv\\Scripts\\python.exe finetune_custom.py --data_dir custom_data --dataset myisl
"""
import argparse
import json
import random
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
INCLUDE_ROOT = ROOT / "INCLUDE-master"
sys.path.insert(0, str(INCLUDE_ROOT))
from generate_keypoints import process_video  # noqa: E402

VIDEO_EXTS = {".mp4", ".mov", ".MP4", ".MOV", ".avi", ".AVI"}


def label_from_folder(folder_name):
    """Exactly process_video()'s label rule, so the label this script writes
    to the split summary always matches the label process_video() writes into
    each keypoint .json -- any mismatch here would silently misassign every
    video's ground-truth class."""
    return "".join(c for c in folder_name if c.isalpha()).lower()


def find_videos(raw_root):
    """Returns {label: [(signer, path), ...]} for every <raw_root>/<signer>/<sign>/*.<ext>."""
    by_label = defaultdict(list)
    raw_root = Path(raw_root)
    for signer_dir in sorted(p for p in raw_root.iterdir() if p.is_dir()):
        for sign_dir in sorted(p for p in signer_dir.iterdir() if p.is_dir()):
            label = label_from_folder(sign_dir.name)
            for video_path in sorted(sign_dir.iterdir()):
                if video_path.suffix in VIDEO_EXTS:
                    by_label[label].append((signer_dir.name, video_path))
    return by_label


def split_class_files(files, val_frac, test_frac, seed):
    """Stratified per-class split. With only a handful of signers/takes per
    class, a strict signer-held-out split (like INCLUDE's official one)
    would leave some classes with zero train examples -- so this mixes
    signers within a class instead. That means results measure how well the
    model recognizes THESE signers, not a held-out 5th person -- say so in
    the printed summary so it isn't mistaken for a generalization number."""
    rng = random.Random(seed)
    files = list(files)
    rng.shuffle(files)
    n = len(files)
    n_val = round(n * val_frac) if n >= 4 else 0
    n_test = round(n * test_frac) if n - n_val >= 3 else 0
    n_val = min(n_val, max(0, n - 1))
    n_test = min(n_test, max(0, n - n_val - 1))
    test = files[:n_test]
    val = files[n_test:n_test + n_val]
    train = files[n_test + n_val:]
    return train, val, test


def main():
    parser = argparse.ArgumentParser(description="Build a custom keypoints dataset for include-ml")
    parser.add_argument("--raw_root", required=True, type=Path,
                         help="<raw_root>/<signer>/<sign_name>/*.mp4")
    parser.add_argument("--dataset", required=True, type=str,
                         help="short name for this dataset, e.g. myisl -- used for the "
                              "label_maps/label_map_<dataset>.json file and the "
                              "<dataset>_{train,val,test}_keypoints folder names")
    parser.add_argument("--save_dir", default="custom_data", type=Path)
    parser.add_argument("--val_frac", type=float, default=0.15)
    parser.add_argument("--test_frac", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    by_label = find_videos(args.raw_root)
    if not by_label:
        raise SystemExit(f"No videos found under {args.raw_root} "
                          f"(expected <raw_root>/<signer>/<sign_name>/*.mp4)")

    label_map = {label: i for i, label in enumerate(sorted(by_label))}
    # Write alongside label_map_include.json (inside INCLUDE-master/label_maps/),
    # not the include-ml root, so it sits where the rest of the pipeline expects
    # a label map regardless of what directory a script happens to be run from.
    label_map_path = INCLUDE_ROOT / "label_maps" / f"label_map_{args.dataset}.json"
    label_map_path.parent.mkdir(exist_ok=True)
    with label_map_path.open("w", encoding="utf-8") as f:
        json.dump(label_map, f, indent=2)
    print(f"Wrote {label_map_path} with {len(label_map)} classes")

    splits = {"train": [], "val": [], "test": []}
    print(f"\n{'class':20s} {'n':>4s} {'train':>6s} {'val':>5s} {'test':>5s}  signers")
    for label, entries in sorted(by_label.items()):
        signers = sorted({signer for signer, _ in entries})
        train, val, test = split_class_files(entries, args.val_frac, args.test_frac, args.seed)
        splits["train"] += train
        splits["val"] += val
        splits["test"] += test
        print(f"{label:20s} {len(entries):4d} {len(train):6d} {len(val):5d} {len(test):5d}  {','.join(signers)}")
        if not val:
            print(f"  -> '{label}' has no val examples (too few takes) -- its accuracy won't be "
                  f"tracked during training, only at the end via test if it has any.")

    args.save_dir.mkdir(exist_ok=True)
    for mode, entries in splits.items():
        out_dir = args.save_dir / f"{args.dataset}_{mode}_keypoints"
        out_dir.mkdir(exist_ok=True)
        print(f"\nExtracting {len(entries)} {mode} videos -> {out_dir}")
        for i, (signer, path) in enumerate(entries, 1):
            # process_video() derives the label with path.split("/")[-2] --
            # forward slash only, even though it's meant to run cross-platform.
            # On Windows a plain str(Path) uses backslashes and that split
            # would silently break (single-element list, IndexError). Passing
            # the POSIX form sidesteps that without touching generate_keypoints.py.
            process_video(path.as_posix(), str(out_dir))
            if i % 10 == 0 or i == len(entries):
                print(f"  {i}/{len(entries)}")

    print("\nDone. Signer-mixed split (see note above) -- train with:")
    print(f"  python finetune_custom.py --data_dir {args.save_dir} --dataset {args.dataset}")


if __name__ == "__main__":
    main()