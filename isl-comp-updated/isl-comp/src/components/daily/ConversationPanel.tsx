import { useEffect, useRef, useState } from 'react';
import { ALargeSmall, Maximize2, MessageSquareText, Trash2, X } from 'lucide-react';
import type { IslSign } from '../../data/islSigns';
import type { DailyMessage, MessageSender, MessageSource } from '../../lib/dailyStore';
import { Composer } from './Composer';
import { MessageBubble } from './MessageBubble';

interface ConversationPanelProps {
  messages: DailyMessage[];
  largeText: boolean;
  speakingId: string | null;
  ttsSupported: boolean;
  onSpeak: (message: DailyMessage) => void;
  onFocus: (id: string) => void;
  onOpenSign: (sign: IslSign) => void;
  onSend: (text: string, sender: MessageSender, source: MessageSource) => void;
  onClear: () => void;
  onToggleLargeText: () => void;
  onDropCard: (text: string, source: MessageSource) => void;
  /** Present on small screens, where the panel is a full-screen sheet. */
  onCloseSheet?: () => void;
}

/**
 * The shared conversation: cards, signs, typed text and speech all land here,
 * with the newest message shown biggest so it can be held up and read.
 */
export function ConversationPanel({
  messages,
  largeText,
  speakingId,
  ttsSupported,
  onSpeak,
  onFocus,
  onOpenSign,
  onSend,
  onClear,
  onToggleLargeText,
  onDropCard,
  onCloseSheet,
}: ConversationPanelProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const lastId = messages.length ? messages[messages.length - 1].id : null;

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [lastId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-white/10 bg-[#202c33] px-3.5 py-2.5">
        <h2 className="flex items-center gap-2 font-display text-lg font-semibold text-cream">
          <MessageSquareText size={19} /> Conversation
        </h2>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleLargeText}
            aria-pressed={largeText}
            aria-label="Large text"
            title="Large text"
            className={largeText ? 'icon-btn-active' : 'icon-btn'}
          >
            <ALargeSmall size={20} />
          </button>
          <button
            type="button"
            onClick={() => lastId && onFocus(lastId)}
            disabled={!lastId}
            aria-label="Full screen focus mode"
            title="Full screen focus mode"
            className="icon-btn disabled:opacity-40"
          >
            <Maximize2 size={18} />
          </button>
          <button
            type="button"
            onClick={() => setConfirmClear(true)}
            disabled={messages.length === 0}
            aria-label="Clear conversation"
            title="Clear conversation"
            className="icon-btn disabled:opacity-40"
          >
            <Trash2 size={18} />
          </button>
          {onCloseSheet && (
            <button type="button" onClick={onCloseSheet} aria-label="Close conversation" className="icon-btn lg:hidden">
              <X size={19} />
            </button>
          )}
        </div>
      </div>

      {confirmClear && (
        <div role="alertdialog" aria-label="Confirm clear conversation" className="border-b border-alert/40 bg-alert/15 px-3.5 py-3">
          <p className="text-sm font-medium text-cream">Clear the whole conversation on this device?</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => {
                onClear();
                setConfirmClear(false);
              }}
              className="btn min-h-[44px] flex-1 bg-[#b83a3a] text-white hover:bg-[#9f3030]"
            >
              Yes, clear
            </button>
            <button type="button" onClick={() => setConfirmClear(false)} className="btn-secondary min-h-[44px] flex-1">
              Keep
            </button>
          </div>
        </div>
      )}

      <div
        ref={listRef}
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes('application/x-samvaad-card')) {
            event.preventDefault();
            event.dataTransfer.dropEffect = 'copy';
            setDragActive(true);
          }
        }}
        onDragLeave={(event) => {
          if (event.currentTarget === event.target) setDragActive(false);
        }}
        onDrop={(event) => {
          event.preventDefault();
          setDragActive(false);
          const raw = event.dataTransfer.getData('application/x-samvaad-card');
          if (!raw) return;
          try {
            const value = JSON.parse(raw) as { text?: unknown; source?: MessageSource };
            if (typeof value.text === 'string' && value.text.trim()) {
              onDropCard(value.text, value.source ?? 'card');
            }
          } catch {
            const text = event.dataTransfer.getData('text/plain').trim();
            if (text) onDropCard(text, 'card');
          }
        }}
        role="log"
        aria-live="polite"
        aria-label="Conversation messages"
        className={`relative min-h-0 flex-1 space-y-2 overflow-y-auto bg-[#0b141a] px-3 py-2.5 ${
          dragActive ? 'ring-2 ring-inset ring-signal' : ''
        }`}
      >
        {dragActive && (
          <div className="pointer-events-none sticky top-2 z-10 rounded-md border-2 border-dashed border-signal bg-signal/15 px-3 py-2 text-center text-sm font-semibold text-cream">
            Drop card here to add it to the conversation
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-4 py-10 text-center">
            <MessageSquareText size={34} className="text-mist" />
            <p className="mt-3 text-lg font-semibold text-cream">No messages yet</p>
            <p className="mt-1 max-w-xs text-base text-mist">
              Choose a card or an ISL sign, or let the other person speak or type below.
            </p>
          </div>
        ) : (
          messages.map((message, index) => (
            <MessageBubble
              key={message.id}
              message={message}
              featured={index === messages.length - 1}
              largeText={largeText}
              speaking={speakingId === message.id}
              ttsSupported={ttsSupported}
              onSpeak={() => onSpeak(message)}
              onFocus={() => onFocus(message.id)}
              onOpenSign={onOpenSign}
            />
          ))
        )}
      </div>

      {!ttsSupported && (
        <p className="border-t border-white/15 bg-voice-soft px-3.5 py-2 text-xs text-cream">
          Reading messages aloud is not supported in this browser, so the Speak buttons are hidden.
        </p>
      )}

      <Composer onSend={onSend} />
    </div>
  );
}
