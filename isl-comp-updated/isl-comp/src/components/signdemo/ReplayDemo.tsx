import { useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play, RotateCcw, Repeat } from 'lucide-react';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { ClipPlayer } from './ClipPlayer';
import { ConfidenceBars } from './ConfidenceBars';
import { PipelineStepper, stageStates } from './PipelineStepper';
import { TypewriterCaption } from './TypewriterCaption';
import { useSignData } from './hooks/useSignData';
import { useInView, usePageVisible } from './hooks/useViewState';
import { FEATURED, pretty } from './lib/signs';

/** Hold time after the word has finished typing, before the next sample starts. */
const HOLD_MS = 2400;

/**
 * Demo mode 1: recorded replay. A pre-recorded clip plays beside its landmark skeleton while
 * the pipeline stages light up, the confidence bars fill, and the predicted word types out.
 * Nothing here is live recognition, and the badge says so.
 */
export function ReplayDemo() {
  const reduced = useMediaQuery('(prefers-reduced-motion: reduce)');
  const rootRef = useRef<HTMLDivElement>(null);
  const inView = useInView(rootRef, 0.25);
  const visible = usePageVisible();

  const [label, setLabel] = useState(FEATURED[0]);
  const [autoCycle, setAutoCycle] = useState(true);
  const [paused, setPaused] = useState(false);
  const [playKey, setPlayKey] = useState(0);
  const [startedByUser, setStartedByUser] = useState(false);
  const [phase, setPhase] = useState<'idle' | 'playing' | 'ended'>('idle');
  const [progress, setProgress] = useState(0);
  const [typed, setTyped] = useState(false);

  const data = useSignData(label);
  const clip = data.clip;

  // Reduced-motion visitors start playback themselves; everyone else gets autoplay.
  const active = inView && visible && !paused && (!reduced || startedByUser);

  // New clip / restart / re-entering the viewport: reset the visuals; ClipPlayer restarts itself.
  useEffect(() => {
    setProgress(0);
    setTyped(false);
    setPhase(active && clip ? 'playing' : 'idle');
  }, [active, playKey, clip]);

  // After the word has been typed, hold for a moment and then move on (unless reduced motion).
  useEffect(() => {
    if (!typed || reduced || paused) return;
    const id = setTimeout(() => {
      if (autoCycle) {
        const i = FEATURED.indexOf(label);
        setLabel(FEATURED[(i + 1) % FEATURED.length]);
      } else {
        setPlayKey((k) => k + 1);
      }
    }, HOLD_MS);
    return () => clearTimeout(id);
  }, [typed, reduced, paused, autoCycle, label]);

  const states = useMemo(() => stageStates(progress, phase, typed), [progress, phase, typed]);
  const details = clip
    ? [`${clip.fps} fps video`, `${clip.frames.length} × 225 features`, 'top-3 probabilities', 'predicted word']
    : ['', '', '', ''];

  const top = clip?.predictions[0];
  const word = top ? pretty(top.label) : '';

  const pick = (l: string) => {
    setAutoCycle(false);
    setPaused(false);
    setStartedByUser(true);
    if (l === label) setPlayKey((k) => k + 1);
    else setLabel(l);
  };

  return (
    <div ref={rootRef} className="sd-card p-5 sm:p-8">
      {/* Honest labelling: this is a recording, not live recognition. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <span className="sd-badge">
          <span className="sd-live-dot" aria-hidden style={{ animation: 'none' }} />
          {clip?.isMock ? 'Sample playback (placeholder data)' : 'Sample playback from our model'}
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="sd-btn"
            aria-pressed={autoCycle}
            onClick={() => setAutoCycle((v) => !v)}
            title="Automatically move to the next sample"
          >
            <Repeat className="h-4 w-4" aria-hidden />
            Auto-cycle
          </button>
          {!reduced && (
            <button
              type="button"
              className="sd-btn"
              aria-pressed={paused}
              onClick={() => setPaused((v) => !v)}
              aria-label={paused ? 'Resume playback' : 'Pause playback'}
            >
              {paused ? <Play className="h-4 w-4" aria-hidden /> : <Pause className="h-4 w-4" aria-hidden />}
              {paused ? 'Play' : 'Pause'}
            </button>
          )}
        </div>
      </div>

      <div role="group" aria-label="Choose a sample sign" className="mb-6 flex flex-wrap gap-2">
        {FEATURED.map((l) => (
          <button
            key={l}
            type="button"
            className="sd-chip"
            data-current={l === label}
            aria-pressed={l === label}
            onClick={() => pick(l)}
          >
            {pretty(l)}
          </button>
        ))}
      </div>

      {/* Stage: clip + skeleton */}
      <div className="relative">
        {clip ? (
          <ClipPlayer
            key={clip.sign}
            clip={clip}
            active={active}
            playKey={playKey}
            progress={progress}
            onProgress={setProgress}
            onEnded={() => setPhase('ended')}
          />
        ) : (
          <div className="grid gap-4 sm:grid-cols-2" role="status" aria-label="Loading sample">
            <div className="sd-shimmer aspect-video rounded-2xl" />
            <div className="sd-shimmer aspect-video rounded-2xl" />
          </div>
        )}
        {reduced && !startedByUser && clip && (
          <div className="absolute inset-0 z-10 grid place-items-center rounded-2xl bg-black/40">
            <button
              type="button"
              className="sd-btn sd-btn-primary"
              onClick={() => {
                setStartedByUser(true);
                setPlayKey((k) => k + 1);
              }}
            >
              <Play className="h-4 w-4" aria-hidden />
              Play sample
            </button>
          </div>
        )}
      </div>

      {data.warning && (
        <p role="status" className="mt-3 text-xs text-[var(--sd-muted)]">
          {data.warning}
        </p>
      )}

      {/* Pipeline */}
      <div className="mt-8">
        <PipelineStepper states={states} details={details} reduced={reduced} />
      </div>

      {/* Output */}
      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <div className="rounded-[18px] border border-[var(--sd-border)] bg-[var(--sd-surface-2)] p-5">
          <h3 className="mb-4 font-body text-xs font-semibold uppercase tracking-[0.14em] !text-[var(--sd-muted)]">
            Model confidence · top 3
          </h3>
          {clip ? (
            <ConfidenceBars predictions={clip.predictions} progress={progress} ended={phase === 'ended'} />
          ) : (
            <div className="sd-shimmer h-24 rounded-xl" />
          )}
        </div>
        <TypewriterCaption text={word} run={phase === 'ended' && !!word} reduced={reduced} onDone={() => setTyped(true)} />
      </div>

      {reduced && phase === 'ended' && (
        <div className="mt-5 flex justify-center">
          <button type="button" className="sd-btn" onClick={() => setPlayKey((k) => k + 1)}>
            <RotateCcw className="h-4 w-4" aria-hidden />
            Replay
          </button>
        </div>
      )}
    </div>
  );
}
