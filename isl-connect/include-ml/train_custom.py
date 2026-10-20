"""Train the ORIGINAL INCLUDE Transformer FROM RANDOM INITIALISATION on our own
four-signer keypoints.

- Model: INCLUDE-master models.Transformer + configs.TransformerConfig (via the
  DeterministicEvalTransformer subclass in custom_model.py, same parameters).
- Data: INCLUDE-master dataset.KeypointsDataset, unmodified, reading the JSON
  files from extract_keypoints_custom.py / make_splits_custom.py.
- No pretrained weights: this script never calls torch.load before training and
  has no option to. Only our own best checkpoint is written, at the end.
- Optimiser/scheduler/loss follow train_nn.py (AdamW wd=0.01, ReduceLROnPlateau
  mode=max factor=0.2, cross-entropy, lr 1e-4). Own loop only because train_nn.fit()
  hardcodes 50/263 classes, 169 frames, the pretrained loader, and EarlyStopping
  (np.Inf breaks on NumPy 2) and cannot store label names in the checkpoint.

Usage (from include-ml):
    python train_custom.py --epochs 200
"""
import argparse
import csv
import time
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from torch.utils import data

from custom_common import (DEFAULT_DATA_DIR, DEFAULT_MODEL_DIR, FRAME_HEIGHT, FRAME_WIDTH, INCLUDE_ROOT,
                           MAX_POSITION_EMBEDDINGS, PREPROCESSING_VERSION, read_json, signer_from_uid, write_json)
from custom_model import build_model, crop_collate, load_checkpoint, predict_loader, summarize
from dataset import KeypointsDataset  # INCLUDE-master
from utils import AverageMeter, seed_everything  # INCLUDE-master


def parse_args():
    p = argparse.ArgumentParser(description="Train the INCLUDE Transformer from scratch on custom keypoints")
    p.add_argument("--data_dir", type=Path, default=DEFAULT_DATA_DIR)
    p.add_argument("--dataset", default="custom")
    p.add_argument("--save_dir", type=Path, default=DEFAULT_MODEL_DIR)
    p.add_argument("--size", choices=["small", "large"], default="small",
                   help="TransformerConfig size. small = 2 layers/256 hidden (right for this little data)")
    p.add_argument("--epochs", type=int, default=200)
    p.add_argument("--batch_size", type=int, default=16, help="repo default 128 would be ~1 step/epoch here")
    p.add_argument("--lr", type=float, default=1e-4, help="repo default")
    p.add_argument("--weight_decay", type=float, default=0.01, help="repo default")
    p.add_argument("--patience", type=int, default=30, help="epochs without val improvement before stopping")
    p.add_argument("--label_smoothing", type=float, default=0.0)
    p.add_argument("--no_augs", action="store_true", help="disable dataset.py's augmentations (on by default: tiny data)")
    p.add_argument("--max_frame_len", type=int, default=None, help="default: from dataset_meta.json")
    p.add_argument("--num_workers", type=int, default=0, help="0 is safest on Windows")
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--device", choices=["auto", "cpu", "cuda"], default="auto")
    return p.parse_args()


def main():
    args = parse_args()
    seed_everything(args.seed)
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu") if args.device == "auto" else torch.device(args.device)
    meta_ds = read_json(args.data_dir / "dataset_meta.json")
    labels = meta_ds["classes"]
    label_map = read_json(INCLUDE_ROOT / "label_maps" / f"label_map_{args.dataset}.json")
    if [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])] != labels:
        raise SystemExit("label map on disk does not match dataset_meta.json - re-run make_splits_custom.py")
    max_len = args.max_frame_len or meta_ds["max_frame_len"]
    if max_len > MAX_POSITION_EMBEDDINGS:
        raise SystemExit(f"max_frame_len {max_len} exceeds the Transformer limit {MAX_POSITION_EMBEDDINGS}")
    internal_len = max_len + max_len // 5 + 8  # headroom so augment.upsample cannot overflow np.pad
    use_augs = not args.no_augs

    def dataset_for(split, augs):
        return KeypointsDataset(keypoints_dir=str(args.data_dir / f"{args.dataset}_{split}_keypoints"),
                                use_augs=augs, label_map=label_map, mode="train" if augs else "val",
                                max_frame_len=internal_len, frame_length=FRAME_HEIGHT, frame_width=FRAME_WIDTH)

    train_ds, val_ds = dataset_for("train", use_augs), dataset_for("val", False)
    test_ds, train_eval_ds = dataset_for("test", False), dataset_for("train", False)
    print(f"device={device}  classes={len(labels)}  max_frame_len={max_len}  augmentations={'on' if use_augs else 'off'}")
    print(f"clips: train={len(train_ds)} val={len(val_ds)} test={len(test_ds)}   split mode: {meta_ds['mode']}")
    if len(train_ds) == 0 or len(val_ds) == 0:
        raise SystemExit("need at least one train and one val clip (see split_report.txt)")

    collate = crop_collate(max_len)
    mk = lambda ds, shuffle: data.DataLoader(ds, batch_size=args.batch_size, shuffle=shuffle, num_workers=args.num_workers,
                                             pin_memory=(device.type == "cuda"), collate_fn=collate, drop_last=False)
    train_loader, val_loader = mk(train_ds, True), mk(val_ds, False)

    model = build_model(args.size, len(labels), device)  # random init; nothing is loaded
    n_params = sum(p.numel() for p in model.parameters())
    print(f"Transformer({args.size}) initialised from RANDOM weights: {n_params:,} parameters, no checkpoint loaded")
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=args.weight_decay)
    scheduler = torch.optim.lr_scheduler.ReduceLROnPlateau(optimizer, mode="max", factor=0.2)

    args.save_dir.mkdir(parents=True, exist_ok=True)
    best_path = args.save_dir / "custom_best.pth"
    ckpt_meta = {"custom": True, "trained_from_scratch": True, "labels": labels, "n_classes": len(labels),
                 "transformer_size": args.size, "max_position_embeddings": MAX_POSITION_EMBEDDINGS,
                 "input_size": 134, "max_frame_len": int(max_len), "frame_width": FRAME_WIDTH, "frame_height": FRAME_HEIGHT,
                 "flip_horizontal": bool(meta_ds["flip_horizontal"]), "train_fps": float(meta_ds["train_fps"]),
                 "target_fps": float(meta_ds["target_fps"]), "split_mode": meta_ds["mode"],
                 "preprocessing_version": meta_ds.get("preprocessing_version", PREPROCESSING_VERSION),
                 "keypoints_source": meta_ds.get("keypoints_source", "unknown"),
                 "counts": meta_ds["counts"], "seed": int(args.seed), "augmentations": bool(use_augs),
                 "deterministic_eval_dropout": True}

    best, best_epoch, stale, history = (-1.0, float("inf")), 0, 0, []
    for epoch in range(1, args.epochs + 1):
        t0 = time.time()
        model.train()
        tl, correct, seen = AverageMeter(), 0, 0
        for batch in train_loader:
            x, y = batch["data"].to(device), batch["label"].to(device)
            optimizer.zero_grad()
            logits = model(x, attention_mask=batch["attention_mask"].to(device))
            loss = F.cross_entropy(logits, y, label_smoothing=args.label_smoothing)
            loss.backward()
            optimizer.step()
            tl.update(loss.item(), len(y))
            correct += int((logits.argmax(1) == y).sum())
            seen += len(y)
        model.eval()
        vl, vcorrect, vseen = AverageMeter(), 0, 0
        with torch.no_grad():
            for batch in val_loader:
                x, y = batch["data"].to(device), batch["label"].to(device)
                logits = model(x, attention_mask=batch["attention_mask"].to(device))
                vl.update(F.cross_entropy(logits, y).item(), len(y))
                vcorrect += int((logits.argmax(1) == y).sum())
                vseen += len(y)
        val_acc, val_loss = vcorrect / vseen, vl.avg
        scheduler.step(val_acc)
        history.append([epoch, tl.avg, correct / seen, val_loss, val_acc, optimizer.param_groups[0]["lr"]])
        improved = (val_acc, -val_loss) > (best[0], -best[1])
        if improved:
            best, best_epoch, stale = (val_acc, val_loss), epoch, 0
            torch.save({"model": model.state_dict(), "optimizer": optimizer.state_dict(),
                        "scheduler": scheduler.state_dict(), "score": float(val_acc), "epoch": epoch,
                        "meta": ckpt_meta}, best_path)
        else:
            stale += 1
        print(f"epoch {epoch:3d}/{args.epochs}  train loss {tl.avg:.4f} acc {correct / seen:.3f} | "
              f"val loss {val_loss:.4f} acc {val_acc:.3f}{'  * saved' if improved else ''}  ({time.time() - t0:.1f}s)")
        if stale >= args.patience:
            print(f"Early stopping: no val improvement for {args.patience} epochs")
            break

    with open(args.save_dir / "training_history.csv", "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["epoch", "train_loss", "train_acc_aug_dropout_on", "val_loss", "val_acc", "lr"])
        w.writerows(history)

    # ---- final evaluation of the saved best checkpoint (also exercises the loader live_inference uses) ----
    model, _ = load_checkpoint(best_path, device)
    results, texts = {"best_epoch": best_epoch, "seed": args.seed, "split_mode": meta_ds["mode"]}, []
    for name, ds in (("train (eval mode, no augs)", train_eval_ds), ("val", val_ds), ("test", test_ds)):
        if len(ds) == 0:
            texts.append(f"=== {name} ===\nno clips in this split")
            continue
        uids, y_true, probs = predict_loader(model, mk(ds, False), device)
        text, res, conf = summarize(uids, y_true, probs, labels, name, signer_of=signer_from_uid)
        texts.append(text)
        key = name.split()[0]
        results[key] = res
        np.savetxt(args.save_dir / f"confusion_{key}.csv", conf, fmt="%d", delimiter=",",
                   header=",".join(labels), comments="")
    report = "\n\n".join(texts)
    print("\n" + report)
    caveat = (f"\nHow to read this: best epoch {best_epoch} was CHOSEN by val accuracy, so val is optimistically biased; "
              f"test was not used for any decision. Splits ('{meta_ds['mode']}' mode) come from 4 signers, so test "
              f"numbers are noisy and say nothing about people outside this group.")
    print(caveat)
    write_json(args.save_dir / "results.json", results)
    (args.save_dir / "results.txt").write_text(report + "\n" + caveat, encoding="utf-8")
    print(f"\nBest checkpoint: {best_path}\nlive:  python live_inference.py   (loads it and its labels automatically)")


if __name__ == "__main__":
    main()
