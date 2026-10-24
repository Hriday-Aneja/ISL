import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import { SCENARIOS } from '../../data/dailyScenarios';
import { MAX_CARD_LENGTH, cleanCardText, type CardScope } from '../../lib/dailyStore';
import { Modal } from './Modal';

interface CardEditorProps {
  mode: 'create' | 'edit';
  initialText?: string;
  initialScope: CardScope;
  /** True when a card with this text already exists in this scope. */
  isDuplicate: (text: string, scope: CardScope) => boolean;
  onSave: (text: string, scope: CardScope) => void;
  onDelete?: () => void;
  onClose: () => void;
}

export function CardEditor({
  mode,
  initialText = '',
  initialScope,
  isDuplicate,
  onSave,
  onDelete,
  onClose,
}: CardEditorProps) {
  const [text, setText] = useState(initialText);
  const [scope, setScope] = useState<CardScope>(initialScope);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [touched, setTouched] = useState(false);

  const cleaned = cleanCardText(text);
  const error = !cleaned
    ? 'Write the message first.'
    : isDuplicate(cleaned, scope)
      ? 'You already have a card with this message.'
      : '';

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setTouched(true);
    if (error) return;
    onSave(cleaned, scope);
  };

  return (
    <Modal title={mode === 'create' ? 'New card' : 'Edit card'} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4 p-5">
        <div>
          <label htmlFor="card-text" className="block text-sm font-semibold text-cream">
            Message
          </label>
          <textarea
            id="card-text"
            data-autofocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={MAX_CARD_LENGTH}
            rows={3}
            placeholder="e.g. I need to sit down."
            aria-invalid={touched && !!error}
            aria-describedby="card-text-help"
            className="mt-1.5 w-full rounded-sm border-2 border-white/15 bg-night px-3 py-2.5 text-lg text-cream outline-none focus-visible:border-signal"
          />
          <div id="card-text-help" className="mt-1 flex items-start justify-between gap-3 text-sm">
            <span role={touched && error ? 'alert' : undefined} className={touched && error ? 'font-medium text-[#ff9a90]' : 'text-mist'}>
              {touched && error ? error : 'Short and clear works best.'}
            </span>
            <span className="shrink-0 text-mist">
              {cleaned.length}/{MAX_CARD_LENGTH}
            </span>
          </div>
        </div>

        <div>
          <label htmlFor="card-scope" className="block text-sm font-semibold text-cream">
            Show this card in
          </label>
          <select
            id="card-scope"
            value={scope}
            onChange={(event) => setScope(event.target.value as CardScope)}
            className="mt-1.5 min-h-[48px] w-full rounded-sm border-2 border-white/15 bg-night-card px-3 text-base text-cream outline-none focus-visible:border-signal"
          >
            <option value="all">Every situation</option>
            {SCENARIOS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {confirmDelete ? (
          <div role="alertdialog" aria-label="Confirm delete" className="rounded-md border-2 border-alert/50 bg-alert/15 p-3.5">
            <p className="text-base font-medium text-cream">Delete this card? This cannot be undone.</p>
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={onDelete} className="btn min-h-[48px] flex-1 bg-[#b83a3a] text-white hover:bg-[#9f3030]">
                Yes, delete
              </button>
              <button type="button" onClick={() => setConfirmDelete(false)} className="btn-secondary min-h-[48px] flex-1">
                Keep it
              </button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" className="btn-primary min-h-[48px] flex-1 text-base sm:flex-none sm:px-6">
              {mode === 'create' ? 'Save card' : 'Save changes'}
            </button>
            <button type="button" onClick={onClose} className="btn-secondary min-h-[48px] px-5 text-base">
              Cancel
            </button>
            {mode === 'edit' && onDelete && (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="btn-secondary ml-auto min-h-[48px] text-[#ff9a90]"
                aria-label="Delete card"
              >
                <Trash2 size={17} /> Delete
              </button>
            )}
          </div>
        )}
      </form>
    </Modal>
  );
}
