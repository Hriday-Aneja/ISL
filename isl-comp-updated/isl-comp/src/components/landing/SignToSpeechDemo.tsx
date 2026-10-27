import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Check,
  CircleAlert,
  Eraser,
  Loader2,
  RefreshCw,
  ScanFace,
  Shuffle,
  Square,
  Video,
  VideoOff,
  Volume2,
  X,
} from 'lucide-react';
import { SignVideo } from '../daily/SignVideo';
import { useCamera } from '../../hooks/useCamera';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import {
  openRecognitionSession,
  probeRecognitionService,
  serviceAddress,
  type RecognitionProbe,
  type RecognitionSession,
} from '../../services/recognition';
import { AVATAR_VIDEOS } from '../../data/avatarVideos';
import { SIGN_LABELS, signsToSentence } from '../../data/signMappings';
import type { RecognitionResult, SignId } from '../../types';

// The 24 signs the trained model knows. Judges can only be asked for these.
const DEMO_SIGNS: SignId[] = [
  'HELLO', 'I', 'YOU', 'HE', 'SHE', 'HAPPY', 'SAD', 'THANK_YOU',
  'DOCTOR', 'STUDENT', 'TEACHER', 'LAWYER', 'WAITER',
  'MOTHER', 'FATHER', 'PARENT', 'SON', 'DAUGHTER',
  'HOUSE', 'RESTAURANT', 'TRAIN_STATION', 'DOG', 'BIRD', 'BEAUTIFUL',
];

// Signs that ship with a reference clip. These are the ones a judge can be asked for, because the
// clip shows exactly how to perform the sign. The rest are model-only: the presenter must show them.
const CLIP_SIGNS: SignId[] = DEMO_SIGNS.filter((s) => Boolean(AVATAR_VIDEOS[s]));

// Below this the model is guessing; we ask for a retry instead of speaking a wrong word.
const MIN_CONFIDENCE = 0.35;
// Safety net so a forgotten "Done" never streams frames forever.
const MAX_RECORD_MS = 8000;

type Phase = 'idle' | 'recording' | 'reading';

interface Outcome {
  result: RecognitionResult;
  accepted: boolean;
  simulated: boolean;
  target: SignId | null;
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const labelFor = (raw: string) => {
  const hit = DEMO_SIGNS.find((s) => s.replace(/_/g, '').toLowerCase() === raw.replace(/[^a-z0-9]/gi, '').toLowerCase());
  return hit ? SIGN_LABELS[hit] : raw;
};

export function SignToSpeechDemo() {
  const camera = useCamera();
  const tts = useTextToSpeech();

  const [target, setTarget] = useState<SignId | null>('HELLO');
  const [phase, setPhase] = useState<Phase>('idle');
  const [probe, setProbe] = useState<RecognitionProbe | 'checking'>('checking');
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [chain, setChain] = useState<SignId[]>([]);
  const [showAll, setShowAll] = useState(false);

  const sessionPromise = useRef<Promise<RecognitionSession> | null>(null);
  const autoStop = useRef<number | undefined>(undefined);
  const mounted = useRef(true);
  const phaseRef = useRef<Phase>('idle');
  phaseRef.current = phase;
  const targetRef = useRef<SignId | null>(target);
  targetRef.current = target;
  const chainRef = useRef<SignId[]>([]);

  const checkService = useCallback(async () => {
    setProbe('checking');
    const result = await probeRecognitionService();
    if (mounted.current) setProbe(result);
  }, []);

  useEffect(() => {
    mounted.current = true;
    void checkService();
    return () => {
      mounted.current = false;
      window.clearTimeout(autoStop.current);
      void sessionPromise.current?.then((s) => s.close()).catch(() => undefined);
    };
  }, [checkService]);

  const cameraOn = camera.state.status === 'active';
  const serviceUp = probe !== 'checking' && probe.ok;
  // No model server (e.g. the hosted site): the signer taps the sign they made instead. Everything
  // after that (sentence building, speech) is the same real code path as live recognition.
  const manualMode = probe !== 'checking' && !probe.ok;
  const sentence = chain.length > 0 ? signsToSentence(chain) : '';

  const finish = useCallback(
    (result: RecognitionResult, simulated: boolean, forTarget: SignId | null) => {
      const accepted = simulated || result.confidence >= MIN_CONFIDENCE;
      setOutcome({ result, accepted, simulated, target: forTarget });
      if (accepted) {
        const next = [...chainRef.current, ...result.signs].slice(-6);
        chainRef.current = next;
        setChain(next);
        tts.speak(signsToSentence(next), { lang: 'en-IN' });
      }
    },
    [tts]
  );

  const startRecording = async () => {
    const video = camera.videoRef.current;
    if (!video || phaseRef.current !== 'idle') return;
    setError(null);
    setOutcome(null);
    tts.cancel();
    setPhase('recording');
    const promise = openRecognitionSession(video, (update) => {
      if (update.status === 'error' && update.message) setError(update.message);
    });
    sessionPromise.current = promise;
    try {
      await promise;
      autoStop.current = window.setTimeout(() => void stopRecording(), MAX_RECORD_MS);
    } catch (err) {
      sessionPromise.current = null;
      if (!mounted.current) return;
      setPhase('idle');
      setError(err instanceof Error ? err.message : 'Could not reach the recognition service.');
      void checkService();
    }
  };

  const stopRecording = async () => {
    if (phaseRef.current !== 'recording') return;
    window.clearTimeout(autoStop.current);
    const pending = sessionPromise.current;
    sessionPromise.current = null;
    if (!pending) return;
    setPhase('reading');
    const forTarget = targetRef.current;
    try {
      const session = await pending;
      const result = await session.stop();
      if (mounted.current) finish(result, false, forTarget);
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : 'Recognition failed. Please try again.');
      }
    } finally {
      if (mounted.current) setPhase('idle');
    }
  };

  // Server-free mode: the person taps the sign they just made. Nothing is recognised or guessed.
  const pickSign = (sign: SignId) => {
    if (phaseRef.current !== 'idle') return;
    setError(null);
    tts.cancel();
    finish({ signs: [sign], confidence: 1 }, true, null);
  };

  const clearAll = () => {
    tts.cancel();
    chainRef.current = [];
    setChain([]);
    setOutcome(null);
    setError(null);
  };

  const visibleSigns = showAll ? DEMO_SIGNS : CLIP_SIGNS;
  const pickRandom = () => {
    const pool = CLIP_SIGNS.filter((s) => s !== target);
    if (pool.length === 0) return;
    setTarget(pool[Math.floor(Math.random() * pool.length)]);
    setOutcome(null);
  };

  const speaking = tts.state.status === 'speaking';
  const targetSrc = target ? AVATAR_VIDEOS[target] : undefined;
  const top = outcome?.result.debug?.top?.slice(0, 3) ?? [];
  const matched =
    outcome && !outcome.simulated && outcome.target ? outcome.result.signs[0] === outcome.target : null;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------------- left: guide + camera ---------------- */}
      <div className="flex flex-col gap-4">
        <ServiceBadge probe={probe} onRecheck={checkService} />

        <div className="relative aspect-video overflow-hidden rounded-2xl border border-white/10 bg-black/40">
          <video
            ref={camera.videoRef}
            autoPlay
            playsInline
            muted
            className={`h-full w-full object-cover ${cameraOn ? 'opacity-100' : 'opacity-0'}`}
            style={{ transform: 'scaleX(-1)' }}
          />
          {!cameraOn && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              <VideoOff size={28} className="text-mist" />
              <p className="text-sm text-mist">
                {camera.state.errorMessage ?? 'Turn on the camera so the model can see your hands.'}
              </p>
              <button
                type="button"
                onClick={camera.start}
                disabled={camera.state.status === 'requesting'}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full bg-saffron px-5 text-sm font-semibold text-[#1A1204]"
              >
                <Video size={16} /> {camera.state.status === 'requesting' ? 'Starting…' : 'Start camera'}
              </button>
            </div>
          )}
          {phase === 'recording' && (
            <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-cream">
              <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> Recording — sign now
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {manualMode ? null : phase === 'recording' ? (
            <button
              type="button"
              onClick={() => void stopRecording()}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-mint px-6 text-[15px] font-semibold text-[#04150E]"
            >
              <Square size={15} fill="currentColor" /> Done — translate
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={!cameraOn || phase === 'reading' || !serviceUp}
              className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-saffron px-6 text-[15px] font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {phase === 'reading' ? <Loader2 size={17} className="animate-spin" /> : <ScanFace size={17} />}
              {phase === 'reading' ? 'Reading the sign…' : 'Start signing'}
            </button>
          )}
          {cameraOn && phase === 'idle' && (
            <button
              type="button"
              onClick={camera.stop}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 text-sm text-cream hover:border-saffron/50"
            >
              <VideoOff size={15} /> Camera off
            </button>
          )}
        </div>

        {manualMode ? (
          <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">I signed… (tap one)</p>
            <p className="mt-1 text-xs text-mist">
              Make the sign next to the reference clip, then tap it here. Tap several in a row to build a sentence.
            </p>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {DEMO_SIGNS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => pickSign(s)}
                  className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-cream transition-colors hover:border-saffron/50 hover:text-saffron"
                >
                  {SIGN_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-mist">
            Press <strong className="text-cream">Start signing</strong>, make ONE sign, hold it for a second, then press{' '}
            <strong className="text-cream">Done</strong>. Keep your face and both hands in frame.
          </p>
        )}

        {error && (
          <div role="alert" className="rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <p className="flex items-start gap-2">
              <CircleAlert size={16} className="mt-0.5 flex-none" /> {error}
            </p>
          </div>
        )}
      </div>

      {/* ---------------- right: demo guide + result ---------------- */}
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">Demo guide — sign this</p>
          <p className="mt-1 text-xs text-mist">
            Pick a word, <strong className="text-cream">watch the clip</strong>, then copy that sign in front of the camera.
          </p>

          <div className="mt-3 grid gap-4 sm:grid-cols-[1fr_190px]">
            <div className="flex flex-wrap content-start gap-1.5">
              <button
                type="button"
                onClick={pickRandom}
                className="inline-flex items-center gap-1.5 rounded-full bg-saffron px-3 py-1.5 text-xs font-semibold text-[#1A1204]"
              >
                <Shuffle size={12} /> Random sign
              </button>
              <button
                type="button"
                aria-pressed={target === null}
                onClick={() => setTarget(null)}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  target === null ? 'border-saffron bg-saffron/15 text-saffron' : 'border-white/10 text-mist hover:text-cream'
                }`}
              >
                Free sign
              </button>
              {visibleSigns.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={target === s}
                  onClick={() => setTarget(s)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${
                    target === s
                      ? 'border-saffron bg-saffron/15 text-saffron'
                      : 'border-white/10 bg-white/[0.04] text-cream hover:border-white/30'
                  }`}
                >
                  {SIGN_LABELS[s]}
                  {AVATAR_VIDEOS[s] ? ' ▶' : ''}
                </button>
              ))}
              <button
                type="button"
                aria-pressed={showAll}
                onClick={() => {
                  // Hiding the model-only signs while one is selected would leave a clip-less target; reset it.
                  if (showAll && target && !AVATAR_VIDEOS[target]) setTarget(null);
                  setShowAll((v) => !v);
                }}
                className="rounded-full border border-dashed border-white/20 px-3 py-1.5 text-xs text-mist hover:text-cream"
              >
                {showAll
                  ? `Only signs with a clip (${CLIP_SIGNS.length})`
                  : `Show all ${DEMO_SIGNS.length} (presenter demos the rest)`}
              </button>
            </div>
            <div>
              {target ? (
                <>
                  <p className="font-bricolage text-lg font-semibold text-cream">{SIGN_LABELS[target]}</p>
                  {targetSrc ? (
                    <SignVideo key={target} src={targetSrc} label={SIGN_LABELS[target]} autoPlay dark />
                  ) : (
                    <p className="mt-1 rounded-xl border border-dashed border-white/15 px-3 py-4 text-xs text-mist">
                      No reference clip for this sign yet. The presenter should demonstrate it, not a judge.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-xs text-mist">
                  Free mode: sign any of the {DEMO_SIGNS.length} words the model knows and see what it hears.
                </p>
              )}
            </div>
          </div>
        </div>

        <div aria-live="polite" className="rounded-2xl border border-white/10 bg-black/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mist">
            {manualMode ? 'What was signed' : 'What the model saw'}</p>
          {!outcome ? (
            <p className="mt-3 text-sm text-mist">Your result appears here after you sign.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {outcome.simulated && (
                <p className="rounded-lg bg-voice/10 px-3 py-2 text-xs text-mist">
                  <strong className="text-cream">Server-free demo</strong> — you picked this sign yourself; the
                  recognition model is not running here. The sentence and voice below are real.
                </p>
              )}
              {matched !== null && (
                <p
                  className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-semibold ${
                    matched ? 'bg-mint/15 text-mint' : 'bg-red-500/15 text-red-300'
                  }`}
                >
                  {matched ? <Check size={16} /> : <X size={16} />}
                  {matched ? `Correct — that was ${SIGN_LABELS[outcome.target!]}` : `Expected ${SIGN_LABELS[outcome.target!]}`}
                </p>
              )}
              {!outcome.accepted && (
                <p className="text-sm text-saffron">
                  Not confident enough ({pct(outcome.result.confidence)}). Try again: sign slower and keep both hands
                  in view.
                </p>
              )}
              {top.length > 0 && (
                <ul className="space-y-1.5">
                  {top.map((t, i) => (
                    <li key={t.label} className="flex items-center gap-3 text-sm">
                      <span className={`w-24 truncate ${i === 0 ? 'font-semibold text-cream' : 'text-mist'}`}>
                        {labelFor(t.label)}
                      </span>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
                        <span
                          className={`block h-full rounded-full ${i === 0 ? 'bg-saffron' : 'bg-white/30'}`}
                          style={{ width: pct(Math.max(0, Math.min(1, t.confidence))) }}
                        />
                      </span>
                      <span className="w-10 text-right text-xs tabular-nums text-mist">{pct(t.confidence)}</span>
                    </li>
                  ))}
                </ul>
              )}
              {outcome.result.debug?.inferenceMs !== undefined && (
                <p className="font-mono text-[11px] text-mist/70">
                  frames={outcome.result.debug.frames} · inference={outcome.result.debug.inferenceMs}ms
                </p>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-mint/20 bg-mint/[0.06] p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-mint">Spoken sentence</p>
          <p className="mt-2 min-h-[2rem] text-lg text-cream">
            {sentence || <span className="text-sm text-mist">Signs you make are joined into a sentence and spoken aloud.</span>}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {tts.supported && (
              <button
                type="button"
                disabled={!sentence}
                onClick={() => (speaking ? tts.cancel() : tts.speak(sentence, { lang: 'en-IN' }))}
                className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-cream hover:border-mint/50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Volume2 size={16} /> {speaking ? 'Stop' : 'Speak again'}
              </button>
            )}
            <button
              type="button"
              disabled={chain.length === 0 && !outcome}
              onClick={clearAll}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-cream hover:border-saffron/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Eraser size={16} /> Clear
            </button>
          </div>
          {!tts.supported && sentence && (
            <p className="mt-2 text-xs text-saffron">This browser can’t speak aloud, but the sentence is shown above.</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ServiceBadge({
  probe,
  onRecheck,
}: {
  probe: RecognitionProbe | 'checking';
  onRecheck: () => void;
}) {
  const checking = probe === 'checking';
  const ok = !checking && probe.ok;
  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border px-4 py-2.5 text-sm ${
        checking
          ? 'border-white/10 bg-white/[0.04] text-mist'
          : ok
            ? 'border-mint/30 bg-mint/10 text-mint'
            : 'border-saffron/30 bg-saffron/10 text-saffron'
      }`}
    >
      {checking ? <Loader2 size={15} className="animate-spin" /> : ok ? <Check size={15} /> : <CircleAlert size={15} />}
      <span className="min-w-0 flex-1">
        {checking && 'Checking for the recognition model…'}
        {ok && `Real model connected · ${(probe as RecognitionProbe).classes ?? 24} signs`}
        {!checking && !ok && (
          <>
            Server-free demo: tap the sign you made. (Live recognition needs the model service at {serviceAddress()}.)
          </>
        )}
      </span>
      <button type="button" onClick={onRecheck} aria-label="Re-check service" className="text-current hover:opacity-80">
        <RefreshCw size={14} />
      </button>
    </div>
  );
}