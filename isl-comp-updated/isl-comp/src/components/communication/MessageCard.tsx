import { Volume2, Square, PersonStanding } from 'lucide-react';

interface MessageCardProps {
  eyebrow: string; // "You signed" | "You said"
  sentence: string;
  tone: 'signal' | 'voice';
  onPlayAudio?: () => void;
  isSpeaking?: boolean;
  trailer?: string; // e.g. "Avatar signing…"
  emptyLabel: string;
}

/**
 * Final, user-facing output card. This is the ONLY place the translated
 * sentence is shown in the normal UI — no intermediate sign tokens or
 * pipeline stages appear here. (Those still exist in state for debugging;
 * see the Developer mode panel.)
 */
export function MessageCard({
  eyebrow,
  sentence,
  tone,
  onPlayAudio,
  isSpeaking,
  trailer,
  emptyLabel,
}: MessageCardProps) {
  const accent = tone === 'signal' ? 'border-l-signal' : 'border-l-voice';
  const eyebrowColor = tone === 'signal' ? 'text-signal' : 'text-voice';

  if (!sentence) {
    return (
      <div className="rounded-md border border-dashed border-white/15 bg-white/[0.03] px-4 py-4 text-center">
        <p className="text-sm text-room-text-soft">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div
      className={`animate-fade-up rounded-2xl border border-white/10 border-l-[3px] ${accent} bg-white/[0.05] px-4 py-3.5 shadow-stage`}
    >
      <p className={`text-[11px] font-medium uppercase tracking-wide ${eyebrowColor}`}>
        {eyebrow}
      </p>
      <p className="mt-1 font-display text-xl leading-snug text-room-text">“{sentence}”</p>

      {onPlayAudio && (
        <button
          onClick={onPlayAudio}
          className="mt-2.5 inline-flex items-center gap-1.5 text-sm font-medium text-signal hover:text-signal-deep"
        >
          {isSpeaking ? <Square size={14} /> : <Volume2 size={15} />}
          {isSpeaking ? 'Stop audio' : 'Play audio'}
        </button>
      )}

      {trailer && (
        <p className="mt-2.5 flex items-center gap-1.5 text-sm font-medium text-voice">
          <PersonStanding size={14} className="animate-pulse" />
          {trailer}
        </p>
      )}
    </div>
  );
}