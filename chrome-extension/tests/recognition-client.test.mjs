import test from 'node:test';
import assert from 'node:assert/strict';
import { RecognitionClient, ClipState, ConnState } from '../src/lib/recognition-client.js';

class FakeWS {
  static instances = [];
  static autoReady = true;
  constructor(url) { this.url = url; this.readyState = 0; this.sent = []; this.bufferedAmount = 0; FakeWS.instances.push(this);
    setTimeout(() => { if (this.closedByClient) return; if (FakeWS.refuse) { this.readyState = 3; this.onclose?.(); return; }
      this.readyState = 1; if (FakeWS.autoReady) this.serverSend({ type: 'ready', service: { classes: 24, labels: ['a', 'b'], flip_horizontal: true } }); }, 1); }
  send(d) { this.sent.push(d); }
  close() { this.closedByClient = true; this.readyState = 3; this.onclose?.(); }
  serverSend(obj) { this.onmessage?.({ data: JSON.stringify(obj) }); }
  serverDrop() { this.readyState = 3; this.onclose?.(); }
}
const mk = (h = {}, o = {}) => { FakeWS.instances = []; FakeWS.refuse = false; FakeWS.autoReady = true;
  return new RecognitionClient({ url: 'ws://127.0.0.1:8765', WebSocketImpl: FakeWS, backoffMs: [5, 5], maxReconnects: 2, connectTimeoutMs: 50, recognizeTimeoutMs: 40, ...o }, h); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('connect resolves with service info (incl. flip_horizontal)', async () => {
  const c = mk(); const info = await c.connect();
  assert.equal(info.classes, 24); assert.equal(info.flip_horizontal, true); assert.equal(c.connState, ConnState.CONNECTED); c.close();
});

test('connection refused rejects with helpful message', async () => {
  const c = mk(); FakeWS.refuse = true;
  await assert.rejects(c.connect(), /Is recognition_service.py running/);
  assert.equal(c.connState, ConnState.DISCONNECTED);
});

test('connect timeout rejects when no ready message', async () => {
  const c = mk(); FakeWS.autoReady = false;
  await assert.rejects(c.connect(), /Timed out/);
});

test('clip protocol: start, frames, stop -> prediction', async () => {
  let pred; const c = mk({ onPrediction: (p) => { pred = p; } }); await c.connect();
  assert.equal(c.sendFrame(new ArrayBuffer(4)), false, 'frames are not sent before start');
  assert.ok(c.startClip());
  assert.equal(c.startClip(), false, 'no double start');
  const buf = new ArrayBuffer(8); assert.ok(c.sendFrame(buf));
  assert.ok(c.stopClip());
  const ws = FakeWS.instances[0];
  assert.deepEqual([JSON.parse(ws.sent[0]).type, ws.sent[1], JSON.parse(ws.sent[2]).type], ['start', buf, 'stop']);
  assert.equal(c.clipState, ClipState.RECOGNIZING);
  ws.serverSend({ type: 'prediction', label: 'a', confidence: 0.9, top: [{ label: 'a', confidence: 0.9 }] });
  assert.equal(pred.label, 'a'); assert.equal(c.clipState, ClipState.IDLE); c.close();
});

test('server auto-finish (prediction while capturing) returns to idle', async () => {
  let n = 0; const c = mk({ onPrediction: () => n++ }); await c.connect(); c.startClip();
  FakeWS.instances[0].serverSend({ type: 'prediction', label: 'a', confidence: 1, top: [] });
  assert.equal(n, 1); assert.equal(c.clipState, ClipState.IDLE); assert.equal(c.sendFrame(new ArrayBuffer(1)), false); c.close();
});

test('service error ("too short") ends the clip and reports', async () => {
  let err; const c = mk({ onError: (m) => { err = m; } }); await c.connect(); c.startClip(); c.stopClip();
  FakeWS.instances[0].serverSend({ type: 'error', message: 'Capture is too short (2 frames; need at least 8)' });
  assert.match(err, /too short/); assert.equal(c.clipState, ClipState.IDLE); c.close();
});

test('no answer after stop times out instead of hanging', async () => {
  let err; const c = mk({ onError: (m) => { err = m; } }); await c.connect(); c.startClip(); c.stopClip();
  await wait(80); assert.match(err, /did not answer/); assert.equal(c.clipState, ClipState.IDLE); c.close();
});

test('backed-up socket drops frames instead of queueing', async () => {
  const c = mk(); await c.connect(); c.startClip(); FakeWS.instances[0].bufferedAmount = 5_000_000;
  assert.equal(c.sendFrame(new ArrayBuffer(1)), false); assert.equal(c.framesDropped, 1); c.close();
});

test('disconnect mid-clip discards clip, reconnects, then resumes', async () => {
  const errs = []; const states = []; const c = mk({ onError: (m) => errs.push(m), onConnState: (s) => states.push(s) }); await c.connect(); c.startClip();
  FakeWS.instances[0].serverDrop();
  assert.equal(c.clipState, ClipState.IDLE); assert.match(errs[0], /lost while recording/);
  await wait(40); assert.equal(c.connState, ConnState.CONNECTED); assert.equal(FakeWS.instances.length, 2);
  assert.ok(states.includes(ConnState.RECONNECTING)); c.close();
});

test('gives up after maxReconnects and reports fatal', async () => {
  let fatal = false; const c = mk({ onError: (m, meta) => { if (meta && meta.fatal) fatal = true; } }); await c.connect();
  FakeWS.refuse = true; FakeWS.instances[0].serverDrop(); await wait(100);
  assert.equal(fatal, true); assert.equal(c.connState, ConnState.DISCONNECTED);
});

test('close() closes the socket and cancels timers', async () => {
  const c = mk(); await c.connect(); const ws = FakeWS.instances[0]; c.close();
  assert.equal(ws.closedByClient, true); assert.equal(c.connState, ConnState.DISCONNECTED); await wait(20); assert.equal(FakeWS.instances.length, 1);
});
