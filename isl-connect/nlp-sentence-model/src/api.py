"""
FastAPI wrapper around infer.py's gloss_to_sentence(), exposing the
/convert endpoint per /docs/CONTRACTS.md:

    POST /convert
    body:     {"signs": ["I", "HAPPY"]}
    response: {"text": "I am happy", "lang": "en"}

Run this file directly (from inside nlp-sentence-model/):
    uvicorn src.api:app --reload --port 8000

Or, if you're already inside src/:
    uvicorn api:app --reload --port 8000
"""
import json
import sys
from pathlib import Path

# Make sure this file's own folder (src/) is on the import path, regardless
# of whether this is launched as `uvicorn src.api:app` (project root) or
# `uvicorn api:app` (from inside src/) — without this, `import infer` below
# can fail to find infer.py depending on how uvicorn was invoked.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import infer

app = FastAPI(title="ISL Sign Sequence to Sentence API")

# Allows the frontend (running on a different port, e.g. localhost:5173)
# to actually call this API from the browser. Without this, the browser
# blocks the request even if the server itself is running fine.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for hackathon simplicity; tighten before any real deployment
    allow_methods=["*"],
    allow_headers=["*"],
)


class SignInput(BaseModel):
    signs: list[str]
    lang: str = "en"


class SentenceOutput(BaseModel):
    text: str
    lang: str


@app.get("/")
def health_check():
    """Quick way to confirm the server is up: visit http://localhost:8000/"""
    return {"status": "ok", "service": "nlp-sentence-model"}


@app.post("/convert", response_model=SentenceOutput)
def convert(input: SignInput):
    if not isinstance(input.signs, list):
        raise HTTPException(status_code=400, detail="'signs' must be a list of strings")

    result_json = infer.gloss_to_sentence(input.signs, lang=input.lang)
    result = json.loads(result_json)
    return result


if __name__ == "__main__":
    # Lets you also just run `python src/api.py` directly for a quick check,
    # though `uvicorn ... --reload` (see module docstring) is better for
    # actual development since it restarts automatically on code changes.
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)