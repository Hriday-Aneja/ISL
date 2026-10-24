import { useEffect, useRef } from 'react';
import { ArrowLeftRight, MicOff, VideoOff } from 'lucide-react';

interface LocalVideoPiPProps {
  stream: MediaStream | null;
  cameraEnabled: boolean;
  micEnabled: boolean;
  participantName: string;
  isLocal: boolean;
  onSwap: () => void;
}

/**
 * Floating self-view over the call stage: bottom-right (above the floating
 * call controls) from `sm` up, top-right on phones where the translation
 * panel takes the full bottom width. Captions sit top-center, so nothing
 * else competes for these corners.
 */
export function LocalVideoPiP({
  stream,
  cameraEnabled,
  micEnabled,
  participantName,
  isLocal,
  onSwap,
}: LocalVideoPiPProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isActive = Boolean(stream) && cameraEnabled;

  useEffect(() => {
    const el = videoRef.current;
    if (el && stream) {
      el.srcObject = stream;
      el.play().catch(() => {
        /* autoplay can be blocked; user can press play via controls */
      });
    }
  }, [stream]);

  return (
    <div className="absolute right-3 top-3 z-10 w-[128px] overflow-hidden rounded-xl border border-white/15 bg-room-surface shadow-stage sm:right-4 sm:top-4 sm:w-[180px] lg:w-[210px]">
      <div className="relative aspect-video">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`h-full w-full object-cover transition-opacity duration-200 ${
            isActive ? 'opacity-100' : 'opacity-0'
          }`}
            style={isLocal ? { transform: 'scaleX(-1)' } : undefined}
        />

        {!isActive && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-room-raised px-2 text-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-white">
                {participantName.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase()).join('') || <VideoOff size={14} />}
              </span>
              <span className="text-[9px] leading-tight text-room-text-soft">Camera off</span>
          </div>
        )}

        <span className="absolute bottom-1 left-1.5 flex max-w-[70%] items-center gap-1 rounded-sm bg-black/60 px-1.5 py-0.5 text-[9px] font-medium text-white/90">
          <span className="truncate">{participantName}{isLocal ? ' · You' : ''}</span>
          {!micEnabled && <MicOff size={10} className="shrink-0 text-[#ff9a90]" />}
        </span>
        <button
          type="button"
          onClick={onSwap}
          aria-label="Swap main and self video"
          title="Swap main and self video"
          className="absolute right-1 top-1 flex h-7 w-7 items-center justify-center rounded-sm bg-black/60 text-white hover:bg-black/80"
        >
          <ArrowLeftRight size={13} />
        </button>
      </div>
    </div>
  );
}