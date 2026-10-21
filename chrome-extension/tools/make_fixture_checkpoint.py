"""Writes a RANDOM-WEIGHT checkpoint in the exact format train_custom.py produces, for protocol/plumbing tests only.

It has the real architecture (DeterministicEvalTransformer, 24 classes, 134 features) and the real label map, but the
weights are untrained, so its predictions are meaningless. It exists because the trained checkpoint
(include-ml/models/custom_scratch/custom_best.pth) is not part of the repository. NEVER use it for real recognition.

    python tools/make_fixture_checkpoint.py --out /tmp/fixture_random.pth
"""
import argparse
import sys
from pathlib import Path

ML = Path(__file__).resolve().parents[2] / "include-ml"
sys.path.insert(0, str(ML))

import torch  # noqa: E402
from custom_common import FRAME_HEIGHT, FRAME_WIDTH, PREPROCESSING_VERSION, read_json, INCLUDE_ROOT  # noqa: E402
from custom_model import build_model  # noqa: E402


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--out", type=Path, required=True)
    p.add_argument("--flip", choices=["true", "false"], default="true")
    p.add_argument("--max-frame-len", type=int, default=60)
    p.add_argument("--train-fps", type=float, default=15.0)
    a = p.parse_args()
    label_map = read_json(INCLUDE_ROOT / "label_maps" / "label_map_custom.json")
    labels = [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])]
    torch.manual_seed(0)
    model = build_model("small", len(labels), torch.device("cpu"))
    meta = {"custom": True, "trained_from_scratch": False, "FIXTURE_RANDOM_WEIGHTS": True, "labels": labels,
            "n_classes": len(labels), "transformer_size": "small", "max_position_embeddings": 256, "input_size": 134,
            "max_frame_len": a.max_frame_len, "frame_width": FRAME_WIDTH, "frame_height": FRAME_HEIGHT,
            "flip_horizontal": a.flip == "true", "train_fps": a.train_fps, "target_fps": a.train_fps,
            "preprocessing_version": PREPROCESSING_VERSION}
    a.out.parent.mkdir(parents=True, exist_ok=True)
    torch.save({"model": model.state_dict(), "meta": meta}, a.out)
    print(f"wrote RANDOM-WEIGHT fixture checkpoint -> {a.out}")


if __name__ == "__main__":
    main()
