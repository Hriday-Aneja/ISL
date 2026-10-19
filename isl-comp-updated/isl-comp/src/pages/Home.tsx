import { Link } from 'react-router-dom';
import { ArrowRight, Video, Type, Volume2, Mic, Waypoints, PersonStanding, Hand, MessageSquareText } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';

export function Home() {
  return (
    <PageShell>
      {/* Hero */}
      <section className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[1.05fr_1fr] lg:items-center">
        <div>
          <p className="mb-4 font-mono text-xs uppercase tracking-widest text-signal">
            Indian Sign Language · Real-time
          </p>
          <h1 className="font-display text-[2.3rem] font-semibold leading-[1.12] tracking-tight text-ink sm:text-[2.65rem]">
            Two languages.
            <br />
            One conversation.
          </h1>
          <p className="mt-5 max-w-md text-base leading-relaxed text-ink-soft">
            SAMVAAD puts an ISL user and a hearing user in the same room. One signs, the
            other speaks — both are understood in real time.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link to="/room" className="btn-primary px-5 py-3">
              Start Communication <ArrowRight size={16} />
            </Link>
            <Link to="/how-it-works" className="btn-secondary px-5 py-3">
              How It Works
            </Link>
          </div>
        </div>

        {/* Layered hero visual: a quiet depth panel behind the actual
            product preview — communicates Sign ⇄ Speech/Text without
            reaching for generic AI-brain/cube/sphere imagery. */}
        <div className="relative">
          <div
            aria-hidden
            className="absolute -right-3 -top-3 hidden h-full w-full rounded-lg border border-line bg-signal-soft/40 sm:block"
            style={{ transform: 'rotate(1.5deg)' }}
          />
          <div className="card relative overflow-hidden rounded-lg shadow-float">
            {/* Concept strip: Sign ⇄ Text/Speech ⇄ Hearing */}
            <div className="flex items-center justify-between gap-2 border-b border-line bg-paper-dim/60 px-5 py-4">
              <ConceptNode icon={Hand} label="Sign" tone="signal" />
              <span className="mx-1 h-px flex-1 border-t border-dashed border-ink-soft/25" />
              <ConceptNode icon={MessageSquareText} label="Text" tone="neutral" />
              <span className="mx-1 h-px flex-1 border-t border-dashed border-ink-soft/25" />
              <ConceptNode icon={Volume2} label="Hearing" tone="voice" />
            </div>

            <div className="grid grid-cols-2 divide-x divide-line">
              <div className="bg-room-bg p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-white/35">
                  ISL User
                </p>
                <div className="flex h-24 items-center justify-center rounded-sm border border-white/10 bg-white/[0.04]">
                  <Video size={20} className="text-white/40" />
                </div>
                <div className="mt-3 flex flex-wrap gap-1">
                  <span className="sign-chip border-signal/30 bg-signal-soft text-signal-deep">
                    I
                  </span>
                  <span className="sign-chip border-signal/30 bg-signal-soft text-signal-deep">
                    Need
                  </span>
                  <span className="sign-chip border-signal bg-signal text-white">Water</span>
                </div>
              </div>
              <div className="bg-white p-4">
                <p className="mb-3 text-[10px] font-semibold uppercase tracking-wide text-ink-soft">
                  Hearing User
                </p>
                <p className="font-display text-base font-medium text-ink">"I need water."</p>
                <div className="mt-4 flex items-center gap-2 text-ink-soft">
                  <Volume2 size={14} />
                  <div className="h-1 flex-1 rounded-full bg-paper-dim">
                    <div className="h-1 w-2/3 rounded-full bg-voice" />
                  </div>
                </div>
              </div>
            </div>
            <div className="border-t border-line bg-paper px-4 py-3">
              <p className="text-xs text-ink-soft">
                A live preview of the Communication Room — signs become speech, speech becomes
                signs.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Flow preview */}
      <section className="border-t border-line py-16">
        <h2 className="font-display text-xl font-semibold text-ink">How the room works</h2>
        <p className="mt-2 max-w-xl text-sm text-ink-soft">
          Two directions run in the same session, side by side.
        </p>

        <div className="mt-10 grid gap-6 sm:grid-cols-2">
          <FlowCard
            tone="signal"
            title="ISL → Hearing"
            steps={[
              { icon: Video, label: 'Camera' },
              { icon: Waypoints, label: 'Sign recognition' },
              { icon: Type, label: 'Sentence' },
              { icon: Volume2, label: 'Speech' },
            ]}
          />
          <FlowCard
            tone="voice"
            title="Hearing → ISL"
            steps={[
              { icon: Mic, label: 'Microphone' },
              { icon: Type, label: 'Speech-to-text' },
              { icon: Waypoints, label: 'Phrase mapping' },
              { icon: PersonStanding, label: 'Avatar' },
            ]}
          />
        </div>
      </section>
    </PageShell>
  );
}

function ConceptNode({
  icon: Icon,
  label,
  tone,
}: {
  icon: typeof Hand;
  label: string;
  tone: 'signal' | 'voice' | 'neutral';
}) {
  const toneClasses =
    tone === 'signal'
      ? 'bg-signal-soft text-signal-deep border-signal/30'
      : tone === 'voice'
      ? 'bg-voice-soft text-voice-deep border-voice/40'
      : 'bg-white text-ink-soft border-line';
  return (
    <div className="flex flex-col items-center gap-1.5">
      <span className={`flex h-9 w-9 items-center justify-center rounded-full border ${toneClasses}`}>
        <Icon size={15} strokeWidth={2} />
      </span>
      <span className="text-[10px] font-medium uppercase tracking-wide text-ink-soft">
        {label}
      </span>
    </div>
  );
}

function FlowCard({
  title,
  steps,
  tone,
}: {
  title: string;
  tone: 'signal' | 'voice';
  steps: { icon: typeof Video; label: string }[];
}) {
  const dot = tone === 'signal' ? 'bg-signal' : 'bg-voice';
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="text-sm font-medium text-ink">{title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {steps.map((step, i) => (
          <div key={step.label} className="flex items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-sm border border-line bg-paper px-2.5 py-1.5 text-xs text-ink-soft">
              <step.icon size={13} />
              {step.label}
            </div>
            {i < steps.length - 1 && <ArrowRight size={12} className="text-ink-soft/40" />}
          </div>
        ))}
      </div>
    </div>
  );
}
