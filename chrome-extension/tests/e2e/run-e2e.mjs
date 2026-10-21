// Browser-level test: loads the unpacked extension into real Chromium, serves a FAKE Meet page (fixture with a strict CSP)
// on https://meet.google.com/abc-defg-hij, uses Chromium's fake camera, and talks to the REAL recognition_service.py.
// It does NOT test the real Google Meet. Usage: SERVICE_URL=ws://127.0.0.1:8765 node tests/e2e/run-e2e.mjs
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
const check = (name, cond, detail = '') => { results.push(cond); console.log(`[${cond ? 'PASS' : 'FAIL'}] ${name}${detail ? ' - ' + detail : ''}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 200) { const t = Date.now(); for (;;) { const v = await fn(); if (v) return v; if (Date.now() - t > ms) return v; await sleep(step); } }

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'samvaad-e2e-')), {
  executablePath: CHROME, headless: false, ignoreHTTPSErrors: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--no-sandbox', '--headless=new'],
});
await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: 'https://meet.google.com' }).catch(() => {});
await ctx.route('https://meet.google.com/**', (route) => {
  const url = new URL(route.request().url());
  if (url.pathname === '/fixture.js') return route.fulfill({ contentType: 'text/javascript', body: readFileSync(join(here, 'fake-meet.js')) });
  const csp = "default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; frame-src https://meet.google.com"; // deliberately strict
  return route.fulfill({ contentType: 'text/html', headers: { 'content-security-policy': csp }, body: readFileSync(join(here, 'fake-meet.html')) });
});

let sw = ctx.serviceWorkers()[0] || await ctx.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
const page = await ctx.newPage();
const consoleErrors = [];
page.on('pageerror', (e) => consoleErrors.push(String(e)));
await page.goto(MEET);

// ---- injection ----
const panelFrame = await until(() => page.frames().find((f) => f.url().includes(`${extId}/src/panel/panel.html`)));
check('panel iframe injected on a meeting URL despite strict page CSP', Boolean(panelFrame));
const landing = await ctx.newPage(); await landing.goto('https://meet.google.com/landing');
await sleep(1500);
check('no panel on non-meeting Meet pages', !landing.frames().some((f) => f.url().includes('panel.html')));
await landing.close();

await panelFrame.locator('#pill').click();
check('panel expands', await panelFrame.locator('#card').isVisible());
const hostSize = await page.evaluate(() => { const r = document.getElementById('samvaad-panel-host').getBoundingClientRect(); return [r.width, r.height]; });
check('host iframe resized for expanded panel', hostSize[0] >= 300 && hostSize[1] >= 400, JSON.stringify(hostSize));

// ---- camera is never opened before an explicit action ----
check('camera idle before Start', await panelFrame.evaluate(() => !document.getElementById('preview').srcObject));

// ---- start via the same message the popup sends ----
const optionsPage = await ctx.newPage(); await optionsPage.goto(`chrome-extension://${extId}/src/options/options.html`);
const tabId = await optionsPage.evaluate(async () => { // no 'tabs' permission is needed: ask the relay which tab has a panel
  for (const t of await chrome.tabs.query({})) { const r = await chrome.runtime.sendMessage({ type: 'popup:get-status', tabId: t.id }); if (r.hasPanel) return t.id; } });
const status0 = await optionsPage.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'popup:get-status', tabId }), tabId);
check('service worker relays panel presence + status to popup', status0.hasPanel === true && status0.platform === 'meet', JSON.stringify(status0.status && status0.status.conn));
// save sign overrides through the real options page so we also test settings persistence
await optionsPage.fill('#serviceUrl', process.env.SERVICE_URL || 'ws://127.0.0.1:8765');
await optionsPage.locator('tr[data-label="hello"] input[type=checkbox]').nth(0).check();
await optionsPage.locator('tr[data-label="hello"] input[type=checkbox]').nth(1).check();
await optionsPage.click('#save');
check('options page saves', /Saved/.test(await optionsPage.textContent('#status')));
const rows = await optionsPage.locator('#signs tr').count();
check('options lists all 24 signs, unverified by default', rows === 24 && (await optionsPage.locator('tr[data-label="dog"] input[type=checkbox]').nth(0).isChecked()) === false);
const cmd = await optionsPage.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'popup:command', tabId, cmd: 'start' }), tabId);
check('popup start command delivered', cmd.ok === true);

await until(async () => (await panelFrame.textContent('#message')).startsWith('Ready'), 30000);
const msg1 = await panelFrame.textContent('#message');
check('connected to real service, camera on', msg1.startsWith('Ready (24 signs)'), msg1);
check('camera stream attached', await panelFrame.evaluate(() => document.getElementById('preview').srcObject?.getVideoTracks().some((t) => t.readyState === 'live')));
const st1 = await optionsPage.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'popup:get-status', tabId }), tabId);
check('popup status shows connected + camera on', st1.status?.conn === 'connected' && st1.status?.camera === 'on' && st1.status?.sessionActive === true);

// ---- record a clip through the real service ----
await panelFrame.click('#recordBtn');
await sleep(2000);
const info = await panelFrame.textContent('#clipInfo');
check('frames are streamed while recording', /\d+ frames sent/.test(info), info);
await panelFrame.click('#recordBtn');
await until(() => panelFrame.locator('#resultCard').isVisible());
const chips = await panelFrame.locator('#resultCard .chip').count();
check('prediction card shows top-3 with unverified tags', chips === 3 && (await panelFrame.locator('#resultCard .tag').first().textContent()).length > 0);
const text1 = await panelFrame.inputValue('#text');
const top1 = await panelFrame.locator('#resultCard .chip span').first().textContent();
console.log('   top prediction (random-weight fixture model, meaningless):', top1, '| text box:', JSON.stringify(text1));
check('prediction NOT auto-sent to chat', (await page.locator('#log li').count()) === 0);
if (!/^hello/.test(top1)) check('unverified/disabled sign was NOT auto-appended', text1 === '');
await panelFrame.locator('#resultCard .chip button').nth(1).click();
const text2 = await panelFrame.inputValue('#text');
check('suggestion chip + appends editable text', text2.length > 0, JSON.stringify(text2));

// ---- keyboard isolation ----
await panelFrame.locator('#text').click();
const keysBefore = await page.evaluate(() => window.pageKeys);
await panelFrame.locator('#text').pressSequentially(' c m x', { delay: 20 });
check('typing in the panel does not reach the meeting page (no Meet shortcuts)', (await page.evaluate(() => window.pageKeys)) === keysBefore);

// ---- send to (fake) chat ----
await page.bringToFront(); // the options tab opened earlier hides the meeting tab, and Chrome throttles timers in hidden tabs
await panelFrame.fill('#text', 'hello you');
await panelFrame.click('#sendBtn');
await until(async () => /Posted/.test(await panelFrame.textContent('#message')), 10000); // posted + confirmed back to the panel
check('Send posts reviewed text to the fake chat and clears editor', (await page.locator('#log li').first().textContent()) === 'hello you' && (await panelFrame.inputValue('#text')) === '', await panelFrame.textContent('#message'));

// ---- fallback when the chat box is missing ----
await page.evaluate(() => document.getElementById('chat').remove());
await panelFrame.fill('#text', 'fallback text');
await panelFrame.click('#sendBtn');
await until(async () => /clipboard/.test(await panelFrame.textContent('#message')), 10000);
const m3 = await panelFrame.textContent('#message');
check('missing chat -> clipboard fallback message', /not found/i.test(m3) && /clipboard/.test(m3), m3);
const clip = await panelFrame.evaluate(() => navigator.clipboard.readText().catch((e) => 'ERR ' + e.name));
console.log('   clipboard readback:', JSON.stringify(clip));
check('clipboard contains the text (or read blocked in headless)', clip === 'fallback text' || clip.startsWith('ERR'), clip);
await panelFrame.click('#clearBtn');
check('Clear empties editor', (await panelFrame.inputValue('#text')) === '');

// ---- stop releases camera + socket ----
await panelFrame.click('#sessionBtn');
await until(async () => (await panelFrame.textContent('#message')).includes('stopped'));
check('stop releases camera tracks', await panelFrame.evaluate(() => !document.getElementById('preview').srcObject));
const st2 = await optionsPage.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'popup:get-status', tabId }), tabId);
check('status after stop: idle, camera off, disconnected', st2.status?.sessionActive === false && st2.status?.camera === 'off' && st2.status?.conn === 'disconnected');

// ---- service unreachable ----
await optionsPage.fill('#serviceUrl', 'ws://127.0.0.1:59999');
await optionsPage.click('#save');
await optionsPage.evaluate((tabId) => chrome.runtime.sendMessage({ type: 'popup:command', tabId, cmd: 'start' }), tabId);
await until(async () => /Could not connect|Timed out/.test(await panelFrame.textContent('#message')), 15000);
const m4 = await panelFrame.textContent('#message');
check('unreachable service -> clear error, camera never left on', /recognition_service\.py/.test(m4) && (await panelFrame.evaluate(() => !document.getElementById('preview').srcObject)), m4);

// ---- non-local URL rejected in settings ----
await optionsPage.fill('#serviceUrl', 'ws://example.com:8765');
await optionsPage.click('#save');
check('options refuses a non-local service URL', /Only local/.test(await optionsPage.textContent('#status')));

check('no uncaught page errors', consoleErrors.length === 0, consoleErrors.join(' | '));
await ctx.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
