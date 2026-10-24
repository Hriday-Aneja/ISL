import { builtInHindi, hindiKey } from '../data/hindiCards';
import { API_BASE } from '../lib/apiBase';

/**
 * Hindi for cards.
 *
 *   1. Built-in translations for every preset card (data/hindiCards.ts).
 *   2. A small on-device cache for everything else (your own cards, AI cards).
 *   3. The server's /api/daily/translate endpoint fills the gaps; the AI key
 *      stays on the server. If that fails the card simply has no Hindi line
 *      and still works in English.
 */

const CACHE_KEY = 'samvaad-daily-hindi-v1';
const MAX_CACHE = 400;
const BATCH = 20;
const RETRY_AFTER_MS = 60_000;

let cache: Map<string, string> | null = null;
const failedAt = new Map<string, number>();
const inFlight = new Set<string>();

function storage(): Pick<Storage, 'getItem' | 'setItem'> | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

function loadCache(): Map<string, string> {
  if (cache) return cache;
  cache = new Map();
  try {
    const raw = storage()?.getItem(CACHE_KEY);
    const data: unknown = raw ? JSON.parse(raw) : null;
    if (Array.isArray(data)) {
      for (const entry of data) {
        if (Array.isArray(entry) && typeof entry[0] === 'string' && typeof entry[1] === 'string') {
          cache.set(entry[0], entry[1]);
        }
      }
    }
  } catch {
    // corrupted cache is simply ignored
  }
  return cache;
}

function persist() {
  const map = loadCache();
  while (map.size > MAX_CACHE) {
    const oldest = map.keys().next().value;
    if (oldest === undefined) break;
    map.delete(oldest);
  }
  try {
    storage()?.setItem(CACHE_KEY, JSON.stringify([...map.entries()]));
  } catch {
    // storage full or blocked: the in-memory cache still works this session
  }
}

const hasDevanagari = (s: string) => /[\u0900-\u097F]/.test(s);

/** Remembers a Hindi translation (e.g. one that arrived with an AI suggestion). */
export function rememberHindi(english: string, hindi: string): void {
  const key = hindiKey(english);
  const hi = hindi.trim();
  if (!key || !hi || !hasDevanagari(hi) || builtInHindi(english)) return;
  const map = loadCache();
  map.delete(key); // re-insert so it counts as most recent
  map.set(key, hi);
  persist();
}

/** Hindi we already have for this text (built-in or cached). Never touches the network. */
export function lookupHindi(text: string): string | undefined {
  return builtInHindi(text) ?? loadCache().get(hindiKey(text));
}

/**
 * Fetches Hindi for texts we don't have yet and caches it. Never throws.
 * Returns true if anything new was learned.
 */
export async function fetchMissingHindi(
  texts: string[],
  options: { baseUrl?: string; fetchImpl?: typeof fetch; signal?: AbortSignal } = {}
): Promise<boolean> {
  const { baseUrl = API_BASE, fetchImpl = fetch, signal } = options;
  const now = Date.now();
  const seen = new Set<string>();
  const todo: string[] = [];
  for (const raw of texts) {
    const text = raw.trim().replace(/\s+/g, ' ');
    const key = hindiKey(text);
    if (!key || seen.has(key) || lookupHindi(text) || inFlight.has(key)) continue;
    if (now - (failedAt.get(key) ?? 0) < RETRY_AFTER_MS) continue;
    seen.add(key);
    todo.push(text);
  }
  if (todo.length === 0) return false;

  let learned = false;
  for (let i = 0; i < todo.length; i += BATCH) {
    const chunk = todo.slice(i, i + BATCH);
    chunk.forEach((t) => inFlight.add(hindiKey(t)));
    try {
      const res = await fetchImpl(`${baseUrl}/api/daily/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({ texts: chunk }),
      });
      const data: unknown = res.ok ? await res.json() : null;
      const list =
        typeof data === 'object' && data !== null ? (data as { translations?: unknown }).translations : null;
      chunk.forEach((text, idx) => {
        const hi = Array.isArray(list) && typeof list[idx] === 'string' ? list[idx].trim() : '';
        if (hi && hasDevanagari(hi)) {
          rememberHindi(text, hi);
          learned = true;
        } else {
          failedAt.set(hindiKey(text), Date.now());
        }
      });
    } catch {
      if (signal?.aborted) break;
      chunk.forEach((t) => failedAt.set(hindiKey(t), Date.now()));
    } finally {
      chunk.forEach((t) => inFlight.delete(hindiKey(t)));
    }
  }
  return learned;
}

/** Test helper: forget everything in memory. */
export function resetHindiCacheForTests(): void {
  cache = null;
  failedAt.clear();
  inFlight.clear();
}
