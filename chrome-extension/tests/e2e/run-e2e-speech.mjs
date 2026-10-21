// Browser-level test of Speech -> Sign: loads the unpacked extension into real Chromium, serves a FAKE Meet page whose
// captions markup is my assumption of Meet's structure (tests/e2e/fake-meet.js), and drives the real panel UI.
// It does NOT test the real Google Meet, real speech recognition, or H.264 playback (Playwright's Chromium cannot decode
// the avatar .mp4 files, so clips fall back to the text placeholder, which is itself a path worth testing).
// Needs no recognition service. Usage: node tests/e2e/run-e2e-speech.mjs
import { chromium } from 'playwright-core';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const extPath = join(here, '..', '..');
const CHROME = process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const MEET = 'https://meet.google.com/abc-defg-hij';
const results = [];
const check = (name, cond, detail = '') => { results.push(Boolean(cond)); console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 8000, step = 100) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await sleep(step); } }

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'samvaad-e2e-speech-')), {
  executablePath: CHROME, headless: false, ignoreHTTPSErrors: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--headless=new'],
});
await ctx.route('https://meet.google.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(here, 'fake-meet.js')) });
  const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://meet.google.com";
  return route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': csp }, body: readFileSync(join(here, 'fake-meet.html')) });
});
const sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(String(e)));
await page.goto(MEET);
const frame = await until(() => page.frames().find((f) => f.url().includes(`${extId}/src/panel/panel.html`)));
check('panel iframe injected', Boolean(frame));
await frame.locator('#pill').click();
const allow = await page.evaluate(() => document.querySelector('#samvaad-panel-host iframe').getAttribute('allow'));
check('iframe is allowed to use the microphone and on-device speech', /microphone/.test(allow) && /on-device-speech-recognition/.test(allow), allow);

// ---- regression: the existing Sign -> Text tab still works (no recognition service is running here, so it must fail cleanly) ----
await frame.locator('#sessionBtn').click();
check('Sign tab: Start recognition reports a missing service clearly', await until(async () => /service|connect/i.test(await frame.locator('#message').textContent()), 8000), (await frame.locator('#message').textContent()));
check('Sign tab: camera is not left open after the failure', await frame.evaluate(() => !document.getElementById('preview').srcObject));
check('Sign tab: connection badge is shown on this tab', await frame.locator('#connText').isVisible());

// ---- tabs ----
check('Sign tab is the default', await frame.locator('#paneSign').isVisible() && !(await frame.locator('#paneSpeech').isVisible()));
await frame.locator('#tabSpeech').click();
check('connection badge is hidden on the Speech tab (it only concerns sign recognition)', !(await frame.locator('#connText').isVisible()));
check('Speech tab opens, Sign tab hides', await frame.locator('#paneSpeech').isVisible() && !(await frame.locator('#paneSign').isVisible()));
check('tab aria-selected follows', (await frame.locator('#tabSpeech').getAttribute('aria-selected')) === 'true' && (await frame.locator('#tabSign').getAttribute('aria-selected')) === 'false');
await frame.locator('#tabSpeech').press('ArrowLeft');
check('arrow keys switch tabs', await frame.locator('#paneSign').isVisible());
await frame.locator('#tabSign').press('ArrowRight');
check('arrow keys switch back', await frame.locator('#paneSpeech').isVisible());

// ---- captions: nothing before the user acts ----
check('not listening before Start', (await frame.locator('#listenBtn').textContent()) === 'Start listening');
check('no captions region exists yet in the page', (await page.locator('[role=region][aria-label=Captions]').count()) === 0);

// ---- turn on captions through the panel ----
await frame.locator('#capOnBtn').click();
check('"Turn on Meet captions" presses the page button', await until(async () => (await page.locator('[role=region][aria-label=Captions]').count()) === 1, 3000));
await frame.locator('#listenBtn').click();
check('listening to captions is confirmed from a real snapshot', await until(async () => /Listening to Meet captions/.test(await frame.locator('#speechMessage').textContent()), 4000));
check('button flips to Stop listening and source is locked', (await frame.locator('#listenBtn').textContent()) === 'Stop listening' && await frame.locator('#srcSelect').isDisabled());

// ---- a spoken turn: live line first, then a settled, signed turn ----
await page.evaluate(() => window.__setCaptions([{ speaker: 'Alice', text: 'hello zebra' }]));
check('live caption line shows unsettled text immediately', await until(async () => /Alice: hello zebra/.test(await frame.locator('#liveLine').textContent()), 2000));
check('nothing is signed before the words settle', (await frame.locator('#turns li').count()) === 0);
check('a settled turn appears (1.5 s settle)', await until(async () => (await frame.locator('#turns li').count()) === 1, 5000));
check('turn is attributed to the speaker', /Alice/.test(await frame.locator('#turns li .who').first().textContent()));
check('unmapped word is flagged, mapped word is not', (await frame.locator('#turns .w.unsigned').allTextContents()).join() === 'zebra' && (await frame.locator('#turns .w.signed').allTextContents()).join() === 'hello');
check('the avatar note names what it could not cover', /Not covered by the avatar: zebra/.test(await frame.locator('#turns li .note').first().textContent()));
let sawHello = null;
await until(async () => { const s = await frame.evaluate(() => ({ sign: document.getElementById('stage').dataset.sign, src: document.getElementById('avatarVideo').src })); if (s.sign === 'HELLO') sawHello = s; return sawHello; }, 4000, 40);
check('avatar queued HELLO from the speech', Boolean(sawHello));
check('avatar clip URL points at the packaged hello.mp4', sawHello && sawHello.src === `chrome-extension://${extId}/assets/avatar/hello.mp4`, sawHello && sawHello.src);
check('packaged clip is reachable from the panel', await frame.evaluate(async () => (await fetch(chrome.runtime.getURL('assets/avatar/hello.mp4'), { method: 'HEAD' })).ok));

// ---- same row grows: only the new words are signed ----
await page.evaluate(() => window.__setCaptions([{ speaker: 'Alice', text: 'hello zebra I need water' }]));
check('growing the same row adds one new turn with only the new words', await until(async () => (await frame.locator('#turns li').count()) === 2, 5000));
check('new turn holds just the added words', /^\s*Alice\s*Sign\s*I need water/.test((await frame.locator('#turns li').nth(1).innerText()).replace(/\n/g, ' ')), (await frame.locator('#turns li').nth(1).innerText()).replace(/\n/g, ' | '));
check('signs without a clip show a text card instead of being skipped', await until(async () => /no avatar clip for this sign yet/.test(await frame.locator('#stageCard').textContent()), 8000, 40));

// ---- own speech is ignored by default ----
await page.evaluate(() => window.__setCaptions([{ speaker: 'Alice', text: 'hello zebra I need water' }, { speaker: 'You', text: 'this is me talking' }]));
await sleep(2600);
check('captions labelled "You" are not signed by default', !(await frame.locator('#turns').innerText()).includes('this is me talking'));

// ---- tab hidden: turns are kept but the avatar is not driven ----
await frame.locator('#tabSign').click();
await frame.locator('#skipBtn').evaluate(() => {}); // (button lives in the hidden pane; nothing to do)
await page.evaluate(() => window.__setCaptions([{ speaker: 'Alice', text: 'hello zebra I need water' }, { speaker: 'Bob', text: 'call a doctor' }]));
check('turn arriving while the Speech tab is hidden raises the unread badge', await until(async () => (await frame.locator('#tabBadge').textContent()) === '1' && await frame.locator('#tabBadge').isVisible(), 5000));
check('avatar is idle while hidden', (await frame.evaluate(() => document.getElementById('stage').dataset.sign)) === '');
await frame.locator('#tabSpeech').click();
check('opening the tab clears the badge', !(await frame.locator('#tabBadge').isVisible()));
const missed = frame.locator('#turns li', { hasText: 'call a doctor' });
check('missed turn explains why it was not signed', /tab was hidden/.test(await missed.innerText()));
await missed.locator('button').click();
let sawDoctor = false;
await until(async () => { sawDoctor = sawDoctor || (await frame.evaluate(() => document.getElementById('stage').dataset.sign)) === 'DOCTOR'; return sawDoctor; }, 4000, 40);
check('its Sign button plays it on demand', sawDoctor);

// ---- typed text, and keystrokes stay out of the meeting page ----
await frame.locator('#skipBtn').click();
await page.evaluate(() => { window.pageKeys = 0; });
await frame.locator('#typeInput').fill('thank you doctor');
await frame.locator('#typeInput').press('Enter');
check('typed text becomes a signed turn', await until(async () => (await frame.locator('#turns li', { hasText: 'thank you doctor' }).count()) === 1, 3000));
check('typing in the panel never reaches the meeting page (no Meet shortcuts fire)', (await page.evaluate(() => window.pageKeys)) === 0);

// ---- degraded and lost captions ----
await page.evaluate(() => window.__breakCaptionLayout());
check('an unrecognised captions layout is reported, not guessed', await until(async () => /layout was not recognised/.test(await frame.locator('#speechMessage').textContent()), 4000));
await page.evaluate(() => document.getElementById('ccbtn').click()); // captions off in the fixture (the panel overlaps the button, so click via script)
check('captions turned off is reported', await until(async () => /not detected/.test(await frame.locator('#speechMessage').textContent()), 4000));
await frame.locator('#listenBtn').click();
check('Stop listening works', (await frame.locator('#listenBtn').textContent()) === 'Start listening');

// ---- microphone mode in a real Chromium: local-only must refuse rather than fall back to the cloud ----
await frame.locator('#srcSelect').selectOption('mic');
check('captions-only button hides in mic mode', !(await frame.locator('#capOnBtn').isVisible()));
await frame.locator('#listenBtn').click();
check('local-only mic start either works or refuses clearly, never hangs', await until(async () => /on-device|listening on this computer|language pack|cannot recognise|no speech recognition|not allowed/i.test(await frame.locator('#speechMessage').textContent()), 5000), (await frame.locator('#speechMessage').textContent()));
await sleep(300);
if ((await frame.locator('#listenBtn').textContent()) === 'Stop listening') await frame.locator('#listenBtn').click();

check('no uncaught errors on the meeting page', pageErrors.length === 0, pageErrors.join(' | '));
await ctx.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
