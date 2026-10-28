// Lazy MediaPipe loader. This file is only imported (via dynamic import) after a visitor clicks
// "Try it with your camera", so none of it ships in the initial bundle.
//
// Models and the WASM runtime download from public CDNs the first time. To host them yourself
// (offline / strict CSP), copy node_modules/@mediapipe/tasks-vision/wasm to /public/mediapipe/wasm,
// download the two .task files into /public/mediapipe/models, and point the constants below there.

import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

export const TASKS_VISION_VERSION = '1.1.1'; // keep in sync with package.json
const WASM_BASE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${TASKS_VISION_VERSION}/wasm`;
const HAND_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const POSE_MODEL =
  'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';

/**
 * MediaPipe's handedness label assumes a mirrored (selfie) image. We feed it the raw,
 * un-mirrored camera frame, so its "Left" is the signer's RIGHT hand. Flip this if your
 * training data was extracted from mirrored video.
 */
const SWAP_HANDEDNESS = true;

export interface LM {
  x: number;
  y: number;
  z: number;
}

export interface LiveLandmarks {
  pose: LM[] | null;
  left: LM[] | null;
  right: LM[] | null;
}

export interface Trackers {
  detect(video: HTMLVideoElement, timestampMs: number): LiveLandmarks;
  close(): void;
}

export async function createTrackers(): Promise<Trackers> {
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

  const make = (delegate: 'GPU' | 'CPU') =>
    Promise.all([
      HandLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate },
        runningMode: 'VIDEO',
        numHands: 2,
      }),
      PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: POSE_MODEL, delegate },
        runningMode: 'VIDEO',
        numPoses: 1,
      }),
    ]);

  let hands: HandLandmarker;
  let pose: PoseLandmarker;
  try {
    [hands, pose] = await make('GPU');
  } catch {
    [hands, pose] = await make('CPU'); // many laptops / older phones lack WebGL2 compute support
  }

  return {
    detect(video, ts) {
      const h = hands.detectForVideo(video, ts);
      const p = pose.detectForVideo(video, ts);

      let left: LM[] | null = null;
      let right: LM[] | null = null;
      h.landmarks.forEach((lms, i) => {
        const raw = h.handedness[i]?.[0]?.categoryName; // 'Left' | 'Right'
        const isLeft = SWAP_HANDEDNESS ? raw === 'Right' : raw === 'Left';
        if (isLeft) left = lms;
        else right = lms;
      });

      return { pose: p.landmarks[0] ?? null, left, right };
    },
    close() {
      hands.close();
      pose.close();
    },
  };
}
