// Recognition for the live-camera demo sits behind one small interface so you can swap the
// implementation without touching any UI:
//
//   recognize(sequence) -> Promise<{ label, confidence }[]>
//
// `sequence` is the sliding window of the last WINDOW_FRAMES frames, each a Float32Array of
// FEATURES numbers laid out exactly like your training features:
//   [ left hand 21 x (x,y,z) | right hand 21 x (x,y,z) | pose 33 x (x,y,z) ]  = 225 values
// (the order used by recognition-ml/src/landmark_extraction_selected.py), normalised the same
// way: pose centred on the shoulder midpoint and divided by shoulder width, each hand made
// relative to its own wrist and divided by the same width. Missing parts are zero-filled.
//
// The default implementation below is a STUB: it returns no predictions, so the live demo shows
// the landmark overlay and says plainly that no model is connected. It never invents results.

import type { RecognitionResult } from './types';

export const WINDOW_FRAMES = 100;
export const FEATURES = 225;

export interface Recognizer {
  readonly name: string;
  /** true for the placeholder; the UI uses this to explain that no model is connected. */
  readonly isStub: boolean;
  recognize(sequence: Float32Array[]): Promise<RecognitionResult[]>;
}

export const stubRecognizer: Recognizer = {
  name: 'No model connected',
  isStub: true,
  async recognize() {
    return [];
  },
};

/**
 * Plug your own model in here. Called once, only after the visitor starts the camera, so any
 * heavy import stays out of the initial bundle.
 *
 * Example with ONNX Runtime Web (npm i onnxruntime-web, put samvaad.onnx in /public/models):
 *
 *   const ort = await import('onnxruntime-web');
 *   const session = await ort.InferenceSession.create('/models/samvaad.onnx');
 *   const labels = ['Beautiful', 'Bird', ...];                // same order as your classifier
 *   return {
 *     name: 'ONNX Runtime Web', isStub: false,
 *     async recognize(sequence) {
 *       const input = flattenWindow(sequence);                // Float32Array(100 * 225)
 *       const out = await session.run({
 *         [session.inputNames[0]]: new ort.Tensor('float32', input, [1, WINDOW_FRAMES, FEATURES]),
 *       });
 *       const logits = out[session.outputNames[0]].data as Float32Array;
 *       return topK(softmax(logits), labels, 3);
 *     },
 *   };
 *
 * TensorFlow.js works the same way: tf.tensor(flattenWindow(seq), [1, 100, 225]) -> model.predict.
 * If your model expects normalised features (e.g. relative to the shoulders), apply the same
 * transform here that your Python pipeline applies before training.
 */
export async function loadRecognizer(): Promise<Recognizer> {
  return stubRecognizer;
}

// ---------- helpers for real implementations ----------

/** Packs a window of frames into one (WINDOW_FRAMES x FEATURES) buffer, padding/cropping as needed. */
export function flattenWindow(sequence: Float32Array[]): Float32Array {
  const out = new Float32Array(WINDOW_FRAMES * FEATURES);
  const start = Math.max(0, sequence.length - WINDOW_FRAMES);
  for (let i = start; i < sequence.length; i++) out.set(sequence[i], (i - start) * FEATURES);
  return out;
}

export function softmax(logits: ArrayLike<number>): number[] {
  let max = -Infinity;
  for (let i = 0; i < logits.length; i++) max = Math.max(max, logits[i]);
  const exps = Array.from(logits, (v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

export function topK(probs: number[], labels: string[], k = 3): RecognitionResult[] {
  return probs
    .map((p, i) => ({ label: labels[i] ?? `class ${i}`, confidence: p }))
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, k);
}

// ---------- the sliding window ----------

interface LM {
  x: number;
  y: number;
  z: number;
}

/** Same maths as normalize_landmarks() in landmark_extraction_selected.py. */
const FEATURE_NORMALIZATION = true;

/** Builds one 225-value feature row from the three landmark groups (zeros where missing). */
export function frameToFeatures(
  pose: ReadonlyArray<LM> | null,
  left: ReadonlyArray<LM> | null,
  right: ReadonlyArray<LM> | null
): Float32Array {
  const row = new Float32Array(FEATURES);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  let scale = 1;
  if (FEATURE_NORMALIZATION && pose && pose.length > 12) {
    const a = pose[11];
    const b = pose[12];
    cx = (a.x + b.x) / 2;
    cy = (a.y + b.y) / 2;
    cz = (a.z + b.z) / 2;
    scale = Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) + 1e-6;
  }
  const put = (group: ReadonlyArray<LM> | null, count: number, offset: number, origin: LM | null) => {
    if (!group) return;
    const ox = origin ? origin.x : cx;
    const oy = origin ? origin.y : cy;
    const oz = origin ? origin.z : cz;
    for (let i = 0; i < Math.min(count, group.length); i++) {
      row[offset + i * 3] = (group[i].x - ox) / scale;
      row[offset + i * 3 + 1] = (group[i].y - oy) / scale;
      row[offset + i * 3 + 2] = (group[i].z - oz) / scale;
    }
  };
  put(left, 21, 0, FEATURE_NORMALIZATION && left ? left[0] : null);
  put(right, 21, 63, FEATURE_NORMALIZATION && right ? right[0] : null);
  put(pose, 33, 126, null);
  return row;
}

/** Fixed-length FIFO of feature rows: push every camera frame, snapshot() to classify. */
export class SlidingWindow {
  private rows: Float32Array[] = [];
  constructor(private readonly size = WINDOW_FRAMES) {}

  push(row: Float32Array) {
    this.rows.push(row);
    if (this.rows.length > this.size) this.rows.shift();
  }
  get full() {
    return this.rows.length >= this.size;
  }
  snapshot(): Float32Array[] {
    return this.rows.slice();
  }
  clear() {
    this.rows = [];
  }
}
