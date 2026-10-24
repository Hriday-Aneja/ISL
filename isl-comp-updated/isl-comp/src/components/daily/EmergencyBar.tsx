import { ChevronDown, ChevronUp, Siren } from 'lucide-react';
import { EMERGENCY_PHRASES } from '../../data/dailyScenarios';

interface EmergencyBarProps {
  collapsed: boolean;
  onToggle: () => void;
  onSend: (text: string) => void;
  hindiFor?: (text: string) => string | undefined;
}

/** Always-available emergency phrases: one tap sends (and speaks) the message. */
export function EmergencyBar({ collapsed, onToggle, onSend, hindiFor }: EmergencyBarProps) {
  return (
    <section
      aria-labelledby="emergency-heading"
      className="daily-surface rounded-md border-2 border-alert/50 bg-alert/15"
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5">
        <h2 id="emergency-heading" className="flex items-center gap-2 font-display text-base font-semibold text-cream">
          <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-[#b83a3a] text-white">
            <Siren size={15} />
          </span>
          Emergency phrases
        </h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={!collapsed}
          aria-controls="emergency-phrases"
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-sm px-2 text-sm font-medium text-mist hover:text-cream"
        >
          {collapsed ? 'Show' : 'Hide'}
          {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
        </button>
      </div>
      {!collapsed && (
        <div id="emergency-phrases" className="flex flex-wrap gap-2 px-4 pb-3.5">
          {EMERGENCY_PHRASES.map((phrase) => (
            <button
              key={phrase.id}
              type="button"
              onClick={() => onSend(phrase.text)}
              className="min-h-[48px] rounded-sm border-2 border-alert/60 bg-night-card px-3.5 py-2 text-left text-base font-semibold text-cream transition-colors hover:bg-alert hover:text-white"
            >
              {phrase.text}
              {hindiFor?.(phrase.text) && (
                <span lang="hi" className="mt-0.5 block font-deva text-sm font-semibold opacity-80">
                  {hindiFor(phrase.text)}
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
