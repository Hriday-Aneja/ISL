import { ArrowRight, Video, Waypoints, Type, Volume2, Mic, PersonStanding } from 'lucide-react';
import { PageShell } from '../components/layout/PageShell';

export function HowItWorks() {
  return (
    <PageShell>
      <section className="py-16 sm:py-20">
        <p className="mb-3 font-mono text-xs uppercase tracking-widest text-ink-soft">
          System overview
        </p>
        <h1 className="max-w-2xl font-display text-[1.85rem] font-semibold leading-tight text-ink sm:text-[2.1rem]">
          Two directions, one shared vocabulary of signs
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-relaxed text-ink-soft">
          Every sign carries a consistent ID — like <code className="font-mono text-xs">WATER</code>{' '}
          or <code className="font-mono text-xs">HELP</code> — used across recognition, phrase
          mapping, and avatar playback, so the two flows below stay in sync.
        </p>

        <div className="mt-14 space-y-14">
          <FlowSection
            tone="signal"
            eyebrow="Direction one"
            title="ISL User → Hearing User"
            steps={[
              { icon: Video, title: 'Camera', body: 'The browser opens the ISL user\'s webcam and streams a live preview.' },
              { icon: Waypoints, title: 'Sign recognition', body: 'Frames are analyzed and matched against the sign vocabulary. In this prototype, a mock adapter stands in for the trained recognition model.' },
              { icon: Type, title: 'Natural sentence', body: 'The detected sign sequence is converted into a natural-language sentence using a deterministic mapping.' },
              { icon: Volume2, title: 'Text / Speech', body: 'The sentence is shown on screen and read aloud with the browser\'s text-to-speech engine.' },
            ]}
          />

          <FlowSection
            tone="voice"
            eyebrow="Direction two"
            title="Hearing User → ISL User"
            steps={[
              { icon: Mic, title: 'Microphone', body: 'The browser opens the hearing user\'s microphone and starts listening.' },
              { icon: Type, title: 'Speech-to-text', body: 'Speech is transcribed live using the Web Speech API, with an on-screen running transcript.' },
              { icon: Waypoints, title: 'Phrase / sign mapping', body: 'The transcript is normalized and matched to a known phrase, which resolves to a sequence of sign IDs.' },
              { icon: PersonStanding, title: '3D ISL avatar', body: 'The sign sequence is sent to the avatar, which signs each one in order. This prototype uses a mock avatar stage in place of the real 3D model.' },
            ]}
          />
        </div>

        <div className="mt-16 card p-6">
          <p className="text-sm font-medium text-ink">A note on what's mocked today</p>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
            Both flows are fully wired end-to-end using real browser capabilities — camera,
            microphone, speech-to-text, and text-to-speech all work as shown. The two pieces
            still to come are the trained sign-recognition model and the real 3D avatar
            renderer. Each sits behind a narrow, swappable interface — a recognition function
            that resolves to a sign sequence, and an avatar component that accepts a sign
            sequence — so plugging in the real modules won't require changing anything else in
            the app.
          </p>
        </div>
      </section>
    </PageShell>
  );
}

function FlowSection({
  eyebrow,
  title,
  steps,
  tone,
}: {
  eyebrow: string;
  title: string;
  tone: 'signal' | 'voice';
  steps: { icon: typeof Video; title: string; body: string }[];
}) {
  const dot = tone === 'signal' ? 'bg-signal' : 'bg-voice';
  const line = tone === 'signal' ? 'border-signal/30' : 'border-voice/30';

  return (
    <div>
      <div className="mb-6 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dot}`} />
        <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">{eyebrow}</p>
      </div>
      <h2 className="font-display text-lg font-semibold text-ink">{title}</h2>

      <div className={`mt-6 space-y-0 border-l ${line} pl-6`}>
        {steps.map((step, i) => (
          <div key={step.title} className="relative pb-8 last:pb-0">
            <span
              className={`absolute -left-[31px] top-0 flex h-6 w-6 items-center justify-center rounded-full border bg-paper ${line} text-ink-soft`}
            >
              <step.icon size={12} />
            </span>
            <p className="text-sm font-medium text-ink">
              {i + 1}. {step.title}
            </p>
            <p className="mt-1 max-w-lg text-sm leading-relaxed text-ink-soft">{step.body}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
