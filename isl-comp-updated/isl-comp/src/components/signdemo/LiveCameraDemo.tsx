import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, CameraOff, Loader2, ShieldCheck } from 'lucide-react';
import { ConfidenceBars } from './ConfidenceBars';
import { SkeletonCanvas } from './SkeletonCanvas';
import type { SkeletonHandle } from './SkeletonCanvas';
import { toPts } from './lib/skeleton';
import { frameToFeatures, loadRecognizer, SlidingWindow } from './lib/recognizer';
import type { Recognizer } from './lib/recognizer';
import type { Prediction } from './lib/types';
import type { Trackers } from './live/mediapipe';

interface Props {
  /** Called when live mode can't continue; the parent switches back to the recorded replay. */
  onFallback: (message: string) => void;
  onClose: () => void;
}

type Status = 'idle' | 'requesting' | 'loading' | 'running';

const SLOW_MS = 150; // average per-frame tracking time above this counts as "too slow"
const RECOGNIZE_EVERY_MS = 600;

/**
 * Demo mode 3 (beta): live skeleton overlay from the visitor's webcam, computed in the browser
 * with MediaPipe WASM. The camera is requested only after the visitor clicks Start; the video
 * is never uploaded. Any failure (denied, no camera, slow device, load error) falls back to the
 * recorded replay with a friendly message.
 */
export default function LiveCameraDemo({ onFallback, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonRef = useRef<SkeletonHandle>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const trackersRef = useRef<Trackers | null>(null);
  const rafRef = useRef(0);
  const aliveRef = useRef(true);

  const [status, setStatus] = useState<Status>('idle');
  const [aspect, setAspect] = useState(4 / 3);
  const [msPerFrame, setMsPerFrame] = useState<number | null>(null);
  const [handsSeen, setHandsSeen] = useState(false);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [modelNote, setModelNote] = useState<string | null>(null);

  const teardown = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    trackersRef.current?.close();
    trackersRef.current = null;
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      teardown();
    };
  }, [teardown]);

  const fail = useCallback(
    (message: string) => {
      teardown();
      if (aliveRef.current) onFallback(message);
    },
    [onFallback, teardown]
  );

  const start = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      fail("Live camera isn't available here (browsers only allow it on secure https:// pages). Here's the recorded demo instead.");
      return;
    }

    setStatus('requesting');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
    } catch (e) {
      const name = e instanceof DOMException ? e.name : '';
      fail(
        name === 'NotAllowedError' || name === 'SecurityError'
          ? "Camera access was blocked, no problem. Here's the recorded demo instead."
          : name === 'NotFoundError'
            ? "We couldn't find a camera on this device. Here's the recorded demo instead."
            : "The camera couldn't be started. Here's the recorded demo instead."
      );
      return;
    }
    if (!aliveRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }
    streamRef.current = stream;

    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    try {
      await video.play();
    } catch {
      fail("The camera preview couldn't start. Here's the recorded demo instead.");
      return;
    }
    if (video.videoWidth && video.videoHeight) setAspect(video.videoWidth / video.videoHeight);

    // Heavy code is fetched only now, after the click.
    setStatus('loading');
    let trackers: Trackers;
    let recognizer: Recognizer;
    try {
      const { createTrackers } = await import('./live/mediapipe');
      trackers = await createTrackers();
      recognizer = await loadRecognizer(); // swap in your model inside lib/recognizer.ts
    } catch {
      fail("The tracking models couldn't be loaded (check your connection). Here's the recorded demo instead.");
      return;
    }
    if (!aliveRef.current) {
      trackers.close();
      return;
    }
    trackersRef.current = trackers;
    if (recognizer.isStub) {
      setModelNote('Landmarks are tracked live on your device. No recognition model is connected yet, so no words are predicted.');
    }
    setStatus('running');

    // ----- per-frame loop -----
    const buffer = new SlidingWindow();
    const timings: number[] = [];
    let lastVideoTime = -1;
    let lastRecognize = 0;
    let inFlight = false;
    let lastUiUpdate = 0;

    const loop = () => {
      if (!aliveRef.current || !trackersRef.current) return;
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.currentTime !== lastVideoTime) {
        lastVideoTime = v.currentTime;
        const t0 = performance.now();
        let result;
        try {
          result = trackersRef.current.detect(v, t0);
        } catch {
          fail('Live tracking hit a problem. Here\'s the recorded demo instead.');
          return;
        }
        const took = performance.now() - t0;

        skeletonRef.current?.draw({
          pose: toPts(result.pose),
          left_hand: toPts(result.left),
          right_hand: toPts(result.right),
        });
        buffer.push(frameToFeatures(result.pose, result.left, result.right));

        timings.push(took);
        if (timings.length > 30) timings.shift();
        const avg = timings.reduce((a, b) => a + b, 0) / timings.length;
        if (timings.length === 30 && avg > SLOW_MS) {
          fail("This device is a bit too slow for live tracking. Here's the recorded demo instead.");
          return;
        }

        const now = performance.now();
        if (now - lastUiUpdate > 500) {
          lastUiUpdate = now;
          setMsPerFrame(Math.round(avg));
          setHandsSeen(!!(result.left || result.right));
        }

        if (buffer.full && !inFlight && now - lastRecognize > RECOGNIZE_EVERY_MS && (result.left || result.right)) {
          lastRecognize = now;
          inFlight = true;
          recognizer
            .recognize(buffer.snapshot())
            .then((res) => {
              if (aliveRef.current) setPredictions(res.slice(0, 3).map((r) => ({ label: r.label, p: r.confidence })));
            })
            .catch(() => {})
            .finally(() => {
              inFlight = false;
            });
        }
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);
  };

  const stop = () => {
    teardown();
    onClose();
  };

  const running = status === 'running';

  return (
    <div className="sd-card p-5 sm:p-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="sd-badge">
          <ShieldCheck className="h-4 w-4" aria-hidden />
          Runs on your device. Video never leaves your browser.
        </span>
        <span className="sd-badge" data-tone="neutral">
          Beta
        </span>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        {/* Camera stage. The video is always mounted so the stream can attach to it. */}
        <div>
          <div className="sd-stage sd-stage-grid" style={{ aspectRatio: String(aspect) }}>
            <div className="absolute inset-0" style={{ transform: 'scaleX(-1)' }}>
              <video ref={videoRef} muted playsInline className="absolute inset-0 h-full w-full object-cover" aria-label="Your camera preview" />
              <div className="absolute inset-0">
                <SkeletonCanvas ref={skeletonRef} label="Live landmarks drawn over your camera" />
              </div>
            </div>
            {!running && (
              <div className="absolute inset-0 z-10 grid place-items-center bg-[var(--sd-stage)] p-6 text-center">
                {status === 'idle' ? (
                  <div className="flex max-w-sm flex-col items-center gap-4">
                    <Camera className="h-8 w-8 text-[var(--sd-accent)]" aria-hidden />
                    <p className="m-0 text-sm text-[var(--sd-muted)]">
                      Your browser will ask for camera permission only after you press Start. Hand and body
                      tracking runs entirely on your device.
                    </p>
                    <div className="flex flex-wrap justify-center gap-2">
                      <button type="button" className="sd-btn sd-btn-primary" onClick={start}>
                        <Camera className="h-4 w-4" aria-hidden />
                        Start camera
                      </button>
                      <button type="button" className="sd-btn" onClick={onClose}>
                        Back to recorded demo
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-3 text-sm text-[var(--sd-muted)]" role="status">
                    <Loader2 className="h-6 w-6 animate-spin text-[var(--sd-accent)]" aria-hidden />
                    {status === 'requesting' ? 'Waiting for camera permission…' : 'Loading the tracking models (first time only)…'}
                  </div>
                )}
              </div>
            )}
          </div>
          {running && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--sd-muted)]">
              <span className="font-mono tabular-nums">
                {msPerFrame !== null ? `${msPerFrame} ms/frame tracking` : 'starting…'}
              </span>
              <button type="button" className="sd-btn" onClick={stop}>
                <CameraOff className="h-4 w-4" aria-hidden />
                Stop camera
              </button>
            </div>
          )}
        </div>

        {/* Output */}
        <div className="flex flex-col gap-4">
          <div className="rounded-[18px] border border-[var(--sd-border)] bg-[var(--sd-surface-2)] p-5">
            <h3 className="mb-4 font-body text-xs font-semibold uppercase tracking-[0.14em] !text-[var(--sd-muted)]">
              Live prediction
            </h3>
            {predictions.length > 0 ? (
              <ConfidenceBars predictions={predictions} progress={1} ended />
            ) : (
              <p className="m-0 text-sm text-[var(--sd-muted)]" role="status">
                {!running
                  ? 'Start the camera to see landmarks on your own signing.'
                  : modelNote ?? (handsSeen ? 'Listening… keep signing.' : 'Show your hands to the camera.')}
              </p>
            )}
          </div>
          {running && modelNote && predictions.length === 0 && (
            <p className="m-0 text-xs text-[var(--sd-muted)]">
              Developers: connect a model in <code className="font-mono">lib/recognizer.ts</code> (see the README).
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
