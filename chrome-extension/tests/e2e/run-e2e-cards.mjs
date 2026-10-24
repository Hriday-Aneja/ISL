// Browser-level test of the Cards tab: loads the unpacked extension into real Chromium, serves the FAKE Meet page
// (tests/e2e/fake-meet.*) and drives the real panel UI. It does NOT test the real Google Meet. Needs no recognition service.
// Usage: CHROME_PATH=/path/to/chrome node tests/e2e/run-e2e-cards.mjs
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

const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), 'samvaad-e2e-cards-')), {
  executablePath: CHROME, headless: false, ignoreHTTPSErrors: true,
  args: [`--disable-extensions-except=${extPath}`, `--load-extension=${extPath}`, '--no-sandbox', '--headless=new'],
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

// ---- tab ----
check('Cards tab exists and is hidden by default', (await frame.locator('#tabCards').count()) === 1 && !(await frame.locator('#paneCards').isVisible()));
await frame.locator('#tabCards').click();
check('Cards tab opens, other tabs hide', await frame.locator('#paneCards').isVisible() && !(await frame.locator('#paneSign').isVisible()) && !(await frame.locator('#paneSpeech').isVisible()));
check('aria-selected follows', (await frame.locator('#tabCards').getAttribute('aria-selected')) === 'true' && (await frame.locator('#tabSign').getAttribute('aria-selected')) === 'false');
await frame.locator('#tabCards').press('ArrowRight');
check('arrow keys wrap from Cards to Sign', await frame.locator('#paneSign').isVisible());
await frame.locator('#tabSign').press('ArrowLeft');
check('arrow keys wrap from Sign to Cards', await frame.locator('#paneCards').isVisible());

// ---- cards render ----
check('cards from the config are rendered', await until(async () => (await frame.locator('#cardGrid .card-main').count()) >= 10, 4000), String(await frame.locator('#cardGrid .card-main').count()));
for (const t of ['Could you please repeat that?', 'Please speak slowly.', 'I have a question.', "I didn't understand."]) {
  check(`card present: ${t}`, (await frame.locator('#cardGrid .card-main', { hasText: t }).count()) === 1);
}
check('cards are grouped under headings', (await frame.locator('#cardGrid .card-cat').count()) >= 3);

// ---- tap fills, does not send ----
await frame.locator('#cardGrid .card-main', { hasText: 'Could you please repeat that?' }).click();
check('tapping a card fills the editable box', (await frame.inputValue('#cardText')) === 'Could you please repeat that?');
await sleep(300);
check('tapping a card does NOT post to the meeting chat', (await page.locator('#log li').count()) === 0);
check('selected card is marked', (await frame.locator('#cardGrid .card-item.selected').count()) === 1);
await frame.fill('#cardText', 'Could you please repeat that, slowly?');
check('editing the text clears the selected mark', (await frame.locator('#cardGrid .card-item.selected').count()) === 0);

// ---- Send posts to chat ----
await page.bringToFront();
await frame.click('#cardSend');
await until(async () => (await page.locator('#log li').count()) === 1, 10000);
check('Send posts the (edited) card text to the fake chat', (await page.locator('#log li').first().textContent()) === 'Could you please repeat that, slowly?', await frame.textContent('#cardsMessage'));
check('box is cleared after a confirmed send', await until(async () => (await frame.inputValue('#cardText')) === '' && /Posted/.test(await frame.textContent('#cardsMessage')), 8000), await frame.textContent('#cardsMessage'));

// ---- typed message ----
await frame.fill('#cardText', 'Thanks, I will type my answer.');
await frame.click('#cardSend');
await until(async () => (await page.locator('#log li').count()) === 2, 10000);
await until(async () => (await frame.inputValue('#cardText')) === '', 8000);
check('typed messages are shared the same way', (await page.locator('#log li').nth(1).textContent()) === 'Thanks, I will type my answer.');
await frame.click('#cardSend');
check('empty send is refused with a message', /Nothing to send/.test(await frame.textContent('#cardsMessage')) && (await page.locator('#log li').count()) === 2);

// ---- typing in the panel never reaches the meeting page ----
await page.evaluate(() => { window.pageKeys = 0; });
await frame.locator('#cardText').pressSequentially(' c m x', { delay: 10 });
check('typing in the Cards box does not trigger Meet shortcuts', (await page.evaluate(() => window.pageKeys)) === 0);
await frame.fill('#cardText', '');

// ---- custom cards ----
await frame.fill('#cardText', 'Please share the slides.');
await frame.click('#cardSave');
check('Save as card adds a "My cards" entry', await until(async () => (await frame.locator('#cardGrid .card-main', { hasText: 'Please share the slides.' }).count()) === 1, 4000));
await frame.fill('#cardText', 'Please share the slides.');
await frame.click('#cardSave');
check('duplicate custom card is rejected', /already exists/.test(await frame.textContent('#cardsMessage')));
await page.reload();
const frame2 = await until(() => page.frames().find((f) => f.url().includes(`${extId}/src/panel/panel.html`)), 8000);
await frame2.locator('#pill').click();
await frame2.locator('#tabCards').click();
check('custom card persists after reload', await until(async () => (await frame2.locator('#cardGrid .card-main', { hasText: 'Please share the slides.' }).count()) === 1, 4000));
await frame2.locator('#cardGrid .card-item', { hasText: 'Please share the slides.' }).locator('.card-aux').last().click();
check('custom card can be removed', await until(async () => (await frame2.locator('#cardGrid .card-main', { hasText: 'Please share the slides.' }).count()) === 0, 3000));

// ---- quick send ----
await frame2.locator('#cardsQuick').check();
await sleep(300);
await page.bringToFront();
await frame2.locator('#cardGrid .card-main', { hasText: 'I have a question.' }).click();
await until(async () => (await page.locator('#log li').count()) === 1, 10000); // the page was reloaded above, so its chat log restarted
check('with "send immediately" a tap sends the card', (await page.locator('#log li').nth(0).textContent()) === 'I have a question.');
await frame2.locator('#cardsQuick').uncheck();

// ---- avatar preview is local and honest ----
check('only cards with signs get a preview button', (await frame2.locator('#cardGrid .card-item', { hasText: 'Could you please repeat that?' }).locator('.card-aux').count()) === 0 && (await frame2.locator('#cardGrid .card-item', { hasText: 'Thank you.' }).locator('.card-aux').count()) === 1);
check('preview box is hidden until used', !(await frame2.locator('#cardPreviewBox').isVisible()));
await frame2.locator('#cardGrid .card-item', { hasText: 'Thank you.' }).locator('.card-aux').click();
check('preview shows the sign (text card, no clip for THANK_YOU)', await until(async () => /Thank you/.test(await frame2.textContent('#cardStageText')), 3000) && await frame2.locator('#cardPreviewBox').isVisible());
check('preview states it is local only', /only to you/i.test(await frame2.locator('#cardPreviewBox .note').innerText()));
check('preview did not post anything to chat', (await page.locator('#log li').count()) === 1);

// ---- captions ----
await frame2.locator('#capToggle').click();
check('Show captions reports a missing captions region', await until(async () => /not detected/.test(await frame2.textContent('#capStatus')), 4000), await frame2.textContent('#capStatus'));
await frame2.locator('#capEnable').click();
check('"Turn on Meet captions" presses the page button', await until(async () => (await page.locator('[role=region][aria-label=Captions]').count()) === 1, 3000));
await page.evaluate(() => window.__setCaptions([{ speaker: 'Teacher', text: 'Open your books to page ten' }]));
check('captions appear in the readable view', await until(async () => (await frame2.locator('#capView li', { hasText: 'Open your books to page ten' }).count()) === 1, 5000));
check('speaker is shown', /Teacher/.test(await frame2.locator('#capView li').first().innerText()));
await page.evaluate(() => window.__setCaptions([{ speaker: 'Teacher', text: 'Open your books to page ten and read' }]));
check('a growing caption updates in place (no duplicate rows)', await until(async () => (await frame2.locator('#capView li').count()) === 1 && /and read/.test(await frame2.locator('#capView li').first().innerText()), 4000));
const sizeBefore = await frame2.locator('#capView').evaluate((el) => parseInt(getComputedStyle(el).fontSize, 10));
await frame2.locator('#capLarger').click();
const sizeAfter = await frame2.locator('#capView').evaluate((el) => parseInt(getComputedStyle(el).fontSize, 10));
check('A+ makes caption text larger', sizeAfter > sizeBefore, `${sizeBefore} -> ${sizeAfter}`);
await frame2.locator('#capSmaller').click();
await frame2.locator('#capSmaller').click();
check('A- makes it smaller again', (await frame2.locator('#capView').evaluate((el) => parseInt(getComputedStyle(el).fontSize, 10))) < sizeAfter);
await frame2.locator('#capClear').click();
check('Clear empties the view', (await frame2.locator('#capView li').count()) === 0);

// ---- captions are shared with the Speech tab without stepping on each other ----
await frame2.locator('#tabSpeech').click();
await frame2.locator('#listenBtn').click();
check('Speech tab can listen while Cards captions are on', await until(async () => /Listening to Meet captions/.test(await frame2.textContent('#speechMessage')), 4000));
await frame2.locator('#listenBtn').click(); // stop speech listening
await page.evaluate(() => window.__setCaptions([{ speaker: 'Teacher', text: 'Now question one' }]));
check('stopping Speech listening does not stop the Cards captions', await until(async () => (await frame2.locator('#paneCards #capView li', { hasText: 'Now question one' }).count()) === 1, 4000));
await frame2.locator('#tabCards').click();
await frame2.locator('#capToggle').click();
check('Hide captions works', (await frame2.textContent('#capToggle')) === 'Show captions');

check('no uncaught errors on the meeting page', pageErrors.length === 0, pageErrors.join(' | '));
await ctx.close();
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
