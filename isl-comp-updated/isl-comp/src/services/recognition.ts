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

function toResult(prediction: ServicePrediction): RecognitionResult {
  const sign = LABEL_TO_SIGN[prediction.label.toLowerCase()];
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
    let resolveResult: ((result: RecognitionResult) => void) | undefined;
    let rejectResult: ((error: Error) => void) | undefined;

    const cleanup = () => {
      if (frameTimer !== undefined) window.clearInterval(frameTimer);
      frameTimer = undefined;
      socket.close();
    };

    const session: RecognitionSession = {
      stop: () => {
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
        context.drawImage(video, 0, 0, width, height);
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
      let message: { type: string; message?: string; status?: string } & Partial<ServicePrediction>;
      try {
        message = JSON.parse(String(event.data));
      } catch {
        fail('Recognition service sent invalid JSON.');
        return;
      }
      if (message.type === 'status' && message.status === 'capturing') {
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
          resolveResult?.(result);
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
      if (!stopRequested) fail('ISL recognition service disconnected.');
    };
  });
}