// Settings + sign configuration. Pure functions are exported for tests; chrome.storage access is isolated
// in loadSettings/saveSettings so everything else runs under Node.

export const DEFAULT_SETTINGS = Object.freeze({
  serviceUrl: 'ws://127.0.0.1:8765', // the local Python recognition_service.py default
  confidenceThreshold: 0,            // 0 = no confidence filtering (no verified value exists yet)
  minMargin: 0,                      // required top1 - top2 confidence gap; 0 = off
  captureFps: 15,                    // frames/s sent to the service
  captureWidth: 960,                 // px, height follows the camera aspect ratio
  jpegQuality: 0.8,
  mirror: 'auto',                    // 'auto' (use checkpoint flip_horizontal) | 'on' | 'off'
  sendMode: 'chat',                  // 'chat' | 'fill' | 'clipboard'
  signOverrides: {},                 // { label: { verified?: bool, enabled?: bool, display?: string } }
  // ---- Speech -> Sign ----
  speechSource: 'captions',          // 'captions' (Meet's live captions: other participants) | 'mic' (this computer's microphone)
  speechLang: 'en-IN',               // microphone recognition language (BCP-47)
  speechLocalOnly: true,             // microphone recognition must run on-device; never fall back to Chrome's cloud service
  autoSign: true,                    // avatar signs new speech automatically (typed text and the Sign button always work)
  avatarSpeed: 1,                    // 0.5-2 playback rate of the avatar clips
  includeOwnCaptions: false,         // also sign Meet captions labelled "You" (your own speech)
});

const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]', '::1']);

/** Recognition must stay on this machine: only ws:// to a loopback host is accepted. */
export function validateServiceUrl(value) {
  let url;
  try { url = new URL(String(value).trim()); } catch { return { ok: false, error: 'Not a valid URL' }; }
  if (url.protocol !== 'ws:') return { ok: false, error: 'Use a ws:// URL (the local service does not use TLS)' };
  if (!LOOPBACK.has(url.hostname)) return { ok: false, error: 'Only local addresses (127.0.0.1 / localhost) are allowed, so video never leaves this computer' };
  return { ok: true, url: url.toString().replace(/\/$/, '') };
}

const bool = (v, dflt) => (typeof v === 'boolean' ? v : v === 'true' ? true : v === 'false' ? false : dflt);
const clamp = (n, lo, hi, dflt) => (Number.isFinite(Number(n)) ? Math.min(hi, Math.max(lo, Number(n))) : dflt);

export function normalizeSettings(raw = {}) {
  const d = DEFAULT_SETTINGS;
  const urlCheck = validateServiceUrl(raw.serviceUrl ?? d.serviceUrl);
  return {
    serviceUrl: urlCheck.ok ? urlCheck.url : d.serviceUrl,
    confidenceThreshold: clamp(raw.confidenceThreshold, 0, 1, d.confidenceThreshold),
    minMargin: clamp(raw.minMargin, 0, 1, d.minMargin),
    captureFps: clamp(raw.captureFps, 1, 30, d.captureFps),
    captureWidth: clamp(raw.captureWidth, 320, 1920, d.captureWidth),
    jpegQuality: clamp(raw.jpegQuality, 0.3, 0.95, d.jpegQuality),
    mirror: ['auto', 'on', 'off'].includes(raw.mirror) ? raw.mirror : d.mirror,
    sendMode: ['chat', 'fill', 'clipboard'].includes(raw.sendMode) ? raw.sendMode : d.sendMode,
    signOverrides: raw.signOverrides && typeof raw.signOverrides === 'object' ? raw.signOverrides : {},
    speechSource: ['captions', 'mic'].includes(raw.speechSource) ? raw.speechSource : d.speechSource,
    speechLang: /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(String(raw.speechLang || '')) ? String(raw.speechLang) : d.speechLang,
    speechLocalOnly: bool(raw.speechLocalOnly, d.speechLocalOnly),
    autoSign: bool(raw.autoSign, d.autoSign),
    avatarSpeed: clamp(raw.avatarSpeed, 0.5, 2, d.avatarSpeed),
    includeOwnCaptions: bool(raw.includeOwnCaptions, d.includeOwnCaptions),
  };
}

/**
 * Merge, for each label the service actually reports, the shipped defaults (config/default-signs.json)
 * with the user's overrides. Labels unknown to the config default to unverified + disabled.
 */
export function resolveSigns(serviceLabels, defaults, overrides = {}) {
  const base = (defaults && defaults.signs) || {};
  const out = {};
  for (const label of serviceLabels) {
    const d = base[label] || {};
    const o = overrides[label] || {};
    out[label] = {
      label,
      display: o.display ?? d.display ?? label,
      verified: Boolean(o.verified ?? d.verified ?? false),
      enabled: Boolean(o.enabled ?? d.enabled ?? false),
    };
  }
  return out;
}

export async function loadSettings() {
  const stored = await chrome.storage.sync.get('settings');
  return normalizeSettings(stored.settings || {});
}

export async function saveSettings(settings) {
  const clean = normalizeSettings(settings);
  await chrome.storage.sync.set({ settings: clean });
  return clean;
}

export async function loadDefaultSigns() {
  const res = await fetch(chrome.runtime.getURL('config/default-signs.json'));
  return res.json();
}

export async function loadAvatarConfig() {
  const res = await fetch(chrome.runtime.getURL('config/avatar-signs.json'));
  return res.json();
}
