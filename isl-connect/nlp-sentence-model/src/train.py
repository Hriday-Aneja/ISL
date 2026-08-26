"""
Fine-tune a small pretrained seq2seq model (t5-small) on the synthetic
dataset produced by generate_synthetic_data.py.

Reads:  data/synthetic_train.json   (list of {"glossSequence": [...], "text": "..."})
Writes: models/gloss-to-text/       (the fine-tuned model + tokenizer)

Run this file directly:
    python src/train.py

Runs fine on Google Colab's free GPU. On CPU-only it will be slow but
still works for this dataset size — just expect it to take longer.
"""
import json
from pathlib import Path

from sklearn.model_selection import train_test_split
from datasets import Dataset
from transformers import (
    T5Tokenizer,
    T5ForConditionalGeneration,
    Seq2SeqTrainingArguments,
    Seq2SeqTrainer,
    DataCollatorForSeq2Seq,
)

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "synthetic_train.json"
MODEL_OUT_DIR = Path(__file__).resolve().parent.parent / "models" / "gloss-to-text"
CHECKPOINT_DIR = Path(__file__).resolve().parent.parent / "models" / "_checkpoints"

MODEL_NAME = "t5-small"
MAX_LEN = 32
PROMPT_PREFIX = "translate ISL gloss to English: "


def format_input(gloss_sequence: list[str]) -> str:
    """Must match the exact format used in infer.py — if these two ever
    drift apart, the model will underperform at inference time even
    though it trained fine."""
    return PROMPT_PREFIX + " ".join(gloss_sequence)


def load_examples() -> list[dict]:
    if not DATA_PATH.exists():
        raise FileNotFoundError(
            f"{DATA_PATH} not found. Run generate_synthetic_data.py first."
        )
    with open(DATA_PATH) as f:
        rows = json.load(f)
    if not rows:
        raise ValueError(f"{DATA_PATH} is empty — nothing to train on.")
    return rows


def to_hf_dataset(rows: list[dict]) -> Dataset:
    return Dataset.from_dict({
        "input_text": [format_input(r["glossSequence"]) for r in rows],
        "target_text": [r["text"] for r in rows],
    })


def main():
    print(f"Loading training data from {DATA_PATH}")
    rows = load_examples()
    print(f"Loaded {len(rows)} examples")

    train_rows, val_rows = train_test_split(rows, test_size=0.15, random_state=42)
    print(f"Train: {len(train_rows)}  Validation: {len(val_rows)}")

    train_dataset = to_hf_dataset(train_rows)
    val_dataset = to_hf_dataset(val_rows)

    print(f"Loading pretrained {MODEL_NAME} (downloads once, then cached)")
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model = T5ForConditionalGeneration.from_pretrained(MODEL_NAME)

    def preprocess(examples):
        model_inputs = tokenizer(
            examples["input_text"], max_length=MAX_LEN, truncation=True, padding="max_length"
        )
        labels = tokenizer(
            examples["target_text"], max_length=MAX_LEN, truncation=True, padding="max_length"
        )
        model_inputs["labels"] = labels["input_ids"]
        return model_inputs

    print("Tokenizing...")
    train_tokenized = train_dataset.map(preprocess, batched=True, remove_columns=train_dataset.column_names)
    val_tokenized = val_dataset.map(preprocess, batched=True, remove_columns=val_dataset.column_names)

    training_args = Seq2SeqTrainingArguments(
        output_dir=str(CHECKPOINT_DIR),
        eval_strategy="epoch",
        save_strategy="epoch",
        learning_rate=3e-4,
        per_device_train_batch_size=8,
        per_device_eval_batch_size=8,
        num_train_epochs=15,          # small dataset -> more epochs is fine
        weight_decay=0.01,
        predict_with_generate=True,
        load_best_model_at_end=True,
        logging_steps=10,
        save_total_limit=2,           # don't fill the disk with every checkpoint
    )

    data_collator = DataCollatorForSeq2Seq(tokenizer, model=model)

    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=train_tokenized,
        eval_dataset=val_tokenized,
        data_collator=data_collator,
        processing_class=tokenizer,
    )

    print("Starting training...")
    trainer.train()

    print(f"Saving fine-tuned model to {MODEL_OUT_DIR}")
    MODEL_OUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(MODEL_OUT_DIR)
    tokenizer.save_pretrained(MODEL_OUT_DIR)

    print("Done. infer.py should now load the model from this same folder.")


if __name__ == "__main__":
    main()