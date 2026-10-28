import { useEffect, useState } from 'react';
import { loadVoices, pickVoice, speechSupported } from '../lib/speech';

export interface VoiceInfo {
  supported: boolean;
  /** null until the browser has reported its voices. */
  hasHindi: boolean | null;
}

/** Reports whether speech synthesis exists and whether a Hindi voice is installed. */
export function useVoices(): VoiceInfo {
  const [info, setInfo] = useState<VoiceInfo>({ supported: speechSupported(), hasHindi: null });
  useEffect(() => {
    if (!speechSupported()) return;
    let cancelled = false;
    const check = () =>
      loadVoices(1500).then((v) => {
        if (!cancelled) setInfo({ supported: true, hasHindi: pickVoice(v, 'hi') !== null });
      });
    check();
    window.speechSynthesis.addEventListener('voiceschanged', check);
    return () => {
      cancelled = true;
      window.speechSynthesis.removeEventListener('voiceschanged', check);
    };
  }, []);
  return info;
}
