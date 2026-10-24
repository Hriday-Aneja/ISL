// Runs in the PAGE's own JavaScript world (manifest: "world": "MAIN", document_start), because only code in that
// world can replace what Google Meet gets back from navigator.mediaDevices.getUserMedia.
//
// When "Show avatar to everyone" is on, a video request from Meet is answered with a stream captured from the hidden
// <canvas id="samvaad-vcam-canvas"> that vcam.js (isolated world) draws the avatar onto. Meet then sends that
// stream to the other participants like any camera, so everyone sees the avatar in the user's tile.
// Audio is never touched: a real microphone stream is requested separately and passed through unchanged.
// When the feature is off (the default), the original getUserMedia runs untouched.
// The data-samvaad-vcam-hits attribute counts how many camera requests were answered with the avatar (shown in the panel).
(function () {
  if (globalThis.__samvaadVcamMain) return;
  globalThis.__samvaadVcamMain = true;
  const md = navigator.mediaDevices;
  if (!md || typeof md.getUserMedia !== 'function') return;
  const root = document.documentElement;
  // Patch the prototype when it owns the method, so calls made as MediaDevices.prototype.getUserMedia.call(...) are caught too.
  const proto = globalThis.MediaDevices && globalThis.MediaDevices.prototype;
  const target = proto && Object.prototype.hasOwnProperty.call(proto, 'getUserMedia') ? proto : md;
  const orig = target.getUserMedia;

  target.getUserMedia = async function samvaadGetUserMedia(constraints) {
    const self = this || md;
    const canvas = root.dataset.samvaadVcam === '1' ? document.getElementById('samvaad-vcam-canvas') : null;
    if (!canvas || !constraints || !constraints.video || typeof canvas.captureStream !== 'function') return orig.call(self, constraints);
    let videoTrack;
    try {
      videoTrack = canvas.captureStream(30).getVideoTracks()[0];
      if (!videoTrack) return orig.call(self, constraints);
      try {
        Object.defineProperty(videoTrack, 'label', { value: 'Samvaad avatar camera' });
        // Meet may inspect or re-constrain its camera track; a canvas track would otherwise reject some of that.
        const base = videoTrack.getSettings ? videoTrack.getSettings.bind(videoTrack) : () => ({});
        videoTrack.getSettings = () => ({ ...base(), deviceId: 'samvaad-avatar', groupId: 'samvaad', facingMode: 'user' });
        videoTrack.applyConstraints = async () => {};
      } catch { /* cosmetic */ }
    } catch { return orig.call(self, constraints); } // e.g. a tainted canvas: fall back to the real camera instead of breaking Meet
    const tracks = [];
    if (constraints.audio) {
      const real = await orig.call(self, { audio: constraints.audio }); // real microphone, unchanged
      tracks.push(...real.getAudioTracks());
    }
    tracks.push(videoTrack);
    root.dataset.samvaadVcamHits = String((Number(root.dataset.samvaadVcamHits) || 0) + 1);
    return new MediaStream(tracks);
  };
  root.dataset.samvaadVcamHooked = '1'; // lets the content script tell the panel the hook is installed
})();
