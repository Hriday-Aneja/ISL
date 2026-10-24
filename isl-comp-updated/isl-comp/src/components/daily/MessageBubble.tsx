import { useMemo, useState } from 'react';
import { Info, Maximize2, MoreVertical, Square, Video, VideoOff, Volume2 } from 'lucide-react';
import { getSignById, signsInText, type IslSign } from '../../data/islSigns';
import type { DailyMessage, MessageSource } from '../../lib/dailyStore';
import { SignVideo } from './SignVideo';

export const SOURCE_LABEL: Record<MessageSource, string> = {
  card: 'Card',
  'custom-card': 'My card',
  suggestion: 'Suggestion',
  emergency: 'Emergency',
  sign: 'ISL sign',
  typed: 'Typed',
  speech: 'Speech',
};

export function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface MessageBubbleProps {
  message: DailyMessage;
  featured: boolean;
  largeText: boolean;
  speaking: boolean;
  ttsSupported: boolean;
  onSpeak: () => void;
  onFocus: () => void;
  onOpenSign: (sign: IslSign) => void;
}

export function MessageBubble({
  message,
  featured,
  largeText,
  speaking,
  ttsSupported,
  onSpeak,
  onFocus,
  onOpenSign,
}: MessageBubbleProps) {
  const me = message.sender === 'me';
  const [showSigns, setShowSigns] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  const sign = message.signId ? getSignById(message.signId) : undefined;
  const related = useMemo(
    () => (message.source === 'sign' ? [] : signsInText(message.text)),
    [message.source, message.text]
  );

  const textSize = featured
    ? largeText
      ? 'text-2xl'
      : 'text-xl'
    : largeText
      ? 'text-xl'
      : 'text-base';

  return (
    <article
      aria-label={`${me ? 'You' : 'Other person'} at ${formatTime(message.timestamp)}`}
      className={`flex flex-col ${me ? 'items-end' : 'items-start'}`}
    >
      <div
        className={`relative w-fit max-w-[96%] rounded-2xl border px-3 py-2 shadow-sm ${
          me
            ? 'rounded-br-md border-signal/50 bg-[#d9fdd3] text-[#17351b]'
            : 'rounded-bl-md border-white/10 bg-[#202c33] text-cream'
        } ${featured ? 'shadow-md' : ''}`}
      >
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            {!me && (
              <p className="mb-0.5 text-xs font-semibold text-[#8dd7c4]">
                Other person
              </p>
            )}
            <p className={`break-words font-body leading-snug ${textSize}`}>{message.text}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1 self-end pb-0.5">
            <span className={`text-[10px] ${me ? 'text-[#54715a]' : 'text-slate-400'}`}>
              {formatTime(message.timestamp)}
            </span>
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-label="Message options"
              aria-expanded={menuOpen}
              className={`flex h-7 w-7 items-center justify-center rounded-full ${
                me ? 'text-[#54715a] hover:bg-black/5' : 'text-slate-300 hover:bg-white/10'
              }`}
            >
              <MoreVertical size={16} />
            </button>
          </div>
        </div>

        {menuOpen && (
          <div
            role="menu"
            aria-label="Message options"
            className="absolute right-2 top-10 z-20 min-w-44 overflow-hidden rounded-lg border border-white/15 bg-night-card p-1 shadow-stage"
          >
            {ttsSupported && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  onSpeak();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-cream hover:bg-white/10"
              >
                {speaking ? <Square size={15} /> : <Volume2 size={15} />}
                {speaking ? 'Stop speaking' : 'Speak message'}
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                onFocus();
                setMenuOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-cream hover:bg-white/10"
            >
              <Maximize2 size={15} /> Full screen
            </button>
            {related.length > 0 && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setShowSigns((value) => !value);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-cream hover:bg-white/10"
              >
                <Video size={15} /> Signs in message ({related.length})
              </button>
            )}
            <p className="border-t border-white/10 px-3 py-1.5 text-[10px] uppercase tracking-wide text-mist">
              {SOURCE_LABEL[message.source]}
            </p>
          </div>
        )}

        {message.source === 'sign' && (
          <div className="mt-3">
            {sign?.videoSrc ? (
              <SignVideo src={sign.videoSrc} label={sign.label} autoPlay={featured} className="max-h-72" />
            ) : (
              <p role="status" className="flex items-start gap-2 rounded-sm border border-dashed border-ink-soft/50 bg-white/10 px-3 py-2 text-sm text-cream">
                <VideoOff size={16} className="mt-0.5 shrink-0" />
                No sign video is available for &ldquo;{message.text}&rdquo; yet &mdash; only its name is shown.
              </p>
            )}
          </div>
        )}

        {showSigns && related.length > 0 && (
          <div className="mt-2 rounded-sm border border-white/15 bg-white/10 p-2.5">
            <div className="flex flex-wrap gap-1.5">
              {related.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSign(s)}
                  className="inline-flex min-h-[40px] items-center gap-1.5 rounded-full border-2 border-white/15 bg-night-card px-3 text-sm font-semibold text-cream hover:border-signal"
                >
                  {s.label}
                  <span className={`text-xs font-semibold ${s.videoSrc ? 'text-signal-deep' : 'text-mist'}`}>
                    {s.videoSrc ? 'video' : 'no video yet'}
                  </span>
                </button>
              ))}
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-xs text-mist">
              <Info size={13} className="mt-0.5 shrink-0" />
              Word matches from the sign catalog. This is not an ISL translation of the sentence.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}
