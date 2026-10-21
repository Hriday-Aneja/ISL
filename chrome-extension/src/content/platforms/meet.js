// Google Meet adapter.
//
// IMPORTANT: Meet's DOM is obfuscated and changes without notice. The selectors below are best-effort guesses based on
// Meet's accessibility labels. They have NOT been verified against the live Meet UI by the author of this code (see
// README "Known limitations"). Every failure path returns { ok: false } so the panel falls back to the clipboard.
// If Meet changes, only this file needs to change.
(function () {
  const MEETING_PATH = /^\/[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/i; // e.g. /abc-defg-hij

  const CHAT_INPUT_SELECTORS = [
    'textarea[aria-label*="send a message" i]',
    'textarea[placeholder*="send a message" i]',
    'textarea[name="chatTextInput"]',
  ];
  const SEND_BUTTON_SELECTORS = ['button[aria-label*="send a message" i]', 'button[aria-label="Send"]'];

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function findChatInput(root = document) {
    for (const sel of CHAT_INPUT_SELECTORS) {
      const el = root.querySelector(sel);
      if (el && el instanceof HTMLTextAreaElement) return el;
    }
    return null;
  }

  function findSendButton(input) {
    let node = input.parentElement;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      for (const sel of SEND_BUTTON_SELECTORS) {
        const btn = node.querySelector(sel);
        if (btn) return btn;
      }
    }
    return null;
  }

  function setNativeValue(el, value) {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  const isDisabled = (btn) => btn.disabled || btn.getAttribute('aria-disabled') === 'true';

  async function sendChat(text, mode) {
    try {
      const message = String(text || '').trim();
      if (!message) return { ok: false, method: 'none', detail: 'Nothing to send.' };
      const input = findChatInput();
      if (!input) return { ok: false, method: 'none', detail: 'The Meet chat box was not found. Open the chat panel in Meet first.' };
      setNativeValue(input, message);
      if (mode === 'fill') return { ok: true, method: 'filled', detail: 'Text placed in the Meet chat box. Press Enter or Meet\'s send button to post it.' };
      await sleep(150);
      const button = findSendButton(input);
      if (!button || isDisabled(button)) {
        return { ok: true, method: 'filled', detail: 'Text placed in the Meet chat box, but its send button was not found or is disabled. Press Enter to post it.' };
      }
      button.click();
      await sleep(400);
      if (input.value.trim() === '') return { ok: true, method: 'sent', detail: 'Posted to the Meet chat.' };
      return { ok: true, method: 'filled', detail: 'Text placed in the Meet chat box but posting could not be confirmed. Check the chat.' };
    } catch (err) {
      return { ok: false, method: 'none', detail: `Meet chat integration failed: ${err && err.message}` };
    }
  }


  // ---------- Live captions (speech -> sign) ----------
  // Same caveat as the chat selectors above: Meet's DOM is not a public API and this has NOT been verified against the
  // live Meet UI by the author. Structure assumed (from public Meet-caption scrapers): a region labelled "Captions";
  // inside it one row per speaker turn, each row holding the speaker's avatar <img>, the speaker's name, then the
  // caption text, which Meet rewrites in place while the person is still talking. Rows are found via their avatar
  // images, so no obfuscated class names are used. If the layout is not recognised we report that instead of guessing.
  const CAPTION_REGION_SELECTORS = ['[role="region"][aria-label="Captions"]', '[role="region"][aria-label*="aption" i]'];
  const CAPTIONS_ON_SELECTORS = ['button[aria-label*="Turn off captions" i]'];
  const CAPTIONS_OFF_SELECTORS = ['button[aria-label*="Turn on captions" i]'];
  const MAX_ROWS = 8;
  const MAX_TEXT = 2000;

  function findCaptionRegion(root = document) {
    for (const sel of CAPTION_REGION_SELECTORS) {
      const el = root.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  const rowIds = new WeakMap();
  let nextRowId = 1;
  const rowKey = (el) => { if (!rowIds.has(el)) rowIds.set(el, nextRowId++); return `r${rowIds.get(el)}`; };

  function rowElements(region) {
    const rows = [];
    for (const img of region.querySelectorAll('img')) {
      let node = img;
      // climb while this subtree still holds only this one avatar: that subtree is the row
      while (node.parentElement && node.parentElement !== region && node.parentElement.querySelectorAll('img').length === 1) node = node.parentElement;
      if (!rows.includes(node)) rows.push(node);
    }
    return rows;
  }

  function parseRow(el) {
    const controls = new Set(Array.from(el.querySelectorAll('button,[role="button"]')).map((b) => (b.innerText || b.textContent || '').trim()).filter(Boolean));
    const lines = String(el.innerText || el.textContent || '').split(/\n+/).map((l) => l.trim()).filter((l) => l && !controls.has(l));
    if (lines.length < 2) return { speaker: lines[0] || '', text: '' }; // a name with no words yet
    return { speaker: lines[0], text: lines.slice(1).join(' ').slice(0, MAX_TEXT) };
  }

  /** @returns {{ state: 'no-region'|'watching'|'unrecognized-layout', rows: {key: string, speaker: string, text: string}[] }} */
  function readCaptions(root = document) {
    const region = findCaptionRegion(root);
    if (!region) return { state: 'no-region', rows: [] };
    const els = rowElements(region);
    if (els.length === 0) {
      const anyText = String(region.innerText || '').trim();
      return { state: anyText ? 'unrecognized-layout' : 'watching', rows: [] }; // empty region = captions on, nobody speaking yet
    }
    const rows = els.slice(-MAX_ROWS).map((el) => ({ key: rowKey(el), ...parseRow(el) })).filter((r) => r.text);
    return { state: 'watching', rows };
  }

  const anyMatch = (selectors, root = document) => selectors.map((s) => root.querySelector(s)).find(Boolean) || null;

  async function enableCaptions() {
    try {
      if (anyMatch(CAPTIONS_ON_SELECTORS)) return { ok: true, detail: 'Captions are already on.' };
      const btn = anyMatch(CAPTIONS_OFF_SELECTORS);
      if (!btn) return { ok: false, detail: 'The captions button was not found. Turn captions on with the CC button in Meet.' };
      btn.click();
      await sleep(600);
      return anyMatch(CAPTIONS_ON_SELECTORS) || findCaptionRegion()
        ? { ok: true, detail: 'Captions turned on.' }
        : { ok: true, detail: 'Asked Meet to turn captions on. If nothing appears, use the CC button in Meet.' };
    } catch (err) {
      return { ok: false, detail: `Could not turn captions on: ${err && err.message}` };
    }
  }

  globalThis.SamvaadPlatforms.register({
    id: 'meet',
    label: 'Google Meet',
    matches: (loc) => loc.hostname === 'meet.google.com',
    isMeetingPage: (loc) => loc.hostname === 'meet.google.com' && MEETING_PATH.test(loc.pathname),
    sendChat,
    readCaptions,
    enableCaptions,
    // exported for the fixture-based test only
    _internals: { findChatInput, findSendButton, MEETING_PATH, findCaptionRegion, rowElements, parseRow },
  });
})();
