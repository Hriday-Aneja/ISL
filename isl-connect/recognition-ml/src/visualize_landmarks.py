"""
Visualize hand-landmark trajectories for one or more .npy feature files —
useful for eyeballing what's confusing the model between similar signs
(e.g. the Dog clips evaluate.py showed being misclassified as Bird).

Usage:
    python3 src/visualize_landmarks.py \\
        data/features/test/Dog/MVI_3086.npy \\
        data/features/test/Bird/some_clip.npy \\
        --labels "Dog (misclassified as Bird)" "Bird (correct)" \\
        --out models/dog_vs_bird_comparison.png
"""
import argparse
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

LEFT_HAND_SLICE = slice(0, 63)
RIGHT_HAND_SLICE = slice(63, 126)


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("npy_files", nargs="+", help="One or more .npy feature files, shape (100, 225)")
    parser.add_argument("--labels", nargs="+", default=None,
                         help="Display label per file (defaults to filename)")
    parser.add_argument("--out", type=str, default="landmark_comparison.png")
    return parser.parse_args()


def hand_centroid(frame_features, hand_slice):
    coords = frame_features[hand_slice].reshape(21, 3)
    if np.allclose(coords, 0):
        return None
    return coords[:, :2].mean(axis=0)  # (x, y) — drop z for a flat 2D trajectory plot


def compute_motion(sequence):
    n_frames = sequence.shape[0]
    motion = [0.0]
    prev = None
    for t in range(n_frames):
        cur = sequence[t][LEFT_HAND_SLICE].reshape(21, 3)[:, :2]
        if prev is not None and not (np.allclose(cur, 0) or np.allclose(prev, 0)):
            motion.append(float(np.linalg.norm(cur - prev)))
        elif t > 0:
            motion.append(0.0)
        prev = cur
    return motion


def plot_trajectory(ax_traj, sequence, label):
    n_frames = sequence.shape[0]
    cmap = plt.get_cmap("viridis")

    for hand_slice, marker, hand_name in [(LEFT_HAND_SLICE, "o", "L"), (RIGHT_HAND_SLICE, "^", "R")]:
        centroids = [hand_centroid(sequence[t], hand_slice) for t in range(n_frames)]
        pts = [(t, c) for t, c in enumerate(centroids) if c is not None]
        if not pts:
            continue
        ts = np.array([t for t, _ in pts])
        xs = [c[0] for _, c in pts]
        ys = [c[1] for _, c in pts]
        colors = cmap(ts / max(n_frames - 1, 1))
        ax_traj.scatter(xs, ys, c=colors, marker=marker, s=15, label=f"{hand_name} hand")

    ax_traj.set_title(f"{label}\n(dark=start -> light=end)", fontsize=10)
    ax_traj.set_xlabel("x")
    ax_traj.set_ylabel("y")
    # Fixed 0-1 axes (MediaPipe coords are already normalized) so trajectory
    # shape/spread is genuinely comparable across clips — without this,
    # matplotlib auto-scales each subplot to its own data range, and a tiny
    # jittery cluster on a zoomed-in axis can visually look identical in
    # spread to a real wide movement on a zoomed-out axis.
    ax_traj.set_xlim(0, 1)
    ax_traj.set_ylim(0, 1)
    ax_traj.invert_yaxis()
    ax_traj.set_aspect("equal")
    ax_traj.legend(fontsize=7)


def plot_motion(ax_motion, motion, motion_ylim):
    ax_motion.plot(motion)
    ax_motion.set_title("Left-hand frame-to-frame motion", fontsize=10)
    ax_motion.set_xlabel("frame")
    ax_motion.set_ylabel("displacement")
    # Shared y-axis across all clips in this figure — same reason as the
    # trajectory fix: independently auto-scaled motion plots make two very
    # different displacement magnitudes look equally "spiky".
    ax_motion.set_ylim(0, motion_ylim)


def main():
    args = parse_args()
    labels = args.labels or [Path(p).stem for p in args.npy_files]
    if len(labels) != len(args.npy_files):
        raise ValueError("--labels count must match the number of npy_files given")

    sequences = []
    for npy_path in args.npy_files:
        sequence = np.load(npy_path)
        if sequence.shape != (100, 225):
            print(f"WARNING: {npy_path} has shape {sequence.shape}, expected (100, 225)")
        sequences.append(sequence)

    motions = [compute_motion(seq) for seq in sequences]
    motion_ylim = max((max(m) for m in motions if m), default=0.1) * 1.1

    n = len(args.npy_files)
    fig, axes = plt.subplots(2, n, figsize=(5 * n, 8))
    if n == 1:
        axes = axes.reshape(2, 1)

    for i, (sequence, label, motion) in enumerate(zip(sequences, labels, motions)):
        plot_trajectory(axes[0, i], sequence, label)
        plot_motion(axes[1, i], motion, motion_ylim)

    fig.tight_layout()
    fig.savefig(args.out, dpi=120)
    print(f"Saved comparison plot to {args.out}")


if __name__ == "__main__":
    main()