/**
 * Scenarios and ready-made message cards for the Daily Translator.
 *
 * Cards are plain, first-person messages a person can show or speak. They are
 * English text only — nothing here claims to be an ISL translation.
 */

export type ScenarioId =
  | 'healthcare'
  | 'shopping'
  | 'college'
  | 'workplace'
  | 'travel'
  | 'everyday'
  | 'emergency'
  | 'custom';

export interface Scenario {
  id: ScenarioId;
  label: string;
  blurb: string;
}

export const SCENARIOS: Scenario[] = [
  { id: 'healthcare', label: 'Healthcare', blurb: 'Doctor, clinic, pharmacy' },
  { id: 'shopping', label: 'Shopping / Restaurant', blurb: 'Shops, markets, ordering food' },
  { id: 'college', label: 'College / Education', blurb: 'Classes, teachers, campus' },
  { id: 'workplace', label: 'Workplace', blurb: 'Meetings, tasks, colleagues' },
  { id: 'travel', label: 'Travel', blurb: 'Stations, tickets, directions' },
  { id: 'everyday', label: 'Everyday Conversation', blurb: 'Greetings and small talk' },
  { id: 'emergency', label: 'Emergency', blurb: 'Urgent help, right now' },
  { id: 'custom', label: 'Custom Situation', blurb: 'Describe your own situation' },
];

export function getScenario(id: ScenarioId): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export interface PresetCard {
  id: string;
  text: string;
}

function cards(scenario: string, texts: string[]): PresetCard[] {
  return texts.map((text, i) => ({ id: `${scenario}-${i + 1}`, text }));
}

/** Always one tap away, on every screen. */
export const EMERGENCY_PHRASES: PresetCard[] = cards('sos', [
  'Please help me!',
  'I need a doctor now.',
  'Please call an ambulance.',
  'Please call the police.',
  'I cannot hear. Please write or show me.',
  'I am hurt.',
  'There is a fire!',
  'I am lost. Please help me.',
  'Please call my family.',
]);

export type PresetScenarioId = Exclude<ScenarioId, 'custom'>;

export const SCENARIO_CARDS: Record<PresetScenarioId, PresetCard[]> = {
  healthcare: cards('health', [
    'I need to see a doctor.',
    'I am in pain.',
    'It hurts here. Let me show you.',
    'I feel dizzy.',
    'I have a fever.',
    'I need my medicine.',
    'Where is the pharmacy?',
    'I have an allergy. Please check before giving me medicine.',
    'Please write it down for me.',
    'I did not understand. Please explain slowly.',
    'How many times a day should I take this?',
    'Is there a sign language interpreter available?',
    'Where is the washroom?',
    'Please call my family.',
  ]),
  shopping: cards('shop', [
    'How much is this?',
    'I would like this one, please.',
    'Can I see the menu?',
    'I need water, please.',
    'Please bring the bill.',
    'Is this spicy?',
    'I have a food allergy. Please tell me what is in this.',
    'I am vegetarian.',
    'Can I pay by UPI?',
    'Do you have a smaller size?',
    'Please write the price for me.',
    'I need a bag, please.',
    'Thank you.',
    'Please repeat that more slowly.',
  ]),
  college: cards('college', [
    'I use Indian Sign Language to communicate.',
    'Please face me when you speak.',
    'Could you please repeat that?',
    'Please write it on the board.',
    'I did not understand. Can you explain again?',
    'May I ask a question?',
    'Is an interpreter available for this class?',
    'Can I get a copy of the notes?',
    'I need a little more time, please.',
    'Where is the library?',
    'Where is the classroom?',
    'When is the exam?',
    'Please speak slowly.',
    'Thank you, teacher.',
  ]),
  workplace: cards('work', [
    'Good morning.',
    'Could you please write that down?',
    'I need a moment to read this.',
    'Can we use chat or email for this?',
    'I did not understand the task. Please explain again.',
    'Is there a meeting today?',
    'Please share the agenda in writing.',
    'I will send it to you by email.',
    'Could we speak one at a time, please?',
    'I would like an interpreter for this meeting.',
    'Please type what you are saying.',
    'I have finished the task.',
    'Thank you for your help.',
    'Can we continue this later?',
  ]),
  travel: cards('travel', [
    'Where is the railway station?',
    'Where is the bus stop?',
    'How much is the ticket?',
    'Which platform is it?',
    'Is this the right bus?',
    'What time does it leave?',
    'Please write the address for me.',
    'Can you show me on the map?',
    'I need a taxi, please.',
    'Where is the washroom?',
    'I am lost. Please help me.',
    'Please tell me when we reach this stop.',
    'Where can I buy a ticket?',
    'Thank you.',
  ]),
  everyday: cards('daily', [
    'Hello.',
    'How are you?',
    'I am fine, thank you.',
    'Please.',
    'Thank you.',
    'Sorry.',
    'Yes.',
    'No.',
    'I do not understand.',
    'Please repeat that.',
    'Please speak slowly.',
    'Please write it down.',
    'I use Indian Sign Language.',
    'What is your name?',
    'Please wait a moment.',
    'I need water.',
    'Please help me.',
  ]),
  emergency: [
    ...EMERGENCY_PHRASES,
    ...cards('emergency-more', [
      'Where is the nearest hospital?',
      'I am in danger.',
      'I cannot breathe well.',
      'Please stay with me.',
      'Please write or speak slowly. I am scared.',
      'I need water.',
    ]),
  ],
};

/**
 * Built-in "More suggestions" used when AI is unavailable. Different from the
 * main cards above so the button always has something new to offer.
 */
export const OFFLINE_SUGGESTIONS: Record<PresetScenarioId, string[]> = {
  healthcare: [
    'I have been feeling unwell since yesterday.',
    'Can you show me where to go?',
    'I need to rest.',
    'Is this medicine safe with my other medicines?',
    'Please call the nurse.',
    'When will the doctor see me?',
    'Where do I pay?',
    'Please bring me some water.',
    'Can I have a written prescription?',
    'I would like a second opinion.',
  ],
  shopping: [
    'Do you have this in another colour?',
    'Can I try this on?',
    'Is there a discount?',
    'Please pack this for me.',
    'I would like to order this.',
    'Can I get a receipt?',
    'Is this fresh?',
    'Please show me the price on your phone.',
    'I am ready to pay.',
    'Where is the counter?',
  ],
  college: [
    'Could you share the slides with me?',
    'I missed the last class. Can you help me catch up?',
    'Please give the instructions in writing.',
    'May I sit near the front?',
    'Can we meet after class?',
    'Where is the office?',
    'Which room is the exam in?',
    'Can I submit this by email?',
    'I would like to join the group.',
    'Thank you for explaining.',
  ],
  workplace: [
    'Could you send the details by email?',
    'Please add captions or notes for the meeting.',
    'I will update you by the end of the day.',
    'Can you point me to the right person?',
    'May I take a short break?',
    'Please share the minutes of the meeting.',
    'I am ready to start.',
    'Could we sit where I can see everyone?',
    'I will check and let you know.',
    'That works for me.',
  ],
  travel: [
    'Is there a direct train?',
    'How long will it take?',
    'Which exit should I take?',
    'Can I get a seat here?',
    'Is this the correct platform?',
    'Please tell me the next stop in writing.',
    'Where is the ticket counter?',
    'Where can I find a hotel nearby?',
    'Please stop here.',
    'Can I get a refund for this ticket?',
  ],
  everyday: [
    'Good morning.',
    'Good evening.',
    'Nice to meet you.',
    'See you later.',
    'Can you help me, please?',
    'Could you type that on your phone?',
    'I am learning to communicate with you.',
    'That is okay.',
    'Let me think for a moment.',
    'Excuse me.',
  ],
  emergency: [
    'Please stay calm and write what happened.',
    'I need help right now.',
    'Please take me to a safe place.',
    'Please call someone who can sign.',
    'I am not able to hear you.',
    'Is anyone here a doctor?',
    'I need to sit down.',
    'Please call my emergency contact.',
    'Please tell me what is happening.',
    'I need a hospital.',
  ],
};

const KEYWORDS: Record<PresetScenarioId, RegExp> = {
  healthcare: /\b(doctor|hospital|clinic|medic\w*|pharmac\w*|pain|nurse|health|fever|dentist|injur\w*|sick|surgery|prescription|appointment)\b/gi,
  shopping: /\b(shop\w*|store|market|buy|price|bill|restaurant|cafe|café|menu|order|food|mall|grocery|supermarket|waiter|payment)\b/gi,
  college: /\b(college|school|class\w*|lecture|teacher|professor|exam|university|study|library|campus|student|course|lab|assignment)\b/gi,
  workplace: /\b(office|work\w*|meeting|boss|manager|colleague|interview|job|team|client|email|project|deadline)\b/gi,
  travel: /\b(train|bus|station|airport|flight|ticket|travel\w*|taxi|auto|metro|platform|hotel|trip|road|direction\w*|journey|bag\w*)\b/gi,
  everyday: /\b(friend|neighbou?r|family|party|visit|chat|talk|home|greet\w*)\b/gi,
  emergency: /\b(emergency|fire|accident|police|ambulance|danger|urgent|attack|robbery|lost)\b/gi,
};

/**
 * Picks the closest built-in scenario for a free-text description. Used only to
 * choose offline suggestions when AI is unavailable — it is a keyword match,
 * not an understanding of the situation.
 */
export function routeDescriptionToScenario(description: string): PresetScenarioId {
  const text = description.toLowerCase();
  let best: PresetScenarioId = 'everyday';
  let bestScore = 0;
  (Object.keys(KEYWORDS) as PresetScenarioId[]).forEach((id) => {
    const matches = text.match(KEYWORDS[id]);
    const score = matches ? matches.length : 0;
    if (score > bestScore) {
      best = id;
      bestScore = score;
    }
  });
  return best;
}
