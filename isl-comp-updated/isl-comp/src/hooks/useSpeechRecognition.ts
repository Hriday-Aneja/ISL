import { useCallback, useEffect, useRef, useState } from 'react';
import type { SpeechRecognitionState } from '../types';

// Minimal ambient typing for the non-standard Web Speech API so this file
// compiles without pulling in a heavyweight third-party type package.
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      isFinal: boolean;
      [index: number]: { transcript: string };
    };
  };
}

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  const w = window as unknown as Record<string, unknown>;
  const ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as
    | (new () => SpeechRecognitionLike)
    | undefined;
  return ctor ?? null;
}

export function useSpeechRecognition() {
  const supported = typeof window !== 'undefined' && !!getSpeechRecognitionCtor();
  const [state, setState] = useState<SpeechRecognitionState>({
    status: supported ? 'idle' : 'unsupported',
    interimTranscript: '',
    finalTranscript: '',
  });
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldListenRef = useRef(false);
  const restartTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const finalizedPrefixRef = useRef('');
  const latestFinalRef = useRef('');

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setState((s) => ({ ...s, status: 'unsupported' }));
      return;
    }
    shouldListenRef.current = true;
    finalizedPrefixRef.current = '';
    latestFinalRef.current = '';
    const recognition = new Ctor();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-IN';

    recognition.onresult = (event) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) final += transcript + ' ';
        else interim += transcript;
      }
      const finalTranscript = [finalizedPrefixRef.current, final].filter(Boolean).join(' ').trim();
      latestFinalRef.current = finalTranscript;
      setState((s) => ({
        ...s,
        status: shouldListenRef.current ? 'listening' : 'idle',
        interimTranscript: interim.trim(),
        finalTranscript,
      }));
    };

    recognition.onerror = (event) => {
      const fatal = event.error === 'not-allowed' || event.error === 'service-not-allowed' || event.error === 'audio-capture';
      if (fatal) shouldListenRef.current = false;
      setState((s) => ({
        ...s,
        status: fatal ? 'error' : shouldListenRef.current ? 'listening' : 'idle',
        errorMessage:
          event.error === 'not-allowed'
            ? 'Microphone access was denied. Allow microphone permission to continue.'
            : event.error === 'service-not-allowed'
              ? 'Speech recognition is not allowed in this browser.'
              : event.error === 'audio-capture'
                ? 'No microphone audio could be captured. Check your microphone and try again.'
                : fatal
                  ? 'Speech recognition hit an error. Try again.'
                  : undefined,
      }));
    };

    recognition.onend = () => {
      if (!shouldListenRef.current) {
        setState((s) => ({ ...s, status: s.status === 'error' ? 'error' : 'idle' }));
        return;
      }
      finalizedPrefixRef.current = latestFinalRef.current;
      restartTimerRef.current = setTimeout(() => {
        restartTimerRef.current = null;
        if (!shouldListenRef.current) return;
        try {
          recognition.start();
          setState((s) => ({ ...s, status: 'listening', errorMessage: undefined }));
        } catch {
          shouldListenRef.current = false;
          setState((s) => ({
            ...s,
            status: 'error',
            errorMessage: 'Speech recognition could not restart. Try listening again.',
          }));
        }
      }, 200);
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      setState((s) => ({ ...s, status: 'listening', errorMessage: undefined }));
    } catch {
      shouldListenRef.current = false;
      setState((s) => ({
        ...s,
        status: 'error',
        errorMessage: 'Speech recognition could not start. Try again.',
      }));
    }
  }, []);

  const stop = useCallback(() => {
    shouldListenRef.current = false;
    if (restartTimerRef.current) {
      clearTimeout(restartTimerRef.current);
      restartTimerRef.current = null;
    }
    recognitionRef.current?.stop();
    setState((s) => ({ ...s, status: 'idle', interimTranscript: '' }));
  }, []);

  const reset = useCallback(() => {
    setState((s) => ({ ...s, interimTranscript: '', finalTranscript: '' }));
  }, []);

  useEffect(() => {
    return () => {
      shouldListenRef.current = false;
      if (restartTimerRef.current) clearTimeout(restartTimerRef.current);
      recognitionRef.current?.stop();
    };
  }, []);

  return { state, start, stop, reset, supported };
}
