// Client for the EXISTING include-ml/recognition_service.py WebSocket protocol (unchanged, except that the
// 'ready' message now also carries `flip_horizontal`).
//
//   server -> client  {"type":"ready","service":{classes,labels,sequence_length,feature_size,train_fps,
//                      preprocessing_version,flip_horizontal,model,device}}   (sent on connect)
//   client -> server  {"type":"start"}            begin one clip; server replies {"type":"status","status":"capturing"}
//   client -> server  <binary JPEG frame>         one per camera frame while capturing
//   client -> server  {"type":"stop"}             end the clip; server replies with a prediction (or an error)
//   server -> client  {"type":"prediction",label,confidence,top:[{label,confidence}],frames,model_frames,inference_ms}
//   server -> client  {"type":"error","message"}
//   server -> client  {"type":"status","status":"idle"}   after the server auto-finished a clip at max frames
//
// The service auto-finishes a clip when it has received `max_frames` frames and then sends the prediction
// without a `stop`; this client handles that (any prediction ends the clip).

export const ClipState = Object.freeze({ IDLE: 'idle', CAPTURING: 'capturing', RECOGNIZING: 'recognizing' });
export const ConnState = Object.freeze({ DISCONNECTED: 'disconnected', CONNECTING: 'connecting', CONNECTED: 'connected', RECONNECTING: 'reconnecting' });

export class RecognitionClient {
  /**
   * @param {object} opts
   * @param {string} opts.url
   * @param {Function} [opts.WebSocketImpl]  injectable for tests
   * @param {number} [opts.connectTimeoutMs]
   * @param {number} [opts.recognizeTimeoutMs]
   * @param {number} [opts.maxReconnects]
   * @param {number[]} [opts.backoffMs]
   * @param {number} [opts.maxBufferedBytes]  frames are dropped (not queued) above this
   * @param {object} handlers { onConnState, onClipState, onReady, onPrediction, onError, onFrameDropped }
   */
  constructor(opts, handlers = {}) {
    this.url = opts.url;
    this.WS = opts.WebSocketImpl || globalThis.WebSocket;
    this.connectTimeoutMs = opts.connectTimeoutMs ?? 5000;
    this.recognizeTimeoutMs = opts.recognizeTimeoutMs ?? 20000;
    this.maxReconnects = opts.maxReconnects ?? 5;
    this.backoffMs = opts.backoffMs ?? [500, 1000, 2000, 4000, 8000];
    this.maxBufferedBytes = opts.maxBufferedBytes ?? 1_500_000;
    this.h = handlers;
    this.ws = null;
    this.connState = ConnState.DISCONNECTED;
    this.clipState = ClipState.IDLE;
    this.info = null;
    this._wantOpen = false;
    this._attempt = 0;
    this._timers = new Set();
    this._recognizeTimer = null;
    this.framesSent = 0;
    this.framesDropped = 0;
  }

  /** Resolves with the service info once the 'ready' message arrives; rejects if the first connect fails. */
  connect() {
    this._wantOpen = true;
    this._attempt = 0;
    return new Promise((resolve, reject) => {
      this._firstConnect = { resolve, reject };
      this._open(false);
    });
  }

  _setConn(state) {
    if (this.connState === state) return;
    this.connState = state;
    this.h.onConnState?.(state);
  }

  _setClip(state) {
    if (this.clipState === state) return;
    this.clipState = state;
    this.h.onClipState?.(state);
  }

  _later(fn, ms) {
    const t = setTimeout(() => { this._timers.delete(t); fn(); }, ms);
    this._timers.add(t);
    return t;
  }

  _open(isRetry) {
    this._setConn(isRetry ? ConnState.RECONNECTING : ConnState.CONNECTING);
    let ws;
    try {
      ws = new this.WS(this.url);
    } catch (err) {
      this._failOpen(`Could not open ${this.url}: ${err.message}`);
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;
    let settled = false;
    const timeout = this._later(() => {
      if (!settled) { settled = true; ws.onclose = ws.onmessage = ws.onerror = null; if (this.ws === ws) this.ws = null; try { ws.close(); } catch { /* ignore */ } this._failOpen(`Timed out connecting to ${this.url}`); }
    }, this.connectTimeoutMs);

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let msg;
      try { msg = JSON.parse(event.data); } catch { return; }
      if (msg.type === 'ready') {
        settled = true;
        clearTimeout(timeout); this._timers.delete(timeout);
        this.info = msg.service || null;
        this._attempt = 0;
        this._setConn(ConnState.CONNECTED);
        this.h.onReady?.(this.info);
        if (this._firstConnect) { this._firstConnect.resolve(this.info); this._firstConnect = null; }
      } else if (msg.type === 'prediction') {
        this._endRecognizeWait();
        this._setClip(ClipState.IDLE);
        this.h.onPrediction?.(msg);
      } else if (msg.type === 'error') {
        this._endRecognizeWait();
        if (this.clipState !== ClipState.IDLE) this._setClip(ClipState.IDLE);
        this.h.onError?.(String(msg.message || 'Unknown service error'), { fromService: true });
      } else if (msg.type === 'status' && msg.status === 'idle' && this.clipState === ClipState.CAPTURING) {
        this._setClip(ClipState.IDLE);
      }
    };
    ws.onerror = () => { /* details arrive via onclose */ };
    ws.onclose = () => {
      clearTimeout(timeout); this._timers.delete(timeout);
      this._endRecognizeWait();
      const wasReady = this.connState === ConnState.CONNECTED;
      const hadClip = this.clipState !== ClipState.IDLE;
      if (this.ws === ws) this.ws = null;
      if (hadClip) {
        this._setClip(ClipState.IDLE);
        this.h.onError?.('Connection to the recognition service was lost while recording; that clip was discarded.', { fromService: false, lost: true });
      }
      if (!this._wantOpen) { this._setConn(ConnState.DISCONNECTED); return; }
      if (!settled) { settled = true; this._failOpen(`Could not connect to ${this.url}. Is recognition_service.py running?`); return; }
      if (wasReady || this.connState === ConnState.RECONNECTING) this._scheduleReconnect();
    };
  }

  _failOpen(message) {
    if (this._firstConnect) {
      const { reject } = this._firstConnect;
      this._firstConnect = null;
      this._wantOpen = false;
      this._setConn(ConnState.DISCONNECTED);
      reject(new Error(message));
      return;
    }
    if (this._wantOpen) this._scheduleReconnect(message);
  }

  _scheduleReconnect(lastError) {
    if (!this._wantOpen) return;
    if (this._attempt >= this.maxReconnects) {
      this._wantOpen = false;
      this._setConn(ConnState.DISCONNECTED);
      this.h.onError?.(`Recognition service unreachable after ${this.maxReconnects} retries${lastError ? ` (${lastError})` : ''}.`, { fatal: true });
      this.h.onGaveUp?.();
      return;
    }
    const delay = this.backoffMs[Math.min(this._attempt, this.backoffMs.length - 1)];
    this._attempt += 1;
    this._setConn(ConnState.RECONNECTING);
    this._later(() => { if (this._wantOpen) this._open(true); }, delay);
  }

  _endRecognizeWait() {
    if (this._recognizeTimer) { clearTimeout(this._recognizeTimer); this._timers.delete(this._recognizeTimer); this._recognizeTimer = null; }
  }

  get isReady() { return this.connState === ConnState.CONNECTED && this.ws && this.ws.readyState === 1; }

  /** Begin one clip. Returns false if not connected or a clip is already running. */
  startClip() {
    if (!this.isReady || this.clipState !== ClipState.IDLE) return false;
    this.framesSent = 0;
    this.framesDropped = 0;
    this.ws.send(JSON.stringify({ type: 'start' }));
    this._setClip(ClipState.CAPTURING);
    return true;
  }

  /** Send one JPEG frame (ArrayBuffer/Blob/Uint8Array). Drops the frame when the socket is backed up. */
  sendFrame(data) {
    if (this.clipState !== ClipState.CAPTURING || !this.isReady) return false;
    if (this.ws.bufferedAmount > this.maxBufferedBytes) {
      this.framesDropped += 1;
      this.h.onFrameDropped?.(this.framesDropped);
      return false;
    }
    this.ws.send(data);
    this.framesSent += 1;
    return true;
  }

  /** End the clip and wait for the prediction (or an error). */
  stopClip() {
    if (this.clipState !== ClipState.CAPTURING || !this.isReady) return false;
    this.ws.send(JSON.stringify({ type: 'stop' }));
    this._setClip(ClipState.RECOGNIZING);
    this._recognizeTimer = this._later(() => {
      this._recognizeTimer = null;
      if (this.clipState === ClipState.RECOGNIZING) {
        this._setClip(ClipState.IDLE);
        this.h.onError?.('The recognition service did not answer in time.', { timeout: true });
      }
    }, this.recognizeTimeoutMs);
    return true;
  }

  /** Close the socket and cancel everything. Safe to call repeatedly. */
  close() {
    this._wantOpen = false;
    for (const t of this._timers) clearTimeout(t);
    this._timers.clear();
    this._recognizeTimer = null;
    this._firstConnect = null;
    const ws = this.ws;
    this.ws = null;
    if (ws) { ws.onmessage = ws.onclose = ws.onerror = null; try { ws.close(); } catch { /* ignore */ } }
    this._setClip(ClipState.IDLE);
    this._setConn(ConnState.DISCONNECTED);
  }
}
