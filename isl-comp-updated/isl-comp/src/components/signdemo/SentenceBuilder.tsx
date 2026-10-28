import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Square, Trash2, Volume2, X } from 'lucide-react';
import { ClipPlayer } from './ClipPlayer';
import { useSignData } from './hooks/useSignData';
import { useInView, usePageVisible } from './hooks/useViewState';
import { useVoices } from './hooks/useVoices';
import { glossToSentence } from './lib/glossToEnglish';
import { SIGN_LABELS, pretty } from './lib/signs';
import { speak, stopSpeaking } from './lib/speech';
import type { SpeakLang } from './lib/speech';

const MAX_SIGNS = 12;

interface TrayItem {
  id: number;
  label: string;
}

/**
 * Demo mode 2: sentence builder. Tap signs to preview each clip and add it to the tray;
 * reorder or remove them; rule-based mapping turns the gloss sequence into a natural sentence,
 * which can be read aloud in English or Hindi.
 */
export function SentenceBuilder() {
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, 0.1);
  const visible = usePageVisible();
  const voices = useVoices();

  const [tray, setTray] = useState<TrayItem[]>([]);
  const nextId = useRef(1);
  const [current, setCurrent] = useState<string | null>(null);
  const [playKey, setPlayKey] = useState(0);
  const [progress, setProgress] = useState(0);
  const [lang, setLang] = useState<SpeakLang>('en');
  const [speaking, setSpeaking] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overId, setOverId] = useState<number | null>(null);

  const data = useSignData(current);
  const translation = useMemo(() => glossToSentence(tray.map((t) => t.label)), [tray]);
  const sentence = lang === 'hi' ? translation.hi : translation.en;
  const other = lang === 'hi' ? translation.en : translation.hi;

  useEffect(() => () => stopSpeaking(), []);

  const preview = (label: string) => {
    setCurrent(label);
    setPlayKey((k) => k + 1);
    setProgress(0);
  };

  const add = (label: string) => {
    if (tray.length >= MAX_SIGNS) {
      setNotice(`A sentence can hold up to ${MAX_SIGNS} signs. Remove one to add another.`);
      return;
    }
    setNotice(null);
    setTray((t) => [...t, { id: nextId.current++, label }]);
    preview(label);
  };

  const remove = (id: number) => setTray((t) => t.filter((x) => x.id !== id));

  const shift = (index: number, by: -1 | 1) =>
    setTray((t) => {
      const to = index + by;
      if (to < 0 || to >= t.length) return t;
      const next = t.slice();
      [next[index], next[to]] = [next[to], next[index]];
      return next;
    });

  const dropOn = (targetId: number) => {
    if (dragId === null || dragId === targetId) return;
    setTray((t) => {
      const from = t.findIndex((x) => x.id === dragId);
      const to = t.findIndex((x) => x.id === targetId);
      if (from < 0 || to < 0) return t;
      const next = t.slice();
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
  };

  const onSpeak = async (language: SpeakLang = lang) => {
    if (!sentence) return;
    setNotice(null);
    const text = language === 'hi' ? translation.hi : translation.en;
    setSpeaking(true);
    const res = await speak(text, language, () => setSpeaking(false));
    if (!res.ok) {
      setSpeaking(false);
      setNotice(
        res.reason === 'no-voice'
          ? 'No Hindi voice is installed on this device, so the Hindi text can only be read, not spoken.'
          : res.reason === 'unsupported'
            ? 'Speech is not supported in this browser.'
            : 'Something went wrong while speaking. Please try again.'
      );
    }
  };

  const onStop = () => {
    stopSpeaking();
    setSpeaking(false);
  };

  const hindiMissing = lang === 'hi' && voices.hasHindi === false;

  return (
    <div ref={rootRef} className="sd-card p-5 sm:p-8">
      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
        {/* Preview, tray and output */}
        <div className="flex flex-col gap-6 lg:order-2">
          <div>
            {data.clip ? (
              <ClipPlayer
                key={data.clip.sign}
                clip={data.clip}
                compact
                active={inView && visible}
                playKey={playKey}
                progress={progress}
                onProgress={setProgress}
              />
            ) : (
              <div
                className="grid aspect-[32/9] place-items-center rounded-2xl border border-dashed border-[var(--sd-border)] px-4 text-center text-sm text-[var(--sd-muted)]"
                role="status"
              >
                {current ? 'Loading sample…' : 'Pick a sign to watch its clip and landmarks.'}
              </div>
            )}
            <p className="mt-2 flex items-center justify-between gap-3 text-xs text-[var(--sd-muted)]">
              <span>{current ? `Now showing: ${pretty(current)}` : 'Recorded samples'}</span>
              {data.clip?.isMock && <span>placeholder landmarks</span>}
            </p>
          </div>

          {/* Tray */}
          <div>
            <h3 className="mb-3 font-body text-xs font-semibold uppercase tracking-[0.14em] !text-[var(--sd-muted)]">
              Your signs
            </h3>
            {tray.length === 0 ? (
              <p className="m-0 rounded-xl border border-dashed border-[var(--sd-border)] px-4 py-5 text-sm text-[var(--sd-muted)]">
                Tap a sign to add it here. Drag to reorder, or use the arrows.
              </p>
            ) : (
              <ul className="m-0 flex list-none flex-wrap gap-2 p-0" aria-label="Signs in your sentence">
                {tray.map((item, i) => (
                  <li
                    key={item.id}
                    className="sd-tray-item"
                    draggable
                    data-dragging={dragId === item.id}
                    data-over={overId === item.id && dragId !== item.id}
                    onDragStart={(e) => {
                      setDragId(item.id);
                      e.dataTransfer.effectAllowed = 'move';
                      e.dataTransfer.setData('text/plain', String(item.id));
                    }}
                    onDragOver={(e) => {
                      e.preventDefault();
                      if (overId !== item.id) setOverId(item.id);
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      dropOn(item.id);
                      setDragId(null);
                      setOverId(null);
                    }}
                    onDragEnd={() => {
                      setDragId(null);
                      setOverId(null);
                    }}
                  >
                    <button
                      type="button"
                      className="cursor-pointer border-0 bg-transparent p-0 pr-1 font-semibold text-inherit"
                      onClick={() => preview(item.label)}
                      aria-label={`Replay ${pretty(item.label)}, position ${i + 1} of ${tray.length}`}
                    >
                      {pretty(item.label)}
                    </button>
                    <button
                      type="button"
                      className="sd-icon-btn"
                      disabled={i === 0}
                      onClick={() => shift(i, -1)}
                      aria-label={`Move ${pretty(item.label)} earlier`}
                    >
                      <ChevronLeft className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="sd-icon-btn"
                      disabled={i === tray.length - 1}
                      onClick={() => shift(i, 1)}
                      aria-label={`Move ${pretty(item.label)} later`}
                    >
                      <ChevronRight className="h-4 w-4" aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="sd-icon-btn"
                      onClick={() => remove(item.id)}
                      aria-label={`Remove ${pretty(item.label)}`}
                    >
                      <X className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Output */}
          <div className="sd-caption" data-done={sentence ? 'true' : 'false'}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sd-muted)]">
                Sentence
              </span>
              <div role="radiogroup" aria-label="Language" className="sd-tabs !p-1">
                {(
                  [
                    ['en', 'English'],
                    ['hi', 'हिन्दी'],
                  ] as const
                ).map(([code, name]) => (
                  <button
                    key={code}
                    type="button"
                    role="radio"
                    aria-checked={lang === code}
                    className="sd-tab !min-h-[32px] !px-3 !text-[13px]"
                    onClick={() => {
                      setLang(code);
                      setNotice(null);
                    }}
                    lang={code}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>

            <p
              className={`m-0 min-h-[1.4em] text-2xl font-semibold leading-snug sm:text-3xl ${lang === 'hi' ? 'font-deva' : 'font-display'}`}
              lang={lang}
              aria-live="polite"
              aria-atomic="true"
            >
              {sentence || <span className="text-[var(--sd-muted)] opacity-60">Your sentence appears here</span>}
            </p>
            {other && (
              <p
                className={`m-0 text-sm text-[var(--sd-muted)] ${lang === 'hi' ? '' : 'font-deva'}`}
                lang={lang === 'hi' ? 'en' : 'hi'}
              >
                {other}
              </p>
            )}

            <div className="mt-1 flex flex-wrap items-center gap-2">
              {speaking ? (
                <button type="button" className="sd-btn sd-btn-primary" onClick={onStop}>
                  <Square className="h-4 w-4" aria-hidden />
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="sd-btn sd-btn-primary"
                  disabled={!sentence}
                  onClick={() => onSpeak()}
                >
                  <Volume2 className="h-4 w-4" aria-hidden />
                  Speak
                </button>
              )}
              <button
                type="button"
                className="sd-btn"
                disabled={tray.length === 0}
                onClick={() => {
                  setTray([]);
                  setNotice(null);
                  onStop();
                }}
              >
                <Trash2 className="h-4 w-4" aria-hidden />
                Clear
              </button>
            </div>

            {(hindiMissing || notice) && (
              <p role="status" className="m-0 text-sm text-[var(--sd-muted)]">
                {notice ??
                  'No Hindi voice was found on this device, so Hindi can be read here but not spoken.'}{' '}
                {(hindiMissing || notice?.includes('Hindi')) && (
                  <button
                    type="button"
                    className="cursor-pointer border-0 bg-transparent p-0 font-semibold text-[var(--sd-accent)] underline underline-offset-2"
                    onClick={() => {
                      setLang('en');
                      setNotice(null);
                    }}
                  >
                    Switch to English
                  </button>
                )}
              </p>
            )}
          </div>
        </div>

        {/* Sign chips */}
        <div className="lg:order-1">
          <h3 className="mb-3 font-body text-xs font-semibold uppercase tracking-[0.14em] !text-[var(--sd-muted)]">
            Tap a sign · {SIGN_LABELS.length} signs
          </h3>
          <ul className="m-0 grid list-none grid-cols-2 gap-2 p-0 sm:grid-cols-3">
            {SIGN_LABELS.map((label) => (
              <li key={label} className="contents">
                <button
                  type="button"
                  className="sd-chip"
                  data-current={label === current}
                  onClick={() => add(label)}
                  aria-label={`Add ${pretty(label)}`}
                >
                  {pretty(label)}
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
