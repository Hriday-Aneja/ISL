"""Build leakage-aware train/val/test splits and the custom label map.

Reads custom_data/manifest.csv (from extract_keypoints_custom.py) and writes:
    custom_data/<dataset>_{train,val,test}_keypoints/*.json   (copies; these dirs are wiped first)
    INCLUDE-master/label_maps/label_map_<dataset>.json        (original repo location/format)
    custom_data/label_map_<dataset>.json, splits.csv, split_report.txt, dataset_meta.json

Why the unit of assignment is not "a clip": several takes of one sign by one
person are near-duplicates of each other (same session, same pose, same
lighting). Putting some in train and some in test measures memorisation of that
session, not recognition. Modes:

  group  (default)  the unit is (signer, sign): ALL takes of a sign by one
                    signer go to the same split. For each sign the signers are
                    rotated through test / val / train roles (Latin-square, so
                    each signer is test/val equally often). Every sign appears
                    in every split, from different people. The test signer has
                    never been trained on THAT sign, though the model has seen
                    that person on other signs.
  signer            the unit is a whole person (--val_signers / --test_signers).
                    Strictest, but leaves only 2 training signers with 4 people.
                    Run it 4 times with different holdouts for a leave-one-signer-
                    out estimate.
  take              within each (signer, sign) the takes are cut into contiguous
                    blocks in file-name order with --take_gap takes discarded
                    between blocks. Signer-DEPENDENT and optimistic: use only to
                    gauge a personal model, never as a generalisation number.

Usage:
    python make_splits_custom.py                       # group mode
    python make_splits_custom.py --mode signer --val_signers Arnav --test_signers Aayush
"""
import argparse
import math
import re
import shutil
from pathlib import Path

import pandas as pd

from custom_common import (CORRECTED_KEYPOINTS_DIRNAME, DEFAULT_DATA_DIR, INCLUDE_ROOT,
                           MAX_POSITION_EMBEDDINGS, PREPROCESSING_VERSION, read_json, write_json)


def parse_args():
    p = argparse.ArgumentParser(description="Create leakage-aware splits + label map")
    p.add_argument("--data_dir", type=Path, default=DEFAULT_DATA_DIR)
    p.add_argument("--dataset", default="custom", help="name used in <dataset>_{split}_keypoints and label_map_<dataset>.json")
    p.add_argument("--mode", choices=["group", "signer", "take"], default="group")
    p.add_argument("--val_signers", nargs="*", default=[])
    p.add_argument("--test_signers", nargs="*", default=[])
    p.add_argument("--take_gap", type=int, default=1, help="take mode: takes discarded between blocks")
    p.add_argument("--min_pose_rate", type=float, default=0.5, help="drop clips with pose found in fewer frames")
    p.add_argument("--min_any_hand_rate", type=float, default=0.1, help="drop clips where no hand is ever found")
    p.add_argument("--recompute_membership", action="store_true",
                   help="ignore an existing splits.csv and recompute the split assignment")
    return p.parse_args()


def natural_key(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]


def assign_group(df):
    signers = sorted(df.signer.unique())
    split = {}
    for i, label in enumerate(sorted(df.label.unique())):
        avail = [s for s in signers if ((df.label == label) & (df.signer == s)).any()]
        off = i % len(avail)
        rot = avail[off:] + avail[:off]
        if len(avail) >= 3:
            roles = {rot[0]: "test", rot[1]: "val", **{s: "train" for s in rot[2:]}}
        elif len(avail) == 2:
            roles = {rot[0]: "test", rot[1]: "train"}
        else:
            roles = {rot[0]: "train"}
        for s, role in roles.items():
            split[(s, label)] = role
    return df.apply(lambda r: split[(r.signer, r.label)], axis=1)


def assign_signer(df, val_signers, test_signers):
    low = {s.lower() for s in df.signer.unique()}
    for s in list(val_signers) + list(test_signers):
        if s.lower() not in low:
            raise SystemExit(f"unknown signer '{s}'. Known: {sorted(df.signer.unique())}")
    v, t = {s.lower() for s in val_signers}, {s.lower() for s in test_signers}
    if v & t:
        raise SystemExit("a signer cannot be both val and test")
    if not t:
        raise SystemExit("--mode signer needs --test_signers (and normally --val_signers)")
    return df.signer.map(lambda s: "test" if s.lower() in t else ("val" if s.lower() in v else "train"))


def assign_take(df, gap):
    out = pd.Series("drop", index=df.index)
    fallback = []
    for (_, _), g in df.groupby(["signer", "label"]):
        g = g.assign(k=g.source_path.map(lambda p: natural_key(Path(p).name))).sort_values("k")
        idx, n = list(g.index), len(g)
        if n < 4:
            out.loc[idx] = "train"
            fallback.append(f"{g.signer.iloc[0]}/{g.label.iloc[0]}({n})")
            continue
        n_test = max(1, round(0.15 * n))
        n_val = max(1, round(0.15 * n))
        n_train = n - n_test - n_val - 2 * gap
        if n_train < 1:
            out.loc[idx] = "train"
            fallback.append(f"{g.signer.iloc[0]}/{g.label.iloc[0]}({n})")
            continue
        out.loc[idx[:n_train]] = "train"
        out.loc[idx[n_train + gap:n_train + gap + n_val]] = "val"
        out.loc[idx[n - n_test:]] = "test"
    if fallback:
        print(f"NOTE: {len(fallback)} (signer, sign) groups have too few takes for train+gap+val+gap+test "
              f"(need >= {2 + 2 * gap + 1}) and went entirely to train: {fallback[:8]}{' ...' if len(fallback) > 8 else ''}")
    return out


def reuse_existing_membership(df, splits_path):
    existing = pd.read_csv(splits_path, keep_default_na=False)
    required = {"uid", "signer", "label", "split", "source_path"}
    missing = required - set(existing.columns)
    if missing:
        raise SystemExit(f"cannot safely reuse {splits_path}: missing columns {sorted(missing)}")
    if existing.uid.duplicated().any():
        raise SystemExit(f"cannot safely reuse {splits_path}: duplicate UIDs")
    if not set(existing.split).issubset({"train", "val", "test"}):
        raise SystemExit(f"cannot safely reuse {splits_path}: invalid split name")
    manifest_by_uid = df.set_index("uid")
    unknown = sorted(set(existing.uid) - set(manifest_by_uid.index))
    if unknown:
        raise SystemExit(f"cannot safely reuse {splits_path}: UIDs absent from manifest: {unknown[:6]}")
    for _, row in existing.iterrows():
        manifest_row = manifest_by_uid.loc[row.uid]
        for field in ("signer", "label", "source_path"):
            if str(manifest_row[field]) != str(row[field]):
                raise SystemExit(f"cannot safely reuse {splits_path}: {field} changed for {row.uid}")
    if set(existing.uid) != set(df.uid):
        missing = sorted(set(df.uid) - set(existing.uid))
        raise SystemExit(f"cannot safely reuse {splits_path}: membership does not cover filtered manifest; missing {missing[:6]}")
    assignments = existing.set_index("uid")["split"]
    return df.assign(split=df.uid.map(assignments))


def main():
    args = parse_args()
    manifest = args.data_dir / "manifest.csv"
    if not manifest.is_file():
        raise SystemExit(f"{manifest} not found - run extract_keypoints_custom.py first")
    df = pd.read_csv(manifest, keep_default_na=False)
    lines = []

    def say(s=""):
        print(s)
        lines.append(s)

    n0 = len(df)
    reasons = {}
    keep = pd.Series(True, index=df.index)
    for name, bad in [("unreadable", df.status != "ok"), ("byte-identical duplicate", df.dup_of != ""),
                      (f"pose found in <{args.min_pose_rate:.0%} of frames", df.pose_rate.astype(float) < args.min_pose_rate),
                      (f"hands found in <{args.min_any_hand_rate:.0%} of frames", df.any_hand_rate.astype(float) < args.min_any_hand_rate)]:
        hit = keep & bad
        if hit.any():
            reasons[name] = list(df.uid[hit])
            keep &= ~bad
    df = df[keep].copy()
    say(f"manifest rows: {n0}   kept: {len(df)}")
    for k, v in reasons.items():
        say(f"  dropped {len(v)} ({k}): {v[:6]}{' ...' if len(v) > 6 else ''}")

    existing_splits = args.data_dir / "splits.csv"
    if existing_splits.is_file() and not args.recompute_membership:
        existing_meta_path = args.data_dir / "dataset_meta.json"
        if existing_meta_path.is_file():
            existing_meta = read_json(existing_meta_path)
            if existing_meta.get("mode") != args.mode:
                raise SystemExit(f"{existing_splits} was created with mode={existing_meta.get('mode')}; "
                                 f"use --recompute_membership to request mode={args.mode}")
            if existing_meta.get("val_signers", []) != args.val_signers or existing_meta.get("test_signers", []) != args.test_signers:
                raise SystemExit(f"{existing_splits} signer holdouts do not match the requested split configuration; "
                                 "use --recompute_membership to change them")
        df = reuse_existing_membership(df, existing_splits)
        say(f"reused existing split membership from {existing_splits}")
    elif args.mode == "group":
        df["split"] = assign_group(df)
    elif args.mode == "signer":
        df["split"] = assign_signer(df, args.val_signers, args.test_signers)
    else:
        df["split"] = assign_take(df, args.take_gap)
        say("WARNING: take mode is signer-dependent (same people in train and test). "
            "Not a generalisation estimate.")
    df = df[df.split != "drop"]

    no_train = [l for l in sorted(df.label.unique()) if not ((df.label == l) & (df.split == "train")).any()]
    if no_train:
        say(f"WARNING: signs with no training clip under this split were removed entirely: {no_train}")
        df = df[~df.label.isin(no_train)]
    labels = sorted(df.label.unique())
    label_map = {l: i for i, l in enumerate(labels)}

    # ---- leakage checks -------------------------------------------------
    assert df.groupby("sha1").split.nunique().max() == 1, "identical file in two splits"
    if args.mode in ("group", "signer"):
        assert df.groupby(["signer", "label"]).split.nunique().max() == 1, "a (signer, sign) group straddles splits"
    if args.mode == "signer":
        assert df.groupby("signer").split.nunique().max() == 1, "a signer straddles splits"
    say("leakage checks passed: no duplicate file across splits" +
        ("; no (signer, sign) group across splits" if args.mode != "take" else "") +
        ("; no signer across splits" if args.mode == "signer" else ""))

    say(f"\nmode={args.mode}   classes={len(labels)}")
    say(f"{'sign':18s} {'train':>5s} {'val':>4s} {'test':>4s}   train signers | val | test")
    for l in labels:
        sub = df[df.label == l]
        cnt = [int((sub.split == s).sum()) for s in ("train", "val", "test")]
        who = [",".join(sorted(sub[sub.split == s].signer.unique())) or "-" for s in ("train", "val", "test")]
        say(f"{l:18s} {cnt[0]:5d} {cnt[1]:4d} {cnt[2]:4d}   {who[0]} | {who[1]} | {who[2]}")
    totals = df.split.value_counts().to_dict()
    say(f"\nclips  train={totals.get('train', 0)}  val={totals.get('val', 0)}  test={totals.get('test', 0)}")
    for s in ("val", "test"):
        missing = [l for l in labels if not ((df.label == l) & (df.split == s)).any()]
        if missing:
            say(f"WARNING: {len(missing)} signs have no {s} clip (cannot be evaluated there): {missing}")
        if totals.get(s, 0) < 3 * len(labels):
            say(f"WARNING: only {totals.get(s, 0)} {s} clips for {len(labels)} classes -> accuracy on this split is "
                f"very noisy; one clip moves it by {100 / max(totals.get(s, 0), 1):.1f} points.")

    # Resolve every selected manifest row to the corrected JSON before any output is removed.
    corrected_dir = args.data_dir / CORRECTED_KEYPOINTS_DIRNAME
    if not corrected_dir.is_dir():
        raise SystemExit(f"corrected keypoints directory not found: {corrected_dir}")
    corrected_paths = {}
    for _, row in df.iterrows():
        path = corrected_dir / f"{row.uid}.json"
        if not path.is_file():
            raise SystemExit(f"corrected JSON missing for {row.uid}: {path}")
        payload = read_json(path)
        if payload.get("uid") != row.uid or payload.get("x_aspect_corrected") is not True:
            raise SystemExit(f"corrected JSON metadata invalid for {row.uid}: {path}")
        corrected_paths[row.uid] = path
    df["corrected_json_path"] = df.uid.map(corrected_paths)

    # ---- write splits ---------------------------------------------------
    for s in ("train", "val", "test"):
        d = args.data_dir / f"{args.dataset}_{s}_keypoints"
        if d.exists():
            shutil.rmtree(d)  # never leave stale files from a previous split behind
        d.mkdir(parents=True)
        for _, r in df[df.split == s].iterrows():
            shutil.copy(r.corrected_json_path, d / Path(r.corrected_json_path).name)
    df[["uid", "signer", "label", "split", "n_frames", "fps_effective", "source_path"]].to_csv(
        args.data_dir / "splits.csv", index=False)
    write_json(INCLUDE_ROOT / "label_maps" / f"label_map_{args.dataset}.json", label_map)
    write_json(args.data_dir / f"label_map_{args.dataset}.json", label_map)

    ext = read_json(args.data_dir / "extraction_meta.json")
    max_frames = int(df.n_frames.max())
    if max_frames > MAX_POSITION_EMBEDDINGS:
        raise SystemExit(f"longest clip is {max_frames} frames > {MAX_POSITION_EMBEDDINGS}; "
                         f"re-extract with a lower --target_fps or trim it")
    fps_vals = sorted(df.fps_effective.astype(float))
    meta = {"dataset": args.dataset, "mode": args.mode, "classes": labels, "n_classes": len(labels),
            "counts": {s: int(totals.get(s, 0)) for s in ("train", "val", "test")},
            "max_frames": max_frames, "max_frame_len": min(MAX_POSITION_EMBEDDINGS, math.ceil(max_frames * 1.1)),
            "train_fps": round(fps_vals[len(fps_vals) // 2], 2),
            "flip_horizontal": ext["flip_horizontal"], "target_fps": ext["target_fps"],
            "preprocessing_version": PREPROCESSING_VERSION,
            "keypoints_source": CORRECTED_KEYPOINTS_DIRNAME,
            "val_signers": args.val_signers, "test_signers": args.test_signers}
    write_json(args.data_dir / "dataset_meta.json", meta)
    (args.data_dir / "split_report.txt").write_text("\n".join(lines), encoding="utf-8")
    say(f"\nmax_frame_len for training = {meta['max_frame_len']} (longest clip {max_frames}), "
        f"train_fps = {meta['train_fps']}, flip_horizontal = {meta['flip_horizontal']}")
    say(f"label map: {INCLUDE_ROOT / 'label_maps' / f'label_map_{args.dataset}.json'}")


if __name__ == "__main__":
    main()
