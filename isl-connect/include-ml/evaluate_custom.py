"""Evaluate a custom checkpoint on one split (default: test).

Reports top-1/top-3 accuracy, per-class recall, per-signer accuracy, the
confusion matrix (CSV) and every misclassified clip. Labels, clip length and
class count all come from the checkpoint, nothing is hardcoded.

Usage (from include-ml):
    python evaluate_custom.py --split test
"""
import argparse
from pathlib import Path

import numpy as np
import torch
from torch.utils import data

from custom_common import (DEFAULT_CHECKPOINT, DEFAULT_DATA_DIR, FRAME_HEIGHT, FRAME_WIDTH, signer_from_uid)
from custom_model import crop_collate, load_checkpoint, predict_loader, summarize
from dataset import KeypointsDataset  # INCLUDE-master


def main():
    p = argparse.ArgumentParser(description="Evaluate a train_custom.py checkpoint")
    p.add_argument("--checkpoint", type=Path, default=DEFAULT_CHECKPOINT)
    p.add_argument("--data_dir", type=Path, default=DEFAULT_DATA_DIR)
    p.add_argument("--dataset", default="custom")
    p.add_argument("--split", choices=["train", "val", "test"], default="test")
    p.add_argument("--batch_size", type=int, default=16)
    p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    args = p.parse_args()
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else torch.device(args.device)

    model, meta = load_checkpoint(args.checkpoint, device)
    labels = meta["labels"]
    max_len = int(meta["max_frame_len"])
    ds = KeypointsDataset(keypoints_dir=str(args.data_dir / f"{args.dataset}_{args.split}_keypoints"), use_augs=False,
                          label_map={l: i for i, l in enumerate(labels)}, mode="val",
                          max_frame_len=max_len + max_len // 5 + 8, frame_length=FRAME_HEIGHT, frame_width=FRAME_WIDTH)
    if len(ds) == 0:
        raise SystemExit(f"no clips in {args.split} split")
    loader = data.DataLoader(ds, batch_size=args.batch_size, shuffle=False, num_workers=0, collate_fn=crop_collate(max_len))
    uids, y_true, probs = predict_loader(model, loader, device)
    text, res, conf = summarize(uids, y_true, probs, labels, f"{args.split} split, {args.checkpoint.name}",
                                signer_of=signer_from_uid)
    print(text)
    wrong = [(u, labels[t], labels[q], probs[i, q]) for i, (u, t, q) in enumerate(zip(uids, y_true, probs.argmax(1))) if t != q]
    if wrong:
        print(f"\nmisclassified clips ({len(wrong)}):")
        for u, t, q, c in wrong:
            print(f"  {u:48s} true={t:14s} pred={q:14s} conf={c:.2f}")
    out = args.checkpoint.parent / f"confusion_{args.split}_eval.csv"
    np.savetxt(out, conf, fmt="%d", delimiter=",", header=",".join(labels), comments="")
    print(f"\nconfusion matrix (rows=true, cols=pred): {out}")


if __name__ == "__main__":
    main()
