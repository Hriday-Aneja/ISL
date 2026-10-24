import { loadSettings, saveSettings, loadDefaultSigns, resolveSigns, validateServiceUrl, DEFAULT_SETTINGS } from '../lib/settings.js';
const $ = (id) => document.getElementById(id);
const FIELDS = ['serviceUrl', 'mirror', 'captureFps', 'captureWidth', 'jpegQuality', 'confidenceThreshold', 'minMargin', 'sendMode', 'speechSource', 'speechLang', 'avatarSpeed'];
const CHECKS = ['speechLocalOnly', 'autoSign', 'includeOwnCaptions'];

(async () => {
  const [settings, defaults] = await Promise.all([loadSettings(), loadDefaultSigns()]);
  for (const f of FIELDS) $(f).value = settings[f];
  for (const f of CHECKS) $(f).checked = settings[f];
  const labels = Object.keys(defaults.signs);
  const signs = resolveSigns(labels, defaults, settings.signOverrides);
  const body = $('signs');
  for (const label of labels) {
    const s = signs[label];
    const tr = document.createElement('tr');
    tr.dataset.label = label;
    const mk = (type, val) => { const i = document.createElement('input'); i.type = type; if (type === 'checkbox') i.checked = val; else i.value = val; return i; };
    const c0 = document.createElement('td'); c0.textContent = label;
    const c1 = document.createElement('td'); c1.appendChild(mk('text', s.display)); c1.firstChild.setAttribute('aria-label', `Display text for ${label}`);
    const c2 = document.createElement('td'); c2.appendChild(mk('checkbox', s.verified)); c2.firstChild.setAttribute('aria-label', `${label} verified`);
    const c3 = document.createElement('td'); c3.appendChild(mk('checkbox', s.enabled)); c3.firstChild.setAttribute('aria-label', `${label} enabled`);
    tr.append(c0, c1, c2, c3);
    body.appendChild(tr);
  }
  $('save').addEventListener('click', async () => {
    // Meeting Cards fields are managed in the panel's Cards tab, so keep whatever is stored.
    const next = { ...DEFAULT_SETTINGS, customCards: settings.customCards, cardsQuickSend: settings.cardsQuickSend, cardsCaptionSize: settings.cardsCaptionSize };
    for (const f of FIELDS) next[f] = $(f).value;
    for (const f of CHECKS) next[f] = $(f).checked;
    const check = validateServiceUrl(next.serviceUrl);
    if (!check.ok) { $('status').textContent = check.error; return; }
    next.signOverrides = {};
    for (const tr of body.children) {
      const [disp, ver, en] = tr.querySelectorAll('input');
      next.signOverrides[tr.dataset.label] = { display: disp.value.trim() || tr.dataset.label, verified: ver.checked, enabled: en.checked };
    }
    await saveSettings(next);
    $('status').textContent = 'Saved. Restart recognition for changes to apply.';
  });
})();
