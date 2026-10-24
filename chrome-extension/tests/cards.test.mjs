import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  normalizeCardsConfig, normalizeCustomCards, addCustomCard, removeCustomCard, clampCaptionSize, stepCaptionSize,
  updateCaptionLog, signsForCard, MAX_CUSTOM_CARDS, MAX_CARD_LENGTH, CAPTION_SIZE,
} from '../src/lib/cards.js';
import { createMapper, toQueueItems } from '../src/lib/sign-mapper.js';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/settings.js';

const root = new URL('../', import.meta.url);
const raw = JSON.parse(readFileSync(new URL('config/meeting-cards.json', root)));
const avatar = JSON.parse(readFileSync(new URL('config/avatar-signs.json', root)));

test('shipped cards config is valid: nothing is dropped, ids unique, required messages present', () => {
  const cfg = normalizeCardsConfig(raw);
  const rawCount = raw.categories.reduce((n, c) => n + c.cards.length, 0);
  const cards = cfg.categories.flatMap((c) => c.cards);
  assert.equal(cards.length, rawCount);
  assert.equal(new Set(cards.map((c) => c.id)).size, cards.length);
  const texts = cards.map((c) => c.text);
  for (const t of ['Could you please repeat that?', 'Please speak slowly.', 'I have a question.', "I didn't understand."]) assert.ok(texts.includes(t), t);
});

test('every explicit card sign has a label in the avatar config (clip optional)', () => {
  for (const c of normalizeCardsConfig(raw).categories.flatMap((x) => x.cards)) for (const s of c.signs || []) assert.ok(avatar.labels[s], `${c.id}: ${s}`);
});

test('malformed config is cleaned without throwing', () => {
  assert.deepEqual(normalizeCardsConfig(null), { categories: [] });
  const cfg = normalizeCardsConfig({ categories: [
    { label: 'A', cards: [{ id: 'x', text: ' hi  there ' }, { id: 'x', text: 'dup id' }, { id: 'y', text: '' }, { text: 'no id' }, 7] },
    { label: '', cards: [{ id: 'z', text: 'orphan' }] },
    { label: 'Empty', cards: [] },
  ] });
  assert.equal(cfg.categories.length, 1);
  assert.deepEqual(cfg.categories[0].cards, [{ id: 'x', text: 'hi there' }]);
});

test('custom cards: trim, dedupe case-insensitively, limit count and length', () => {
  assert.deepEqual(normalizeCustomCards([' Hello ', 'hello', '', 5, 'Bye']), ['Hello', '5', 'Bye']);
  assert.deepEqual(normalizeCustomCards('nope'), []);
  assert.equal(normalizeCustomCards(Array.from({ length: 30 }, (_, i) => `c${i}`)).length, MAX_CUSTOM_CARDS);
  assert.deepEqual(normalizeCustomCards(['x'.repeat(MAX_CARD_LENGTH + 1)]), []);
});

test('addCustomCard / removeCustomCard report problems instead of silently failing', () => {
  assert.equal(addCustomCard([], '   ').ok, false);
  assert.equal(addCustomCard(['Hi'], 'hi').ok, false);
  assert.equal(addCustomCard([], 'x'.repeat(MAX_CARD_LENGTH + 1)).ok, false);
  const full = Array.from({ length: MAX_CUSTOM_CARDS }, (_, i) => `c${i}`);
  assert.equal(addCustomCard(full, 'one more').ok, false);
  const ok = addCustomCard(['A'], '  B  ');
  assert.deepEqual([ok.ok, ok.list], [true, ['A', 'B']]);
  assert.deepEqual(removeCustomCard(['A', 'B'], 'a'), ['B']);
});

test('caption size is clamped and stepped within bounds', () => {
  assert.equal(clampCaptionSize('abc'), CAPTION_SIZE.default);
  assert.equal(clampCaptionSize(1), CAPTION_SIZE.min);
  assert.equal(clampCaptionSize(999), CAPTION_SIZE.max);
  assert.equal(stepCaptionSize(CAPTION_SIZE.max, 1), CAPTION_SIZE.max);
  assert.equal(stepCaptionSize(CAPTION_SIZE.min, -1), CAPTION_SIZE.min);
  assert.equal(stepCaptionSize(18, 1), 20);
});

test('caption log updates growing rows in place and keeps only the newest rows', () => {
  let log = updateCaptionLog([], [{ key: 'a', speaker: 'Alice', text: 'hel' }]);
  log = updateCaptionLog(log, [{ key: 'a', speaker: 'Alice', text: 'hello there' }, { key: 'b', speaker: 'Bob', text: 'hi' }]);
  assert.deepEqual(log.map((r) => r.text), ['hello there', 'hi']);
  log = updateCaptionLog(log, Array.from({ length: 20 }, (_, i) => ({ key: `k${i}`, speaker: '', text: `t${i}` })), 5);
  assert.equal(log.length, 5);
  assert.equal(log.at(-1).text, 't19');
  assert.deepEqual(updateCaptionLog([], [{ key: 'q', text: '   ' }]), []);
});

test('avatar preview signs: explicit signs win, otherwise the phrase mapper decides; no clip means a text card', () => {
  const { mapText } = createMapper(avatar);
  assert.deepEqual(signsForCard({ text: 'Hello.', signs: ['HELLO'] }, mapText), ['HELLO']);
  assert.deepEqual(signsForCard({ text: 'I need water' }, mapText), ['I', 'NEED', 'WATER']);
  assert.deepEqual(signsForCard({ text: 'Could you please repeat that?' }, mapText), []);
  const items = toQueueItems(['HELLO', 'THANK_YOU'], avatar);
  assert.ok(items[0].clip && existsSync(new URL(items[0].clip, root)));
  assert.equal(items[1].clip, null); // THANK_YOU has no clip: shown as text, honestly
});

test('settings: card fields have safe defaults and are normalised', () => {
  assert.deepEqual(DEFAULT_SETTINGS.customCards, []);
  assert.equal(DEFAULT_SETTINGS.cardsQuickSend, false);
  const n = normalizeSettings({ customCards: ['A', 'a', ''], cardsQuickSend: 'true', cardsCaptionSize: 500 });
  assert.deepEqual(n.customCards, ['A']);
  assert.equal(n.cardsQuickSend, true);
  assert.equal(n.cardsCaptionSize, CAPTION_SIZE.max);
  assert.equal(normalizeSettings({}).cardsCaptionSize, CAPTION_SIZE.default);
});
