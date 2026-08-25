# ISL Connect

Two-way AI communication platform for Indian Sign Language (ISL) video calls.

ISL user (webcam) <-> AI pipeline <-> Hearing user (mic/speakers)

## Team & Modules

| # | Owner | Module | Folder |
|---|-------|--------|--------|
| 1 | You | ISL Recognition ML | `recognition-ml/` |
| 2 | Friend | Sign -> Natural Sentence ML | `nlp-sentence-model/` |
| 3 | Person 3 | Speech (STT/TTS) + hearing->ISL phrase mapping | `speech-pipeline/` |
| 4 | Person 4 | 3D ISL Avatar | `avatar/` |
| 5 | Person 5 | WebRTC + React Frontend | `frontend/` |

## Quickstart

Everyone works in their own top-level folder and builds against the shared
mock data in `integration/mock-data/` and the contracts in `docs/CONTRACTS.md`.
Nobody needs anyone else's real model working to start.

```
git clone <repo-url>
cd isl-connect

# ML folks (1 & 2)
cd recognition-ml && pip install -r requirements.txt
cd nlp-sentence-model && pip install -r requirements.txt

# JS folks (3, 4, 5)
cd speech-pipeline && npm install
cd avatar && npm install
cd frontend && npm install && npm run dev
```

## Read first

- `docs/ARCHITECTURE.md` — full pipeline diagram
- `docs/CONTRACTS.md` — exact JSON/function shapes between every module (lock these at hour 0)
- `docs/VOCABULARY.md` — shared gloss vocabulary + naming convention (lock this at hour 0)
- `integration/mock-data/` — fake payloads matching the contracts so you can build in isolation

Each module folder also has its own README with that person's specific scope,
deliverables, and hour-6 / final checkpoints.
