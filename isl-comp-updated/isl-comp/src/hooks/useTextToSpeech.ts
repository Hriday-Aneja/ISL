import { useCallback, useEffect, useRef, useState } from 'react';
import type { TextToSpeechState } from '../types';

export interface SpeakOptions {
  /** Identifies what is being read (exposed as state.activeId). */
  id?: string;
  /** BCP-47 language tag, e.g. "en-IN". Omit to use the browser default. */
  lang?: string;
}

export function useTextToSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [state, setState] = useState<TextToSpeechState>({
    status: supported ? 'idle' : 'unsupported',
  });
  // Each speak() gets a token so a cancelled utterance's late `end`/`error`
  // event can't clobber the state of the one that replaced it.
  const tokenRef = useRef(0);

  const speak = useCallback(
    (text: string, options: SpeakOptions = {}) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel();
      const token = ++tokenRef.current;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      if (options.lang) utterance.lang = options.lang;
      const current = () => token === tokenRef.current;
      utterance.onstart = () => {
        if (current()) setState({ status: 'speaking', activeId: options.id });
      };
      utterance.onend = () => {
        if (current()) setState({ status: 'idle' });
      };
      utterance.onerror = () => {
        if (current()) setState({ status: 'idle' });
      };
      setState({ status: 'speaking', activeId: options.id });
      window.speechSynthesis.speak(utterance);
    },
    [supported]
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

  return { state, speak, cancel, supported };
}
