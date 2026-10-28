// Single source of truth for the 24 signs the demo knows about.
// To change the vocabulary, edit SIGNS (label = the class name your model outputs).

export type Category =
  | 'PRON'
  | 'PROF'
  | 'FAMILY'
  | 'ADJ'
  | 'PLACE'
  | 'ANIMAL'
  | 'GREET'
  | 'THANKS';

export interface SignDef {
  /** Class label exactly as the model outputs it. */
  label: string;
  category: Category;
  /** Hindi word, used by the sentence builder's Hindi output. */
  hi: string;
}

export const SIGNS: SignDef[] = [
  { label: 'Beautiful', category: 'ADJ', hi: 'सुंदर' },
  { label: 'Bird', category: 'ANIMAL', hi: 'चिड़िया' },
  { label: 'Daughter', category: 'FAMILY', hi: 'बेटी' },
  { label: 'Doctor', category: 'PROF', hi: 'डॉक्टर' },
  { label: 'Dog', category: 'ANIMAL', hi: 'कुत्ता' },
  { label: 'Father', category: 'FAMILY', hi: 'पिता' },
  { label: 'Hello', category: 'GREET', hi: 'नमस्ते' },
  { label: 'House', category: 'PLACE', hi: 'घर' },
  { label: 'I', category: 'PRON', hi: 'मैं' },
  { label: 'Lawyer', category: 'PROF', hi: 'वकील' },
  { label: 'Mother', category: 'FAMILY', hi: 'माँ' },
  { label: 'Parent', category: 'FAMILY', hi: 'माता-पिता' },
  { label: 'Restaurant', category: 'PLACE', hi: 'रेस्तरां' },
  { label: 'Son', category: 'FAMILY', hi: 'बेटा' },
  { label: 'Student', category: 'PROF', hi: 'छात्र' },
  { label: 'Teacher', category: 'PROF', hi: 'शिक्षक' },
  { label: 'Thank you', category: 'THANKS', hi: 'धन्यवाद' },
  { label: 'Train Station', category: 'PLACE', hi: 'रेलवे स्टेशन' },
  { label: 'Waiter', category: 'PROF', hi: 'वेटर' },
  { label: 'happy', category: 'ADJ', hi: 'खुश' },
  { label: 'he', category: 'PRON', hi: 'वह' },
  { label: 'sad', category: 'ADJ', hi: 'उदास' },
  { label: 'she', category: 'PRON', hi: 'वह' },
  { label: 'you', category: 'PRON', hi: 'आप' },
];

export const SIGN_LABELS = SIGNS.map((s) => s.label);

const byKey = new Map(SIGNS.map((s) => [s.label.toLowerCase(), s]));

export function findSign(label: string): SignDef | undefined {
  return byKey.get(label.trim().toLowerCase());
}

/** "Thank you" -> "thank-you": used for /demo/<slug>.json and /demo/videos/<slug>.mp4 */
export function slugify(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Display form: the class names are mixed-case ("happy", "he"); the UI shows them capitalised. */
export function pretty(label: string): string {
  return label.charAt(0).toUpperCase() + label.slice(1);
}

// Clips that already ship with the web app (public/avatar-videos). They are used as the
// placeholder video until real recordings are exported to /public/demo/videos/.
const SHIPPED_VIDEOS = new Set([
  'daughter',
  'doctor',
  'happy',
  'hello',
  'house',
  'lawyer',
  'parent',
  'sad',
  'student',
  'train-station',
  'waiter',
]);

export function placeholderVideoFor(label: string): string | null {
  const slug = slugify(label);
  return SHIPPED_VIDEOS.has(slug) ? `/avatar-videos/${slug}.mp4` : null;
}

/** Signs highlighted (and auto-cycled) in the hero replay. */
export const FEATURED = ['Hello', 'Doctor', 'Thank you', 'Student', 'happy', 'Train Station'];
