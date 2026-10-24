import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Info, Loader2, Sparkles } from 'lucide-react';
import type { ScenarioId } from '../../data/dailyScenarios';
import { getSuggestions } from '../../services/dailySuggestions';

interface SuggestionsPanelProps {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  /** The user's own description (custom situations). */
  description: string;
  /** Texts already on screen, so suggestions never repeat them. */
  existingTexts: string[];
  /** Recent conversation texts; empty when the user turned context off. */
  recentTexts: string[];
  /** Recent conversation with speakers, for context-aware cards. Empty when context is off. */
  recentTagged?: Array<{ from: 'me' | 'other'; text: string }>;
  /** null while the status check is still running. */
  aiAvailable: boolean | null;
  /** Increment to fetch immediately (used after a custom description is submitted). */
  autoFetchToken?: number;
  /** For custom situations, suggestions need a description first. */
  needsDescription?: boolean;
  /**
   * Changes whenever a card is used or a message arrives. A new id makes the panel
   * fetch cards that fit the conversation and ADD them on top; nothing is removed.
   * `replyTo` is set when the other person just spoke or typed.
   */
  autoTrigger?: { id: string; replyTo?: string } | null;
  /** Automatic cards on/off (AI available, context allowed, setting on). */
  autoEnabled?: boolean;
  onFreshCards?: (count: number) => void;
  renderCard: (text: string, fresh: boolean) => ReactNode;
}

// Keep the panel compact: each automatic batch contributes six new cards and
// the six most recent older cards remain visible beneath them.
const MAX_ITEMS = 12;
const AUTO_COUNT = 6;
const AUTO_DELAY_MS = 700;

type LoadMode = 'more' | 'fresh' | 'auto';

export function SuggestionsPanel({
  scenarioId,
  scenarioLabel,
  description,
  existingTexts,
  recentTexts,
  recentTagged = [],
  aiAvailable,
  autoFetchToken = 0,
  needsDescription = false,
  autoTrigger = null,
  autoEnabled = false,
  onFreshCards,
  renderCard,
}: SuggestionsPanelProps) {
  const [items, setItems] = useState<string[]>([]);
  const [freshTexts, setFreshTexts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [source, setSource] = useState<'ai' | 'offline' | null>(null);
  const [exhausted, setExhausted] = useState(false);
  const requestRef = useRef(0);
  const controllerRef = useRef<AbortController | null>(null);

  // Always read the latest props inside the async loader.
  const latest = useRef({ existingTexts, recentTexts, recentTagged, description, aiAvailable, items, autoTrigger });
  latest.current = { existingTexts, recentTexts, recentTagged, description, aiAvailable, items, autoTrigger };
  // Kept in a ref so a new callback identity never re-runs the loaders below.
  const onFreshRef = useRef(onFreshCards);
  onFreshRef.current = onFreshCards;

  const load = useCallback(
    async (mode: LoadMode = 'more') => {
      controllerRef.current?.abort();
      const controller = new AbortController();
      controllerRef.current = controller;
      const id = ++requestRef.current;
      setLoading(true);
      if (mode !== 'auto') setExhausted(false);
      const current = latest.current;
      const auto = mode === 'auto';
      try {
        const result = await getSuggestions(
          {
            scenarioId,
            scenarioLabel,
            description: current.description,
            recent: current.recentTexts,
            recentTagged: current.recentTagged,
            replyTo: auto ? current.autoTrigger?.replyTo : undefined,
            existing: [...current.existingTexts, ...(mode === 'fresh' ? [] : current.items)],
            count: auto ? AUTO_COUNT : 8,
          },
          { aiAvailable: current.aiAvailable !== false, signal: controller.signal }
        );
        if (id !== requestRef.current) return;

        if (auto) {
          // Built-in cards ignore the conversation, so never push them in automatically.
          if (result.source !== 'ai' || result.suggestions.length === 0) return;
          setItems((prev) => [...result.suggestions, ...prev].slice(0, MAX_ITEMS));
          setFreshTexts(result.suggestions);
          setSource('ai');
          setNotice('');
          onFreshRef.current?.(result.suggestions.length);
          return;
        }

        setItems((prev) => [...(mode === 'fresh' ? [] : prev), ...result.suggestions].slice(0, MAX_ITEMS));
        setFreshTexts([]);
        setSource(result.source);
        setNotice(result.notice ?? '');
        setExhausted(result.suggestions.length === 0);
      } catch {
        // Only an aborted (superseded or unmounted) request lands here.
      } finally {
        if (id === requestRef.current) setLoading(false);
      }
    },
    [scenarioId, scenarioLabel]
  );

  useEffect(() => {
    if (autoFetchToken > 0) void load('fresh');
  }, [autoFetchToken, load]);

  // Fetch conversation-aware cards after each card use / reply. The trigger that
  // was already there when this panel appeared is ignored (switching tabs or
  // situations must not cost an AI call).
  const mountedTrigger = useRef(autoTrigger?.id);
  const triggerId = autoTrigger?.id;
  useEffect(() => {
    if (!autoEnabled || needsDescription || !triggerId || triggerId === mountedTrigger.current) return;
    const timer = setTimeout(() => void load('auto'), AUTO_DELAY_MS);
    return () => clearTimeout(timer);
  }, [triggerId, autoEnabled, needsDescription, load]);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const disabled = loading || needsDescription;
  const fresh = new Set(freshTexts);

  return (
    <section aria-labelledby="more-suggestions-heading" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 id="more-suggestions-heading" className="font-display text-lg font-semibold text-cream">
            More suggestions
          </h3>
          {source && (
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                source === 'ai'
                  ? 'border-signal/40 bg-signal-soft text-signal-deep'
                  : 'border-white/15 bg-white/[0.06] text-mist'
              }`}
            >
              {source === 'ai' && <Sparkles size={12} />}
              {source === 'ai' ? 'AI' : 'Built-in'}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => void load('more')}
          disabled={disabled}
          className="btn-primary min-h-[48px] px-5 text-base"
        >
          {loading ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
          {loading ? 'Finding cards…' : items.length === 0 ? 'More suggestions' : 'Show more'}
        </button>
      </div>

      {needsDescription && (
        <p className="text-sm text-mist">Describe your situation above to get suggestions.</p>
      )}

      {aiAvailable === false && !notice && (
        <p className="flex items-start gap-2 text-sm text-mist">
          <Info size={16} className="mt-0.5 shrink-0" />
          AI suggestions are not set up on this server, so built-in suggestions will be used.
        </p>
      )}
      {aiAvailable !== false && (
        <p className="flex items-start gap-2 text-sm text-mist">
          <Info size={16} className="mt-0.5 shrink-0" />
          AI suggestions send your situation{recentTexts.length > 0 ? ' and recent messages' : ''} to the AI
          service through this app&rsquo;s server.
        </p>
      )}

      {notice && (
        <p role="status" className="flex items-start gap-2 rounded-sm border border-voice/40 bg-voice-soft px-3 py-2 text-sm text-cream">
          <Info size={16} className="mt-0.5 shrink-0 text-voice-deep" />
          {notice}
        </p>
      )}

      {loading && items.length === 0 && (
        <div aria-busy="true" aria-label="Loading suggestions" className="space-y-2">
          {[0, 1, 2].map((n) => (
            <div key={n} className="h-16 animate-pulse rounded-md border-2 border-white/15 bg-white/[0.06]" />
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="space-y-2">
          <h4 className="font-display text-base font-semibold text-cream">
            AI cards
          </h4>
          <div className="grid gap-2 md:grid-cols-2">
          {items.map((text) => (
            <div key={text}>{renderCard(text, fresh.has(text))}</div>
          ))}
          </div>
        </div>
      )}

      {exhausted && !loading && (
        <p role="status" className="text-sm text-mist">
          No more new suggestions right now. Try writing your own card.
        </p>
      )}
    </section>
  );
}
