import type { SignId } from '../types';

// Realistic-feeling mock recognition outcomes. mockRecognizeSigns() in
// services/mockRecognition.ts picks from this pool so demos vary run to run
// instead of always returning the same phrase.
export const MOCK_SIGN_SEQUENCES: SignId[][] = [
  ['I', 'NEED', 'WATER'],
  ['THANK_YOU'],
  ['HELP', 'ME'],
  ['HELLO'],
  ['DAUGHTER'],
  ['DOCTOR'],
  ['HAPPY'],
  ['HOUSE'],
  ['LAWYER'],
  ['PARENT'],
  ['SAD'],
  ['STUDENT'],
  ['TEACHERS'],
  ['TRAIN_STATION'],
  ['WAITER'],
  ['I', 'NEED', 'HELP'],
  ['WHERE', 'WASHROOM'],
  ['I', 'FINE'],
  ['SORRY'],
];

// Preloaded conversation history so the room doesn't open empty on first
// paint — replaced immediately once a real turn happens.
export const SEED_CONVERSATION = [
  {
    id: 'seed-1',
    speaker: 'isl_user' as const,
    text: 'Hello.',
    signs: ['HELLO'] as SignId[],
    timestamp: Date.now() - 1000 * 60 * 4,
  },
  {
    id: 'seed-2',
    speaker: 'hearing_user' as const,
    text: 'Hi, good to see you. How can I help today?',
    timestamp: Date.now() - 1000 * 60 * 3,
  },
];

export const SESSION_PHRASES = [
  'Hello',
  'Daughter',
  'Doctor',
  'Happy',
  'House',
  'Lawyer',
  'Parent',
  'Sad',
  'Student',
  'Teacher',
  'Teachers',
  'Train station',
  'Waiter',
  'Thank you',
  'Please',
  'Sorry',
  'Yes',
  'No',
  'I need water',
  'I need food',
  'I need help',
  'Call a doctor',
  'This is an emergency',
  'Where is the washroom?',
  'I am in pain',
  'Stop',
  'Goodbye',
  'How are you?',
  'I am fine',
  'What is your name?',
];
