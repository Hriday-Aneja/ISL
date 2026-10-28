import { Suspense, lazy, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Camera, Info, Loader2, X } from 'lucide-react';
import { CountUp, Reveal } from '../landing/Reveal';
import { ReplayDemo } from './ReplayDemo';
import { SentenceBuilder } from './SentenceBuilder';
import { STATS } from './config';
import './signdemo.css';

// Loaded only when the visitor opens the camera mode, so MediaPipe never touches the first load.
const LiveCameraDemo = lazy(() => import('./LiveCameraDemo'));

type Mode = 'replay' | 'builder' | 'live';

const TABS: Array<{ id: Exclude<Mode, 'live'>; label: string }> = [
  { id: 'replay', label: 'Recorded replay' },
  { id: 'builder', label: 'Sentence builder' },
];

/**
 * "See Samvaad in action": a frontend-only demo of the sign-to-text pipeline.
 * Drop <DemoSection /> into any page. Styling is scoped under .sd-root (see signdemo.css).
 */
export function DemoSection({ id = 'see-samvaad-in-action' }: { id?: string }) {
  const [mode, setMode] = useState<Mode>('replay');
  const [notice, setNotice] = useState<string | null>(null);
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const choose = (next: Mode) => {
    setNotice(null);
    setMode(next);
  };

  const onTabKey = (e: KeyboardEvent<HTMLButtonElement>, index: number) => {
    let to = -1;
    if (e.key === 'ArrowRight') to = (index + 1) % TABS.length;
    else if (e.key === 'ArrowLeft') to = (index - 1 + TABS.length) % TABS.length;
    else if (e.key === 'Home') to = 0;
    else if (e.key === 'End') to = TABS.length - 1;
    if (to >= 0) {
      e.preventDefault();
      choose(TABS[to].id);
      tabRefs.current[to]?.focus();
    }
  };

  return (
    <section id={id} className="sd-root relative mx-auto max-w-[1312px] px-6 pt-24 lg:px-16" aria-labelledby={`${id}-title`}>
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <span className="sd-badge uppercase tracking-[0.14em]">Sign → Text</span>
          <h2
            id={`${id}-title`}
            className="mt-5 font-bricolage text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.04] tracking-[-0.035em] !text-[var(--sd-text)]"
          >
            See Samvaad <span className="text-[var(--sd-accent)]">in action</span>
          </h2>
          <p className="mt-5 text-lg leading-relaxed text-[var(--sd-muted)]">
            Follow a signed word from video to landmarks to model to text. Replay a recorded sample, build a
            sentence, or try it with your own camera.
          </p>
        </div>
      </Reveal>

      {/* Stat strip */}
      <Reveal delay={0.05}>
        <dl className="mx-auto mt-8 flex max-w-xl flex-wrap items-center justify-center gap-x-3 gap-y-2 font-mono text-sm text-[var(--sd-muted)]">
          <div className="flex items-baseline gap-1.5">
            <dt className="sr-only">Signs supported</dt>
            <dd className="m-0">
              <span className="text-base font-semibold text-[var(--sd-accent)]">
                <CountUp to={STATS.signs} />
              </span>{' '}
              signs
            </dd>
          </div>
          <span aria-hidden>·</span>
          <div>
            <dt className="sr-only">Where it runs</dt>
            <dd className="m-0">on-device</dd>
          </div>
          <span aria-hidden>·</span>
          <div>
            <dt className="sr-only">Latency</dt>
            <dd className="m-0">
              <span className="text-base font-semibold text-[var(--sd-accent)]">&lt; {STATS.latencyMs}</span> ms latency
            </dd>
          </div>
        </dl>
      </Reveal>

      {/* Mode switcher */}
      <Reveal delay={0.1}>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <div role="tablist" aria-label="Demo modes" className="sd-tabs">
            {TABS.map((t, i) => (
              <button
                key={t.id}
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
                id={`${id}-tab-${t.id}`}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                aria-controls={`${id}-panel`}
                tabIndex={mode === t.id || (mode === 'live' && i === 0) ? 0 : -1}
                className="sd-tab"
                onClick={() => choose(t.id)}
                onKeyDown={(e) => onTabKey(e, i)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="sd-btn"
            aria-pressed={mode === 'live'}
            onClick={() => choose('live')}
          >
            <Camera className="h-4 w-4" aria-hidden />
            Try it with your camera (beta)
          </button>
        </div>
      </Reveal>

      {notice && (
        <div
          role="status"
          className="mx-auto mt-6 flex max-w-2xl items-start gap-3 rounded-2xl border border-[var(--sd-border)] bg-[var(--sd-surface-2)] px-4 py-3 text-sm text-[var(--sd-text)]"
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-[var(--sd-accent)]" aria-hidden />
          <p className="m-0 flex-1">{notice}</p>
          <button type="button" className="sd-icon-btn" onClick={() => setNotice(null)} aria-label="Dismiss message">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}

      <Reveal delay={0.15}>
        <div
          id={`${id}-panel`}
          role={mode === 'live' ? 'region' : 'tabpanel'}
          aria-labelledby={mode === 'live' ? undefined : `${id}-tab-${mode}`}
          aria-label={mode === 'live' ? 'Live camera demo' : undefined}
          className="mt-8"
        >
          {mode === 'replay' && <ReplayDemo />}
          {mode === 'builder' && <SentenceBuilder />}
          {mode === 'live' && (
            <Suspense
              fallback={
                <div className="sd-card grid place-items-center p-16" role="status">
                  <Loader2 className="h-6 w-6 animate-spin text-[var(--sd-accent)]" aria-hidden />
                  <span className="sr-only">Loading live camera demo</span>
                </div>
              }
            >
              <LiveCameraDemo
                onClose={() => choose('replay')}
                onFallback={(message) => {
                  setMode('replay');
                  setNotice(message);
                }}
              />
            </Suspense>
          )}
        </div>
      </Reveal>
    </section>
  );
}

export default DemoSection;
