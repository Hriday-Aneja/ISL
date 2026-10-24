import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextToSpeechState } from '../types';

export interface SpeakOptions {
  /** Identifies what is being read (exposed as state.activeId). */
  id?: string;
  /** BCP-47 language tag, e.g. "en-IN" or "hi-IN". Omit to use the browser default. */
  lang?: string;
}

export interface SpeechPart {
  text: string;
  /** BCP-47 language tag; omit for the browser default. */
  lang?: string;
}

/** Best installed voice for a language ("hi-IN" -> any hi-* voice), or undefined. */
export function pickVoice(lang: string | undefined): SpeechSynthesisVoice | undefined {
  if (!lang || typeof window === 'undefined' || !('speechSynthesis' in window)) return undefined;
  const voices = window.speechSynthesis.getVoices();
  const wanted = lang.toLowerCase();
  const base = wanted.split('-')[0];
  return (
    voices.find((v) => v.lang.toLowerCase().replace('_', '-') === wanted) ??
    voices.find((v) => v.lang.toLowerCase().replace('_', '-').split('-')[0] === base)
  );
}

export function useTextToSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [state, setState] = useState<TextToSpeechState>({
    status: supported ? 'idle' : 'unsupported',
  });
  // Each speak() gets a token so a cancelled utterance's late `end`/`error`
  // event can't clobber the state of the one that replaced it.
  const tokenRef = useRef(0);

  // Browsers load their voice list asynchronously; ask for it early so a Hindi
  // voice is already known the first time a card is spoken.
  useEffect(() => {
    if (!supported) return;
    window.speechSynthesis.getVoices();
  }, [supported]);

  /** Reads several parts one after another (e.g. English, then Hindi). */
  const speakSequence = useCallback(
    (parts: SpeechPart[], options: { id?: string } = {}) => {
      const queue = parts.filter((p) => p.text.trim());
      if (!supported || queue.length === 0) return;
      window.speechSynthesis.cancel();
      const token = ++tokenRef.current;
      const current = () => token === tokenRef.current;

      const speakAt = (index: number) => {
        const part = queue[index];
        const utterance = new SpeechSynthesisUtterance(part.text);
        utterance.rate = 0.95;
        if (part.lang) {
          utterance.lang = part.lang;
          const voice = pickVoice(part.lang);
          if (voice) utterance.voice = voice;
        }
        utterance.onstart = () => {
          if (current()) setState({ status: 'speaking', activeId: options.id });
        };
        const next = () => {
          if (!current()) return;
          if (index + 1 < queue.length) speakAt(index + 1);
          else setState({ status: 'idle' });
        };
        utterance.onend = next;
        utterance.onerror = next;
        window.speechSynthesis.speak(utterance);
      };

      setState({ status: 'speaking', activeId: options.id });
      speakAt(0);
    },
    [supported]
  );

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      if (!text) return;
      speakSequence([{ text, lang: options.lang }], { id: options.id });
    },
    [speakSequence]
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    tokenRef.current += 1;
    window.speechSynthesis.cancel();
    setState({ status: 'idle' });
  }, [supported]);

  useEffect(() => {
    return () => {
      if (supported) window.speechSynthesis.cancel();
    };
  }, [supported]);

  return { state, speak, speakSequence, cancel, supported };
}
