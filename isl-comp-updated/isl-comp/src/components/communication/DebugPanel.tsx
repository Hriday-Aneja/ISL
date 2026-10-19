import type { SignId } from '../../types';
import { SignSequence } from './SignSequence';

interface DebugPanelProps {
  label: string;
  detectedSigns?: SignId[];
  confidence?: number;
  recognitionState?: string;
  tone?: 'signal' | 'voice';
}

/**
 * Only rendered when Developer mode is switched on (see SettingsPanel).
 * Surfaces the intermediate pipeline data — sign tokens, mapping output,
 * model confidence — that the normal UI intentionally hides from end users.
 */
export function DebugPanel({
  label,
  detectedSigns,
  confidence,
  recognitionState,
  tone = 'signal',
}: DebugPanelProps) {
  return (
    <div className="mt-3 rounded-sm border border-dashed border-white/15 bg-white/[0.03] px-3 py-2.5">
      <p className="mb-1.5 font-mono text-[10px] uppercase tracking-wide text-room-text-soft">
        Debug — {label}
      </p>
      {detectedSigns && detectedSigns.length > 0 ? (
        <SignSequence signs={detectedSigns} tone={tone} />
      ) : (
        <p className="font-mono text-[11px] text-room-text-soft/70">no signs yet</p>
      )}
      <div className="mt-1.5 flex gap-4 font-mono text-[11px] text-room-text-soft/80">
        {recognitionState && <span>state: {recognitionState}</span>}
        {confidence !== undefined && <span>confidence: {(confidence * 100).toFixed(0)}%</span>}
      </div>
    </div>
  );
}
