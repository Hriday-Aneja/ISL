import { useEffect, useRef, useState } from 'react';
import { Mic, MicOff, AlertTriangle } from 'lucide-react';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import type { useAvatarPlayer } from '../../hooks/useAvatarPlayer';
import { mapPhraseToSigns } from '../../utils/phraseMapper';
import { MessageCard } from './MessageCard';
import { DebugPanel } from './DebugPanel';
import type { SignId } from '../../types';

interface SpeechPanelProps {
  onSendToAvatar: (text: string, signs: SignId[]) => void;
  onLiveTranscript: (text: string) => void;
  /** Text injected from the quick-phrase / keyboard input flow, treated
   * exactly like a finished spoken utterance. `nonce` forces re-processing
   * even if the same phrase is sent twice in a row. */
  externalInput?: { text: string; nonce: number } | null;
  debugMode?: boolean;
  /** Lifted up to CommunicationRoom (instead of owned here) so the shared
   * call stage can also render the avatar's mini-pane from the same
   * playback state. The hook itself — timing, playSigns(), completion — is
   * untouched; only where it's instantiated moved up one level. */
  avatar: ReturnType<typeof useAvatarPlayer>;
  /** The ISL user's translated sentence, received over the call. */
  receivedMessage?: string;
  /** Rendered inside the floating translation panel over the call video
   * (which supplies the frame and title) instead of as a standalone card. */
  embedded?: boolean;
}

export function SpeechPanel({
  onSendToAvatar,
  onLiveTranscript,
  externalInput,
  debugMode = false,
  avatar,
  receivedMessage,
  embedded = false,
}: SpeechPanelProps) {
  const { state, start, stop, reset, supported } = useSpeechRecognition();
  const tts = useTextToSpeech();
  const [sentence, setSentence] = useState('');
  const [mappedSigns, setMappedSigns] = useState<SignId[]>([]);
  const [matched, setMatched] = useState<boolean | null>(null);
  const lastSentTranscriptRef = useRef('');

  // Integration point: microphone -> speech recognition -> text -> phrase/
  // sign mapping -> avatar. processUtterance() is the single place that
  // turns finished text (from either live speech or the keyboard/quick-
  // phrase input) into a sign sequence and hands it to the avatar player.
  const processUtterance = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const result = mapPhraseToSigns(trimmed);
    setSentence(trimmed);
    setMappedSigns(result.signs);
    setMatched(result.matched);

    if (result.matched && result.signs.length > 0) {
      avatar.playSigns(result.signs);
    }
    onSendToAvatar(trimmed, result.matched ? result.signs : []);
  };

  useEffect(() => {
    if (!externalInput) return;
    processUtterance(externalInput.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [externalInput?.nonce]);

  const liveTranscript = (state.finalTranscript + ' ' + state.interimTranscript).trim();
  const isListening = state.status === 'listening';

  useEffect(() => {
    if (!liveTranscript) {
      if (lastSentTranscriptRef.current) onLiveTranscript('');
      lastSentTranscriptRef.current = '';
      return;
    }
    if (liveTranscript === lastSentTranscriptRef.current) return;
    lastSentTranscriptRef.current = liveTranscript;
    onLiveTranscript(liveTranscript);
  }, [liveTranscript, onLiveTranscript]);

  const handleToggleMic = () => {
    if (isListening) {
      stop();
      if (state.finalTranscript.trim()) {
        processUtterance(state.finalTranscript);
      }
    } else {
      reset();
      setSentence('');
      setMappedSigns([]);
      setMatched(null);
      start();
    }
  };

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'stage-panel'}>
      {!embedded && (
        <div className="flex items-center justify-between border-b border-room-border px-4 py-2.5">
          <p className="text-sm font-medium text-room-text">Hearing User</p>
          {isListening && (
            <span className="flex items-center gap-1.5 text-xs font-medium text-voice">
              <span className="h-1.5 w-1.5 rounded-full bg-voice animate-pulse-ring-amber" />
              Listening
            </span>
          )}
        </div>
      )}

      <div
        className={`flex items-center gap-2 border-room-border px-4 py-3 ${
          embedded ? 'order-last border-t' : 'border-b'
        }`}
      >
        {!supported ? (
          <div className="flex flex-1 items-center gap-2 text-sm text-alert">
            <AlertTriangle size={16} />
            Speech-to-text isn't supported in this browser. Try Chrome or Edge.
          </div>
        ) : (
          <button
            onClick={handleToggleMic}
            className={isListening ? 'btn-danger flex-1' : 'btn-voice flex-1'}
          >
            {isListening ? <MicOff size={16} /> : <Mic size={16} />}
            {isListening ? 'Stop listening' : 'Start listening'}
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        {embedded && isListening && (
          <span className="mb-2 flex items-center gap-1.5 text-xs font-medium text-voice">
            <span className="h-1.5 w-1.5 rounded-full bg-voice animate-pulse-ring-amber" />
            Listening
          </span>
        )}
        {isListening && liveTranscript && (
          <p className="mb-2 text-sm italic text-room-text-soft">“{liveTranscript}…”</p>
        )}

        <MessageCard
          eyebrow="You said"
          sentence={sentence}
          tone="voice"
          trailer={avatar.isPlaying ? 'Avatar signing…' : undefined}
          emptyLabel="Your recognized speech will appear here once you speak."
        />

        {receivedMessage && (
          <div className="mt-3">
            <MessageCard
              eyebrow="ISL user signed"
              sentence={receivedMessage}
              tone="signal"
              onPlayAudio={() =>
                tts.state.status === 'speaking' ? tts.cancel() : tts.speak(receivedMessage)
              }
              isSpeaking={tts.state.status === 'speaking'}
              emptyLabel=""
            />
          </div>
        )}

        {matched === false && (
          <p className="mt-2 text-xs text-room-text-soft">
            That phrase isn't in the current vocabulary yet — try rephrasing, or use a quick
            phrase from the keyboard input.
          </p>
        )}

        {state.status === 'error' && (
          <p className="mt-2 text-xs text-alert">{state.errorMessage}</p>
        )}

        {debugMode && (
          <DebugPanel
            label="speech → sign mapping"
            detectedSigns={mappedSigns}
            recognitionState={isListening ? 'listening' : matched === null ? 'idle' : matched ? 'matched' : 'unmatched'}
            tone="voice"
          />
        )}
      </div>
    </div>
  );
}
