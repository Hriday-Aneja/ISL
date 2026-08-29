"""
Evaluate the trained model on the held-out test split.

Usage:
    python3 src/evaluate.py
    python3 src/evaluate.py --model models/isl_recognition_model.keras
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

from dataset import load_label_classes, load_split, FEATURE_DIR

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", type=str, default="models/isl_recognition_model_kfold.keras")
    parser.add_argument("--split", type=str, default="test", choices=["train", "val", "test"])
    parser.add_argument("--data-dir", type=str, default="data/features_selected",
                         help="Path to a features dir with train/val/test subfolders "
                              "(e.g. the output of resplit_dataset.py) — must match "
                              "whatever dir the model was trained on")
    return parser.parse_args()


def plot_confusion_matrix(cm, classes, out_path):
    fig, ax = plt.subplots(figsize=(6, 5))
    im = ax.imshow(cm, cmap="Blues")
    ax.set_xticks(range(len(classes)))
    ax.set_yticks(range(len(classes)))
    ax.set_xticklabels(classes, rotation=45, ha="right")
    ax.set_yticklabels(classes)
    ax.set_xlabel("Predicted")
    ax.set_ylabel("Actual")
    ax.set_title("Confusion Matrix")
    for i in range(cm.shape[0]):
        for j in range(cm.shape[1]):
            ax.text(j, i, str(cm[i, j]), ha="center", va="center",
                     color="white" if cm[i, j] > cm.max() / 2 else "black")
    fig.colorbar(im)
    fig.tight_layout()
    fig.savefig(out_path)


def main():
    args = parse_args()

    if not Path(args.model).exists():
        raise FileNotFoundError(f"Model not found at {args.model} — run train.py first.")

    classes = load_label_classes()
    X, y_true, filenames = load_split(args.split, classes, Path(args.data_dir))

    model = tf.keras.models.load_model(args.model)
    probs = model.predict(X, verbose=0)
    y_pred = np.argmax(probs, axis=1)
    confidences = probs[np.arange(len(y_pred)), y_pred]

    print(f"\n=== Evaluation on '{args.split}' split ({len(y_true)} samples) ===\n")
    report = classification_report(
        y_true, y_pred, target_names=classes, output_dict=True, zero_division=0
    )
    print(classification_report(y_true, y_pred, target_names=classes, zero_division=0))

    cm = confusion_matrix(y_true, y_pred, labels=range(len(classes)))
    print("Confusion matrix (rows=actual, cols=predicted):")
    print(f"{'':>12}" + "".join(f"{c[:10]:>12}" for c in classes))
    for i, row in enumerate(cm):
        print(f"{classes[i][:10]:>12}" + "".join(f"{v:>12}" for v in row))

    # Per-sample results — useful for spotting exactly which clips are
    # being misclassified, not just aggregate metrics.
    print("\nMisclassified samples:")
    n_wrong = 0
    for fname, true_idx, pred_idx, conf in zip(filenames, y_true, y_pred, confidences):
        if true_idx != pred_idx:
            n_wrong += 1
            print(f"  {fname}: actual={classes[true_idx]} predicted={classes[pred_idx]} (conf={conf:.2f})")
    if n_wrong == 0:
        print("  none")

    out = {
        "split": args.split,
        "num_samples": len(y_true),
        "classes": classes,
        "classification_report": report,
        "confusion_matrix": cm.tolist(),
    }
    report_path = MODELS_DIR / f"evaluation_{args.split}.json"
    with open(report_path, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nSaved full report to {report_path}")

    cm_plot_path = MODELS_DIR / f"confusion_matrix_{args.split}.png"
    plot_confusion_matrix(cm, classes, cm_plot_path)
    print(f"Saved confusion matrix plot to {cm_plot_path}")


if __name__ == "__main__":
    main()