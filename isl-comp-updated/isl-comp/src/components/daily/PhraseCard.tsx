import type { DragEvent, ReactNode } from 'react';
import { Star } from 'lucide-react';

export type PhraseTone = 'default' | 'emergency' | 'mine' | 'suggestion';

interface PhraseCardProps {
  text: string;
  tone?: PhraseTone;
  favourite: boolean;
  onSelect: () => void;
  onToggleFavourite: () => void;
  /** Optional extra action, e.g. edit your own card or save a copy to edit. */
  extra?: { label: string; icon: ReactNode; onClick: () => void };
  /** Small line above the text, e.g. the scenario in search results. */
  eyebrow?: string;
  onDragStart?: (event: DragEvent<HTMLDivElement>) => void;
}

const TONE: Record<PhraseTone, string> = {
  default: 'border-white/15 hover:border-signal',
  mine: 'border-voice/60 hover:border-voice-deep',
  suggestion: 'border-dashed border-signal/50 hover:border-signal',
  emergency: 'border-alert/50 bg-alert/15 hover:border-alert',
};

/**
 * A ready-to-use message. The big button shows the message; the icon buttons
 * (favourite, optional edit) are separate controls so nothing is nested.
 */
export function PhraseCard({
  text,
  tone = 'default',
  favourite,
  onSelect,
  onToggleFavourite,
  extra,
  eyebrow,
  onDragStart,
}: PhraseCardProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      className={`daily-surface flex cursor-grab items-stretch overflow-hidden rounded-md border-2 bg-night-card transition-colors active:cursor-grabbing ${TONE[tone]}`}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex min-h-[56px] min-w-0 flex-1 flex-col justify-center gap-0.5 px-3 py-2 text-left transition-colors hover:bg-signal/10"
      >
        {eyebrow && (
          <span className="text-[11px] font-semibold uppercase tracking-wide text-mist">{eyebrow}</span>
        )}
        <span className="text-base font-medium leading-snug text-cream">{text}</span>
      </button>
      <div className="flex shrink-0 items-center border-l border-white/15">
        {extra && (
          <button
            type="button"
            onClick={extra.onClick}
            className="flex h-full min-h-[56px] w-10 items-center justify-center text-mist transition-colors hover:bg-white/[0.06] hover:text-cream"
            aria-label={`${extra.label}: ${text}`}
            title={extra.label}
          >
            {extra.icon}
          </button>
        )}
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite}
          aria-label={favourite ? `Remove from favourites: ${text}` : `Add to favourites: ${text}`}
          title={favourite ? 'Remove from favourites' : 'Add to favourites'}
          className={`flex h-full min-h-[56px] w-10 items-center justify-center transition-colors hover:bg-white/[0.06] ${
            favourite ? 'text-voice-deep' : 'text-mist hover:text-cream'
          }`}
        >
          <Star size={20} className={favourite ? 'fill-current' : ''} />
        </button>
      </div>
    </div>
  );
}
