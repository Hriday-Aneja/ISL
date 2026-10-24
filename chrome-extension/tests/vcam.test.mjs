import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

function load(flag, withCanvas) {
  const calls = [];
  const track = {};
  const canvas = { captureStream: (fps) => { calls.push(['capture', fps]); return { getVideoTracks: () => [track] }; } };
  const root = { dataset: flag ? { samvaadVcam: '1' } : {} };
  const orig = async (c) => { calls.push(['orig', JSON.stringify(c)]); return { getAudioTracks: () => [{ kind: 'audio' }] }; };
  const md = { getUserMedia: orig };
  class MediaStream { constructor(t) { this.tracks = t; } }
  const ctx = {
    navigator: { mediaDevices: md }, MediaStream,
    document: { documentElement: root, getElementById: (id) => (withCanvas && id === 'samvaad-vcam-canvas' ? canvas : null) },
  };
  ctx.globalThis = ctx;
  vm.runInNewContext(readFileSync(new URL('../src/content/vcam-main.js', import.meta.url), 'utf8'), ctx);
  return { md, calls, track, root };
}

test('off: Meet gets the real camera untouched', async () => {
  const { md, calls } = load(false, true);
  await md.getUserMedia({ video: true, audio: true });
  assert.deepEqual(calls.map((c) => c[0]), ['orig']);
});

test('on: video request gets the canvas track, audio stays the real microphone', async () => {
  const { md, calls, track } = load(true, true);
  const s = await md.getUserMedia({ video: { width: 1280 }, audio: true });
  assert.deepEqual(calls.map((c) => c[0]).sort(), ['capture', 'orig']);
  assert.equal(calls.find((c) => c[0] === 'orig')[1], JSON.stringify({ audio: true })); // the camera is never requested from the device
  assert.equal(s.tracks.length, 2);
  assert.equal(s.tracks[1], track);
});

test('on: audio-only requests are passed through, and a missing canvas falls back to the real camera', async () => {
  const a = load(true, true);
  await a.md.getUserMedia({ audio: true });
  assert.deepEqual(a.calls.map((c) => c[0]), ['orig']);
  const b = load(true, false);
  await b.md.getUserMedia({ video: true });
  assert.deepEqual(b.calls.map((c) => c[0]), ['orig']);
});

test('the hook announces itself so the panel can detect a stale tab', () => {
  assert.equal(load(false, false).root.dataset.samvaadVcamHooked, '1');
});
