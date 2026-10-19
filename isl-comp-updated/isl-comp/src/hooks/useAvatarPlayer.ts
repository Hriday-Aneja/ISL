import { useCallback, useState } from 'react';
import type { SignId } from '../types';

/**
 * Owns the sign sequence currently queued for the avatar and exposes a
 * single playSigns(sequence) entry point — the integration point your
 * teammate's real 3D avatar module should be driven by. AvatarPanel is a
 * dumb display component that just renders whatever this hook gives it, so
 * swapping AvatarPanel's internals for a Three.js/GLTF renderer later
 * requires no change here or in whoever calls playSigns().
 */
export function useAvatarPlayer() {
  const [signs, setSigns] = useState<SignId[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);

  const playSigns = useCallback((sequence: SignId[]) => {
    if (sequence.length === 0) return;
    setSigns(sequence);
    setIsPlaying(true);
  }, []);

  const handlePlaybackComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return { signs, isPlaying, playSigns, handlePlaybackComplete };
}
