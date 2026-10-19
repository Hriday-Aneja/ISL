import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import { ConversationHistory } from './ConversationHistory';
import type { ConversationEntry } from '../../types';

interface TranscriptDrawerProps {
  entries: ConversationEntry[];
  liveEntry?: Pick<ConversationEntry, 'speaker' | 'speakerName' | 'text'> | null;
  isOpen: boolean;
  onClose: () => void;
  debugMode?: boolean;
  activeTab: 'transcript' | 'tools';
  onChangeTab: (tab: 'transcript' | 'tools') => void;
  toolsContent: ReactNode;
}

/**
 * Responsive room sidebar: docked beside the stage on desktop and shown as
 * a drawer on smaller screens. Tool content stays mounted while switching tabs.
 */
export function TranscriptDrawer({
  entries,
  liveEntry,
  isOpen,
  onClose,
  debugMode = false,
  activeTab,
  onChangeTab,
  toolsContent,
}: TranscriptDrawerProps) {
  return (
    <div
      className={isOpen ? 'absolute inset-0 z-30 flex justify-end bg-black/45 md:static md:z-auto md:bg-transparent' : 'hidden'}
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex h-full w-[min(92vw,24rem)] flex-col border-l border-room-border bg-room-surface shadow-stage md:w-[22rem] md:shrink-0"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="Live transcript and ISL tools"
      >
        <div className="flex items-center justify-between border-b border-room-border px-4 py-3">
          <p className="text-sm font-medium text-room-text">Conversation</p>
          <button onClick={onClose} className="room-icon-btn h-8 w-8 md:hidden" aria-label="Close sidebar">
            <X size={15} />
          </button>
        </div>
        <div className="grid grid-cols-2 border-b border-room-border px-3 pt-2">
          <button
            type="button"
            onClick={() => onChangeTab('transcript')}
            aria-pressed={activeTab === 'transcript'}
            className={`border-b-2 px-2 py-2 text-xs font-medium ${activeTab === 'transcript' ? 'border-signal text-room-text' : 'border-transparent text-room-text-soft hover:text-room-text'}`}
          >
            Live transcript
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('tools')}
            aria-pressed={activeTab === 'tools'}
            className={`border-b-2 px-2 py-2 text-xs font-medium ${activeTab === 'tools' ? 'border-signal text-room-text' : 'border-transparent text-room-text-soft hover:text-room-text'}`}
          >
            ISL tools
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden">
          <div className={activeTab === 'transcript' ? 'h-full' : 'hidden'}>
            <ConversationHistory entries={entries} liveEntry={liveEntry} debugMode={debugMode} />
          </div>
          <div className={activeTab === 'tools' ? 'flex h-full min-h-0 flex-col overflow-y-auto' : 'hidden'}>
            {toolsContent}
          </div>
        </div>
      </div>
    </div>
  );
}
