// Thin wrapper around the Web Speech API (speechSynthesis) with English / Hindi support.
// Hindi needs an installed Hindi voice; when none exists we say so instead of reading Hindi
// text in an English voice, which sounds wrong.

export type SpeakLang = 'en' | 'hi';
export type SpeakResult = { ok: true } | { ok: false; reason: 'unsupported' | 'no-voice' | 'error' };

export function speechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

/** Voices load asynchronously in some browsers; wait briefly for them. */
export function loadVoices(timeoutMs = 1000): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener('voiceschanged', done);
  });
}

const prefix = (lang: SpeakLang) => (lang === 'hi' ? 'hi' : 'en');

export function pickVoice(voices: SpeechSynthesisVoice[], lang: SpeakLang): SpeechSynthesisVoice | null {
  const p = prefix(lang);
  const matches = voices.filter((v) => v.lang.toLowerCase().replace('_', '-').startsWith(p));
  if (!matches.length) return null;
  const preferred = lang === 'hi' ? ['hi-in'] : ['en-in', 'en-gb', 'en-us'];
  for (const code of preferred) {
    const hit = matches.find((v) => v.lang.toLowerCase().replace('_', '-') === code);
    if (hit) return hit;
  }
  return matches[0];
}

let current: SpeechSynthesisUtterance | null = null; // keep a reference: some browsers GC it mid-speech

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel();
  current = null;
}

export async function speak(text: string, lang: SpeakLang, onEnd?: () => void): Promise<SpeakResult> {
  if (!speechSupported()) return { ok: false, reason: 'unsupported' };
  const voices = await loadVoices();
  const voice = pickVoice(voices, lang);
  if (lang === 'hi' && !voice) return { ok: false, reason: 'no-voice' };

  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = voice?.lang ?? (lang === 'hi' ? 'hi-IN' : 'en-IN');
  if (voice) u.voice = voice;
  u.rate = 0.95;
  u.onend = () => {
    current = null;
    onEnd?.();
  };
  u.onerror = () => {
    current = null;
    onEnd?.();
  };
  current = u;
  try {
    synth.speak(u);
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}
