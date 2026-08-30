"""
Evaluate the fine-tuned gloss-to-sentence model on the held-out validation
split — the same split used during training (same random_state), so this
tests examples the model never trained on.

Reports:
  - Exact match accuracy (predicted sentence == expected sentence, exactly)
  - BLEU score (how close predictions are, even when not an exact match)
  - The worst mismatches, printed out, so you can see WHAT it's getting wrong

Run this file directly:
    python src/evaluate.py
"""
import json
from pathlib import Path

from sklearn.model_selection import train_test_split
from transformers import T5Tokenizer, T5ForConditionalGeneration

DATA_PATH = Path(__file__).resolve().parent.parent / "data" / "synthetic_train.json"
MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "gloss-to-text"
PROMPT_PREFIX = "translate ISL gloss to English: "  # must match train.py / infer.py exactly


def load_val_split():
    with open(DATA_PATH) as f:
        rows = json.load(f)
    # same split as train.py (same test_size, same random_state) so this is
    # genuinely the held-out set the model did NOT train on
    _, val_rows = train_test_split(rows, test_size=0.15, random_state=42)
    return val_rows


def generate(model, tokenizer, gloss_sequence: list[str]) -> str:
    input_text = PROMPT_PREFIX + " ".join(gloss_sequence)
    input_ids = tokenizer(input_text, return_tensors="pt").input_ids
    output_ids = model.generate(input_ids, max_length=32, num_beams=4)
    return tokenizer.decode(output_ids[0], skip_special_tokens=True)


def exact_match_accuracy(predictions, references) -> float:
    correct = sum(
        p.strip().lower() == r.strip().lower()
        for p, r in zip(predictions, references)
    )
    return correct / len(predictions)


def bleu_score(predictions, references) -> float:
    import evaluate
    bleu = evaluate.load("sacrebleu")
    refs = [[r] for r in references]  # sacrebleu expects list-of-lists
    result = bleu.compute(predictions=predictions, references=refs)
    return result["score"]


def main():
    print(f"Loading model from {MODEL_DIR}")
    tokenizer = T5Tokenizer.from_pretrained(MODEL_DIR)
    model = T5ForConditionalGeneration.from_pretrained(MODEL_DIR)

    val_rows = load_val_split()
    print(f"Evaluating on {len(val_rows)} held-out validation examples\n")

    predictions = []
    references = []
    mismatches = []

    for row in val_rows:
        gloss_sequence = row["glossSequence"]
        expected = row["text"]
        predicted = generate(model, tokenizer, gloss_sequence)

        predictions.append(predicted)
        references.append(expected)

        if predicted.strip().lower() != expected.strip().lower():
            mismatches.append((gloss_sequence, expected, predicted))

    acc = exact_match_accuracy(predictions, references)
    bleu = bleu_score(predictions, references)

    print("=" * 60)
    print(f"Exact match accuracy: {acc:.1%}  ({len(val_rows) - len(mismatches)}/{len(val_rows)} correct)")
    print(f"BLEU score:           {bleu:.1f}  (0-100, higher is better)")
    print("=" * 60)

    if mismatches:
        print(f"\n{len(mismatches)} mismatches — showing up to 15:\n")
        for gloss_sequence, expected, predicted in mismatches[:15]:
            print(f"  input:    {gloss_sequence}")
            print(f"  expected: {expected}")
            print(f"  got:      {predicted}")
            print()
    else:
        print("\nNo mismatches — every validation example matched exactly.")


if __name__ == "__main__":
    main()