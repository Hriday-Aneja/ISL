// "Speech -> Sign" tab: turns other people's speech (Meet captions, or the local microphone) or typed text into
// a transcript plus a signing avatar. Runs inside the panel iframe; the only page access it needs (reading Meet's
// captions) goes through the content script via the same port relay the chat integration uses.
import { CaptionTracker } from '../lib/caption-tracker.js';
import { createMapper, toQueueItems } from '../lib/sign-mapper.js';
import { AvatarPlayer } from '../lib/avatar-player.js';
import { MicRecognizer, speechSupported, installOnDevice } from '../lib/speech-recognizer.js';
import { loadSettings, loadAvatarConfig } from '../lib/settings.js';

const MAX_TURNS = 40;
const KEEPALIVE_MS = 15000;

export function initSpeechTab({ $, post, isVisible, onUnread }) {
  const els = Object.fromEntries(['srcSelect', 'listenBtn', 'capOnBtn', 'installBtn', 'micGrantBtn', 'stage', 'avatarVideo', 'stageCard', 'stageText', 'stageSub', 'stageInfo', 'helpRow',
    'speedSelect', 'skipBtn', 'autoSign', 'liveLine', 'turns', 'typeForm', 'typeInput', 'speechMessage'].map((id) => [id, $(id)]));
  const T = {
    settings: null, cfg: null, mapper: null, player: null, tracker: new CaptionTracker(), tick: null, keep: null,
    listening: false, source: 'captions', mic: null, capState: null, turnData: new Map(), nextTurn: 1, nextId: 1, waiters: new Map(), unread: 0,
  };

  const say = (text, kind = '') => { els.speechMessage.textContent = text; els.speechMessage.className = `message ${kind}`.trim(); };

  // ---------- avatar stage ----------
  function renderStage(st) {
    const cur = st.current;
    els.stage.dataset.sign = cur ? cur.sign : '';
    els.stage.dataset.mode = cur && !st.placeholder ? 'video' : 'text';
    els.stageCard.className = `stage-card${cur ? '' : ' idle'}`;
    els.stageText.textContent = !cur ? 'Avatar ready' : st.placeholder ? cur.label : '';
    els.stageSub.textContent = cur && st.placeholder ? (st.failed ? 'the clip failed to load' : 'no avatar clip for this sign yet') : '';
    let info = cur ? `Signing: ${cur.label}` : (T.listening ? 'Waiting for speech' : 'Not listening');
    if (st.queued) info += ` · ${st.queued} waiting`;
    if (st.dropped) info += ` · skipped ${st.dropped} older sign${st.dropped === 1 ? '' : 's'} to catch up`;
    els.stageInfo.textContent = info;
    for (const [id, d] of T.turnData) d.el.classList.toggle('playing', Boolean(cur && cur.turnId === id));
  }

  function enqueueTurn(id, signs) {
    if (!T.player || !T.cfg) return;
    T.player.enqueue(toQueueItems(signs, T.cfg, (p) => chrome.runtime.getURL(p)).map((i) => ({ ...i, turnId: id })));
  }

  // ---------- transcript ----------
  function renderTurn(id, speaker, map, text) {
    const li = document.createElement('li');
    li.className = 'turn';
    const who = document.createElement('div');
    who.className = 'who';
    const name = document.createElement('span');
    name.textContent = speaker;
    const replay = document.createElement('button');
    replay.type = 'button';
    replay.textContent = 'Sign';
    replay.setAttribute('aria-label', `Sign this again: ${text}`);
    replay.disabled = map.signs.length === 0;
    replay.addEventListener('click', () => enqueueTurn(id, map.signs));
    who.append(name, replay);
    const words = document.createElement('div');
    map.tokens.forEach((t, i) => {
      const w = document.createElement('span');
      w.className = `w ${t.status}`;
      w.textContent = t.text;
      if (t.status === 'unsigned') w.title = 'No sign available for this word';
      if (t.status === 'skipped') w.title = 'Not signed (function word)';
      words.append(w, i < map.tokens.length - 1 ? ' ' : '');
    });
    li.append(who, words);
    if (map.signs.length === 0) addNote(li, 'No signs available for this text.');
    else if (map.unsigned.length) addNote(li, `Not covered by the avatar: ${map.unsigned.join(', ')}`);
    els.turns.append(li);
    T.turnData.set(id, { el: li, map });
    while (els.turns.children.length > MAX_TURNS) { const first = els.turns.firstElementChild; for (const [k, d] of T.turnData) if (d.el === first) T.turnData.delete(k); first.remove(); }
    els.turns.scrollTop = els.turns.scrollHeight;
    return li;
  }
  function addNote(li, text) { const n = document.createElement('div'); n.className = 'note'; n.textContent = text; li.append(n); }

  function addTurn(speaker, text, { force = false } = {}) {
    if (!T.mapper) return;
    const map = T.mapper.mapText(text);
    if (map.tokens.length === 0) return;
    const id = T.nextTurn++;
    const li = renderTurn(id, speaker, map, text);
    if (map.signs.length === 0) return;
    if (!isVisible()) { // the avatar is only driven while the user can see it; missed turns keep a Sign button
      addNote(li, 'Arrived while this tab was hidden: press Sign to play it.');
      T.unread += 1;
      onUnread(T.unread);
    } else if (force || els.autoSign.checked) enqueueTurn(id, map.signs);
  }

  // ---------- listening ----------
  function setListening(on) {
    T.listening = on;
    els.listenBtn.textContent = on ? 'Stop listening' : 'Start listening';
    els.listenBtn.className = on ? '' : 'primary';
    els.srcSelect.disabled = on;
    if (!on) els.liveLine.textContent = '';
    renderStage({ current: T.player && T.player.current, placeholder: T.player && T.player.placeholder, failed: false, queued: T.player ? T.player.queue.length : 0, dropped: 0 });
  }

  function syncHelp() { els.capOnBtn.hidden = T.source !== 'captions' || T.capState === 'watching'; }

  function syncSourceUi() {
    T.source = els.srcSelect.value;
    syncHelp();
    els.installBtn.hidden = true;
    els.micGrantBtn.hidden = true;
  }

  const ownSpeaker = (s) => String(s || '').trim().toLowerCase() === 'you';

  function onSnapshot(msg) {
    const prev = T.capState;
    T.capState = msg.state;
    syncHelp();
    if (!T.listening || T.source !== 'captions') return;
    if (msg.state === 'watching') {
      const rows = (msg.rows || []).filter((r) => T.settings.includeOwnCaptions || !ownSpeaker(r.speaker));
      T.tracker.update(rows);
      const last = rows[rows.length - 1];
      els.liveLine.textContent = last ? `${last.speaker ? `${last.speaker}: ` : ''}${last.text}` : '';
      if (prev !== 'watching') say('Listening to Meet captions. Signs follow a moment after the words settle.', 'ok');
    } else {
      T.tracker.update([]); // captions went away: flush whatever had already settled
    }
    if (msg.state !== 'watching' && prev !== msg.state) {
      els.liveLine.textContent = '';
      if (msg.state === 'no-region') say('Meet captions not detected. Press "Turn on Meet captions" or use the CC button in Meet.');
      else if (msg.state === 'unrecognized-layout') say('Meet captions are on, but their layout was not recognised (Meet may have changed). Use the microphone or type text instead; see README, Known limitations.', 'error');
      else if (msg.state === 'unsupported') say('This meeting platform has no caption support yet.', 'error');
      else say(`Could not read captions${msg.detail ? `: ${msg.detail}` : '.'}`, 'error');
    }
  }

  function startCaptions() {
    T.tracker.reset();
    T.capState = null;
    syncHelp();
    post({ type: 'captions-start' });
    T.keep = setInterval(() => post({ type: 'captions-start' }), KEEPALIVE_MS); // idempotent; heals a restarted service worker
    T.tick = setInterval(() => { for (const ev of T.tracker.tick()) addTurn(ev.speaker || 'Speaker', ev.text); }, 250);
    say('Looking for Meet captions…');
  }

  async function startMic() {
    if (!speechSupported()) { say('This browser has no speech recognition. Type text below instead.', 'error'); return false; }
    T.mic = new MicRecognizer({
      lang: T.settings.speechLang,
      localOnly: T.settings.speechLocalOnly,
      onInterim: (t) => { els.liveLine.textContent = t ? `Hearing: ${t}` : ''; },
      onFinal: (t) => addTurn('Microphone', t),
      onState: () => {},
      onError: (e) => {
        say(e.message, 'error');
        els.micGrantBtn.hidden = e.code !== 'permission';
        els.installBtn.hidden = e.code !== 'needs-install';
        if (e.fatal) stopListening(true);
      },
    });
    say('Starting the microphone…');
    const ok = await T.mic.start();
    if (ok) say(`Listening on this computer's microphone (${T.settings.speechLang}${T.settings.speechLocalOnly ? ', on-device' : ', Chrome cloud recognition'}). This hears only you, not other participants.`, 'ok');
    return ok;
  }

  async function startListening() {
    if (T.listening) return;
    T.settings = await loadSettings();
    els.installBtn.hidden = true;
    els.micGrantBtn.hidden = true;
    setListening(true);
    if (T.source === 'captions') startCaptions();
    else if (!(await startMic())) { if (T.listening && !T.mic) setListening(false); }
  }

  function stopListening(keepMessage = false) {
    clearInterval(T.tick); clearInterval(T.keep); T.tick = T.keep = null;
    if (T.source === 'captions' || T.capState !== null) post({ type: 'captions-stop' });
    if (T.mic) { T.mic.stop(); T.mic = null; }
    T.tracker.reset();
    setListening(false);
    if (!keepMessage) say('Stopped listening.');
  }

  // ---------- wiring ----------
  els.listenBtn.addEventListener('click', () => (T.listening ? stopListening() : startListening()));
  els.srcSelect.addEventListener('change', syncSourceUi);
  els.skipBtn.addEventListener('click', () => { if (T.player) T.player.clear(); });
  els.speedSelect.addEventListener('change', () => { if (T.player) T.player.setSpeed(els.speedSelect.value); });
  els.micGrantBtn.addEventListener('click', () => post({ type: 'open-permissions' }));
  els.installBtn.addEventListener('click', async () => {
    say('Downloading the on-device speech language pack…');
    const ok = await installOnDevice(T.settings ? T.settings.speechLang : 'en-IN');
    say(ok ? 'Language pack installed. Press Start listening.' : 'The language pack could not be installed. Allow cloud recognition in Settings, or try another language.', ok ? 'ok' : 'error');
    if (ok) els.installBtn.hidden = true;
  });
  els.capOnBtn.addEventListener('click', () => {
    const id = T.nextId++;
    const t = setTimeout(() => { T.waiters.delete(id); say('The meeting page did not respond. Use the CC button in Meet.', 'error'); }, 4000);
    T.waiters.set(id, (r) => { clearTimeout(t); say(r.detail || (r.ok ? 'Done.' : 'Failed.'), r.ok ? 'ok' : 'error'); });
    post({ type: 'captions-enable', id });
  });
  els.typeForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = els.typeInput.value.trim();
    if (!text) return;
    addTurn('Typed', text, { force: true });
    els.typeInput.value = '';
  });

  (async () => {
    try {
      T.settings = await loadSettings();
      T.cfg = await loadAvatarConfig();
      T.mapper = createMapper(T.cfg);
      T.player = new AvatarPlayer({ video: els.avatarVideo, onState: renderStage, speed: T.settings.avatarSpeed });
      els.srcSelect.value = T.settings.speechSource;
      els.autoSign.checked = T.settings.autoSign;
      const speeds = Array.from(els.speedSelect.options).map((o) => o.value);
      els.speedSelect.value = speeds.includes(String(T.settings.avatarSpeed)) ? String(T.settings.avatarSpeed) : '1';
      syncSourceUi();
      renderStage({ current: null, placeholder: false, failed: false, queued: 0, dropped: 0 });
    } catch (err) {
      say(`Could not load the avatar configuration: ${err && err.message}`, 'error');
    }
  })();

  return {
    onRelay(msg) {
      if (msg.type === 'captions-snapshot') onSnapshot(msg);
      else if (msg.type === 'captions-enable-result') { const w = T.waiters.get(msg.id); if (w) { T.waiters.delete(msg.id); w(msg); } }
    },
    onVisibility(visible) {
      if (visible) { T.unread = 0; onUnread(0); } else if (T.player) T.player.clear(); // nobody is watching: do not build a backlog
    },
    stop() { if (T.listening) stopListening(true); if (T.player) T.player.clear(); },
  };
}
