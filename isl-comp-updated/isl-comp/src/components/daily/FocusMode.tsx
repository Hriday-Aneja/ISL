import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Square, Volume2, X } from 'lucide-react';
import { getSignById } from '../../data/islSigns';
import type { DailyMessage } from '../../lib/dailyStore';
import { Modal } from './Modal';
import { formatTime } from './MessageBubble';
import { SignVideo } from './SignVideo';

interface FocusModeProps {
  messages: DailyMessage[];
  startId: string;
  speakingId: string | null;
  ttsSupported: boolean;
  onSpeak: (message: DailyMessage) => void;
  onClose: () => void;
}

/**
 * Full-screen, very large text for holding the phone up to someone.
 * White on black for maximum contrast; Left/Right arrows move between
 * messages, Escape closes.
 */
export function FocusMode({ messages, startId, speakingId, ttsSupported, onSpeak, onClose }: FocusModeProps) {
  const [currentId, setCurrentId] = useState(startId);
  const index = useMemo(() => messages.findIndex((m) => m.id === currentId), [messages, currentId]);

  // The message can disappear (conversation cleared) — close instead of crashing.
  useEffect(() => {
    if (index === -1) onClose();
  }, [index, onClose]);

  if (index === -1) return null;
  const message = messages[index];
  const sign = message.signId ? getSignById(message.signId) : undefined;
  const me = message.sender === 'me';
  const go = (delta: number) => {
    const next = messages[index + delta];
    if (next) setCurrentId(next.id);
  };

  return (
    <Modal
      title="Focus mode"
      variant="fullscreen"
      onClose={onClose}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') go(-1);
        if (event.key === 'ArrowRight') go(1);
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className={`rounded-sm px-3 py-1 text-base font-bold uppercase tracking-wide ${me ? 'bg-signal text-[#06231d]' : 'bg-voice text-[#1A1204]'}`}>
            {me ? 'You' : 'Other person'}
          </span>
          <span className="text-base text-white/80">
            {formatTime(message.timestamp)} · {index + 1} of {messages.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-autofocus
          className="inline-flex min-h-[52px] items-center gap-2 rounded-sm border-2 border-white/60 px-4 text-lg font-bold hover:bg-white/20 hover:text-black"
        >
          <X size={22} /> Close
        </button>
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-5 overflow-y-auto px-5 py-4 text-center sm:px-10">
        <p
          aria-live="polite"
          className="max-w-5xl break-words font-display text-[clamp(2.25rem,9vw,7rem)] font-bold leading-[1.1]"
        >
          {message.text}
        </p>
        {message.textHi && (
          <p
            lang="hi"
            className="max-w-5xl break-words font-deva text-[clamp(1.75rem,6vw,4.5rem)] font-semibold leading-[1.2] opacity-90"
          >
            {message.textHi}
          </p>
        )}
        {message.source === 'sign' &&
          (sign?.videoSrc ? (
            <div className="w-full max-w-xl">
              <SignVideo src={sign.videoSrc} label={sign.label} autoPlay dark className="max-h-[38vh]" />
            </div>
          ) : (
            <p className="max-w-xl rounded-md border-2 border-dashed border-white/50 px-4 py-3 text-lg">
              No sign video is available for this sign yet — only its name is shown.
            </p>
          ))}
      </div>

      <div className="grid grid-cols-3 gap-2 border-t border-white/20 p-3 sm:gap-4 sm:p-5">
        <button
          type="button"
          onClick={() => go(-1)}
          disabled={index === 0}
          className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-md border-2 border-white/60 text-lg font-bold hover:bg-white/20 hover:text-black disabled:opacity-30"
        >
          <ChevronLeft size={26} /> <span className="hidden sm:inline">Previous</span>
        </button>
        {ttsSupported ? (
          <button
            type="button"
            onClick={() => onSpeak(message)}
            aria-pressed={speakingId === message.id}
            aria-label={speakingId === message.id ? 'Stop speaking this message' : 'Speak this message aloud'}
            className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-md bg-night-card text-lg font-bold text-black hover:bg-white/85"
          >
            {speakingId === message.id ? <Square size={22} /> : <Volume2 size={24} />}
            {speakingId === message.id ? 'Stop' : 'Speak'}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={() => go(1)}
          disabled={index === messages.length - 1}
          className="inline-flex min-h-[64px] items-center justify-center gap-2 rounded-md border-2 border-white/60 text-lg font-bold hover:bg-white/20 hover:text-black disabled:opacity-30"
        >
          <span className="hidden sm:inline">Next</span> <ChevronRight size={26} />
        </button>
      </div>
    </Modal>
  );
}
