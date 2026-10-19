import { ArrowRight } from 'lucide-react';
import type { SignId } from '../../types';
import { SIGN_LABELS } from '../../data/signMappings';

export function SignSequence({
  signs,
  tone = 'signal',
  activeIndex,
}: {
  signs: SignId[];
  tone?: 'signal' | 'voice';
  activeIndex?: number;
}) {
  if (signs.length === 0) return null;

  const toneClasses =
    tone === 'signal'
      ? 'bg-signal-soft border-signal/30 text-signal-deep'
      : 'bg-voice-soft border-voice/30 text-voice-deep';

  const activeToneClasses =
    tone === 'signal' ? 'bg-signal border-signal text-white' : 'bg-voice border-voice text-ink';

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {signs.map((sign, i) => (
        <div key={`${sign}-${i}`} className="flex items-center gap-1.5">
          <span
            className={`sign-chip ${
              activeIndex === i ? activeToneClasses : toneClasses
            } transition-colors duration-200`}
          >
            {SIGN_LABELS[sign] ?? sign}
          </span>
          {i < signs.length - 1 && <ArrowRight size={12} className="text-ink-soft/50" />}
        </div>
      ))}
    </div>
  );
}
