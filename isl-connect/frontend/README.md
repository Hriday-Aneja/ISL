# frontend — WebRTC + React UI (Person 5)

The call, the layout, and the final wiring of every other module's output.

## Scope
- WebRTC peer-to-peer video call
- Page shell: video panes, caption overlay, avatar viewport, transcript,
  accessibility controls (large captions, quick phrases)
- Final integration: wire real outputs from modules 1-4 into the UI slots

## Start immediately
1. `src/webrtc/webrtcClient.js` — get a 2-peer call working, fully self-contained
2. `src/components/` — build the full layout with placeholder/mock data in
   every slot using `/integration/mock-data/`, so the UI looks finished
   before anyone else's module is ready

## Deliverables
- Working WebRTC call between two browser tabs
- Complete accessible UI shell
- Final integrated build

## Hour 6 checkpoint
WebRTC call working; UI shell built with placeholder data in every panel.

## Final checkpoint
All 4 modules wired in, placeholders replaced with real outputs.
