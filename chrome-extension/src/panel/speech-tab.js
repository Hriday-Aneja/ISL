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
  const elementIds = [
    'srcSelect', 'listenBtn', 'capOnBtn', 'installBtn', 'micGrantBtn', 
    'stage', 'avatarVideo', 'stageCard', 'stageText', 'stageSub', 
    'stageInfo', 'helpRow', 'speedSelect', 'skipBtn', 'autoSign', 
    'vcamToggle', 'vcamStatus', 'liveLine', 'turns', 'typeForm', 
    'typeInput', 'speechMessage'
  ];

  // Safely grab elements so missing ones don't break the entire tab execution
  const els = {};
  for (const id of elementIds) {
    els[id] = $(id);
    if (!els[id]) {
      console.warn(`[Speech Tab] Element with id "${id}" was not found in the DOM.`);
    }
  }

  const T = {
    settings: null, cfg: null, mapper: null, player: null, tracker: new CaptionTracker(), tick: null, keep: null,
    listening: false, source: 'captions', mic: null, capState: null, vcam: false, vcamAsked: false, vcamSent: null, vcamTimer: null, vcamPump: null, turnData: new Map(), nextTurn: 1, nextId: 1, waiters: new Map(), unread: 0,
  };

  const say = (text, kind = '') => { 
  if (els.speechMessage) {
    els.speechMessage.textContent = text; 
    els.speechMessage.className = `message ${kind}`.trim(); 
  }
};

  // ---------- avatar stage ----------
  function renderStage(st) {
    const cur = st.current;
    if (els.stage) {
      els.stage.dataset.sign = cur ? cur.sign : '';
      els.stage.dataset.mode = cur && !st.placeholder ? 'video' : 'text';
    }
    if (els.stageCard) els.stageCard.className = `stage-card${cur ? '' : ' idle'}`;
    if (els.stageText) els.stageText.textContent = !cur ? 'Avatar ready' : st.placeholder ? cur.label : '';
    if (els.stageSub) els.stageSub.textContent = cur && st.placeholder ? (st.failed ? 'the clip failed to load' : 'no avatar clip for this sign yet') : '';
    
    let info = cur ? `Signing: ${cur.label}` : (T.listening ? 'Waiting for speech' : 'Not listening');
    if (st.queued) info += ` · ${st.queued} waiting`;
    if (st.dropped) info += ` · skipped ${st.dropped} older sign${st.dropped === 1 ? '' : 's'} to catch up`;
    
    if (els.stageInfo) els.stageInfo.textContent = info;
    for (const [id, d] of T.turnData) d.el.classList.toggle('playing', Boolean(cur && cur.turnId === id));
    shareStage(st);
  }

  // ---------- share the avatar with the other participants (virtual camera) ----------
  function shareStage(st) {
    if (!T.vcam) return;
    const cur = st.current;
    const sig = cur ? `${cur.turnId}|${cur.sign}|${st.placeholder}` : '';
    if (T.vcamSent && T.vcamSent.cur === cur && T.vcamSent.sig === sig) return;
    T.vcamSent = { cur, sig };
    if (!cur) post({ type: 'vcam-idle' });
    else post({ type: 'vcam-play', hasClip: Boolean(cur.clip) && !st.placeholder, label: cur.label });
  }

  function setVcam(on) {
    T.vcam = on;
    T.vcamSent = null;
    T.vcamAsked = on;
    clearInterval(T.vcamTimer);
    clearInterval(T.vcamPump);
    T.vcamTimer = T.vcamPump = null;
    if (els.vcamStatus) els.vcamStatus.hidden = !on;
    post({ type: 'vcam-enable', on });
    if (on) {
      T.vcamTimer = setInterval(() => post({ type: 'vcam-enable', on: true }), 3000);
      T.vcamPump = setInterval(pumpFrame, 1000 / 24);
      if (T.player) shareStage({ current: T.player.current, placeholder: T.player.placeholder });
    }
  }

  let pumping = false;
  async function pumpFrame() {
    const v = els.avatarVideo;
    if (pumping || !T.vcam || !v || v.paused || v.ended || v.readyState < 2 || !v.videoWidth) return;
    pumping = true;
    try {
      const bmp = await createImageBitmap(v);
      try { parent.postMessage({ type: 'samvaad-vcam-frame', bitmap: bmp }, '*', [bmp]); } catch { bmp.close(); }
    } catch { /* frame not ready */ }
    pumping = false;
  }

  function onVcamResult(msg) {
    if (T.vcam && msg.on && els.vcamStatus) {
      els.vcamStatus.textContent = msg.hits
        ? `Meet is using the avatar as your camera (picked up ${msg.hits}×). If others still see your face, turn the camera off and on again.`
        : 'Waiting for Meet to pick it up: turn your Meet camera off, then on.';
    }
    if (!T.vcamAsked) return;
    T.vcamAsked = false;
    if (T.vcam && !msg.hooked) {
      say('The meeting page is not ready for this yet. Reload the Meet tab once (the extension was updated), then turn this on again.', 'error');
      if (els.vcamToggle) els.vcamToggle.checked = false;
      setVcam(false);
    } else if (msg.on) {
      say('Sharing on: the avatar is now your camera in Meet. Turn your Meet camera off and on once so it switches. Others see the avatar; you see it here and in your own tile.', 'ok');
    } else {
      say('Sharing off. Turn your Meet camera off and on again to bring your real camera back.');
    }
  }

  function enqueueTurn(id, signs) {
    if (!T.player || !T.cfg) return;
    T.player.enqueue(toQueueItems(signs, T.cfg, (p) => chrome.runtime.getURL(p)).map((i) => ({ ...i, turnId: id })));
  }

  // ---------- transcript ----------
  function renderTurn(id, speaker, map, text) {
    if (!els.turns) return null;
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
    while (els.turns.children.length > MAX_TURNS) { 
      const first = els.turns.firstElementChild; 
      for (const [k, d] of T.turnData) if (d.el === first) T.turnData.delete(k); 
      first.remove(); 
    }
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
    if (!li || map.signs.length === 0) return;
    
    if (!isVisible() && !T.vcam) {
      addNote(li, 'Arrived while this tab was hidden: press Sign to play it.');
      T.unread += 1;
      onUnread(T.unread);
    } else if (force || (els.autoSign && els.autoSign.checked)) enqueueTurn(id, map.signs);
  }

  // ---------- listening ----------
  function setListening(on) {
    T.listening = on;
    if (els.listenBtn) {
      els.listenBtn.textContent = on ? 'Stop listening' : 'Start listening';
      els.listenBtn.className = on ? '' : 'primary';
    }
    if (els.srcSelect) els.srcSelect.disabled = on;
    if (!on && els.liveLine) els.liveLine.textContent = '';
    renderStage({ current: T.player && T.player.current, placeholder: T.player && T.player.placeholder, failed: false, queued: T.player ? T.player.queue.length : 0, dropped: 0 });
  }

  function syncHelp() { 
    if (els.capOnBtn) els.capOnBtn.hidden = T.source !== 'captions' || T.capState === 'watching'; 
  }

  function syncSourceUi() {
    if (els.srcSelect) T.source = els.srcSelect.value;
    syncHelp();
    if (els.installBtn) els.installBtn.hidden = true;
    if (els.micGrantBtn) els.micGrantBtn.hidden = true;
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
      if (els.liveLine) els.liveLine.textContent = last ? `${last.speaker ? `${last.speaker}: ` : ''}${last.text}` : '';
      if (prev !== 'watching') say('Listening to Meet captions. Signs follow a moment after the words settle.', 'ok');
    } else {
      T.tracker.update([]);
    }
    if (msg.state !== 'watching' && prev !== msg.state) {
      if (els.liveLine) els.liveLine.textContent = '';
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
    T.keep = setInterval(() => post({ type: 'captions-start' }), KEEPALIVE_MS);
    T.tick = setInterval(() => { for (const ev of T.tracker.tick()) addTurn(ev.speaker || 'Speaker', ev.text); }, 250);
    say('Looking for Meet captions…');
  }

  async function startMic() {
    if (!speechSupported()) { say('This browser has no speech recognition. Type text below instead.', 'error'); return false; }
    T.mic = new MicRecognizer({
      lang: T.settings.speechLang,
      localOnly: T.settings.speechLocalOnly,
      onInterim: (t) => { if (els.liveLine) els.liveLine.textContent = t ? `Hearing: ${t}` : ''; },
      onFinal: (t) => addTurn('Microphone', t),
      onState: () => {},
      onError: (e) => {
        say(e.message, 'error');
        if (els.micGrantBtn) els.micGrantBtn.hidden = e.code !== 'permission';
        if (els.installBtn) els.installBtn.hidden = e.code !== 'needs-install';
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
    if (els.installBtn) els.installBtn.hidden = true;
    if (els.micGrantBtn) els.micGrantBtn.hidden = true;
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

  // ---------- Safe Event Listeners Wiring ----------
  els.listenBtn?.addEventListener('click', () => (T.listening ? stopListening() : startListening()));
  els.srcSelect?.addEventListener('change', syncSourceUi);
  els.vcamToggle?.addEventListener('change', () => setVcam(els.vcamToggle.checked));
  els.skipBtn?.addEventListener('click', () => { if (T.player) T.player.clear(); });
  els.speedSelect?.addEventListener('change', () => { if (T.player) T.player.setSpeed(els.speedSelect.value); });
  els.micGrantBtn?.addEventListener('click', () => post({ type: 'open-permissions' }));
  
  els.installBtn?.addEventListener('click', async () => {
    say('Downloading the on-device speech language pack…');
    const ok = await installOnDevice(T.settings ? T.settings.speechLang : 'en-IN');
    say(ok ? 'Language pack installed. Press Start listening.' : 'The language pack could not be installed. Allow cloud recognition in Settings, or try another language.', ok ? 'ok' : 'error');
    if (ok && els.installBtn) els.installBtn.hidden = true;
  });

  els.capOnBtn?.addEventListener('click', () => {
    const id = T.nextId++;
    const t = setTimeout(() => { T.waiters.delete(id); say('The meeting page did not respond. Use the CC button in Meet.', 'error'); }, 4000);
    T.waiters.set(id, (r) => { clearTimeout(t); say(r.detail || (r.ok ? 'Done.' : 'Failed.'), r.ok ? 'ok' : 'error'); });
    post({ type: 'captions-enable', id });
  });

  els.typeForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!els.typeInput) return;
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
      if (els.avatarVideo) {
        T.player = new AvatarPlayer({ video: els.avatarVideo, onState: renderStage, speed: T.settings.avatarSpeed });
      }
      if (els.srcSelect) els.srcSelect.value = T.settings.speechSource;
      if (els.autoSign) els.autoSign.checked = T.settings.autoSign;
      if (els.speedSelect) {
        const speeds = Array.from(els.speedSelect.options).map((o) => o.value);
        els.speedSelect.value = speeds.includes(String(T.settings.avatarSpeed)) ? String(T.settings.avatarSpeed) : '1';
      }
      syncSourceUi();
      renderStage({ current: null, placeholder: false, failed: false, queued: 0, dropped: 0 });
    } catch (err) {
      say(`Could not load the avatar configuration: ${err && err.message}`, 'error');
    }
  })();

  return {
    onRelay(msg) {
      if (msg.type === 'captions-snapshot') onSnapshot(msg);
      else if (msg.type === 'vcam-result') onVcamResult(msg);
      else if (msg.type === 'captions-enable-result') { const w = T.waiters.get(msg.id); if (w) { T.waiters.delete(msg.id); w(msg); } }
    },
    onVisibility(visible) {
      if (visible) { T.unread = 0; onUnread(0); } else if (T.player && !T.vcam) T.player.clear();
    },
    stop() { if (T.vcam) setVcam(false); if (T.listening) stopListening(true); if (T.player) T.player.clear(); },
  };
}