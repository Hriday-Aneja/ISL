// "Cards" tab: ready-made meeting messages, typed messages, a readable captions view and an avatar preview.
//
// Principles (same as the Sign -> Text tab): nothing is sent unless the user acts. Tapping a card only fills the
// editable message box, unless the user turned on "Send immediately when I tap a card". The avatar preview is local:
// other participants do not see it. Captions are read from the meeting page through the same port relay the
// Speech -> Sign tab uses; no meeting audio is recorded.
import { AvatarPlayer } from '../lib/avatar-player.js';
import { createMapper, toQueueItems } from '../lib/sign-mapper.js';
import {
  normalizeCardsConfig, normalizeCustomCards, addCustomCard, removeCustomCard, signsForCard,
  updateCaptionLog, stepCaptionSize, clampCaptionSize, CAPTION_SIZE,
} from '../lib/cards.js';
import { loadSettings, loadCardsConfig, loadAvatarConfig, saveCardsSettings } from '../lib/settings.js';

const KEEPALIVE_MS = 15000;

export function initCardsTab({ $, post, share, copyText }) {
  const els = Object.fromEntries(['cardGrid', 'cardText', 'cardSend', 'cardCopy', 'cardClear', 'cardSave', 'cardsQuick', 'cardsMessage',
    'cardPreviewBox', 'cardStage', 'cardVideo', 'cardStageCard', 'cardStageText', 'cardStageSub',
    'capSmaller', 'capLarger', 'capToggle', 'capEnable', 'capClear', 'capStatus', 'capView'].map((id) => [id, $(id)]));
  const C = {
    settings: null, config: { categories: [] }, custom: [], mapper: null, avatarCfg: null, player: null,
    selected: null, capOn: false, capLog: [], capState: null, keep: null, nextId: 1, waiters: new Map(),
  };

  const say = (text, kind = '') => { els.cardsMessage.textContent = text; els.cardsMessage.className = `message ${kind}`.trim(); };
  const capSay = (text, kind = '') => { els.capStatus.textContent = text; els.capStatus.className = `message small ${kind}`.trim(); };

  // ---------- cards ----------
  function makeCard(text, signs, { custom = false } = {}) {
    const item = document.createElement('div');
    item.className = 'card-item';
    item.dataset.text = text;
    const main = document.createElement('button');
    main.type = 'button';
    main.className = 'card-main';
    main.textContent = text;
    main.addEventListener('click', () => onCardTap(text, item));
    item.append(main);
    if (signs.length) {
      const prev = document.createElement('button');
      prev.type = 'button';
      prev.className = 'card-aux';
      prev.textContent = '▶';
      prev.title = 'Preview the sign (only you see this)';
      prev.setAttribute('aria-label', `Preview sign for: ${text}`);
      prev.addEventListener('click', () => preview(signs));
      item.append(prev);
    }
    if (custom) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'card-aux';
      del.textContent = '×';
      del.title = 'Remove this card';
      del.setAttribute('aria-label', `Remove card: ${text}`);
      del.addEventListener('click', () => removeCustom(text));
      item.append(del);
    }
    return item;
  }

  function renderGrid() {
    els.cardGrid.replaceChildren();
    const groups = C.config.categories.map((cat) => ({ label: cat.label, cards: cat.cards.map((c) => ({ text: c.text, signs: signsForCard(c, C.mapper && C.mapper.mapText), custom: false })) }));
    if (C.custom.length) groups.push({ label: 'My cards', cards: C.custom.map((t) => ({ text: t, signs: signsForCard({ text: t }, C.mapper && C.mapper.mapText), custom: true })) });
    for (const g of groups) {
      const wrap = document.createElement('div');
      const h = document.createElement('h3');
      h.className = 'card-cat';
      h.textContent = g.label;
      const list = document.createElement('div');
      list.className = 'card-list';
      list.setAttribute('role', 'group');
      list.setAttribute('aria-label', g.label);
      for (const c of g.cards) list.append(makeCard(c.text, c.signs, { custom: c.custom }));
      wrap.append(h, list);
      els.cardGrid.append(wrap);
    }
    markSelected();
  }

  function markSelected() {
    for (const el of els.cardGrid.querySelectorAll('.card-item')) el.classList.toggle('selected', el.dataset.text === C.selected);
  }

  async function onCardTap(text, item) {
    C.selected = text;
    els.cardText.value = text;
    markSelected();
    if (C.settings && C.settings.cardsQuickSend) {
      await send(text);
    } else {
      say('Card selected. Edit it if you like, then press Send.');
      if (item) els.cardText.focus();
    }
  }

  // ---------- sending (always the result of a user action) ----------
  async function send(text) {
    const t = String(text || '').trim();
    if (!t) { say('Nothing to send. Tap a card or type a message first.'); return; }
    say('Sending…');
    const r = await share(t);
    say(r.message, r.kind);
    if (r.sent && els.cardText.value.trim() === t) { els.cardText.value = ''; C.selected = null; markSelected(); }
  }

  async function persist(patch) {
    try { C.settings = await saveCardsSettings(patch); return true; } catch (err) { say(`Could not save: ${err && err.message}`, 'error'); return false; }
  }

  async function saveAsCard() {
    const r = addCustomCard(C.custom, els.cardText.value);
    if (!r.ok) { say(r.error, 'error'); return; }
    if (await persist({ customCards: r.list })) { C.custom = normalizeCustomCards(C.settings.customCards); renderGrid(); say('Saved to "My cards".', 'ok'); }
  }

  async function removeCustom(text) {
    if (await persist({ customCards: removeCustomCard(C.custom, text) })) { C.custom = normalizeCustomCards(C.settings.customCards); renderGrid(); say('Card removed.'); }
  }

  // ---------- avatar preview (local only) ----------
  function renderStage(st) {
    const cur = st.current;
    els.cardStage.dataset.sign = cur ? cur.sign : '';
    els.cardStage.dataset.mode = cur && !st.placeholder ? 'video' : 'text';
    els.cardStageCard.className = `stage-card${cur ? '' : ' idle'}`;
    els.cardStageText.textContent = !cur ? 'Avatar ready' : st.placeholder ? cur.label : '';
    els.cardStageSub.textContent = cur && st.placeholder ? (st.failed ? 'the clip failed to load' : 'no avatar clip for this sign yet') : '';
  }

  function preview(signs) {
    if (!C.player || !C.avatarCfg) { say('The avatar is not available.', 'error'); return; }
    els.cardPreviewBox.hidden = false;
    C.player.clear();
    C.player.enqueue(toQueueItems(signs, C.avatarCfg, (p) => chrome.runtime.getURL(p)));
  }

  // ---------- readable captions ----------
  function applyCaptionSize() { els.capView.style.setProperty('--cap-size', `${clampCaptionSize(C.settings ? C.settings.cardsCaptionSize : CAPTION_SIZE.default)}px`); }

  function renderCaptions() {
    els.capView.replaceChildren();
    for (const row of C.capLog) {
      const li = document.createElement('li');
      if (row.speaker) { const who = document.createElement('span'); who.className = 'cap-who'; who.textContent = row.speaker; li.append(who); }
      li.append(document.createTextNode(row.text));
      els.capView.append(li);
    }
    els.capView.scrollTop = els.capView.scrollHeight;
  }

  function onSnapshot(msg) {
    if (!C.capOn) return;
    const prev = C.capState;
    C.capState = msg.state;
    if (msg.state === 'watching') {
      C.capLog = updateCaptionLog(C.capLog, msg.rows || []);
      renderCaptions();
      if (prev !== 'watching') capSay('Showing Meet captions.', 'ok');
    } else if (prev !== msg.state) {
      if (msg.state === 'no-region') capSay('Meet captions not detected. Press "Turn on Meet captions" or use the CC button in Meet.');
      else if (msg.state === 'unrecognized-layout') capSay('Meet captions are on, but their layout was not recognised (Meet may have changed).', 'error');
      else if (msg.state === 'unsupported') capSay('This meeting platform has no caption support yet.', 'error');
      else capSay(`Could not read captions${msg.detail ? `: ${msg.detail}` : '.'}`, 'error');
    }
  }

  function startCaptions() {
    C.capOn = true; C.capState = null; C.capLog = []; renderCaptions();
    els.capToggle.textContent = 'Hide captions';
    els.capToggle.className = '';
    post({ type: 'captions-start' });
    C.keep = setInterval(() => post({ type: 'captions-start' }), KEEPALIVE_MS); // idempotent keep-alive, like the Speech tab
    capSay('Looking for Meet captions…');
  }

  function stopCaptions(note = 'Captions hidden.') {
    clearInterval(C.keep); C.keep = null;
    if (C.capOn) post({ type: 'captions-stop' });
    C.capOn = false; C.capState = null;
    els.capToggle.textContent = 'Show captions';
    els.capToggle.className = 'primary';
    capSay(note);
  }

  async function changeSize(direction) {
    const size = stepCaptionSize(C.settings ? C.settings.cardsCaptionSize : CAPTION_SIZE.default, direction);
    C.settings = { ...(C.settings || {}), cardsCaptionSize: size };
    applyCaptionSize();
    await persist({ cardsCaptionSize: size });
  }

  // ---------- wiring ----------
  els.cardSend.addEventListener('click', () => send(els.cardText.value));
  els.cardCopy.addEventListener('click', async () => say((await copyText(els.cardText.value)) ? 'Copied to clipboard.' : 'Copy failed.', 'ok'));
  els.cardClear.addEventListener('click', () => { els.cardText.value = ''; C.selected = null; markSelected(); say(''); els.cardText.focus(); });
  els.cardSave.addEventListener('click', saveAsCard);
  els.cardText.addEventListener('input', () => { if (C.selected && els.cardText.value !== C.selected) { C.selected = null; markSelected(); } });
  els.cardText.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); send(els.cardText.value); } });
  els.cardsQuick.addEventListener('change', async () => {
    if (await persist({ cardsQuickSend: els.cardsQuick.checked })) say(els.cardsQuick.checked ? 'Tapping a card now sends it immediately.' : 'Tapping a card now only fills the message box.');
  });
  els.capToggle.addEventListener('click', () => (C.capOn ? stopCaptions() : startCaptions()));
  els.capClear.addEventListener('click', () => { C.capLog = []; renderCaptions(); });
  els.capSmaller.addEventListener('click', () => changeSize(-1));
  els.capLarger.addEventListener('click', () => changeSize(1));
  els.capEnable.addEventListener('click', () => {
    const id = C.nextId++;
    const t = setTimeout(() => { C.waiters.delete(id); capSay('The meeting page did not respond. Use the CC button in Meet.', 'error'); }, 4000);
    C.waiters.set(id, (r) => { clearTimeout(t); capSay(r.detail || (r.ok ? 'Done.' : 'Failed.'), r.ok ? 'ok' : 'error'); });
    post({ type: 'captions-enable', id });
  });

  (async () => {
    try {
      C.settings = await loadSettings();
      C.config = normalizeCardsConfig(await loadCardsConfig());
      C.custom = normalizeCustomCards(C.settings.customCards);
      els.cardsQuick.checked = C.settings.cardsQuickSend;
      applyCaptionSize();
      try {
        C.avatarCfg = await loadAvatarConfig();
        C.mapper = createMapper(C.avatarCfg);
        C.player = new AvatarPlayer({ video: els.cardVideo, onState: renderStage, speed: C.settings.avatarSpeed });
      } catch { /* cards still work without the avatar preview */ }
      renderGrid();
    } catch (err) {
      say(`Could not load the cards: ${err && err.message}`, 'error');
    }
  })();

  return {
    onRelay(msg) {
      if (msg.type === 'captions-snapshot') onSnapshot(msg);
      else if (msg.type === 'captions-enable-result') { const w = C.waiters.get(msg.id); if (w) { C.waiters.delete(msg.id); w(msg); } }
    },
    onVisibility(visible) { if (!visible && C.player) C.player.clear(); },
    stop() { if (C.capOn) stopCaptions(''); if (C.player) C.player.clear(); },
  };
}
