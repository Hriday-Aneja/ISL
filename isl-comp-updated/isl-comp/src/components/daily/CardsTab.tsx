import { useMemo, useState } from 'react';
import { Pencil, Plus, Search, X, Copy } from 'lucide-react';
import {
  SCENARIOS,
  SCENARIO_CARDS,
  getScenario,
  type ScenarioId,
} from '../../data/dailyScenarios';
import {
  cardKey,
  customCardsFor,
  isFavouriteCard,
  type CustomCard,
  type DailyState,
  type MessageSource,
} from '../../lib/dailyStore';
import { PhraseCard } from './PhraseCard';
import { SuggestionsPanel } from './SuggestionsPanel';

interface CardsTabProps {
  scenario: ScenarioId;
  state: DailyState;
  aiAvailable: boolean | null;
  recentTexts: string[];
  /** Recent messages with who said them, for context-aware cards. */
  recentTagged: Array<{ from: 'me' | 'other'; text: string }>;
  /** Hindi for a card's English text, when known. */
  hindiFor: (text: string) => string | undefined;
  showHindiOnly: boolean;
  /** Set after every card/reply so new cards can be fetched automatically. */
  autoTrigger: { id: string; replyTo?: string } | null;
  autoEnabled: boolean;
  onFreshCards: (count: number) => void;
  situationName: string;
  /** Submitted description for a custom situation. */
  description: string;
  descriptionToken: number;
  onSubmitDescription: (name: string, description: string) => void;
  onSend: (text: string, source: MessageSource) => void;
  onToggleFavourite: (text: string) => void;
  onNewCard: (initialText?: string) => void;
  onEditCard: (card: CustomCard) => void;
  onCustomise: (text: string) => void;
  showAi?: boolean;
}

interface Result {
  text: string;
  source: MessageSource;
  eyebrow?: string;
  mine?: CustomCard;
}

// Every preset card across all scenarios, de-duplicated by text, for search.
const ALL_PRESETS: Array<{ text: string; scenarioLabel: string }> = (() => {
  const seen = new Set<string>();
  const out: Array<{ text: string; scenarioLabel: string }> = [];
  for (const s of SCENARIOS) {
    if (s.id === 'custom') continue;
    for (const card of SCENARIO_CARDS[s.id as Exclude<ScenarioId, 'custom'>]) {
      const key = cardKey(card.text);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ text: card.text, scenarioLabel: s.label });
    }
  }
  return out;
})();

export function CardsTab({
  scenario,
  state,
  aiAvailable,
  recentTexts,
  recentTagged,
  hindiFor,
  showHindiOnly,
  autoTrigger,
  autoEnabled,
  onFreshCards,
  situationName,
  description,
  descriptionToken,
  onSubmitDescription,
  onSend,
  onToggleFavourite,
  onNewCard,
  onEditCard,
  onCustomise,
  showAi = false,
}: CardsTabProps) {
  const [query, setQuery] = useState('');
  const [draftName, setDraftName] = useState(situationName);
  const [draftDescription, setDraftDescription] = useState(description);
  const info = getScenario(scenario);
  const isCustom = scenario === 'custom';

  const presets = useMemo(
    () => (isCustom ? [] : SCENARIO_CARDS[scenario as Exclude<ScenarioId, 'custom'>]),
    [scenario, isCustom]
  );
  const mine = customCardsFor(state, scenario);

  const existingTexts = useMemo(
    () => [...presets.map((c) => c.text), ...mine.map((c) => c.text)],
    [presets, mine]
  );

  const q = query.trim().toLowerCase();
  const results: Result[] = useMemo(() => {
    if (!q) return [];
    const out: Result[] = [];
    const seen = new Set<string>();
    const push = (r: Result) => {
      const key = cardKey(r.text);
      if (seen.has(key)) return;
      seen.add(key);
      out.push(r);
    };
    state.customCards
      .filter((c) => c.text.toLowerCase().includes(q))
      .forEach((c) => push({ text: c.text, source: 'custom-card', eyebrow: 'My card', mine: c }));
    state.favouriteCards
      .filter((f) => f.text.toLowerCase().includes(q))
      .forEach((f) => push({ text: f.text, source: 'card', eyebrow: 'Favourite' }));
    ALL_PRESETS.filter((c) => c.text.toLowerCase().includes(q)).forEach((c) =>
      push({ text: c.text, source: 'card', eyebrow: c.scenarioLabel })
    );
    return out;
  }, [q, state.customCards, state.favouriteCards]);

  const renderPreset = (text: string, source: MessageSource = 'card', mineCard?: CustomCard, eyebrow?: string) => (
    <PhraseCard
      key={`${source}-${cardKey(text)}`}
      text={text}
      eyebrow={eyebrow}
      hindi={hindiFor(text)}
      showHindiOnly={showHindiOnly}
      tone={mineCard ? 'mine' : source === 'suggestion' ? 'suggestion' : 'default'}
      favourite={isFavouriteCard(state, text)}
      onSelect={() => onSend(text, source)}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-samvaad-card', JSON.stringify({ text, source }));
        event.dataTransfer.setData('text/plain', text);
      }}
      onToggleFavourite={() => onToggleFavourite(text)}
      extra={
        mineCard
          ? { label: 'Edit card', icon: <Pencil size={18} />, onClick: () => onEditCard(mineCard) }
          : { label: 'Save a copy to edit', icon: <Copy size={18} />, onClick: () => onCustomise(text) }
      }
    />
  );

  return (
    <div className="space-y-6">
      <div>
        <label htmlFor="card-search" className="sr-only">
          Search cards
        </label>
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-mist" />
          <input
            id="card-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search all cards"
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

      {q ? (
        <section aria-label="Search results" className="space-y-2">
          <p role="status" className="text-sm text-mist">
            {results.length === 0 ? 'No cards match' : `${results.length} card${results.length === 1 ? '' : 's'} found`} “{query.trim()}”
          </p>
          {results.map((r) => renderPreset(r.text, r.source, r.mine, r.eyebrow))}
          {results.length === 0 && (
            <button type="button" onClick={() => onNewCard(query.trim())} className="btn-secondary min-h-[48px] text-base">
              <Plus size={18} /> Make a card saying “{query.trim()}”
            </button>
          )}
        </section>
      ) : (
        <>
          {isCustom && (
            <section aria-labelledby="custom-heading" className="daily-surface rounded-md border-2 border-white/15 bg-night-card p-4">
              <h3 id="custom-heading" className="font-display text-lg font-semibold text-cream">
                Describe your situation
              </h3>
              <form
                className="mt-2 space-y-3"
                onSubmit={(event) => {
                  event.preventDefault();
                  const name = draftName.trim();
                  const text = draftDescription.trim();
                  if (name && text) onSubmitDescription(name, text);
                }}
              >
                <label htmlFor="custom-situation-name" className="text-sm font-semibold text-cream">
                  Situation name
                </label>
                <input
                  id="custom-situation-name"
                  value={draftName}
                  onChange={(event) => setDraftName(event.target.value)}
                  maxLength={60}
                  placeholder="e.g. Bank account opening"
                  className="w-full rounded-sm border-2 border-white/15 bg-night px-3 py-2.5 text-lg text-cream outline-none focus-visible:border-signal"
                />
                <label htmlFor="custom-description" className="sr-only">
                  Describe your situation
                </label>
                <textarea
                  id="custom-description"
                  value={draftDescription}
                  onChange={(event) => setDraftDescription(event.target.value)}
                  maxLength={400}
                  rows={3}
                  placeholder="e.g. I am at the bank to open an account and need to talk to the manager."
                  className="w-full rounded-sm border-2 border-white/15 bg-night px-3 py-2.5 text-lg text-cream outline-none focus-visible:border-signal"
                />
                <button type="submit" disabled={!draftName.trim() || !draftDescription.trim()} className="btn-primary min-h-[48px] px-5 text-base">
                  Get cards for this situation
                </button>
              </form>
              {description && (
                <p className="mt-3 text-sm text-mist">
                  Showing cards for: <span className="font-medium text-cream">{situationName}</span>
                </p>
              )}
            </section>
          )}

          {!isCustom && (
            <section aria-labelledby="scenario-cards-heading" className="space-y-2">
              <h3 id="scenario-cards-heading" className="font-display text-lg font-semibold text-cream">
                {info.label}
              </h3>
              <div className="grid gap-2 md:grid-cols-2">
                {presets.map((card) => renderPreset(card.text, scenario === 'emergency' ? 'emergency' : 'card'))}
              </div>
            </section>
          )}

          <section aria-labelledby="my-cards-heading" className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 id="my-cards-heading" className="font-display text-lg font-semibold text-cream">
                My cards
              </h3>
              <button type="button" onClick={() => onNewCard()} className="btn-secondary min-h-[48px] px-4 text-base">
                <Plus size={18} /> New card
              </button>
            </div>
            {mine.length === 0 ? (
              <p className="rounded-md border-2 border-dashed border-white/15 px-4 py-5 text-base text-mist">
                You have no cards for this situation yet. Tap <strong>New card</strong> to write your own — it is saved on this device.
              </p>
            ) : (
              <div className="grid gap-2 md:grid-cols-2">
                {mine.map((card) => renderPreset(card.text, 'custom-card', card))}
              </div>
            )}
          </section>

          {showAi && <SuggestionsPanel
            key={scenario}
            scenarioId={scenario}
            scenarioLabel={isCustom && situationName ? situationName : info.label}
            description={description}
            existingTexts={existingTexts}
            recentTexts={recentTexts}
            recentTagged={recentTagged}
            aiAvailable={aiAvailable}
            autoFetchToken={descriptionToken}
            needsDescription={isCustom && !description}
            autoTrigger={autoTrigger}
            autoEnabled={autoEnabled}
            onFreshCards={onFreshCards}
            renderCard={(text, fresh) =>
              renderPreset(text, 'suggestion', undefined, fresh ? 'New for this conversation' : undefined)
            }
          />}
        </>
      )}
    </div>
  );
}
