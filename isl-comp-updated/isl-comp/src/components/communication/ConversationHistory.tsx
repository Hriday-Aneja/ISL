import { useEffect, useRef } from 'react';
import type { ConversationEntry } from '../../types';
import { SignSequence } from './SignSequence';

function formatTime(ts: number) {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

interface ConversationHistoryProps {
  entries: ConversationEntry[];
  liveEntry?: Pick<ConversationEntry, 'speaker' | 'speakerName' | 'text'> | null;
  debugMode?: boolean;
}

export function ConversationHistory({ entries, liveEntry, debugMode = false }: ConversationHistoryProps) {
  const listRef = useRef<HTMLDivElement | null>(null);
  const followLatestRef = useRef(true);

  useEffect(() => {
    const list = listRef.current;
    if (list && followLatestRef.current) list.scrollTop = list.scrollHeight;
  }, [entries, liveEntry]);

  return (
    <div className="flex h-full flex-col">
      <div
        ref={listRef}
        onScroll={(event) => {
          const element = event.currentTarget;
          followLatestRef.current = element.scrollHeight - element.scrollTop - element.clientHeight < 48;
        }}
        className="flex-1 space-y-4 overflow-y-auto px-4 py-4"
      >
        {entries.length === 0 && (
          <p className="text-sm text-room-text-soft">
            Turns from both sides of the conversation will be recorded here.
          </p>
        )}

        {entries.map((entry) => (
          <div key={entry.id} className="animate-fade-up">
            <div className="flex items-baseline justify-between">
              <p
                className={`text-xs font-medium uppercase tracking-wide ${
                  entry.speaker === 'isl_user' ? 'text-signal-deep' : 'text-voice-deep'
                }`}
              >
                {entry.speakerName || (entry.speaker === 'isl_user' ? 'ISL User' : 'Hearing User')}
              </p>
              <span className="text-[11px] text-room-text-soft/70">{formatTime(entry.timestamp)}</span>
            </div>
            <p className="mt-0.5 text-sm text-room-text">{entry.text}</p>
            {debugMode && entry.signs && entry.signs.length > 0 && (
              <div className="mt-1.5">
                <SignSequence
                  signs={entry.signs}
                  tone={entry.speaker === 'isl_user' ? 'signal' : 'voice'}
                />
              </div>
            )}
          </div>
        ))}

        {liveEntry && (
          <div className="border-l-2 border-voice/70 pl-3" aria-live="polite">
            <div className="flex items-baseline justify-between gap-2">
              <p className="truncate text-xs font-medium text-voice">
                {liveEntry.speakerName || (liveEntry.speaker === 'isl_user' ? 'ISL User' : 'Hearing User')}
              </p>
              <span className="shrink-0 text-[10px] text-room-text-soft/70">Live</span>
            </div>
            <p className="mt-0.5 text-sm text-room-text">{liveEntry.text}</p>
          </div>
        )}
      </div>
    </div>
  );
}
