import { useEffect, useState } from 'react';
import type { RefObject } from 'react';

/** True while the element is (at least partly) on screen. */
export function useInView(ref: RefObject<Element | null>, threshold = 0.2): boolean {
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return;
    }
    const io = new IntersectionObserver(([entry]) => setInView(entry.isIntersecting), { threshold });
    io.observe(el);
    return () => io.disconnect();
  }, [ref, threshold]);
  return inView;
}

/** Becomes true the first time the element scrolls into view, then stays true. */
export function useRevealOnce(ref: RefObject<Element | null>, reduced: boolean, threshold = 0.25): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced || typeof IntersectionObserver === 'undefined') {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, reduced, threshold]);
  return shown;
}

/** False while the browser tab is hidden. */
export function usePageVisible(): boolean {
  const get = () => (typeof document === 'undefined' ? true : document.visibilityState !== 'hidden');
  const [visible, setVisible] = useState(get);
  useEffect(() => {
    const on = () => setVisible(get());
    document.addEventListener('visibilitychange', on);
    return () => document.removeEventListener('visibilitychange', on);
  }, []);
  return visible;
}
