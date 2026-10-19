import { useCallback, useEffect, useState } from 'react';
import type { TextToSpeechState } from '../types';

export function useTextToSpeech() {
  const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const [state, setState] = useState<TextToSpeechState>({
    status: supported ? 'idle' : 'unsupported',
  });

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95;
      utterance.onstart = () => setState({ status: 'speaking' });
      utterance.onend = () => setState({ status: 'idle' });
      utterance.onerror = () => setState({ status: 'idle' });
      window.speechSynthesis.speak(utterance);
    },
    [supported]
  );

  const cancel = useCallback(() => {
    if (!supported) return;
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
