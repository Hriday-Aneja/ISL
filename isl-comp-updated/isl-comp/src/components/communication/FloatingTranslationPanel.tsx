import { useState, type ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface FloatingTranslationPanelProps {
  title: string;
  children: ReactNode;
}

/**
 * Collapsible floating shell for the role's translation panel (ISL signs or
 * hearing speech), meant to sit over the call video. Collapse state is local
 * UI state only. The children are hidden with CSS when minimized — never
 * unmounted — so a listening session or recognition in progress keeps running.
 */
export function FloatingTranslationPanel({ title, children }: FloatingTranslationPanelProps) {
  const [open, setOpen] = useState(true);

  return (
    <div className="pointer-events-auto flex w-[calc(100vw-1.5rem)] max-w-sm flex-col overflow-hidden rounded-lg border border-white/10 bg-room-bg/75 shadow-stage backdrop-blur-md sm:w-80 md:w-[22rem]">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={open ? `Minimize ${title}` : `Open ${title}`}
        title={open ? 'Minimize' : 'Open'}
        className="flex items-center justify-between gap-3 px-4 py-2.5 text-left text-sm font-medium text-room-text transition-colors hover:bg-white/[0.04]"
      >
        {title}
        {open ? (
          <ChevronDown size={16} className="text-room-text-soft" />
        ) : (
          <ChevronUp size={16} className="text-room-text-soft" />
        )}
      </button>

      <div className={open ? 'flex max-h-[42vh] min-h-0 flex-col border-t border-white/10' : 'hidden'}>
        {children}
      </div>
    </div>
  );
}
