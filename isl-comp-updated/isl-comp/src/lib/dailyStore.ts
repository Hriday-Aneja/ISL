import { SCENARIOS, type ScenarioId } from '../data/dailyScenarios';

/**
 * Persistent state for the Daily Translator.
 *
 * Samvaad has no user accounts or database, so — like the display name in the
 * Communication Room — this is stored in the browser's localStorage, under one
 * versioned key. Everything is validated on load so a corrupted or
 * hand-edited value can never crash the page.
 */

export const STORAGE_KEY = 'samvaad-daily-v1';
export const MAX_MESSAGES = 200;
export const MAX_RECENTS = 12;
export const MAX_CARD_LENGTH = 200;

export type MessageSender = 'me' | 'other';
export type MessageSource =
  | 'card'
  | 'custom-card'
  | 'suggestion'
  | 'emergency'
  | 'sign'
  | 'typed'
  | 'speech';

export interface DailyMessage {
  id: string;
  sender: MessageSender;
  source: MessageSource;
  text: string;
  /** Catalog id when the message is an ISL sign. */
  signId?: string;
  timestamp: number;
}

export type CardScope = ScenarioId | 'all';

export interface CustomCard {
  id: string;
  text: string;
  scenarioId: CardScope;
  createdAt: number;
  updatedAt: number;
}

export interface SavedCard {
  key: string;
  text: string;
}

export interface RecentCard extends SavedCard {
  at: number;
}

export interface DailySettings {
  autoSpeak: boolean;
  largeText: boolean;
  highContrast: boolean;
  useConversationContext: boolean;
  emergencyCollapsed: boolean;
}

export interface DailyState {
  customCards: CustomCard[];
  favouriteCards: SavedCard[];
  favouriteSigns: string[];
  recents: RecentCard[];
  messages: DailyMessage[];
  settings: DailySettings;
}

export const DEFAULT_SETTINGS: DailySettings = {
  autoSpeak: true,
  largeText: false,
  highContrast: false,
  useConversationContext: true,
  emergencyCollapsed: false,
};

export function emptyState(): DailyState {
  return {
    customCards: [],
    favouriteCards: [],
    favouriteSigns: [],
    recents: [],
    messages: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

/** Identity of a card regardless of where it came from: its normalised text. */
export function cardKey(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function cleanCardText(text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export type DailyAction =
  | { type: 'hydrate'; state: DailyState }
  | { type: 'add-custom'; id: string; text: string; scenarioId: CardScope; now: number }
  | { type: 'update-custom'; id: string; text: string; scenarioId: CardScope; now: number }
  | { type: 'delete-custom'; id: string }
  | { type: 'toggle-fav-card'; text: string }
  | { type: 'toggle-fav-sign'; id: string }
  | { type: 'add-recent'; text: string; now: number }
  | { type: 'add-message'; message: DailyMessage }
  | { type: 'clear-messages' }
  | { type: 'set-setting'; key: keyof DailySettings; value: boolean };

export function dailyReducer(state: DailyState, action: DailyAction): DailyState {
  switch (action.type) {
    case 'hydrate':
      return action.state;

    case 'add-custom': {
      const text = cleanCardText(action.text).slice(0, MAX_CARD_LENGTH);
      if (!text) return state;
      const card: CustomCard = {
        id: action.id,
        text,
        scenarioId: action.scenarioId,
        createdAt: action.now,
        updatedAt: action.now,
      };
      return { ...state, customCards: [card, ...state.customCards] };
    }

    case 'update-custom': {
      const text = cleanCardText(action.text).slice(0, MAX_CARD_LENGTH);
      const existing = state.customCards.find((c) => c.id === action.id);
      if (!existing || !text) return state;
      const oldKey = cardKey(existing.text);
      const newKey = cardKey(text);
      return {
        ...state,
        customCards: state.customCards.map((c) =>
          c.id === action.id
            ? { ...c, text, scenarioId: action.scenarioId, updatedAt: action.now }
            : c
        ),
        // Keep the favourite attached to the edited card.
        favouriteCards:
          oldKey === newKey
            ? state.favouriteCards
            : state.favouriteCards.map((f) => (f.key === oldKey ? { key: newKey, text } : f)),
      };
    }

    case 'delete-custom': {
      const existing = state.customCards.find((c) => c.id === action.id);
      if (!existing) return state;
      const key = cardKey(existing.text);
      return {
        ...state,
        customCards: state.customCards.filter((c) => c.id !== action.id),
        favouriteCards: state.favouriteCards.filter((f) => f.key !== key),
      };
    }

    case 'toggle-fav-card': {
      const text = cleanCardText(action.text);
      const key = cardKey(text);
      if (!key) return state;
      const exists = state.favouriteCards.some((f) => f.key === key);
      return {
        ...state,
        favouriteCards: exists
          ? state.favouriteCards.filter((f) => f.key !== key)
          : [{ key, text }, ...state.favouriteCards],
      };
    }

    case 'toggle-fav-sign': {
      const exists = state.favouriteSigns.includes(action.id);
      return {
        ...state,
        favouriteSigns: exists
          ? state.favouriteSigns.filter((id) => id !== action.id)
          : [action.id, ...state.favouriteSigns],
      };
    }

    case 'add-recent': {
      const text = cleanCardText(action.text);
      const key = cardKey(text);
      if (!key) return state;
      const rest = state.recents.filter((r) => r.key !== key);
      return { ...state, recents: [{ key, text, at: action.now }, ...rest].slice(0, MAX_RECENTS) };
    }

    case 'add-message': {
      const next = [...state.messages, action.message];
      return {
        ...state,
        messages: next.length > MAX_MESSAGES ? next.slice(next.length - MAX_MESSAGES) : next,
      };
    }

    case 'clear-messages':
      return { ...state, messages: [] };

    case 'set-setting':
      return { ...state, settings: { ...state.settings, [action.key]: action.value } };

    default:
      return state;
  }
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

const SCENARIO_IDS = new Set<string>(SCENARIOS.map((s) => s.id));
const SOURCES = new Set<MessageSource>([
  'card',
  'custom-card',
  'suggestion',
  'emergency',
  'sign',
  'typed',
  'speech',
]);

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string';
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function parseCustom(v: unknown): CustomCard | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.text)) return null;
  const text = cleanCardText(v.text).slice(0, MAX_CARD_LENGTH);
  if (!text) return null;
  const scope = isStr(v.scenarioId) && (v.scenarioId === 'all' || SCENARIO_IDS.has(v.scenarioId))
    ? (v.scenarioId as CardScope)
    : 'all';
  return {
    id: v.id,
    text,
    scenarioId: scope,
    createdAt: isNum(v.createdAt) ? v.createdAt : 0,
    updatedAt: isNum(v.updatedAt) ? v.updatedAt : 0,
  };
}

function parseSaved(v: unknown): SavedCard | null {
  if (!isObj(v) || !isStr(v.text)) return null;
  const text = cleanCardText(v.text);
  const key = cardKey(text);
  return key ? { key, text } : null;
}

function parseMessage(v: unknown): DailyMessage | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.text) || !isNum(v.timestamp)) return null;
  if (v.sender !== 'me' && v.sender !== 'other') return null;
  if (!isStr(v.source) || !SOURCES.has(v.source as MessageSource)) return null;
  if (!v.text.trim()) return null;
  return {
    id: v.id,
    sender: v.sender,
    source: v.source as MessageSource,
    text: v.text,
    signId: isStr(v.signId) ? v.signId : undefined,
    timestamp: v.timestamp,
  };
}

function list<T>(value: unknown, parse: (v: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((x): x is T => x !== null);
}

export function parseState(raw: string | null): DailyState {
  if (!raw) return emptyState();
  try {
    const data: unknown = JSON.parse(raw);
    if (!isObj(data)) return emptyState();
    const settings = isObj(data.settings) ? data.settings : {};
    const pick = (k: keyof DailySettings) =>
      typeof settings[k] === 'boolean' ? (settings[k] as boolean) : DEFAULT_SETTINGS[k];
    return {
      customCards: list(data.customCards, parseCustom),
      favouriteCards: list(data.favouriteCards, parseSaved),
      favouriteSigns: Array.isArray(data.favouriteSigns) ? data.favouriteSigns.filter(isStr) : [],
      recents: list(data.recents, (v) => {
        const saved = parseSaved(v);
        return saved && isObj(v) ? { ...saved, at: isNum(v.at) ? v.at : 0 } : null;
      }).slice(0, MAX_RECENTS),
      messages: list(data.messages, parseMessage).slice(-MAX_MESSAGES),
      settings: {
        autoSpeak: pick('autoSpeak'),
        largeText: pick('largeText'),
        highContrast: pick('highContrast'),
        useConversationContext: pick('useConversationContext'),
        emergencyCollapsed: pick('emergencyCollapsed'),
      },
    };
  } catch {
    return emptyState();
  }
}

function defaultStorage(): StorageLike | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    // Accessing localStorage can itself throw (blocked cookies, private mode).
    return null;
  }
}

export function loadState(storage: StorageLike | null = defaultStorage()): {
  state: DailyState;
  persistent: boolean;
} {
  if (!storage) return { state: emptyState(), persistent: false };
  try {
    return { state: parseState(storage.getItem(STORAGE_KEY)), persistent: true };
  } catch {
    return { state: emptyState(), persistent: false };
  }
}

export function saveState(
  state: DailyState,
  storage: StorageLike | null = defaultStorage()
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export function customCardsFor(state: DailyState, scenarioId: ScenarioId): CustomCard[] {
  return state.customCards.filter((c) => c.scenarioId === scenarioId || c.scenarioId === 'all');
}

export function findDuplicateCustom(
  state: DailyState,
  text: string,
  scenarioId: CardScope,
  ignoreId?: string
): CustomCard | undefined {
  const key = cardKey(text);
  return state.customCards.find(
    (c) => c.id !== ignoreId && cardKey(c.text) === key && (c.scenarioId === scenarioId || c.scenarioId === 'all' || scenarioId === 'all')
  );
}

export function isFavouriteCard(state: DailyState, text: string): boolean {
  const key = cardKey(text);
  return state.favouriteCards.some((f) => f.key === key);
}

export function newId(prefix: string, now = Date.now()): string {
  return `${prefix}_${now.toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
