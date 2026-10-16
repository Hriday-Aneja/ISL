"""Shared, torch-free helpers for the custom from-scratch INCLUDE pipeline.

Lives in include-ml/ next to live_inference.py. Importing this module also
makes the unmodified INCLUDE-master/ repo importable and patches two NumPy
removals that the repo's own code still depends on (see apply_numpy_shims).
"""
import json
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parent
INCLUDE_ROOT = ROOT / "INCLUDE-master"
DEFAULT_RAW_ROOT = ROOT / "raw_dataset"
DEFAULT_DATA_DIR = ROOT / "custom_data"
DEFAULT_MODEL_DIR = ROOT / "models" / "custom_scratch"
DEFAULT_CHECKPOINT = DEFAULT_MODEL_DIR / "custom_best.pth"

# dataset.py scales every normalized x/y by these constants for ALL clips.
FRAME_WIDTH = 1920
FRAME_HEIGHT = 1080
POSE_LANDMARKS = 25
HAND_LANDMARKS = 21
FEATURE_DIM = POSE_LANDMARKS * 2 + HAND_LANDMARKS * 2 * 2  # 134
MAX_POSITION_EMBEDDINGS = 256  # TransformerConfig default; hard upper bound on clip length


def apply_numpy_shims():
    """INCLUDE-master/augment.py uses np.float (removed in NumPy 1.24) and
    utils.EarlyStopping uses np.Inf (removed in NumPy 2.0). Restoring the
    aliases here keeps the original repo files untouched."""
    if not hasattr(np, "float"):
        np.float = float
    if not hasattr(np, "Inf"):
        np.Inf = np.inf


def add_include_to_path():
    if str(INCLUDE_ROOT) not in sys.path:
        sys.path.insert(0, str(INCLUDE_ROOT))


apply_numpy_shims()
add_include_to_path()


def label_from_name(name):
    """The exact label rule used by generate_keypoints.process_video() and
    KeypointsDataset.__getitem__: alphabetic characters only, lowercased."""
    return "".join(c for c in str(name) if c.isalpha()).lower()


def read_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def write_json(path, obj):
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, indent=2)


def signer_from_uid(uid):
    """uids written by extract_keypoints_custom.py look like signer__label__stem."""
    return str(uid).split("__")[0]
