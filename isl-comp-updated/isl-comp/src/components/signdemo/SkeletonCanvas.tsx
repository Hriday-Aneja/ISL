import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef } from 'react';
import { DEFAULT_STYLE, drawSkeleton } from './lib/skeleton';
import type { SkeletonStyle } from './lib/skeleton';
import type { FrameLandmarks } from './lib/types';

export interface SkeletonHandle {
  /** Draw one frame (or clear the canvas with null). Call from requestAnimationFrame. */
  draw: (frame: FrameLandmarks | null) => void;
}

interface Props {
  className?: string;
  label?: string;
  /** Override the neon style; by default colours come from the --sd-accent CSS variable. */
  style?: Partial<SkeletonStyle>;
}

/** Canvas that renders hand + upper-body landmarks with glowing neon strokes. HiDPI aware. */
export const SkeletonCanvas = forwardRef<SkeletonHandle, Props>(function SkeletonCanvas(
  { className = '', label = 'Hand and body landmarks', style },
  ref
) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sizeRef = useRef({ w: 0, h: 0 });
  const lastFrame = useRef<FrameLandmarks | null>(null);
  const styleRef = useRef<SkeletonStyle>({ ...DEFAULT_STYLE, ...style });
  const tick = useRef(0);

  const readTheme = useCallback(() => {
    const el = canvasRef.current;
    if (!el) return;
    const cs = getComputedStyle(el);
    const accent = cs.getPropertyValue('--sd-accent').trim();
    const body = cs.getPropertyValue('--sd-body').trim();
    const joint = cs.getPropertyValue('--sd-joint').trim();
    styleRef.current = {
      ...DEFAULT_STYLE,
      ...(accent ? { accent } : {}),
      ...(body ? { body } : {}),
      ...(joint ? { joint } : {}),
      ...style,
    };
  }, [style]);

  const paint = useCallback(() => {
    const el = canvasRef.current;
    const ctx = el?.getContext('2d');
    if (!el || !ctx) return;
    const { w, h } = sizeRef.current;
    if (!w || !h) return;
    // Scale line weights with the canvas so small screens don't get chunky strokes.
    const k = Math.min(1.25, Math.max(0.75, w / 560));
    const s = styleRef.current;
    drawSkeleton(ctx, lastFrame.current, w, h, {
      ...s,
      lineWidth: s.lineWidth * k,
      jointRadius: s.jointRadius * k,
      glow: s.glow * k,
    });
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      draw(frame) {
        lastFrame.current = frame;
        if (tick.current++ % 45 === 0) readTheme(); // pick up theme changes cheaply
        paint();
      },
    }),
    [paint, readTheme]
  );

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    readTheme();
    const resize = () => {
      const rect = el.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      el.width = Math.max(1, Math.round(rect.width * dpr));
      el.height = Math.max(1, Math.round(rect.height * dpr));
      el.getContext('2d')?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w: rect.width, h: rect.height };
      paint();
    };
    resize();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', resize);
      return () => window.removeEventListener('resize', resize);
    }
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [paint, readTheme]);

  return <canvas ref={canvasRef} className={`block h-full w-full ${className}`} role="img" aria-label={label} />;
});
