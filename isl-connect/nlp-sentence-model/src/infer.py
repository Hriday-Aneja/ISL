"""
gloss sequence -> natural sentence. Emits the contract in /docs/CONTRACTS.md:
    {"text": "...", "lang": "en"}

Rule-based dictionary is checked FIRST — guaranteed-correct output for your
core demo phrases, zero risk of the model saying something odd on stage.
Anything not in the dictionary falls back to the fine-tuned T5 model.
"""
import json
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent.parent / "models" / "gloss-to-text"
PROMPT_PREFIX = "translate ISL gloss to English: "  # must match train.py exactly — do not edit one without the other

# ---------------------------------------------------------------------------
# Rule-based fallback / demo safety net.
# Add every phrase you actually plan to demo on stage here. Tuple key ->
# guaranteed sentence, regardless of what the trained model might produce.
# ---------------------------------------------------------------------------
RULES = {
    ("HELLO",): "Hello",
    ("THANK_YOU",): "Thank you",
    ("PLEASE",): "Please",
    ("SORRY",): "I am sorry",
    ("YES",): "Yes",
    ("NO",): "No",
    ("HELP",): "I need help",
    ("HELP", "PLEASE"): "Please help me",
    ("HELP", "WATER"): "I need help getting water",
    ("WATER",): "Water",
    ("FOOD",): "Food",
    ("WATER", "PLEASE"): "Water, please",
    ("FOOD", "PLEASE"): "Food, please",
    ("WHERE", "HOME"): "Where is home",
    ("WHERE", "SCHOOL"): "Where is the school",
    ("WHERE", "HOSPITAL"): "Where is the hospital",
    ("TODAY",): "Today",
    ("TOMORROW",): "Tomorrow",
    ("UNDERSTAND",): "I understand",
    ("STOP",): "Stop",
    ("WAIT",): "Please wait",
    ("GO", "HOME"): "Going home",
    ("GO", "SCHOOL"): "Going to school",
    ("COME",): "Please come here",
}
# NOTE: ("MY","NAME") is deliberately NOT hardcoded — the name itself varies
# each time, so this is left to the trained model, which correctly learned
# the "My name is ___" pattern during training (verified: "My name is Divya").

_tokenizer = None
_model = None


def _load_model() -> None:
    """Loads the fine-tuned model once, the first time it's actually needed
    (not at import time) — so this file can still be imported and tested
    for its rule-based paths even before a trained model exists."""
    global _tokenizer, _model
    if _model is not None:
        return
    from transformers import T5Tokenizer, T5ForConditionalGeneration

    if not MODEL_DIR.exists():
        raise FileNotFoundError(
            f"No trained model at {MODEL_DIR}. Run train.py first, or stick "
            f"to gloss sequences covered by the RULES dictionary above."
        )
    _tokenizer = T5Tokenizer.from_pretrained(MODEL_DIR)
    _model = T5ForConditionalGeneration.from_pretrained(MODEL_DIR)


def _generate_with_model(gloss_sequence: list[str]) -> str:
    _load_model()
    input_text = PROMPT_PREFIX + " ".join(gloss_sequence)
    input_ids = _tokenizer(input_text, return_tensors="pt").input_ids
    output_ids = _model.generate(input_ids, max_length=32, num_beams=4)
    return _tokenizer.decode(output_ids[0], skip_special_tokens=True)


def gloss_to_sentence(gloss_sequence: list[str], lang: str = "en") -> str:
    """
    Main entry point — this is what the rest of the team calls.
    Returns a JSON string matching /docs/CONTRACTS.md: {"text": ..., "lang": ...}
    """
    if not gloss_sequence:
        return json.dumps({"text": "", "lang": lang})

    key = tuple(gloss_sequence)

    if key in RULES:
        text = RULES[key]
    else:
        try:
            text = _generate_with_model(gloss_sequence)
        except FileNotFoundError:
            # No trained model available yet and no rule match — degrade
            # gracefully instead of crashing the whole pipeline.
            text = " ".join(gloss_sequence).title()

    return json.dumps({"text": text, "lang": lang})


if __name__ == "__main__":
    tests = [
        ["HELLO"],
        ["HELP"],
        ["MY", "NAME"],
        ["THANK_YOU"],
        ["WHERE", "HOME"],
        ["WATER", "PLEASE"],
        ["STOP"],
    ]
    for t in tests:
        print(t, "->", gloss_to_sentence(t))