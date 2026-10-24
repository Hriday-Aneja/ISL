import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

const FOCUSABLE =
  'a[href],button:not([disabled]),textarea:not([disabled]),input:not([disabled]),select:not([disabled]),video[controls],[tabindex]:not([tabindex="-1"])';

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** "fullscreen" is used by focus mode; "dialog" is a centred card / bottom sheet. */
  variant?: 'dialog' | 'fullscreen';
  /** Hide the built-in header (the content then provides its own close button). */
  hideHeader?: boolean;
  onKeyDown?: (event: React.KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Accessible modal: role="dialog", Escape closes, Tab is trapped inside,
 * focus moves in on open and returns to the opener on close, and the page
 * behind does not scroll.
 */
export function Modal({
  title,
  onClose,
  children,
  variant = 'dialog',
  hideHeader = false,
  onKeyDown,
}: ModalProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const el = ref.current;
    if (!el) return;
    const first = el.querySelector<HTMLElement>('[data-autofocus]') ?? el.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? el).focus();

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab' || !el) return;
      const nodes = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) {
        event.preventDefault();
        el.focus();
        return;
      }
      const firstNode = nodes[0];
      const lastNode = nodes[nodes.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === firstNode || active === el)) {
        event.preventDefault();
        lastNode.focus();
      } else if (!event.shiftKey && active === lastNode) {
        event.preventDefault();
        firstNode.focus();
      }
    }
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      previous?.focus?.();
    };
  }, []);

  if (variant === 'fullscreen') {
    return (
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="fixed inset-0 z-50 flex flex-col bg-black text-white outline-none"
      >
        {children}
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        onKeyDown={onKeyDown}
        className="daily-surface flex max-h-[92vh] w-full max-w-lg animate-fade-up flex-col overflow-hidden rounded-t-lg border border-white/15 bg-night-card shadow-stage outline-none sm:rounded-lg"
      >
        {!hideHeader && (
          <div className="flex items-center justify-between border-b border-white/15 px-5 py-3.5">
            <h2 className="font-display text-lg font-semibold text-cream">{title}</h2>
            <button type="button" onClick={onClose} className="icon-btn" aria-label="Close">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
