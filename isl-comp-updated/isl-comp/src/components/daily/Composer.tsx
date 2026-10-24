import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, Mic, Send, Square, X } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import type { MessageSender, MessageSource } from '../../lib/dailyStore';

interface ComposerProps {
  onSend: (text: string, sender: MessageSender, source: MessageSource) => void;
}

const MAX_MESSAGE_LENGTH = 500;

/**
 * Typing + voice in one place. Speech fills the same box you can type in, so
 * the text can always be corrected before it is sent: nothing recognised is
 * sent automatically.
 */
export function Composer({ onSend }: ComposerProps) {
  const { state, start, stop, reset, supported } = useSpeechRecognition();
  const [draft, setDraft] = useState('');
  const [sender, setSender] = useState<MessageSender>('other');
  const [fromSpeech, setFromSpeech] = useState(false);
  const baseRef = useRef('');
  const listening = state.status === 'listening';

  // While listening, mirror the live transcript (final + still-forming words)
  // after whatever was already in the box.
  useEffect(() => {
    if (!listening) return;
    const live = [baseRef.current, state.finalTranscript, state.interimTranscript]
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
    setDraft(live.slice(0, MAX_MESSAGE_LENGTH));
    if (state.finalTranscript || state.interimTranscript) setFromSpeech(true);
  }, [listening, state.finalTranscript, state.interimTranscript]);

  const toggleMic = () => {
    if (listening) {
      stop();
      return;
    }
    baseRef.current = draft.trim();
    reset();
    start();
  };

  const clear = () => {
    if (listening) stop();
    setDraft('');
    setFromSpeech(false);
    baseRef.current = '';
    reset();
  };

  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (listening) stop();
    onSend(text, sender, fromSpeech ? 'speech' : 'typed');
    clear();
  };

  const permissionDenied = state.status === 'error' && /denied|not allowed/i.test(state.errorMessage ?? '');

  return (
    <div className="space-y-2.5 border-t border-white/10 bg-[#202c33] p-3.5">
      <div role="group" aria-label="Who is sending this message?" className="grid grid-cols-2 gap-2">
        {([
          ['other', 'Other person'],
          ['me', 'Me'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={sender === value}
            onClick={() => setSender(value)}
            className={`min-h-[44px] rounded-sm border-2 text-sm font-bold transition-colors ${
              sender === value
                ? value === 'me'
                  ? 'border-signal bg-signal text-[#06231d]'
                  : 'border-voice-deep bg-voice text-[#1A1204]'
                : 'border-white/15 bg-night-card text-mist hover:text-cream'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div>
        <label htmlFor="composer-draft" className="sr-only">
          Message to add to the conversation
        </label>
        <textarea
          id="composer-draft"
          value={draft}
          readOnly={listening}
          rows={2}
          maxLength={MAX_MESSAGE_LENGTH}
          onChange={(event) => {
            setDraft(event.target.value);
            if (!event.target.value.trim()) setFromSpeech(false);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
              event.preventDefault();
              submit();
            }
          }}
          placeholder={listening ? 'Listening… speak now' : 'Type here, or tap the microphone and speak'}
          className={`w-full resize-none rounded-md border-2 bg-night px-3 py-2.5 text-lg text-cream outline-none focus-visible:border-signal ${
            listening ? 'border-voice-deep' : 'border-white/15'
          }`}
        />
        <p className="mt-1 text-xs text-mist" id="composer-hint">
          {listening
            ? 'Words appear as you speak. Tap Stop when finished, then check the text.'
            : fromSpeech && draft
              ? 'Check the text and fix any mistakes, then press Send.'
              : 'Enter to send · Shift+Enter for a new line'}
        </p>
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {listening ? 'Listening' : ''}
      </p>

      {!supported && (
        <p role="alert" className="flex items-start gap-2 rounded-sm border border-voice/50 bg-voice-soft px-3 py-2 text-sm text-cream">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-voice-deep" />
          Speech recognition is not supported in this browser. Use Chrome or Edge to speak, or type your message above.
        </p>
      )}

      {state.status === 'error' && state.errorMessage && (
        <p role="alert" className="flex items-start gap-2 rounded-sm border border-alert/40 bg-alert/15 px-3 py-2 text-sm text-cream">
          <AlertTriangle size={16} className="mt-0.5 shrink-0 text-[#ff9a90]" />
          <span>
            {state.errorMessage}
            {permissionDenied && ' Click the lock icon in the address bar, allow the microphone, then tap the microphone button again.'}
          </span>
        </p>
      )}

      <div className="flex items-stretch gap-2">
        <button
          type="button"
          onClick={toggleMic}
          disabled={!supported}
          aria-pressed={listening}
          aria-label={listening ? 'Stop listening' : 'Speak into the microphone'}
          className={`inline-flex min-h-[52px] flex-1 items-center justify-center gap-2 rounded-sm border-2 text-base font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
            listening
              ? 'border-[#b83a3a] bg-[#b83a3a] text-white hover:bg-[#9f3030]'
              : 'border-voice-deep bg-voice text-[#1A1204] hover:bg-voice-deep hover:text-[#1A1204]'
          }`}
        >
          {listening ? <Square size={17} /> : <Mic size={19} />}
          {listening ? 'Stop' : 'Speak'}
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!draft.trim()}
          className="btn-primary min-h-[52px] flex-1 px-4 text-base font-bold"
        >
          <Send size={18} /> Send
        </button>
        {draft && (
          <button type="button" onClick={clear} aria-label="Clear text" className="icon-btn h-auto min-h-[52px] w-12">
            <X size={18} />
          </button>
        )}
      </div>
    </div>
  );
}
