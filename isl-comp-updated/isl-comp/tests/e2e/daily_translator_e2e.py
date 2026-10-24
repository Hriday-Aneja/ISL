import json, sys, re, os
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get('DAILY_URL', 'http://127.0.0.1:5173/#/daily')
SHOTS = os.environ.get('DAILY_SHOTS', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'shots'))
os.makedirs(SHOTS, exist_ok=True)
UPSTREAM_LOG = os.environ.get('UPSTREAM_LOG', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'upstream.log'))

MOCKS = """
(() => {
  // ---- fake speech synthesis: records what would be spoken ----
  window.__spoken = [];
  const synth = {
    speaking: false,
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onstart && u.onstart(), 0); setTimeout(() => u.onend && u.onend(), 30); },
    cancel() {}, pause() {}, resume() {}, getVoices() { return []; },
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });

  // ---- fake speech recognition, driven from the test ----
  if (window.__noSR) { window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined; }
  else {
    class FakeSR {
      constructor() { window.__rec = this; this.started = false; }
      start() {
        if (window.__srError) { const e = window.__srError; setTimeout(() => this.onerror && this.onerror({ error: e }), 0); setTimeout(() => this.onend && this.onend(), 5); return; }
        this.started = true;
      }
      stop() { this.started = false; setTimeout(() => this.onend && this.onend(), 0); }
      emit(parts) { // parts: [[text, isFinal], ...]
        const results = parts.map(([t, f]) => Object.assign([{ transcript: t }], { isFinal: f }));
        this.onresult && this.onresult({ resultIndex: 0, results });
      }
    }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
  }
})();
"""

fails, passes = [], []
def check(name, cond, detail=''):
    (passes if cond else fails).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{detail}]' if detail and not cond else ''))

def new_page(browser, w=1280, h=800, init=MOCKS, storage=None):
    ctx = browser.new_context(viewport={'width': w, 'height': h})
    ctx.add_init_script(init)
    page = ctx.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    page.on('console', lambda m: errors.append(m.text) if m.type == 'error' else None)
    page.__errors = errors
    return ctx, page

def conv(page):
    return page.locator('aside[aria-label="Conversation"]')

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox'])

    # ========== 1. scenario selection ==========
    ctx, page = new_page(browser)
    page.goto(BASE); page.wait_for_selector('text=What situation are you in?')
    names = ['Healthcare','Shopping / Restaurant','College / Education','Workplace','Travel','Everyday Conversation','Emergency','Custom Situation']
    ok = all(page.get_by_role('button', name=n).count() >= 1 for n in names)
    check('scenario picker shows the question and all 8 scenarios', ok)
    page.screenshot(path=f'{SHOTS}/01-scenarios-desktop.png')
    check('emergency phrases visible before choosing a scenario', page.get_by_role('button', name='Please help me!').count() == 1)

    # ========== 2. cards -> conversation, TTS, recents ==========
    page.get_by_role('button', name=re.compile('^Healthcare')).click()
    page.wait_for_selector('text=I need to see a doctor.')
    page.get_by_role('button', name='I need to see a doctor.', exact=True).click()
    check('card appears in the conversation as "You"', conv(page).get_by_text('I need to see a doctor.').count() == 1 and conv(page).get_by_text('You', exact=True).count() >= 1)
    check('selected card is spoken aloud (TTS)', page.evaluate('window.__spoken') == ['I need to see a doctor.'], page.evaluate('window.__spoken'))
    check('message has a timestamp', conv(page).locator('time').count() == 1)
    page.screenshot(path=f'{SHOTS}/02-healthcare-desktop.png')

    page.get_by_role('tab', name='Saved').click()
    check('used card shows in Recently used', page.locator('#recent-heading + div').get_by_text('I need to see a doctor.').count() == 1)

    # ========== 3. emergency quick phrase ==========
    page.get_by_role('button', name='I need a doctor now.').click()
    check('emergency phrase sends + speaks in one tap', 'I need a doctor now.' in page.evaluate('window.__spoken') and conv(page).get_by_text('Emergency').count() >= 1)

    # ========== 4. search ==========
    page.get_by_role('tab', name='Cards').click()
    page.get_by_label('Search cards').fill('water')
    page.wait_for_selector('text=card')
    check('search finds cards across scenarios', page.locator('[role=status]', has_text=re.compile('found')).count() >= 1 and page.get_by_role('button', name='I need water, please.').count() >= 1)
    page.get_by_label('Search cards').fill('zzzzqq')
    check('empty search offers to create a card', page.get_by_role('button', name=re.compile('Make a card saying')).count() == 1)
    page.get_by_label('Search cards').fill('')

    # ========== 5. favourites persist ==========
    page.get_by_role('button', name='Add to favourites: I have a fever.').click()
    check('favourite star toggles', page.get_by_role('button', name='Remove from favourites: I have a fever.').get_attribute('aria-pressed') == 'true')
    page.reload(); page.wait_for_selector('text=What situation are you in?')
    page.get_by_role('button', name=re.compile('^Healthcare')).click()
    check('favourite survives reload', page.get_by_role('button', name='Remove from favourites: I have a fever.').count() == 1)
    check('conversation survives reload', conv(page).get_by_text('I need to see a doctor.').count() == 1)

    # ========== 6. custom cards: create / edit / delete ==========
    page.get_by_role('button', name='New card').click()
    page.get_by_label('Message', exact=True).fill('I need to sit down.')
    page.get_by_role('button', name='Save card').click()
    check('custom card created', page.get_by_role('button', name='I need to sit down.', exact=True).count() == 1)
    page.get_by_role('button', name='New card').click()
    page.get_by_label('Message', exact=True).fill('  i need   to sit DOWN. ')
    page.get_by_role('button', name='Save card').click()
    check('duplicate custom card is rejected with a message', page.get_by_role('alert').filter(has_text='already have').count() == 1)
    page.keyboard.press('Escape')
    check('Escape closes the editor', page.get_by_role('dialog').count() == 0)
    page.get_by_role('button', name='Edit card: I need to sit down.').click()
    page.get_by_label('Message', exact=True).fill('I need a chair.')
    page.get_by_role('button', name='Save changes').click()
    check('custom card edited', page.get_by_role('button', name='I need a chair.', exact=True).count() == 1 and page.get_by_role('button', name='I need to sit down.', exact=True).count() == 0)
    page.reload(); page.get_by_role('button', name=re.compile('^Healthcare')).click()
    check('custom card persists after reload', page.get_by_role('button', name='I need a chair.', exact=True).count() == 1)
    page.get_by_role('button', name='Edit card: I need a chair.').click()
    page.get_by_role('button', name='Delete card').click()
    page.get_by_role('button', name='Yes, delete').click()
    check('custom card deleted (with confirmation)', page.get_by_role('button', name='I need a chair.', exact=True).count() == 0)
    page.get_by_role('button', name='Save a copy to edit: I have a fever.').click()
    check('preset card can be copied into the editor', page.get_by_label('Message', exact=True).input_value() == 'I have a fever.')
    page.keyboard.press('Escape')

    # ========== 7. AI recommendations (real backend -> fake upstream) ==========
    page.get_by_role('button', name='Change situation').click()
    page.get_by_role('button', name=re.compile('^Travel')).click()
    page.wait_for_selector('text=More suggestions')
    page.get_by_role('button', name='More suggestions').first.click()
    page.locator('#more-suggestions-heading + span').filter(has_text='AI').wait_for(timeout=10000)
    check('More suggestions returns AI cards with an AI badge', page.locator('#more-suggestions-heading + span').inner_text().strip() == 'AI')
    favs = page.locator('section[aria-labelledby=more-suggestions-heading] button[aria-label^="Add to favourites: "]')
    first_text = favs.first.get_attribute('aria-label').replace('Add to favourites: ', '')
    first = page.get_by_role('button', name=first_text, exact=True)
    check('AI suggestion shown as a normal card', favs.count() == 8 and first.count() == 1, favs.count())
    first.click()
    check('AI suggestion usable like a normal card', conv(page).get_by_text(first_text).count() == 1)
    page.get_by_role('button', name='Show more').click()
    page.wait_for_function("document.querySelectorAll('section[aria-labelledby=more-suggestions-heading] button[aria-label^=\"Add to favourites\"]').length > 8")
    check('Show more appends further suggestions', True)
    page.screenshot(path=f'{SHOTS}/03-ai-suggestions-desktop.png', full_page=True)

    # fallback when AI errors
    page.route('**/api/daily/suggest', lambda r: r.fulfill(status=502, content_type='application/json', body='{"error":"ai-upstream-error"}'))
    page.get_by_role('button', name='Change situation').click()
    page.get_by_role('button', name=re.compile('^Workplace')).click()
    page.get_by_role('button', name='More suggestions').first.click()
    page.locator('#more-suggestions-heading + span').filter(has_text='Built-in').wait_for(timeout=10000)
    check('API failure falls back to built-in suggestions with a notice', page.locator('[role=status]', has_text='built-in suggestions').count() >= 1 and page.get_by_role('button', name='Could you send the details by email?', exact=True).count() == 1)
    page.unroute('**/api/daily/suggest')

    # network down
    page.route('**/api/daily/suggest', lambda r: r.abort())
    page.get_by_role('button', name='Change situation').click()
    page.get_by_role('button', name=re.compile('^College')).click()
    page.get_by_role('button', name='More suggestions').first.click()
    page.locator('#more-suggestions-heading + span').filter(has_text='Built-in').wait_for(timeout=10000)
    check('network error falls back to built-in suggestions', page.locator('[role=status]', has_text="Couldn't reach").count() == 1)
    page.unroute('**/api/daily/suggest')

    # custom situation
    page.get_by_role('button', name='Change situation').click()
    page.get_by_role('button', name=re.compile('^Custom')).click()
    check('custom: suggestions button disabled until a description is given', page.get_by_role('button', name='More suggestions').first.is_disabled())
    page.get_by_role('textbox', name='Describe your situation').fill('I am at the bank to open an account')
    page.get_by_role('button', name='Get cards for this situation').click()
    page.locator('#more-suggestions-heading + span').filter(has_text='AI').wait_for(timeout=10000)
    check('custom situation fetches suggestions from the description', page.locator('section[aria-labelledby=more-suggestions-heading] button[aria-label^="Add to favourites"]').count() >= 1)
    log = open(UPSTREAM_LOG).read()
    check('API key sent only server-side (browser never sees it)', 'key= sk-e2e-test' in log and 'sk-e2e-test' not in page.content())
    page.screenshot(path=f'{SHOTS}/04-custom-desktop.png')

    # ========== 8. ISL Signs ==========
    page.get_by_role('button', name='Change situation').click()
    page.get_by_role('button', name=re.compile('^Everyday')).click()
    page.get_by_role('tab', name=re.compile('ISL Signs')).click()
    page.wait_for_selector('text=248 signs')
    check('ISL Signs category lists all 248 CSV signs and is honest about video count', page.get_by_text('Only 11 have a video').count() == 1 and page.get_by_role('status').filter(has_text='248 signs').count() == 1)
    page.get_by_role('button', name=re.compile('^Has video')).click()
    check('"Has video" filter shows exactly the 11 real videos', page.get_by_role('status').filter(has_text=re.compile('^11 signs')).count() == 1)
    page.get_by_role('button', name=re.compile('^Has video')).click()
    page.get_by_label('Search signs').fill('doctor')
    page.get_by_role('button', name=re.compile('^Doctor, Jobs')).click()
    page.wait_for_selector('video')
    check('sign dialog plays a real video for an available sign', page.locator('video').get_attribute('src') == '/avatar-videos/doctor.mp4')
    ready = page.evaluate("new Promise(r => { const v=document.querySelector('video'); if (v.readyState>=1) r(v.duration); else v.addEventListener('loadedmetadata', () => r(v.duration)); setTimeout(()=>r(-1), 8000) })")
    check('the video file actually loads in the browser', ready and ready > 1, ready)
    page.get_by_role('button', name='Replay').click()
    page.screenshot(path=f'{SHOTS}/05-sign-video-desktop.png')
    page.get_by_role('button', name='Add to favourites').last.click()
    page.get_by_role('button', name='Add to conversation').click()
    check('sign added to the conversation with its video', conv(page).locator('video').count() >= 1 and conv(page).get_by_text('ISL sign').count() >= 1)
    check('signs are not spoken-as-card but name is spoken', 'Doctor' in page.evaluate('window.__spoken'))
    page.get_by_label('Search signs').fill('water')
    page.get_by_role('button', name=re.compile('^Water, Society|^Water')).first.click() if page.get_by_role('button', name=re.compile('^Water')).count() else None
    page.get_by_label('Search signs').fill('thank')
    page.get_by_role('button', name=re.compile('^Thank you')).first.click()
    check('sign without a video is clearly marked unavailable', page.get_by_text('No sign video is available for this sign yet').count() == 1 and page.locator('[role=dialog] video').count() == 0)
    page.screenshot(path=f'{SHOTS}/06-sign-unavailable-desktop.png')
    page.get_by_role('button', name='Add to conversation').click()
    check('unavailable sign added by name with a clear notice', conv(page).get_by_text(re.compile('No sign video is available for')).count() == 1)
    page.get_by_role('tab', name='Saved').click()
    check('favourite sign appears in Saved', page.locator('#fav-signs-heading ~ div').get_by_text('Doctor').count() >= 1)

    # words-in-message lookup is labelled as a lookup, not a translation
    page.get_by_role('tab', name='Cards').click()
    page.get_by_role('button', name='Hello.', exact=True).click()
    conv(page).get_by_role('button', name=re.compile('Signs in this message')).last.click()
    check('"Signs in this message" is labelled as word matching, not translation', page.get_by_text('This is not an ISL translation of the sentence').count() == 1)

    # ========== 9. voice ==========
    page.get_by_role('button', name='Speak into the microphone').click()
    page.evaluate("window.__rec.emit([['hello how are', false]])")
    page.wait_for_function("document.getElementById('composer-draft').value === 'hello how are'", timeout=3000)
    check('interim transcript appears live in the box', True)
    page.evaluate("window.__rec.emit([['hello how are you', true], ['today', false]])")
    page.wait_for_function("document.getElementById('composer-draft').value === 'hello how are you today'", timeout=3000)
    check('final + interim words shown together', True)
    page.get_by_role('button', name='Stop listening').click()
    box = page.get_by_label('Message to add to the conversation')
    box.fill('Hello, how are you today?')
    check('transcript is editable before sending', box.input_value() == 'Hello, how are you today?')
    n_before = len(page.evaluate('window.__spoken'))
    page.get_by_role('button', name='Send', exact=True).click()
    check('confirmed speech message sent as "Other person" / Speech', conv(page).get_by_text('Other person').count() >= 1 and conv(page).get_by_text('Hello, how are you today?').count() == 1 and conv(page).get_by_text(re.compile('Speech')).count() >= 1)
    check("other person's words are not read back aloud", len(page.evaluate('window.__spoken')) == n_before)
    page.get_by_label('Message to add to the conversation').fill('Typed by me')
    page.get_by_role('button', name='Me', exact=True).click()
    page.get_by_label('Message to add to the conversation').press('Enter')
    check('typing works as an alternative (Enter sends, as "Me")', conv(page).get_by_text('Typed by me').count() == 1)
    page.screenshot(path=f'{SHOTS}/07-conversation-desktop.png')
    # speak button on a message
    n = len(page.evaluate('window.__spoken'))
    conv(page).get_by_role('button', name='Speak this message aloud').last.click()
    check('"Speak" repeats a message aloud', len(page.evaluate('window.__spoken')) == n + 1 and page.evaluate('window.__spoken')[-1] == 'Typed by me')

    real = [e for e in page.__errors if 'Failed to load resource' not in e]
    check('no JS errors in the main flow (deliberate 502/abort + font-CDN failures ignored)', len(real) == 0, real)
    ctx.close()

    # ========== 10. speech errors ==========
    ctx, page = new_page(browser, init='window.__srError="not-allowed";' + MOCKS)
    page.goto(BASE); page.get_by_role('button', name='Speak into the microphone').click()
    page.wait_for_selector('[role=alert]')
    check('microphone permission denied -> clear, actionable message', page.get_by_role('alert').filter(has_text='Microphone access was denied').count() == 1 and page.get_by_role('alert').filter(has_text='lock icon').count() == 1)
    check('typing still available after mic error', page.get_by_label('Message to add to the conversation').is_enabled())
    ctx.close()

    ctx, page = new_page(browser, init='window.__srError="network";' + MOCKS)
    page.goto(BASE); page.get_by_role('button', name='Speak into the microphone').click()
    page.wait_for_selector('[role=alert]')
    check('recognition network error -> message', page.get_by_role('alert').filter(has_text='internet connection').count() == 1)
    ctx.close()

    ctx, page = new_page(browser, init='window.__noSR=true;' + MOCKS)
    page.goto(BASE)
    check('unsupported browser: mic disabled + explanation', page.get_by_role('button', name='Speak into the microphone').is_disabled() and page.get_by_role('alert').filter(has_text='not supported in this browser').count() == 1)
    page.get_by_label('Message to add to the conversation').fill('typing only')
    page.get_by_role('button', name='Send', exact=True).click()
    check('unsupported browser: typing still sends', conv(page).get_by_text('typing only').count() == 1)
    ctx.close()

    ctx, page = new_page(browser, init='delete window.speechSynthesis;')
    page.goto(BASE)
    page.get_by_role('button', name=re.compile('^Travel')).click()
    page.get_by_role('button', name='Thank you.', exact=True).click()
    check('no speechSynthesis: still works, Speak buttons hidden + notice', conv(page).get_by_role('button', name='Speak this message aloud').count() == 0 and conv(page).get_by_role('button', name='Speak into the microphone').count() == 1 and conv(page).get_by_text('not supported in this browser').count() >= 1)
    ctx.close()

    # ========== 11. focus mode + settings ==========
    ctx, page = new_page(browser)
    page.goto(BASE); page.get_by_role('button', name=re.compile('^Everyday')).click()
    page.get_by_role('button', name='Hello.', exact=True).click()
    page.get_by_role('button', name='Thank you.', exact=True).click()
    page.get_by_role('button', name='Full screen focus mode').click()
    dlg = page.get_by_role('dialog', name='Focus mode')
    check('focus mode opens full screen on the latest message', dlg.get_by_text('Thank you.').count() == 1 and '2 of 2' in dlg.inner_text())
    size = dlg.locator('p').first.evaluate("e => parseFloat(getComputedStyle(e).fontSize)")
    check('focus mode text is very large', size >= 36, size)
    page.keyboard.press('ArrowLeft')
    check('arrow keys move between messages', dlg.get_by_text('Hello.').count() == 1)
    page.screenshot(path=f'{SHOTS}/08-focus-desktop.png')
    page.keyboard.press('Escape')
    check('Escape closes focus mode', page.get_by_role('dialog').count() == 0)

    page.get_by_role('button', name='Settings').click()
    page.get_by_role('switch', name='High contrast').click()
    page.get_by_role('switch', name='Large text').click()
    page.get_by_role('switch', name='Speak my messages aloud').click()
    page.get_by_role('button', name='Done').click()
    check('high contrast class applied', page.locator('.daily-contrast').count() == 1)
    n = len(page.evaluate('window.__spoken'))
    page.get_by_role('button', name='Sorry.', exact=True).click()
    check('auto-speak can be turned off', len(page.evaluate('window.__spoken')) == n)
    page.reload()
    check('settings persist', page.locator('.daily-contrast').count() == 1)
    page.screenshot(path=f'{SHOTS}/09-contrast-desktop.png')

    # clear conversation
    page.get_by_role('button', name='Clear conversation').click()
    page.get_by_role('button', name='Yes, clear').click()
    check('clear conversation shows empty state', conv(page).get_by_text('No messages yet').count() == 1)
    ctx.close()

    # ========== 12. keyboard-only ==========
    ctx, page = new_page(browser)
    page.goto(BASE); page.wait_for_selector('text=What situation are you in?')
    for _ in range(30):
        page.keyboard.press('Tab')
        if page.evaluate("document.activeElement && document.activeElement.textContent && document.activeElement.textContent.includes('Healthcare')"): break
    page.keyboard.press('Enter')
    page.wait_for_selector('text=I need to see a doctor.')
    check('keyboard: can reach and activate a scenario', page.get_by_role('button', name='Change situation').count() == 1)
    page.get_by_role('tab', name='Cards').focus(); page.keyboard.press('ArrowRight')
    check('keyboard: arrow keys switch tabs', page.get_by_role('tab', name=re.compile('ISL Signs')).get_attribute('aria-selected') == 'true')
    page.get_by_role('tab', name='Saved').focus(); page.keyboard.press('Enter')
    page.keyboard.press('Tab')
    outline = page.evaluate("getComputedStyle(document.activeElement).outlineStyle")
    check('keyboard: focus ring visible', outline != 'none', outline)
    ctx.close()

    # ========== 13. offline notice ==========
    ctx, page = new_page(browser)
    page.goto(BASE); ctx.set_offline(True)
    page.evaluate("window.dispatchEvent(new Event('offline'))")
    check('offline banner shown', page.get_by_text('You are offline').count() == 1)
    page.get_by_role('button', name=re.compile('^Travel')).click()
    page.get_by_role('button', name='Thank you.', exact=True).click()
    check('cards still work offline', conv(page).get_by_text('Thank you.').count() == 1)
    ctx.set_offline(False); ctx.close()

    # ========== 14. responsive ==========
    for label, w, h in [('mobile', 375, 812), ('tablet', 768, 1024), ('desktop', 1440, 900)]:
        ctx, page = new_page(browser, w, h)
        page.goto(BASE)
        page.get_by_role('button', name=re.compile('^Travel')).click()
        page.get_by_role('button', name='Thank you.', exact=True).click()
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f'{label} ({w}px): no horizontal scroll on cards page', overflow <= 0, overflow)
        dupes = page.evaluate("[...document.querySelectorAll('[id]')].map(e=>e.id).filter((id,i,a)=>a.indexOf(id)!==i)")
        check(f'{label}: no duplicate element ids', len(dupes) == 0, dupes)
        small = page.evaluate("""[...document.querySelectorAll('main button, main a, main [role=tab]')].filter(e => {const r=e.getBoundingClientRect(); return r.width>0 && r.height>0 && (r.height<40)}).map(e=>(e.getAttribute('aria-label')||e.textContent).trim().slice(0,30)+':'+Math.round(e.getBoundingClientRect().height))""")
        check(f'{label}: all interactive controls >= 40px tall', len(small) == 0, small[:6])
        page.screenshot(path=f'{SHOTS}/10-{label}-cards.png')
        if w < 1024:
            check(f'{label}: confirmation toast after choosing a card', page.get_by_text('Added to conversation').count() == 1)
            check(f'{label}: fixed Conversation bar shows the count', page.get_by_role('button', name=re.compile(r'^Conversation \(1\)')).is_visible())
            page.get_by_role('button', name=re.compile('^Conversation')).click()
            page.wait_for_selector('[role=dialog] [role=log]')
            check(f'{label}: conversation opens as a sheet with composer', page.get_by_label('Message to add to the conversation').is_visible() and page.get_by_text('Thank you.').count() >= 1)
            overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
            check(f'{label}: no horizontal scroll in conversation sheet', overflow <= 0, overflow)
            page.screenshot(path=f'{SHOTS}/11-{label}-conversation.png')
            page.get_by_role('button', name='Close conversation').click()
        page.get_by_role('tab', name=re.compile('ISL Signs')).click()
        page.wait_for_selector('text=248 signs')
        overflow = page.evaluate("document.documentElement.scrollWidth - document.documentElement.clientWidth")
        check(f'{label}: no horizontal scroll on ISL Signs', overflow <= 0, overflow)
        page.screenshot(path=f'{SHOTS}/12-{label}-signs.png')
        ctx.close()

    # ========== 15. existing pages unharmed ==========
    for path, marker in [('#/', 'Signs speak'), ('#/how-it-works', 'Two directions'), ('#/room', None)]:
        ctx, page = new_page(browser)
        page.goto('http://127.0.0.1:5173/' + path)
        page.wait_for_timeout(1200)
        if marker: check(f'existing page {path} still renders', page.get_by_text(re.compile(marker)).count() >= 1)
        else: check(f'existing page {path} still renders', page.locator('body').inner_text().strip() != '')
        errs = [e for e in page.__errors if 'socket' not in e.lower() and 'websocket' not in e.lower() and 'ERR_' not in e and 'Failed to load resource' not in e]
        check(f'existing page {path}: no JS errors', len(errs) == 0, errs[:3])
        if path == '#/':
            check('Daily Translator reachable from landing nav', page.get_by_role('link', name='Daily Translator').count() >= 1)
        ctx.close()

    browser.close()

print(f'\n{len(passes)} passed, {len(fails)} failed')
if fails: print('FAILED:', fails); sys.exit(1)
