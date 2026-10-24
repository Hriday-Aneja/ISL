import { test } from 'node:test';
import assert from 'node:assert/strict';
import { builtInHindi, hindiKey } from '../src/data/hindiCards';
import { EMERGENCY_PHRASES, OFFLINE_SUGGESTIONS, SCENARIO_CARDS } from '../src/data/dailyScenarios';
import { cleanSuggestionPairs } from '../src/services/dailySuggestions';
import {
  fetchMissingHindi,
  lookupHindi,
  rememberHindi,
  resetHindiCacheForTests,
} from '../src/services/hindi';
import { parseState, emptyState, DEFAULT_SETTINGS } from '../src/lib/dailyStore';

const DEVANAGARI = /[\u0900-\u097F]/;

test('every preset, emergency and built-in suggestion card has Hindi', () => {
  const all = [
    ...EMERGENCY_PHRASES.map((c) => c.text),
    ...Object.values(SCENARIO_CARDS).flatMap((cards) => cards.map((c) => c.text)),
    ...Object.values(OFFLINE_SUGGESTIONS).flat(),
  ];
  const missing = all.filter((text) => !builtInHindi(text));
  assert.deepEqual(missing, []);
  for (const text of all) assert.match(builtInHindi(text)!, DEVANAGARI);
});

test('Hindi lookup ignores case, spacing and punctuation', () => {
  assert.equal(builtInHindi('  thank   YOU '), 'धन्यवाद।');
  assert.equal(hindiKey('Thank you!'), hindiKey('thank you'));
});

test('cleanSuggestionPairs keeps Hindi aligned and drops duplicates', () => {
  const pairs = cleanSuggestionPairs(
    ['Yes.', 'yes', 'Where is the exit?', 'x'.repeat(500)],
    ['हाँ।', 'हाँ', 'निकास कहाँ है?', 'x'],
    ['no'],
    5
  );
  assert.deepEqual(pairs, [
    { text: 'Yes.', hindi: 'हाँ।' },
    { text: 'Where is the exit?', hindi: 'निकास कहाँ है?' },
  ]);
  // Non-Devanagari "Hindi" is rejected rather than spoken with the wrong voice.
  assert.deepEqual(cleanSuggestionPairs(['Hi there'], ['hello'], [], 3), [{ text: 'Hi there', hindi: '' }]);
});

test('fetchMissingHindi only asks for texts it does not have, then caches the answer', async () => {
  resetHindiCacheForTests();
  const bodies: string[][] = [];
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    const { texts } = JSON.parse(init.body) as { texts: string[] };
    bodies.push(texts);
    return { ok: true, json: async () => ({ translations: texts.map(() => 'आपका कार्ड') }) };
  }) as unknown as typeof fetch;

  const learned = await fetchMissingHindi(['Thank you.', 'My own card', 'my own card!'], { fetchImpl });
  assert.equal(learned, true);
  assert.deepEqual(bodies, [['My own card']]); // built-in skipped, duplicate merged
  assert.equal(lookupHindi('MY OWN CARD'), 'आपका कार्ड');

  assert.equal(await fetchMissingHindi(['My own card'], { fetchImpl }), false);
  assert.equal(bodies.length, 1);
});

test('a failed translation is not retried in a loop and never throws', async () => {
  resetHindiCacheForTests();
  let calls = 0;
  const fetchImpl = (async () => {
    calls += 1;
    throw new Error('offline');
  }) as unknown as typeof fetch;
  assert.equal(await fetchMissingHindi(['Some new card'], { fetchImpl }), false);
  assert.equal(await fetchMissingHindi(['Some new card'], { fetchImpl }), false);
  assert.equal(calls, 1);
});

test('rememberHindi ignores text that is not Devanagari', () => {
  resetHindiCacheForTests();
  rememberHindi('Another card', 'not hindi');
  assert.equal(lookupHindi('Another card'), undefined);
  rememberHindi('Another card', 'दूसरा कार्ड');
  assert.equal(lookupHindi('Another card'), 'दूसरा कार्ड');
});

test('stored state: new settings default on load, textHi survives, junk is dropped', () => {
  const fresh = parseState(null);
  assert.deepEqual(fresh.settings, emptyState().settings);
  assert.equal(fresh.settings.showHindi, true);
  assert.equal(fresh.settings.autoSuggest, true);
  assert.equal(fresh.settings.listenHindi, false);

  const old = parseState(JSON.stringify({ settings: { autoSpeak: false, largeText: true } }));
  assert.equal(old.settings.autoSpeak, false);
  assert.equal(old.settings.speakHindi, DEFAULT_SETTINGS.speakHindi);

  const s = parseState(
    JSON.stringify({
      messages: [
        { id: 'a', sender: 'me', source: 'card', text: 'Hello.', textHi: ' नमस्ते। ', timestamp: 1 },
        { id: 'b', sender: 'me', source: 'card', text: 'Yes.', textHi: 42, timestamp: 2 },
      ],
    })
  );
  assert.equal(s.messages[0].textHi, 'नमस्ते।');
  assert.equal(s.messages[1].textHi, undefined);
});
