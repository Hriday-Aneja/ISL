import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SuggestionError,
  cleanSuggestions,
  fetchAiStatus,
  getSuggestions,
  offlineSuggestions,
  requestAiSuggestions,
  type SuggestionInput,
} from '../src/services/dailySuggestions';
import { routeDescriptionToScenario, SCENARIO_CARDS, OFFLINE_SUGGESTIONS, SCENARIOS } from '../src/data/dailyScenarios';

const input: SuggestionInput = {
  scenarioId: 'travel',
  scenarioLabel: 'Travel',
  existing: ['Where is the railway station?'],
  recent: ['Hello'],
  count: 4,
};

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const base = { baseUrl: 'http://api.test' };

test('AI success returns cleaned, de-duplicated suggestions and posts the right body', async () => {
  let seen: { url: string; body: Record<string, unknown> } | null = null;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    seen = { url, body: JSON.parse(String(init.body)) };
    return json(200, { suggestions: ['Which platform?', 'which platform', 'Where is the railway station!', '', 5, 'Is this the right bus?'] });
  }) as unknown as typeof fetch;
  const result = await getSuggestions(input, { ...base, fetchImpl });
  assert.equal(result.source, 'ai');
  assert.deepEqual(result.suggestions, ['Which platform?', 'Is this the right bus?']);
  assert.equal(seen!.url, 'http://api.test/api/daily/suggest');
  assert.equal(seen!.body.scenario, 'Travel');
  assert.deepEqual(seen!.body.recent, ['Hello']);
  assert.ok(!('apiKey' in seen!.body));
});

test('every kind of AI failure falls back to built-in suggestions with a notice', async () => {
  const cases: Array<[string, typeof fetch]> = [
    ['network', (async () => { throw new TypeError('Failed to fetch'); }) as unknown as typeof fetch],
    ['not configured', (async () => json(503, { error: 'ai-not-configured' })) as unknown as typeof fetch],
    ['rate limited', (async () => json(429, { error: 'rate-limited' })) as unknown as typeof fetch],
    ['timeout', (async () => json(504, { error: 'ai-timeout' })) as unknown as typeof fetch],
    ['server error', (async () => json(502, { error: 'ai-upstream-error' })) as unknown as typeof fetch],
    ['not json', (async () => new Response('<html>', { status: 200 })) as unknown as typeof fetch],
    ['empty list', (async () => json(200, { suggestions: [] })) as unknown as typeof fetch],
  ];
  for (const [name, fetchImpl] of cases) {
    const r = await getSuggestions(input, { ...base, fetchImpl });
    assert.equal(r.source, 'offline', name);
    assert.ok(r.suggestions.length > 0, name);
    assert.ok(r.notice && r.notice.length > 0, name);
  }
});

test('request that never answers times out as a SuggestionError', async () => {
  const fetchImpl = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
  await assert.rejects(
    requestAiSuggestions(input, { ...base, fetchImpl, timeoutMs: 30 }),
    (err: unknown) => err instanceof SuggestionError && err.kind === 'timeout'
  );
});

test('caller cancelling is not reported as a failure', async () => {
  const controller = new AbortController();
  const fetchImpl = ((_url: string, init: RequestInit) =>
    new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')));
    })) as unknown as typeof fetch;
  const pending = getSuggestions(input, { ...base, fetchImpl, signal: controller.signal });
  controller.abort();
  await assert.rejects(pending);
});

test('AI marked unavailable skips the network entirely', async () => {
  let called = false;
  const fetchImpl = (async () => { called = true; return json(200, {}); }) as unknown as typeof fetch;
  const r = await getSuggestions(input, { ...base, fetchImpl, aiAvailable: false });
  assert.equal(called, false);
  assert.equal(r.source, 'offline');
  assert.ok(r.notice);
});

test('status check is true only when the server says configured, and never throws', async () => {
  const ok = (async () => json(200, { aiConfigured: true })) as unknown as typeof fetch;
  const no = (async () => json(200, { aiConfigured: false })) as unknown as typeof fetch;
  const bad = (async () => json(500, {})) as unknown as typeof fetch;
  const boom = (async () => { throw new Error('offline'); }) as unknown as typeof fetch;
  assert.equal(await fetchAiStatus({ ...base, fetchImpl: ok }), true);
  assert.equal(await fetchAiStatus({ ...base, fetchImpl: no }), false);
  assert.equal(await fetchAiStatus({ ...base, fetchImpl: bad }), false);
  assert.equal(await fetchAiStatus({ ...base, fetchImpl: boom }), false);
});

test('offline suggestions never repeat what is on screen and respect count', () => {
  const on = SCENARIO_CARDS.travel.map((c) => c.text);
  const r = offlineSuggestions({ ...input, existing: on, count: 5 });
  assert.equal(r.suggestions.length, 5);
  for (const s of r.suggestions) assert.ok(!on.includes(s));
});

test('every preset scenario has cards and offline suggestions; custom routes by keyword', () => {
  for (const s of SCENARIOS.filter((x) => x.id !== 'custom')) {
    assert.ok(SCENARIO_CARDS[s.id as keyof typeof SCENARIO_CARDS].length >= 10, s.id);
    assert.ok(OFFLINE_SUGGESTIONS[s.id as keyof typeof OFFLINE_SUGGESTIONS].length >= 8, s.id);
  }
  assert.equal(routeDescriptionToScenario('I am at the hospital to see a doctor'), 'healthcare');
  assert.equal(routeDescriptionToScenario('buying a train ticket at the station'), 'travel');
  assert.equal(routeDescriptionToScenario('qwerty'), 'everyday');
  const custom = offlineSuggestions({ scenarioId: 'custom', scenarioLabel: 'Custom', description: 'meeting with my manager at the office', existing: [] });
  assert.equal(custom.routedTo, 'workplace');
  assert.ok(custom.suggestions.length > 0);
});

test('cleanSuggestions drops non-strings, blanks and over-long items', () => {
  assert.deepEqual(cleanSuggestions('nope', [], 5), []);
  assert.deepEqual(cleanSuggestions(['a', 'A.', '  ', 3, 'x'.repeat(500), 'b'], [], 5), ['a', 'b']);
});
