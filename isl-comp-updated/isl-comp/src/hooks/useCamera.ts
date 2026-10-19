import { useCallback, useEffect, useRef, useState } from 'react';
import type { CameraState } from '../types';

export function useCamera() {
  const [state, setState] = useState<CameraState>({ status: 'idle', stream: null });
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const start = useCallback(async () => {
    setState((s) => ({ ...s, status: 'requesting', errorMessage: undefined }));
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      setState({ status: 'active', stream });
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Camera access was denied. Allow camera permission in your browser to continue.'
          : err instanceof DOMException && err.name === 'NotFoundError'
          ? 'No camera was found on this device.'
          : 'Could not start the camera. Check that no other app is using it.';
      setState({ status: 'error', stream: null, errorMessage: message });
    }
  }, []);

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setState({ status: 'stopped', stream: null });
  }, []);

  // The <video> element stays permanently mounted (see CameraPanel), so by
  // the time `state.stream` changes, videoRef.current is guaranteed to
  // exist. This effect is what actually attaches the live stream to the
  // element — doing the assignment inline inside start() was the bug,
  // since the element wasn't mounted yet (status was still 'requesting')
  // at that point in the render cycle.
  useEffect(() => {
    if (state.stream && videoRef.current) {
      videoRef.current.srcObject = state.stream;
      videoRef.current.play().catch(() => {
        /* autoplay can be blocked; user can press play via controls */
      });
    }
  }, [state.stream]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  return { state, videoRef, start, stop };
}
