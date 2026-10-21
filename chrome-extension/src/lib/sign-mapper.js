// Text -> sign sequence. Pure functions (no DOM, no chrome.*), so everything is unit-testable under Node.
//
// Ported from isl-comp's phraseMapper.ts with two behavioural changes that matter for an accessibility tool:
//   1. Words that cannot be signed are REPORTED (status 'unsigned') instead of silently dropped, so the UI can
//      show the reader exactly what the avatar did not cover.
//   2. Function words listed in config skipWords (a, the, is ...) are marked 'skipped': not signed, not flagged.
//
// Matching is greedy longest-phrase-first over the config.phrases table. Word order is the order spoken (English);
// nothing here reorders words into ISL grammar, only the phrase table's own entries do.

export function normalizeWord(input) {
  return String(input)
    .toLowerCase()
    .replace(/[\u2018\u2019\u02bc]/g, "'")
    .replace(/[-_/]+/g, ' ')
    .replace(/[?.!,;:"()[\]{}\u201c\u201d\u2026]/g, ' ')
    .replace(/^'+|'+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function createMapper(config = {}) {
  const phrases = config.phrases || {};
  const skip = new Set((config.skipWords || []).map((w) => normalizeWord(w)));
  const entries = Object.entries(phrases)
    .map(([phrase, signs]) => ({ tokens: normalizeWord(phrase).split(' ').filter(Boolean), signs }))
    .filter((e) => e.tokens.length > 0 && Array.isArray(e.signs) && e.signs.length > 0)
    .sort((a, b) => b.tokens.length - a.tokens.length);

  /**
   * @returns {{ signs: string[], tokens: {text: string, status: 'signed'|'skipped'|'unsigned'}[], unsigned: string[] }}
   */
  function mapText(rawText) {
    const original = String(rawText || '').split(/\s+/).filter(Boolean);
    // one original token ("train-station") can yield several words; remember which original token each came from
    const pieces = [];
    original.forEach((tok, origIndex) => {
      for (const w of normalizeWord(tok).split(' ').filter(Boolean)) pieces.push({ w, origIndex, status: null });
    });

    const signs = [];
    let i = 0;
    while (i < pieces.length) {
      const hit = entries.find((e) => i + e.tokens.length <= pieces.length && e.tokens.every((t, k) => pieces[i + k].w === t));
      if (hit) {
        signs.push(...hit.signs);
        for (let k = 0; k < hit.tokens.length; k += 1) pieces[i + k].status = 'signed';
        i += hit.tokens.length;
      } else {
        pieces[i].status = skip.has(pieces[i].w) ? 'skipped' : 'unsigned';
        i += 1;
      }
    }

    const rank = { unsigned: 2, signed: 1, skipped: 0 };
    const tokens = original.map((text, origIndex) => {
      let status = 'skipped'; // tokens that normalise to nothing (a lone "-") count as skipped
      for (const p of pieces) if (p.origIndex === origIndex && rank[p.status] > rank[status]) status = p.status;
      return { text, status };
    });
    return { signs, tokens, unsigned: tokens.filter((t) => t.status === 'unsigned').map((t) => t.text) };
  }

  return { mapText };
}

/** Turn sign IDs into playable queue items. A sign without a clip gets clip: null and is shown as a text card. */
export function toQueueItems(signs, config, resolveUrl = (p) => p) {
  const clips = config.clips || {};
  const labels = config.labels || {};
  return signs.map((sign) => ({ sign, label: labels[sign] || sign, clip: clips[sign] ? resolveUrl(clips[sign]) : null }));
}
