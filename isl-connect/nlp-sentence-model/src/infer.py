"""
gloss sequence -> natural sentence. Emits the contract in /docs/CONTRACTS.md.
"""
import json


def gloss_to_sentence(gloss_sequence: list[str], lang: str = "en") -> str:
    # placeholder until the trained model is wired in
    text = " ".join(gloss_sequence).title()
    return json.dumps({"text": text, "lang": lang})


if __name__ == "__main__":
    print(gloss_to_sentence(["I", "NEED", "WATER"]))
