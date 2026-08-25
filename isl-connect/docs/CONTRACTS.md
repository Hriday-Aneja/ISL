# Interface Contracts

Lock these at hour 0. Everyone builds against these shapes using the mock
files in `integration/mock-data/` until the real upstream module is ready —
then it should be a one-line swap, not a rewrite.

---

## 1. recognition-ml -> nlp-sentence-model

Per-sign event, emitted as each sign is recognized:

```json
{ "gloss": "HELLO", "confidence": 0.94, "timestamp": 1699999999999 }
```

Buffered sentence, emitted when recognition-ml (or whoever owns buffering —
decide this explicitly) decides a sequence is complete:

```json
{ "glossSequence": ["I", "NAME", "RAVI"], "timestamps": [1699999999000, 1699999999500, 1699999999900] }
```

## 2. nlp-sentence-model -> frontend / speech-pipeline

```json
{ "text": "My name is Ravi", "lang": "en" }
```

`frontend` renders this in the caption overlay. `speech-pipeline` feeds it to TTS.

## 3. speech-pipeline (STT) -> nlp-sentence-model / frontend

```json
{ "text": "I need water", "lang": "en" }
```

## 4. speech-pipeline (phrase mapping) -> avatar

```json
{ "glossSequence": ["I", "NEED", "WATER"] }
```

If a phrase has no mapping, return an empty array and let the frontend show
a "sign not available" indicator — don't throw.

## 5. avatar -> frontend

Single exposed function, no return value needed (fire and forget), avatar
emits its own "done" event when the queue finishes playing:

```js
playSigns(["HELLO", "THANK_YOU", "WATER"])
// avatar module dispatches: onPlaybackComplete()
```

## Naming convention

All gloss IDs are `SCREAMING_SNAKE_CASE` and must come from the shared list
in `docs/VOCABULARY.md` / `shared/vocabulary.json`. Don't invent new IDs
without updating that file first — every module reads from it.
