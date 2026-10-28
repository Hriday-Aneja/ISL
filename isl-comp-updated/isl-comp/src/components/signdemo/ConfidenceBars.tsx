import { pretty } from './lib/signs';
import type { Prediction } from './lib/types';

interface Props {
  predictions: Prediction[];
  /** 0..1 playback progress; the bars fill between ~25% and ~85% and end at the real values. */
  progress: number;
  ended: boolean;
}

const smooth = (x: number) => {
  const u = Math.min(1, Math.max(0, x));
  return u * u * (3 - 2 * u);
};

/** Top-3 confidence bars that fill progressively and finish on the model's real probabilities. */
export function ConfidenceBars({ predictions, progress, ended }: Props) {
  const top = predictions.slice(0, 3);
  const fill = ended ? 1 : smooth((progress - 0.25) / 0.6);

  return (
    <div>
      <ul className="m-0 flex list-none flex-col gap-3 p-0" aria-hidden>
        {top.map((p, i) => {
          const value = p.p * fill;
          return (
            <li key={p.label} className="grid grid-cols-[6.5rem_1fr_3rem] items-center gap-3 text-sm">
              <span className={`truncate ${i === 0 ? 'font-semibold text-[var(--sd-text)]' : 'text-[var(--sd-muted)]'}`}>
                {pretty(p.label)}
              </span>
              <span className="sd-bar-track">
                <span
                  className={`sd-bar-fill ${i === 0 ? 'is-top' : ''}`}
                  style={{ width: `${Math.max(0, Math.min(100, value * 100))}%` }}
                />
              </span>
              <span className="text-right font-mono text-xs tabular-nums text-[var(--sd-muted)]">
                {(value * 100).toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>
      {/* Screen readers get the final numbers once, not the animation. */}
      <p className="sr-only">
        {ended
          ? `Model confidence: ${top.map((p) => `${pretty(p.label)} ${(p.p * 100).toFixed(0)} percent`).join(', ')}.`
          : ''}
      </p>
    </div>
  );
}
