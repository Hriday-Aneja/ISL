const $ = (id) => document.getElementById(id);
let tabId = null;
let status = null;

const CONN = { connected: ['ok', 'Connected'], connecting: ['warn', 'Connecting…'], reconnecting: ['warn', 'Reconnecting…'], disconnected: ['', 'Off'] };

function render(info) {
  const has = info && info.hasPanel;
  status = has ? info.status : null;
  $('page').textContent = has ? `${info.label || 'Meeting'} (panel ready)` : 'Not in a supported meeting. Open a Google Meet meeting tab.';
  const conn = status ? status.conn : 'disconnected';
  const [cls, text] = CONN[conn] || CONN.disconnected;
  $('connDot').className = `dot ${conn === 'disconnected' && status && status.sessionActive ? 'bad' : cls}`;
  $('connText').textContent = conn === 'disconnected' && status && status.sessionActive ? 'Disconnected' : text;
  $('camera').textContent = status ? ({ on: 'On', off: 'Off', blocked: 'Permission needed' }[status.camera] || status.camera) : 'Off';
  const active = Boolean(status && (status.sessionActive || status.starting));
  $('toggle').disabled = !has;
  $('showPanel').disabled = !has;
  $('toggle').textContent = active ? 'Stop recognition' : 'Start recognition';
  $('toggle').classList.toggle('primary', !active);
  if (status && status.message) $('msg').textContent = status.message;
}

async function refresh(retry = true) {
  const info = await chrome.runtime.sendMessage({ type: 'popup:get-status', tabId });
  if (!info.hasPanel && retry) { setTimeout(() => refresh(false), 400); } // service worker may have just restarted
  render(info);
}

async function command(cmd) {
  const res = await chrome.runtime.sendMessage({ type: 'popup:command', tabId, cmd });
  if (!res.ok) $('msg').textContent = res.error;
}

(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  tabId = tab && tab.id;
  await refresh();
  $('toggle').addEventListener('click', () => command(status && (status.sessionActive || status.starting) ? 'stop' : 'start'));
  $('showPanel').addEventListener('click', () => command('toggle-panel'));
  $('opts').addEventListener('click', (e) => { e.preventDefault(); chrome.runtime.openOptionsPage(); });
  chrome.runtime.onMessage.addListener((msg) => { if (msg.type === 'status-update' && msg.tabId === tabId) render({ hasPanel: true, label: 'Google Meet', status: msg.status }); });
})();
