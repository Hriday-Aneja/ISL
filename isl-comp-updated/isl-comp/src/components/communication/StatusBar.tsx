import { Radio, Video, Sparkles, MessageSquareText, Volume2, Hand } from 'lucide-react';
import type { SessionStatus } from '../../types';

const STATUS_CONFIG: Record<
  SessionStatus,
  { label: string; icon: typeof Radio; tone: 'neutral' | 'signal' | 'voice' }
> = {
  ready: { label: 'Connected', icon: Radio, tone: 'neutral' },
  camera_active: { label: 'Connected', icon: Video, tone: 'neutral' },
  recognizing_signs: { label: 'Reading signs', icon: Sparkles, tone: 'signal' },
  translation_ready: { label: 'Connected', icon: MessageSquareText, tone: 'neutral' },
  listening: { label: 'Listening', icon: Radio, tone: 'voice' },
  speaking: { label: 'Speaking', icon: Volume2, tone: 'voice' },
  avatar_signing: { label: 'Avatar signing', icon: Hand, tone: 'voice' },
};

export function StatusBar({ status }: { status: SessionStatus }) {
  const config = STATUS_CONFIG[status];
  const Icon = config.icon;

  const toneClasses =
    config.tone === 'signal'
      ? 'bg-signal/15 text-[#5EEAD4] border-signal/30'
      : config.tone === 'voice'
      ? 'bg-voice/15 text-[#F0CE8B] border-voice/30'
      : 'bg-white/[0.04] text-room-text-soft border-room-border';

  return (
    <div
      className={`inline-flex items-center gap-2 rounded-sm border px-3 py-1.5 text-xs font-medium ${toneClasses}`}
      role="status"
    >
      <Icon size={13} className={config.tone !== 'neutral' ? 'animate-pulse' : ''} />
      {config.label}
    </div>
  );
}
