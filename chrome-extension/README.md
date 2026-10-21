# Samvaad Chrome Extension (Google Meet MVP)

A Manifest V3 Chrome extension that lets an ISL signer use the **existing** Samvaad recognition service
(`include-ml/recognition_service.py`, 24-class Transformer) during a Google Meet call. Recognized signs appear as editable
text in a small panel; **nothing is ever sent until you press Send**.

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
| Unit tests (17), syntax/manifest check | Pass |
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
src/content/content.js               platform-independent: mounts panel, brokers chat posting
src/content/platforms/registry.js    adapter interface (documented at top of file)
src/content/platforms/meet.js        Google Meet adapter  <-- all Meet-specific code
src/panel/                           UI + session controller
src/lib/                             recognition-client (WS protocol), camera, filters, settings
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
npm test                     # 17 unit tests (protocol client incl. reconnect/races, filters, settings)

# Browser test: loads the extension in Chromium, fake camera + fake Meet page, real service (start it first)
xvfb-run -a env SERVICE_URL=ws://127.0.0.1:8765 node tests/e2e/run-e2e.mjs      # Linux headless
# set CHROME_PATH to your Chromium/Chrome binary if it is not at /opt/pw-browsers/chromium-1194/chrome-linux/chrome

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
