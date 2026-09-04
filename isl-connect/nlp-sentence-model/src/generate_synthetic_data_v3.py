"""
Build a synthetic (gloss-sequence, natural-sentence) training set — VERSION 3,
built for the CONFIRMED REAL vocabulary from recognition-ml/sign_reference.html
(24 signs: family words, occupations, places, pronouns, qualities, greetings).

This replaces the earlier v2 (which was based on classes.json — since
confirmed by Hriday to NOT be his real vocabulary).

Run this file directly:
    python src/generate_synthetic_data.py

It writes data/synthetic_train.json — that file is what train.py reads.
"""
import json
import random
from pathlib import Path

VOCAB_PATH = Path(__file__).resolve().parents[2] / "shared" / "vocabulary.json"

# --------------------------------------------------------------------------
# Word categories, built from the confirmed 24-sign vocabulary. Every gloss
# ID here must exist in shared/vocabulary.json — validate_templates() checks.
# --------------------------------------------------------------------------
FAMILY = {
    "DAUGHTER": "daughter", "FATHER": "father", "MOTHER": "mother",
    "PARENT": "parent", "SON": "son",
}

OCCUPATIONS = {
    "DOCTOR": "doctor", "LAWYER": "lawyer", "STUDENT": "student",
    "TEACHER": "teacher", "WAITER": "waiter",
}

PLACES = {
    "HOUSE": "house", "RESTAURANT": "restaurant", "TRAIN_STATION": "train station",
}

ANIMALS = {"DOG": "dog", "BIRD": "bird"}

QUALITIES = {"BEAUTIFUL": "beautiful", "HAPPY": "happy", "SAD": "sad"}

GREETINGS = {"HELLO": "Hello", "THANK_YOU": "Thank you"}

# pronoun -> (display form, "to be" verb form)
PRONOUNS = {
    "I": ("I", "am"),
    "HE": ("He", "is"),
    "SHE": ("She", "is"),
    "YOU": ("You", "are"),
}


def build_examples():
    rows = []

    # Standalone family -> "This is my {family}."
    for gloss, word in FAMILY.items():
        rows.append(([gloss], f"This is my {word}"))

    # Standalone occupations -> "This is a {occupation}."
    for gloss, word in OCCUPATIONS.items():
        rows.append(([gloss], f"This is a {word}"))

    # Standalone places -> "This is a {place}."
    for gloss, word in PLACES.items():
        rows.append(([gloss], f"This is a {word}"))

    # Standalone animals -> "This is a {animal}."
    for gloss, word in ANIMALS.items():
        rows.append(([gloss], f"This is a {word}"))

    # Standalone qualities -> "It is {quality}."
    for gloss, word in QUALITIES.items():
        rows.append(([gloss], f"It is {word}"))

    # Standalone greetings -> fixed
    for gloss, sentence in GREETINGS.items():
        rows.append(([gloss], sentence))

    # Standalone pronouns -> just the pronoun itself
    for gloss, (display, _) in PRONOUNS.items():
        rows.append(([gloss], display))

    # [PRONOUN, QUALITY] -> "I am happy." / "He is sad." / "You are beautiful."
    for p_gloss, (display, verb) in PRONOUNS.items():
        for q_gloss, q_word in QUALITIES.items():
            rows.append(([p_gloss, q_gloss], f"{display} {verb} {q_word}"))

    # [PRONOUN, OCCUPATION] -> "I am a doctor." / "She is a teacher."
    for p_gloss, (display, verb) in PRONOUNS.items():
        for o_gloss, o_word in OCCUPATIONS.items():
            rows.append(([p_gloss, o_gloss], f"{display} {verb} a {o_word}"))

    # [PRONOUN, PLACE] -> "I am at the house." / "He is at the restaurant."
    for p_gloss, (display, verb) in PRONOUNS.items():
        for pl_gloss, pl_word in PLACES.items():
            rows.append(([p_gloss, pl_gloss], f"{display} {verb} at the {pl_word}"))

    # [FAMILY, QUALITY] -> "My mother is happy."
    for f_gloss, f_word in FAMILY.items():
        for q_gloss, q_word in QUALITIES.items():
            rows.append(([f_gloss, q_gloss], f"My {f_word} is {q_word}"))

    # [FAMILY, OCCUPATION] -> "My father is a doctor."
    for f_gloss, f_word in FAMILY.items():
        for o_gloss, o_word in OCCUPATIONS.items():
            rows.append(([f_gloss, o_gloss], f"My {f_word} is a {o_word}"))

    return rows


def load_vocab() -> list[str]:
    with open(VOCAB_PATH) as f:
        data = json.load(f)
    return data["signs"]


def validate_templates(vocab: list[str], rows: list[tuple]) -> None:
    vocab_set = set(vocab)
    bad = set()
    for gloss_seq, _ in rows:
        for gloss in gloss_seq:
            if gloss not in vocab_set:
                bad.add(gloss)
    if bad:
        raise ValueError(
            f"Templates reference gloss IDs not in shared/vocabulary.json: "
            f"{sorted(bad)}. Update shared/vocabulary.json first — every "
            f"module reads from that one file."
        )


if __name__ == "__main__":
    vocab = load_vocab()
    print(f"Loaded {len(vocab)} shared gloss IDs")

    rows = build_examples()
    validate_templates(vocab, rows)
    print(f"All {len(rows)} generated examples use valid gloss IDs")

    data = [{"glossSequence": g, "text": s} for g, s in rows]
    random.shuffle(data)

    out_dir = Path(__file__).parent.parent / "data"
    out_dir.mkdir(exist_ok=True)
    out_path = out_dir / "synthetic_train.json"

    with open(out_path, "w") as f:
        json.dump(data, f, indent=2)

    print(f"Wrote {len(data)} synthetic training pairs to {out_path}")
    print(f"Example: {data[0]}")