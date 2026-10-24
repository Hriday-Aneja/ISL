import { useCallback, useEffect, useState } from 'react';
import { fetchMissingHindi, lookupHindi } from '../services/hindi';

/**
 * Returns a lookup for Hindi text. Texts with no built-in or cached Hindi are
 * translated in the background (when `canTranslate` is true) and the component
 * re-renders as soon as they arrive.
 */
export function useHindi(texts: string[], enabled: boolean, canTranslate: boolean) {
  const [version, setVersion] = useState(0);
  const signature = texts.join('\u0001');

  useEffect(() => {
    if (!enabled || !canTranslate || texts.length === 0) return;
    const controller = new AbortController();
    void fetchMissingHindi(texts, { signal: controller.signal }).then((learned) => {
      if (learned && !controller.signal.aborted) setVersion((v) => v + 1);
    });
    return () => controller.abort();
    // `signature` is the stable identity of `texts`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, canTranslate]);

  // `version` makes consumers pick up newly cached translations.
  return useCallback((text: string) => (enabled ? lookupHindi(text) : undefined), [enabled, version]); // eslint-disable-line react-hooks/exhaustive-deps
}
