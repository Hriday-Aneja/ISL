import {
  OFFLINE_SUGGESTIONS,
  SCENARIO_CARDS,
  routeDescriptionToScenario,
  type PresetScenarioId,
  type ScenarioId,
} from '../data/dailyScenarios';
import { API_BASE } from '../lib/apiBase';
import { builtInHindi } from '../data/hindiCards';
import { rememberHindi } from './hindi';

/**
 * "More suggestions" for the Daily Translator.
 *
 * The AI call goes to OUR backend (/api/daily/suggest), which holds the API
 * key — the browser never sees it. If the backend, the network or the model
 * fails for any reason, we fall back to built-in suggestions so the button
 * always does something useful.
 */

export type SuggestionSource = 'ai' | 'offline';

export interface SuggestionInput {
  scenarioId: ScenarioId;
  scenarioLabel: string;
  description?: string;
  /** Recent conversation texts, oldest first. Empty when the user opted out. */
  recent?: string[];
  /** Recent conversation with who said what, oldest first. Empty when the user opted out. */
  recentTagged?: Array<{ from: 'me' | 'other'; text: string }>;
  /** What the other person just said; suggestions should work as replies to it. */
  replyTo?: string;
  /** Texts already on screen, so we don't suggest duplicates. */
  existing: string[];
  count?: number;
}

export interface SuggestionResult {
  suggestions: string[];
  /** Hindi for each suggestion, same order and length as `suggestions` ('' when unknown). */
  hindi?: string[];
  source: SuggestionSource;
  /** Shown to the user when we had to fall back. */
  notice?: string;
}

export type SuggestionErrorKind =
  | 'network'
  | 'not-configured'
  | 'rate-limited'
  | 'timeout'
  | 'bad-response'
  | 'upstream'
  | 'invalid';

export class SuggestionError extends Error {
  kind: SuggestionErrorKind;
  constructor(kind: SuggestionErrorKind, message: string) {
    super(message);
    this.name = 'SuggestionError';
    this.kind = kind;
  }
}

const NOTICES: Record<SuggestionErrorKind, string> = {
  network: "Couldn't reach the suggestion service, so these are built-in suggestions.",
  'not-configured': 'AI suggestions are not set up on the server, so these are built-in suggestions.',
  'rate-limited': 'Too many requests just now, so these are built-in suggestions.',
  timeout: 'The AI took too long to respond, so these are built-in suggestions.',
  'bad-response': "The AI's answer couldn't be used, so these are built-in suggestions.",
  upstream: 'AI suggestions are unavailable right now, so these are built-in suggestions.',
  invalid: 'AI suggestions are unavailable right now, so these are built-in suggestions.',
};

export interface RequestOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  signal?: AbortSignal;
  timeoutMs?: number;
}

const MAX_SUGGESTION_LENGTH = 120;

/** Duplicate check ignoring case, spacing and punctuation ("Thank you." == "thank you"). */
export function dedupeKey(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Normalises whatever the server returned into a clean, de-duplicated list. */
export function cleanSuggestions(raw: unknown, existing: string[], limit: number): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set(existing.map(dedupeKey));
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const text = item.trim().replace(/\s+/g, ' ');
    if (!text || text.length > MAX_SUGGESTION_LENGTH) continue;
    const key = dedupeKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

/** Like cleanSuggestions, but keeps each suggestion's Hindi aligned with it. */
export function cleanSuggestionPairs(
  rawSuggestions: unknown,
  rawHindi: unknown,
  existing: string[],
  limit: number
): Array<{ text: string; hindi: string }> {
  if (!Array.isArray(rawSuggestions)) return [];
  const seen = new Set(existing.map(dedupeKey));
  const out: Array<{ text: string; hindi: string }> = [];
  rawSuggestions.forEach((item, index) => {
    if (out.length >= limit || typeof item !== 'string') return;
    const text = item.trim().replace(/\s+/g, ' ');
    if (!text || text.length > MAX_SUGGESTION_LENGTH) return;
    const key = dedupeKey(text);
    if (!key || seen.has(key)) return;
    seen.add(key);
    const hi = Array.isArray(rawHindi) && typeof rawHindi[index] === 'string' ? rawHindi[index].trim() : '';
    out.push({ text, hindi: /[\u0900-\u097F]/.test(hi) ? hi : '' });
  });
  return out;
}

function kindFromStatus(status: number, code?: string): SuggestionErrorKind {
  if (code === 'ai-not-configured') return 'not-configured';
  if (status === 429) return 'rate-limited';
  if (status === 504 || code === 'ai-timeout') return 'timeout';
  if (status === 400) return 'invalid';
  if (code === 'bad-upstream-response') return 'bad-response';
  return 'upstream';
}

/** Asks the backend whether AI suggestions are configured. Never throws. */
export async function fetchAiStatus(options: RequestOptions = {}): Promise<boolean> {
  const { baseUrl = API_BASE, fetchImpl = fetch, signal, timeoutMs = 4000 } = options;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });
  try {
    const res = await fetchImpl(`${baseUrl}/api/daily/status`, { signal: controller.signal });
    if (!res.ok) return false;
    const data: unknown = await res.json();
    return typeof data === 'object' && data !== null && (data as { aiConfigured?: unknown }).aiConfigured === true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestAiSuggestions(
  input: SuggestionInput,
  options: RequestOptions = {}
): Promise<string[]> {
  return (await requestAiSuggestionPairs(input, options)).map((p) => p.text);
}

export async function requestAiSuggestionPairs(
  input: SuggestionInput,
  options: RequestOptions = {}
): Promise<Array<{ text: string; hindi: string }>> {
  const { baseUrl = API_BASE, fetchImpl = fetch, signal, timeoutMs = 15000 } = options;
  const count = input.count ?? 8;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  signal?.addEventListener('abort', () => controller.abort(), { once: true });

  let res: Response;
  try {
    res = await fetchImpl(`${baseUrl}/api/daily/suggest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        scenario: input.scenarioLabel,
        situation: input.description?.trim() || undefined,
        recent: input.recent?.slice(-6),
        recentTagged: input.recentTagged?.slice(-6),
        replyTo: input.replyTo?.trim() || undefined,
        existing: input.existing.slice(0, 40),
        count,
      }),
    });
  } catch (err) {
    if (signal?.aborted) throw err; // caller cancelled — not an error to report
    if (controller.signal.aborted) throw new SuggestionError('timeout', 'Request timed out');
    throw new SuggestionError('network', 'Network error');
  } finally {
    clearTimeout(timer);
  }

  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // fall through — handled below
  }

  if (!res.ok) {
    const code =
      typeof data === 'object' && data !== null ? (data as { error?: string }).error : undefined;
    throw new SuggestionError(kindFromStatus(res.status, code), `Server responded ${res.status}`);
  }

  const body = typeof data === 'object' && data !== null ? (data as { suggestions?: unknown; hindi?: unknown }) : {};
  const list = cleanSuggestionPairs(body.suggestions, body.hindi, input.existing, count);
  if (list.length === 0) throw new SuggestionError('bad-response', 'No usable suggestions');
  return list;
}

/**
 * Built-in suggestions. For a custom situation we pick the closest built-in
 * scenario by keyword (this is not understanding — just a sensible default).
 */
export function offlineSuggestions(input: SuggestionInput): {
  suggestions: string[];
  routedTo: PresetScenarioId;
} {
  const count = input.count ?? 8;
  const routedTo: PresetScenarioId =
    input.scenarioId === 'custom'
      ? routeDescriptionToScenario(input.description ?? '')
      : (input.scenarioId as PresetScenarioId);
  const pool = [
    ...OFFLINE_SUGGESTIONS[routedTo],
    ...SCENARIO_CARDS[routedTo].map((c) => c.text),
  ];
  return { suggestions: cleanSuggestions(pool, input.existing, count), routedTo };
}

/** AI when available, otherwise built-in. Never rejects because of AI trouble. */
export async function getSuggestions(
  input: SuggestionInput,
  options: RequestOptions & { aiAvailable?: boolean } = {}
): Promise<SuggestionResult> {
  const { aiAvailable = true, ...request } = options;
  if (aiAvailable) {
    try {
      const pairs = await requestAiSuggestionPairs(input, request);
      pairs.forEach((p) => p.hindi && rememberHindi(p.text, p.hindi));
      return {
        suggestions: pairs.map((p) => p.text),
        hindi: pairs.map((p) => p.hindi),
        source: 'ai',
      };
    } catch (err) {
      if (request.signal?.aborted) throw err;
      const kind = err instanceof SuggestionError ? err.kind : 'upstream';
      const offline = offlineSuggestions(input);
      return {
        suggestions: offline.suggestions,
        hindi: offline.suggestions.map((t) => builtInHindi(t) ?? ''),
        source: 'offline',
        notice: NOTICES[kind],
      };
    }
  }
  const offline = offlineSuggestions(input);
  return {
    suggestions: offline.suggestions,
    hindi: offline.suggestions.map((t) => builtInHindi(t) ?? ''),
    source: 'offline',
    notice: 'AI suggestions are not available, so these are built-in suggestions.',
  };
}
