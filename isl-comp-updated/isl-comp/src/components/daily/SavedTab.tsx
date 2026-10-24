import { History, Star } from 'lucide-react';
import { getSignById, type IslSign } from '../../data/islSigns';
import { isFavouriteCard, type DailyState, type MessageSource } from '../../lib/dailyStore';
import { PhraseCard } from './PhraseCard';
import { SignTile } from './SignTile';

interface SavedTabProps {
  state: DailyState;
  onSend: (text: string, source: MessageSource) => void;
  onToggleFavourite: (text: string) => void;
  onOpenSign: (sign: IslSign) => void;
  onUseSign: (sign: IslSign) => void;
  onToggleFavouriteSign: (sign: IslSign) => void;
  hindiFor?: (text: string) => string | undefined;
}

export function SavedTab({
  state,
  onSend,
  onToggleFavourite,
  onOpenSign,
  onUseSign,
  onToggleFavouriteSign,
  hindiFor,
}: SavedTabProps) {
  const favSigns = state.favouriteSigns
    .map((id) => getSignById(id))
    .filter((s): s is IslSign => Boolean(s));

  const card = (text: string) => (
    <PhraseCard
      key={text}
      text={text}
      hindi={hindiFor?.(text)}
      favourite={isFavouriteCard(state, text)}
      onSelect={() => onSend(text, 'card')}
      onToggleFavourite={() => onToggleFavourite(text)}
    />
  );

  return (
    <div className="space-y-7">
      <section aria-labelledby="recent-heading" className="space-y-2">
        <h3 id="recent-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <History size={18} /> Recently used
        </h3>
        {state.recents.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-white/15 px-4 py-5 text-base text-mist">
            Cards you use will appear here for quick access.
          </p>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">{state.recents.map((r) => card(r.text))}</div>
        )}
      </section>

      <section aria-labelledby="fav-cards-heading" className="space-y-2">
        <h3 id="fav-cards-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Star size={18} /> Favourite cards
        </h3>
        {state.favouriteCards.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-white/15 px-4 py-5 text-base text-mist">
            Tap the star on any card to keep it here.
          </p>
        ) : (
          <div className="grid gap-2 xl:grid-cols-2">{state.favouriteCards.map((f) => card(f.text))}</div>
        )}
      </section>

      <section aria-labelledby="fav-signs-heading" className="space-y-2">
        <h3 id="fav-signs-heading" className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <Star size={18} /> Favourite signs
        </h3>
        {favSigns.length === 0 ? (
          <p className="rounded-md border-2 border-dashed border-white/15 px-4 py-5 text-base text-mist">
            Open the ISL Signs tab and tap the star on a sign to keep it here.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-3">
            {favSigns.map((sign) => (
              <SignTile
                key={sign.id}
                sign={sign}
                favourite
                onOpen={() => onOpenSign(sign)}
                onUse={() => onUseSign(sign)}
                onToggleFavourite={() => onToggleFavouriteSign(sign)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
