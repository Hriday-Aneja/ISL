import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowLeftRight,
  ArrowRight,
  ChevronDown,
  Globe,
  GraduationCap,
  Link2,
  Scale,
  Stethoscope,
  UtensilsCrossed,
  Waypoints,
  Play,
  Video,
} from 'lucide-react';
import { DailyDemo } from '../components/landing/DailyDemo';
import { MirrorHands } from '../components/landing/MirrorHands';
import { SilenceHero } from '../components/landing/SilenceHero';
import { LandingShell } from '../components/landing/LandingShell';
import { LiveDemo } from '../components/landing/LiveDemo';
import { DemoSection } from '../components/signdemo/DemoSection';
import { CountUp, Reveal } from '../components/landing/Reveal';
import { SIGN_LABELS } from '../data/signMappings';

const SIGN_WORDS = Array.from(new Set(Object.values(SIGN_LABELS)));
const SIGN_COUNT = SIGN_WORDS.length;

const gradientText =
  'bg-gradient-to-b from-white to-[#BFC6E0] bg-clip-text text-transparent';

export function Home() {
  const { hash } = useLocation();
  // Arriving from another page via /#live-demo: scroll to the demo once mounted.
  useEffect(() => {
    if (hash !== '#live-demo') return;
    const t = setTimeout(
      () => document.getElementById('live-demo')?.scrollIntoView({ behavior: 'smooth' }),
      100
    );
    return () => clearTimeout(t);
  }, [hash]);

  return (
    <LandingShell>
      {/* Hero: trapped words -> signing hand */}
      <SilenceHero signCount={SIGN_COUNT} />

      <MirrorHands />

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

      <DailyDemo />

      {/* See Samvaad in action: frontend-only sign-to-text pipeline demo */}
      <DemoSection />

      {/* Live demo */}
      <section id="live-demo" className={`${WRAP} pt-24`}>
        <Reveal>
          <SectionHead
            eyebrow="Live demo"
            title={
              <>
                <span className={gradientText}>Type a word, </span>
                <span className="text-saffron">watch it sign</span>
              </>
            }
            sub="Try the same phrase-to-sign mapping and avatar the communication room uses, right here."
          />
        </Reveal>
        <Reveal delay={0.1}>
          <div className="mt-12">
            <LiveDemo />
          </div>
        </Reveal>
      </section>

      {/* Features */}
      <section className={`${WRAP} py-24`}>
        <Reveal>
          <SectionHead
            eyebrow="Features"
            title={
              <>
                <span className={gradientText}>Everything a conversation </span>
                <span className="text-saffron">needs</span>
              </>
            }
            sub="Built around one idea: both people should be able to speak in the language they already use."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          <Reveal className="lg:col-span-2">
            <FeatureCard
              icon={ArrowLeftRight}
              tone="mint"
              title="Two-way, one room"
              text="The signer is captioned and the speaker is signed back to, in the same session. Nobody has to wait for the other."
            >
              <div className="mt-6 space-y-3">
                <div className="flex items-end gap-3">
                  <span className="rounded-full bg-mint/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-mint">
                    Signed
                  </span>
                  <p className="rounded-2xl rounded-bl-md bg-white/[0.07] px-4 py-2.5 text-[15px] text-cream">
                    Hello, doctor. I need help.
                  </p>
                </div>
                <div className="flex flex-row-reverse items-end gap-3">
                  <span className="rounded-full bg-saffron/15 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wider text-saffron">
                    Spoken
                  </span>
                  <p className="rounded-2xl rounded-br-md bg-saffron px-4 py-2.5 text-[15px] font-medium text-[#1A1204]">
                    Please sit down. What is the pain?
                  </p>
                </div>
              </div>
            </FeatureCard>
          </Reveal>

          <Reveal delay={0.1}>
            <FeatureCard
              icon={Video}
              tone="saffron"
              title="A signing avatar"
              text="Spoken words become a sequence of signs, played back one by one by an avatar."
            >
              <div className="mt-6 flex flex-wrap gap-2">
                {['Hello', 'Doctor', 'Thank you'].map((w, i) => (
                  <span
                    key={w}
                    className={`inline-flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold uppercase tracking-wide ${
                      i === 0 ? 'bg-saffron text-[#1A1204]' : 'bg-white/[0.06] text-mist'
                    }`}
                  >
                    <Play size={11} fill="currentColor" /> {w}
                  </span>
                ))}
              </div>
            </FeatureCard>
          </Reveal>

          <Reveal>
            <FeatureCard
              icon={Link2}
              tone="mint"
              title="Join with a link"
              text="Open a room and send the link. The other person joins straight from their browser."
            >
              <p className="mt-6 truncate rounded-xl border border-white/10 bg-black/30 px-3.5 py-2.5 font-mono text-xs text-mist">
                samvaad / room / <span className="text-mint">ab12-cd34</span>
              </p>
            </FeatureCard>
          </Reveal>

          <Reveal delay={0.1}>
            <FeatureCard
              icon={Globe}
              tone="saffron"
              title="Works with Google Meet"
              text="A Chrome extension adds sign captions to the video calls you already use."
            />
          </Reveal>

          <Reveal delay={0.2}>
            <FeatureCard
              icon={Waypoints}
              tone="mint"
              title="One shared vocabulary"
              text="Every sign has a single ID across recognition, phrase mapping and avatar playback."
            >
              <div className="mt-6 flex flex-wrap gap-2">
                {['HELLO', 'WATER', 'HELP'].map((id) => (
                  <code
                    key={id}
                    className="rounded-md border border-white/15 bg-white/[0.07] px-2 py-1 font-mono text-xs text-saffron"
                  >
                    {id}
                  </code>
                ))}
              </div>
            </FeatureCard>
          </Reveal>
        </div>
      </section>

      {/* Stats */}
      <section className={`${WRAP} pb-24`}>
        <Reveal>
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[28px] border border-white/10 bg-white/10 lg:grid-cols-4">
            <BigStat label="signs mapped">
              <CountUp to={SIGN_COUNT} />
            </BigStat>
            <BigStat label="directions of translation">
              <CountUp to={2} />
            </BigStat>
            <BigStat label="shared vocabulary">
              <CountUp to={1} />
            </BigStat>
            <BigStat label="in your browser">
              <span className="text-saffron">Live</span>
            </BigStat>
          </div>
        </Reveal>
      </section>

      {/* Use cases */}
      <section className={`${WRAP} pb-24`}>
        <Reveal>
          <SectionHead
            eyebrow="Made for real moments"
            title={
              <>
                <span className={gradientText}>Where a shared language </span>
                <span className="text-saffron">matters</span>
              </>
            }
            sub="The vocabulary is built around everyday places, where being understood is not optional."
          />
        </Reveal>

        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {USE_CASES.map((u, i) => (
            <Reveal key={u.title} delay={i * 0.08}>
              <div className="group h-full rounded-[22px] border border-white/10 bg-night-card p-6 transition-all duration-300 hover:-translate-y-2 hover:border-saffron/40 hover:shadow-glass">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-saffron/15 text-saffron transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110">
                  <u.icon size={22} />
                </span>
                <h3 className="mt-5 font-bricolage text-xl font-semibold text-cream">{u.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-mist">{u.text}</p>
                <div className="mt-5 flex flex-wrap gap-1.5">
                  {u.signs.map((s) => (
                    <span
                      key={s}
                      className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs text-mist"
                    >
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section className={`${WRAP} pb-24`}>
        <div className="mx-auto max-w-3xl">
          <Reveal>
            <SectionHead
              eyebrow="FAQ"
              title={
                <>
                  <span className={gradientText}>Questions, </span>
                  <span className="text-saffron">answered</span>
                </>
              }
            />
          </Reveal>
          <div className="mt-12 space-y-3">
            {FAQS.map((f, i) => (
              <Reveal key={f.q} delay={i * 0.05}>
                <details className="group rounded-2xl border border-white/10 bg-night-card px-6 py-5 open:border-mint/30">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-bricolage text-lg font-semibold text-cream [&::-webkit-details-marker]:hidden">
                    {f.q}
                    <ChevronDown
                      size={20}
                      className="flex-none text-mist transition-transform duration-300 group-open:rotate-180 group-open:text-mint"
                    />
                  </summary>
                  <p className="mt-3 text-[15px] leading-relaxed text-mist">{f.a}</p>
                </details>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className={`${WRAP} pb-24`}>
        <Reveal>
          <div className="relative overflow-hidden rounded-[36px] border border-white/10 bg-gradient-to-br from-[#2a1f5c] via-[#171f48] to-[#0f2f33] px-8 py-20 text-center">
            <div
              aria-hidden
              className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 animate-blob-drift rounded-full bg-saffron opacity-25 blur-[90px]"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute -bottom-24 -right-24 h-72 w-72 animate-blob-drift rounded-full bg-mint opacity-25 blur-[90px] [animation-delay:-5s]"
            />
            <h2 className="relative mx-auto max-w-2xl font-bricolage text-[clamp(32px,4.4vw,56px)] font-bold leading-[1.04] tracking-[-0.035em]">
              <span className={gradientText}>Start a conversation </span>
              <span className="text-saffron">everyone can join.</span>
            </h2>
            <p className="relative mx-auto mt-5 max-w-lg text-lg text-mist">
              Open a room, switch on your camera, and let the signs speak.
            </p>
            <div className="relative mt-9 flex flex-wrap justify-center gap-3.5">
              <Link
                to="/room"
                className="relative inline-flex min-h-[54px] items-center gap-2.5 overflow-hidden rounded-full bg-saffron px-7 text-base font-semibold text-[#1A1204] shadow-[0_12px_44px_rgba(197,139,78,0.32)] transition-transform hover:-translate-y-0.5"
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
                See how it works
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </LandingShell>
  );
}

const WRAP = 'relative mx-auto max-w-[1312px] px-6 lg:px-16';

const USE_CASES = [
  {
    icon: Stethoscope,
    title: 'Healthcare',
    text: 'Describe symptoms and understand a doctor, without waiting for an interpreter.',
    signs: ['Doctor', 'Pain', 'Emergency', 'Help'],
  },
  {
    icon: GraduationCap,
    title: 'Education',
    text: 'Let a teacher and a student follow the same lesson in real time.',
    signs: ['Teacher', 'Student', 'Name', 'Please'],
  },
  {
    icon: UtensilsCrossed,
    title: 'Everyday places',
    text: 'Order, ask and thank people in restaurants and shops.',
    signs: ['Restaurant', 'Waiter', 'Food', 'Water'],
  },
  {
    icon: Scale,
    title: 'Public services',
    text: 'Ask for directions and get help at stations, offices and counters.',
    signs: ['Lawyer', 'Train station', 'Where', 'Washroom'],
  },
];

const FAQS = [
  {
    q: 'Do I need any special equipment?',
    a: 'No. A webcam and a microphone in a modern browser are enough. Everything runs in the browser, so there is nothing to install to try a room.',
  },
  {
    q: 'Which sign language does SAMVAAD use?',
    a: `Indian Sign Language (ISL). It currently maps ${SIGN_COUNT} signs, and every sign shares one ID across recognition, phrase mapping and avatar playback, so the vocabulary can keep growing.`,
  },
  {
    q: 'Can I use it on a video call?',
    a: 'Yes. The project includes a Chrome extension that adds sign captions to Google Meet, alongside the standalone communication room.',
  },
  {
    q: 'How does the other person join?',
    a: 'Open a room and share its link. They join from their own browser and the two of you are connected in the same session.',
  },
  {
    q: 'Is it ready for everyday use?',
    a: 'SAMVAAD is a working prototype. The camera, microphone, speech-to-text and text-to-speech flows are live, and the trained recognition model and the full 3D avatar are the pieces still being plugged in.',
  },
];

function SectionHead({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub?: string;
}) {
  return (
    <div className="max-w-2xl">
      <span className="eyebrow">
        {eyebrow}
      </span>
      <h2 className="mt-5 font-bricolage text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.04] tracking-[-0.035em]">
        {title}
      </h2>
      {sub && <p className="mt-5 text-lg leading-relaxed text-mist">{sub}</p>}
    </div>
  );
}

function FeatureCard({
  icon: Icon,
  tone,
  title,
  text,
  children,
}: {
  icon: typeof Globe;
  tone: 'mint' | 'saffron';
  title: string;
  text: string;
  children?: React.ReactNode;
}) {
  const iconTone = tone === 'mint' ? 'bg-mint/15 text-mint' : 'bg-saffron/15 text-saffron';
  return (
    <div className="group h-full rounded-[22px] border border-white/10 bg-night-card p-7 transition-all duration-300 hover:-translate-y-2 hover:border-white/25 hover:shadow-glass">
      <span
        className={`flex h-12 w-12 items-center justify-center rounded-2xl transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${iconTone}`}
      >
        <Icon size={22} />
      </span>
      <h3 className="mt-5 font-bricolage text-xl font-semibold text-cream">{title}</h3>
      <p className="mt-2 text-[15px] leading-relaxed text-mist">{text}</p>
      {children}
    </div>
  );
}

function BigStat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-night px-6 py-10 text-center">
      <p className="font-bricolage text-[clamp(40px,5vw,64px)] font-bold leading-none tracking-[-0.04em] text-cream">
        {children}
      </p>
      <p className="mt-3 text-sm text-mist">{label}</p>
    </div>
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