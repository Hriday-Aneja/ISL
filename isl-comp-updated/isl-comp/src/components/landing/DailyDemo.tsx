import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Volume2, VolumeX } from 'lucide-react';
import { SCENARIOS, SCENARIO_CARDS, type PresetScenarioId } from '../../data/dailyScenarios';

const TABS: PresetScenarioId[] = ['healthcare', 'shopping', 'travel', 'emergency'];

// Scripted replies, so the demo works without a microphone. Clearly labelled as demo.
const REPLIES: Record<PresetScenarioId, string[]> = {
  healthcare: ['Where does it hurt?', 'Take one tablet after food.', 'The doctor will see you now.'],
  shopping: ['That will be 240 rupees.', 'Would you like a bag?', 'Sorry, that is out of stock.'],
  travel: ['The train leaves from platform 4.', 'The ticket counter is on your left.', 'It is running 20 minutes late.'],
  emergency: ['Help is on the way.', 'Stay where you are.', 'Can you tell me your address?'],
  college: [],
  workplace: [],
  everyday: [],
};

type Msg = { from: 'you' | 'them'; text: string };

export function DailyDemo() {
  const [scenario, setScenario] = useState<PresetScenarioId>('healthcare');
  const [thread, setThread] = useState<Msg[]>([]);
  const [speak, setSpeak] = useState(true);

  const say = (text: string) => {
    setThread((t) => [...t, { from: 'you', text }]);
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
  const lastYou = [...thread].reverse().find((m) => m.from === 'you');
  const lastThem = [...thread].reverse().find((m) => m.from === 'them');

  return (
    <section id="daily-demo" className="relative mx-auto max-w-[1312px] px-6 lg:px-16">
      <div className="max-w-2xl">
        <span className="eyebrow">Daily Translator</span>
        <h2 className="mt-5 font-bricolage text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.04] tracking-[-0.035em]">
          Not every conversation happens on a call.
        </h2>
        <p className="mt-5 text-lg leading-relaxed text-mist">
          A clinic desk, a shop counter, a railway platform. Tap a card and it is shown in large text and read
          aloud. Their answer comes back as text you can read at a glance.
        </p>
      </div>

      <div className="mt-12 grid gap-6 lg:grid-cols-[1.05fr_1fr]">
        {/* Your side */}
        <div className="card p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">You · tap to say</p>
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
          <button
            onClick={() => setSpeak((s) => !s)}
            className="mt-5 inline-flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.14em] text-mist hover:text-cream"
          >
            {speak ? <Volume2 size={14} /> : <VolumeX size={14} />} Read aloud {speak ? 'on' : 'off'}
          </button>
        </div>

        {/* Their side: the phone turned toward the other person */}
        <div className="card flex flex-col p-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-mist">What they see</p>
          <div className="mt-4 flex min-h-[132px] items-center border-l border-saffron/60 pl-5">
            <p className="font-bricolage text-[clamp(24px,2.6vw,34px)] font-bold leading-tight tracking-[-0.02em]">
              {lastYou ? lastYou.text : <span className="text-mist/60">Tap a card on the left.</span>}
            </p>
          </div>
          <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.16em] text-mist">Their reply · demo</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {REPLIES[scenario].map((r) => (
              <button
                key={r}
                disabled={!lastYou}
                onClick={() => setThread((t) => [...t, { from: 'them', text: r }])}
                className="rounded-[4px] border border-white/15 px-3 py-2 text-sm text-mist transition-colors hover:border-white/40 hover:text-cream disabled:opacity-40"
              >
                {r}
              </button>
            ))}
          </div>
          <div className="mt-5 min-h-[72px] border-l border-white/20 pl-5">
            <p className="text-xl leading-snug text-cream">
              {lastThem ? lastThem.text : <span className="text-mist/60">Their reply appears here as large text.</span>}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-5">
        <Link
          to="/daily"
          className="inline-flex min-h-[52px] items-center gap-2.5 rounded-[4px] bg-saffron px-7 text-base font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5"
        >
          Open the Daily Translator <ArrowRight size={18} strokeWidth={2.4} />
        </Link>
        <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-mist/70">
          Cards are plain text, not ISL translations. Replies here are scripted.
        </p>
      </div>
    </section>
  );
}
