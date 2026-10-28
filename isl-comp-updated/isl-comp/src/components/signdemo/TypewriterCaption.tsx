import { useEffect, useState } from 'react';

interface Props {
  /** The word to type out. */
  text: string;
  /** Start typing when this becomes true; reset when it goes false. */
  run: boolean;
  reduced: boolean;
  onDone?: () => void;
}

/**
 * Large caption box. The word types out letter by letter once the clip ends. Screen readers
 * hear the finished word once (via the polite live region), not each keystroke.
 */
export function TypewriterCaption({ text, run, reduced, onDone }: Props) {
  const [count, setCount] = useState(0);
  const done = run && count >= text.length;

  useEffect(() => {
    if (!run) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(text.length);
      return;
    }
    setCount(0);
    let i = 0;
    const id = setInterval(() => {
      i += 1;
      setCount(i);
      if (i >= text.length) clearInterval(id);
    }, 85);
    return () => clearInterval(id);
  }, [run, text, reduced]);

  useEffect(() => {
    if (done) onDone?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  return (
    <div className="sd-caption" data-done={done ? 'true' : 'false'}>
      <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--sd-muted)]">
        Predicted word
      </span>
      <p className="m-0 min-h-[1.2em] font-display text-4xl font-bold leading-tight tracking-tight sm:text-5xl" aria-hidden>
        {run ? (
          <>
            <span className="text-[var(--sd-text)]">{text.slice(0, count)}</span>
            <span className="sd-caret" />
          </>
        ) : (
          <span className="text-[var(--sd-muted)] opacity-60">
            ···
            <span className="sd-caret" />
          </span>
        )}
      </p>
      <p className="sr-only" aria-live="polite" aria-atomic="true">
        {done ? `Predicted word: ${text}` : ''}
      </p>
    </div>
  );
}
