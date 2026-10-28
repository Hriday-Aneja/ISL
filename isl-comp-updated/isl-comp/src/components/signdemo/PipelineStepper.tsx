import { Fragment, useRef } from 'react';
import { Cpu, Hand, Type, Video } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useRevealOnce } from './hooks/useViewState';

export type StageState = 'idle' | 'active' | 'done';

const STAGES: Array<{ name: string; icon: LucideIcon }> = [
  { name: 'Capture', icon: Video },
  { name: 'Landmarks', icon: Hand },
  { name: 'Model', icon: Cpu },
  { name: 'Text', icon: Type },
];

/** Progress thresholds at which Landmarks, Model and Text switch on. */
const STARTS = [0, 0.2, 0.5, 0.85];

/** Maps playback progress to the state of each pipeline stage. */
export function stageStates(
  progress: number,
  phase: 'idle' | 'playing' | 'ended',
  typed: boolean
): StageState[] {
  if (phase === 'idle') return ['idle', 'idle', 'idle', 'idle'];
  if (phase === 'ended') return ['done', 'done', 'done', typed ? 'done' : 'active'];
  return STARTS.map((start, i) => {
    const next = i < 3 ? STARTS[i + 1] : Infinity;
    if (i === 3) return 'idle'; // Text lights up only once the clip has ended
    if (progress >= next) return 'done';
    if (progress >= start) return 'active';
    return 'idle';
  });
}

interface Props {
  states: StageState[];
  /** One short line of detail under each stage name. */
  details: string[];
  reduced: boolean;
}

/** Capture -> Landmarks -> Model -> Text. Stages reveal on scroll, then light up as playback advances. */
export function PipelineStepper({ states, details, reduced }: Props) {
  const ref = useRef<HTMLOListElement>(null);
  const shown = useRevealOnce(ref, reduced, 0.4);

  return (
    <ol ref={ref} className="sd-stepper" aria-label="Sign-to-text pipeline">
      {STAGES.map((stage, i) => {
        const Icon = stage.icon;
        const state = states[i];
        const connector = state === 'done' ? 'full' : state === 'active' ? 'flow' : 'idle';
        return (
          <Fragment key={stage.name}>
            <li
              className={`sd-node ${shown ? 'is-in' : ''}`}
              data-state={state}
              aria-current={state === 'active' ? 'step' : undefined}
              style={{ transitionDelay: reduced ? '0s' : `${i * 0.14}s` }}
            >
              <span className="sd-node-icon">
                <Icon className="h-5 w-5" aria-hidden />
              </span>
              <span className="sd-node-name">{stage.name}</span>
              <span className="sd-node-detail">{details[i]}</span>
              <span className="sr-only">
                {state === 'done' ? ', complete' : state === 'active' ? ', in progress' : ', waiting'}
              </span>
            </li>
            {i < STAGES.length - 1 && (
              <li
                role="presentation"
                aria-hidden
                className={`sd-connector ${shown ? 'is-in' : ''}`}
                data-state={connector}
                style={{ transitionDelay: reduced ? '0s' : `${i * 0.14 + 0.07}s` }}
              >
                <span />
              </li>
            )}
          </Fragment>
        );
      })}
    </ol>
  );
}
