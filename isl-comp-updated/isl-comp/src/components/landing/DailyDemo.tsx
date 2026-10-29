import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Send, Trash2, Volume2, VolumeX } from 'lucide-react';
import { SCENARIOS, SCENARIO_CARDS, type PresetScenarioId } from '../../data/dailyScenarios';

const TABS: PresetScenarioId[] = ['healthcare', 'shopping', 'travel', 'emergency'];

// Scripted quick replies for the speaking person, so the demo works without a microphone.
// Clearly labelled as demo.
const REPLIES: Record<PresetScenarioId, string[]> = {
  healthcare: ['Where does it hurt?', 'Take one tablet after food.', 'The doctor will see you now.'],
  shopping: ['That will be 240 rupees.', 'Would you like a bag?', 'Sorry, that is out of stock.'],
  travel: ['The train leaves from platform 4.', 'The ticket counter is on your left.', 'It is running 20 minutes late.'],
  emergency: ['Help is on the way.', 'Stay where you are.', 'Can you tell me your address?'],
  college: [],
  workplace: [],
  everyday: [],
};

// 'ns' = non-speaking person (taps cards or types; read aloud)
// 'sp' = speaking person (types a reply; shown large for the deaf user)
type Msg = { id: number; from: 'ns' | 'sp'; text: string };

const MAX_LEN = 200;
const inputCls =
  'min-h-[48px] w-full rounded-[6px] border border-white/15 bg-white/[0.03] px-4 py-3 text-[15px] text-cream ' +
  'placeholder:text-mist/60 outline-none transition-colors focus:border-saffron/60';

export function DailyDemo() {
  const [scenario, setScenario] = useState<PresetScenarioId>('healthcare');
  const [thread, setThread] = useState<Msg[]>([]);
  const [speak, setSpeak] = useState(true);
  const [nsDraft, setNsDraft] = useState('');
  const [spDraft, setSpDraft] = useState('');
  const nextId = useRef(1);
  const listRef = useRef<HTMLDivElement>(null);

  // Keep the newest message in view; the list scrolls inside its own box, the page does not move.
  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  }, [thread.length]);

  const push = (from: Msg['from'], text: string) =>
    setThread((t) => [...t, { id: nextId.current++, from, text }]);

  // Non-speaking person's text is read aloud for the speaking person.
  const say = (raw: string) => {
    const text = raw.trim().slice(0, MAX_LEN);
    if (!text) return;
    push('ns', text);
    if (speak && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(text);
        u.lang = 'en-IN';
        window.speechSynthesis.speak(u);
      } catch {
        /* speech is optional */
      }
    }
  };

  // Speaking person's text is the primary large display for the deaf user.
  const reply = (raw: string) => {
    const text = raw.trim().slice(0, MAX_LEN);
    if (text) push('sp', text);
  };

  const submitNs = () => {
    say(nsDraft);
    setNsDraft('');
  };
  const submitSp = () => {
    reply(spDraft);
    setSpDraft('');
  };
  const onEnter = (submit: () => void) => (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const hasNs = thread.some((m) => m.from === 'ns');

  return (
    <section id="daily-demo" className="relative mx-auto max-w-[1312px] px-6 lg:px-16">
      <div className="max-w-2xl">
        <span className="eyebrow">Daily Translator</span>
        <h2 className="mt-5 font-bricolage text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.04] tracking-[-0.035em]">
          Not every conversation happens on a call.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-mist">
          A clinic desk, a shop counter, a railway platform. Tap a card or type, and it is shown in large text and
          read aloud. The other person answers in text you can read at a glance.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1fr_1.1fr]">
        {/* Non-speaking person */}
        <div className="card flex flex-col p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Non-speaking person · tap or type</p>
          <div className="mt-4 flex flex-wrap gap-2">
            {TABS.map((id) => (
              <button
                key={id}
                onClick={() => setScenario(id)}
                className={`rounded-[4px] border px-3.5 py-2 text-sm transition-colors ${
                  scenario === id ? 'border-saffron bg-saffron/15 text-cream' : 'border-white/15 text-mist hover:text-cream'
                }`}
              >
                {SCENARIOS.find((s) => s.id === id)?.label.split(' /')[0]}
              </button>
            ))}
          </div>
          <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
            {SCENARIO_CARDS[scenario].slice(0, 6).map((c) => (
              <button
                key={c.id}
                onClick={() => say(c.text)}
                className="rounded-[6px] border border-white/10 bg-white/[0.03] px-4 py-3.5 text-left text-[15px] leading-snug text-cream transition-colors hover:border-saffron/60 hover:bg-white/[0.06]"
              >
                {c.text}
              </button>
            ))}
          </div>

          <div className="mt-6 flex gap-2">
            <input
              value={nsDraft}
              maxLength={MAX_LEN}
              onChange={(e) => setNsDraft(e.target.value)}
              onKeyDown={onEnter(submitNs)}
              placeholder="Type what you want to say…"
              aria-label="Non-speaking person: type a message"
              className={inputCls}
            />
            <button
              onClick={submitNs}
              disabled={!nsDraft.trim()}
              aria-label="Send as non-speaking person"
              className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-[4px] bg-saffron px-5 text-sm font-semibold text-[#0E1116] transition-opacity disabled:opacity-40"
            >
              Say <Send size={16} strokeWidth={2.4} />
            </button>
          </div>

          <button
            onClick={() => setSpeak((s) => !s)}
            className="mt-5 inline-flex items-center gap-2 self-start font-mono text-[11px] uppercase tracking-[0.14em] text-mist hover:text-cream"
          >
            {speak ? <Volume2 size={14} /> : <VolumeX size={14} />} Read aloud {speak ? 'on' : 'off'}
          </button>
        </div>

        {/* Shared conversation + speaking person */}
        <div className="card flex flex-col p-6">
          <div className="flex items-center justify-between">
            <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Conversation</p>
            <button
              onClick={() => setThread([])}
              disabled={!thread.length}
              className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-mist hover:text-cream disabled:opacity-30"
            >
              <Trash2 size={13} /> Clear
            </button>
          </div>

          <div
            ref={listRef}
            role="log"
            aria-live="polite"
            aria-label="Conversation"
            tabIndex={0}
            className="mt-4 h-[340px] space-y-5 overflow-y-auto overscroll-contain rounded-[6px] border border-white/10 bg-black/20 p-5"
          >
            {thread.length === 0 && (
              <p className="flex h-full items-center justify-center text-center text-mist/60">
                Tap a card or type on the left. Replies appear here.
              </p>
            )}
            {thread.map((m) =>
              m.from === 'ns' ? (
                <div key={m.id} className="border-l-2 border-saffron/70 pl-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-saffron">Non-speaking</p>
                  <p className="mt-1.5 text-[15px] leading-snug text-cream/90">
                    {m.text}
                  </p>
                </div>
              ) : (
                <div key={m.id} className="border-l border-white/20 pl-4">
                  <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-mist">Speaking</p>
                  <p className="mt-1.5 font-bricolage text-[clamp(26px,3vw,40px)] font-bold leading-tight tracking-[-0.02em] text-cream">
                    {m.text}
                  </p>
                </div>
              ),
            )}
          </div>

          <p className="mt-5 font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Speaking person · type a reply</p>
          <div className="mt-3 flex gap-2">
            <input
              value={spDraft}
              maxLength={MAX_LEN}
              onChange={(e) => setSpDraft(e.target.value)}
              onKeyDown={onEnter(submitSp)}
              placeholder="Type a reply…"
              aria-label="Speaking person: type a reply"
              className={inputCls}
            />
            <button
              onClick={submitSp}
              disabled={!spDraft.trim()}
              aria-label="Send as speaking person"
              className="inline-flex min-h-[48px] shrink-0 items-center gap-2 rounded-[4px] border border-white/20 px-5 text-sm font-semibold text-cream transition-colors hover:border-white/40 disabled:opacity-40"
            >
              Send <Send size={16} strokeWidth={2.4} />
            </button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-mist/70">Quick replies · demo</span>
            {REPLIES[scenario].map((r) => (
              <button
                key={r}
                disabled={!hasNs}
                onClick={() => reply(r)}
                className="rounded-[4px] border border-white/15 px-3 py-1.5 text-[13px] text-mist transition-colors hover:border-white/40 hover:text-cream disabled:opacity-40"
              >
                {r}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Link
          to="/daily"
          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-[4px] bg-saffron px-7 text-base font-semibold text-[#0E1116] transition-transform hover:-translate-y-0.5"
        >
          Open the Daily Translator <ArrowRight size={18} strokeWidth={2.4} />
        </Link>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist/70">
          Cards are plain text, not ISL translations. Quick replies here are scripted.
        </p>
      </div>
    </section>
  );
}