// Samvaad panel (extension page shown in an iframe on the meeting page). Owns: UI, camera, WebSocket client.
import { RecognitionClient, ClipState, ConnState } from '../lib/recognition-client.js';
import { CameraSource } from '../lib/camera.js';
import { loadSettings, loadDefaultSigns, resolveSigns } from '../lib/settings.js';
import { evaluatePrediction, appendWord } from '../lib/filters.js';
import { initSpeechTab } from './speech-tab.js';
import { initCardsTab } from './cards-tab.js';

const $ = (id) => document.getElementById(id);
const els = Object.fromEntries(['pill', 'pillDot', 'card', 'platformLabel', 'connDot', 'connText', 'collapseBtn', 'sessionBtn', 'grantBtn', 'previewWrap',
  'preview', 'recBadge', 'recordRow', 'recordBtn', 'clipInfo', 'resultCard', 'text', 'sendBtn', 'copyBtn', 'clearBtn', 'message', 'optionsLink'].map((id) => [id, $(id)]));

const platform = new URLSearchParams(location.search).get('platform') || 'unknown';
const S = {
  settings: null, defaults: null, signs: {}, client: null, camera: null,
  sessionActive: false, starting: false, expanded: false, mirror: true, mirrorWhy: '', captureTimer: null, clipTimer: null,
  chatWaiters: new Map(), nextId: 1, cameraBlocked: false, tab: 'sign',
};

// ---------- relay to service worker ----------
let port = null;
function connectPort() {
  try { port = chrome.runtime.connect({ name: 'samvaad-panel' }); } catch { port = null; return; }
  port.onMessage.addListener(onRelayMessage);
  port.onDisconnect.addListener(() => { port = null; setTimeout(connectPort, 500); });
  publishStatus();
}
const post = (msg) => { try { port && port.postMessage(msg); } catch { /* reconnecting */ } };
setInterval(() => post({ type: 'ping' }), 20000);

// Two tabs can read the meeting's captions (Speech -> Sign and Cards). Each one starts/stops them independently, so
// 'captions-stop' only reaches the page once nobody needs the captions any more.
const capUsers = new Set();
function postFor(user) {
  return (msg) => {
    if (msg.type === 'captions-start') { capUsers.add(user); post(msg); }
    else if (msg.type === 'captions-stop') { capUsers.delete(user); if (capUsers.size === 0) post(msg); }
    else post(msg);
  };
}

const speech = initSpeechTab({ $, post: postFor('speech'), isVisible: () => speechVisible(), onUnread: (n) => setUnread(n) });
const cards = initCardsTab({ $, post: postFor('cards'), share: (text) => shareMessage(text), copyText: (t) => copyText(t) });

function currentStatus() {
  const c = S.client;
  return {
    platform,
    sessionActive: S.sessionActive,
    starting: S.starting,
    conn: c ? c.connState : ConnState.DISCONNECTED,
    clip: c ? c.clipState : ClipState.IDLE,
    camera: S.camera && S.camera.active ? 'on' : (S.cameraBlocked ? 'blocked' : 'off'),
    classes: c && c.info ? c.info.classes : null,
    message: els.message.textContent,
    messageKind: els.message.className.replace('message', '').trim(),
  };
}
function publishStatus() {
  const st = currentStatus();
  els.pillDot.className = `dot ${st.sessionActive ? (st.conn === 'connected' ? 'ok' : 'warn') : ''}`;
  els.connDot.className = `dot ${st.conn === 'connected' ? 'ok' : st.conn === 'disconnected' ? (st.sessionActive ? 'bad' : '') : 'warn'}`;
  els.connText.textContent = { connected: 'Connected', connecting: 'Connecting…', reconnecting: 'Reconnecting…', disconnected: st.sessionActive ? 'Disconnected' : 'Off' }[st.conn];
  post({ type: 'status', status: st });
}

function onRelayMessage(msg) {
  if (msg.type === 'command') {
    if (msg.cmd === 'start') { setExpanded(true); startSession(); }
    else if (msg.cmd === 'stop') stopSession('Recognition stopped.');
    else if (msg.cmd === 'toggle-panel') setExpanded(!S.expanded);
  } else if (msg.type === 'chat-result') {
    const w = S.chatWaiters.get(msg.id);
    if (w) { S.chatWaiters.delete(msg.id); w(msg); }
  } else if (msg.type === 'captions-snapshot' || msg.type === 'captions-enable-result') {
    speech.onRelay(msg);
    cards.onRelay(msg);
  }
}

// ---------- UI helpers ----------
function say(text, kind = '') { els.message.textContent = text; els.message.className = `message ${kind}`.trim(); publishStatus(); }
function setExpanded(on) {
  S.expanded = on;
  els.pill.hidden = on;
  els.card.hidden = !on;
  document.body.style.overflow = 'hidden';
  post({ type: 'resize', mode: on ? 'expanded' : 'collapsed' });
  speech.onVisibility(speechVisible());
  cards.onVisibility(on && S.tab === 'cards');
}

// ---------- tabs ----------
const speechVisible = () => S.expanded && S.tab === 'speech';
const TABS = [['tabSign', 'sign'], ['tabSpeech', 'speech'], ['tabCards', 'cards']];
function selectTab(name, focus = false) {
  S.tab = name;
  for (const [id, key] of TABS) {
    const on = key === name;
    $(id).setAttribute('aria-selected', String(on));
    $(id).tabIndex = on ? 0 : -1;
    if (on && focus) $(id).focus();
  }
  $('paneSign').hidden = name !== 'sign';
  $('paneSpeech').hidden = name !== 'speech';
  $('paneCards').hidden = name !== 'cards';
  els.connDot.hidden = els.connText.hidden = name !== 'sign'; // the service connection only concerns sign recognition
  speech.onVisibility(speechVisible());
  cards.onVisibility(S.expanded && name === 'cards');
}
function setUnread(n) { const b = $('tabBadge'); b.hidden = n === 0; b.textContent = String(n); }
function renderControls() {
  const c = S.client;
  const clip = c ? c.clipState : ClipState.IDLE;
  els.sessionBtn.textContent = S.sessionActive ? 'Stop recognition' : (S.starting ? 'Starting…' : 'Start recognition');
  els.sessionBtn.className = S.sessionActive ? '' : 'primary';
  els.sessionBtn.disabled = S.starting;
  els.previewWrap.hidden = !S.sessionActive;
  els.recordRow.hidden = !S.sessionActive;
  els.recBadge.hidden = clip !== ClipState.CAPTURING;
  els.recordBtn.disabled = !(S.sessionActive && c && c.isReady) || clip === ClipState.RECOGNIZING;
  els.recordBtn.className = clip === ClipState.CAPTURING ? 'recording' : '';
  els.recordBtn.textContent = clip === ClipState.CAPTURING ? 'Stop & recognize' : clip === ClipState.RECOGNIZING ? 'Recognizing…' : 'Record sign';
  els.grantBtn.hidden = !S.cameraBlocked;
  publishStatus();
}

// ---------- session lifecycle ----------
async function startSession() {
  if (S.sessionActive || S.starting) return;
  S.starting = true; S.cameraBlocked = false; renderControls();
  say('Connecting to the local recognition service…');
  try {
    S.settings = await loadSettings();
    S.defaults = S.defaults || await loadDefaultSigns();
    S.client = new RecognitionClient({ url: S.settings.serviceUrl }, {
      onConnState: () => renderControls(),
      onClipState: (s) => { renderControls(); if (s !== ClipState.CAPTURING) stopFrameLoop(); },
      onPrediction: onPrediction,
      onError: (m, meta) => { say(m, 'error'); if (meta && meta.fatal) stopSession(m, true); },
      onGaveUp: () => {},
      onFrameDropped: () => {},
    });
    const info = await S.client.connect();
    S.signs = resolveSigns(info.labels || [], S.defaults, S.settings.signOverrides);
    decideMirror(info);
    say('Service connected. Opening the camera…');
    S.camera = new CameraSource({ onEnded: () => stopSession('The camera stopped (unplugged or taken by another app). Recognition stopped.', true) });
    await S.camera.start(els.preview);
    S.sessionActive = true;
    S.starting = false;
    renderControls();
    say(`Ready (${info.classes} signs). Press "Record sign", sign once, then "Stop & recognize".`, 'ok');
  } catch (err) {
    const kind = err && err.kind;
    S.starting = false;
    await teardown();
    if (kind === 'permission') { S.cameraBlocked = true; }
    say(err.message || String(err), 'error');
    renderControls();
  }
}

function decideMirror(info) {
  const m = S.settings.mirror;
  if (m === 'on' || m === 'off') { S.mirror = m === 'on'; S.mirrorWhy = 'set in Settings'; return; }
  if (typeof info.flip_horizontal === 'boolean') { S.mirror = info.flip_horizontal; S.mirrorWhy = 'from checkpoint'; }
  else { S.mirror = true; S.mirrorWhy = 'service did not report flip_horizontal; assuming mirrored like live_inference.py'; }
}

async function teardown() {
  stopFrameLoop();
  if (S.camera) { S.camera.stop(); S.camera = null; }        // stop all media tracks
  if (S.client) { S.client.close(); S.client = null; }        // close the WebSocket
  S.sessionActive = false;
}

async function stopSession(note, isError = false) {
  await teardown();
  S.starting = false;
  renderControls();
  say(note || 'Recognition stopped.', isError ? 'error' : '');
}

// ---------- clip recording ----------
function startFrameLoop() {
  stopFrameLoop();
  const interval = 1000 / S.settings.captureFps;
  let busy = false;
  S.captureTimer = setInterval(async () => {
    if (busy || !S.camera || !S.client) return;
    busy = true;
    try {
      const frame = S.camera.captureJpeg({ mirror: S.mirror, width: S.settings.captureWidth, quality: S.settings.jpegQuality });
      if (frame && S.client) S.client.sendFrame(frame.buffer);
      if (S.client) els.clipInfo.textContent = `${S.client.framesSent} frames sent${S.client.framesDropped ? `, ${S.client.framesDropped} dropped` : ''}`;
    } finally { busy = false; }
  }, interval);
}
function stopFrameLoop() { clearInterval(S.captureTimer); S.captureTimer = null; }

function toggleRecord() {
  const c = S.client;
  if (!c) return;
  if (c.clipState === ClipState.IDLE) {
    if (c.startClip()) { els.resultCard.hidden = true; say('Recording… sign one word, then press "Stop & recognize".'); startFrameLoop(); }
  } else if (c.clipState === ClipState.CAPTURING) {
    stopFrameLoop();
    c.stopClip();
    say('Recognizing…');
  }
}

// ---------- predictions ----------
function onPrediction(pred) {
  stopFrameLoop();
  const r = evaluatePrediction(pred, S.settings, S.signs);
  renderResult(r, pred);
  if (r.autoAppend) {
    els.text.value = appendWord(els.text.value, r.display);
    say(`Added "${r.display}" (${r.confidence.toFixed(2)}). Review before sending.`, 'ok');
  } else {
    say(`Not added automatically: ${r.reasons.join('; ')}. Use + to add a suggestion.`);
  }
  renderControls();
}

function renderResult(r, pred) {
  const box = els.resultCard;
  box.replaceChildren();
  const title = document.createElement('div');
  title.className = 'small muted';
  title.textContent = `Last result: ${pred.frames} frames, ${pred.inference_ms} ms`;
  box.appendChild(title);
  const chips = document.createElement('div');
  chips.className = 'chips';
  for (const t of r.top.slice(0, 3)) {
    const chip = document.createElement('span');
    chip.className = 'chip';
    const label = document.createElement('span');
    label.textContent = `${t.display} ${(t.confidence * 100).toFixed(0)}%`;
    const tag = document.createElement('span');
    tag.className = `tag${t.verified ? ' ok' : ''}`;
    tag.textContent = t.verified ? 'verified' : 'unverified';
    const add = document.createElement('button');
    add.type = 'button'; add.textContent = '+'; add.title = `Add "${t.display}" to the message`;
    add.setAttribute('aria-label', `Add ${t.display}`);
    add.addEventListener('click', () => { els.text.value = appendWord(els.text.value, t.display); els.text.focus(); });
    chip.append(label, tag, add);
    chips.appendChild(chip);
  }
  box.appendChild(chips);
  box.hidden = false;
}

// ---------- text actions ----------
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* fall through */ }
  try {
    els.text.focus(); els.text.select();
    const ok = document.execCommand('copy');
    els.text.setSelectionRange(text.length, text.length);
    return ok;
  } catch { return false; }
}

function askContent(msg, timeoutMs = 4000) {
  return new Promise((resolve) => {
    const id = S.nextId++;
    const t = setTimeout(() => { S.chatWaiters.delete(id); resolve({ ok: false, method: 'none', detail: 'The meeting page did not respond.' }); }, timeoutMs);
    S.chatWaiters.set(id, (r) => { clearTimeout(t); resolve(r); });
    post({ ...msg, id });
  });
}

// Shares a message with the meeting: chat (send or fill) or clipboard, depending on the user's setting.
// Returns { message, kind, sent } for the caller to display. Callers invoke it ONLY from a user action.
async function shareMessage(text) {
  const settings = S.settings || await loadSettings();
  if (settings.sendMode !== 'clipboard') {
    const res = await askContent({ type: 'chat-send', text, mode: settings.sendMode === 'fill' ? 'fill' : 'chat' });
    if (res.ok) return { message: res.detail || 'Done.', kind: res.method === 'sent' ? 'ok' : '', sent: res.method === 'sent' };
    const copied = await copyText(text);
    return { message: `${res.detail} ${copied ? 'The text was copied to your clipboard; paste it into the chat.' : 'Copy failed; select the text and copy it manually.'}`, kind: 'error', sent: false };
  }
  return { message: (await copyText(text)) ? 'Copied. Paste it into the meeting chat.' : 'Copy failed; select the text and copy it manually.', kind: 'ok', sent: false };
}

// Sending is ALWAYS a direct result of the user pressing this button; predictions never reach this code path.
async function onSend() {
  const text = els.text.value.trim();
  if (!text) { say('Nothing to send. Sign something or type a message first.'); return; }
  const r = await shareMessage(text);
  say(r.message, r.kind);
  if (r.sent) els.text.value = '';
}

// ---------- wiring ----------
els.pill.addEventListener('click', () => setExpanded(true));
els.collapseBtn.addEventListener('click', () => setExpanded(false));
els.sessionBtn.addEventListener('click', () => (S.sessionActive ? stopSession('Recognition stopped.') : startSession()));
els.recordBtn.addEventListener('click', toggleRecord);
els.grantBtn.addEventListener('click', () => post({ type: 'open-permissions' }));
els.sendBtn.addEventListener('click', onSend);
els.copyBtn.addEventListener('click', async () => say((await copyText(els.text.value)) ? 'Copied to clipboard.' : 'Copy failed.', 'ok'));
els.clearBtn.addEventListener('click', () => { els.text.value = ''; els.resultCard.hidden = true; say(''); els.text.focus(); });
$('tabSign').addEventListener('click', () => selectTab('sign'));
$('tabSpeech').addEventListener('click', () => selectTab('speech'));
$('tabCards').addEventListener('click', () => selectTab('cards'));
for (const [id] of TABS) {
  $(id).addEventListener('keydown', (e) => { // arrow keys move between tabs, wrapping around (WAI-ARIA tabs pattern)
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    const i = TABS.findIndex(([, key]) => key === S.tab);
    selectTab(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length][1], true);
  });
}
els.optionsLink.addEventListener('click', (e) => { e.preventDefault(); window.open(chrome.runtime.getURL('src/options/options.html'), '_blank'); });
addEventListener('pagehide', () => { teardown(); speech.stop(); cards.stop(); });

els.platformLabel.textContent = platform === 'meet' ? ' · Google Meet' : '';
connectPort();
renderControls();
