import { useEffect, useState } from 'react';
import { PersonStanding } from 'lucide-react';
import type { AvatarProps } from '../../types';
import { SIGN_LABELS } from '../../data/signMappings';

interface AvatarPanelProps extends AvatarProps {
  /** Debug-only: shows the upcoming sign queue as labeled chips. Off by default. */
  showQueue?: boolean;
  /** Shrinks the stage for use as a small mini-pane (e.g. floating over the
   * call video) — same animation/timing logic, just less chrome and no
   * queue text, since there isn't room for it. */
  compact?: boolean;
}

/**
 * MOCK AVATAR — stands in for the real 3D ISL avatar module.
 *
 * Integration point: this component satisfies the AvatarProps contract
 * defined in types/index.ts (signs, isPlaying, onPlaybackComplete). Drive it
 * with the playSigns() function from hooks/useAvatarPlayer.ts. To swap in a
 * real renderer, replace this component's JSX body with your Three.js /
 * GLB-GLTF avatar — the props contract and playSigns() call sites elsewhere
 * in the app don't need to change.
 */
export function AvatarPanel({
  signs,
  isPlaying,
  onPlaybackComplete,
  showQueue = false,
  compact = false,
}: AvatarPanelProps) {
  const [activeIndex, setActiveIndex] = useState(-1);

  useEffect(() => {
    if (!isPlaying || signs.length === 0) {
      setActiveIndex(-1);
      return;
    }
    setActiveIndex(0);
    let i = 0;
    const interval = setInterval(() => {
      i += 1;
      if (i >= signs.length) {
        clearInterval(interval);
        setActiveIndex(-1);
        onPlaybackComplete?.();
        return;
      }
      setActiveIndex(i);
    }, 1100);
    return () => clearInterval(interval);
  }, [isPlaying, signs, onPlaybackComplete]);

  const current = activeIndex >= 0 ? signs[activeIndex] : null;
  const upcoming = activeIndex >= 0 ? signs.slice(activeIndex + 1) : [];
  const isActive = current !== null;

  return (
    <div
      className={`relative flex h-full flex-col items-center justify-center overflow-hidden bg-[radial-gradient(ellipse_at_center,_#1C2B28_0%,_#0E1513_78%)] text-white ${
        compact ? 'gap-1.5 px-2 py-2' : 'gap-5 px-6 py-8'
      }`}
    >
      {/* Soft stage floor — a quiet glow that reads as depth, not neon */}
      <div
        className={`pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full blur-3xl transition-colors duration-500 ${
          compact ? 'h-16 w-16' : 'h-56 w-56 sm:h-64 sm:w-64'
        } ${isActive ? 'bg-voice/[0.12]' : 'bg-signal/[0.07]'}`}
      />

      <div
        className={`relative flex items-center justify-center rounded-full border border-white/10 bg-white/[0.03] shadow-[inset_0_1px_0_rgba(255,255,255,0.06),0_20px_40px_-16px_rgba(0,0,0,0.6)] ${
          compact ? 'h-10 w-10' : 'h-36 w-36 sm:h-44 sm:w-44'
        } ${isActive ? '' : 'animate-drift'}`}
      >
        <div className="flex h-[78%] w-[78%] items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
          <PersonStanding
            size={compact ? 20 : 64}
            strokeWidth={compact ? 1.4 : 1.15}
            className={`transition-all duration-300 ${
              isActive ? 'scale-110 text-voice' : 'scale-100 text-white/70'
            }`}
          />
        </div>
        {isActive && (
          <span className="absolute inset-0 rounded-full border-2 border-voice/60 animate-pulse-ring-amber" />
        )}
      </div>

      {!compact && (
        <p className="relative flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-white/45">
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              isActive ? 'bg-voice animate-pulse' : 'bg-white/25'
            }`}
          />
          {isActive ? 'Signing' : 'Avatar ready'}
        </p>
      )}

      {compact && (
        <p className="relative text-[9px] font-medium uppercase tracking-wide text-white/45">Avatar</p>
      )}

      {!compact && showQueue && (current || upcoming.length > 0) && (
        <div className="relative w-full max-w-xs text-center">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-white/35">
            Sign sequence
          </p>
          <div className="flex flex-wrap justify-center gap-1.5">
            {current && (
              <span className="sign-chip border-voice bg-voice text-ink">
                {SIGN_LABELS[current]}
              </span>
            )}
            {upcoming.map((s, i) => (
              <span key={`${s}-${i}`} className="sign-chip border-white/15 bg-white/5 text-white/70">
                {SIGN_LABELS[s]}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
