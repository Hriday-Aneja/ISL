# nlp-sentence-model

Converts a recognized ISL sign sequence into a natural English sentence.

```
Input:  {"signs": ["MOTHER", "HAPPY"]}
Output: {"text": "My mother is happy", "lang": "en"}
```

Built for the confirmed 24-sign vocabulary in `recognition-ml/sign_reference.html`
(matches `shared/vocabulary.json`).

---

## Quickstart — just want to USE the API? (most teammates)

You don't need to understand the ML to call this — follow these steps and
you'll have a local server running that returns real sentences.

### 1. Install Python 3.10+
Check you have it:
```
python --version
```
If not, download from [python.org](https://python.org).

### 2. Open a terminal in this folder
```
cd nlp-sentence-model
```

### 3. Create and activate a virtual environment
This keeps this project's packages separate from everything else on your
computer — skipping this step has caused real problems before, don't skip it.

**Windows:**
```
python -m venv venv
venv\Scripts\activate
```

**Mac/Linux:**
```
python -m venv venv
source venv/bin/activate
```

You should see `(venv)` at the start of your terminal line once it's active.

### 4. Install dependencies
```
pip install -r requirements.txt
```

### 5. Get the trained model
The trained model isn't in this Git repo (model files are large and
excluded — check `.gitignore`). Get it from: https://drive.google.com/drive/folders/1HDKmEfS0H56anc5gJBLgarAYRNC6Ysxt?usp=sharing

Download it, unzip it, and place it here so the folder structure looks like:
```
nlp-sentence-model/
└── models/
    └── gloss-to-text/
        ├── config.json
        ├── model.safetensors
        ├── tokenizer.json
        └── ... (other model files)
```

### 6. Run the API server
```
uvicorn src.api:app --reload --port 8000
```
You should see:
```
Uvicorn running on http://127.0.0.1:8000
```

### 7. Confirm it's working
Open **http://localhost:8000** in a browser — you should see:
```json
{"status": "ok", "service": "nlp-sentence-model"}
```

Then try the actual endpoint at **http://localhost:8000/docs** — click
`POST /convert` → "Try it out" → paste this in the request body:
```json
{"signs": ["MOTHER", "HAPPY"]}
```
→ Execute. Expected response:
```json
{"text": "My mother is happy", "lang": "en"}
```

That's it — the server is now running locally and ready for your code
(frontend, speech-pipeline, etc.) to call `http://localhost:8000/convert`.

**Note:** this only runs on your own machine (`localhost` = this computer
only). For the actual hackathon demo, this whole project will run together
on one laptop, so that's expected and fine. If you need to test against it
from a different device before then, ask Arnav to share a temporary public
link (ngrok) during an active session.

---

## Supported vocabulary (24 signs)

```
BEAUTIFUL, BIRD, DAUGHTER, DOCTOR, DOG, FATHER, HELLO, HOUSE, I, LAWYER,
MOTHER, PARENT, RESTAURANT, SON, STUDENT, TEACHER, THANK_YOU,
TRAIN_STATION, WAITER, HAPPY, HE, SAD, SHE, YOU
```

Any sign sequence using only these words will produce a sentence. Words
outside this list aren't recognized — check `shared/vocabulary.json` for
the definitive, current list.

---

## API Reference

### `GET /`
Health check. Returns `{"status": "ok", "service": "nlp-sentence-model"}`.

### `POST /convert`
**Request body:**
```json
{"signs": ["I", "DOCTOR"]}
```
Optional `"lang"` field (defaults to `"en"`).

**Response:**
```json
{"text": "I am a doctor", "lang": "en"}
```

**Errors:** returns HTTP 422 if `signs` isn't a list of strings.

---

## For developers modifying this module

| File | Purpose |
|---|---|
| `src/generate_synthetic_data.py` | Generates training data from templates, reads `shared/vocabulary.json` |
| `src/train.py` | Fine-tunes T5-small on the generated data (run on GPU — Colab recommended) |
| `src/eval_model.py` | Reports exact-match accuracy + BLEU score on held-out validation data |
| `src/infer.py` | Core logic: rule-based lookup first, trained model as fallback |
| `src/api.py` | FastAPI wrapper exposing `infer.py` as an HTTP endpoint |

### If the vocabulary changes
1. Update `shared/vocabulary.json` (team decision — this file is shared
   across all modules)
2. Add new sentence templates to `generate_synthetic_data.py` for any new
   words
3. Re-run in order: `generate_synthetic_data.py` → `train.py` (needs
   GPU — Colab works) → `eval_model.py` to confirm accuracy
4. Update the `RULES` dictionary in `infer.py` with any new guaranteed
   demo phrases
5. Replace the `models/gloss-to-text/` folder with the newly trained
   version, re-share it (Drive link above)

### Running the test scripts directly (no server needed)
```
python src/infer.py
```
Runs a handful of hardcoded test phrases and prints the results — useful
for a quick sanity check without spinning up the API.

---

## Troubleshooting

**`ModuleNotFoundError` for any package** — make sure your virtual
environment is activated (`(venv)` should show in your terminal prompt),
then re-run `pip install -r requirements.txt`.

**First run is slow / looks frozen** — normal. The first time `torch`
loads in a fresh environment, it can take a minute or two. Let it run,
don't interrupt it.

**`uvicorn: command not found`** — the venv isn't activated, or
dependencies weren't installed. Re-check steps 3–4 above.

**Getting odd/wrong sentences** — check that the gloss words you're
sending exactly match `shared/vocabulary.json` (same spelling, same
`SCREAMING_SNAKE_CASE` formatting, e.g. `THANK_YOU` not `THANKYOU`).