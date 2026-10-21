// Microphone speech-to-text via the browser's Web Speech API (port of isl-comp's useSpeechRecognition hook).
//
// PRIVACY: by default Chrome's SpeechRecognition sends microphone audio to a Google server. Samvaad's rule is that
// processing stays local, so localOnly (the default setting) sets recognition.processLocally = true and REFUSES to
// start if Chrome cannot do that, rather than quietly falling back to the cloud. Turn localOnly off in Settings to
// allow server-based recognition. On-device recognition needs a recent Chrome plus a downloaded language pack.
//
// This captures the LOCAL microphone only. It cannot hear other meeting participants; for them use Meet captions.

const ctor = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

export const speechSupported = () => Boolean(ctor());

/** 'available' | 'downloadable' | 'downloading' | 'unavailable' | 'unsupported' (this Chrome has no on-device API) */
export async function onDeviceStatus(lang) {
  const C = ctor();
  if (!C || typeof C.available !== 'function') return 'unsupported';
  try {
    const r = await C.available({ langs: [lang], processLocally: true });
    return ['available', 'downloadable', 'downloading', 'unavailable'].includes(r) ? r : 'unavailable';
  } catch { return 'unsupported'; }
}

/** Must be called from a user gesture (a click). Resolves true if the language pack was installed. */
export async function installOnDevice(lang) {
  const C = ctor();
  if (!C || typeof C.install !== 'function') return false;
  try { return Boolean(await C.install({ langs: [lang], processLocally: true })); } catch { return false; }
}

const ERRORS = {
  'not-allowed': { fatal: true, code: 'permission', message: 'Microphone access is not allowed for Samvaad yet.' },
  'service-not-allowed': { fatal: true, code: 'service', message: 'Speech recognition is not allowed in this browser.' },
  'audio-capture': { fatal: true, code: 'no-mic', message: 'No microphone audio could be captured. Check your microphone.' },
  'language-not-supported': { fatal: true, code: 'language', message: 'Speech recognition does not support this language here.' },
  network: { fatal: true, code: 'network', message: 'Speech recognition could not reach its service. (Local-only mode needs the on-device language pack.)' },
};

export class MicRecognizer {
  constructor({ lang = 'en-IN', localOnly = true, onInterim = () => {}, onFinal = () => {}, onState = () => {}, onError = () => {} } = {}) {
    Object.assign(this, { lang, localOnly, onInterim, onFinal, onState, onError });
    this.rec = null;
    this.wanted = false;
    this.restartTimer = null;
  }

  async start() {
    const C = ctor();
    if (!C) { this.onError({ fatal: true, code: 'unsupported', message: 'This browser has no speech recognition.' }); return false; }
    if (this.localOnly) {
      const st = await onDeviceStatus(this.lang);
      if (st === 'unsupported') { this.onError({ fatal: true, code: 'no-local', message: 'This Chrome cannot recognise speech on-device. Update Chrome, or allow cloud recognition in Samvaad Settings.' }); return false; }
      if (st === 'downloadable' || st === 'downloading') { this.onError({ fatal: true, code: 'needs-install', message: `The on-device ${this.lang} language pack is not installed yet.` }); return false; }
      if (st === 'unavailable') { this.onError({ fatal: true, code: 'no-local', message: `On-device recognition is not available for ${this.lang}. Try another language, or allow cloud recognition in Samvaad Settings.` }); return false; }
    }
    const rec = new C();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = this.lang;
    if (this.localOnly) {
      if (!('processLocally' in rec)) { this.onError({ fatal: true, code: 'no-local', message: 'This Chrome cannot recognise speech on-device.' }); return false; }
      rec.processLocally = true;
    }
    rec.onresult = (e) => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const r = e.results[i];
        const text = (r[0] && r[0].transcript || '').trim();
        if (!text) continue;
        if (r.isFinal) this.onFinal(text); else interim += `${interim ? ' ' : ''}${text}`;
      }
      this.onInterim(interim);
    };
    rec.onerror = (e) => {
      const known = ERRORS[e.error];
      if (known) { this.wanted = false; this.onError(known); return; }
      // 'no-speech' and 'aborted' are routine in continuous mode; onend restarts the session
    };
    rec.onend = () => {
      this.onInterim('');
      if (!this.wanted) { this.onState('idle'); return; }
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if (!this.wanted) return;
        try { rec.start(); } catch { this.wanted = false; this.onState('idle'); this.onError({ fatal: true, code: 'restart', message: 'Speech recognition stopped and could not restart.' }); }
      }, 200);
    };
    this.rec = rec;
    this.wanted = true;
    try { rec.start(); } catch { this.wanted = false; this.onError({ fatal: true, code: 'start', message: 'Speech recognition could not start.' }); return false; }
    this.onState('listening');
    return true;
  }

  stop() {
    this.wanted = false;
    clearTimeout(this.restartTimer);
    this.restartTimer = null;
    try { this.rec && this.rec.stop(); } catch { /* already stopped */ }
    this.rec = null;
    this.onState('idle');
  }
}
