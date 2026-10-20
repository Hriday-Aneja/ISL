#!/usr/bin/env python3
"""Aspect-ratio correction of stored MediaPipe keypoints (x only).

WHY
    MediaPipe landmarks are stored as x/width and y/height. INCLUDE's
    KeypointsDataset then multiplies every clip's x by 1920 and y by 1080, so a
    4:3 clip (640x480) ends up horizontally stretched by 4/3 relative to a 16:9
    clip (1280x720). Scaling each clip's x by its own aspect ratio, relative to
    16:9, puts all clips in the same isotropic space (1 x-unit == 1 y-unit):

        x_corrected = x_original * ((width / height) / (16 / 9))

    16:9 clips are left numerically unchanged (factor 1.0); 4:3 clips get 0.75.

WHAT IT DOES
    Reads  <in_dir>/*.json                 (one file per video, as written by
                                            extract_keypoints_custom.py)
    Writes <out_dir>/<same file name>      (corrected copy)
           <out_dir>/aspect_correction_log.csv
    - Only the values inside pose_x, hand1_x, hand2_x change, and only the
      non-NaN ones. y arrays, NaNs, n_frames, width, height and every other key
      are carried over untouched (width/height keep describing the SOURCE video).
    - Adds  "x_aspect_corrected": true  and an  "x_aspect_correction"  record
      (factor, width, height, where the dimensions came from, formula).
    - Never writes into in_dir. Refuses in_dir == out_dir, nested dirs, and a
      non-empty out_dir (unless --overwrite, which removes only *.json, *.tmp
      and the log previously written there).
    - Refuses any input already carrying x_aspect_corrected=true, so running it
      on its own output cannot correct twice.
    - Plans everything in memory first. If ANY file is unreadable/malformed or
      lacks usable dimensions the run aborts before writing anything, unless
      --allow_skips is given (then good files are written, bad ones listed).
    - After writing, re-reads input and output from disk and validates counts,
      shapes, NaN preservation, unchanged y/metadata, and the x formula.

USAGE (from include-ml)
    python correct_keypoint_aspect.py --dry_run
    python correct_keypoint_aspect.py
    python correct_keypoint_aspect.py --validate_only      # re-check an existing out_dir

This script does not touch training, model, split or live-inference code.
"""
import argparse
import csv
import json
import math
import os
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
DEFAULT_IN = ROOT / "custom_data" / "keypoints_all"
DEFAULT_OUT = ROOT / "custom_data" / "keypoints_all_aspect_corrected"

SCRIPT_NAME = "correct_keypoint_aspect.py"
SCRIPT_VERSION = 1
FORMULA = "x_corrected = x_original * ((width / height) / (16 / 9))"
REFERENCE_ASPECT = 16 / 9

FLAG = "x_aspect_corrected"
INFO = "x_aspect_correction"
LOG_NAME = "aspect_correction_log.csv"

# per-frame row length of each landmark group, exactly as extract_one writes them
GROUPS = {"pose": 25, "hand1": 21, "hand2": 21}
X_KEYS = tuple(f"{g}_x" for g in GROUPS)
Y_KEYS = tuple(f"{g}_y" for g in GROUPS)
REQUIRED_KEYS = X_KEYS + Y_KEYS + ("n_frames",)
LOG_FIELDS = ["file", "status", "reason", "width", "height", "dimension_source", "aspect", "factor",
              "n_frames", "x_valid", "x_nan"]


class Skip(Exception):
    """A file cannot be corrected safely; the message is the reason."""


# ----------------------------------------------------------------------------- helpers
def is_num(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool)


def valid_cell(v):
    """A finite number or NaN. None, strings, bools and +/-inf are malformed."""
    return is_num(v) and not math.isinf(v)


def deep_equal(a, b):
    """== that treats NaN as equal to NaN, recursively."""
    if isinstance(a, float) and isinstance(b, float):
        return a == b or (math.isnan(a) and math.isnan(b))
    if isinstance(a, dict) and isinstance(b, dict):
        return a.keys() == b.keys() and all(deep_equal(a[k], b[k]) for k in a)
    if isinstance(a, list) and isinstance(b, list):
        return len(a) == len(b) and all(deep_equal(x, y) for x, y in zip(a, b))
    return a == b


def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)  # accepts the bare NaN tokens json.dump wrote


def snapshot(directory):
    return {p.name: (p.stat().st_size, p.stat().st_mtime_ns) for p in sorted(directory.iterdir()) if p.is_file()}


def load_manifest_dims(path):
    """uid -> (width, height) from manifest.csv; only used when a JSON lacks usable dimensions."""
    dims = {}
    with open(path, "r", newline="", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            try:
                w, h = float(row["width"]), float(row["height"])
            except (KeyError, TypeError, ValueError):
                continue
            if math.isfinite(w) and math.isfinite(h) and w > 0 and h > 0:
                dims[row.get("uid", "")] = (int(w) if w == int(w) else w, int(h) if h == int(h) else h)
    return dims


def read_dims(d, uid, manifest_dims):
    w, h = d.get("width"), d.get("height")
    if is_num(w) and is_num(h) and math.isfinite(w) and math.isfinite(h) and w > 0 and h > 0:
        return w, h, "json"
    if manifest_dims and uid in manifest_dims:
        w, h = manifest_dims[uid]
        return w, h, "manifest"
    raise Skip(f"missing or invalid width/height (width={w!r}, height={h!r}); "
               f"pass --manifest to take dimensions from manifest.csv")


def check_grid(d, key, n_frames, row_len):
    grid = d[key]
    if not isinstance(grid, list) or len(grid) != n_frames:
        got = len(grid) if isinstance(grid, list) else type(grid).__name__
        raise Skip(f"'{key}' is not a list of n_frames={n_frames} rows (got {got})")
    for t, row in enumerate(grid):
        if not isinstance(row, list) or len(row) != row_len:
            raise Skip(f"'{key}' row {t} is not a list of {row_len} values")
        for v in row:
            if not valid_cell(v):
                raise Skip(f"'{key}' row {t} contains a non-numeric/infinite value: {v!r}")


def correct_grid(grid, factor):
    # NaN is returned as-is (same value), every other x is multiplied once.
    return [[v if math.isnan(v) else v * factor for v in row] for row in grid]


# ----------------------------------------------------------------------------- planning
def build_corrected(d, uid, manifest_dims, rec):
    if not isinstance(d, dict):
        raise Skip("top-level JSON value is not an object")
    if d.get(FLAG) is True:
        raise Skip(f"already corrected ({FLAG}=true); refusing to correct twice")
    if INFO in d:
        raise Skip(f"has a '{INFO}' record but no {FLAG}=true flag; inconsistent, refusing to touch")
    missing = [k for k in REQUIRED_KEYS if k not in d]
    if missing:
        raise Skip(f"missing required keys: {missing}")
    n_frames = d["n_frames"]
    if not is_num(n_frames) or n_frames != int(n_frames) or n_frames <= 0:
        raise Skip(f"n_frames is not a positive integer: {n_frames!r}")
    n_frames = int(n_frames)
    for g, row_len in GROUPS.items():
        check_grid(d, f"{g}_x", n_frames, row_len)
        check_grid(d, f"{g}_y", n_frames, row_len)
    w, h, src = read_dims(d, uid, manifest_dims)
    factor = (w / h) / (16 / 9)
    rec.update(width=w, height=h, dimension_source=src, aspect=round(w / h, 6), factor=factor, n_frames=n_frames)

    out = dict(d)  # shallow copy keeps key order; only the three x entries are replaced below
    n_valid = n_nan = 0
    x_in, x_out = [], []
    for k in X_KEYS:
        out[k] = correct_grid(d[k], factor)
        a = np.asarray(d[k], dtype=float)
        n_nan += int(np.isnan(a).sum())
        n_valid += int((~np.isnan(a)).sum())
        x_in.append(a[~np.isnan(a)])
        x_out.append(np.asarray(out[k], dtype=float)[~np.isnan(a)])
    x_in, x_out = np.concatenate(x_in), np.concatenate(x_out)
    rec.update(x_valid=n_valid, x_nan=n_nan,
               _xmin_in=float(x_in.min()) if n_valid else None, _xmax_in=float(x_in.max()) if n_valid else None,
               _xmin_out=float(x_out.min()) if n_valid else None, _xmax_out=float(x_out.max()) if n_valid else None)
    out[FLAG] = True
    out[INFO] = {"applied": True, "formula": FORMULA, "reference_aspect": "16:9", "source_width": w,
                 "source_height": h, "dimension_source": src, "factor": factor, "applied_to": list(X_KEYS),
                 "script": SCRIPT_NAME, "script_version": SCRIPT_VERSION}
    return out


def plan_file(path, manifest_dims):
    rec = {"file": path.name, "status": "skipped", "reason": ""}
    try:
        d = load_json(path)
    except (OSError, UnicodeDecodeError, ValueError, RecursionError) as e:
        rec["reason"] = f"unreadable or malformed JSON: {type(e).__name__}: {str(e)[:120]}"
        return rec, None
    try:
        out = build_corrected(d, path.stem, manifest_dims, rec)
    except Skip as e:
        rec["reason"] = str(e)
        return rec, None
    rec["status"] = "corrected"
    return rec, out


# ----------------------------------------------------------------------------- writing
def write_json_atomic(path, obj):
    tmp = path.with_name(path.name + ".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(obj, f)  # same default settings as the extractor (bare NaN tokens, no indent)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, path)


def write_log(path, records):
    with open(path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=LOG_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(records)


# ----------------------------------------------------------------------------- validation
def validate(in_dir, out_dir, records, manifest_dims):
    """Re-read everything from disk. Returns a list of failure strings (empty == all good)."""
    fails = []
    ok_names = {r["file"] for r in records if r["status"] == "corrected"}
    skipped_names = {r["file"] for r in records if r["status"] != "corrected"}
    in_files = {p.name for p in in_dir.glob("*.json")}
    out_files = {p.name for p in out_dir.glob("*.json")}
    if in_files != ok_names | skipped_names:
        fails.append(f"input files ({len(in_files)}) differ from the log "
                     f"({len(ok_names)} corrected + {len(skipped_names)} skipped)")
    if out_files != ok_names:
        fails.append(f"output files ({len(out_files)}) != corrected files in the log ({len(ok_names)}); "
                     f"missing={sorted(ok_names - out_files)[:5]} unexpected={sorted(out_files - ok_names)[:5]}")
    if len(in_files) != len(out_files) + len(skipped_names):
        fails.append(f"count mismatch: {len(in_files)} in != {len(out_files)} out + {len(skipped_names)} skipped")

    worst_rel = 0.0
    n_checked = 0
    for name in sorted(ok_names & out_files & in_files):
        try:
            din, dout = load_json(in_dir / name), load_json(out_dir / name)
        except (OSError, UnicodeDecodeError, ValueError) as e:
            fails.append(f"{name}: cannot re-read ({e})")
            continue
        try:
            w, h, src = read_dims(din, Path(name).stem, manifest_dims)
        except Skip as e:
            fails.append(f"{name}: input dimensions unusable at validation time ({e})")
            continue
        factor = (w * 9) / (h * 16)  # algebraically (w/h)/(16/9), written differently on purpose
        if dout.get(FLAG) is not True:
            fails.append(f"{name}: {FLAG} flag missing/not true")
        info = dout.get(INFO)
        if not isinstance(info, dict) or info.get("source_width") != w or info.get("source_height") != h \
                or info.get("dimension_source") != src or not math.isclose(info.get("factor", math.nan), factor,
                                                                           rel_tol=1e-12):
            fails.append(f"{name}: {INFO} record missing or inconsistent with input dimensions")
        if list(dout)[:len(din)] != list(din) or set(dout) - set(din) != {FLAG, INFO}:
            fails.append(f"{name}: key set/order differs (expected input keys + {FLAG}, {INFO})")
            continue
        for k in din:
            if k in X_KEYS:
                continue
            if not deep_equal(din[k], dout[k]):
                fails.append(f"{name}: '{k}' changed (y arrays and metadata must be identical)")
        for g, row_len in GROUPS.items():
            xi, xo = np.asarray(din[f"{g}_x"], dtype=float), np.asarray(dout[f"{g}_x"], dtype=float)
            yi, yo = np.asarray(din[f"{g}_y"], dtype=float), np.asarray(dout[f"{g}_y"], dtype=float)
            want = (din["n_frames"], row_len)
            if not (xi.shape == xo.shape == yi.shape == yo.shape == want):
                fails.append(f"{name}: {g} shapes in x/y {xi.shape}/{yi.shape} out x/y {xo.shape}/{yo.shape}, "
                             f"expected {want}")
                continue
            if not np.array_equal(np.isnan(xi), np.isnan(xo)):
                fails.append(f"{name}: {g}_x NaN pattern changed")
                continue
            m = ~np.isnan(xi)
            if m.any():
                expected = xi[m] * (w * 9) / (h * 16)
                if not np.allclose(xo[m], expected, rtol=1e-12, atol=0.0):
                    fails.append(f"{name}: {g}_x does not follow x*((w/h)/(16/9)) (factor {factor})")
                nz = expected != 0
                if nz.any():
                    worst_rel = max(worst_rel, float(np.abs((xo[m] - expected)[nz] / expected[nz]).max()))
        n_checked += 1
    return fails, n_checked, worst_rel


# ----------------------------------------------------------------------------- main
def parse_args():
    p = argparse.ArgumentParser(description="Write an aspect-corrected copy of keypoints_all (never in place).")
    p.add_argument("--in_dir", type=Path, default=DEFAULT_IN, help="original keypoints_all (read only)")
    p.add_argument("--out_dir", type=Path, default=DEFAULT_OUT, help="new directory for corrected JSONs")
    p.add_argument("--manifest", type=Path, default=None,
                   help="optional manifest.csv; width/height are taken from it ONLY for JSONs lacking valid dimensions")
    p.add_argument("--allow_skips", action="store_true",
                   help="write the files that are fine and list the rest, instead of aborting the whole run")
    p.add_argument("--overwrite", action="store_true",
                   help="allow a non-empty out_dir; removes only *.json, *.tmp and the log previously written there")
    p.add_argument("--dry_run", action="store_true", help="plan and report, write nothing")
    p.add_argument("--validate_only", action="store_true", help="validate an existing out_dir using its log; write nothing")
    return p.parse_args()


def check_paths(args):
    in_r, out_r = args.in_dir.resolve(), args.out_dir.resolve()
    if not args.in_dir.is_dir():
        raise SystemExit(f"in_dir not found: {args.in_dir}")
    if in_r == out_r or in_r in out_r.parents or out_r in in_r.parents:
        raise SystemExit(f"out_dir must be a separate, non-nested directory (in={in_r}, out={out_r}). "
                         f"The original keypoints_all is never modified in place.")
    if (args.in_dir / LOG_NAME).exists():
        raise SystemExit(f"{args.in_dir} contains {LOG_NAME}: it looks like an already-corrected directory. "
                         f"Refusing to correct it again.")
    if args.manifest is not None and not args.manifest.is_file():
        raise SystemExit(f"manifest not found: {args.manifest}")


def summarize(records):
    groups = {}
    for r in records:
        if r["status"] != "corrected":
            continue
        g = groups.setdefault((r["width"], r["height"]), {"n": 0, "factor": r["factor"], "lo_i": [], "hi_i": [],
                                                           "lo_o": [], "hi_o": []})
        g["n"] += 1
        if r["_xmin_in"] is not None:
            g["lo_i"].append(r["_xmin_in"]); g["hi_i"].append(r["_xmax_in"])
            g["lo_o"].append(r["_xmin_out"]); g["hi_o"].append(r["_xmax_out"])
    print(f"\n{'size':>12s} {'aspect':>7s} {'files':>6s} {'factor':>8s}   x range before -> after")
    for (w, h), g in sorted(groups.items(), key=lambda kv: str(kv[0])):
        rng = (f"[{min(g['lo_i']):.3f}, {max(g['hi_i']):.3f}] -> [{min(g['lo_o']):.3f}, {max(g['hi_o']):.3f}]"
               if g["lo_i"] else "no valid x")
        print(f"{f'{w}x{h}':>12s} {w / h:7.4f} {g['n']:6d} {g['factor']:8.4f}   {rng}")
    odd = [k for k in groups if not (0.3 < k[0] / k[1] < 4.0)]
    if odd:
        print(f"WARNING: unusual aspect ratios {odd}; check these are real frame sizes (portrait/rotated video?).")


def main():
    args = parse_args()
    check_paths(args)
    manifest_dims = load_manifest_dims(args.manifest) if args.manifest else None
    in_files = sorted(args.in_dir.glob("*.json"))
    if not in_files:
        raise SystemExit(f"no *.json files in {args.in_dir}")

    if args.validate_only:
        log = args.out_dir / LOG_NAME
        if not log.is_file():
            raise SystemExit(f"{log} not found; nothing to validate against")
        with open(log, newline="", encoding="utf-8") as f:
            records = list(csv.DictReader(f))
        fails, n, worst = validate(args.in_dir, args.out_dir, records, manifest_dims)
        report_validation(records, fails, n, worst)
        sys.exit(1 if fails else 0)

    print(f"Inspecting {len(in_files)} JSON files in {args.in_dir}")
    planned = [plan_file(p, manifest_dims) for p in in_files]
    records = [r for r, _ in planned]
    good = [(r, o) for r, o in planned if o is not None]
    bad = [r for r in records if r["status"] != "corrected"]
    print(f"plan: {len(good)} correctable, {len(bad)} to skip")
    summarize(records)
    if bad:
        print(f"\nSKIPPED FILES ({len(bad)}):")
        for r in bad:
            print(f"  {r['file']}: {r['reason']}")
        if not args.allow_skips:
            raise SystemExit("\nAborted before writing anything: fix or exclude the files above, "
                             "or re-run with --allow_skips to correct only the good ones.")
    if not good:
        raise SystemExit("nothing to write")
    if args.dry_run:
        print("\n--dry_run: nothing written.")
        return

    out_dir = args.out_dir
    if out_dir.exists() and any(out_dir.iterdir()):
        if not args.overwrite:
            raise SystemExit(f"{out_dir} is not empty. Choose a new --out_dir, or pass --overwrite to replace the "
                             f"*.json/log files this script wrote there earlier.")
        for p in list(out_dir.glob("*.json")) + list(out_dir.glob("*.tmp")) + [out_dir / LOG_NAME]:
            if p.exists():
                p.unlink()
    out_dir.mkdir(parents=True, exist_ok=True)

    before = snapshot(args.in_dir)
    for r, obj in good:
        write_json_atomic(out_dir / r["file"], obj)
    write_log(out_dir / LOG_NAME, records)
    if snapshot(args.in_dir) != before:
        raise SystemExit("FATAL: in_dir changed during the run (this script never writes there). Investigate.")
    print(f"\nWrote {len(good)} corrected files + {LOG_NAME} to {out_dir}")

    fails, n, worst = validate(args.in_dir, out_dir, records, manifest_dims)
    report_validation(records, fails, n, worst)
    sys.exit(1 if fails else 0)


def report_validation(records, fails, n_checked, worst_rel):
    n_ok = sum(r["status"] == "corrected" for r in records)
    print("\n================ validation (re-read from disk) ================")
    print(f"corrected files in log: {n_ok}   skipped: {len(records) - n_ok}   deeply checked: {n_checked}")
    if fails:
        print(f"VALIDATION FAILED ({len(fails)} problems):")
        for f in fails[:40]:
            print(f"  - {f}")
        if len(fails) > 40:
            print(f"  ... and {len(fails) - 40} more")
    else:
        print("VALIDATION OK: counts match; x/y shapes unchanged; NaN positions identical; y and all other "
              "metadata identical; every x equals x*((w/h)/(16/9))"
              f" (max relative error {worst_rel:.1e}); flag + record present in every output.")
    print("================================================================")


if __name__ == "__main__":
    main()