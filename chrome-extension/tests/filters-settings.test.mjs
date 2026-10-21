import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { evaluatePrediction, appendWord } from '../src/lib/filters.js';
import { validateServiceUrl, normalizeSettings, resolveSigns, DEFAULT_SETTINGS } from '../src/lib/settings.js';

const defaults = JSON.parse(readFileSync(new URL('../config/default-signs.json', import.meta.url)));
const labels = Object.keys(defaults.signs);
const pred = { label: 'hello', confidence: 0.8, top: [{ label: 'hello', confidence: 0.8 }, { label: 'you', confidence: 0.1 }, { label: 'i', confidence: 0.05 }] };

test('default config covers all 24 classes and ships none verified or enabled', () => {
  assert.equal(labels.length, 24);
  assert.ok(labels.every((l) => defaults.signs[l].verified === false && defaults.signs[l].enabled === false));
});

test('unverified/disabled sign is never auto-appended, reasons explain why', () => {
  const r = evaluatePrediction(pred, DEFAULT_SETTINGS, resolveSigns(labels, defaults));
  assert.equal(r.autoAppend, false);
  assert.match(r.reasons.join(), /not enabled/);
  assert.match(r.reasons.join(), /unverified/);
  assert.equal(r.top.length, 3);
});

test('verified + enabled sign is appended when thresholds pass', () => {
  const signs = resolveSigns(labels, defaults, { hello: { verified: true, enabled: true } });
  assert.equal(evaluatePrediction(pred, DEFAULT_SETTINGS, signs).autoAppend, true);
  assert.equal(evaluatePrediction(pred, { ...DEFAULT_SETTINGS, confidenceThreshold: 0.9 }, signs).autoAppend, false);
  assert.equal(evaluatePrediction(pred, { ...DEFAULT_SETTINGS, minMargin: 0.8 }, signs).autoAppend, false); // margin is 0.7
});

test('unknown label from service defaults to unverified + disabled', () => {
  const signs = resolveSigns(['mystery'], defaults);
  assert.deepEqual([signs.mystery.verified, signs.mystery.enabled], [false, false]);
});

test('appendWord spacing', () => {
  assert.equal(appendWord('', 'hello'), 'hello');
  assert.equal(appendWord('hello', 'you'), 'hello you');
  assert.equal(appendWord('hello ', 'you'), 'hello you');
});

test('service URL must be loopback ws://', () => {
  assert.equal(validateServiceUrl('ws://127.0.0.1:8765').ok, true);
  assert.equal(validateServiceUrl('ws://localhost:9000').ok, true);
  assert.equal(validateServiceUrl('ws://example.com:8765').ok, false);
  assert.equal(validateServiceUrl('wss://127.0.0.1:8765').ok, false);
  assert.equal(validateServiceUrl('http://127.0.0.1').ok, false);
  assert.equal(validateServiceUrl('nonsense').ok, false);
  assert.equal(normalizeSettings({ serviceUrl: 'ws://evil.example' }).serviceUrl, DEFAULT_SETTINGS.serviceUrl);
  assert.equal(normalizeSettings({ captureFps: 999 }).captureFps, 30);
});
