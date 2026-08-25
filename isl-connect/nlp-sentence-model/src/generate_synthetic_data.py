"""
Build a synthetic (gloss-sequence, natural-sentence) training set from
templates, so training doesn't depend on finding a real ISL-English
parallel corpus. Reads the shared vocabulary so gloss IDs always match
what recognition-ml actually outputs.
"""
import json
import random
from pathlib import Path

VOCAB_PATH = Path(__file__).resolve().parents[2] / "shared" / "vocabulary.json"

# gloss-sequence template -> natural sentence template
# extend this list as a team; keep gloss IDs matching shared/vocabulary.json
TEMPLATES = [
    (["MY", "NAME"], "My name is {name}"),
    (["I", "NEED", "WATER"], "I need water"),
    (["HELP"], "I need help"),
    (["THANK_YOU"], "Thank you"),
    (["WHERE", "HOME"], "Where is home"),
    (["SORRY"], "I am sorry"),
]

SAMPLE_NAMES = ["Ravi", "Priya", "Amit", "Sara", "Karan"]


def load_vocab() -> list[str]:
    with open(VOCAB_PATH) as f:
        return json.load(f)["signs"]


def generate(n_per_template: int = 20) -> list[dict]:
    rows = []
    for gloss_seq, sentence_template in TEMPLATES:
        for _ in range(n_per_template):
            if "{name}" in sentence_template:
                sentence = sentence_template.format(name=random.choice(SAMPLE_NAMES))
            else:
                sentence = sentence_template
            rows.append({"glossSequence": gloss_seq, "text": sentence})
    return rows


if __name__ == "__main__":
    vocab = load_vocab()
    print(f"Loaded {len(vocab)} shared gloss IDs")
    data = generate()
    out_path = Path(__file__).parent.parent / "data" / "synthetic_train.json"
    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)
    print(f"Wrote {len(data)} synthetic training pairs to {out_path}")
