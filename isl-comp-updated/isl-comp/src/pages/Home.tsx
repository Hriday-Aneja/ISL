import { Link } from 'react-router-dom';
import {
  ArrowRight,
  Check,
  MessageCircle,
  Mic,
  PersonStanding,
  Type,
  Video,
  Volume2,
  Waypoints,
} from 'lucide-react';
import { HeroOrb } from '../components/landing/HeroOrb';
import { SIGN_LABELS } from '../data/signMappings';

const SIGN_WORDS = Array.from(new Set(Object.values(SIGN_LABELS)));
const SIGN_COUNT = SIGN_WORDS.length;

const gradientText =
  'bg-gradient-to-b from-white to-[#BFC6E0] bg-clip-text text-transparent';

export function Home() {
  return (
    <div className="landing relative min-h-screen overflow-hidden bg-night font-dm text-cream">
      {/* Background: dotted grid + drifting colour glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(rgba(255,255,255,0.1)_1px,transparent_1px)] [background-size:30px_30px]"
        style={{
          WebkitMaskImage:
            'radial-gradient(ellipse 75% 65% at 70% 30%, #000 25%, transparent 80%)',
          maskImage: 'radial-gradient(ellipse 75% 65% at 70% 30%, #000 25%, transparent 80%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-32 -top-32 h-[520px] w-[520px] animate-blob-drift rounded-full bg-mint opacity-[0.22] blur-[100px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-36 top-[520px] h-[420px] w-[420px] animate-blob-drift rounded-full bg-saffron opacity-[0.18] blur-[100px] [animation-delay:-6s]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-[38%] top-[280px] h-[360px] w-[360px] animate-blob-drift rounded-full bg-[#7C6CFF] opacity-[0.18] blur-[100px] [animation-delay:-3s]"
      />

      <LandingNav />

      {/* Hero */}
      <section className="relative mx-auto grid max-w-[1312px] items-center gap-10 px-6 pb-20 pt-10 lg:grid-cols-2 lg:px-16">
        <div>
          <div
            className="inline-flex animate-word-rise items-center gap-2.5 rounded-full border border-mint/35 bg-mint/10 py-2 pl-3 pr-[18px] text-sm font-medium text-mint"
          >
            <span className="h-2 w-2 animate-dot-pulse rounded-full bg-mint" />
            Real-time Indian Sign Language
          </div>

          <h1 className="mt-7 font-bricolage text-[clamp(44px,6vw,88px)] font-bold leading-[0.96] tracking-[-0.04em]">
            <span
              className={`inline-block animate-word-rise ${gradientText}`}
              style={{ animationDelay: '0.1s' }}
            >
              Signs speak.
            </span>
            <br />
            <span
              className="relative inline-block animate-word-rise text-saffron"
              style={{ animationDelay: '0.2s' }}
            >
              Words sign
              <svg
                aria-hidden
                viewBox="0 0 300 16"
                preserveAspectRatio="none"
                className="absolute -bottom-2 left-0 h-3.5 w-full"
              >
                <path
                  d="M4 10C60 2 140 2 296 8"
                  stroke="#FFB547"
                  strokeWidth={4}
                  fill="none"
                  strokeLinecap="round"
                  className="animate-draw"
                  style={{ strokeDasharray: 300, strokeDashoffset: 300 }}
                />
              </svg>
            </span>
            <br />
            <span
              className={`inline-block animate-word-rise ${gradientText}`}
              style={{ animationDelay: '0.3s' }}
            >
              back.
            </span>
          </h1>

          <p
            className="mt-8 max-w-[500px] animate-word-rise text-[19px] leading-relaxed text-mist"
            style={{ animationDelay: '0.4s' }}
          >
            SAMVAAD turns sign language into live captions and speech into a signing avatar, so
            deaf and hearing people can talk in the same room, or on the same call.
          </p>

          <div
            className="mt-10 flex animate-word-rise flex-wrap gap-3.5"
            style={{ animationDelay: '0.5s' }}
          >
            <Link
              to="/room"
              className="relative inline-flex min-h-[54px] items-center gap-2.5 overflow-hidden rounded-full bg-saffron px-7 text-base font-semibold text-[#1A1204] shadow-[0_12px_44px_rgba(255,181,71,0.32)] transition-transform hover:-translate-y-0.5"
            >
              Start a conversation <ArrowRight size={18} strokeWidth={2.4} />
              <span
                aria-hidden
                className="absolute left-[-60%] top-0 h-full w-[40%] animate-shine bg-gradient-to-r from-transparent via-white/55 to-transparent"
              />
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex min-h-[54px] items-center rounded-full border border-white/20 bg-white/[0.04] px-7 text-base font-semibold text-cream transition-transform hover:-translate-y-0.5"
            >
              How it works
            </Link>
          </div>

          <div
            className="mt-12 flex max-w-[500px] animate-word-rise gap-11 border-t border-white/10 pt-6"
            style={{ animationDelay: '0.6s' }}
          >
            <Stat value={String(SIGN_COUNT)} label="ISL signs mapped" />
            <Stat value="2-way" label="sign ⇄ speech" />
            <Stat value="Live" label="in the browser" />
          </div>
        </div>

        <HeroOrb />
      </section>

      {/* Sign marquee */}
      <section
        aria-label="Signs SAMVAAD understands"
        className="relative overflow-hidden border-t border-white/[0.08] py-6"
        style={{
          WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
          maskImage: 'linear-gradient(90deg, transparent, #000 12%, #000 88%, transparent)',
        }}
      >
        <div className="flex w-max animate-marquee gap-3.5">
          {[...SIGN_WORDS, ...SIGN_WORDS].map((word, i) => (
            <span
              key={`${word}-${i}`}
              className="whitespace-nowrap rounded-full border border-white/10 px-[22px] py-2.5 text-[15px] text-mist"
            >
              {word}
            </span>
          ))}
        </div>
      </section>

      {/* Flow preview */}
      <section className="relative mx-auto max-w-[1312px] border-t border-white/[0.08] px-6 py-20 lg:px-16">
        <h2 className="font-bricolage text-3xl font-bold tracking-tight">How the room works</h2>
        <p className="mt-2 max-w-xl text-mist">
          Two directions run in the same session, side by side.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <FlowCard
            tone="mint"
            title="ISL → Hearing"
            steps={[
              { icon: Video, label: 'Camera' },
              { icon: Waypoints, label: 'Sign recognition' },
              { icon: Type, label: 'Sentence' },
              { icon: Volume2, label: 'Speech' },
            ]}
          />
          <FlowCard
            tone="saffron"
            title="Hearing → ISL"
            steps={[
              { icon: Mic, label: 'Microphone' },
              { icon: Type, label: 'Speech-to-text' },
              { icon: Waypoints, label: 'Phrase mapping' },
              { icon: PersonStanding, label: 'Avatar' },
            ]}
          />
        </div>

        <ul className="mt-10 flex flex-wrap gap-x-6 gap-y-2 text-sm text-mist">
          {['Runs in your browser', 'Two-way, sign ⇄ speech', 'Works with Google Meet'].map((t) => (
            <li key={t} className="inline-flex items-center gap-1.5">
              <Check size={15} className="text-mint" /> {t}
            </li>
          ))}
        </ul>
      </section>

      <footer className="relative mx-auto flex max-w-[1312px] flex-wrap justify-between gap-3 border-t border-white/[0.08] px-6 py-8 text-sm text-mist lg:px-16">
        <span>© SAMVAAD · संवाद, meaning “dialogue”</span>
        <span>Indian Sign Language, in real time</span>
      </footer>
    </div>
  );
}

function LandingNav() {
  return (
    <header className="relative z-30 mx-auto grid max-w-[1312px] grid-cols-[1fr_auto] items-center px-6 py-6 sm:grid-cols-[1fr_auto_1fr] lg:px-16">
      <Link to="/" className="flex items-center gap-3">
        <span className="flex h-[42px] w-[42px] items-center justify-center rounded-[13px] bg-saffron text-[#1A1204] shadow-[0_8px_28px_rgba(255,181,71,0.35)]">
          <MessageCircle size={22} strokeWidth={2.2} />
        </span>
        <span className="font-bricolage text-2xl font-bold tracking-tight text-cream">
          Samvaad
        </span>
        <span className="font-deva text-lg text-saffron">संवाद</span>
      </Link>

      <nav className="hidden gap-1.5 rounded-full border border-white/10 bg-white/5 p-1.5 backdrop-blur-xl sm:flex">
        <Link
          to="/"
          className="rounded-full px-[18px] py-2 text-sm text-cream transition-colors hover:bg-white/[0.08]"
        >
          Home
        </Link>
        <Link
          to="/how-it-works"
          className="rounded-full px-[18px] py-2 text-sm text-[#B6BBCE] transition-colors hover:bg-white/[0.08] hover:text-cream"
        >
          How it works
        </Link>
        <Link
          to="/room"
          className="rounded-full px-[18px] py-2 text-sm text-[#B6BBCE] transition-colors hover:bg-white/[0.08] hover:text-cream"
        >
          Communication room
        </Link>
      </nav>

      <div className="flex justify-end">
        <Link
          to="/room"
          className="inline-flex min-h-[44px] items-center rounded-full border border-white/20 bg-white/[0.04] px-[22px] text-[15px] font-semibold text-cream transition-transform hover:-translate-y-0.5"
        >
          Launch app
        </Link>
      </div>
    </header>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <p className="font-bricolage text-[34px] font-bold tracking-tight text-cream">{value}</p>
      <p className="mt-0.5 text-sm text-mist">{label}</p>
    </div>
  );
}

function FlowCard({
  title,
  steps,
  tone,
}: {
  title: string;
  tone: 'mint' | 'saffron';
  steps: { icon: typeof Video; label: string }[];
}) {
  const dot = tone === 'mint' ? 'bg-mint' : 'bg-saffron';
  return (
    <div className="rounded-[22px] border border-white/10 bg-night-card p-6 transition-transform duration-300 hover:-translate-y-1.5">
      <div className="mb-5 flex items-center gap-2.5">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <p className="font-bricolage text-lg font-semibold text-cream">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-[10px] border border-white/10 bg-white/[0.05] px-3 py-2 text-xs text-mist">
              <step.icon size={13} />
              {step.label}
            </div>
            {i < steps.length - 1 && <ArrowRight size={12} className="text-white/30" />}
          </div>
        ))}
      </div>
    </div>
  );
}