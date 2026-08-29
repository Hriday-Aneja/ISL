"""
Stratified k-fold cross-validation on train+val combined. Test stays
completely untouched throughout.

After cross-validation, trains one final model on all of train+val (median
epoch count across folds) and evaluates it once on the held-out test split.

Usage:
    python3 src/train_kfold.py
    python3 src/train_kfold.py --folds 5 --epochs 60
"""
import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.model_selection import StratifiedKFold
from sklearn.utils.class_weight import compute_class_weight

from dataset import FEATURE_SIZE, LABELS_PATH, SEQUENCE_LENGTH, discover_classes, load_split
from model import build_model

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEFAULT_FEATURE_DIR = MODELS_DIR.parent / "data" / "features_selected"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-dir", type=str, default=str(DEFAULT_FEATURE_DIR),
                         help="Path to a features dir with train/val/test subfolders "
                              "(e.g. the output of resplit_dataset.py)")
    parser.add_argument("--folds", type=int, default=5)
    parser.add_argument("--epochs", type=int, default=60)
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--patience", type=int, default=12)
    parser.add_argument("--final-model-out", type=str,
                         default=str(MODELS_DIR / "isl_recognition_model_kfold.keras"))
    return parser.parse_args()


def main():
    args = parse_args()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    data_dir = Path(args.data_dir)

    classes = discover_classes(data_dir)
    num_classes = len(classes)
    LABELS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(LABELS_PATH, "w") as f:
        json.dump(classes, f, indent=2)

    # Merge train + val — test is loaded later and never touched until the
    # very last evaluation step.
    X_train, y_train, _ = load_split("train", classes, data_dir)
    X_val, y_val, _ = load_split("val", classes, data_dir)
    X_full = np.concatenate([X_train, X_val], axis=0)
    y_full = np.concatenate([y_train, y_val], axis=0)
    print(f"train+val combined: {X_full.shape[0]} samples -> "
          f"{dict(zip(classes, np.bincount(y_full, minlength=num_classes).tolist()))}")

    min_class_count = np.bincount(y_full, minlength=num_classes).min()
    if min_class_count < args.folds:
        raise ValueError(
            f"Smallest class has only {min_class_count} samples, fewer than "
            f"--folds={args.folds}. Reduce --folds or add more data for that class."
        )

    skf = StratifiedKFold(n_splits=args.folds, shuffle=True, random_state=42)
    fold_results, epochs_per_fold = [], []

    for fold_idx, (train_idx, val_idx) in enumerate(skf.split(X_full, y_full), start=1):
        print(f"\n=== Fold {fold_idx}/{args.folds} ===")
        X_tr, y_tr = X_full[train_idx], y_full[train_idx]
        X_va, y_va = X_full[val_idx], y_full[val_idx]

        class_weight = {
            i: w for i, w in enumerate(
                compute_class_weight(class_weight="balanced", classes=np.arange(num_classes), y=y_tr)
            )
        }
        y_tr_oh = tf.keras.utils.to_categorical(y_tr, num_classes)
        y_va_oh = tf.keras.utils.to_categorical(y_va, num_classes)

        model = build_model(SEQUENCE_LENGTH, FEATURE_SIZE, num_classes)
        early_stop = tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=args.patience, restore_best_weights=True
        )
        history = model.fit(
            X_tr, y_tr_oh,
            validation_data=(X_va, y_va_oh),
            epochs=args.epochs,
            batch_size=args.batch_size,
            class_weight=class_weight,
            callbacks=[early_stop],
            verbose=0,
        )

        val_loss, val_acc = model.evaluate(X_va, y_va_oh, verbose=0)
        n_epochs = len(history.history["loss"])
        epochs_per_fold.append(n_epochs)
        fold_results.append({
            "fold": fold_idx, "val_accuracy": float(val_acc), "val_loss": float(val_loss),
            "n_val_samples": int(len(val_idx)), "epochs_trained": n_epochs,
        })
        print(f"Fold {fold_idx}: val_accuracy={val_acc:.4f} val_loss={val_loss:.4f} "
              f"({len(val_idx)} val samples, {n_epochs} epochs)")

    accs = [r["val_accuracy"] for r in fold_results]
    print(f"\n=== {args.folds}-fold results ===")
    print(f"Mean val accuracy: {np.mean(accs):.4f} (std: {np.std(accs):.4f})")
    print(f"Per-fold: {[round(a, 3) for a in accs]}")
    print("A wide std relative to the mean means the model's performance genuinely "
          "depends on which samples land in val, but is worth knowing rather than "
          "trusting a single split's number.")

    summary = {
        "folds": args.folds, "fold_results": fold_results,
        "mean_val_accuracy": float(np.mean(accs)), "std_val_accuracy": float(np.std(accs)),
    }
    results_path = MODELS_DIR / "kfold_results.json"
    with open(results_path, "w") as f:
        json.dump(summary, f, indent=2)
    print(f"Saved fold-by-fold results to {results_path}")

    final_epochs = int(np.median(epochs_per_fold))
    print(f"\nTraining final model on all train+val data for {final_epochs} epochs "
          f"(median epochs-to-convergence across folds)...")

    class_weight = {
        i: w for i, w in enumerate(
            compute_class_weight(class_weight="balanced", classes=np.arange(num_classes), y=y_full)
        )
    }
    y_full_oh = tf.keras.utils.to_categorical(y_full, num_classes)
    final_model = build_model(SEQUENCE_LENGTH, FEATURE_SIZE, num_classes)
    final_model.fit(
        X_full, y_full_oh, epochs=final_epochs, batch_size=args.batch_size,
        class_weight=class_weight, verbose=0,
    )
    final_model.save(args.final_model_out)
    print(f"Saved final model to {args.final_model_out}")

    X_test, y_test, _ = load_split("test", classes, data_dir)
    y_test_oh = tf.keras.utils.to_categorical(y_test, num_classes)
    test_loss, test_acc = final_model.evaluate(X_test, y_test_oh, verbose=0)
    print(f"Final model — test loss: {test_loss:.4f} | test accuracy: {test_acc:.4f}")

    summary["final_model_epochs"] = final_epochs
    summary["final_test_accuracy"] = float(test_acc)
    summary["final_test_loss"] = float(test_loss)
    with open(results_path, "w") as f:
        json.dump(summary, f, indent=2)


if __name__ == "__main__":
    main()