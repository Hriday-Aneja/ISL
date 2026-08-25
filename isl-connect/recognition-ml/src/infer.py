"""
Real-time inference: load trained model, run on live landmark sequence,
emit the gloss contract defined in /docs/CONTRACTS.md.
"""
import json
import time


def emit_gloss_event(gloss: str, confidence: float) -> str:
    event = {"gloss": gloss, "confidence": confidence, "timestamp": int(time.time() * 1000)}
    return json.dumps(event)


if __name__ == "__main__":
    # placeholder until model + landmark pipeline are wired together
    print(emit_gloss_event("HELLO", 0.94))
