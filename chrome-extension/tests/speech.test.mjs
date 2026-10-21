import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeSettings, DEFAULT_SETTINGS } from '../src/lib/settings.js';

test('speech settings: defaults keep everything local and sign automatically', () => {
  assert.equal(DEFAULT_SETTINGS.speechSource, 'captions');
  assert.equal(DEFAULT_SETTINGS.speechLocalOnly, true);
  assert.equal(DEFAULT_SETTINGS.autoSign, true);
  assert.equal(DEFAULT_SETTINGS.includeOwnCaptions, false);
});

test('speech settings: validation falls back to defaults and accepts form strings', () => {
  const n = normalizeSettings({ speechSource: 'cloud', speechLang: 'not a lang!', speechLocalOnly: 'false', autoSign: 'true', avatarSpeed: '9', includeOwnCaptions: 'maybe' });
  assert.equal(n.speechSource, 'captions');
  assert.equal(n.speechLang, 'en-IN');
  assert.equal(n.speechLocalOnly, false);
  assert.equal(n.autoSign, true);
  assert.equal(n.avatarSpeed, 2);
  assert.equal(n.includeOwnCaptions, false);
  assert.equal(normalizeSettings({ speechSource: 'mic', speechLang: 'hi-IN' }).speechLang, 'hi-IN');
});

// ---- MicRecognizer with a fake Web Speech implementation ----
function installFake({ withLocal = true, avail = 'available' } = {}) {
  const instances = [];
  class Rec {
    constructor() { instances.push(this); this.started = 0; }
    start() { this.started += 1; }
    stop() { this.onend && this.onend(); }
  }
  if (withLocal) { Rec.available = async () => avail; Rec.install = async () => true; Rec.prototype.processLocally = false; }
  globalThis.window = { webkitSpeechRecognition: Rec };
  return instances;
}
const mic = async () => (await import('../src/lib/speech-recognizer.js'));

test('mic: local-only sets processLocally and starts when the language pack is available', async () => {
  const inst = installFake();
  const { MicRecognizer } = await mic();
  const finals = []; const r = new MicRecognizer({ lang: 'en-IN', localOnly: true, onFinal: (t) => finals.push(t) });
  assert.equal(await r.start(), true);
  assert.equal(inst[0].processLocally, true);
  inst[0].onresult({ resultIndex: 0, results: [Object.assign([{ transcript: ' hello there ' }], { isFinal: true })] });
  assert.deepEqual(finals, ['hello there']);
  r.stop();
});

test('mic: only NEW results are emitted (resultIndex), so restarts never duplicate text', async () => {
  const inst = installFake();
  const { MicRecognizer } = await mic();
  const finals = []; const interim = [];
  const r = new MicRecognizer({ localOnly: true, onFinal: (t) => finals.push(t), onInterim: (t) => interim.push(t) });
  await r.start();
  const fin = (t) => Object.assign([{ transcript: t }], { isFinal: true });
  const live = (t) => Object.assign([{ transcript: t }], { isFinal: false });
  inst[0].onresult({ resultIndex: 0, results: [fin('one'), live('tw')] });
  inst[0].onresult({ resultIndex: 1, results: [fin('one'), fin('two')] });
  assert.deepEqual(finals, ['one', 'two']);
  assert.equal(interim[0], 'tw');
  r.stop();
});

test('mic: local-only REFUSES to start (no silent cloud fallback) when on-device is unsupported or missing', async () => {
  for (const [opts, code] of [[{ withLocal: false }, 'no-local'], [{ avail: 'downloadable' }, 'needs-install'], [{ avail: 'unavailable' }, 'no-local']]) {
    const inst = installFake(opts);
    const { MicRecognizer } = await mic();
    let err = null;
    const r = new MicRecognizer({ localOnly: true, onError: (e) => { err = e; } });
    assert.equal(await r.start(), false, JSON.stringify(opts));
    assert.equal(err.code, code);
    assert.equal(inst.length, 0, 'no recognizer was created, so no audio could be sent anywhere');
  }
});

test('mic: with local-only off it may use the browser default', async () => {
  const inst = installFake({ withLocal: false });
  const { MicRecognizer } = await mic();
  const r = new MicRecognizer({ localOnly: false });
  assert.equal(await r.start(), true);
  assert.equal(inst[0].processLocally, undefined);
  r.stop();
});

test('mic: permission errors are fatal and reported; routine no-speech restarts', async () => {
  const inst = installFake();
  const { MicRecognizer } = await mic();
  let err = null;
  const r = new MicRecognizer({ localOnly: true, onError: (e) => { err = e; } });
  await r.start();
  inst[0].onerror({ error: 'no-speech' }); assert.equal(err, null);
  inst[0].onerror({ error: 'not-allowed' }); assert.equal(err.code, 'permission'); assert.equal(err.fatal, true);
  r.stop();
});
