# nlp-sentence-model — Sign -> Natural Sentence (Member 2)

Recognized gloss sequence -> natural English (or Hindi) sentence.

## Scope
- Generate a synthetic (gloss-sequence, natural-sentence) training set from
  templates + augmentation using `shared/vocabulary.json` — you do NOT need
  a real ISL-English parallel corpus for this, that's the whole point of
  this direction over gloss->English translation from scratch.
- Fine-tune a small seq2seq model (e.g. T5-small) on that synthetic set
- Inference: gloss sequence in, natural sentence out

## Start immediately
1. `src/generate_synthetic_data.py` — build your training set from templates, no dependency on anyone
2. Test your template logic on hardcoded gloss arrays before training anything

## Deliverables
- Synthetic training dataset
- Trained/fine-tuned model with eval metrics (BLEU or similar)
- Inference module emitting the contract below

## Output contract (see /docs/CONTRACTS.md)
```json
{ "text": "My name is Ravi", "lang": "en" }
```

## Hour 6 checkpoint
Synthetic dataset generated; first training run complete, even if rough.

## Final checkpoint
Model producing fluent sentences for the shared vocabulary; swapped from
mock gloss input (`/integration/mock-data/`) to recognition-ml's real stream.
