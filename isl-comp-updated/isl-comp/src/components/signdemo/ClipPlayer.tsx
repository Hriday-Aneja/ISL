import { useEffect, useRef, useState } from 'react';
import { Film, Loader2 } from 'lucide-react';
import { SkeletonCanvas } from './SkeletonCanvas';
import type { SkeletonHandle } from './SkeletonCanvas';
import { pretty, slugify } from './lib/signs';
import type { LoadedClip } from './lib/types';

interface Props {
  clip: LoadedClip;
  /** Whether playback should run (false while off-screen, tab hidden, or waiting for a click). */
  active: boolean;
  /** Increment to (re)start the clip from the beginning. */
  playKey: number;
  /** 0..1, throttled to ~20 Hz. */
  progress?: number;
  onProgress?: (p: number) => void;
  onEnded?: () => void;
  /** Smaller layout: panels stay side by side, no captions. */
  compact?: boolean;
}

type VideoState = 'loading' | 'ready' | 'error' | 'none';

/**
 * Left: the recorded clip (muted). Right: the landmark skeleton, drawn from the JSON frame that
 * matches the video's playback position on every animation frame. If the clip is missing or
 * fails to load, the skeleton keeps playing on its own clock so the demo never stalls.
 */
export function ClipPlayer({ clip, active, playKey, progress = 0, onProgress, onEnded, compact = false }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const skeletonRef = useRef<SkeletonHandle>(null);
  const startedRef = useRef(false);
  const [videoState, setVideoState] = useState<VideoState>(clip.video ? 'loading' : 'none');
  const [aspect, setAspect] = useState(16 / 9);

  // Always call the latest callbacks without restarting playback when they change.
  const cb = useRef({ onProgress, onEnded });
  cb.current = { onProgress, onEnded };

  // A cached clip can be ready before React attaches listeners.
  useEffect(() => {
    const v = videoRef.current;
    if (v && clip.video && v.readyState >= 2) setVideoState('ready');
  }, [clip.video]);

  useEffect(() => {
    const vid = videoRef.current;
    const frames = clip.frames;
    const n = frames.length;
    const frameAt = (p: number) => frames[Math.min(n - 1, Math.max(0, Math.round(p * (n - 1))))];

    if (!active) {
      vid?.pause();
      if (!startedRef.current) skeletonRef.current?.draw(frameAt(0.55)); // static preview
      return;
    }
    if (videoState === 'loading') return; // wait until we know whether the video works

    startedRef.current = true;
    const useVideo = videoState === 'ready' && !!vid;
    let virtual = !useVideo;
    let t0 = performance.now();
    const virtualMs = (n / clip.fps) * 1000;
    let raf = 0;
    let lastEmit = -1000;
    let finished = false;

    if (useVideo && vid) {
      vid.currentTime = 0;
      vid.play().catch(() => {
        // Autoplay refused: keep the skeleton moving on its own clock.
        virtual = true;
        t0 = performance.now();
      });
    }
    cb.current.onProgress?.(0);

    const tick = (now: number) => {
      let p: number;
      if (!virtual && vid) {
        const d = vid.duration;
        p = Number.isFinite(d) && d > 0 ? vid.currentTime / d : 0;
        if (vid.ended) p = 1;
      } else {
        p = (now - t0) / virtualMs;
      }
      p = Math.min(1, Math.max(0, p));
      skeletonRef.current?.draw(frameAt(p));
      if (now - lastEmit >= 50) {
        lastEmit = now;
        cb.current.onProgress?.(p);
      }
      if (p >= 0.995 && !finished) {
        finished = true;
        cb.current.onProgress?.(1);
        cb.current.onEnded?.();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      vid?.pause();
    };
  }, [clip, active, playKey, videoState]);

  const frameNo = Math.min(clip.frames.length, Math.max(1, Math.round(progress * (clip.frames.length - 1)) + 1));
  const ratio = { aspectRatio: String(aspect) };

  return (
    <div className={compact ? 'grid grid-cols-2 gap-2' : 'grid gap-4 sm:grid-cols-2'}>
      {/* Recorded clip */}
      <figure className="m-0">
        <div className="sd-stage" style={ratio}>
          {clip.video && videoState !== 'error' ? (
            <video
              ref={videoRef}
              key={clip.video}
              src={clip.video}
              muted
              playsInline
              preload="auto"
              disablePictureInPicture
              aria-label={`Recorded clip of the sign ${pretty(clip.sign)}`}
              className="absolute inset-0 h-full w-full object-cover"
              onLoadedMetadata={(e) => {
                const v = e.currentTarget;
                if (v.videoWidth && v.videoHeight) setAspect(v.videoWidth / v.videoHeight);
              }}
              onLoadedData={() => setVideoState('ready')}
              onError={() => setVideoState('error')}
            />
          ) : (
            <div className="absolute inset-0 grid place-items-center p-4 text-center">
              <div className="flex max-w-[16rem] flex-col items-center gap-2 text-[var(--sd-muted)]">
                <Film className="h-6 w-6 opacity-60" aria-hidden />
                <p className="text-sm font-medium">Recorded clip not added yet</p>
                <p className="font-mono text-[11px] opacity-70">/demo/videos/{slugify(clip.sign)}.mp4</p>
              </div>
            </div>
          )}
          {videoState === 'loading' && (
            <div className="sd-overlay" role="status">
              <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
              <span className="sr-only">Loading clip</span>
            </div>
          )}
          <span className="sd-panel-label">Capture</span>
        </div>
        {!compact && (
          <figcaption className="mt-2 text-xs text-[var(--sd-muted)]">{clip.fps} fps video, muted</figcaption>
        )}
      </figure>

      {/* Landmark skeleton */}
      <figure className="m-0">
        <div className="sd-stage sd-stage-grid" style={ratio}>
          <SkeletonCanvas ref={skeletonRef} label={`Landmark skeleton for the sign ${pretty(clip.sign)}`} />
          <span className="sd-panel-label">Landmarks</span>
        </div>
        {!compact && (
          <figcaption className="mt-2 flex justify-between text-xs text-[var(--sd-muted)]">
            <span>MediaPipe hands + pose</span>
            <span className="font-mono tabular-nums">
              frame {String(frameNo).padStart(3, '0')}/{clip.frames.length}
            </span>
          </figcaption>
        )}
      </figure>
    </div>
  );
}
