import { useEffect, useRef, useState } from 'react';
import { RotateCcw, VideoOff } from 'lucide-react';

interface SignVideoProps {
  src: string;
  label: string;
  autoPlay?: boolean;
  /** Tailwind classes for the <video> element. */
  className?: string;
  dark?: boolean;
}

/**
 * Plays a real sign video from the app's own files. It is muted (the clips are
 * visual) and replayable. If the file can't be loaded it says so instead of
 * showing an empty box.
 */
export function SignVideo({ src, label, autoPlay = false, className = '', dark = false }: SignVideoProps) {
  const ref = useRef<HTMLVideoElement | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => setFailed(false), [src]);

  const replay = () => {
    const video = ref.current;
    if (!video) return;
    video.currentTime = 0;
    void video.play().catch(() => {
      // Autoplay/play can be refused; the native controls still work.
    });
  };

  if (failed) {
    return (
      <div
        role="alert"
        className={`flex flex-col items-center gap-2 rounded-md border-2 border-dashed px-4 py-8 text-center ${
          dark ? 'border-white/30 text-white' : 'border-white/15 text-cream'
        }`}
      >
        <VideoOff size={28} />
        <p className="text-base font-medium">The video for “{label}” could not be loaded.</p>
        <button type="button" onClick={() => setFailed(false)} className="btn-secondary min-h-[44px]">
          Try again
        </button>
      </div>
    );
  }

  return (
    <div>
      <video
        ref={ref}
        src={src}
        muted
        playsInline
        controls
        autoPlay={autoPlay}
        preload={autoPlay ? 'auto' : 'metadata'}
        onError={() => setFailed(true)}
        aria-label={`Sign video: ${label}`}
        className={`w-full rounded-md bg-black object-contain ${className}`}
      />
      <button
        type="button"
        onClick={replay}
        className={`mt-2 inline-flex min-h-[44px] items-center gap-2 rounded-sm px-3 text-base font-semibold ${
          dark ? 'bg-white/10 text-white hover:bg-white/20' : 'bg-signal-soft text-signal-deep hover:bg-signal hover:text-[#0c1413]'
        }`}
      >
        <RotateCcw size={17} /> Replay
      </button>
    </div>
  );
}
