// Sequential avatar playback. Owns one <video> element (injected, so this runs under Node with a fake) and a queue.
//
// Items: { sign, label, clip|null }. A clip plays in the video element; an item with no clip (or whose clip fails to
// load/decode) is reported as a placeholder so the UI can show the sign's name as text, then the queue moves on.
// If the queue grows past maxQueue the OLDEST waiting items are dropped and onState reports how many, so the UI can
// say so; signing falls behind speech by design (clips are 2.5-6 s each), and catching up beats an ever-growing delay.

export class AvatarPlayer {
  constructor({ video, onState = () => {}, speed = 1, maxQueue = 30, placeholderMs = 1000, clipTimeoutMs = 20000 }) {
    Object.assign(this, { video, onState, maxQueue, placeholderMs, clipTimeoutMs });
    this.speed = 1;
    this.setSpeed(speed);
    this.queue = [];
    this.current = null;
    this.placeholder = false;
    this.failed = false;
    this.dropped = 0;
    this.running = false;
    this.cancel = null;
  }

  setSpeed(x) {
    const n = Number(x);
    this.speed = Number.isFinite(n) ? Math.min(2, Math.max(0.5, n)) : 1;
    if (this.video) { try { this.video.playbackRate = this.speed; } catch { /* ignore */ } }
  }

  enqueue(items) {
    if (!items || !items.length) return;
    this.queue.push(...items);
    if (this.queue.length > this.maxQueue) {
      const drop = this.queue.length - this.maxQueue;
      this.queue.splice(0, drop);
      this.dropped += drop;
    }
    this._emit();
    this._run();
  }

  clear() {
    this.queue = [];
    this.dropped = 0;
    if (this.cancel) this.cancel('cleared');
    this._emit();
  }

  _emit() {
    this.onState({ current: this.current, placeholder: this.placeholder, failed: this.failed, queued: this.queue.length, dropped: this.dropped });
  }

  async _run() {
    if (this.running) return;
    this.running = true;
    while (this.queue.length) {
      this.current = this.queue.shift();
      this.placeholder = false;
      this.failed = false;
      await this._play(this.current);
    }
    this.current = null;
    this.placeholder = false;
    this.failed = false;
    this.running = false;
    this.dropped = 0;
    this._emit();
  }

  _play(item) {
    return new Promise((resolve) => {
      const v = this.video;
      let done = false;
      let timer = null;
      const finish = (why) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (v) { v.removeEventListener('ended', onEnded); v.removeEventListener('error', onError); }
        this.cancel = null;
        resolve(why);
      };
      const showPlaceholder = (failed) => {
        this.placeholder = true;
        this.failed = failed;
        if (v) { try { v.pause(); } catch { /* ignore */ } }
        this._emit();
        clearTimeout(timer);
        timer = setTimeout(() => finish('placeholder'), this.placeholderMs / this.speed);
      };
      const onEnded = () => finish('ended');
      const onError = () => showPlaceholder(true);
      this.cancel = finish;

      if (!item.clip || !v) { showPlaceholder(false); return; }
      this._emit();
      v.addEventListener('ended', onEnded);
      v.addEventListener('error', onError);
      v.src = item.clip;
      v.playbackRate = this.speed;
      try {
        const p = v.play();
        if (p && typeof p.catch === 'function') p.catch(() => { if (!done) showPlaceholder(true); });
      } catch { showPlaceholder(true); return; }
      timer = setTimeout(() => finish('timeout'), this.clipTimeoutMs);
    });
  }
}
