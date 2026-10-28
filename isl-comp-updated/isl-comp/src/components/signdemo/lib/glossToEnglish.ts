// Rule-based gloss -> sentence mapper for the sentence builder.
//
// ISL is not English word-for-word, so a sequence of signs ("I", "Teacher") becomes a natural
// sentence ("I am a teacher.") through small pattern rules. Every rule produces English and
// Hindi together so the Speak button can use either language.
//
// How matching works: the sequence is split greedily, longest pattern first. Whatever no rule
// covers falls back to a plain join of the words, so nothing is ever dropped.
//
// A pattern slot is either a category (UPPERCASE: PRON, PROF, FAMILY, ADJ, PLACE, ANIMAL,
// GREET, THANKS) or one literal sign label (lowercase: 'hello', 'you'). Use an array for "any of".

import { findSign, pretty } from './signs';
import type { SignDef } from './signs';

export interface Translation {
  en: string;
  hi: string;
}

type Slot = string | string[];

interface Rule {
  name: string;
  pattern: Slot[];
  render: (t: SignDef[]) => Translation;
}

// ---------- helpers ----------
const lower = (s: SignDef) => s.label.toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const sentence = (en: string, hi: string): Translation => ({ en, hi });

interface Person {
  en: string;
  be: string;
  have: string;
  hi: string;
  hiBe: string;
  hiHave: string;
}
const PERSON: Record<string, Person> = {
  i: { en: 'I', be: 'am', have: 'have', hi: 'मैं', hiBe: 'हूँ', hiHave: 'मेरे पास' },
  you: { en: 'You', be: 'are', have: 'have', hi: 'आप', hiBe: 'हैं', hiHave: 'आपके पास' },
  he: { en: 'He', be: 'is', have: 'has', hi: 'वह', hiBe: 'है', hiHave: 'उसके पास' },
  she: { en: 'She', be: 'is', have: 'has', hi: 'वह', hiBe: 'है', hiHave: 'उसके पास' },
};
const person = (s: SignDef): Person => PERSON[lower(s)];

// Hindi agreement for family words: possessive and the (respectful) verb.
const HI_FAMILY: Record<string, { poss: string; be: string }> = {
  mother: { poss: 'मेरी', be: 'हैं' },
  father: { poss: 'मेरे', be: 'हैं' },
  parent: { poss: 'मेरे', be: 'हैं' },
  daughter: { poss: 'मेरी', be: 'है' },
  son: { poss: 'मेरा', be: 'है' },
};
const hiFamily = (s: SignDef) => HI_FAMILY[lower(s)] ?? { poss: 'मेरा', be: 'है' };

// ---------- rules ----------
// Longest patterns are tried first (see sort below). Add your own by appending to RULES.
export const RULES: Rule[] = [
  {
    name: 'greeting + you',
    pattern: ['hello', 'you'],
    render: () => sentence('Hello, how are you?', 'नमस्ते, आप कैसे हैं?'),
  },
  {
    name: 'greeting + person (vocative)',
    pattern: ['GREET', ['PROF', 'FAMILY']],
    render: ([, b]) => sentence(`Hello, ${lower(b)}!`, `नमस्ते, ${b.hi}!`),
  },
  {
    name: 'thanks + person (vocative)',
    pattern: ['THANKS', ['PROF', 'FAMILY']],
    render: ([, b]) => sentence(`Thank you, ${lower(b)}.`, `धन्यवाद, ${b.hi}।`),
  },
  {
    name: 'pronoun + profession',
    pattern: ['PRON', 'PROF'],
    render: ([a, b]) => {
      const p = person(a);
      return sentence(`${p.en} ${p.be} ${article(lower(b))} ${lower(b)}.`, `${p.hi} ${b.hi} ${p.hiBe}।`);
    },
  },
  {
    name: 'pronoun + adjective',
    pattern: ['PRON', 'ADJ'],
    render: ([a, b]) => {
      const p = person(a);
      return sentence(`${p.en} ${p.be} ${lower(b)}.`, `${p.hi} ${b.hi} ${p.hiBe}।`);
    },
  },
  {
    name: 'I + family',
    pattern: ['i', 'FAMILY'],
    render: ([, b]) => sentence(`I am ${article(lower(b))} ${lower(b)}.`, `मैं ${b.hi} हूँ।`),
  },
  {
    name: 'he/she/you + family',
    pattern: [['he', 'she', 'you'], 'FAMILY'],
    render: ([a, b]) => {
      const p = person(a);
      return sentence(`${p.en} ${p.be} my ${lower(b)}.`, `${p.hi} ${hiFamily(b).poss} ${b.hi} ${p.hiBe}।`);
    },
  },
  {
    name: 'pronoun + place',
    pattern: ['PRON', 'PLACE'],
    render: ([a, b]) => {
      const p = person(a);
      const home = lower(b) === 'house';
      const en = home ? 'at home' : `at the ${lower(b)}`;
      const post = lower(b) === 'restaurant' ? 'में' : 'पर';
      return sentence(`${p.en} ${p.be} ${en}.`, `${p.hi} ${b.hi} ${post} ${p.hiBe}।`);
    },
  },
  {
    name: 'pronoun + animal',
    pattern: ['PRON', 'ANIMAL'],
    render: ([a, b]) => {
      const p = person(a);
      return sentence(`${p.en} ${p.have} ${article(lower(b))} ${lower(b)}.`, `${p.hiHave} ${b.hi} है।`);
    },
  },
  {
    name: 'family + profession',
    pattern: ['FAMILY', 'PROF'],
    render: ([a, b]) => {
      const f = hiFamily(a);
      return sentence(`My ${lower(a)} is ${article(lower(b))} ${lower(b)}.`, `${f.poss} ${a.hi} ${b.hi} ${f.be}।`);
    },
  },
  {
    name: 'family + adjective',
    pattern: ['FAMILY', 'ADJ'],
    render: ([a, b]) => {
      const f = hiFamily(a);
      return sentence(`My ${lower(a)} is ${lower(b)}.`, `${f.poss} ${a.hi} ${b.hi} ${f.be}।`);
    },
  },
  {
    name: 'animal/place + adjective',
    pattern: [['ANIMAL', 'PLACE'], 'ADJ'],
    render: ([a, b]) => sentence(`The ${lower(a)} is ${lower(b)}.`, `${a.hi} ${b.hi} है।`),
  },
  {
    name: 'adjective + noun',
    pattern: ['ADJ', ['PLACE', 'ANIMAL', 'FAMILY', 'PROF']],
    render: ([a, b]) => sentence(`${cap(article(lower(a)))} ${lower(a)} ${lower(b)}.`, `${a.hi} ${b.hi}।`),
  },
  {
    name: 'hello',
    pattern: ['hello'],
    render: () => sentence('Hello!', 'नमस्ते!'),
  },
  {
    name: 'thank you',
    pattern: ['THANKS'],
    render: () => sentence('Thank you.', 'धन्यवाद।'),
  },
];

const ORDERED = [...RULES].sort((a, b) => b.pattern.length - a.pattern.length);

function slotMatches(slot: Slot, def: SignDef): boolean {
  const options = Array.isArray(slot) ? slot : [slot];
  return options.some((o) => o === def.category || o === lower(def));
}

/** Fallback for words no rule covers: join them, capitalise, end with a full stop. */
function fallback(words: Array<{ label: string; hi?: string }>): Translation {
  const en = words.map((w) => (w.label === 'I' ? 'I' : w.label.toLowerCase())).join(' ');
  const hi = words.map((w) => w.hi ?? w.label).join(' ');
  return { en: `${cap(en)}.`, hi: `${hi}।` };
}

/**
 * Converts a sequence of sign labels into an English sentence plus a Hindi one.
 * Unknown labels are kept as-is in the fallback.
 */
export function glossToSentence(labels: string[]): Translation {
  if (labels.length === 0) return { en: '', hi: '' };

  const defs = labels.map((l) => findSign(l));
  const out: Translation[] = [];
  let pending: Array<{ label: string; hi?: string }> = [];

  const flush = () => {
    if (pending.length) out.push(fallback(pending));
    pending = [];
  };

  let i = 0;
  while (i < labels.length) {
    let matched = false;
    for (const rule of ORDERED) {
      const n = rule.pattern.length;
      if (i + n > labels.length) continue;
      const window = defs.slice(i, i + n);
      if (window.some((d) => !d)) continue;
      const known = window as SignDef[];
      if (known.every((d, k) => slotMatches(rule.pattern[k], d))) {
        flush();
        out.push(rule.render(known));
        i += n;
        matched = true;
        break;
      }
    }
    if (!matched) {
      const d = defs[i];
      pending.push({ label: d ? d.label : labels[i], hi: d?.hi });
      i += 1;
    }
  }
  flush();

  return {
    en: out.map((t) => t.en).join(' '),
    hi: out.map((t) => t.hi).join(' '),
  };
}

/** Same as glossToSentence but only the English text. */
export const toEnglish = (labels: string[]) => glossToSentence(labels).en;

export { pretty };
