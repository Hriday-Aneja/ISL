import { ISL_CATALOG_ROWS } from './islSignsCatalog.generated';
import { AVATAR_VIDEOS } from './avatarVideos';
import type { SignId } from '../types';

/**
 * ISL sign catalog used by the Daily Translator.
 *
 * Two separate facts are kept apart on purpose:
 *  - the CATALOG (src/data/isl_signs_catalog.csv) says which signs exist and
 *    what category they belong to;
 *  - MEDIA (public/avatar-videos, via AVATAR_VIDEOS) says which of those signs
 *    the app can actually show. A sign with no media is reported as
 *    unavailable — nothing is ever synthesised or guessed.
 *
 * The catalog has no descriptions, so none are shown: a sign's "meaning" is
 * its English gloss exactly as listed.
 */

export interface IslSign {
  /** Stable slug, e.g. "train-station". */
  id: string;
  /** Raw category from the CSV, e.g. "Days_and_Time". */
  category: string;
  /** Human-readable category, e.g. "Days and time". */
  categoryLabel: string;
  /** Gloss exactly as written in the CSV. */
  gloss: string;
  /** Display label. */
  label: string;
  /** Lowercased phrases a text lookup may match (see signsInText). */
  phrases: string[];
  /** Playable video, only when a real file ships with the app. */
  videoSrc?: string;
}

// Entries the CSV writes as two synonyms in one cell. These are the only
// glosses split into separate words; every other multi-word gloss
// ("Cell phone", "Good morning") is kept as a phrase.
const SYNONYM_GLOSSES: Record<string, string[]> = {
  'big large': ['big', 'large'],
  'small little': ['small', 'little'],
};

export function categoryLabel(raw: string): string {
  const spaced = raw.replace(/_/g, ' ').trim();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}

function displayLabel(gloss: string): string {
  const synonyms = SYNONYM_GLOSSES[gloss.toLowerCase()];
  if (synonyms) return synonyms.map((s) => s.charAt(0).toUpperCase() + s.slice(1)).join(' / ');
  return gloss.charAt(0).toUpperCase() + gloss.slice(1);
}

function phrasesFor(gloss: string): string[] {
  const lower = gloss.toLowerCase();
  const synonyms = SYNONYM_GLOSSES[lower];
  if (synonyms) return synonyms;
  if (lower.includes(' or ')) return lower.split(' or ').map((p) => p.trim()).filter(Boolean);
  return [lower];
}

/** "Train Station" -> "TRAIN_STATION" (the id the existing avatar videos use). */
export function glossToSignId(gloss: string): string {
  return gloss
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export const ISL_SIGNS: IslSign[] = ISL_CATALOG_ROWS.map((row) => ({
  id: row.id,
  category: row.category,
  categoryLabel: categoryLabel(row.category),
  gloss: row.sign,
  label: displayLabel(row.sign),
  phrases: phrasesFor(row.sign),
  videoSrc: AVATAR_VIDEOS[glossToSignId(row.sign) as SignId],
}));

const BY_ID = new Map(ISL_SIGNS.map((s) => [s.id, s]));

export function getSignById(id: string): IslSign | undefined {
  return BY_ID.get(id);
}

export interface IslCategory {
  category: string;
  label: string;
  count: number;
  withVideo: number;
}

/** Categories in CSV order. */
export const ISL_CATEGORIES: IslCategory[] = (() => {
  const order: string[] = [];
  const map = new Map<string, IslCategory>();
  for (const sign of ISL_SIGNS) {
    let entry = map.get(sign.category);
    if (!entry) {
      entry = { category: sign.category, label: sign.categoryLabel, count: 0, withVideo: 0 };
      map.set(sign.category, entry);
      order.push(sign.category);
    }
    entry.count += 1;
    if (sign.videoSrc) entry.withVideo += 1;
  }
  return order.map((c) => map.get(c)!);
})();

export const ISL_VIDEO_COUNT = ISL_SIGNS.filter((s) => s.videoSrc).length;

export interface SignFilter {
  query?: string;
  category?: string | null;
  onlyWithVideo?: boolean;
  onlyIds?: ReadonlySet<string> | null;
}

export function searchSigns(filter: SignFilter = {}): IslSign[] {
  const q = (filter.query ?? '').trim().toLowerCase();
  return ISL_SIGNS.filter((sign) => {
    if (filter.category && sign.category !== filter.category) return false;
    if (filter.onlyWithVideo && !sign.videoSrc) return false;
    if (filter.onlyIds && !filter.onlyIds.has(sign.id)) return false;
    if (!q) return true;
    return (
      sign.label.toLowerCase().includes(q) ||
      sign.gloss.toLowerCase().includes(q) ||
      sign.categoryLabel.toLowerCase().includes(q) ||
      sign.phrases.some((p) => p.includes(q))
    );
  });
}

// ---------------------------------------------------------------------------
// Text -> catalog lookup
// ---------------------------------------------------------------------------

interface PhraseEntry {
  tokens: string[];
  sign: IslSign;
}

const PHRASE_INDEX: PhraseEntry[] = ISL_SIGNS.flatMap((sign) =>
  sign.phrases.map((phrase) => ({
    tokens: phrase.split(/\s+/).filter(Boolean),
    sign,
  }))
).sort((a, b) => b.tokens.length - a.tokens.length);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9'()\s]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function tokenMatches(token: string, phraseToken: string): boolean {
  if (token === phraseToken) return true;
  // Simple plural: "doctors" matches the single-word gloss "doctor".
  return token.length > 3 && token.endsWith('s') && token.slice(0, -1) === phraseToken;
}

/**
 * Finds catalog signs whose gloss appears as a word or phrase in `text`.
 *
 * This is a plain WORD LOOKUP. It does not translate a sentence into ISL,
 * does not reorder words into ISL grammar, and says nothing about whether the
 * sentence can be signed — it only reports which catalog glosses occur in it.
 */
export function signsInText(text: string): IslSign[] {
  const tokens = tokenize(text);
  const found: IslSign[] = [];
  const seen = new Set<string>();
  let i = 0;
  while (i < tokens.length) {
    let advanced = 1;
    for (const entry of PHRASE_INDEX) {
      const len = entry.tokens.length;
      if (i + len > tokens.length) continue;
      let ok = true;
      for (let j = 0; j < len; j++) {
        if (!tokenMatches(tokens[i + j], entry.tokens[j])) {
          ok = false;
          break;
        }
      }
      if (ok) {
        if (!seen.has(entry.sign.id)) {
          seen.add(entry.sign.id);
          found.push(entry.sign);
        }
        advanced = len;
        break;
      }
    }
    i += advanced;
  }
  return found;
}
