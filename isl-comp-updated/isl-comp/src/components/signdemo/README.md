# "See Samvaad in action" demo section

A frontend-only Sign-to-Text pipeline demo. No backend, no recognition service.
Everything runs in the browser. It is already mounted on the landing page (`pages/Home.tsx`).

```tsx
import { DemoSection } from '../components/signdemo/DemoSection';
<DemoSection />          // drop it into any page
```

| Mode | What it does |
|------|--------------|
| **Recorded replay** | Looping muted clip + glowing landmark skeleton synced to `video.currentTime`, a Capture → Landmarks → Model → Text stepper, top-3 confidence bars, typewriter caption. Badged "Sample playback from our model" (or "...placeholder data" while mock data is in use). |
| **Sentence builder** | 24 sign chips, reorderable tray, 14 gloss→English/Hindi rules with a join fallback, Speak button (English / Hindi, with a no-Hindi-voice message). |
| **Live camera (beta)** | Behind a button. Webcam permission asked only on click. MediaPipe `HandLandmarker` + `PoseLandmarker` (WASM) draw a live skeleton. Recognition sits behind `recognize()`; the default is a stub. Falls back to replay with a friendly message on denied / no camera / slow device / load failure. |

## Files

```
signdemo/
  DemoSection.tsx        section shell: heading, stat strip, mode tabs, lazy camera mode
  ReplayDemo.tsx         mode 1          ClipPlayer.tsx   video + skeleton sync (rAF)
  SentenceBuilder.tsx    mode 2          SkeletonCanvas.tsx   reusable neon canvas
  LiveCameraDemo.tsx     mode 3 (lazy)   PipelineStepper / ConfidenceBars / TypewriterCaption
  hooks/useSignData.ts   loads /demo/<slug>.json, falls back to mock data
  lib/skeleton.ts        MediaPipe hand (21-pt) + upper-body pose connections, drawSkeleton()
  lib/mockData.ts        deterministic mock landmark + prediction generator
  lib/glossToEnglish.ts  rules          lib/speech.ts   speechSynthesis wrapper
  lib/recognizer.ts      recognize() interface, stub, sliding window     live/mediapipe.ts
  signdemo.css           all styling, driven by CSS variables on .sd-root
  config.ts              stat strip numbers
```

## Demo data format

`public/demo/<slug>.json` (slug = lowercase, non-alphanumerics become `-`, e.g. `thank-you.json`):

```json
{
  "sign": "Hello",
  "video": "/demo/videos/hello.mp4",
  "fps": 25,
  "frames": [ { "pose": [[x,y],...33], "left_hand": [[x,y],...21], "right_hand": [[x,y],...21] } ],
  "predictions": [ {"label":"Hello","p":0.94}, {"label":"Thank you","p":0.03}, {"label":"you","p":0.01} ]
}
```

Coordinates are normalised image coordinates (0..1, x right, y down), as MediaPipe outputs them.
Use `[]` for a hand that was not detected in a frame. `video` may be `null`.
If a file is missing or invalid the demo silently uses generated mock data (an invalid file also
shows a small warning), so you can add real signs one at a time with no code changes. (Your browser
console will show a 404 for each sign that has no JSON yet; that is expected.)
Until you add clips to `public/demo/videos/`, the 11 avatar videos already in
`public/avatar-videos/` are used as placeholders; the mock skeleton will NOT match their motion.

## Export real data from your Python pipeline

```bash
cd isl-comp-updated/isl-comp
pip install numpy tensorflow            # tensorflow only if you pass --model

python scripts/export_demo_data.py \
  --features ../../isl-connect/recognition-ml/data/features_selected/test \
  --model    ../../isl-connect/recognition-ml/models/isl_recognition_model_kfold.keras \
  --labels   ../../isl-connect/recognition-ml/models/label_classes.json \
  --videos   ../../isl-connect/recognition-ml/data/raw_selected \
  --out public/demo
```

It reads `(100, 225)` `.npy` files (layout `[left_hand | right_hand | pose]`), runs the model for
the top-3 predictions, rounds coordinates to 3 decimals (about 65 KB per sign), and re-encodes the
clip to `public/demo/videos/<slug>.mp4` (needs `ffmpeg`; muted, at most 960 px wide).

**Normalisation caveat.** Your extractor centres on the shoulders and divides by shoulder width, so
absolute positions are lost. By default the script *reconstructs* a drawable layout (hands attached
to the pose wrists). That looks right but is not pixel-aligned with the video. For exact alignment
pass `--from-video <raw video folder>` (needs `pip install opencv-python mediapipe`): it re-runs
MediaPipe Holistic on the original video and samples 100 frames the way `fix_sequence_length()`
does. Use `--signs Hello "Thank you"` for a subset, and `--predictions preds.json` instead of
`--model` if you precomputed outputs.

The script flags any sign where the model's top class differs from the sign's own class. Pick a
better sample (`--pick first|middle`) so the demo never shows a wrong prediction as "our model".

## Plug in a real model for the camera mode

Edit `lib/recognizer.ts` → `loadRecognizer()`. It runs only after the visitor starts the camera, so
heavy imports stay out of the first load. The camera loop keeps a 100-frame sliding window of
225-value rows (`frameToFeatures()`: same order and shoulder normalisation as
`landmark_extraction_selected.py`) and calls `recognize(window)` about every 600 ms while a hand is visible.

ONNX Runtime Web (convert Keras first: `python -m tf2onnx.convert --keras model.keras --output samvaad.onnx`):

```ts
const ort = await import('onnxruntime-web');
const session = await ort.InferenceSession.create('/models/samvaad.onnx');
return {
  name: 'ONNX Runtime Web', isStub: false,
  async recognize(seq) {
    const x = new ort.Tensor('float32', flattenWindow(seq), [1, WINDOW_FRAMES, FEATURES]);
    const out = await session.run({ [session.inputNames[0]]: x });
    return topK(softmax(out[session.outputNames[0]].data as Float32Array), LABELS, 3);
  },
};
```

TensorFlow.js is the same idea: convert with `tensorflowjs_converter`, `tf.loadLayersModel(...)`, then
`model.predict(tf.tensor(flattenWindow(seq), [1, 100, 225]))`.

Check when connecting a model: the class order in `LABELS` must match training; your training
extraction did not flip frames (`SWAP_HANDEDNESS` in `live/mediapipe.ts` assumes an un-mirrored feed);
and the model was trained on whole-sign clips, so continuous live signing will want the hand-presence
gating that `recognition-ml/src/infer.py` uses.

MediaPipe WASM and models load from jsDelivr / Google storage on first use. To self-host, see the
comment at the top of `live/mediapipe.ts`.

## Customize

- **Accent colour**: `--sd-accent` and `--sd-accent-rgb` in `signdemo.css` (`.sd-root`). Everything, including the canvas, follows.
- **Light mode**: put class `light` (or `data-theme="light"`) on `<html>`; palette in the same file. The video and skeleton stages stay dark on purpose.
- **Sign list / Hindi words / categories**: `lib/signs.ts` (`SIGNS`). Labels must equal your model's class names.
- **Hero signs and auto-cycle order**: `FEATURED` in `lib/signs.ts`.
- **Sentence rules**: `RULES` in `lib/glossToEnglish.ts` (slots are categories like `PRON`, `PROF`, or literal signs).
- **Copy**: heading and intro in `DemoSection.tsx`; badge text in `ReplayDemo.tsx` / `LiveCameraDemo.tsx`.
- **Stat strip**: `config.ts`. **`latencyMs` is a placeholder (50); replace it with a number you measured.**
- **Timing**: `HOLD_MS` in `ReplayDemo.tsx`, stage thresholds in `PipelineStepper.tsx`, typing speed in `TypewriterCaption.tsx`.

Tests: `npm run test:web` (includes `tests/signdemo.test.ts`).
