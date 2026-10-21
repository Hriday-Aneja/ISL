import test from 'node:test';
import assert from 'node:assert/strict';
import { AvatarPlayer } from '../src/lib/avatar-player.js';

class FakeVideo {
  constructor({ failSrc = [], autoEndMs = 5 } = {}) { this.l = {}; this.failSrc = failSrc; this.autoEndMs = autoEndMs; this.played = []; this.playbackRate = 1; this._src = ''; }
  addEventListener(t, f) { (this.l[t] ||= new Set()).add(f); }
  removeEventListener(t, f) { this.l[t]?.delete(f); }
  emit(t) { for (const f of [...(this.l[t] || [])]) f(); }
  set src(v) { this._src = v; }
  get src() { return this._src; }
  pause() {}
  play() {
    this.played.push(this._src);
    if (this.failSrc.includes(this._src)) setTimeout(() => this.emit('error'), 1);
    else if (this.autoEndMs !== null) setTimeout(() => this.emit('ended'), this.autoEndMs);
    return Promise.resolve();
  }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const idle = async (p) => { for (let i = 0; i < 200 && (p.running || p.queue.length); i += 1) await sleep(5); };
const item = (sign, clip = `c/${sign}.mp4`) => ({ sign, label: sign, clip });

test('plays clips in order, one at a time, then goes idle', async () => {
  const v = new FakeVideo(); const states = [];
  const p = new AvatarPlayer({ video: v, onState: (s) => states.push(s.current && s.current.sign), placeholderMs: 5 });
  p.enqueue([item('A'), item('B'), item('C')]);
  await idle(p);
  assert.deepEqual(v.played, ['c/A.mp4', 'c/B.mp4', 'c/C.mp4']);
  assert.equal(states.at(-1), null);
  assert.equal(p.current, null);
});

test('a sign without a clip is shown as a placeholder (not skipped) and the queue continues', async () => {
  const v = new FakeVideo(); const seen = [];
  const p = new AvatarPlayer({ video: v, onState: (s) => seen.push([s.current && s.current.sign, s.placeholder, s.failed]), placeholderMs: 5 });
  p.enqueue([item('A'), { sign: 'WATER', label: 'Water', clip: null }, item('B')]);
  await idle(p);
  assert.deepEqual(v.played, ['c/A.mp4', 'c/B.mp4']);
  assert.ok(seen.some(([s, ph, f]) => s === 'WATER' && ph === true && f === false));
});

test('a clip that fails to load falls back to a placeholder marked failed, then continues', async () => {
  const v = new FakeVideo({ failSrc: ['c/BAD.mp4'] }); const seen = [];
  const p = new AvatarPlayer({ video: v, onState: (s) => seen.push([s.current && s.current.sign, s.placeholder, s.failed]), placeholderMs: 5 });
  p.enqueue([item('BAD'), item('B')]);
  await idle(p);
  assert.ok(seen.some(([s, ph, f]) => s === 'BAD' && ph && f));
  assert.deepEqual(v.played, ['c/BAD.mp4', 'c/B.mp4']);
});

test('clear() stops the current clip and drops the queue', async () => {
  const v = new FakeVideo({ autoEndMs: null }); // never ends by itself
  const p = new AvatarPlayer({ video: v, placeholderMs: 5 });
  p.enqueue([item('A'), item('B'), item('C')]);
  await sleep(10);
  assert.equal(p.current.sign, 'A');
  p.clear();
  await idle(p);
  assert.deepEqual(v.played, ['c/A.mp4']);
  assert.equal(p.current, null);
  assert.equal(p.queue.length, 0);
});

test('a backlog beyond maxQueue drops the OLDEST waiting items and reports how many', async () => {
  const v = new FakeVideo({ autoEndMs: null }); let last;
  const p = new AvatarPlayer({ video: v, onState: (s) => { last = s; }, maxQueue: 3 });
  p.enqueue([item('A')]); // starts playing and never ends
  await sleep(5);
  p.enqueue(['B', 'C', 'D', 'E', 'F'].map((s) => item(s)));
  assert.deepEqual(p.queue.map((i) => i.sign), ['D', 'E', 'F']);
  assert.equal(last.dropped, 2);
  p.clear();
});

test('speed is clamped to 0.5-2 and applied to the video', () => {
  const v = new FakeVideo(); const p = new AvatarPlayer({ video: v });
  p.setSpeed(1.5); assert.equal(v.playbackRate, 1.5);
  p.setSpeed(9); assert.equal(p.speed, 2);
  p.setSpeed(0); assert.equal(p.speed, 0.5);
  p.setSpeed('abc'); assert.equal(p.speed, 1);
});
