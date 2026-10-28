import { test } from 'node:test';
import assert from 'node:assert/strict';
import { glossToSentence, RULES } from '../src/components/signdemo/lib/glossToEnglish';
import { generateMockClip } from '../src/components/signdemo/lib/mockData';
import { parseClip } from '../src/components/signdemo/hooks/useSignData';
import { HAND_CONNECTIONS } from '../src/components/signdemo/lib/skeleton';
import { SIGN_LABELS, slugify } from '../src/components/signdemo/lib/signs';

const en = (...labels: string[]) => glossToSentence(labels).en;
const hi = (...labels: string[]) => glossToSentence(labels).hi;

test('gloss mapper: the examples from the brief', () => {
  assert.equal(en('I', 'Teacher'), 'I am a teacher.');
  assert.equal(en('she', 'Doctor'), 'She is a doctor.');
  assert.equal(en('Hello', 'you'), 'Hello, how are you?');
});

test('gloss mapper: more rules', () => {
  assert.equal(en('you', 'Student'), 'You are a student.');
  assert.equal(en('he', 'happy'), 'He is happy.');
  assert.equal(en('I', 'sad'), 'I am sad.');
  assert.equal(en('she', 'Mother'), 'She is my mother.');
  assert.equal(en('I', 'Parent'), 'I am a parent.');
  assert.equal(en('Mother', 'Doctor'), 'My mother is a doctor.');
  assert.equal(en('Father', 'happy'), 'My father is happy.');
  assert.equal(en('I', 'House'), 'I am at home.');
  assert.equal(en('she', 'Train Station'), 'She is at the train station.');
  assert.equal(en('I', 'Restaurant'), 'I am at the restaurant.');
  assert.equal(en('I', 'Dog'), 'I have a dog.');
  assert.equal(en('he', 'Bird'), 'He has a bird.');
  assert.equal(en('Dog', 'happy'), 'The dog is happy.');
  assert.equal(en('House', 'Beautiful'), 'The house is beautiful.');
  assert.equal(en('Beautiful', 'House'), 'A beautiful house.');
  assert.equal(en('Hello', 'Doctor'), 'Hello, doctor!');
  assert.equal(en('Thank you', 'Teacher'), 'Thank you, teacher.');
  assert.equal(en('Hello'), 'Hello!');
  assert.equal(en('Thank you'), 'Thank you.');
});

test('gloss mapper: at least ten rules', () => {
  assert.ok(RULES.length >= 10);
});

test('gloss mapper: sequences are split into clauses; unknown words fall back to a join', () => {
  assert.equal(en('Hello', 'you', 'I', 'happy'), 'Hello, how are you? I am happy.');
  assert.equal(en('Dog', 'Bird'), 'Dog bird.');
  assert.equal(en('Doctor'), 'Doctor.');
  assert.equal(en('Unknownword'), 'Unknownword.');
  assert.equal(glossToSentence([]).en, '');
});

test('gloss mapper: Hindi output', () => {
  assert.equal(hi('I', 'Teacher'), 'मैं शिक्षक हूँ।');
  assert.equal(hi('she', 'Doctor'), 'वह डॉक्टर है।');
  assert.equal(hi('Hello', 'you'), 'नमस्ते, आप कैसे हैं?');
  assert.equal(hi('Mother', 'Doctor'), 'मेरी माँ डॉक्टर हैं।');
});

test('mock clips: 24 signs, hands use 21 points, predictions sum below 1', () => {
  assert.equal(SIGN_LABELS.length, 24);
  for (const label of SIGN_LABELS) {
    const clip = generateMockClip(label);
    assert.equal(clip.frames.length, 100);
    assert.equal(clip.predictions[0].label, label);
    const sum = clip.predictions.reduce((a, p) => a + p.p, 0);
    assert.ok(sum <= 1.003 && sum > 0.9, `${label}: ${sum}`);
    let handFrames = 0;
    for (const f of clip.frames) {
      assert.equal(f.pose.length, 33);
      for (const h of [f.left_hand, f.right_hand]) {
        assert.ok(h.length === 0 || h.length === 21);
        if (h.length) handFrames++;
        for (const [x, y] of h) assert.ok(Number.isFinite(x) && Number.isFinite(y));
      }
    }
    assert.ok(handFrames > 20, `${label} has too few hand frames`);
  }
});

test('mock clips are deterministic', () => {
  assert.deepEqual(generateMockClip('Hello').frames[40], generateMockClip('Hello').frames[40]);
});

test('hand topology: 21 bones over 21 points', () => {
  assert.equal(HAND_CONNECTIONS.length, 21);
  for (const [a, b] of HAND_CONNECTIONS) assert.ok(a >= 0 && b <= 20);
});

test('slugify matches the file names the export script writes', () => {
  assert.equal(slugify('Thank you'), 'thank-you');
  assert.equal(slugify('Train Station'), 'train-station');
  assert.equal(slugify('happy'), 'happy');
});

test('parseClip accepts the documented JSON shape and rejects broken data', () => {
  const ok = parseClip(
    {
      sign: 'Hello',
      video: '/demo/videos/hello.mp4',
      fps: 25,
      frames: [{ pose: [[0.5, 0.5]], left_hand: [], right_hand: [[0.1, 0.2]] }],
      predictions: [
        { label: 'Thank you', p: 0.03 },
        { label: 'Hello', p: 0.94 },
      ],
    },
    'Hello'
  );
  assert.equal(ok.isMock, false);
  assert.equal(ok.predictions[0].label, 'Hello'); // sorted by probability
  assert.throws(() => parseClip({ frames: [] }, 'Hello'));
  assert.throws(() => parseClip({ frames: [{ pose: 'x' }], predictions: [] }, 'Hello'));
  assert.throws(() => parseClip(null, 'Hello'));
});
