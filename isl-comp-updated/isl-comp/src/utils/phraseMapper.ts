import type { SignId } from '../types';

// Canonical phrase -> sign sequence. Keys are already normalized (see
// normalize() below): lowercase, no punctuation, single spaces.
const PHRASE_TO_SIGNS: Record<string, SignId[]> = {
  hello: ['HELLO'],
  hi: ['HELLO'],
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
};

function normalize(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[?.!,]/g, '')
    .replace(/\s+/g, ' ');
}

export interface PhraseMapResult {
  matched: boolean;
  phrase: string;
  signs: SignId[];
}

/**
 * Maps a free-form transcript (from the Web Speech API) onto the closest
 * known phrase in PHRASE_TO_SIGNS. Tries an exact match first, then a
 * substring match against known phrases so slightly longer utterances
 * ("um, I need water please") still resolve.
 */
export function mapPhraseToSigns(rawText: string): PhraseMapResult {
  const normalized = normalize(rawText);

  if (PHRASE_TO_SIGNS[normalized]) {
    return { matched: true, phrase: normalized, signs: PHRASE_TO_SIGNS[normalized] };
  }

  const knownPhrases = Object.keys(PHRASE_TO_SIGNS).sort((a, b) => b.length - a.length);
  for (const phrase of knownPhrases) {
    if (normalized.includes(phrase)) {
      return { matched: true, phrase, signs: PHRASE_TO_SIGNS[phrase] };
    }
  }

  return { matched: false, phrase: normalized, signs: [] };
}

export const KNOWN_PHRASES = Object.keys(PHRASE_TO_SIGNS);
