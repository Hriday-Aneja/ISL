export interface StageCaption {
  eyebrow: string; // "You signed" | "You said"
  text: string;
  tone: 'signal' | 'voice';
}

/**
 * Lightweight call-style caption, distinct from MessageCard (the solid
 * white card used in the panels below) — this is meant to sit translucent
 * over live video, so it stays small and never competes with the stage.
 */
export function CaptionOverlay({ caption }: { caption: StageCaption | null }) {
  if (!caption) return null;

  const accent = caption.tone === 'signal' ? 'border-l-signal' : 'border-l-voice';

  return (
    <div className="pointer-events-none absolute inset-x-3 bottom-20 z-20 flex justify-center px-2 sm:inset-x-6 sm:bottom-20 sm:px-0">
      <div
        className={`max-w-[min(92%,48rem)] rounded-sm border-l-[3px] ${accent} bg-black/75 px-4 py-2.5 shadow-stage backdrop-blur-sm`}
      >
        <p className="text-[10px] font-medium uppercase tracking-wide text-white/60">
          {caption.eyebrow}
        </p>
        <p className="text-sm leading-snug text-white sm:text-base">“{caption.text}”</p>
      </div>
    </div>
  );
}
