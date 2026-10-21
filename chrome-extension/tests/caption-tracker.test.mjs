import test from 'node:test';
import assert from 'node:assert/strict';
import { CaptionTracker } from '../src/lib/caption-tracker.js';

const mk = () => new CaptionTracker({ settleMs: 1500, sentenceSettleMs: 700, maxHoldMs: 4000, holdbackWords: 2 });
const row = (text, key = 'r1', speaker = 'Alice') => [{ key, speaker, text }];
const texts = (evs) => evs.map((e) => e.text);

test('nothing is emitted while the caption is still changing', () => {
  const t = mk();
  t.update(row('so'), 0); assert.deepEqual(t.tick(100), []);
  t.update(row('so we need'), 600); assert.deepEqual(t.tick(900), []);
  t.update(row('so we need water'), 1200); assert.deepEqual(t.tick(2000), []); // only 800 ms since last change
});

test('settles after settleMs and emits once; unchanged text is never re-emitted', () => {
  const t = mk();
  t.update(row('we need water'), 0);
  assert.deepEqual(t.tick(1499), []);
  assert.deepEqual(texts(t.tick(1500)), ['we need water']);
  assert.deepEqual(t.tick(5000), []);
  t.update(row('we need water'), 5100); // keep-alive re-send of the same snapshot
  assert.deepEqual(t.tick(9000), []);
});

test('sentence ending settles faster', () => {
  const t = mk();
  t.update(row('Hello everyone.'), 0);
  assert.deepEqual(t.tick(699), []);
  assert.deepEqual(texts(t.tick(700)), ['Hello everyone.']);
});

test('growth emits only the new words (no repeats)', () => {
  const t = mk();
  t.update(row('good morning'), 0);
  assert.deepEqual(texts(t.tick(1600)), ['good morning']);
  t.update(row('good morning everyone welcome'), 2000);
  assert.deepEqual(texts(t.tick(3600)), ['everyone welcome']);
});

test('continuous speech is flushed after maxHoldMs, holding back the last two words', () => {
  const t = mk();
  let text = '';
  const out = [];
  for (let ms = 0; ms <= 6000; ms += 400) { text += (text ? ' ' : '') + `w${ms / 400}`; t.update(row(text), ms); out.push(...t.tick(ms)); }
  assert.ok(out.length >= 1, 'flushed without a pause');
  const emitted = out.flatMap((e) => e.text.split(' '));
  assert.equal(new Set(emitted).size, emitted.length, 'no word emitted twice');
  assert.ok(!emitted.includes(text.split(' ').at(-1)), 'newest word is held back');
  out.push(...t.tick(9000)); // pause: the rest settles
  assert.deepEqual(out.flatMap((e) => e.text.split(' ')), text.split(' '));
});

test('a row that disappears is flushed in full', () => {
  const t = mk();
  t.update(row('see you tomorrow'), 0);
  t.update([], 300);
  assert.deepEqual(texts(t.tick(300)), ['see you tomorrow']);
  assert.deepEqual(t.tick(5000), []);
});

test('Meet reusing a row for a new utterance or speaker starts fresh', () => {
  const t = mk();
  t.update(row('first thing said'), 0);
  assert.deepEqual(texts(t.tick(1600)), ['first thing said']);
  t.update(row('completely different words'), 2000);
  assert.deepEqual(texts(t.tick(3600)), ['completely different words']);
  t.update(row('same slot new person', 'r1', 'Bob'), 4000);
  assert.deepEqual(texts(t.tick(5600)), ['same slot new person']);
});

test('Meet shortening a row does not crash or re-emit', () => {
  const t = mk();
  t.update(row('one two three four'), 0);
  assert.deepEqual(texts(t.tick(1600)), ['one two three four']);
  t.update(row('one two'), 2000);
  assert.deepEqual(t.tick(4000), []);
  t.update(row('one two again'), 4100);
  assert.deepEqual(texts(t.tick(5700)), ['again']);
});

test('independent rows settle independently and carry their speaker', () => {
  const t = mk();
  t.update([{ key: 'a', speaker: 'Alice', text: 'hello there.' }, { key: 'b', speaker: 'Bob', text: 'and then' }], 0);
  const first = t.tick(700);
  assert.deepEqual(first.map((e) => [e.speaker, e.text]), [['Alice', 'hello there.']]);
  assert.deepEqual(t.tick(1500).map((e) => [e.speaker, e.text]), [['Bob', 'and then']]);
});
