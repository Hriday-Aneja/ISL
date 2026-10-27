import type { RecognitionResult, SignId } from '../types';

interface RecognitionUpdate {
  status: 'connecting' | 'ready' | 'capturing' | 'complete' | 'error';
  message?: string;
  debug?: {
    frames?: number;
    modelFrames?: number;
    inferenceMs?: number;
    top?: Array<{ label: string; confidence: number }>;
  };
}

export interface RecognitionSession {
  stop: () => Promise<RecognitionResult>;
  close: () => void;
}

interface ServicePrediction {
  label: string;
  confidence: number;
  top: Array<{ label: string; confidence: number }>;
  frames: number;
  model_frames: number;
  inference_ms: number;
}

const LABEL_TO_SIGN: Record<string, SignId> = {
  beautiful: 'BEAUTIFUL',
  bird: 'BIRD',
  daughter: 'DAUGHTER',
  doctor: 'DOCTOR',
  dog: 'DOG',
  father: 'FATHER',
  happy: 'HAPPY',
  he: 'HE',
  hello: 'HELLO',
  house: 'HOUSE',
  i: 'I',
  lawyer: 'LAWYER',
  mother: 'MOTHER',
  parent: 'PARENT',
  restaurant: 'RESTAURANT',
  sad: 'SAD',
  she: 'SHE',
  son: 'SON',
  student: 'STUDENT',
  teacher: 'TEACHER',
  thankyou: 'THANK_YOU',
  trainstation: 'TRAIN_STATION',
  waiter: 'WAITER',
  you: 'YOU',
};

function serviceUrl() {
  return import.meta.env.VITE_RECOGNITION_SERVICE_URL || 'ws://127.0.0.1:8765';
}

// "Thank you", "thank_you", "Train Station" -> "thankyou", "trainstation".
const normaliseLabel = (label: string) => label.toLowerCase().replace(/[^a-z0-9]/g, '');

function toResult(prediction: ServicePrediction): RecognitionResult {
  const sign = LABEL_TO_SIGN[normaliseLabel(prediction.label)];
  if (!sign) throw new Error(`Recognition service returned an unknown label: ${prediction.label}`);
  return {
    signs: [sign],
    confidence: prediction.confidence,
    debug: {
      frames: prediction.frames,
      modelFrames: prediction.model_frames,
      inferenceMs: prediction.inference_ms,
      top: prediction.top,
    },
  };
}

export function openRecognitionSession(
  video: HTMLVideoElement,
  onUpdate: (update: RecognitionUpdate) => void
): Promise<RecognitionSession> {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(serviceUrl());
    const canvas = document.createElement('canvas');
    let frameTimer: number | undefined;
    let framePending = false;
    let settled = false;
    let stopRequested = false;
    let finished = false;
    // Set from the service's 'ready' message: the checkpoint was trained on mirrored clips, so the
    // frames we send must be mirrored too (same as the Chrome extension / live_inference.py).
    let flipHorizontal = false;
    // The service auto-finishes a clip at max_frames and sends the prediction without a 'stop'.
    let earlyResult: RecognitionResult | undefined;
    let resolveResult: ((result: RecognitionResult) => void) | undefined;
    let rejectResult: ((error: Error) => void) | undefined;

    const cleanup = () => {
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
      frameTimer = undefined;
      socket.close();
    };

    const session: RecognitionSession = {
      stop: () => {
        if (earlyResult) return Promise.resolve(earlyResult);
        if (stopRequested) {
          return new Promise<RecognitionResult>((resolveStop, rejectStop) => {
            const originalResolve = resolveResult;
            const originalReject = rejectResult;
            resolveResult = (result) => {
              originalResolve?.(result);
              resolveStop(result);
            };
            rejectResult = (error) => {
              originalReject?.(error);
              rejectStop(error);
            };
          });
        }
        stopRequested = true;
        if (frameTimer !== undefined) window.clearInterval(frameTimer);
        frameTimer = undefined;
        onUpdate({ status: 'complete', message: 'Finishing capture…' });
        socket.send(JSON.stringify({ type: 'stop' }));
        return new Promise<RecognitionResult>((resolveStop, rejectStop) => {
          const originalResolve = resolveResult;
          const originalReject = rejectResult;
          resolveResult = (result) => {
            originalResolve?.(result);
            resolveStop(result);
          };
          rejectResult = (error) => {
            originalReject?.(error);
            rejectStop(error);
          };
        });
      },
      close: cleanup,
    };

    const fail = (message: string) => {
      const error = new Error(message);
      onUpdate({ status: 'error', message });
      rejectResult?.(error);
      if (!settled) {
        settled = true;
        cleanup();
        reject(error);
      }
    };

    socket.onopen = () => {
      onUpdate({ status: 'ready' });
      socket.send(JSON.stringify({ type: 'start' }));
      frameTimer = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN || framePending || video.readyState < 2) return;
        const width = video.videoWidth || 640;
        const height = video.videoHeight || 360;
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        if (!context) return;
        if (flipHorizontal) {
          context.setTransform(-1, 0, 0, 1, width, 0);
          context.drawImage(video, 0, 0, width, height);
          context.setTransform(1, 0, 0, 1, 0, 0);
        } else {
          context.drawImage(video, 0, 0, width, height);
        }
        framePending = true;
        canvas.toBlob((blob) => {
          framePending = false;
          if (blob && socket.readyState === WebSocket.OPEN && socket.bufferedAmount < 1_000_000) {
            socket.send(blob);
          }
        }, 'image/jpeg', 0.82);
      }, 100);
      if (!settled) {
        settled = true;
        resolve(session);
      }
    };

    socket.onmessage = (event) => {
      let message: { type: string; message?: string; status?: string; service?: { flip_horizontal?: boolean | null } } & Partial<ServicePrediction>;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        fail('Recognition service sent invalid JSON.');
        return;
      }
      if (message.type === 'ready') {
        flipHorizontal = message.service?.flip_horizontal === true;
      } else if (message.type === 'status' && message.status === 'capturing') {
        onUpdate({ status: 'capturing' });
      } else if (message.type === 'prediction') {
        try {
          const result = toResult(message as ServicePrediction);
          onUpdate({
            status: 'complete',
            debug: {
              frames: result.debug?.frames,
              modelFrames: result.debug?.modelFrames,
              inferenceMs: result.debug?.inferenceMs,
              top: result.debug?.top,
            },
          });
          finished = true;
          if (resolveResult) resolveResult(result);
          else earlyResult = result;
          cleanup();
        } catch (error) {
          fail(error instanceof Error ? error.message : 'Could not decode recognition result.');
        }
      } else if (message.type === 'error') {
        fail(message.message || 'Recognition service error.');
      }
    };

    socket.onerror = () => fail(`Could not connect to the ISL recognition service at ${serviceUrl()}.`);
    socket.onclose = () => {
      if (!stopRequested && !finished) fail('ISL recognition service disconnected.');
    };
  });
}

export interface RecognitionProbe {
  ok: boolean;
  classes?: number;
  device?: string;
  message?: string;
}

/** Opens the service socket just long enough to read its 'ready' message. Used to show a
 * connected / not-connected badge before a live demo. */
export function probeRecognitionService(timeoutMs = 3000): Promise<RecognitionProbe> {
  return new Promise((resolve) => {
    let socket: WebSocket;
    let done = false;
    const finish = (probe: RecognitionProbe) => {
      if (done) return;
      done = true;
      window.clearTimeout(timer);
      try { socket?.close(); } catch { /* already closed */ }
      resolve(probe);
    };
    const unreachable = { ok: false, message: `Recognition service not reachable at ${serviceUrl()}.` };
    const timer = window.setTimeout(() => finish(unreachable), timeoutMs);
    try {
      socket = new WebSocket(serviceUrl());
    } catch {
      finish(unreachable);
      return;
    }
    socket.onerror = () => finish(unreachable);
    socket.onmessage = (event) => {
      try {
        const msg = JSON.parse(String(event.data));
        if (msg.type === 'ready') finish({ ok: true, classes: msg.service?.classes, device: msg.service?.device });
      } catch {
        finish({ ok: false, message: 'Recognition service sent invalid data.' });
      }
    };
  });
}

export function serviceAddress() {
  return serviceUrl();
}