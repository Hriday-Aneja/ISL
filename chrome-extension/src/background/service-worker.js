// Service worker: a thin relay. All heavy work (camera, WebSocket, UI) lives in the panel iframe so it survives
// service-worker restarts; ports are re-established automatically by both ends.
//
//   panel iframe  <--port 'samvaad-panel'-->   service worker   <--port 'samvaad-content'-->  content script
//   popup         <--runtime.sendMessage-->    service worker

const tabs = new Map(); // tabId -> { content: Port|null, panel: Port|null, platform, label, status }

function entry(tabId) {
  if (!tabs.has(tabId)) tabs.set(tabId, { content: null, panel: null, platform: null, label: null, status: null });
  return tabs.get(tabId);
}

function setBadge(tabId, status) {
  const active = Boolean(status && status.sessionActive);
  chrome.action.setBadgeText({ tabId, text: active ? 'ON' : '' }).catch(() => {});
  if (active) chrome.action.setBadgeBackgroundColor({ tabId, color: '#1565c0' }).catch(() => {});
}

chrome.runtime.onConnect.addListener((port) => {
  const tabId = port.sender && port.sender.tab && port.sender.tab.id;
  if (tabId === undefined) { port.disconnect(); return; }
  const e = entry(tabId);

  if (port.name === 'samvaad-content') {
    e.content = port;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'hello') { e.platform = msg.platform; e.label = msg.label; }
      else if (e.panel) e.panel.postMessage(msg); // chat-result etc. -> panel
    });
    port.onDisconnect.addListener(() => { if (e.content === port) e.content = null; });
  } else if (port.name === 'samvaad-panel') {
    e.panel = port;
    port.onMessage.addListener((msg) => {
      if (msg.type === 'status') {
        e.status = msg.status;
        setBadge(tabId, msg.status);
        chrome.runtime.sendMessage({ type: 'status-update', tabId, status: msg.status }).catch(() => {}); // popup may be closed
      } else if (msg.type === 'open-permissions') {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/permissions/permissions.html') });
      } else if (msg.type === 'ping') {
        // keep-alive only
      } else if (e.content) {
        e.content.postMessage(msg); // resize, chat-send -> content script
      } else if (msg.type === 'chat-send') {
        port.postMessage({ type: 'chat-result', id: msg.id, ok: false, method: 'none', detail: 'The meeting page integration is not connected.' });
      }
    });
    port.onDisconnect.addListener(() => {
      if (e.panel === port) { e.panel = null; e.status = null; setBadge(tabId, null); }
    });
  }
});

chrome.tabs.onRemoved.addListener((tabId) => tabs.delete(tabId));

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg.type === 'popup:get-status') {
    const e = tabs.get(msg.tabId);
    sendResponse({ hasPanel: Boolean(e && e.panel), platform: e && e.platform, label: e && e.label, status: (e && e.status) || null });
  } else if (msg.type === 'popup:command') {
    const e = tabs.get(msg.tabId);
    if (e && e.panel) { e.panel.postMessage({ type: 'command', cmd: msg.cmd }); sendResponse({ ok: true }); }
    else sendResponse({ ok: false, error: 'No Samvaad panel in this tab. Join a Google Meet meeting first.' });
  }
  return false;
});
