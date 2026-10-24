import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MAX_MESSAGES,
  MAX_RECENTS,
  STORAGE_KEY,
  cardKey,
  customCardsFor,
  dailyReducer,
  emptyState,
  findDuplicateCustom,
  isFavouriteCard,
  loadState,
  parseState,
  saveState,
  type DailyMessage,
} from '../src/lib/dailyStore';

const add = (s = emptyState(), text = 'I need to sit down.', scenarioId: 'all' | 'travel' = 'travel', id = 'c1') =>
  dailyReducer(s, { type: 'add-custom', id, text, scenarioId, now: 1 });

test('add, edit and delete a custom card', () => {
  let s = add();
  assert.equal(s.customCards.length, 1);
  s = dailyReducer(s, { type: 'update-custom', id: 'c1', text: '  I need   a seat. ', scenarioId: 'all', now: 2 });
  assert.equal(s.customCards[0].text, 'I need a seat.');
  assert.equal(s.customCards[0].scenarioId, 'all');
  s = dailyReducer(s, { type: 'delete-custom', id: 'c1' });
  assert.equal(s.customCards.length, 0);
});

test('blank text is rejected on add and update', () => {
  assert.equal(add(emptyState(), '   ').customCards.length, 0);
  const s = add();
  assert.equal(dailyReducer(s, { type: 'update-custom', id: 'c1', text: '  ', scenarioId: 'all', now: 2 }), s);
});

test('favourite follows an edited card and is removed when the card is deleted', () => {
  let s = add();
  s = dailyReducer(s, { type: 'toggle-fav-card', text: 'I need to sit down.' });
  assert.ok(isFavouriteCard(s, 'i need to sit DOWN.'));
  s = dailyReducer(s, { type: 'update-custom', id: 'c1', text: 'I need a seat.', scenarioId: 'travel', now: 2 });
  assert.ok(isFavouriteCard(s, 'I need a seat.'));
  assert.ok(!isFavouriteCard(s, 'I need to sit down.'));
  s = dailyReducer(s, { type: 'delete-custom', id: 'c1' });
  assert.equal(s.favouriteCards.length, 0);
});

test('toggle favourites on and off for cards and signs', () => {
  let s = dailyReducer(emptyState(), { type: 'toggle-fav-card', text: 'Hello.' });
  assert.equal(s.favouriteCards.length, 1);
  s = dailyReducer(s, { type: 'toggle-fav-card', text: 'hello.' });
  assert.equal(s.favouriteCards.length, 0);
  s = dailyReducer(s, { type: 'toggle-fav-sign', id: 'doctor' });
  assert.deepEqual(s.favouriteSigns, ['doctor']);
  s = dailyReducer(s, { type: 'toggle-fav-sign', id: 'doctor' });
  assert.deepEqual(s.favouriteSigns, []);
});

test('recents are de-duplicated, newest first and capped', () => {
  let s = emptyState();
  for (let i = 0; i < MAX_RECENTS + 5; i++) s = dailyReducer(s, { type: 'add-recent', text: `Card ${i}`, now: i });
  assert.equal(s.recents.length, MAX_RECENTS);
  assert.equal(s.recents[0].text, `Card ${MAX_RECENTS + 4}`);
  s = dailyReducer(s, { type: 'add-recent', text: 'card 10', now: 99 });
  assert.equal(s.recents[0].text, 'card 10');
  assert.equal(s.recents.filter((r) => r.key === 'card 10').length, 1);
});

test('messages are capped and can be cleared', () => {
  let s = emptyState();
  for (let i = 0; i < MAX_MESSAGES + 10; i++) {
    const message: DailyMessage = { id: `m${i}`, sender: 'me', source: 'card', text: `t${i}`, timestamp: i };
    s = dailyReducer(s, { type: 'add-message', message });
  }
  assert.equal(s.messages.length, MAX_MESSAGES);
  assert.equal(s.messages[0].id, 'm10');
  s = dailyReducer(s, { type: 'clear-messages' });
  assert.equal(s.messages.length, 0);
});

test('custom cards are scoped to a scenario or to all', () => {
  let s = add(emptyState(), 'Only travel', 'travel', 'a');
  s = add(s, 'Everywhere', 'all', 'b');
  assert.deepEqual(customCardsFor(s, 'travel').map((c) => c.id).sort(), ['a', 'b']);
  assert.deepEqual(customCardsFor(s, 'workplace').map((c) => c.id), ['b']);
});

test('duplicate detection ignores case and spacing, and the card being edited', () => {
  const s = add();
  assert.ok(findDuplicateCustom(s, '  I NEED to   sit down.', 'travel'));
  assert.equal(findDuplicateCustom(s, 'I need to sit down.', 'travel', 'c1'), undefined);
  assert.equal(findDuplicateCustom(s, 'Something else', 'travel'), undefined);
});

test('save then load round-trips through storage', () => {
  const store = new Map<string, string>();
  const storage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  let s = add();
  s = dailyReducer(s, { type: 'set-setting', key: 'largeText', value: true });
  assert.equal(saveState(s, storage), true);
  assert.ok(store.has(STORAGE_KEY));
  const loaded = loadState(storage);
  assert.equal(loaded.persistent, true);
  assert.deepEqual(loaded.state, s);
});

test('corrupt or hostile stored data never throws and is sanitised', () => {
  assert.deepEqual(parseState('not json'), emptyState());
  assert.deepEqual(parseState('[1,2]'), emptyState());
  assert.deepEqual(parseState(null), emptyState());
  const s = parseState(
    JSON.stringify({
      customCards: [{ id: 'x', text: '  ok  ', scenarioId: 'bogus' }, { id: 5 }, null, { id: 'y', text: '   ' }],
      favouriteCards: [{ text: 'Hi' }, 3],
      favouriteSigns: ['a', 7],
      messages: [{ id: 'm', sender: 'alien', source: 'card', text: 'x', timestamp: 1 }, { id: 'n', sender: 'me', source: 'card', text: 'good', timestamp: 2 }],
      settings: { largeText: 'yes', autoSpeak: false },
    })
  );
  assert.equal(s.customCards.length, 1);
  assert.equal(s.customCards[0].text, 'ok');
  assert.equal(s.customCards[0].scenarioId, 'all');
  assert.equal(s.favouriteCards.length, 1);
  assert.deepEqual(s.favouriteSigns, ['a']);
  assert.equal(s.messages.length, 1);
  assert.equal(s.settings.largeText, false);
  assert.equal(s.settings.autoSpeak, false);
});

test('unavailable or full storage is reported, not thrown', () => {
  assert.equal(saveState(emptyState(), null), false);
  const full = { getItem: () => null, setItem: () => { throw new Error('quota'); } };
  assert.equal(saveState(emptyState(), full), false);
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {} };
  const loaded = loadState(broken);
  assert.equal(loaded.persistent, false);
  assert.deepEqual(loaded.state, emptyState());
});

test('cardKey normalises', () => {
  assert.equal(cardKey('  Hello   THERE '), 'hello there');
});
