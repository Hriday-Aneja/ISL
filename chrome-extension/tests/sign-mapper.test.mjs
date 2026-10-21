import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createMapper, toQueueItems, normalizeWord } from '../src/lib/sign-mapper.js';

const root = new URL('../', import.meta.url);
const cfg = JSON.parse(readFileSync(new URL('config/avatar-signs.json', root)));
const { mapText } = createMapper(cfg);
const status = (r) => r.tokens.map((t) => `${t.text}:${t.status}`).join(' ');

test('config is consistent: every clip file exists, every phrase sign has a label', () => {
  for (const [sign, file] of Object.entries(cfg.clips)) assert.ok(existsSync(new URL(file, root)), `${sign} -> ${file}`);
  for (const [phrase, signs] of Object.entries(cfg.phrases)) for (const s of signs) assert.ok(cfg.labels[s], `${phrase} uses unlabelled sign ${s}`);
  assert.equal(Object.keys(cfg.clips).length, 11);
});

test('single words and punctuation/case are normalised', () => {
  assert.deepEqual(mapText('Hello!').signs, ['HELLO']);
  assert.deepEqual(mapText('  DOCTOR, ').signs, ['DOCTOR']);
  assert.equal(normalizeWord('I\u2019m'), "i'm");
  assert.deepEqual(mapText('I\u2019m fine').signs, ['I', 'FINE']);
});

test('longest phrase wins over its parts', () => {
  assert.deepEqual(mapText('I need water').signs, ['I', 'NEED', 'WATER']);
  assert.deepEqual(mapText('where is the washroom').signs, ['WHERE', 'WASHROOM']);
  assert.deepEqual(mapText('please help me').signs, ['HELP', 'ME']); // not PLEASE + HELP + ME
  assert.deepEqual(mapText('call a doctor').signs, ['DOCTOR', 'EMERGENCY']);
});

test('hyphenated and multi-word entries: train-station / railway station', () => {
  assert.deepEqual(mapText('train-station').signs, ['TRAIN_STATION']);
  assert.deepEqual(mapText('the railway station').signs, ['TRAIN_STATION']);
  assert.equal(mapText('train-station').tokens.length, 1);
});

test('unmapped words are reported, never silently dropped', () => {
  const r = mapText('hello zebra doctor');
  assert.deepEqual(r.signs, ['HELLO', 'DOCTOR']);
  assert.deepEqual(r.unsigned, ['zebra']);
  assert.equal(status(r), 'hello:signed zebra:unsigned doctor:signed');
});

test('function words are skipped, not flagged', () => {
  const r = mapText('the doctor is happy');
  assert.equal(status(r), 'the:skipped doctor:signed is:skipped happy:signed');
  assert.deepEqual(r.unsigned, []);
});

test('text with nothing signable yields no signs but keeps every token', () => {
  const r = mapText('quantum entanglement');
  assert.deepEqual(r.signs, []);
  assert.deepEqual(r.unsigned, ['quantum', 'entanglement']);
  assert.deepEqual(mapText('').tokens, []);
  assert.deepEqual(mapText('   ').signs, []);
});

test('queue items: signs with clips resolve to URLs, signs without stay clip:null (shown as text)', () => {
  const items = toQueueItems(['HELLO', 'WATER', 'UNKNOWN_X'], cfg, (p) => `chrome-extension://abc/${p}`);
  assert.deepEqual(items[0], { sign: 'HELLO', label: 'Hello', clip: 'chrome-extension://abc/assets/avatar/hello.mp4' });
  assert.equal(items[1].clip, null);
  assert.equal(items[1].label, 'Water');
  assert.deepEqual(items[2], { sign: 'UNKNOWN_X', label: 'UNKNOWN_X', clip: null });
});
