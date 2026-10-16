"""Extract MediaPipe keypoints from our own recordings into the JSON format
INCLUDE's KeypointsDataset reads.

Input layout (only the four signers below are read; anything else under
raw_dataset/ -- e.g. INCLUDE videos -- is ignored):

    raw_dataset/<signer>/<sign_name>/<video_file>

Output (default custom_data/):
    keypoints_all/<signer>__<label>__<stem>.json   one file per video
    manifest.csv                                   per-video stats + sha1
    extraction_meta.json                           settings used (flip, fps, versions)

The per-frame logic is the repo's own: process_hand_keypoints,
process_pose_keypoints and swap_hands are IMPORTED from
INCLUDE-master/generate_keypoints.py, and the MediaPipe Hands/Pose settings are
the same (0.5/0.5, defaults otherwise). process_video() itself is not reused
because it cannot (a) flip frames, (b) give different signers' files like
001.mp4 distinct names (its uid is label + file stem, so they would overwrite
each other), or (c) record fps/size/detection stats. Run
--verify_against_original to prove the output is identical to process_video()
on a sample video.

Usage (from include-ml):
    python extract_keypoints_custom.py --raw_root raw_dataset
"""
import argparse
import csv
import hashlib
import json
import re
import statistics
import tempfile
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from tqdm.auto import tqdm

from custom_common import (DEFAULT_DATA_DIR, DEFAULT_RAW_ROOT, FRAME_HEIGHT, FRAME_WIDTH,
                           MAX_POSITION_EMBEDDINGS, label_from_name, write_json)
import generate_keypoints as gp  # INCLUDE-master/generate_keypoints.py (unmodified)

VIDEO_EXTS = {".mp4", ".mov", ".avi", ".mkv", ".m4v", ".webm"}
DEFAULT_SIGNERS = ["Hriday", "Anshu", "Arnav", "Aayush"]
MANIFEST_FIELDS = ["uid", "signer", "sign_folder", "label", "source_path", "sha1", "dup_of", "status",
                   "n_frames", "n_frames_read", "fps_native", "fps_effective", "width", "height",
                   "pose_rate", "hand1_rate", "hand2_rate", "any_hand_rate", "json_path"]


def parse_args():
    p = argparse.ArgumentParser(description="Extract keypoints from raw_dataset/<signer>/<sign>/<video>")
    p.add_argument("--raw_root", type=Path, default=DEFAULT_RAW_ROOT)
    p.add_argument("--out_dir", type=Path, default=DEFAULT_DATA_DIR)
    p.add_argument("--signers", nargs="+", default=DEFAULT_SIGNERS,
                   help="signer folders to read (case-insensitive). Default: our four.")
    p.add_argument("--flip_horizontal", action="store_true",
                   help="mirror every frame before MediaPipe. Recorded in extraction_meta.json "
                        "and used by live_inference.py as its default, so training and live agree.")
    p.add_argument("--target_fps", type=float, default=30.0,
                   help="drop frames from sources faster than this so all clips share ~one frame "
                        "rate (never upsamples). 0 = keep every frame, like the original pipeline.")
    p.add_argument("--workers", type=int, default=1, help="parallel videos (joblib). 1 = sequential.")
    p.add_argument("--overwrite", action="store_true", help="re-extract videos that already have a JSON")
    p.add_argument("--verify_against_original", action="store_true",
                   help="before extracting, check one video gives output identical to "
                        "generate_keypoints.process_video(), then continue")
    return p.parse_args()


def sanitize(s, allow_underscore=True):
    pattern = r"[^A-Za-z0-9_\-]+" if allow_underscore else r"[^A-Za-z0-9\-]+"
    return re.sub(pattern, "-", s).strip("-")


def sha1_of(path):
    h = hashlib.sha1()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def discover(raw_root, signers):
    raw_root = Path(raw_root)
    if not raw_root.is_dir():
        raise SystemExit(f"raw_root not found: {raw_root}")
    wanted = {s.lower(): s for s in signers}
    found_dirs = {d.name.lower(): d for d in raw_root.iterdir() if d.is_dir()}
    for low, name in wanted.items():
        if low not in found_dirs:
            print(f"WARNING: no folder for signer '{name}' under {raw_root}")
    extra = sorted(d.name for low, d in found_dirs.items() if low not in wanted)
    if extra:
        print(f"Ignoring folders that are not one of our signers: {extra}")
    videos, ignored = [], {}
    for low, name in wanted.items():
        sdir = found_dirs.get(low)
        if sdir is None:
            continue
        for sign_dir in sorted(p for p in sdir.iterdir() if p.is_dir()):
            for f in sorted(sign_dir.rglob("*")):
                if not f.is_file():
                    continue
                if f.suffix.lower() in VIDEO_EXTS:
                    videos.append({"signer": name, "sign_folder": sign_dir.name,
                                   "label": label_from_name(sign_dir.name), "path": f})
                else:
                    ignored[f.suffix.lower()] = ignored.get(f.suffix.lower(), 0) + 1
    if ignored:
        print(f"Ignored non-video files by extension: {ignored}")
    return videos


def make_uids(videos):
    used = set()
    for v in videos:
        signer = sanitize(v["signer"], allow_underscore=False)
        base = f"{signer}__{v['label']}__{sanitize(v['path'].stem)}"
        uid, k = base, 1
        while uid in used:
            k += 1
            uid = f"{base}-{k}"
        used.add(uid)
        v["uid"] = uid


def _valid(lst):
    return len(lst) > 0 and not np.isnan(lst[0])


def extract_one(video, out_json, flip, target_fps):
    """Same per-frame processing as generate_keypoints.process_video(); returns a stats dict."""
    path = Path(video["path"])
    hands = mp.solutions.hands.Hands(min_detection_confidence=0.5, min_tracking_confidence=0.5)
    pose = mp.solutions.pose.Pose(min_detection_confidence=0.5, min_tracking_confidence=0.5)
    px, py, h1x, h1y, h2x, h2y = [], [], [], [], [], []
    cap = cv2.VideoCapture(str(path))
    fps_native = float(cap.get(cv2.CAP_PROP_FPS) or 0.0)
    fps_ok = 1.0 <= fps_native <= 240.0
    subsample = bool(target_fps) and fps_ok and fps_native > target_fps * 1.05
    next_emit, idx, n_read, width, height = 0.0, 0, 0, 0, 0
    pose_hit = h1_hit = h2_hit = any_hit = 0
    while cap.isOpened():
        ret, image = cap.read()
        if not ret:
            break
        n_read += 1
        t = idx / fps_native if fps_ok else float(idx)
        idx += 1
        if subsample:
            if t + 1e-6 < next_emit:
                continue
            next_emit += 1.0 / target_fps
        if flip:
            image = cv2.flip(image, 1)
        if width == 0:
            height, width = image.shape[:2]
        image = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        hand_results = hands.process(image)
        pose_results = pose.process(image)
        a_x, a_y, b_x, b_y = gp.process_hand_keypoints(hand_results)
        pose_x, pose_y = gp.process_pose_keypoints(pose_results)
        if len(pose_x) >= 17 and len(pose_y) >= 17:
            if len(a_x) > 0 and len(b_x) == 0:
                if gp.swap_hands((pose_x[15], pose_y[15]), (pose_x[16], pose_y[16]), (a_x[0], a_y[0]), "h1"):
                    a_x, a_y, b_x, b_y = b_x, b_y, a_x, a_y
            elif len(a_x) == 0 and len(b_x) > 0:
                if gp.swap_hands((pose_x[15], pose_y[15]), (pose_x[16], pose_y[16]), (b_x[0], b_y[0]), "h2"):
                    a_x, a_y, b_x, b_y = b_x, b_y, a_x, a_y
        a_x = a_x if a_x else [np.nan] * 21
        a_y = a_y if a_y else [np.nan] * 21
        b_x = b_x if b_x else [np.nan] * 21
        b_y = b_y if b_y else [np.nan] * 21
        pose_x = pose_x if pose_x else [np.nan] * 25
        pose_y = pose_y if pose_y else [np.nan] * 25
        px.append(pose_x); py.append(pose_y)
        h1x.append(a_x); h1y.append(a_y); h2x.append(b_x); h2y.append(b_y)
        pose_hit += _valid(pose_x)
        h1_hit += _valid(a_x)
        h2_hit += _valid(b_x)
        any_hit += _valid(a_x) or _valid(b_x)
    cap.release()
    hands.close()
    pose.close()
    n = len(px)
    stats = {"uid": video["uid"], "signer": video["signer"], "sign_folder": video["sign_folder"],
             "label": video["label"], "source_path": str(path), "n_frames": n, "n_frames_read": n_read,
             "fps_native": round(fps_native, 3), "width": width, "height": height,
             "fps_effective": round(min(fps_native, target_fps) if subsample else fps_native, 3),
             "pose_rate": pose_hit / n if n else 0.0, "hand1_rate": h1_hit / n if n else 0.0,
             "hand2_rate": h2_hit / n if n else 0.0, "any_hand_rate": any_hit / n if n else 0.0,
             "status": "ok" if n > 0 else "unreadable"}
    if n == 0:
        return stats
    save = {"uid": video["uid"], "label": video["label"],
            "pose_x": px, "pose_y": py, "hand1_x": h1x, "hand1_y": h1y, "hand2_x": h2x, "hand2_y": h2y,
            "n_frames": n,
            # extras (ignored by KeypointsDataset):
            "signer": video["signer"], "source": str(path), "fps_native": fps_native,
            "fps_effective": stats["fps_effective"], "width": width, "height": height,
            "flipped": bool(flip), "target_fps": float(target_fps or 0)}
    with open(out_json, "w") as f:
        json.dump(save, f)
    return stats


def stats_from_json(video, json_path):
    d = json.load(open(json_path))
    n = int(d["n_frames"])
    first = lambda arr: np.array([r[0] if r else np.nan for r in arr], dtype=float)
    pose, h1, h2 = ~np.isnan(first(d["pose_x"])), ~np.isnan(first(d["hand1_x"])), ~np.isnan(first(d["hand2_x"]))
    return {"uid": video["uid"], "signer": video["signer"], "sign_folder": video["sign_folder"],
            "label": video["label"], "source_path": str(video["path"]), "n_frames": n,
            "n_frames_read": n, "fps_native": d.get("fps_native", 0), "fps_effective": d.get("fps_effective", 0),
            "width": d.get("width", 0), "height": d.get("height", 0), "pose_rate": float(pose.mean()),
            "hand1_rate": float(h1.mean()), "hand2_rate": float(h2.mean()),
            "any_hand_rate": float((h1 | h2).mean()), "status": "ok"}


def verify_against_original(video):
    keys = ["pose_x", "pose_y", "hand1_x", "hand1_y", "hand2_x", "hand2_y"]
    with tempfile.TemporaryDirectory() as tmp:
        gp.process_video(Path(video["path"]).as_posix(), tmp)  # original: label from path.split("/")[-2]
        orig = json.load(open(next(Path(tmp).glob("*.json"))))
        mine_path = Path(tmp) / "mine.json"
        extract_one(video, mine_path, flip=False, target_fps=0)
        mine = json.load(open(mine_path))
    worst = 0.0
    for k in keys:
        a, b = np.array(orig[k], dtype=float), np.array(mine[k], dtype=float)
        if a.shape != b.shape:
            raise SystemExit(f"VERIFY FAILED: '{k}' shape {a.shape} (original) vs {b.shape} (ours)")
        if not np.array_equal(np.isnan(a), np.isnan(b)):
            raise SystemExit(f"VERIFY FAILED: NaN pattern differs in '{k}'")
        m = ~np.isnan(a)
        worst = max(worst, float(np.abs(a[m] - b[m]).max()) if m.any() else 0.0)
    if orig["label"] != mine["label"] or orig["n_frames"] != mine["n_frames"]:
        raise SystemExit("VERIFY FAILED: label/n_frames differ")
    print(f"VERIFY OK: identical to generate_keypoints.process_video() on {video['path'].name} "
          f"({mine['n_frames']} frames, max abs diff {worst:.2e})")


def report(rows, videos):
    print("\n================ extraction summary ================")
    ok = [r for r in rows if r["status"] == "ok"]
    print(f"videos found: {len(videos)}   extracted ok: {len(ok)}   unreadable: {len(rows) - len(ok)}")
    by_label = {}
    for v in videos:
        by_label.setdefault(v["label"], set()).add(v["sign_folder"])
    odd = {k: sorted(v) for k, v in by_label.items() if len(v) > 1}
    if odd:
        print(f"NOTE: folder names merged into one label (check these are intended): {odd}")
    signers = sorted({r["signer"] for r in ok})
    print(f"\n{'signer':10s} {'videos':>6s} {'signs':>5s} {'med fps':>8s} {'med frames':>10s} {'med pose':>9s} {'med any-hand':>12s}")
    for s in signers:
        rs = [r for r in ok if r["signer"] == s]
        print(f"{s:10s} {len(rs):6d} {len({r['label'] for r in rs}):5d} "
              f"{statistics.median(float(r['fps_effective']) for r in rs):8.1f} "
              f"{statistics.median(int(r['n_frames']) for r in rs):10.0f} "
              f"{statistics.median(float(r['pose_rate']) for r in rs):9.2f} "
              f"{statistics.median(float(r['any_hand_rate']) for r in rs):12.2f}")
    labels = sorted({r["label"] for r in ok})
    print(f"\nvideos per (sign x signer)  [{len(labels)} signs]")
    print(f"{'sign':18s} " + " ".join(f"{s[:8]:>8s}" for s in signers))
    for lab in labels:
        print(f"{lab:18s} " + " ".join(f"{sum(1 for r in ok if r['label'] == lab and r['signer'] == s):8d}" for s in signers))
    warn = []
    land = [r for r in ok if int(r["width"]) < int(r["height"])]
    if land:
        warn.append(f"{len(land)} portrait videos (height > width). dataset.py scales x by {FRAME_WIDTH} and y by "
                    f"{FRAME_HEIGHT} for every clip, and the webcam is landscape; portrait clips are distorted "
                    f"relative to live input. Re-record landscape or exclude them.")
    asp = sorted({round(int(r["width"]) / max(int(r["height"]), 1), 2) for r in ok if int(r["width"]) >= int(r["height"])})
    if len(asp) > 1 or (asp and abs(asp[0] - 16 / 9) > 0.05):
        warn.append(f"aspect ratios present: {asp} (16:9 = 1.78). Mixed/non-16:9 aspect changes the x/y geometry the "
                    f"model sees, exactly as discussed for webcam capture.")
    fps = sorted({round(float(r["fps_effective"])) for r in ok})
    if len(fps) > 1:
        warn.append(f"effective fps differs across clips: {fps}. The model has no frame-rate input, so sign speed "
                    f"in frames differs between clips.")
    longest = max((int(r["n_frames"]) for r in ok), default=0)
    if longest > MAX_POSITION_EMBEDDINGS:
        warn.append(f"longest clip has {longest} frames > {MAX_POSITION_EMBEDDINGS} (the Transformer's position "
                    f"embedding limit). Lower --target_fps or trim those clips.")
    low = [r["uid"] for r in ok if float(r["pose_rate"]) < 0.8 or float(r["any_hand_rate"]) < 0.5]
    if low:
        warn.append(f"{len(low)} clips with weak detection (pose<80% or any-hand<50%), e.g. {low[:5]}")
    for w in warn:
        print(f"\nWARNING: {w}")
    print("====================================================")


def main():
    args = parse_args()
    videos = discover(args.raw_root, args.signers)
    if not videos:
        raise SystemExit("No videos found. Expected raw_dataset/<signer>/<sign_name>/<video_file>")
    make_uids(videos)
    if args.verify_against_original:
        verify_against_original(videos[0])
    kp_dir = args.out_dir / "keypoints_all"
    kp_dir.mkdir(parents=True, exist_ok=True)

    todo = []
    for v in videos:
        jp = kp_dir / f"{v['uid']}.json"
        v["json_path"] = jp
        v["sha1"] = sha1_of(v["path"])
        todo.append(v)

    def run(v):
        jp = v["json_path"]
        if jp.exists() and not args.overwrite:
            return stats_from_json(v, jp)
        return extract_one(v, jp, args.flip_horizontal, args.target_fps)

    if args.workers > 1:
        from joblib import Parallel, delayed
        rows = Parallel(n_jobs=args.workers, backend="multiprocessing")(
            delayed(run)(v) for v in tqdm(todo, desc="extracting"))
    else:
        rows = [run(v) for v in tqdm(todo, desc="extracting")]

    seen = {}
    for v, r in zip(todo, rows):
        r["sha1"] = v["sha1"]
        r["json_path"] = str(v["json_path"])
        r["dup_of"] = seen.get(v["sha1"], "")
        seen.setdefault(v["sha1"], r["uid"])
    with open(args.out_dir / "manifest.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=MANIFEST_FIELDS, extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)
    flipped_mixed = False
    if not args.overwrite:
        # reusing existing JSONs extracted with different settings would silently mix them
        for v in todo:
            d = json.load(open(v["json_path"])) if v["json_path"].exists() else {}
            if d and (bool(d.get("flipped")) != bool(args.flip_horizontal)
                      or float(d.get("target_fps", 0)) != float(args.target_fps or 0)):
                flipped_mixed = True
        if flipped_mixed:
            print("WARNING: some existing JSONs were made with different --flip_horizontal/--target_fps. "
                  "Re-run with --overwrite so every clip uses the same settings.")
    write_json(args.out_dir / "extraction_meta.json", {
        "flip_horizontal": bool(args.flip_horizontal), "target_fps": float(args.target_fps or 0),
        "signers": args.signers, "mediapipe": getattr(mp, "__version__", "?"), "opencv": cv2.__version__,
        "hands": {"min_detection_confidence": 0.5, "min_tracking_confidence": 0.5, "max_num_hands": 2},
        "pose": {"min_detection_confidence": 0.5, "min_tracking_confidence": 0.5},
        "n_videos": len(rows)})
    dups = [r for r in rows if r["dup_of"]]
    if dups:
        print(f"WARNING: {len(dups)} byte-identical duplicate videos (excluded by make_splits_custom.py): "
              f"{[r['uid'] for r in dups][:5]}")
    report(rows, videos)
    print(f"\nWrote {len(rows)} rows to {args.out_dir / 'manifest.csv'}; next: python make_splits_custom.py")


if __name__ == "__main__":
    main()
