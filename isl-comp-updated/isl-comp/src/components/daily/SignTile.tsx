import { MessageSquarePlus, Star, Video } from 'lucide-react';
import type { IslSign } from '../../data/islSigns';

interface SignTileProps {
  sign: IslSign;
  favourite: boolean;
  onOpen: () => void;
  onUse: () => void;
  onToggleFavourite: () => void;
}

export function SignTile({ sign, favourite, onOpen, onUse, onToggleFavourite }: SignTileProps) {
  const hasVideo = Boolean(sign.videoSrc);
  return (
    <div className="daily-surface flex flex-col overflow-hidden rounded-md border-2 border-white/15 bg-night-card transition-colors hover:border-signal">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[84px] flex-1 flex-col items-start justify-between gap-2 px-3.5 py-3 text-left hover:bg-signal/10"
        aria-label={`${sign.label}, ${sign.categoryLabel}. ${hasVideo ? 'Video available' : 'No video yet'}. Open`}
      >
        <span className="text-lg font-semibold leading-snug text-cream">{sign.label}</span>
        <span className="flex w-full flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-xs text-mist">{sign.categoryLabel}</span>
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
              hasVideo ? 'bg-signal-soft text-signal-deep' : 'bg-white/[0.06] text-mist'
            }`}
          >
            {hasVideo && <Video size={12} />}
            {hasVideo ? 'Video' : 'No video yet'}
          </span>
        </span>
      </button>
      <div className="flex border-t border-white/15">
        <button
          type="button"
          onClick={onUse}
          className="flex min-h-[48px] flex-1 items-center justify-center gap-1.5 text-sm font-semibold text-signal-deep hover:bg-signal-soft"
          aria-label={`Add ${sign.label} to conversation`}
        >
          <MessageSquarePlus size={17} /> Add
        </button>
        <button
          type="button"
          onClick={onToggleFavourite}
          aria-pressed={favourite}
          aria-label={favourite ? `Remove ${sign.label} from favourites` : `Add ${sign.label} to favourites`}
          className={`flex min-h-[48px] w-12 items-center justify-center border-l border-white/15 hover:bg-white/[0.06] ${
            favourite ? 'text-voice-deep' : 'text-mist hover:text-cream'
          }`}
        >
          <Star size={18} className={favourite ? 'fill-current' : ''} />
        </button>
      </div>
    </div>
  );
}
