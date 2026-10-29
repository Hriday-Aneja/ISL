import { SCENARIOS, type ScenarioId } from '../../data/dailyScenarios';
import { SCENARIO_ICONS } from './scenarioIcons';

interface ScenarioPickerProps {
  onPick: (id: ScenarioId) => void;
}

export function ScenarioPicker({ onPick }: ScenarioPickerProps) {
  return (
    <section aria-labelledby="scenario-heading">
      <h2 id="scenario-heading" className="font-display text-2xl font-semibold text-cream sm:text-3xl">
        What situation are you in?
      </h2>
      <p className="mt-1.5 text-base text-mist">
        Pick one and you will get message cards you can show or speak.
      </p>
      <div className="mt-5 grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-4">
        {SCENARIOS.map((scenario) => {
          const Icon = SCENARIO_ICONS[scenario.id];
          const urgent = scenario.id === 'emergency';
          return (
            <button
              key={scenario.id}
              type="button"
              onClick={() => onPick(scenario.id)}
              className={`daily-surface group flex min-h-[112px] flex-col items-start gap-2 rounded-md border-2 p-4 text-left transition-colors ${
                urgent
                  ? 'border-alert/50 bg-alert/15 hover:border-alert'
                  : 'border-white/15 bg-night-card hover:border-signal hover:bg-signal/10'
              }`}
            >
              <span
                className={`flex h-10 w-10 items-center justify-center rounded-sm ${
                  urgent ? 'bg-[#b83a3a] text-white' : 'bg-signal-soft text-signal-deep group-hover:bg-signal group-hover:text-[#0c1413]'
                }`}
              >
                <Icon size={20} strokeWidth={2.1} />
              </span>
              <span className="text-lg font-semibold leading-tight text-cream">{scenario.label}</span>
              <span className="text-sm text-mist">{scenario.blurb}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
