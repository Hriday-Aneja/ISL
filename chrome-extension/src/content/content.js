// Content script: platform-independent. Injects the Samvaad panel (an extension-page iframe) when the user is inside a
// meeting and brokers calls that need the page DOM (posting to the platform's chat).
// The panel iframe owns the camera, the WebSocket and the UI. Keyboard events inside it never reach the
// meeting page, so typing in the text box cannot trigger the platform's keyboard shortcuts.
(function () {
  if (globalThis.__samvaadContentLoaded) return;
  globalThis.__samvaadContentLoaded = true;

  const adapter = globalThis.SamvaadPlatforms.detect(location);
  if (!adapter) return;

  const SIZES = { collapsed: { w: 148, h: 44 }, expanded: { w: 360, h: 640 } };
  let host = null;
  let frame = null;
  let port = null;
  let mode = 'collapsed';

  const alive = () => Boolean(chrome.runtime && chrome.runtime.id);

  function applySize() {
    if (!host) return;
    const s = SIZES[mode];
    host.style.setProperty('width', `${s.w}px`, 'important');
    host.style.setProperty('height', `${s.h}px`, 'important');
  }

  function mountPanel() {
    if (host || !alive()) return;
    host = document.createElement('div');
    host.id = 'samvaad-panel-host';
    const st = host.style;
    for (const [k, v] of Object.entries({
      position: 'fixed', left: '16px', bottom: '96px', 'z-index': '2147483000', border: '0', margin: '0', padding: '0',
      background: 'transparent', 'max-height': 'calc(100vh - 120px)', 'color-scheme': 'normal',
    })) st.setProperty(k, v, 'important');
    frame = document.createElement('iframe');
    frame.title = 'Samvaad - ISL Connect';
    frame.setAttribute('allow', 'camera; microphone; clipboard-write; on-device-speech-recognition');
    frame.src = `${chrome.runtime.getURL('src/panel/panel.html')}?platform=${encodeURIComponent(adapter.id)}`;
    for (const [k, v] of Object.entries({ width: '100%', height: '100%', border: '0', 'border-radius': '14px', 'color-scheme': 'normal' })) frame.style.setProperty(k, v);
    host.appendChild(frame);
    document.documentElement.appendChild(host);
    applySize();
  }

  function unmountPanel() {
    if (host) host.remove();
    host = frame = null;
    mode = 'collapsed';
  }

  function sync() {
    if (!alive()) { teardown(); return; }
    if (adapter.isMeetingPage(location)) mountPanel(); else unmountPanel();
  }

  function connect() {
    if (!alive()) return;
    try {
      port = chrome.runtime.connect({ name: 'samvaad-content' });
    } catch { return; }
    port.postMessage({ type: 'hello', platform: adapter.id, label: adapter.label });
    port.onMessage.addListener(async (msg) => {
      if (msg.type === 'resize' && SIZES[msg.mode]) { mode = msg.mode; applySize(); }
      else if (msg.type === 'chat-send') {
        const result = await adapter.sendChat(msg.text, msg.mode);
        try { port.postMessage({ type: 'chat-result', id: msg.id, ...result }); } catch { /* port closed */ }
      } else if (msg.type === 'captions-start') startCaptions();
      else if (msg.type === 'captions-stop') stopCaptions();
      else if (msg.type === 'captions-enable') {
        const result = adapter.enableCaptions ? await adapter.enableCaptions() : { ok: false, detail: 'This platform cannot turn captions on from here.' };
        try { port.postMessage({ type: 'captions-enable-result', id: msg.id, ...result }); } catch { /* port closed */ }
      }
    });
    port.onDisconnect.addListener(() => {
      port = null;
      if (alive()) setTimeout(connect, 500); // service worker restarted: reconnect
    });
  }

  // ---- live captions: poll the platform adapter and forward changes to the panel (which does the settling) ----
  // The panel re-sends 'captions-start' as a keep-alive, so starting twice must be harmless and a service-worker
  // restart (which drops port messages) heals itself within a few seconds.
  let capTimer = null;
  let capLast = '';
  function pollCaptions() {
    if (!alive() || !port) return;
    let snap;
    try { snap = adapter.readCaptions(); } catch (err) { snap = { state: 'error', rows: [], detail: String(err && err.message) }; }
    const sig = JSON.stringify(snap);
    if (sig === capLast) return;
    capLast = sig;
    try { port.postMessage({ type: 'captions-snapshot', ...snap }); } catch { /* port closed */ }
  }
  function startCaptions() {
    if (!adapter.readCaptions) { try { port.postMessage({ type: 'captions-snapshot', state: 'unsupported', rows: [] }); } catch { /* ignore */ } return; }
    capLast = ''; // always re-send the current state, so a re-start also re-syncs the panel
    if (!capTimer) capTimer = setInterval(pollCaptions, 300);
    pollCaptions();
  }
  function stopCaptions() { clearInterval(capTimer); capTimer = null; capLast = ''; }

  let timer = null;
  function teardown() {
    stopCaptions();
    clearInterval(timer);
    unmountPanel();
    try { port && port.disconnect(); } catch { /* ignore */ }
  }

  connect();
  sync();
  timer = setInterval(sync, 1000); // Meet is a single-page app: poll for navigation in/out of a meeting
  addEventListener('popstate', sync);
  addEventListener('pagehide', teardown);
})();
