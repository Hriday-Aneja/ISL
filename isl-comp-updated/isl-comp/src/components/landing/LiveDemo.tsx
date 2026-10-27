import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { Languages, Mic, MicOff, Play, Search, Send, Video, Volume2 } from 'lucide-react';
import { AvatarPanel } from '../communication/AvatarPanel';
import { SignToSpeechDemo } from './SignToSpeechDemo';
import { SignVideo } from '../daily/SignVideo';
import { useAvatarPlayer } from '../../hooks/useAvatarPlayer';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { useTextToSpeech } from '../../hooks/useTextToSpeech';
import { mapPhraseToSigns } from '../../utils/phraseMapper';
import { lookupHindi } from '../../services/hindi';
import { AVATAR_VIDEOS } from '../../data/avatarVideos';
import { SIGN_LABELS } from '../../data/signMappings';
import { ISL_SIGNS, searchSigns } from '../../data/islSigns';
import type { IslSign } from '../../data/islSigns';
import type { SignId } from '../../types';

// Phrases that map to signs we ship a clip for, so every chip actually plays.
const QUICK_PHRASES = ['Hello', 'Doctor', 'Happy', 'Student', 'Train station', 'Hello doctor'];

type Tab = 'speech' | 'signer' | 'dictionary';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'speech', label: 'Speech → Sign' },
  { id: 'signer', label: 'Sign → Speech' },
  { id: 'dictionary', label: 'Sign dictionary' },
];

// Interactive landing-page demo. Every part reuses what the app already has:
// the phrase mapper, avatar player + AvatarPanel, speech-recognition and
// text-to-speech hooks, the real recognition client and the ISL catalog.
export function LiveDemo() {
  const [tab, setTab] = useState<Tab>('speech');
  const tts = useTextToSpeech();
  const speech = useSpeechRecognition('en-IN');

  const changeTab = (next: Tab) => {
    if (speech.state.status === 'listening') speech.stop();
    tts.cancel();
    setTab(next);
  };

  return (
    <div className="rounded-[28px] border border-white/10 bg-night-card p-5 sm:p-8">
      <div
        role="tablist"
        aria-label="Live demo modes"
        className="mx-auto mb-6 flex w-fit max-w-full flex-wrap justify-center gap-1.5 rounded-full border border-white/10 bg-white/5 p-1.5"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => changeTab(t.id)}
            className={`rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
              tab === t.id ? 'bg-saffron text-[#1A1204]' : 'text-mist hover:text-cream'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'speech' && <SpeechToSign tts={tts} speech={speech} />}
      {tab === 'signer' && <SignToSpeechDemo />}
      {tab === 'dictionary' && <Dictionary />}
    </div>
  );
}

type TtsApi = ReturnType<typeof useTextToSpeech>;
type SpeechApi = ReturnType<typeof useSpeechRecognition>;

/* ------------------------------------------------------------------ */
/* 1. Speech / text → sign avatar                                      */
/* ------------------------------------------------------------------ */

function SpeechToSign({ tts, speech }: { tts: TtsApi; speech: SpeechApi }) {
  const [text, setText] = useState('');
  const [message, setMessage] = useState('');
  const [phrase, setPhrase] = useState('');
  const [showHindi, setShowHindi] = useState(false);
  const { signs, isPlaying, playbackKey, playSigns, handlePlaybackComplete } = useAvatarPlayer();

  const available = useMemo(
    () => Object.keys(AVATAR_VIDEOS).map((id) => SIGN_LABELS[id as SignId] ?? id),
    []
  );

  const run = (raw: string) => {
    const result = mapPhraseToSigns(raw);
    if (!result.matched || result.signs.length === 0) {
      setPhrase('');
      setMessage(
        raw.trim()
          ? `No sign found for “${raw.trim()}”. Try: ${available.slice(0, 5).join(', ')}.`
          : 'Type a word, use the mic, or pick a phrase below.'
      );
      return;
    }
    setMessage('');
    setPhrase(raw.trim());
    playSigns(result.signs);
  };

  // Mic: take the first finished sentence, stop listening and sign it.
  const { finalTranscript } = speech.state;
  const listening = speech.state.status === 'listening';
  useEffect(() => {
    if (!listening || !finalTranscript) return;
    speech.stop();
    speech.reset();
    setText(finalTranscript);
    run(finalTranscript);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finalTranscript]);

  const toggleMic = () => {
    if (listening) {
      speech.stop();
    } else {
      setMessage('');
      speech.reset();
      speech.start();
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    run(text);
  };

  const hindi = useMemo(() => {
    if (!showHindi || !phrase) return undefined;
    const whole = lookupHindi(phrase);
    if (whole) return whole;
    const parts = signs
      .map((s) => lookupHindi(SIGN_LABELS[s] ?? String(s)))
      .filter((p): p is string => Boolean(p));
    return parts.length > 0 ? parts.join(' ') : undefined;
  }, [showHindi, phrase, signs]);

  const speaking = tts.state.status === 'speaking';

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="flex flex-col justify-center">
        <form onSubmit={onSubmit} className="flex gap-2">
          <label htmlFor="live-demo-input" className="sr-only">
            Phrase to sign
          </label>
          <input
            id="live-demo-input"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Type e.g. “hello doctor”"
            className="min-h-[48px] min-w-0 flex-1 rounded-full border border-white/15 bg-black/30 px-5 text-[15px] text-cream placeholder:text-mist/60 focus:border-saffron/60 focus:outline-none"
          />
          {speech.supported && (
            <button
              type="button"
              onClick={toggleMic}
              aria-pressed={listening}
              aria-label={listening ? 'Stop listening' : 'Speak a phrase'}
              className={`inline-flex min-h-[48px] w-12 flex-none items-center justify-center rounded-full border transition-colors ${
                listening
                  ? 'animate-pulse border-mint bg-mint/20 text-mint'
                  : 'border-white/15 bg-white/[0.06] text-cream hover:border-saffron/50'
              }`}
            >
              {listening ? <MicOff size={18} /> : <Mic size={18} />}
            </button>
          )}
          <button
            type="submit"
            className="inline-flex min-h-[48px] items-center gap-2 rounded-full bg-saffron px-5 text-[15px] font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5"
          >
            <Send size={16} /> Sign it
          </button>
        </form>

        <p role="status" aria-live="polite" className="mt-3 min-h-[1.5rem] text-sm text-saffron">
          {listening
            ? `Listening… ${speech.state.interimTranscript || 'say a word like “hello”'}`
            : speech.state.status === 'error'
              ? speech.state.errorMessage
              : message}
        </p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.14em] text-mist">
          Or try a phrase
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_PHRASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => {
                setText(p);
                run(p);
              }}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 py-2 text-sm text-cream transition-colors hover:border-saffron/50 hover:text-saffron"
            >
              <Play size={11} fill="currentColor" /> {p}
            </button>
          ))}
        </div>

        <div className="mt-6 flex flex-wrap gap-2">
          {tts.supported && (
            <button
              type="button"
              disabled={!phrase}
              onClick={() => (speaking ? tts.cancel() : tts.speak(phrase, { lang: 'en-IN' }))}
              className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-4 text-sm font-semibold text-cream transition-colors hover:border-mint/50 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <Volume2 size={16} /> {speaking ? 'Stop' : 'Speak aloud'}
            </button>
          )}
          <button
            type="button"
            aria-pressed={showHindi}
            onClick={() => setShowHindi((v) => !v)}
            className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
              showHindi
                ? 'border-saffron bg-saffron/15 text-saffron'
                : 'border-white/15 bg-white/[0.06] text-cream hover:border-saffron/50'
            }`}
          >
            <Languages size={16} /> हिन्दी
          </button>
        </div>

        {showHindi && (
          <p className="mt-3 min-h-[1.5rem] font-deva text-lg text-cream" lang="hi">
            {phrase
              ? (hindi ?? <span className="text-sm text-mist">Hindi isn’t available for this phrase yet.</span>)
              : <span className="text-sm text-mist">Sign a phrase to see its Hindi.</span>}
          </p>
        )}
      </div>

      <div key={playbackKey} className="h-[360px] overflow-hidden rounded-2xl border border-white/10">
        <AvatarPanel
          signs={signs}
          isPlaying={isPlaying}
          onPlaybackComplete={handlePlaybackComplete}
          showQueue
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* 3. Sign dictionary (ISL catalog search + real clips)                */
/* ------------------------------------------------------------------ */

const DICTIONARY_LIMIT = 18;

function Dictionary() {
  const [query, setQuery] = useState('');
  const [onlyVideo, setOnlyVideo] = useState(true);
  const [selected, setSelected] = useState<IslSign | null>(null);

  const results = useMemo(() => searchSigns({ query, onlyWithVideo: onlyVideo }), [query, onlyVideo]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search size={17} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-mist" />
          <label htmlFor="live-demo-search" className="sr-only">
            Search ISL signs
          </label>
          <input
            id="live-demo-search"
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={`Search ${ISL_SIGNS.length} ISL signs`}
            className="min-h-[48px] w-full rounded-full border border-white/15 bg-black/30 pl-11 pr-5 text-[15px] text-cream placeholder:text-mist/60 focus:border-saffron/60 focus:outline-none"
          />
        </div>
        <button
          type="button"
          aria-pressed={onlyVideo}
          onClick={() => setOnlyVideo((v) => !v)}
          className={`inline-flex min-h-[44px] items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors ${
            onlyVideo
              ? 'border-saffron bg-saffron/15 text-saffron'
              : 'border-white/15 bg-white/[0.06] text-cream hover:border-saffron/50'
          }`}
        >
          <Video size={15} /> Only signs with video
        </button>
      </div>

      <div className="mt-5 grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="text-sm text-mist" aria-live="polite">
            {results.length} sign{results.length === 1 ? '' : 's'}
            {results.length > DICTIONARY_LIMIT ? ` (showing ${DICTIONARY_LIMIT})` : ''}
          </p>
          <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {results.slice(0, DICTIONARY_LIMIT).map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSelected(s)}
                aria-pressed={selected?.id === s.id}
                className={`flex items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left transition-colors ${
                  selected?.id === s.id
                    ? 'border-saffron bg-saffron/10'
                    : 'border-white/10 bg-white/[0.04] hover:border-white/25'
                }`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] font-semibold text-cream">{s.label}</span>
                  <span className="block truncate text-xs text-mist">{s.categoryLabel}</span>
                </span>
                {s.videoSrc && <Video size={15} className="flex-none text-mint" aria-label="Has video" />}
              </button>
            ))}
            {results.length === 0 && (
              <p className="text-sm text-mist sm:col-span-2">No signs match “{query}”.</p>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
          {selected ? (
            <>
              <p className="font-bricolage text-xl font-semibold text-cream">{selected.label}</p>
              <p className="mb-3 text-xs text-mist">{selected.categoryLabel}</p>
              {selected.videoSrc ? (
                <SignVideo key={selected.id} src={selected.videoSrc} label={selected.label} autoPlay dark />
              ) : (
                <p className="rounded-xl border border-dashed border-white/15 px-4 py-6 text-center text-sm text-mist">
                  This sign is in the catalog, but no video ships with the app yet.
                </p>
              )}
            </>
          ) : (
            <p className="px-2 py-10 text-center text-sm text-mist">
              Pick a sign to watch it. Signs marked with a video icon have a real clip.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}