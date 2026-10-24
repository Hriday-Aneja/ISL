# Samvaad Chrome Extension (Google Meet) — Meeting Cards, Sign → Text, Speech → Sign

A Manifest V3 Chrome extension that lets an ISL signer use the **existing** Samvaad recognition service
(`include-ml/recognition_service.py`, 24-class Transformer) during a Google Meet call. Recognized signs appear as editable
text in a small panel; **nothing is ever sent until you press Send**.

Version 0.2 adds the **second direction, Speech → Sign**: what other people say (read from Meet's live captions, or from your
microphone) is shown as a transcript and played back by a signing avatar. See section 4.

```
Meet tab                                                       your computer only
┌──────────────────────────────┐   JPEG frames over ws://127.0.0.1:8765   ┌──────────────────────────┐
│ Samvaad panel (extension     │ ───────────────────────────────────────► │ recognition_service.py   │
│ iframe): camera, UI, socket  │ ◄─────────────────────────────────────── │ MediaPipe + checkpoint   │
└──────────────┬───────────────┘        prediction (label, top-5)          └──────────────────────────┘
               │ Send (you press it)
               ▼
   Meet chat box (best effort)  ──fallback──►  clipboard
```

## Status at a glance

| Item | Status |
|---|---|
| Extension code, popup, panel, options, camera, WebSocket client | Implemented |
| Unit tests (47, incl. Speech → Sign logic), syntax/manifest check | Pass |
| **Speech → Sign** (captions/mic/typed text → transcript → avatar), browser test in real Chromium against the **fake Meet page** (38 checks) | Pass |
| Sign → Text in a real Meet call | Reported working by the project owner (Oct 2026); not re-verified here |
| **Speech → Sign in real Google Meet** (caption scraping, real microphone, real H.264 avatar playback) | **Not tested**: needs a human in a real meeting |
| Browser test in real Chromium against a **fake Meet page** + **real `recognition_service.py`** (27 checks) | Pass |
| Python service protocol check (10 checks) with a **random-weight** checkpoint | Pass |
| Existing Python test `test_padding_mask.py`, both React app builds | Pass |
| **Real trained checkpoint inference** | **Not tested**: the checkpoint is not in the repository zip |
| **Real Google Meet** (panel injection, chat posting, camera prompt) | **Not tested**: needs a human in a real meeting |
| Zoom Web | Not implemented (architecture is ready, see below) |

## 1. Start the local Python service

Run from `isl-connect/include-ml`. Needs the trained checkpoint at `models/custom_scratch/custom_best.pth`
(it is git-ignored, so copy it in from wherever you trained it).

Windows (PowerShell), matching the repo's Python 3.12 setup:

```powershell
cd isl-connect\include-ml
py -3.12 -m venv venv312
.\venv312\Scripts\Activate.ps1
pip install -r requirements-service.txt
python recognition_service.py
```

macOS / Linux:

```bash
cd isl-connect/include-ml
python3.12 -m venv venv312 && source venv312/bin/activate
pip install -r requirements-service.txt
python recognition_service.py
```

Expect `ISL recognition service listening on ws://127.0.0.1:8765`. Options: `--model PATH`, `--port N`, `--device cpu|cuda`.

Versions this was tested with: Python 3.12, torch 2.14.1, **mediapipe 0.10.14**, **transformers 4.44.2**, numpy 1.26.4,
websockets 15.0.1, xgboost (imported by `INCLUDE-master/models/__init__.py`). `requirements.txt` does not pin versions, and the newest
`transformers` (5.x) breaks the model code (`IndexError` in `BertSelfAttention`), and newer mediapipe releases removed
`mp.solutions`. If the service fails at start-up or on the first prediction, pin those two:
`pip install "mediapipe==0.10.14" "transformers==4.44.2"`.

**One small change to existing code.** `recognition_service.py` now includes `flip_horizontal` (read from the checkpoint) in
the `ready` message. It is additive: the old fields and all other behavior are unchanged. The extension needs it because the
service does not mirror frames itself, while `live_inference.py` mirrors them when the checkpoint was trained on mirrored
clips. If an older service doesn't send it, the extension assumes "mirrored" (as `live_inference.py` does for legacy
checkpoints); override under Settings → Mirror.

Optional protocol check against a running service (synthetic frames, no person; checks protocol, not accuracy):

```bash
python ../chrome-extension/tools/protocol_check.py --url ws://127.0.0.1:8765
```

## 2. Load the unpacked extension

1. Open `chrome://extensions` and enable **Developer mode** (top right).
2. Click **Load unpacked** and select the `isl-connect/chrome-extension` folder (the one containing `manifest.json`).
3. Pin the Samvaad icon. Needs Chrome 116 or newer. There is no build step.

## 3. Test recognition and sending in a meeting

1. Make sure the Python service is running (step 1).
2. Join or start a Google Meet (`https://meet.google.com/abc-defg-hij`). A small **Samvaad** pill appears bottom-left. Click it to expand.
3. Click **Start recognition** (in the panel or the toolbar popup). This is the first moment the camera is requested. Chrome may
   prompt for the camera for the extension; click Allow. If it was blocked, click **Grant camera access** and allow it on the page that opens.
4. Status shows *Connected* and a mirrored preview appears (local only). Click **Record sign**, perform one sign, click **Stop & recognize**.
   (The service also auto-finishes a clip after its maximum frame count.)
5. The result card shows the top 3 with confidences. Every sign is marked **unverified** until you say otherwise (step 7), so by
   default nothing is added automatically: press **+** next to the prediction you want.
6. Edit the text freely. Open the Meet chat panel, then press **Send**. The extension fills the chat box and presses Meet's send button.
   If the chat box can't be found, it copies the text to your clipboard and tells you to paste it. **Copy** and **Clear** work as expected.
7. **Verifying signs.** Open Settings (panel footer link, or the extension's Options). Test each sign live several times; only
   tick **Verified** and **Enabled** for those that really work for you. Those are appended to the text automatically (still not sent).
   Optionally set a minimum confidence and top-1/top-2 margin; both use the model's real softmax output. They are off (0) by default
   because no recommended value has been measured.
8. **Stop recognition** releases the camera tracks and closes the WebSocket. Leaving the meeting does the same.

### Please report back after your first real Meet test
Whether (a) the panel appeared, (b) the camera prompt/permission flow worked, (c) **Send** posted to chat (or just filled it), and (d)
which Meet UI language/version you used. Meet's chat selectors are the most likely thing to need a tweak (`src/content/platforms/meet.js`).

## 4. Speech → Sign (captions or microphone → text → avatar)

Open the **Speech → Sign** tab in the panel.

1. Choose **Meeting captions** (other participants) or **My microphone**, then press **Start listening**.
2. For captions: press **Turn on Meet captions** (or use Meet's CC button). Samvaad reads the caption text from the page; it does
   not record meeting audio.
3. Speech appears in the transcript once the words stop changing (about 1.5 s, 0.7 s after a full stop), then the avatar signs it.
   The line above the transcript shows the caption live, before it is signed.
4. Anything can also be typed into the box at the bottom. Each transcript line has a **Sign** button to replay it.

```
Meet captions (DOM) ──► content script ──► panel: CaptionTracker ─┐
Microphone (Web Speech, on-device) ───────────────────────────────┼─► transcript ─► sign-mapper ─► avatar clips
Typed text ───────────────────────────────────────────────────────┘                    (config/avatar-signs.json)
```

What you will see, and why:

- **Words the avatar cannot sign are never hidden.** They stay in the transcript, underlined and listed under "Not covered by the avatar".
  A sign that is in the phrase table but has no video clip is shown as a text card with its name. Only function words
  (`a, an, the, is, are, am, was, were, be`; editable in `skipWords`) are left out without a flag.
- **Coverage today is tiny.** Only 11 signs have a clip: daughter, doctor, happy, hello, house, lawyer, parent, sad, student,
  train station, waiter. The phrase table maps 34 signs, so 23 of them (I, need, water, help, thank you, yes, no ...) currently show as text.
  Adding coverage means adding a clip under `assets/avatar/` and one line in `clips` in `config/avatar-signs.json`.
- **Order is English order**, except where a phrase entry reorders it (e.g. "where is the washroom" → WHERE WASHROOM). Nothing here
  claims to implement ISL grammar.
- **Backlog:** each clip is 2.5–6 s, so signing falls behind fast speech. Over 30 waiting signs, the oldest are dropped and the panel says how many.
  Speed (0.75–2×) and **Clear** are in the panel.
- **The avatar only runs while the Speech tab is open.** Lines that arrive while you are on the Sign → Text tab (or the panel is collapsed)
  are kept with a Sign button and an unread badge instead of building a stale queue.
- **Your own captions ("You")** are ignored unless enabled in Settings (the label is language-dependent).
- **Microphone mode hears only this computer's microphone**, not other participants. It is for a hearing person next to you, for testing, or for demos.
  Recognition runs **on-device** by default (needs a recent Chrome and a one-time language pack, installed from the panel). If on-device is
  unavailable Samvaad stops with a message; it does **not** silently use Chrome's cloud speech service. Turning "must run on-device" off
  in Settings allows cloud recognition for the microphone.
- Nothing is stored: the transcript lives in the panel's memory and disappears when the panel closes.
- Meet's captions are generated by Google Meet as part of the meeting; Samvaad adds no extra upload for them.

## Design

- **Panel is an extension iframe**, not injected DOM. Meet's page CSP can't block its WebSocket or camera code, and key presses
  typed into the text box never reach Meet's keyboard shortcuts (tested: zero events reach the page).
- **Camera + socket live in the panel**; the service worker is only a relay (`panel ↔ worker ↔ content script/popup`), so a worker restart never interrupts recognition.
- **Privacy:** the Service URL must be `ws://127.0.0.1`/`localhost` (Settings refuses anything else). No analytics, no remote
  requests, no host permissions beyond `meet.google.com`. Permissions: `storage`, `clipboardWrite`. Frames are sent only while you are
  recording a clip; the camera is opened only after you click Start.
- **Failure handling:** permission denied, no camera, camera busy, camera unplugged mid-session, service not running (clear message),
  connection lost mid-clip (clip discarded, auto-reconnect with back-off, stops fully and releases the camera after 5 failures),
  slow service (frames dropped, not queued), service not answering (timeout), too-short clip (service error is shown).
- **Filtering uses only real outputs:** confidence and top-1/top-2 margin. No temporal "stability" filter, because the service returns one
  prediction per recorded clip rather than a per-frame stream.
- Sign config: `config/default-signs.json` (all 24 labels; all `verified:false, enabled:false`). The checkpoint's own labels sent in
  `ready` are authoritative; your overrides live in `chrome.storage.sync`.

### File map

```
manifest.json
config/default-signs.json            24 labels, all unverified
src/background/service-worker.js     relay + badge
src/content/content.js               platform-independent: mounts panel, brokers chat posting, polls captions
src/content/platforms/registry.js    adapter interface (documented at top of file)
src/content/platforms/meet.js        Google Meet adapter (chat + captions)  <-- all Meet-specific code
src/panel/panel.js                   Sign -> Text session controller, tabs
src/panel/speech-tab.js              Speech -> Sign tab (captions / mic / typed text, transcript, avatar stage)
src/lib/                             recognition-client (WS protocol), camera, filters, settings,
                                     caption-tracker (settles live captions), sign-mapper (text -> signs),
                                     avatar-player (clip queue), speech-recognizer (on-device mic)
config/avatar-signs.json             sign -> clip, labels, phrase table, skipWords
assets/avatar/*.mp4                  the 11 avatar clips (copied from isl-comp/public/avatar-videos)
src/popup/  src/options/  src/permissions/
tests/                               node unit tests + tests/e2e (Chromium + fake Meet fixture)
tools/                               check-syntax, make_fixture_checkpoint.py, protocol_check.py
```

## Adding Zoom Web later (not implemented)

1. Add `src/content/platforms/zoom.js` calling `SamvaadPlatforms.register({id:'zoom', label, matches, isMeetingPage, sendChat})`
   (interface documented in `registry.js`).
2. Add it and the Zoom web-client URL pattern (`https://*.zoom.us/wc/*`) to `content_scripts` and `web_accessible_resources` in the manifest.
3. Add `zoom` to the platform label in `panel.js`. Nothing else changes: the panel, camera, protocol client and filters are platform-independent.

Open questions for Zoom: its chat DOM, whether the web client's CSP/iframe rules accept the panel iframe, and an actual live test.

## Running the tests

```bash
cd isl-connect/chrome-extension
npm install                  # only playwright-core, for the browser test
npm run check                # syntax + manifest references
npm test                     # 47 unit tests (protocol client, filters, settings, caption tracker, sign mapper, avatar queue, mic recognizer)

# Browser test: loads the extension in Chromium, fake camera + fake Meet page, real service (start it first)
xvfb-run -a env SERVICE_URL=ws://127.0.0.1:8765 node tests/e2e/run-e2e.mjs      # Linux headless
# set CHROME_PATH to your Chromium/Chrome binary if it is not at /opt/pw-browsers/chromium-1194/chrome-linux/chrome

# Speech -> Sign browser test (fake Meet page with a captions region; no recognition service needed)
xvfb-run -a node tests/e2e/run-e2e-speech.mjs

# Python
cd ../include-ml && python -m unittest test_padding_mask
python ../chrome-extension/tools/make_fixture_checkpoint.py --out /tmp/fixture_random.pth   # RANDOM weights, plumbing tests only
python recognition_service.py --model /tmp/fixture_random.pth --port 8765 --device cpu
```

`make_fixture_checkpoint.py` exists only because the trained checkpoint isn't in the repo. Its predictions are meaningless; never use
it for real recognition.

## Known limitations

- **Real Meet is untested.** Meet's DOM is obfuscated. Chat selectors are best-effort guesses from accessibility labels and fail safe (clipboard). The chat panel must be open.
- **Real checkpoint untested**, so accuracy and per-sign reliability are unknown. That is exactly why no sign is pre-verified.
- The camera permission prompt for an extension iframe was tested with Chromium's auto-accept flag only; the manual "Grant camera access" fallback page exists but was not exercised in a real prompt.
- Recognition is **clip-based** (press Record, sign one word, press Stop), because that is the existing service protocol. There is no continuous/hands-free mode.
- The service is single-purpose: it does not authenticate clients and any local web page could open `ws://127.0.0.1:8765`. It only returns predictions, but keep it bound to 127.0.0.1.
- The existing `recognition_service.py` closes the connection if classification throws in its auto-finish branch (no try/except there); left unchanged.
- Chrome throttles timers in hidden tabs, so keep the Meet tab in the foreground while signing.
- Icons are simple placeholders.
- The `isl-connect/frontend` build needs `npm install` in `avatar/` as well (pre-existing; it imports `../../../avatar`).
- **Speech → Sign: Meet's caption markup is an assumption.** `meet.js` finds the region labelled "Captions" and each speaker row by its avatar
  image, following what public Meet-caption scrapers report. It has not been checked against live Meet. If the region exists but rows are not
  recognised, the panel says so instead of guessing. Only `meet.js` needs to change then. Captions must be turned on in the meeting.
- Meet rewrites captions while people speak, so signing starts about 1.5 s after the words stop changing, and continuous speech is flushed
  every few seconds with the newest two words held back. A word Meet corrects after it was signed is not re-signed.
- **The avatar clips look AI-generated** (a 3D character, with a small sparkle mark in the corner of each video). Whether each clip is a
  correct ISL sign has not been checked; have an ISL signer review them before they are shown as ISL.
- The avatar clips are H.264 `.mp4`. Chrome plays them; the Chromium builds used by Playwright cannot, so automated tests cover the queue
  and the text fallback, not actual video playback.
- The speech-to-sign phrase table is the one from the web app (`isl-comp`), including its choices such as "home" → HOUSE. Review it with an ISL signer.
- Microphone permission for an extension iframe is requested through `src/permissions/permissions.html` ("Allow microphone"), the same way as the camera; not exercised in a real prompt.

## 5. Meeting Cards (v0.3.0)

Open the **Cards** tab in the panel. It works without the recognition service.

1. Tap a card such as **"Could you please repeat that?"**. The text appears in the editable box (nothing is sent yet).
2. Press **Send** (or Ctrl/⌘+Enter). The message goes to the Meet chat using your *send mode* setting (chat / fill / clipboard); if the chat box can't be found it is copied to the clipboard.
3. Type any message in the same box to send a typed reply. **Save as card** keeps it under *My cards* (max 12).
4. Tick **Send immediately when I tap a card** for one-tap replies.
5. **Show captions** displays Meet's live captions in a large, readable view (A−/A+ to resize). Use **Turn on Meet captions** if they are off.
6. A ▶ next to a card previews its sign in the panel. **Only you see this preview**; other participants receive the text. Sharing the avatar with other participants would need a camera-stream integration, which is not implemented.

Cards are defined in `config/meeting-cards.json` (`id`, `text`, optional `signs`). Tests: `npm test` (unit, `tests/cards.test.mjs`) and `npm run test:e2e:cards` (real Chromium against the fake Meet page). Like the rest of this extension, Cards has been tested against the fake Meet page only, not against real Google Meet.

