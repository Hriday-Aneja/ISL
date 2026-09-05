from pathlib import Path
import json
import csv
from collections import Counter, defaultdict

import numpy as np
import tensorflow as tf
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix


# ============================================================
# CONFIG
# ============================================================

BASE_MODEL = Path("models/isl_recognition_model_kfold.keras")
PERSONALIZED_MODEL = Path("models/isl_recognition_model_hriday_split.keras")

TEST_DIR = Path("data/personal_features_hriday_test/Hriday")
LABEL_MAP_PATH = Path("models/label_classes.json")

OUTPUT_CSV = Path("models/hriday_personalization_predictions.csv")


# ============================================================
# LOAD LABELS
# ============================================================

with open(LABEL_MAP_PATH, "r", encoding="utf-8") as f:
    label_classes = json.load(f)

# Handle either:
# {"0": "Beautiful", ...}
# or
# ["Beautiful", "Dog", ...]
if isinstance(label_classes, dict):
    label_classes = {
        int(k): v for k, v in label_classes.items()
    }
    idx_to_label = label_classes
else:
    idx_to_label = {
        i: label for i, label in enumerate(label_classes)
    }

label_to_idx = {
    label: idx for idx, label in idx_to_label.items()
}

print(f"Loaded {len(idx_to_label)} classes")


# ============================================================
# LOAD TEST DATA
# ============================================================

X = []
y = []
filenames = []

for class_dir in sorted(TEST_DIR.iterdir()):

    if not class_dir.is_dir():
        continue

    actual_label = class_dir.name

    if actual_label not in label_to_idx:
        print(f"WARNING: Unknown class skipped: {actual_label}")
        continue

    for file in sorted(class_dir.glob("*.npy")):

        data = np.load(file)

        if data.shape != (100, 225):
            print(
                f"WARNING: Invalid shape {data.shape}: {file}"
            )
            continue

        X.append(data)
        y.append(label_to_idx[actual_label])
        filenames.append(file.name)


X = np.asarray(X, dtype=np.float32)
y = np.asarray(y, dtype=np.int32)

print()
print("============================================================")
print("TEST DATA")
print("============================================================")
print(f"Samples : {len(X)}")
print(f"Shape   : {X.shape}")
print()


# ============================================================
# LOAD MODELS
# ============================================================

print("Loading base model...")
base_model = tf.keras.models.load_model(BASE_MODEL)

print("Loading personalized model...")
personalized_model = tf.keras.models.load_model(PERSONALIZED_MODEL)

print("Models loaded.")
print()


# ============================================================
# PREDICTIONS
# ============================================================

print("Running base model predictions...")
base_probs = base_model.predict(X, verbose=0)

print("Running personalized model predictions...")
personalized_probs = personalized_model.predict(X, verbose=0)


base_pred = np.argmax(base_probs, axis=1)
personalized_pred = np.argmax(personalized_probs, axis=1)

base_conf = np.max(base_probs, axis=1)
personalized_conf = np.max(personalized_probs, axis=1)


# ============================================================
# ACCURACY
# ============================================================

base_accuracy = accuracy_score(y, base_pred)
personalized_accuracy = accuracy_score(y, personalized_pred)

print()
print("============================================================")
print("ACCURACY")
print("============================================================")

print(
    f"Base Model          : "
    f"{base_accuracy * 100:.2f}% "
    f"({np.sum(base_pred == y)}/{len(y)})"
)

print(
    f"Personalized Model  : "
    f"{personalized_accuracy * 100:.2f}% "
    f"({np.sum(personalized_pred == y)}/{len(y)})"
)

print(
    f"Absolute Improvement: "
    f"{(personalized_accuracy - base_accuracy) * 100:+.2f} percentage points"
)

print()


# ============================================================
# DETAILED PREDICTION TABLE
# ============================================================

print("============================================================")
print("INDIVIDUAL PREDICTIONS")
print("============================================================")

for i in range(len(y)):

    actual = idx_to_label[y[i]]
    base_label = idx_to_label[base_pred[i]]
    personal_label = idx_to_label[personalized_pred[i]]

    base_correct = base_pred[i] == y[i]
    personal_correct = personalized_pred[i] == y[i]

    print(
        f"{i+1:02d}. "
        f"{filenames[i]:35s} | "
        f"Actual: {actual:15s} | "
        f"Base: {base_label:15s} "
        f"({base_conf[i]:.3f}) "
        f"{'✓' if base_correct else '✗'} | "
        f"Personal: {personal_label:15s} "
        f"({personalized_conf[i]:.3f}) "
        f"{'✓' if personal_correct else '✗'}"
    )


# ============================================================
# SAVE CSV
# ============================================================

with open(
    OUTPUT_CSV,
    "w",
    newline="",
    encoding="utf-8"
) as f:

    writer = csv.writer(f)

    writer.writerow([
        "filename",
        "actual",
        "base_prediction",
        "base_confidence",
        "base_correct",
        "personalized_prediction",
        "personalized_confidence",
        "personalized_correct",
        "changed_prediction",
    ])

    for i in range(len(y)):

        writer.writerow([
            filenames[i],
            idx_to_label[y[i]],
            idx_to_label[base_pred[i]],
            f"{base_conf[i]:.6f}",
            base_pred[i] == y[i],
            idx_to_label[personalized_pred[i]],
            f"{personalized_conf[i]:.6f}",
            personalized_pred[i] == y[i],
            base_pred[i] != personalized_pred[i],
        ])

print()
print(f"Detailed CSV saved to:")
print(OUTPUT_CSV)


# ============================================================
# PREDICTION DISTRIBUTION
# ============================================================

print()
print("============================================================")
print("PREDICTION DISTRIBUTION")
print("============================================================")

base_counts = Counter(
    idx_to_label[p] for p in base_pred
)

personalized_counts = Counter(
    idx_to_label[p] for p in personalized_pred
)

print()
print("BASE MODEL:")
for label, count in base_counts.most_common():
    print(f"{label:20s}: {count}")

print()
print("PERSONALIZED MODEL:")
for label, count in personalized_counts.most_common():
    print(f"{label:20s}: {count}")


# ============================================================
# CHANGED PREDICTIONS
# ============================================================

print()
print("============================================================")
print("CHANGED PREDICTIONS")
print("============================================================")

changed = 0

for i in range(len(y)):

    if base_pred[i] != personalized_pred[i]:

        changed += 1

        actual = idx_to_label[y[i]]
        base_label = idx_to_label[base_pred[i]]
        personalized_label = idx_to_label[personalized_pred[i]]
        base_correct = base_pred[i] == y[i]
        personal_correct = personalized_pred[i] == y[i]

        print(
            f"{filenames[i]:35s} | "
            f"Actual: {actual:15s} | "
            f"{base_label:15s} -> {personal_label:15s} | "
            f"{'✓' if base_correct else '✗'} -> "
            f"{'✓' if personal_correct else '✗'}"
        )

print()
print(f"Total changed predictions: {changed}/{len(y)}")


# ============================================================
# CONFUSION MATRICES
# ============================================================

labels = list(range(len(idx_to_label)))

base_cm = confusion_matrix(
    y,
    base_pred,
    labels=labels
)

personalized_cm = confusion_matrix(
    y,
    personalized_pred,
    labels=labels
)


print()
print("============================================================")
print("CONFUSION SUMMARY")
print("============================================================")

print()
print("BASE MODEL:")
for actual_idx in labels:

    row = base_cm[actual_idx]

    if row.sum() == 0:
        continue

    predicted_idx = np.argmax(row)

    if predicted_idx != actual_idx:

        print(
            f"Actual {idx_to_label[actual_idx]:15s} "
            f"-> mostly predicted as "
            f"{idx_to_label[predicted_idx]:15s} "
            f"({row[predicted_idx]}/{row.sum()})"
        )


print()
print("PERSONALIZED MODEL:")
for actual_idx in labels:

    row = personalized_cm[actual_idx]

    if row.sum() == 0:
        continue

    predicted_idx = np.argmax(row)

    if predicted_idx != actual_idx:

        print(
            f"Actual {idx_to_label[actual_idx]:15s} "
            f"-> mostly predicted as "
            f"{idx_to_label[predicted_idx]:15s} "
            f"({row[predicted_idx]}/{row.sum()})"
        )


# ============================================================
# PER-CLASS RESULT
# ============================================================

print()
print("============================================================")
print("PER-CLASS RESULTS")
print("============================================================")

print(
    f"{'Class':20s} "
    f"{'N':>3s} "
    f"{'Base':>8s} "
    f"{'Personal':>10s}"
)

for idx in labels:

    total = np.sum(y == idx)

    if total == 0:
        continue

    base_correct_count = np.sum(
        (y == idx) & (base_pred == idx)
    )

    personal_correct_count = np.sum(
        (y == idx) & (personalized_pred == idx)
    )

    print(
        f"{idx_to_label[idx]:20s} "
        f"{total:3d} "
        f"{base_correct_count:3d}/{total:<3d} "
        f"{personal_correct_count:3d}/{total:<3d}"
    )


print()
print("============================================================")
print("DONE")
print("============================================================")