import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  STORAGE_KEY,
  dailyReducer,
  loadState,
  newId,
  parseState,
  saveState,
  type CardScope,
  type DailyMessage,
  type DailySettings,
  type DailyState,
  type MessageSender,
  type MessageSource,
} from '../lib/dailyStore';

/**
 * Daily Translator state, persisted to localStorage and kept in sync across
 * browser tabs. `persistent` is false when storage is blocked/unavailable, so
 * the UI can warn that changes won't survive a reload.
 */
export function useDailyStore() {
  // Lazy init: read storage once, not on every render.
  const [initial] = useState(() => loadState());
  const [state, dispatch] = useReducer(dailyReducer, initial.state);
  const [persistent, setPersistent] = useState(initial.persistent);
  const skipNextSave = useRef(true);

  // Save after every change (skip the initial hydrate so we never overwrite
  // stored data with the defaults before the user has done anything).
  useEffect(() => {
    if (skipNextSave.current) {
      skipNextSave.current = false;
      return;
    }
    setPersistent(saveState(state));
  }, [state]);

  // Cross-tab sync.
  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      skipNextSave.current = true;
      dispatch({ type: 'hydrate', state: parseState(event.newValue) });
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  const addCustomCard = useCallback((text: string, scenarioId: CardScope) => {
    const now = Date.now();
    dispatch({ type: 'add-custom', id: newId('card', now), text, scenarioId, now });
  }, []);

  const updateCustomCard = useCallback((id: string, text: string, scenarioId: CardScope) => {
    dispatch({ type: 'update-custom', id, text, scenarioId, now: Date.now() });
  }, []);

  const deleteCustomCard = useCallback((id: string) => dispatch({ type: 'delete-custom', id }), []);
  const toggleFavouriteCard = useCallback(
    (text: string) => dispatch({ type: 'toggle-fav-card', text }),
    []
  );
  const toggleFavouriteSign = useCallback(
    (id: string) => dispatch({ type: 'toggle-fav-sign', id }),
    []
  );
  const addRecent = useCallback(
    (text: string) => dispatch({ type: 'add-recent', text, now: Date.now() }),
    []
  );

  const addMessage = useCallback(
    (input: {
      sender: MessageSender;
      source: MessageSource;
      text: string;
      signId?: string;
    }): DailyMessage | null => {
      const text = input.text.trim();
      if (!text) return null;
      const now = Date.now();
      const message: DailyMessage = {
        id: newId('msg', now),
        sender: input.sender,
        source: input.source,
        text,
        signId: input.signId,
        timestamp: now,
      };
      dispatch({ type: 'add-message', message });
      return message;
    },
    []
  );

  const clearMessages = useCallback(() => dispatch({ type: 'clear-messages' }), []);
  const setSetting = useCallback(
    (key: keyof DailySettings, value: boolean) => dispatch({ type: 'set-setting', key, value }),
    []
  );

  return useMemo(
    () => ({
      state: state as DailyState,
      persistent,
      addCustomCard,
      updateCustomCard,
      deleteCustomCard,
      toggleFavouriteCard,
      toggleFavouriteSign,
      addRecent,
      addMessage,
      clearMessages,
      setSetting,
    }),
    [
      state,
      persistent,
      addCustomCard,
      updateCustomCard,
      deleteCustomCard,
      toggleFavouriteCard,
      toggleFavouriteSign,
      addRecent,
      addMessage,
      clearMessages,
      setSetting,
    ]
  );
}
