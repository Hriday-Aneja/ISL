// Meeting-platform adapter registry (classic script, loaded before the adapters and content.js).
//
// To add a platform (e.g. Zoom Web) create src/content/platforms/<name>.js that calls
// SamvaadPlatforms.register({...}) with this interface, add it to manifest.json content_scripts (js list and
// matches) and web_accessible_resources matches. Nothing outside src/content/platforms/ is platform specific.
//
//   {
//     id: 'meet',                       // stable id, shown in the panel
//     label: 'Google Meet',
//     matches(location) -> boolean      // is this page served by the platform at all
//     isMeetingPage(location) -> boolean// is the user inside a meeting (panel is only shown then)
//     sendChat(text, mode) -> Promise<{ ok: boolean, method: string, detail?: string }>
//          mode: 'chat'  fill the platform's chat box and press its send button
//                'fill'  only fill the chat box (the user presses the platform's own send)
//          Must NEVER throw; report failure through { ok: false, detail } so the panel can fall back to the clipboard.
//     readCaptions() -> { state, rows }     OPTIONAL (speech -> sign). Snapshot of the platform's live captions:
//          state: 'no-region' (captions off / not found) | 'watching' | 'unrecognized-layout'
//          rows:  [{ key, speaker, text }]  key must be stable for the same on-screen caption row between calls
//     enableCaptions() -> Promise<{ ok, detail }>   OPTIONAL. Best-effort press of the platform's captions button.
//   }
(function () {
  const adapters = [];
  globalThis.SamvaadPlatforms = {
    register(adapter) { adapters.push(adapter); },
    detect(location) { return adapters.find((a) => a.matches(location)) || null; },
    list() { return adapters.slice(); },
  };
})();
