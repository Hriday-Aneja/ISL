import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';

interface SettingsPanelProps {
  debugMode: boolean;
  onToggleDebugMode: () => void;
  displayName: string;
  onSaveDisplayName: (name: string) => void;
  onClose: () => void;
}

export function SettingsPanel({
  debugMode,
  onToggleDebugMode,
  displayName,
  onSaveDisplayName,
  onClose,
}: SettingsPanelProps) {
  const [nameDraft, setNameDraft] = useState(displayName);

  useEffect(() => setNameDraft(displayName), [displayName]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 px-4 pb-24 sm:items-start sm:justify-end sm:bg-transparent sm:pb-0 sm:pr-4 sm:pt-16"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-xs animate-fade-up rounded-sm border border-room-border bg-room-surface text-room-text shadow-stage"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Settings"
      >
        <div className="flex items-center justify-between border-b border-room-border px-4 py-3">
          <p className="text-sm font-medium text-room-text">Settings</p>
          <button onClick={onClose} className="room-icon-btn h-8 w-8" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="border-b border-room-border px-4 py-3.5">
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const cleanName = nameDraft.trim().slice(0, 40);
              if (cleanName) onSaveDisplayName(cleanName);
            }}
          >
            <label htmlFor="settings-display-name" className="mb-1.5 block text-sm font-medium text-room-text">
              Display name
            </label>
            <div className="flex gap-2">
              <input
                id="settings-display-name"
                value={nameDraft}
                maxLength={40}
                onChange={(event) => setNameDraft(event.target.value)}
                className="min-w-0 flex-1 rounded-sm border border-room-border bg-black/20 px-3 py-2 text-sm text-room-text focus:border-signal/50 focus:outline-none"
              />
              <button type="submit" disabled={!nameDraft.trim()} className="room-icon-btn h-9 w-9" aria-label="Save display name">
                <Check size={15} />
              </button>
            </div>
          </form>
        </div>

        <div className="px-4 py-3.5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-room-text">Developer mode</p>
              <p className="mt-0.5 text-xs text-room-text-soft">
                Shows raw recognition output — detected signs, mapping, and model confidence —
                for debugging. Off by default.
              </p>
            </div>
            <button
              role="switch"
              aria-checked={debugMode}
              onClick={onToggleDebugMode}
              className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${
                debugMode ? 'bg-signal' : 'bg-line'
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  debugMode ? 'translate-x-5' : 'translate-x-0.5'
                }`}
              />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
