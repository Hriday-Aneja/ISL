# recognition-ml — ISL Recognition (Member 1)

Webcam -> MediaPipe landmarks -> LSTM/Transformer classifier -> gloss stream.

## Scope
- MediaPipe Holistic landmark extraction (client-side/WASM or Python for training pipeline)
- Sequence classifier trained on landmark sequences (not raw video)
- Real-time inference loop

## Start immediately
1. `src/landmark_extraction.py` — get MediaPipe Holistic running, visualize skeleton overlay
2. Source dataset (INCLUDE / ISL-CSLRT — ISL-specific, not ASL) and trim to `shared/vocabulary.json`

## Deliverables
- Live landmark-tracking demo
- Trained classifier for the shared vocabulary
- Inference module emitting the contract below

## Output contract (see /docs/CONTRACTS.md)
```json
{ "gloss": "HELLO", "confidence": 0.94, "timestamp": 1699999999999 }
```

## Hour 6 checkpoint
Landmark tracking working live; classifier trained on at least 10-15 signs.

## Final checkpoint
Full shared vocabulary; confidence smoothing so gloss output doesn't flicker.
