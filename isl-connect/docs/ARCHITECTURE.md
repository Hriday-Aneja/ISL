# Architecture

## Direction 1: ISL user -> Hearing user

```
Webcam
  -> MediaPipe Holistic (recognition-ml)
  -> LSTM/Transformer classifier (recognition-ml)
  -> gloss stream: { gloss, confidence, timestamp }
  -> buffered gloss sequence
  -> Sign->Sentence model (nlp-sentence-model)
  -> natural sentence: { text, lang }
  -> captions (frontend) + TTS (speech-pipeline)
```

## Direction 2: Hearing user -> ISL user

```
Microphone
  -> Speech-to-text (speech-pipeline)
  -> text
  -> phrase/sign mapping (speech-pipeline, deterministic lookup table)
  -> gloss sequence: string[]
  -> playSigns(glossSequence) (avatar)
  -> 3D avatar signs
```

## Shell

`frontend/` owns the WebRTC call, the page layout, and wires every module's
output into the UI slots (video panes, caption overlay, avatar viewport,
transcript panel, quick-phrase buttons).

See `docs/CONTRACTS.md` for the exact interface each module exposes.
