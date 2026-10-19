# ISL Bridge — frontend prototype

A two-way communication frontend connecting Indian Sign Language (ISL) users
and hearing users, now with a **real two-person WebRTC video call** in the
Communication Room. Camera, microphone, speech-to-text, text-to-speech, and
the call itself are all real browser functionality. Sign recognition and the
3D avatar are mocked behind swappable interfaces — see "Where your modules
plug in" below.

The Communication Room only ever shows end users the **final translated
sentence** — "You signed / 'I need water.'" and "You said / 'Call a
doctor.'" — never the raw sign tokens or mapping steps. That intermediate
data still exists in state (needed for integration and debugging); it's just
hidden from the normal UI. Turn on **Developer mode** from the settings
button in the call bar to see it: detected signs, mapped sign sequences, and
recognition confidence, rendered as a small dashed debug panel under each
message card and in the transcript drawer. It's off by default.

## Run it

The video call needs two things running side by side: the frontend, and the
small signaling server that introduces the two peers to each other (see
"Real two-person video calling" below — no audio/video ever passes through
it).

**1. Signaling server** (in one terminal):

```bash
cd server
npm install
npm start
```

This starts on `http://localhost:4000` by default (override with `PORT`).

**2. Frontend** (in another terminal, from the project root):

```bash
npm install
npm run dev
```

Optionally copy `.env.example` to `.env.local` if you're pointing the
frontend at a signaling server that isn't on `localhost:4000`.

Then open the printed local URL (usually `http://localhost:5173`) in **Chrome
or Edge** — the Web Speech API (speech-to-text) only ships in Chromium
browsers today. Camera, TTS, and the video call work in any modern browser
with WebRTC support.

### Testing the call locally

- Open the app in two browser windows (or two tabs — each gets its own
  camera/mic prompt). In the first, click **Start Communication**, choose
  your role (**ISL User** or **Hearing User**), click **Create room**, and
  grant camera/mic access. Copy the Room ID (or invite link) from the banner
  at the top.
- In the second window, open the invite link directly — it carries the
  opposite role (`/room/<ID>?role=hearing` or `?role=isl`) and auto-joins.
  Or click **Join room**, choose your role, and paste the ID. Grant camera/mic
  access.
- Both windows should show each other's live video within a couple of
  seconds and hear each other.
- Each role sees its own interface: the ISL User gets **Read my signs** and the
  hearing user's message (avatar + text); the Hearing User gets **Start
  listening** and the ISL user's translated sentence (with **Play audio**).
  Finished sentences travel between the two browsers over a WebRTC data channel
  on the existing peer connection — the signaling server is unchanged.

To test across two separate devices on the same Wi-Fi network, set
`VITE_SIGNALING_SERVER_URL` to your machine's LAN IP (e.g.
`http://192.168.1.23:4000`) instead of `localhost`, since `localhost` on one
device doesn't reach the server running on another. The STUN-only ICE setup
in `useVideoCall.ts` works fine on the same network/most home routers; if a
call won't connect across stricter networks (e.g. mobile data, corporate
Wi-Fi), that's a NAT-traversal case that needs a TURN server — see
"Video calling architecture" below for where to add one.

## Pages

- `/` — Landing page
- `/room` — Communication Room: create or join a call
- `/room/:roomId` — Same room, pre-filled from a shared invite link
- `/how-it-works` — Explains both data flows

## Where your modules plug in

### 1. Sign-recognition model

`src/services/mockRecognition.ts` exports `mockRecognizeSigns(frame?)`, which
resolves to `{ signs: SignId[], confidence: number }`. Replace its body with
a real call to your model — every caller (`CameraPanel.tsx`) only depends on
that function shape, so nothing else needs to change.

### 2. 3D avatar

`src/components/communication/AvatarPanel.tsx` implements the `AvatarProps`
contract in `src/types/index.ts`: `{ signs: SignId[], isPlaying?, onPlaybackComplete? }`.
Swap the component body for your real Three.js / GLB-GLTF renderer — the
props contract doesn't need to change.

It's driven by a single entry point, `playSigns(sequence)`, from
`src/hooks/useAvatarPlayer.ts`. `SpeechPanel.tsx` calls
`avatar.playSigns(signs)` once speech has been mapped to a sign sequence;
that's the one place in the app that starts avatar playback, so it's also
the one place you'd touch if you need to change how/when the avatar is
triggered. `AvatarPanel` itself stays a "dumb" display component driven
entirely by props.

### Shared vocabulary

Sign IDs live in `src/types/index.ts` (`SignId` union) and are labeled in
`src/data/signMappings.ts`. Keep recognition output, phrase mapping, and
avatar playback using these same IDs so all three modules stay in sync.

## Video calling architecture

The Communication Room now sits behind a real two-person WebRTC call instead
of opening on its own:

```
useVideoCall()  (src/hooks/useVideoCall.ts)
├── getUserMedia() — one combined video+audio stream, opened once
├── RTCPeerConnection — offer/answer/ICE, STUN-only for now
├── Socket.IO client (src/lib/socket.ts) — signaling only, never carries media
└── exposes: localStream, remoteStream, status, roomId,
             toggleMicrophone(), toggleCamera(), endCall()
```

- **Signaling** (`/server`) is a tiny Express + Socket.IO server. It only
  relays room membership and WebRTC offer/answer/ICE-candidate messages
  between the two browsers — it has no AI or ISL logic and never touches
  audio/video. Rooms are capped at two people; a third join attempt gets a
  clear "room is full" response.
- **ICE config** lives in one place at the top of `useVideoCall.ts`
  (`ICE_CONFIG`). It's STUN-only today, which is enough for same-network
  testing. Add a `urls`/`username`/`credential` TURN entry there if you need
  the call to work across stricter networks — nothing else needs to change.
- **One camera stream, two consumers.** `useVideoCall()` opens the camera
  and mic exactly once. `CameraPanel` (the "ISL User" panel) displays that
  same stream and reads frames from it for `mockRecognizeSigns()` — when you
  swap in the real recognition model, it keeps reading from this same
  stream, so there's still only one `getUserMedia()` call in the whole app.
  Speech-to-text is unaffected: the Web Speech API manages its own
  microphone access independently of `getUserMedia()`.
- **Where the peer's video shows up:** the left panel (`CameraPanel`) is
  unchanged in spirit — it's still your own camera, feeding recognition. The
  right panel (`SpeechPanel`) keeps the mocked avatar as its main stage (per
  the brief, the avatar stays mocked) and shows the other person's real
  video as a small "Peer" tile in the corner, so both the future avatar and
  the real remote video are visible without adding a third stage panel.
- **Call states** (`CallStatus` in `src/types/videoCall.ts`): `idle` →
  `requesting_media` → `creating`/`joining` → `waiting` → `connecting` →
  `connected`, plus `peer_left`, `room_full`, `room_not_found`,
  `permission_denied`, `no_device`, `connection_failed`, and `ended`. The
  create/join gate (`RoomGate.tsx`) handles everything up through joining a
  room; once a room exists, `RoomStatusBanner.tsx` handles the rest as a
  slim strip under the top bar so the camera/speech panels stay visible and
  usable while waiting.
- **Call bar controls are now real.** Mic/camera buttons toggle the actual
  `MediaStreamTrack.enabled` flags on the shared stream (so the peer sees
  you go on mute/camera-off too); Speaker mutes the incoming peer audio;
  End Session tears down the peer connection, stops all tracks, and leaves
  the signaling room.

## What's real vs. mocked today

| Piece | Status |
|---|---|
| Two-person video/audio call | Real (`WebRTC` via `useVideoCall`, signaling in `/server`) |
| Camera preview | Real (`getUserMedia`, shared with the call) |
| Sign recognition | Mocked (`mockRecognizeSigns`) |
| Sign sequence → sentence | Real deterministic mapping |
| Text-to-speech | Real (`SpeechSynthesis`) |
| Microphone / speech-to-text | Real (`SpeechRecognition` / `webkitSpeechRecognition`) |
| Phrase → sign mapping | Real deterministic mapping (~20 phrases + aliases) |
| Avatar | Mocked (`AvatarPanel`, driven by `useAvatarPlayer().playSigns()`) |
| Conversation history, session status | Real, in-memory for this session |
| Call controls (mic/camera/speaker/end) | Real — control the actual call, not just UI state |
| Manual text input (keyboard icon in call bar) | Real — types feed the same phrase-mapping pipeline as speech |
| Developer/debug mode | Real toggle in Settings; off by default, no separate build |

## UI structure (Communication Room)

- **Room gate** (`RoomGate.tsx`) — shown before a call exists: create a room
  or join one by ID/link. Matches the dark "immersive stage" styling used
  throughout the room rather than introducing a separate look.
- **Top bar** — back link, room ID, connection status, and a status pill
  that only appears during active states (listening, reading signs,
  speaking, avatar signing).
- **Room status banner** (`RoomStatusBanner.tsx`) — a slim strip under the
  top bar for "waiting for peer" (with copy-ID / copy-link), "connecting",
  "peer left", or a recoverable connection error. Hidden once connected;
  never covers the main stage.
- **Main stage** — the remote participant's video fills everything below the
  top bar. Floating over it: your self-view (`LocalVideoPiP`, bottom-right;
  top-right on phones), the role's translation panel (bottom-left,
  collapsible — `FloatingTranslationPanel` wrapping `CameraPanel` for the
  ISL User or `SpeechPanel` for the Hearing User), the avatar mini-pane
  (above the panel, only while signing), stage captions (top-center), and the
  call controls (bottom-center).
- **Call bar** — a floating pill: mic / camera / speaker toggles control the
  real call, a captions icon opens the transcript drawer, a keyboard icon
  (Hearing User only) opens manual text input, a settings icon (Developer
  mode), a fullscreen toggle (where the browser supports it), and End Session.
- **Transcript drawer, keyboard input, and settings** are overlays, not
  permanent page sections, so the video keeps the whole viewport.
