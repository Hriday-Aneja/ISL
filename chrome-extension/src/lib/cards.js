// Meeting Cards: pure helpers (no DOM, no chrome.*) so everything here is unit-testable under Node.
// A "card" is a short ready-made message. Sending is always an explicit user action; nothing in this file sends.

export const MAX_CUSTOM_CARDS = 12;
export const MAX_CARD_LENGTH = 200;
export const CAPTION_SIZE = Object.freeze({ min: 14, max: 32, step: 2, default: 18 });
export const MAX_CAPTION_ROWS = 8;

const clean = (s) => String(s ?? '').replace(/\s+/g, ' ').trim();

/** Validate the shipped config: drop malformed categories/cards and duplicate ids; never throws. */
export function normalizeCardsConfig(raw) {
  const seen = new Set();
  const categories = [];
  for (const cat of Array.isArray(raw && raw.categories) ? raw.categories : []) {
    const cards = [];
    for (const c of Array.isArray(cat && cat.cards) ? cat.cards : []) {
      const text = clean(c && c.text);
      const id = clean(c && c.id);
      if (!text || !id || seen.has(id) || text.length > MAX_CARD_LENGTH) continue;
      seen.add(id);
      const signs = Array.isArray(c.signs) ? c.signs.map(String).filter(Boolean) : [];
      cards.push(signs.length ? { id, text, signs } : { id, text });
    }
    const label = clean(cat && cat.label);
    if (label && cards.length) categories.push({ id: clean(cat.id) || label.toLowerCase(), label, cards });
  }
  return { categories };
}

/** User-made cards: trimmed, non-empty, de-duplicated (case-insensitive), length- and count-limited. */
export function normalizeCustomCards(list) {
  const out = [];
  const seen = new Set();
  for (const item of Array.isArray(list) ? list : []) {
    const t = clean(item);
    if (!t || t.length > MAX_CARD_LENGTH || seen.has(t.toLowerCase())) continue;
    seen.add(t.toLowerCase());
    out.push(t);
    if (out.length >= MAX_CUSTOM_CARDS) break;
  }
  return out;
}

export function addCustomCard(list, text) {
  const t = clean(text);
  const current = normalizeCustomCards(list);
  if (!t) return { ok: false, error: 'Type a message first.', list: current };
  if (t.length > MAX_CARD_LENGTH) return { ok: false, error: `Cards can be up to ${MAX_CARD_LENGTH} characters.`, list: current };
  if (current.some((c) => c.toLowerCase() === t.toLowerCase())) return { ok: false, error: 'That card already exists.', list: current };
  if (current.length >= MAX_CUSTOM_CARDS) return { ok: false, error: `You can save up to ${MAX_CUSTOM_CARDS} cards. Remove one first.`, list: current };
  return { ok: true, list: [...current, t] };
}

export function removeCustomCard(list, text) {
  const t = clean(text).toLowerCase();
  return normalizeCustomCards(list).filter((c) => c.toLowerCase() !== t);
}

export function clampCaptionSize(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return CAPTION_SIZE.default;
  return Math.min(CAPTION_SIZE.max, Math.max(CAPTION_SIZE.min, Math.round(v)));
}

export function stepCaptionSize(current, direction) {
  return clampCaptionSize(clampCaptionSize(current) + (direction < 0 ? -CAPTION_SIZE.step : CAPTION_SIZE.step));
}

/**
 * Merge a caption snapshot (rows: [{key, speaker, text}]) into a short rolling log, keeping order.
 * A row whose key is already in the log is updated in place (captions grow while someone is speaking).
 */
export function updateCaptionLog(log, rows, max = MAX_CAPTION_ROWS) {
  const next = log.map((r) => ({ ...r }));
  for (const row of rows || []) {
    const text = clean(row && row.text);
    if (!text) continue;
    const hit = next.find((r) => r.key === row.key);
    if (hit) { hit.text = text; hit.speaker = clean(row.speaker); } else next.push({ key: row.key, speaker: clean(row.speaker), text });
  }
  return next.slice(-max);
}

/**
 * Signs to preview for a card: its own 'signs' if it has them. Otherwise the phrase mapper's result, but ONLY when it
 * covers every word of the card. A partial preview (e.g. just PLEASE for "Could you please repeat that?") would
 * misrepresent the message, so such cards simply get no preview.
 */
export function signsForCard(card, mapText) {
  if (card && Array.isArray(card.signs) && card.signs.length) return card.signs;
  if (!mapText) return [];
  const m = mapText(card && card.text);
  return m.unsigned.length === 0 ? m.signs : [];
}
