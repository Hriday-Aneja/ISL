// Turns Meet's live captions into "settled" chunks that are safe to sign.
//
// Meet rewrites a caption row in place while the person is still speaking ("mic, so," -> "mic, So that's a new
// person."), so signing every change would repeat and contradict itself. This tracker only emits words once they have
// stopped changing, and emits each word at most once per row. Time is injected so the logic is testable.
//
//   update(rows)  rows = [{ key, speaker, text }]  (a snapshot of what Meet is showing right now)
//   tick()        returns [{ id, key, speaker, text }] of newly settled words
//
// Rules:
//   - a row settles after settleMs without change (sentenceSettleMs when it ends in . ? ! so full sentences are faster)
//   - continuous speech that never pauses is flushed after maxHoldMs, holding back the last holdbackWords words
//     because those are the ones Meet is most likely to still revise
//   - a row that disappears from the snapshot is flushed in full
//   - a row whose first word or speaker changed is treated as a new utterance (Meet reused the row)

const firstWord = (t) => (t.split(' ')[0] || '').toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
const clean = (t) => String(t || '').replace(/\s+/g, ' ').trim();
const endsSentence = (t) => /[.?!\u0964]["')\]]*$/.test(t); // \u0964 = Devanagari danda

export class CaptionTracker {
  constructor({ settleMs = 1500, sentenceSettleMs = 700, maxHoldMs = 4000, holdbackWords = 2, now = () => Date.now() } = {}) {
    Object.assign(this, { settleMs, sentenceSettleMs, maxHoldMs, holdbackWords, now });
    this.rows = new Map();
    this.nextId = 1;
    this.pendingFlush = [];
  }

  update(snapshot, t = this.now()) {
    const seen = new Set();
    for (const r of snapshot || []) {
      const text = clean(r.text);
      if (!text) continue;
      seen.add(r.key);
      let s = this.rows.get(r.key);
      if (s && (s.speaker !== (r.speaker || '') || (s.emitted > 0 && firstWord(text) !== firstWord(s.text)))) {
        this._flushRow(r.key, s); // same slot, different utterance
        s = null;
      }
      if (!s) {
        s = { speaker: r.speaker || '', text, emitted: 0, changedAt: t, pendingSince: t };
        this.rows.set(r.key, s);
        continue;
      }
      if (text !== s.text) {
        const before = s.text.split(' ').length - s.emitted;
        s.text = text;
        s.changedAt = t;
        if (s.emitted > text.split(' ').length) s.emitted = text.split(' ').length; // Meet shortened the row
        if (before <= 0 && text.split(' ').length - s.emitted > 0) s.pendingSince = t;
      }
    }
    for (const [key, s] of this.rows) if (!seen.has(key)) { this._flushRow(key, s); this.rows.delete(key); }
  }

  _flushRow(key, s) {
    const words = s.text.split(' ');
    if (words.length > s.emitted) this.pendingFlush.push({ id: this.nextId++, key, speaker: s.speaker, text: words.slice(s.emitted).join(' ') });
    s.emitted = words.length;
  }

  tick(t = this.now()) {
    const out = this.pendingFlush.splice(0);
    for (const [key, s] of this.rows) {
      const words = s.text.split(' ');
      const pending = words.length - s.emitted;
      if (pending <= 0) continue;
      const quiet = t - s.changedAt >= (endsSentence(s.text) ? this.sentenceSettleMs : this.settleMs);
      let upTo = 0;
      if (quiet) upTo = words.length;
      else if (t - s.pendingSince >= this.maxHoldMs && pending > this.holdbackWords) upTo = words.length - this.holdbackWords;
      if (upTo > s.emitted) {
        out.push({ id: this.nextId++, key, speaker: s.speaker, text: words.slice(s.emitted, upTo).join(' ') });
        s.emitted = upTo;
        s.pendingSince = t;
      }
    }
    return out;
  }

  reset() { this.rows.clear(); this.pendingFlush = []; }
}
