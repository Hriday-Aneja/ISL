import { useCallback, useEffect, useRef, useState } from 'react';
import { PersonStanding } from 'lucide-react';
import type { AvatarProps, SignId } from '../../types';
import { SIGN_LABELS } from '../../data/signMappings';
import { AVATAR_VIDEOS } from '../../data/avatarVideos';

// Re-exported so existing imports from this module keep working.
export { AVATAR_VIDEOS };


interface AvatarPanelProps extends AvatarProps {
  showQueue?: boolean;
  compact?: boolean;
}

export function AvatarPanel({
  signs,
  isPlaying,
  onPlaybackComplete,
  showQueue = false,
  compact = false,
}: AvatarPanelProps) {
  const [activeIndex, setActiveIndex] = useState(-1);
  const [videoFailed, setVideoFailed] = useState(false);
  const [sequenceRunId, setSequenceRunId] = useState(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const onPlaybackCompleteRef = useRef(onPlaybackComplete);
  onPlaybackCompleteRef.current = onPlaybackComplete;

  useEffect(() => {
    if (!isPlaying || signs.length === 0) {
      setActiveIndex(-1);
      setVideoFailed(false);
      return;
    }

    setVideoFailed(false);
    setActiveIndex(0);
    setSequenceRunId((id) => id + 1);
  }, [isPlaying, signs]);

  const current = activeIndex >= 0 && activeIndex < signs.length ? signs[activeIndex] : null;
  const upcoming = activeIndex >= 0 ? signs.slice(activeIndex + 1) : [];

  const normalizedKey = current
    ? (String(current).trim().toUpperCase().replace(/[\s-]+/g, '_') as SignId)
    : undefined;
  const videoSrc = normalizedKey ? AVATAR_VIDEOS[normalizedKey] : undefined;

  const isActive = Boolean(isPlaying && current !== null);

  const advanceToNext = useCallback(() => {
    setActiveIndex((prevIndex) => {
      if (prevIndex < 0) return -1;
      if (prevIndex + 1 < signs.length) {
        setVideoFailed(false);
        return prevIndex + 1;
      }
      queueMicrotask(() => {
        onPlaybackCompleteRef.current?.();
      });
      return -1;
    });
  }, [signs.length]);

  useEffect(() => {
    setVideoFailed(false);
  }, [activeIndex, sequenceRunId]);

  useEffect(() => {
    const video = videoRef.current;
    if (!isPlaying || !isActive || !videoSrc || videoFailed || !video) return;

    video.currentTime = 0;
    const playPromise = video.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        setVideoFailed(true);
      });
    }
  }, [isPlaying, isActive, videoSrc, videoFailed, activeIndex, sequenceRunId]);

  useEffect(() => {
    if (!isPlaying || !isActive) return;
    if (videoSrc && !videoFailed) return;

    const timeout = setTimeout(advanceToNext, 1100);
    return () => clearTimeout(timeout);
  }, [isPlaying, isActive, videoSrc, videoFailed, activeIndex, advanceToNext]);

  const currentLabel = current ? SIGN_LABELS[current] ?? current : '';

  return (
    <div
      className={`relative flex h-full flex-col items-center justify-center
        overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1A2040_0%,_#0A0C16_78%)]
        text-white ${compact ? 'gap-1.5 px-2 py-2' : 'gap-4 px-4 py-4'}`}
    >
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2
          -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl
          ${compact ? 'h-16 w-16' : 'h-48 w-48 sm:h-56 sm:w-56'}
          ${isActive ? 'bg-voice/[0.12]' : 'bg-signal/[0.07]'}`}
      />

      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center overflow-hidden
          rounded-2xl border border-white/10 bg-white/[0.03]
          ${compact ? 'h-28 w-full' : 'w-full max-w-lg'}`}
      >
        {isActive && videoSrc && !videoFailed ? (
          <video
            ref={videoRef}
            key={`${sequenceRunId}-${activeIndex}-${current}-${videoSrc}`}
            src={videoSrc}
            autoPlay
            muted
            playsInline
            preload="auto"
            onEnded={advanceToNext}
            onError={() => setVideoFailed(true)}
            className="h-full w-full object-contain"
            aria-label={current ? `${currentLabel} sign avatar` : 'Sign avatar'}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 px-3 py-2 text-center">
            <PersonStanding
              size={compact ? 28 : 48}
              strokeWidth={1.3}
              className={isActive ? 'text-voice animate-pulse' : 'text-white/70'}
            />
            <span className="text-xs text-white/60">
              {videoFailed
                ? `${currentLabel} — video could not be loaded`
                : isActive
                  ? `${currentLabel} (sign preview)`
                  : 'Avatar ready'}
            </span>
          </div>
        )}
      </div>

      {!compact && (
        <p className="relative flex shrink-0 items-center gap-1.5 text-xs
          font-medium uppercase tracking-wide text-white/45">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? 'bg-voice animate-pulse' : 'bg-white/25'
            }`}
          />
          {isActive ? `Signing: ${currentLabel}` : 'Avatar ready'}
        </p>
      )}

      {compact && (
        <p className="relative text-[9px] font-medium uppercase
          tracking-wide text-white/45">
          {isActive ? currentLabel : 'Avatar'}
        </p>
      )}

      {!compact && showQueue && (current || upcoming.length > 0) && (
        <div className="relative w-full max-w-xs shrink-0 text-center">
          <p className="mb-1 text-[10px] font-medium uppercase
            tracking-wide text-white/35">
            Sign sequence
          </p>

          <div className="flex flex-wrap justify-center gap-1.5">
            {current && (
              <span className="sign-chip border-voice bg-voice text-ink">
                {SIGN_LABELS[current] ?? current}
              </span>
            )}

            {upcoming.map((sign, index) => (
              <span
                key={`${sign}-${index}`}
                className="sign-chip border-white/15 bg-white/5 text-white/70"
              >
                {SIGN_LABELS[sign] ?? sign}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}