import { Link } from 'react-router-dom';
import { ArrowRight, Info, Mic, PersonStanding, Type, Video, Volume2, Waypoints } from 'lucide-react';
import { LandingShell } from '../components/landing/LandingShell';
import { SIGN_LABELS } from '../data/signMappings';

const SIGN_IDS = Object.keys(SIGN_LABELS).slice(0, 12);

const gradientText = 'bg-gradient-to-b from-white to-[#BFC6E0] bg-clip-text text-transparent';

const TONES = {
  mint: {
    dot: 'bg-mint',
    label: 'text-mint',
    node: 'border-mint/40 bg-mint/10 text-mint',
    ring: 'border-mint',
  },
  saffron: {
    dot: 'bg-saffron',
    label: 'text-saffron',
    node: 'border-saffron/40 bg-saffron/10 text-saffron',
    ring: 'border-saffron',
  },
} as const;

const idChip =
  'rounded-md border border-white/15 bg-white/[0.07] px-1.5 py-0.5 font-mono text-xs text-saffron';

export function HowItWorks() {
  return (
    <LandingShell>
      <section className="mx-auto max-w-[1312px] px-6 pb-10 pt-10 lg:px-16">
        <div className="inline-flex animate-word-rise items-center gap-2.5 rounded-full border border-mint/35 bg-mint/10 py-2 pl-3 pr-[18px] font-mono text-xs font-medium uppercase tracking-widest text-mint">
          <span className="h-2 w-2 animate-dot-pulse rounded-full bg-mint" />
          System overview
        </div>

        <h1
          className="mt-7 max-w-4xl animate-word-rise font-bricolage text-[clamp(38px,5vw,68px)] font-bold leading-[1] tracking-[-0.04em]"
          style={{ animationDelay: '0.1s' }}
        >
          <span className={gradientText}>Two directions, one shared </span>
          <span className="text-saffron">vocabulary of signs</span>
        </h1>

        <p
          className="mt-6 max-w-xl animate-word-rise text-lg leading-relaxed text-mist"
          style={{ animationDelay: '0.2s' }}
        >
          Every sign carries a consistent ID — like <code className={idChip}>WATER</code> or{' '}
          <code className={idChip}>HELP</code> — used across recognition, phrase mapping, and
          avatar playback, so the two flows below stay in sync.
        </p>

        <div
          className="mt-8 flex max-w-3xl animate-word-rise flex-wrap gap-2"
          style={{ animationDelay: '0.3s' }}
          aria-label="Examples of shared sign IDs"
        >
          {SIGN_IDS.map((id, i) => (
            <span
              key={id}
              className="animate-float rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 font-mono text-xs text-mist"
              style={{ animationDelay: `${-i * 0.45}s` }}
            >
              {id}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-[1312px] gap-6 px-6 py-10 lg:grid-cols-2 lg:px-16">
        <FlowCard
          tone="mint"
          eyebrow="Direction one"
          title="ISL User → Hearing User"
          delay={0.35}
          steps={[
            { icon: Video, title: 'Camera', body: "The browser opens the ISL user's webcam and streams a live preview." },
            { icon: Waypoints, title: 'Sign recognition', body: 'Frames are analyzed and matched against the sign vocabulary. In this prototype, a mock adapter stands in for the trained recognition model.' },
            { icon: Type, title: 'Natural sentence', body: 'The detected sign sequence is converted into a natural-language sentence using a deterministic mapping.' },
            { icon: Volume2, title: 'Text / Speech', body: "The sentence is shown on screen and read aloud with the browser's text-to-speech engine." },
          ]}
        />
        <FlowCard
          tone="saffron"
          eyebrow="Direction two"
          title="Hearing User → ISL User"
          delay={0.5}
          steps={[
            { icon: Mic, title: 'Microphone', body: "The browser opens the hearing user's microphone and starts listening." },
            { icon: Type, title: 'Speech-to-text', body: 'Speech is transcribed live using the Web Speech API, with an on-screen running transcript.' },
            { icon: Waypoints, title: 'Phrase / sign mapping', body: 'The transcript is normalized and matched to a known phrase, which resolves to a sequence of sign IDs.' },
            { icon: PersonStanding, title: '3D ISL avatar', body: 'The sign sequence is sent to the avatar, which signs each one in order. This prototype uses a mock avatar stage in place of the real 3D model.' },
          ]}
        />
      </section>

      <section className="mx-auto max-w-[1312px] px-6 pb-20 pt-4 lg:px-16">
        <div className="flex flex-col gap-6 rounded-[24px] border border-saffron/25 bg-saffron/[0.06] p-8 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex gap-4">
            <span className="flex h-11 w-11 flex-none items-center justify-center rounded-[12px] bg-saffron/15 text-saffron">
              <Info size={20} />
            </span>
            <div>
              <h2 className="font-bricolage text-xl font-semibold text-cream">
                A note on what&rsquo;s mocked today
              </h2>
              <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-mist">
                Both flows are fully wired end-to-end using real browser capabilities — camera,
                microphone, speech-to-text, and text-to-speech all work as shown. The two pieces
                still to come are the trained sign-recognition model and the real 3D avatar
                renderer. Each sits behind a narrow, swappable interface — a recognition function
                that resolves to a sign sequence, and an avatar component that accepts a sign
                sequence — so plugging in the real modules won&rsquo;t require changing anything
                else in the app.
              </p>
            </div>
          </div>
          <Link
            to="/room"
            className="relative inline-flex min-h-[54px] flex-none items-center justify-center gap-2.5 overflow-hidden rounded-full bg-saffron px-7 text-base font-semibold text-[#1A1204] shadow-[0_12px_44px_rgba(197,139,78,0.32)] transition-transform hover:-translate-y-0.5"
          >
            Try the room <ArrowRight size={18} strokeWidth={2.4} />
            <span
              aria-hidden
              className="absolute left-[-60%] top-0 h-full w-[40%] animate-shine bg-gradient-to-r from-transparent via-white/55 to-transparent"
            />
          </Link>
        </div>
      </section>
    </LandingShell>
  );
}

function FlowCard({
  eyebrow,
  title,
  steps,
  tone,
  delay,
}: {
  eyebrow: string;
  title: string;
  tone: keyof typeof TONES;
  delay: number;
  steps: { icon: typeof Video; title: string; body: string }[];
}) {
  const t = TONES[tone];

  return (
    <div
      className="animate-word-rise rounded-[26px] border border-white/10 bg-night-card p-7 transition-transform duration-300 hover:-translate-y-1.5 sm:p-9"
      style={{ animationDelay: `${delay}s` }}
    >
      <div className="flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 animate-dot-pulse rounded-full ${t.dot}`} />
        <p className={`font-mono text-xs uppercase tracking-widest ${t.label}`}>{eyebrow}</p>
      </div>
      <h2 className="mt-3 font-bricolage text-[26px] font-bold tracking-tight text-cream">
        {title}
      </h2>

      <ol className="mt-8">
        {steps.map((step, i) => (
          <li key={step.title} className="relative flex gap-5 pb-9 last:pb-0">
            {i < steps.length - 1 && (
              <span
                aria-hidden
                className="absolute bottom-0 left-[21px] top-12 w-px border-l border-dashed border-white/20"
              />
            )}
            <span className="relative flex h-11 w-11 flex-none items-center justify-center">
              <span
                aria-hidden
                className={`absolute inset-0 animate-ripple rounded-full border ${t.ring}`}
                style={{ animationDelay: `${i * 0.8}s` }}
              />
              <span
                className={`relative flex h-11 w-11 items-center justify-center rounded-full border ${t.node}`}
              >
                <step.icon size={18} />
              </span>
            </span>
            <div className="pt-0.5">
              <p className="font-bricolage text-lg font-semibold text-cream">
                <span className="mr-2 font-mono text-xs text-mist">0{i + 1}</span>
                {step.title}
              </p>
              <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-mist">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}