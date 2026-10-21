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

  globalThis.SamvaadPlatforms.register({
    id: 'meet',
    label: 'Google Meet',
    matches: (loc) => loc.hostname === 'meet.google.com',
    isMeetingPage: (loc) => loc.hostname === 'meet.google.com' && MEETING_PATH.test(loc.pathname),
    sendChat,
    // exported for the fixture-based test only
    _internals: { findChatInput, findSendButton, MEETING_PATH },
  });
})();
