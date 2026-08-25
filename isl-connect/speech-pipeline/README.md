# speech-pipeline — Speech + Hearing->ISL Mapping (Person 3)

## Scope
- Speech-to-text (Web Speech API or Whisper) for the hearing participant
- Text-to-speech for the ISL user's translated sentence
- Deterministic phrase -> gloss-sequence lookup table for hearing->ISL
  (this is the guaranteed-working fallback for direction 2 — no ML dependency)

## Start immediately
1. `src/speechToText.js` / `src/textToSpeech.js` — Web Speech API, zero external dependency
2. `src/phraseToGloss.json` — build the lookup table against `shared/vocabulary.json`,
   test with typed text input before wiring up the mic

## Deliverables
- Live transcript (STT)
- Working TTS output
- Phrase -> gloss mapping covering the shared vocabulary, with a graceful
  "sign not available" fallback for unmapped phrases

## Output contracts (see /docs/CONTRACTS.md)
```json
{ "text": "I need water", "lang": "en" }
{ "glossSequence": ["I", "NEED", "WATER"] }
```

## Hour 6 checkpoint
STT working live; mapping table covers at least half the shared vocabulary.

## Final checkpoint
Full vocabulary coverage; fallback UI hook for unmapped phrases.
