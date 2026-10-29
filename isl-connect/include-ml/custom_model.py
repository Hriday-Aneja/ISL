"""Torch-side helpers: model construction, checkpoint I/O, evaluation.

Uses the ORIGINAL INCLUDE-master/models/transformer.py Transformer and
configs.TransformerConfig. The only addition is a thin subclass that fixes
one inference-time bug in the original forward() (see below).
"""
import numpy as np
import torch
import torch.nn.functional as F

from custom_common import (FEATURE_DIM,  # importing custom_common also sets up sys.path + numpy shims
                           MAX_POSITION_EMBEDDINGS, read_json)
from configs import TransformerConfig  # noqa: E402  (INCLUDE-master)
from models import Transformer  # noqa: E402  (INCLUDE-master)


class DeterministicEvalTransformer(Transformer):
    """Same layers, same parameter names/shapes, same math as the original
    Transformer -- one difference. The original forward() ends with

        x = F.dropout(x, p=0.2)

    F.dropout's `training` argument defaults to True, so that dropout stays
    ACTIVE under model.eval(): every inference (and every validation pass)
    randomly zeroes 20% of the pooled features, so the same input gives a
    different output each call. Here it is `training=self.training`, so dropout
    applies only while training. state_dicts are interchangeable with the
    original class in both directions."""

    def forward(self, x, attention_mask=None):
        if attention_mask is None:
            attention_mask = torch.ones(x.shape[:2], dtype=torch.bool, device=x.device)
        if attention_mask.shape != x.shape[:2]:
            raise ValueError(f"attention_mask shape {attention_mask.shape} does not match input {x.shape[:2]}")
        if not attention_mask.any(dim=1).all():
            raise ValueError("attention_mask must contain at least one valid frame per sequence")
        extended_mask = (1.0 - attention_mask[:, None, None, :].to(dtype=x.dtype)) * -10000.0
        x = self.l1(x)
        x = self.embedding(x)
        for layer in self.layers:
            out = layer(x, attention_mask=extended_mask)
            x = out[0] if isinstance(out, (tuple, list)) else out
        x = masked_max_pool(x, attention_mask)
        x = F.dropout(x, p=0.2, training=self.training)
        x = self.l2(x)
        return x


def masked_max_pool(x, attention_mask):
    """Pool only valid query positions, leaving padded queries out of logits."""
    invalid = ~attention_mask.to(dtype=torch.bool).unsqueeze(-1)
    return x.masked_fill(invalid, torch.finfo(x.dtype).min).max(dim=1).values


def build_model(size, n_classes, device):
    """Randomly initialised model (PyTorch default init). Nothing is loaded."""
    config = TransformerConfig(size=size, max_position_embeddings=MAX_POSITION_EMBEDDINGS)
    assert config.input_size == FEATURE_DIM, config.input_size
    model = DeterministicEvalTransformer(config=config, n_classes=n_classes)
    return model.to(device)


def torch_load(path, device):
    try:
        return torch.load(path, map_location=device, weights_only=False)
    except TypeError:  # torch < 1.13 has no weights_only argument
        return torch.load(path, map_location=device)


def load_checkpoint(path, device, legacy_labels_path=None):
    """Load either a checkpoint written by train_custom.py (has "meta") or the
    original INCLUDE transformer.pth (no "meta"; labels come from
    legacy_labels_path, class count is read from the l2 weight shape).
    Returns (model_in_eval_mode, meta_dict)."""
    ckpt = torch_load(path, device)
    if not isinstance(ckpt, dict) or "model" not in ckpt:
        raise ValueError(f"Expected a checkpoint dict with a 'model' key: {path}")
    state = ckpt["model"]
    n_classes = int(state["l2.weight"].shape[0])
    meta = ckpt.get("meta")
    if meta is None:
        if legacy_labels_path is None:
            raise ValueError("Checkpoint has no 'meta' (original INCLUDE file?) -- pass a label map.")
        label_map = read_json(legacy_labels_path)
        labels = [k for k, _ in sorted(label_map.items(), key=lambda kv: kv[1])]
        meta = {"custom": False, "labels": labels, "transformer_size": "small",
                "max_frame_len": 169, "flip_horizontal": None, "train_fps": None}
    if len(meta["labels"]) != n_classes:
        raise ValueError(f"Checkpoint head has {n_classes} classes but {len(meta['labels'])} labels were given.")
    model = build_model(meta.get("transformer_size", "small"), n_classes, device)
    model.load_state_dict(state)
    model.eval()
    return model, meta


@torch.no_grad()
def predict_loader(model, loader, device):
    """Returns (uids, y_true, probs[N, C]) with dropout off (model.eval())."""
    model.eval()
    uids, y_true, probs = [], [], []
    for batch in loader:
        logits = model(batch["data"].to(device), attention_mask=batch["attention_mask"].to(device))
        probs.append(torch.softmax(logits, dim=-1).cpu().numpy())
        y_true.append(batch["label"].numpy() if torch.is_tensor(batch["label"]) else np.asarray(batch["label"]))
        uids += list(batch["uid"])
    return uids, np.concatenate(y_true), np.concatenate(probs)


def crop_collate(max_frame_len):
    """KeypointsDataset pads to the max_frame_len it was built with. We build it
    with extra headroom (so augment.upsample can never push a clip past the pad
    length -> negative np.pad) and crop back to the real training length here.
    Only trailing zero-padding is removed unless a clip really is longer."""
    from torch.utils.data.dataloader import default_collate

    def collate(items):
        batch = default_collate(items)
        batch["data"] = batch["data"][:, :max_frame_len, :]
        lengths = batch["length"].to(dtype=torch.long)
        if (lengths < 1).any() or (lengths > max_frame_len).any():
            raise ValueError(f"invalid sequence lengths for collate: {lengths.tolist()}")
        batch["attention_mask"] = torch.arange(max_frame_len).unsqueeze(0) < lengths.unsqueeze(1)
        return batch
    return collate


def summarize(uids, y_true, probs, labels, title, signer_of=None, verbose_classes=True):
    """Plain-numpy report: accuracy, top-3, per-class recall, per-signer accuracy,
    confusion matrix. Returns (text, results_dict, confusion_ndarray)."""
    n, c = probs.shape
    y_pred = probs.argmax(1)
    correct = y_pred == y_true
    k = min(3, c)
    topk = np.argsort(-probs, axis=1)[:, :k]
    top3 = float(np.mean([y_true[i] in topk[i] for i in range(n)])) if n else float("nan")
    conf = np.zeros((c, c), dtype=int)
    for t, p in zip(y_true, y_pred):
        conf[t, p] += 1
    lines = [f"=== {title} ===",
             f"clips: {n}   classes present: {len(set(y_true.tolist()))}/{c}",
             f"top-1 accuracy: {correct.mean():.4f}  ({int(correct.sum())}/{n})" if n else "no clips",
             f"top-{k} accuracy: {top3:.4f}",
             f"chance (uniform over {c} classes): {1.0 / c:.4f}"]
    per_class = {}
    if verbose_classes and n:
        lines.append("per-class recall (correct/total):")
        for ci, name in enumerate(labels):
            tot = int((y_true == ci).sum())
            if tot:
                ok = int(((y_true == ci) & correct).sum())
                per_class[name] = {"correct": ok, "total": tot}
                lines.append(f"  {name:20s} {ok}/{tot}")
    per_signer = {}
    if signer_of is not None and n:
        signers = np.array([signer_of(u) for u in uids])
        lines.append("per-signer accuracy:")
        for s in sorted(set(signers)):
            m = signers == s
            per_signer[s] = {"correct": int(correct[m].sum()), "total": int(m.sum())}
            lines.append(f"  {s:20s} {int(correct[m].sum())}/{int(m.sum())}")
    results = {"n": int(n), "top1": float(correct.mean()) if n else None, "top3": top3,
               "chance": 1.0 / c, "per_class": per_class, "per_signer": per_signer}
    return "\n".join(lines), results, conf
