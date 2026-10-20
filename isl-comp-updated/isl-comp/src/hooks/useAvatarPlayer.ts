import { useCallback, useState } from 'react';
import type { SignId } from '../types';

export function useAvatarPlayer() {
  const [signs, setSigns] = useState<SignId[]>([]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackKey, setPlaybackKey] = useState(0);

  const playSigns = useCallback((sequence: SignId[]) => {
    if (!sequence || sequence.length === 0) return;
    setSigns([...sequence]);
    setIsPlaying(true);
    setPlaybackKey((prev) => prev + 1);
  }, []);

  const handlePlaybackComplete = useCallback(() => {
    setIsPlaying(false);
  }, []);

  return { signs, isPlaying, playbackKey, playSigns, handlePlaybackComplete };
}