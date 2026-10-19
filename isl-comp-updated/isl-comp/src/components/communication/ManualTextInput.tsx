import { useState } from 'react';
import { X, Send } from 'lucide-react';
import { SESSION_PHRASES } from '../../data/mockData';

interface ManualTextInputProps {
  onSubmit: (text: string) => void;
  onClose: () => void;
}

/**
 * Lets the hearing user type a message instead of speaking — useful when a
 * mic isn't available or speech recognition mishears. Quick phrases are
 * included as shortcuts for common needs, feeding the exact same
 * phrase-mapping pipeline as typed or spoken text.
 */
export function ManualTextInput({ onSubmit, onClose }: ManualTextInputProps) {
  const [value, setValue] = useState('');

  const submit = (text: string) => {
    if (!text.trim()) return;
    onSubmit(text);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-40 flex items-end justify-center bg-ink/30 px-4 pb-24 sm:items-center sm:pb-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="w-full max-w-md animate-fade-up rounded-md border border-line bg-white shadow-panel"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Type a message"
      >
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-medium text-ink">Type a message</p>
          <button onClick={onClose} className="icon-btn h-8 w-8" aria-label="Close">
            <X size={15} />
          </button>
        </div>

        <div className="px-4 py-3.5">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit(value);
            }}
            className="flex gap-2"
          >
            <input
              autoFocus
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="e.g. I need water"
              className="flex-1 rounded-sm border border-line bg-paper px-3 py-2 text-sm text-ink outline-none focus-visible:border-voice"
            />
            <button type="submit" className="btn-voice px-3.5" aria-label="Send message">
              <Send size={16} />
            </button>
          </form>

          <p className="mb-2 mt-4 text-xs font-medium uppercase tracking-wide text-ink-soft">
            Quick phrases
          </p>
          <div className="flex flex-wrap gap-1.5">
            {SESSION_PHRASES.map((phrase) => (
              <button
                key={phrase}
                onClick={() => submit(phrase)}
                className="rounded-sm border border-line bg-paper px-2.5 py-1 text-xs text-ink-soft transition-colors hover:border-voice/40 hover:bg-voice-soft hover:text-voice-deep"
              >
                {phrase}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
