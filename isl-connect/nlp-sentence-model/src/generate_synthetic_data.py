"""
Build a synthetic (gloss-sequence, natural-sentence) training set from
templates, so training doesn't depend on finding a real ISL-English
parallel corpus. Reads the shared vocabulary so gloss IDs always match
what recognition-ml actually outputs.

Run this file directly:
    python src/generate_synthetic_data.py

It writes data/synthetic_train.json — that file is what train.py reads.

IMPORTANT — flag this to your team:
shared/vocabulary.json is currently MISSING a few very basic words that
show up in your teammates' own example messages: "I", "YOU", "ME", "NEED".
Every template below only uses gloss IDs that currently exist in the real
vocabulary file, which is why phrases like "I need water" aren't available
yet — there's no "I" or "NEED" sign to build them from. Get your team to
add these to shared/vocabulary.json (and to Hriday's and Anshu's target
sign lists) ASAP, then re-add richer templates using them.
"""
import json
import random
from pathlib import Path

VOCAB_PATH = Path(__file__).resolve().parents[2] / "shared" / "vocabulary.json"

# gloss-sequence template -> natural sentence template
# {name} gets substituted with a random sample name at generation time.
# Extend this list as your team's real vocabulary/phrase set grows — every
# gloss ID used here should exist in shared/vocabulary.json.
TEMPLATES = [
    # Greetings / courtesy
    (["HELLO"], "Hello"),
    (["THANK_YOU"], "Thank you"),
    (["PLEASE"], "Please"),
    (["SORRY"], "I am sorry"),
    (["YES"], "Yes"),
    (["NO"], "No"),
    (["HELLO", "MY", "NAME"], "Hello, my name is {name}"),

    # Identity
    (["MY", "NAME"], "My name is {name}"),
    (["YOUR", "NAME"], "What is your name"),
    (["MY", "NAME", "GOOD"], "My name is {name}, nice to meet you"),

    # Needs / requests (limited until I/YOU/NEED exist in shared vocab)
    (["HELP"], "I need help"),
    (["HELP", "PLEASE"], "Please help me"),
    (["HELP", "WATER"], "I need help getting water"),
    (["WATER"], "Water"),
    (["FOOD"], "Food"),
    (["WATER", "PLEASE"], "Water, please"),
    (["FOOD", "PLEASE"], "Food, please"),

    # States / feelings
    (["GOOD"], "I am good"),
    (["BAD"], "I am not good"),
    (["TODAY", "GOOD"], "Today is good"),
    (["TODAY", "BAD"], "Today is not good"),

    # Questions
    (["WHERE", "HOME"], "Where is home"),
    (["WHERE", "SCHOOL"], "Where is the school"),
    (["WHERE", "HOSPITAL"], "Where is the hospital"),
    (["WHEN"], "When"),
    (["WHY"], "Why"),
    (["HOW"], "How"),
    (["WHO"], "Who is this"),
    (["TIME"], "What time is it"),

    # Places / plans
    (["GO", "HOME"], "Going home"),
    (["GO", "SCHOOL"], "Going to school"),
    (["GO", "HOSPITAL"], "Going to the hospital"),
    (["COME"], "Please come here"),
    (["WAIT"], "Please wait"),
    (["STOP"], "Stop"),

    # Time
    (["TODAY"], "Today"),
    (["TOMORROW"], "Tomorrow"),

    # Understanding
    (["UNDERSTAND"], "I understand"),
]

SAMPLE_NAMES = ["Ravi", "Priya", "Amit", "Sara", "Karan", "Neha", "Arjun", "Divya"]


def load_vocab() -> list[str]:
    with open(VOCAB_PATH) as f:
        data = json.load(f)
    return data["signs"]


def validate_templates(vocab: list[str]) -> None:
    """Fail loudly if a template uses a gloss ID not in shared/vocabulary.json,
    instead of silently generating bad training data."""
    vocab_set = set(vocab)
    bad = []
    for gloss_seq, _ in TEMPLATES:
        for gloss in gloss_seq:
            if gloss not in vocab_set:
                bad.append(gloss)
    if bad:
        raise ValueError(
            f"Templates reference gloss IDs not in shared/vocabulary.json: "
            f"{sorted(set(bad))}. Fix the template or add the sign to the "
            f"shared vocabulary first — every module reads from that file."
        )


def generate(n_per_template: int = 20) -> list[dict]:
    rows = []
    for gloss_seq, sentence_template in TEMPLATES:
        for _ in range(n_per_template):
            if "{name}" in sentence_template:
                sentence = sentence_template.format(name=random.choice(SAMPLE_NAMES))
            else:
                sentence = sentence_template
            rows.append({"glossSequence": gloss_seq, "text": sentence})
    random.shuffle(rows)
    return rows


if __name__ == "__main__":
    vocab = load_vocab()
    print(f"Loaded {len(vocab)} shared gloss IDs")

    validate_templates(vocab)
    print(f"All {len(TEMPLATES)} templates use valid gloss IDs")

    data = generate()

    out_dir = Path(__file__).parent.parent / "data"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "synthetic_train.json"

    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Wrote {len(data)} synthetic training pairs to {out_path}")
    print(f"Example: {data[0]}")