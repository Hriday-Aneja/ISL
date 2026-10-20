import type { SignId } from '../types';

const PHRASE_TO_SIGNS: Record<string, SignId[]> = {
  hello: ['HELLO'],
  hi: ['HELLO'],
  hey: ['HELLO'],
  daughter: ['DAUGHTER'],
  daughters: ['DAUGHTER'],
  doctor: ['DOCTOR'],
  doctors: ['DOCTOR'],
  happy: ['HAPPY'],
  house: ['HOUSE'],
  houses: ['HOUSE'],
  home: ['HOUSE'],
  lawyer: ['LAWYER'],
  lawyers: ['LAWYER'],
  parent: ['PARENT'],
  parents: ['PARENT'],
  sad: ['SAD'],
  student: ['STUDENT'],
  students: ['STUDENT'],
  teacher: ['TEACHER'],
  teachers: ['TEACHERS'],
  'train station': ['TRAIN_STATION'],
  'railway station': ['TRAIN_STATION'],
  waiter: ['WAITER'],
  waiters: ['WAITER'],
  'thank you': ['THANK_YOU'],
  thanks: ['THANK_YOU'],
  please: ['PLEASE'],
  sorry: ['SORRY'],
  yes: ['YES'],
  no: ['NO'],
  'i need water': ['I', 'NEED', 'WATER'],
  'i want water': ['I', 'NEED', 'WATER'],
  'please give me water': ['I', 'NEED', 'WATER'],
  'can i have water': ['I', 'NEED', 'WATER'],
  'i need food': ['I', 'NEED', 'FOOD'],
  'i want food': ['I', 'NEED', 'FOOD'],
  'i am hungry': ['I', 'NEED', 'FOOD'],
  'i need help': ['I', 'NEED', 'HELP'],
  'help me': ['HELP', 'ME'],
  'please help me': ['HELP', 'ME'],
  'call a doctor': ['DOCTOR', 'EMERGENCY'],
  'i need a doctor': ['DOCTOR', 'EMERGENCY'],
  'this is an emergency': ['EMERGENCY'],
  'where is the washroom': ['WHERE', 'WASHROOM'],
  'where is the bathroom': ['WHERE', 'WASHROOM'],
  'where is the toilet': ['WHERE', 'WASHROOM'],
  'i am in pain': ['I', 'PAIN'],
  'i am in a lot of pain': ['I', 'PAIN'],
  stop: ['STOP'],
  goodbye: ['GOODBYE'],
  bye: ['GOODBYE'],
  'how are you': ['HOW', 'YOU', 'FINE'],
  'i am fine': ['I', 'FINE'],
  "i'm fine": ['I', 'FINE'],
  'what is your name': ['YOUR', 'NAME'],
  "what's your name": ['YOUR', 'NAME'],
  water: ['WATER'],
  food: ['FOOD'],
  help: ['HELP'],
  emergency: ['EMERGENCY'],
  pain: ['PAIN'],
  washroom: ['WASHROOM'],
  name: ['NAME'],
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/train-station/g, 'train station')
    .replace(/[?.!,;:"()[\]{}]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface PhraseMapResult {
  matched: boolean;
  phrase: string;
  signs: SignId[];
}

const SORTED_PHRASE_ENTRIES: Array<{
  phrase: string;
  tokens: string[];
  signs: SignId[];
}> = Object.entries(PHRASE_TO_SIGNS)
  .map(([phrase, signs]) => ({
    phrase,
    tokens: phrase.split(' '),
    signs,
  }))
  .sort((a, b) => b.tokens.length - a.tokens.length || b.phrase.length - a.phrase.length);

export function mapPhraseToSigns(rawText: string): PhraseMapResult {
  const normalized = normalize(rawText);
  if (!normalized) {
    return { matched: false, phrase: '', signs: [] };
  }

  if (PHRASE_TO_SIGNS[normalized]) {
    return {
      matched: true,
      phrase: normalized,
      signs: [...PHRASE_TO_SIGNS[normalized]],
    };
  }

  const words = normalized.split(' ').filter(Boolean);
  const collectedSigns: SignId[] = [];
  const matchedPhrases: string[] = [];

  let i = 0;
  while (i < words.length) {
    let matchedEntry: (typeof SORTED_PHRASE_ENTRIES)[number] | null = null;

    for (const entry of SORTED_PHRASE_ENTRIES) {
      const len = entry.tokens.length;
      if (i + len > words.length) continue;

      let allMatch = true;
      for (let j = 0; j < len; j++) {
        const cleanWord = words[i + j].replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, '');
        if (cleanWord !== entry.tokens[j]) {
          allMatch = false;
          break;
        }
      }

      if (allMatch) {
        matchedEntry = entry;
        break;
      }
    }

    if (matchedEntry) {
      collectedSigns.push(...matchedEntry.signs);
      matchedPhrases.push(matchedEntry.phrase);
      i += matchedEntry.tokens.length;
    } else {
      i += 1;
    }
  }

  if (collectedSigns.length > 0) {
    return {
      matched: true,
      phrase: matchedPhrases.join(' '),
      signs: collectedSigns,
    };
  }

  return { matched: false, phrase: normalized, signs: [] };
}

export const KNOWN_PHRASES = Object.keys(PHRASE_TO_SIGNS);