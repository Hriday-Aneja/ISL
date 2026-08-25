"""
Train the sequence classifier (model.py) on the preprocessed .npy features
(dataset.py), preserving the existing train/val/test split.

Usage:
    python3 src/train.py
    python3 src/train.py --epochs 100 --batch-size 8
"""
import argparse
import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")  # no display in a hackathon/CI environment
import matplotlib.pyplot as plt
import numpy as np
import tensorflow as tf
from sklearn.utils.class_weight import compute_class_weight

from dataset import FEATURE_SIZE, SEQUENCE_LENGTH, FEATURE_DIR, load_all_splits
from model import build_model

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=str, default=str(FEATURE_DIR),
                         help="Path to a features dir with train/val/test subfolders "
                              "(e.g. the output of resplit_dataset.py)")
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--patience", type=int, default=12,
                         help="Early stopping patience (epochs with no val improvement)")
    parser.add_argument("--model-out", type=str, default=str(MODELS_DIR / "isl_recognition_model.keras"))
    return parser.parse_args()


def main():
    args = parse_args()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)

    print(f"Loading features from {args.data_dir} ...")
    classes, data = load_all_splits(Path(args.data_dir))
    num_classes = len(classes)
    print(f"Classes ({num_classes}): {classes}")

    X_train, y_train, _ = data["train"]
    X_val, y_val, _ = data["val"]
    X_test, y_test, _ = data["test"]

    for split_name, (X, y, _) in data.items():
        counts = np.bincount(y, minlength=num_classes)
        print(f"{split_name}: {X.shape[0]} samples -> {dict(zip(classes, counts.tolist()))}")

    # Small dataset (82 videos / 4 classes total) — flag this plainly rather
    # than silently training as if this were a large dataset. Class weights
    # help if the split is imbalanced; early stopping + restore_best_weights
    # guards against the LSTM overfitting on so few samples.
    total_samples = sum(X.shape[0] for X, _, _ in data.values())
    if total_samples < 200:
        print(
            f"\nNOTE: only {total_samples} total samples across {num_classes} classes. "
            "Expect noisy val/test metrics at this scale — treat results as a pilot "
            "signal, not a production accuracy estimate.\n"
        )

    class_weights_arr = compute_class_weight(
        class_weight="balanced", classes=np.arange(num_classes), y=y_train
    )
    class_weight = {i: w for i, w in enumerate(class_weights_arr)}
    print(f"Class weights: {class_weight}")

    y_train_oh = tf.keras.utils.to_categorical(y_train, num_classes)
    y_val_oh = tf.keras.utils.to_categorical(y_val, num_classes)
    y_test_oh = tf.keras.utils.to_categorical(y_test, num_classes)

    model = build_model(SEQUENCE_LENGTH, FEATURE_SIZE, num_classes)
    model.summary()

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=args.patience, restore_best_weights=True
        ),
        tf.keras.callbacks.ModelCheckpoint(
            args.model_out, monitor="val_accuracy", save_best_only=True
        ),
        tf.keras.callbacks.ReduceLROnPlateau(
            monitor="val_loss", factor=0.5, patience=5, min_lr=1e-5
        ),
    ]

    history = model.fit(
        X_train, y_train_oh,
        validation_data=(X_val, y_val_oh),
        epochs=args.epochs,
        batch_size=args.batch_size,
        class_weight=class_weight,
        callbacks=callbacks,
        verbose=2,
    )

    # model.fit already saved the best checkpoint via ModelCheckpoint, but
    # save again explicitly in case restore_best_weights pulled in a
    # different (better, later) epoch than the last checkpoint write.
    model.save(args.model_out)
    print(f"\nSaved model to {args.model_out}")

    test_loss, test_acc = model.evaluate(X_test, y_test_oh, verbose=0)
    print(f"Test loss: {test_loss:.4f} | Test accuracy: {test_acc:.4f}")

    history_path = MODELS_DIR / "training_history.json"
    with open(history_path, "w") as f:
        json.dump({k: [float(v) for v in vals] for k, vals in history.history.items()}, f, indent=2)
    print(f"Saved training history to {history_path}")

    fig, axes = plt.subplots(1, 2, figsize=(10, 4))
    axes[0].plot(history.history["loss"], label="train")
    axes[0].plot(history.history["val_loss"], label="val")
    axes[0].set_title("Loss")
    axes[0].legend()
    axes[1].plot(history.history["accuracy"], label="train")
    axes[1].plot(history.history["val_accuracy"], label="val")
    axes[1].set_title("Accuracy")
    axes[1].legend()
    fig.tight_layout()
    plot_path = MODELS_DIR / "training_curves.png"
    fig.savefig(plot_path)
    print(f"Saved training curves to {plot_path}")


if __name__ == "__main__":
    main()