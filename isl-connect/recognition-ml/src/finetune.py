"""
Fine-tune the existing trained model on personal webcam signing data,
combined with the base dataset — rather than training from scratch.

Preserves the existing 24-class label mapping exactly: loads it once via
dataset.load_label_classes() and passes that frozen list to every loader
below. Deliberately does NOT call dataset.load_all_splits() (which
rewrites models/label_classes.json from whatever it discovers) — personal
data folders are validated against the frozen mapping instead, so a typo
in a personal class folder name gets reported, never silently reindexes
the model's classes.

Base val/test splits are left completely alone throughout, so accuracy on
them is directly comparable before vs. after fine-tuning. Personal data is
never mixed into those splits.

Signer-aware evaluation (--holdout-signer): that signer's personal data is
fully excluded from training and evaluated separately afterward — this is
the useful check for "does this generalize to a person who wasn't
fine-tuned on", not just "did it memorize this specific person".

Usage:
    # Fine-tune on everyone's personal data, holding no one out:
    python3 src/finetune.py

    # Hold teammate's data out, evaluate generalization to them:
    python3 src/finetune.py --holdout-signer priya

    # Evaluate an existing model against a signer without training:
    python3 src/finetune.py --eval-only --base-model models/isl_recognition_model_finetuned.keras --holdout-signer priya
"""
import argparse
import json
from pathlib import Path

import numpy as np
import tensorflow as tf
from sklearn.metrics import classification_report, confusion_matrix

from dataset import FEATURE_SIZE, SEQUENCE_LENGTH, load_label_classes, load_split

PROJECT_DIR = Path(__file__).resolve().parent.parent
MODELS_DIR = PROJECT_DIR / "models"
DEFAULT_BASE_DATA_DIR = PROJECT_DIR / "data" / "features_selected"
DEFAULT_PERSONAL_DATA_DIR = PROJECT_DIR / "data" / "personal_features"


def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-model", type=str,
                         default=str(MODELS_DIR / "isl_recognition_model_kfold.keras"))
    parser.add_argument("--base-data-dir", type=str, default=str(DEFAULT_BASE_DATA_DIR))
    parser.add_argument("--personal-data-dir", type=str, default=str(DEFAULT_PERSONAL_DATA_DIR))
    parser.add_argument("--signers", nargs="+", default=None,
                         help="Which signers' personal data to include in training "
                              "(default: every signer found, minus --holdout-signer)")
    parser.add_argument("--holdout-signer", type=str, default=None,
                         help="Exclude this signer from training entirely; evaluate the "
                              "fine-tuned model on their data afterward")
    parser.add_argument("--epochs", type=int, default=20,
                         help="Fine-tuning needs far fewer epochs than training from scratch")
    parser.add_argument("--batch-size", type=int, default=8)
    parser.add_argument("--learning-rate", type=float, default=1e-4,
                         help="Lower than the base model's original training LR — fine-tuning "
                              "should nudge weights, not overwrite what the base model learned")
    parser.add_argument("--patience", type=int, default=6)
    parser.add_argument("--freeze-base-layers", action="store_true",
                         help="Freeze the LSTM layers and only fine-tune the dense "
                              "classification head — more conservative, useful when personal "
                              "data is very small relative to the base dataset")
    parser.add_argument("--model-out", type=str,
                         default=str(MODELS_DIR / "isl_recognition_model_finetuned.keras"))
    parser.add_argument("--eval-only", action="store_true",
                         help="Skip training; just evaluate --base-model on base test + "
                              "--holdout-signer's personal data")
    return parser.parse_args()


def load_personal_data(personal_dir: Path, classes: list[str], signers: list[str]):
    """Mirrors dataset.load_split()'s loading/validation style, but for the
    signer-keyed personal_features/{signer}/{class}/*.npy layout instead of
    the base dataset's {split}/{class}/*.npy layout."""
    label_to_idx = {c: i for i, c in enumerate(classes)}
    X, y, filenames, signer_names = [], [], [], []

    for signer in signers:
        signer_dir = personal_dir / signer
        if not signer_dir.exists():
            print(f"WARNING: no personal data found for signer '{signer}' at {signer_dir}")
            continue
        for class_dir in sorted(signer_dir.iterdir()):
            if not class_dir.is_dir():
                continue
            if class_dir.name not in label_to_idx:
                print(f"WARNING: '{class_dir.name}' under signer '{signer}' is not in the "
                      f"base label mapping — skipping (check for typos/casing).")
                continue
            for npy_path in sorted(class_dir.glob("*.npy")):
                arr = np.load(npy_path)
                if arr.shape != (SEQUENCE_LENGTH, FEATURE_SIZE):
                    print(f"WARNING: unexpected shape {arr.shape} in {npy_path}, skipping")
                    continue
                X.append(arr)
                y.append(label_to_idx[class_dir.name])
                filenames.append(str(npy_path))
                signer_names.append(signer)

    if not X:
        return (np.zeros((0, SEQUENCE_LENGTH, FEATURE_SIZE), dtype=np.float32),
                np.zeros((0,), dtype=np.int64), [], [])
    return np.stack(X).astype(np.float32), np.array(y, dtype=np.int64), filenames, signer_names


def discover_signers(personal_dir: Path) -> list[str]:
    if not personal_dir.exists():
        return []
    return sorted(d.name for d in personal_dir.iterdir() if d.is_dir())


def report(name: str, model, X, y, classes, out_path=None):
    if len(X) == 0:
        print(f"\n=== {name}: no samples, skipping ===")
        return None
    probs = model.predict(X, verbose=0)
    y_pred = np.argmax(probs, axis=1)
    print(f"\n=== {name} ({len(y)} samples) ===")
    rep = classification_report(y, y_pred, target_names=classes,
                                 output_dict=True, zero_division=0, labels=range(len(classes)))
    print(classification_report(y, y_pred, target_names=classes,
                                 zero_division=0, labels=range(len(classes))))
    cm = confusion_matrix(y, y_pred, labels=range(len(classes)))
    if out_path:
        with open(out_path, "w") as f:
            json.dump({"classification_report": rep, "confusion_matrix": cm.tolist(),
                       "num_samples": len(y)}, f, indent=2)
        print(f"Saved report to {out_path}")
    return rep


def main():
    args = parse_args()
    MODELS_DIR.mkdir(parents=True, exist_ok=True)
    base_data_dir = Path(args.base_data_dir)
    personal_data_dir = Path(args.personal_data_dir)

    # Frozen label mapping — never rewritten by this script.
    classes = load_label_classes()
    num_classes = len(classes)
    print(f"Using existing {num_classes}-class label mapping: {classes}")

    print(f"\nLoading base model from {args.base_model} ...")
    model = tf.keras.models.load_model(args.base_model)
    if model.output_shape[-1] != num_classes:
        raise ValueError(
            f"Base model outputs {model.output_shape[-1]} classes but label_classes.json "
            f"has {num_classes} — this model doesn't match the current label mapping."
        )

    all_signers = discover_signers(personal_data_dir)
    print(f"Signers found under {personal_data_dir}: {all_signers}")

    if args.signers:
        train_signers = [s for s in args.signers if s != args.holdout_signer]
    else:
        train_signers = [s for s in all_signers if s != args.holdout_signer]
    print(f"Signers included in training: {train_signers}")
    if args.holdout_signer:
        print(f"Held-out signer (excluded from training, evaluated separately): {args.holdout_signer}")

    # Base dataset — loaded with the frozen class list, no side effects.
    X_base_train, y_base_train, _ = load_split("train", classes, base_data_dir)
    X_base_val, y_base_val, _ = load_split("val", classes, base_data_dir)
    X_base_test, y_base_test, _ = load_split("test", classes, base_data_dir)
    print(f"\nBase dataset: train={len(y_base_train)} val={len(y_base_val)} test={len(y_base_test)}")

    X_personal_train, y_personal_train, _, signer_names_train = load_personal_data(
        personal_data_dir, classes, train_signers
    )
    print(f"Personal training data: {len(y_personal_train)} samples across {train_signers}")
    if signer_names_train:
        for s in train_signers:
            n = signer_names_train.count(s)
            print(f"  {s}: {n} samples")

    X_holdout, y_holdout, holdout_filenames, _ = (
        load_personal_data(personal_data_dir, classes, [args.holdout_signer])
        if args.holdout_signer else
        (np.zeros((0, SEQUENCE_LENGTH, FEATURE_SIZE), dtype=np.float32), np.zeros((0,), dtype=np.int64), [], [])
    )
    if args.holdout_signer:
        print(f"Held-out evaluation data ({args.holdout_signer}): {len(y_holdout)} samples")

    if args.eval_only:
        print("\n--eval-only: skipping training.")
        report("Base test set", model, X_base_test, y_base_test, classes,
               MODELS_DIR / "evaluation_base_test_evalonly.json")
        if args.holdout_signer:
            report(f"Held-out signer '{args.holdout_signer}'", model, X_holdout, y_holdout, classes,
                   MODELS_DIR / f"evaluation_holdout_{args.holdout_signer}_evalonly.json")
        return

    if len(X_personal_train) == 0:
        print("\nWARNING: no personal training data found — fine-tuning on base data only "
              "is equivalent to just continuing base training, which is unlikely to be "
              "what you want. Record some clips first.")

    X_train = np.concatenate([X_base_train, X_personal_train], axis=0) if len(X_personal_train) else X_base_train
    y_train = np.concatenate([y_base_train, y_personal_train], axis=0) if len(y_personal_train) else y_base_train
    print(f"\nCombined fine-tuning training set: {len(y_train)} samples "
          f"({len(y_base_train)} base + {len(y_personal_train)} personal)")

    if args.freeze_base_layers:
        print("Freezing LSTM layers — only the dense classification head will be fine-tuned.")
        for layer in model.layers:
            if "lstm" in layer.name.lower():
                layer.trainable = False

    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=args.learning_rate),
        loss="categorical_crossentropy",
        metrics=["accuracy"],
    )

    y_train_oh = tf.keras.utils.to_categorical(y_train, num_classes)
    y_base_val_oh = tf.keras.utils.to_categorical(y_base_val, num_classes)

    callbacks = [
        tf.keras.callbacks.EarlyStopping(
            monitor="val_loss", patience=args.patience, restore_best_weights=True
        ),
    ]

    print(f"\nFine-tuning for up to {args.epochs} epochs (lr={args.learning_rate})...")
    model.fit(
        X_train, y_train_oh,
        validation_data=(X_base_val, y_base_val_oh),
        epochs=args.epochs,
        batch_size=args.batch_size,
        callbacks=callbacks,
        verbose=2,
    )

    model.save(args.model_out)
    print(f"\nSaved fine-tuned model to {args.model_out} (base model file untouched)")

    report("Base test set (comparability check vs. pre-fine-tune)", model,
           X_base_test, y_base_test, classes, MODELS_DIR / "evaluation_base_test_finetuned.json")
    if args.holdout_signer:
        report(f"Held-out signer '{args.holdout_signer}' (generalization check)", model,
               X_holdout, y_holdout, classes,
               MODELS_DIR / f"evaluation_holdout_{args.holdout_signer}.json")


if __name__ == "__main__":
    main()