import { useMemo, useState } from 'react';
import { Info, Search, X } from 'lucide-react';
import {
  ISL_CATEGORIES,
  ISL_SIGNS,
  ISL_VIDEO_COUNT,
  searchSigns,
  type IslSign,
} from '../../data/islSigns';
import { SignTile } from './SignTile';

interface SignsTabProps {
  favouriteSigns: string[];
  onOpen: (sign: IslSign) => void;
  onUse: (sign: IslSign) => void;
  onToggleFavourite: (sign: IslSign) => void;
}

export function SignsTab({ favouriteSigns, onOpen, onUse, onToggleFavourite }: SignsTabProps) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  const [onlyVideo, setOnlyVideo] = useState(false);
  const [onlyFavourites, setOnlyFavourites] = useState(false);

  const favSet = useMemo(() => new Set(favouriteSigns), [favouriteSigns]);
  const results = useMemo(
    () =>
      searchSigns({
        query,
        category,
        onlyWithVideo: onlyVideo,
        onlyIds: onlyFavourites ? favSet : null,
      }),
    [query, category, onlyVideo, onlyFavourites, favSet]
  );

  const chip = (active: boolean) =>
    `min-h-[44px] rounded-full border-2 px-3.5 text-sm font-semibold transition-colors ${
      active ? 'border-signal bg-signal text-[#06231d]' : 'border-white/15 bg-night-card text-cream hover:border-signal'
    }`;

  return (
    <div className="space-y-4">
      <p className="flex items-start gap-2.5 rounded-md border border-voice/40 bg-voice-soft px-3.5 py-3 text-sm text-cream">
        <Info size={17} className="mt-0.5 shrink-0 text-voice-deep" />
        <span>
          This is the ISL sign catalog ({ISL_SIGNS.length} signs). <strong>Only {ISL_VIDEO_COUNT} have a video in this app so far</strong>;
          the rest show their name and are marked &ldquo;No video yet&rdquo;. These are single signs, not translations of whole sentences.
        </span>
      </p>

      <div>
        <label htmlFor="sign-search" className="sr-only">
          Search signs
        </label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist" />
          <input
            id="sign-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search signs, e.g. doctor"
            autoComplete="off"
            className="min-h-[52px] w-full rounded-md border-2 border-white/15 bg-night-card pl-11 pr-12 text-lg text-cream outline-none focus-visible:border-signal"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-sm text-mist hover:text-cream"
            >
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Filter signs" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={onlyVideo} onClick={() => setOnlyVideo((v) => !v)} className={chip(onlyVideo)}>
          Has video ({ISL_VIDEO_COUNT})
        </button>
        <button type="button" aria-pressed={onlyFavourites} onClick={() => setOnlyFavourites((v) => !v)} className={chip(onlyFavourites)}>
          Favourites ({favouriteSigns.length})
        </button>
      </div>

      <div role="group" aria-label="Sign categories" className="flex flex-wrap gap-2">
        <button type="button" aria-pressed={category === null} onClick={() => setCategory(null)} className={chip(category === null)}>
          All ({ISL_SIGNS.length})
        </button>
        {ISL_CATEGORIES.map((c) => (
          <button
            key={c.category}
            type="button"
            aria-pressed={category === c.category}
            onClick={() => setCategory(category === c.category ? null : c.category)}
            className={chip(category === c.category)}
          >
            {c.label} ({c.count})
          </button>
        ))}
      </div>

      <p role="status" className="text-sm text-mist">
        {results.length === 0 ? 'No signs match your filters.' : `${results.length} sign${results.length === 1 ? '' : 's'}`}
      </p>

      {results.length === 0 ? (
        <div className="rounded-md border-2 border-dashed border-white/15 px-4 py-8 text-center text-base text-mist">
          Try a different word, or clear the filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 xl:grid-cols-3">
          {results.map((sign) => (
            <SignTile
              key={sign.id}
              sign={sign}
              favourite={favSet.has(sign.id)}
              onOpen={() => onOpen(sign)}
              onUse={() => onUse(sign)}
              onToggleFavourite={() => onToggleFavourite(sign)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
