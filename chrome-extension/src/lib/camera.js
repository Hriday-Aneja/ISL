// Camera access + JPEG frame capture. The camera is opened only when start() is called from an explicit
// user action and every track is stopped in stop().

export class CameraError extends Error {
  constructor(kind, message) { super(message); this.kind = kind; }
}

/** Map getUserMedia failures to actionable messages. Exported for tests. */
export function describeCameraError(err) {
  const name = err && err.name;
  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return new CameraError('permission', 'Camera permission was denied or dismissed. Use "Grant camera access", or allow the camera for this extension in Chrome settings.');
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return new CameraError('no-device', 'No camera was found. Connect a camera and try again.');
    case 'NotReadableError':
    case 'TrackStartError':
    case 'AbortError':
      return new CameraError('busy', 'The camera is in use by another app or could not be started. Close other apps using the camera and try again.');
    case 'OverconstrainedError':
    case 'ConstraintNotSatisfiedError':
      return new CameraError('constraints', 'The camera does not support the requested settings.');
    default:
      return new CameraError('unknown', `Could not start the camera${err && err.message ? `: ${err.message}` : '.'}`);
  }
}

export function dataUrlToArrayBuffer(dataUrl) {
  const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

export class CameraSource {
  constructor({ onEnded } = {}) {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.onEnded = onEnded;
  }

  get active() { return Boolean(this.stream); }

  async start(videoEl) {
    if (this.stream) return;
    const attempts = [
      { video: { width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } }, audio: false },
      { video: true, audio: false }, // some cameras reject the ideal constraints
    ];
    let lastErr;
    for (const constraints of attempts) {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia(constraints);
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
        if (!['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(err && err.name)) break;
      }
    }
    if (!this.stream) throw describeCameraError(lastErr);
    for (const track of this.stream.getVideoTracks()) {
      track.addEventListener('ended', () => { if (this.stream) this.onEnded?.(); });
    }
    this.video = videoEl;
    this.video.srcObject = this.stream;
    this.video.muted = true;
    this.video.playsInline = true;
    try {
      await this.video.play();
      await this._waitForFrame();
    } catch (err) {
      this.stop();
      throw describeCameraError(err);
    }
  }

  _waitForFrame() {
    const v = this.video;
    if (v.videoWidth > 0) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new CameraError('busy', 'The camera started but delivered no video.')), 5000);
      v.addEventListener('loadeddata', () => { clearTimeout(t); resolve(); }, { once: true });
    });
  }

  /**
   * Grab the current frame as a JPEG ArrayBuffer. If `mirror` is true the image is flipped horizontally BEFORE
   * it is sent, matching live_inference.py's cv2.flip(frame, 1) for checkpoints trained on mirrored clips.
   * @returns {{buffer: ArrayBuffer, width: number, height: number}|null}
   */
  captureJpeg({ mirror, width, quality }) {
    const v = this.video;
    if (!this.stream || !v || !v.videoWidth) return null;
    const w = Math.min(width, v.videoWidth);
    const h = Math.round((w * v.videoHeight) / v.videoWidth);
    // Synchronous toDataURL on purpose: the async encoders (toBlob / convertToBlob) were measured stalling ~1 s per
    // call at random in headless Chromium, which collapsed the frame rate to ~1 fps. toDataURL takes ~5 ms.
    if (!this.canvas) this.canvas = document.createElement('canvas');
    if (this.canvas.width !== w || this.canvas.height !== h) { this.canvas.width = w; this.canvas.height = h; }
    const ctx = this.canvas.getContext('2d', { alpha: false, willReadFrequently: true });
    ctx.save();
    if (mirror) { ctx.translate(w, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0, w, h);
    ctx.restore();
    const dataUrl = this.canvas.toDataURL('image/jpeg', quality);
    return { buffer: dataUrlToArrayBuffer(dataUrl), width: w, height: h };
  }

  /** Stop every track and detach the video element. Idempotent. */
  stop() {
    const stream = this.stream;
    this.stream = null;
    if (stream) for (const track of stream.getTracks()) { try { track.stop(); } catch { /* ignore */ } }
    if (this.video) { try { this.video.pause(); } catch { /* ignore */ } this.video.srcObject = null; }
  }
}
