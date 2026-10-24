import type { SignId } from '../types';

// Human-readable label for each sign ID, shown in chips and the avatar stage.
export const SIGN_LABELS: Record<SignId, string> = {
  BEAUTIFUL: 'Beautiful',
  BIRD: 'Bird',
  DAUGHTER: 'Daughter',
  FATHER: 'Father',
  HAPPY: 'Happy',
  HE: 'He',
  HOUSE: 'House',
  LAWYER: 'Lawyer',
  MOTHER: 'Mother',
  PARENT: 'Parent',
  RESTAURANT: 'Restaurant',
  SAD: 'Sad',
  SHE: 'She',
  SON: 'Son',
  STUDENT: 'Student',
  TEACHER: 'Teacher',
  TRAIN_STATION: 'Train station',
  WAITER: 'Waiter',
  DOG: 'Dog',
  HELLO: 'Hello',
  THANK_YOU: 'Thank you',
  PLEASE: 'Please',
  SORRY: 'Sorry',
  YES: 'Yes',
  NO: 'No',
  I: 'I',
  YOU: 'You',
  MY: 'My',
  YOUR: 'Your',
  NEED: 'Need',
  WATER: 'Water',
  FOOD: 'Food',
  HELP: 'Help',
  DOCTOR: 'Doctor',
  TEACHERS: 'Teachers',
  EMERGENCY: 'Emergency',
  PAIN: 'Pain',
  STOP: 'Stop',
  GOODBYE: 'Goodbye',
  FINE: 'Fine',
  WHERE: 'Where',
  WASHROOM: 'Washroom',
  NAME: 'Name',
  HOW: 'How',
  ME: 'Me',
};

// Deterministic sign-sequence -> natural sentence mapping. No model
// involved — this is a lookup keyed by the joined sign sequence, with a
// generic fallback for sequences that don't have a hand-authored sentence.
const SEQUENCE_TO_SENTENCE: Record<string, string> = {
  'I,NEED,WATER': 'I need water.',
  'I,NEED,FOOD': 'I need food.',
  'I,NEED,HELP': 'I need help.',
  'HELP,ME': 'Please help me.',
  THANK_YOU: 'Thank you.',
  HELLO: 'Hello.',
  GOODBYE: 'Goodbye.',
  YES: 'Yes.',
  NO: 'No.',
  SORRY: 'Sorry.',
  PLEASE: 'Please.',
  STOP: 'Stop.',
  'I,FINE': "I'm fine.",
  'WHERE,WASHROOM': 'Where is the washroom?',
  'I,PAIN': "I'm in pain.",
  'DOCTOR,EMERGENCY': 'This is a medical emergency.',
  'YOUR,NAME': 'What is your name?',
};

export function signsToSentence(signs: SignId[]): string {
  if (signs.length === 0) return '';
  const key = signs.join(',');
  if (SEQUENCE_TO_SENTENCE[key]) return SEQUENCE_TO_SENTENCE[key];
  // Fallback: stitch labels into a plain sentence so the flow never dead-ends.
  const words = signs.map((s) => SIGN_LABELS[s].toLowerCase());
  const sentence = words.join(' ');
  return sentence.charAt(0).toUpperCase() + sentence.slice(1) + '.';
}
