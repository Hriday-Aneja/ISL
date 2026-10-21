import { useEffect, useRef, useState } from 'react';
import { ScanFace, VideoOff } from 'lucide-react';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { openRecognitionSession, type RecognitionSession } from '../../services/recognition';
import { signsToSentence } from '../../data/signMappings';
import { MessageCard } from './MessageCard';
import { DebugPanel } from './DebugPanel';
import type { SignId } from '../../types';

interface CameraPanelProps {
  onNewSentence: (text: string, signs: SignId[]) => void;
  debugMode?: boolean;
  /** The same MediaStream instance driving the WebRTC call — this panel
   * never opens its own camera. The call stage above shows it large; this
   * panel just keeps a small self-check thumbnail and reads frames from
   * the same stream for recognition. */
  stream: MediaStream | null;
  cameraEnabled: boolean;
  errorMessage?: string | null;
  /** The hearing user's spoken message, received over the call. Shown under
   * the ISL user's own output; the avatar/caption on the stage show it too. */
  receivedMessage?: string;
  avatarSigning?: boolean;
  recognitionRequest?: number;
  onRecognitionStatusChange?: (recognizing: boolean) => void;
  /** Rendered inside the floating translation panel over the call video
   * (which supplies the frame and title) instead of as a standalone card. */
  embedded?: boolean;
}

export function CameraPanel({
  onNewSentence,
  debugMode = false,
  stream,
  cameraEnabled,
  errorMessage,
  receivedMessage,
  avatarSigning = false,
  recognitionRequest = 0,
  onRecognitionStatusChange,
  embedded = false,
}: CameraPanelProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const tts = useTextToSpeech();
  const [recognizing, setRecognizing] = useState(false);
  const [detectedSigns, setDetectedSigns] = useState<SignId[]>([]);
  const [confidence, setConfidence] = useState<number | undefined>(undefined);
  const [sentence, setSentence] = useState('');
  const [recognitionError, setRecognitionError] = useState<string | null>(null);
  const [debugInfo, setDebugInfo] = useState<{ frames?: number; modelFrames?: number; inferenceMs?: number }>();
  const sessionRef = useRef<RecognitionSession | null>(null);
  const sessionPromiseRef = useRef<Promise<RecognitionSession> | null>(null);
  const lastRecognitionRequestRef = useRef(recognitionRequest);

  // The <video> element stays permanently mounted so the stream can be
  // attached as soon as it's available — same lesson as before, just now
  // feeding a small thumbnail instead of the main camera view.
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {
        /* autoplay can be blocked; user can press play via controls */
      });
    }
  }, [stream]);

  const stopRecognition = async () => {
    const session = sessionRef.current || (sessionPromiseRef.current ? await sessionPromiseRef.current : null);
    sessionRef.current = null;
    sessionPromiseRef.current = null;
    if (!session) return;
    try {
      const result = await session.stop();
      setDetectedSigns(result.signs);
      setConfidence(result.confidence);
      setDebugInfo(result.debug);
      const text = signsToSentence(result.signs);
      setSentence(text);
      onNewSentence(text, result.signs);
    } catch (error) {
      setRecognitionError(error instanceof Error ? error.message : 'Recognition failed.');
    } finally {
      setRecognizing(false);
      onRecognitionStatusChange?.(false);
    }
  };

  const runRecognition = async () => {
    if (recognizing) {
      await stopRecognition();
      return;
    }
    if (!videoRef.current) return;
    setRecognizing(true);
    onRecognitionStatusChange?.(true);
    setRecognitionError(null);
    setSentence('');
    const promise = openRecognitionSession(videoRef.current, (update) => {
      if (update.status === 'error') setRecognitionError(update.message || 'Recognition service error.');
      if (update.debug) setDebugInfo(update.debug);
    });
    sessionPromiseRef.current = promise;
    try {
      sessionRef.current = await promise;
    } catch (error) {
      setRecognizing(false);
      onRecognitionStatusChange?.(false);
      setRecognitionError(error instanceof Error ? error.message : 'Could not start recognition.');
    }
  };

  useEffect(() => () => {
    sessionRef.current?.close();
    sessionRef.current = null;
  }, []);

  useEffect(() => {
    if (recognitionRequest === lastRecognitionRequestRef.current) return;
    lastRecognitionRequestRef.current = recognitionRequest;
    if (recognitionRequest > 0) void runRecognition();
    // The request counter is the command; runRecognition intentionally uses
    // the current video ref and callback values when the command arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recognitionRequest]);

  const isActive = Boolean(stream) && cameraEnabled;

  return (
    <div className={embedded ? 'flex min-h-0 flex-1 flex-col' : 'stage-panel'}>
      {/* Embedded: the header is visually hidden but the <video> stays mounted —
          it's the frame source recognition reads from (see runRecognition). */}
      <div
        aria-hidden={embedded || undefined}
        className={
          embedded
            ? 'pointer-events-none absolute h-px w-px overflow-hidden opacity-0'
            : 'flex items-center justify-between border-b border-room-border px-4 py-2.5'
        }
      >
        <p className="text-sm font-medium text-room-text">ISL User · You</p>

        {/* Small self-check thumbnail — confirms framing without competing
            with the peer's video for attention above. */}
        <div className="relative h-9 w-14 overflow-hidden rounded-sm border border-room-border bg-room-bg">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover transition-opacity duration-200 ${
              isActive ? 'opacity-100' : 'opacity-0'
            }`}
            style={{ transform: 'scaleX(-1)' }}
          />
          {!isActive && (
            <div className="absolute inset-0 flex items-center justify-center">
              <VideoOff size={12} className="text-white/25" />
            </div>
          )}
        </div>
      </div>

      <div
        className={`flex items-center gap-2 border-room-border px-4 py-3 ${
          embedded ? 'order-last border-t' : 'border-b'
        }`}
      >
        <button onClick={runRecognition} disabled={!isActive || recognizing} className="btn-primary flex-1">
          <ScanFace size={16} />
          {recognizing ? 'Stop reading' : 'Read my signs'}
        </button>
      </div>

      {!isActive && (
        <p className="border-b border-room-border px-4 py-2 text-xs text-room-text-soft">
          {errorMessage ||
            (stream
              ? 'Your camera is off. Turn it on from the call bar to start signing.'
              : 'Waiting for your camera…')}
        </p>
      )}

      {isActive && recognizing && (
        <p className="flex items-center gap-2 border-b border-room-border px-4 py-2 text-xs text-room-text-soft">
          <ScanFace size={13} className="animate-pulse text-signal" />
          Reading your signs…
        </p>
      )}

      {recognitionError && (
        <p className="border-b border-room-border px-4 py-2 text-xs text-alert">{recognitionError}</p>
      )}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5">
        <MessageCard
          eyebrow="You signed"
          sentence={sentence}
          tone="signal"
          onPlayAudio={() => (tts.state.status === 'speaking' ? tts.cancel() : tts.speak(sentence))}
          isSpeaking={tts.state.status === 'speaking'}
          emptyLabel="Your translated sentence will appear here once you sign."
        />
        {receivedMessage && (
          <div className="mt-3">
            <MessageCard
              eyebrow="Hearing user said"
              sentence={receivedMessage}
              tone="voice"
              trailer={avatarSigning ? 'Avatar signing…' : undefined}
              emptyLabel=""
            />
          </div>
        )}
        {tts.supported === false && sentence && (
          <p className="mt-2 text-xs text-alert">
            Speech playback isn't supported in this browser — the sentence is still shown above.
          </p>
        )}

        {debugMode && (
          <>
            <DebugPanel
              label="ISL recognition"
              detectedSigns={detectedSigns}
              confidence={confidence}
              recognitionState={recognizing ? 'recognizing' : sentence ? 'done' : 'idle'}
              tone="signal"
            />
            {debugInfo && (
              <p className="mt-2 font-mono text-[10px] text-room-text-soft/80">
                frames={debugInfo.frames ?? '-'} model_frames={debugInfo.modelFrames ?? '-'} inference_ms={debugInfo.inferenceMs ?? '-'}
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
