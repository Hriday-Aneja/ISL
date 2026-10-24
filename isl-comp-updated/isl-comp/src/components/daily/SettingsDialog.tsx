import type { DailySettings } from '../../lib/dailyStore';
import { Modal } from './Modal';

interface SettingsDialogProps {
  settings: DailySettings;
  persistent: boolean;
  aiAvailable: boolean | null;
  onChange: (key: keyof DailySettings, value: boolean) => void;
  onClose: () => void;
}

function Switch({
  label,
  description,
  checked,
  onToggle,
}: {
  label: string;
  description: string;
  checked: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5">
      <div>
        <p className="text-base font-semibold text-cream">{label}</p>
        <p className="mt-0.5 text-sm text-mist">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onToggle}
        className={`relative mt-0.5 h-8 w-14 shrink-0 rounded-full border-2 transition-colors ${
          checked ? 'border-signal bg-signal' : 'border-ink-soft bg-white/[0.06]'
        }`}
      >
        <span
          aria-hidden
          className={`absolute top-0.5 h-6 w-6 rounded-full bg-night-card shadow transition-all ${checked ? 'left-[26px]' : 'left-0.5'}`}
        />
      </button>
    </div>
  );
}

export function SettingsDialog({ settings, persistent, aiAvailable, onChange, onClose }: SettingsDialogProps) {
  return (
    <Modal title="Display & voice settings" onClose={onClose}>
      <div className="divide-y divide-white/10 px-5 py-1">
        <Switch
          label="Speak my messages aloud"
          description="When you send a card or sign, it is also read out loud so the other person can hear it."
          checked={settings.autoSpeak}
          onToggle={() => onChange('autoSpeak', !settings.autoSpeak)}
        />
        <Switch
          label="Large text"
          description="Make conversation text bigger."
          checked={settings.largeText}
          onToggle={() => onChange('largeText', !settings.largeText)}
        />
        <Switch
          label="High contrast"
          description="Stronger borders and darker text."
          checked={settings.highContrast}
          onToggle={() => onChange('highContrast', !settings.highContrast)}
        />
        <Switch
          label="Use recent messages for suggestions"
          description="Lets AI suggestions take the last few messages into account. They are sent to the AI service through this app's server."
          checked={settings.useConversationContext}
          onToggle={() => onChange('useConversationContext', !settings.useConversationContext)}
        />
      </div>
      <div className="space-y-1.5 border-t border-white/15 bg-night px-5 py-3.5 text-sm text-mist">
        <p>
          Storage: {persistent ? 'cards, favourites and conversation are saved on this device.' : 'saving is not available in this browser mode, so changes will be lost when you close the page.'}
        </p>
        <p>
          AI suggestions:{' '}
          {aiAvailable === null ? 'checking…' : aiAvailable ? 'available.' : 'not set up on the server; built-in suggestions are used.'}
        </p>
      </div>
      <div className="p-4">
        <button type="button" onClick={onClose} className="btn-primary min-h-[48px] w-full text-base">
          Done
        </button>
      </div>
    </Modal>
  );
}
