import { Globe, Mic, Play, Video } from 'lucide-react';

const BAR_COUNT = 56;

function mixColor(t: number) {
  const a = [0x4d, 0xe3, 0xc1];
  const b = [0xff, 0xb5, 0x47];
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * t));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

const BARS = Array.from({ length: BAR_COUNT }, (_, i) => {
  const angle = (i * 360) / BAR_COUNT;
  return {
    angle,
    height: 26 + ((i * 7) % 18),
    color: mixColor(Math.abs(Math.sin((angle * Math.PI) / 180))),
    delay: (i * 0.173) % 2.2,
  };
});

const CAPTIONS = [
  { text: 'Hello!', color: '#ececee' },
  { text: 'Doctor', color: '#8fa4c4' },
  { text: 'Thank you', color: '#86a89f' },
];

const FLOATING_WORDS = [
  { word: 'Hello', pos: 'left-[6%] top-[9%]', color: 'text-saffron', delay: '0s' },
  { word: 'Doctor', pos: 'right-[6%] top-[15%]', color: 'text-mint', delay: '-2s' },
  { word: 'Teacher', pos: 'left-[5%] bottom-[17%]', color: 'text-mint', delay: '-4s' },
  { word: 'Thank you', pos: 'right-[7%] bottom-[12%]', color: 'text-saffron', delay: '-1s' },
];

export function HeroOrb() {
  return (
    <div className="relative py-5 [perspective:1400px]">
      {/* Orbit rings */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[600px] w-[600px] animate-ring-spin rounded-full border border-dashed border-white/15 sm:block"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <span className="absolute -top-[5px] left-1/2 h-2.5 w-2.5 rounded-full bg-saffron shadow-[0_0_20px_#8fa4c4]" />
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[520px] w-[520px] animate-ring-spin rounded-full border border-dashed border-mint/20 [animation-direction:reverse] [animation-duration:45s] sm:block"
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <span className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 rounded-full bg-mint shadow-[0_0_20px_#86a89f]" />
      </div>

      {/* Floating glass cards */}
      <div className="absolute -left-5 top-12 z-20 hidden animate-float items-center gap-3 rounded-2xl border border-white/15 bg-[#101114]/80 px-4 py-3 shadow-glass backdrop-blur-xl [animation-delay:-2s] lg:flex">
        <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-saffron/15 text-saffron">
          <Video size={18} />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-mist">
            Recognised
          </p>
          <p className="font-bricolage text-xl font-bold text-cream">Hello</p>
        </div>
        <div className="w-[90px]">
          <p className="text-right text-xs font-semibold text-mint">98%</p>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <i className="block h-full animate-grow rounded-full bg-gradient-to-r from-mint to-saffron" />
          </div>
        </div>
      </div>

      <div className="absolute -left-9 bottom-10 z-20 hidden w-[290px] animate-float rounded-2xl border border-white/15 bg-[#101114]/80 p-4 shadow-glass backdrop-blur-xl [animation-delay:-4s] lg:block">
        <div className="flex items-center justify-between">
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.08em] text-mint">
            <Mic size={14} /> Speech → Sign
          </p>
          <div aria-hidden className="flex h-[22px] items-center gap-[3px]">
            {[0, 0.2, 0.4].map((d) => (
              <span
                key={d}
                className="block w-[3px] animate-bar-eq rounded-sm bg-mint"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
        </div>
        <p className="my-2.5 font-bricolage text-[17px] font-semibold text-cream">
          “Hello, thank you.”
        </p>
        <div className="flex gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-saffron px-3 py-1.5 text-xs font-semibold tracking-wide text-[#0e1116]">
            <Play size={11} fill="currentColor" /> HELLO
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-mist">
            <Play size={11} fill="currentColor" /> THANK YOU
          </span>
        </div>
      </div>

      <div className="absolute -right-3 bottom-32 z-20 hidden animate-float items-center gap-2.5 rounded-2xl border border-white/15 bg-[#101114]/80 px-4 py-3 text-sm font-medium text-cream shadow-glass backdrop-blur-xl [animation-delay:-3s] lg:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-mint/15 text-mint">
          <Globe size={16} />
        </span>
        Captions on Google Meet
      </div>

      {/* Main orb card */}
      <div className="relative mx-auto max-w-[470px] animate-tilt rounded-[30px] border border-white/10 bg-gradient-to-br from-[#1b1c20]/95 to-[#111215]/95 shadow-orb">
        <div className="flex items-center justify-between border-b border-white/[0.08] px-[22px] py-4">
          <div className="flex gap-[7px]">
            <span className="h-[11px] w-[11px] rounded-full bg-[#FF6B6B]" />
            <span className="h-[11px] w-[11px] rounded-full bg-saffron" />
            <span className="h-[11px] w-[11px] rounded-full bg-mint" />
          </div>
          <div className="flex items-center gap-2 text-[13px] font-medium text-mist">
            <span className="h-2 w-2 animate-dot-pulse rounded-full bg-[#FF6B6B]" />
            Live translation
          </div>
        </div>

        <div className="relative m-4 h-[430px] overflow-hidden rounded-[20px] border border-mint/20 bg-[radial-gradient(ellipse_at_50%_60%,#1c1e22,#0e0f11_75%)]">
          <svg aria-hidden className="absolute inset-0 h-full w-full">
            <defs>
              <pattern id="orbGrid" width="36" height="36" patternUnits="userSpaceOnUse">
                <path d="M36 0H0V36" fill="none" stroke="rgba(255,255,255,0.05)" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#orbGrid)" />
          </svg>

          <svg
            viewBox="0 0 400 460"
            preserveAspectRatio="xMidYMid meet"
            className="absolute inset-0 h-full w-full"
            role="img"
            aria-label="Circular sound wave around the Devanagari word Samvaad, meaning dialogue"
          >
            <defs>
              <radialGradient id="orbCore" cx="50%" cy="40%" r="70%">
                <stop offset="0" stopColor="#2a2c31" />
                <stop offset="1" stopColor="#15161a" />
              </radialGradient>
              <linearGradient id="orbRim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#8fa4c4" />
                <stop offset="1" stopColor="#86a89f" />
              </linearGradient>
            </defs>
            <g transform="translate(200,232)">
              {[0, 1.6].map((d) => (
                <circle
                  key={d}
                  r={84}
                  fill="none"
                  strokeWidth={2}
                  stroke={d === 0 ? '#86a89f' : '#8fa4c4'}
                  className="animate-ripple"
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
                    animationDelay: `${d}s`,
                  }}
                />
              ))}
              {BARS.map((b, i) => (
                <g key={i} transform={`rotate(${b.angle.toFixed(2)})`}>
                  <rect
                    x={-2}
                    y={-(80 + b.height)}
                    width={4}
                    height={b.height}
                    rx={2}
                    fill={b.color}
                    className="animate-eqr"
                    style={{
                      transformBox: 'fill-box',
                      transformOrigin: '50% 100%',
                      animationDelay: `-${b.delay.toFixed(2)}s`,
                    }}
                  />
                </g>
              ))}
              <circle r={70} fill="url(#orbCore)" stroke="url(#orbRim)" strokeWidth={2.5} />
              <circle r={58} fill="none" stroke="rgba(255,255,255,0.08)" strokeDasharray="3 6" />
              <text
                y={12}
                textAnchor="middle"
                fontFamily="'Noto Sans Devanagari', sans-serif"
                fontWeight={600}
                fontSize={38}
                fill="url(#orbRim)"
              >
                संवाद
              </text>
              <text
                y={38}
                textAnchor="middle"
                fontFamily="'DM Sans', sans-serif"
                fontWeight={600}
                fontSize={10}
                letterSpacing={3}
                fill="#9a9ea5"
              >
                DIALOGUE
              </text>
            </g>
          </svg>

          {FLOATING_WORDS.map((w) => (
            <div
              key={w.word}
              className={`absolute animate-float rounded-full border border-white/15 bg-white/[0.07] px-4 py-2 text-[13px] font-semibold backdrop-blur-md ${w.pos} ${w.color}`}
              style={{ animationDelay: w.delay }}
            >
              {w.word}
            </div>
          ))}

          <div className="absolute bottom-3.5 left-3.5 rounded-full bg-[#0a0b0d]/85 px-3 py-1.5 text-xs font-semibold tracking-[0.05em] text-mint">
            SIGN ⇄ SPEECH
          </div>
          <div className="absolute bottom-3.5 right-3.5 rounded-full bg-saffron/15 px-3 py-1.5 text-xs font-bold tracking-[0.05em] text-saffron">
            LIVE
          </div>
        </div>

        <div className="mx-4 mb-[18px] flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-[18px] py-3.5">
          <div>
            <p className="text-[11.5px] font-semibold uppercase tracking-[0.08em] text-mist">
              Live caption
            </p>
            <div className="relative mt-1 h-[30px] w-[260px] font-bricolage text-[22px] font-semibold tracking-tight">
              {CAPTIONS.map((c, i) => (
                <span
                  key={c.text}
                  data-cycle={i}
                  className="absolute left-0 top-0 animate-cycle whitespace-nowrap opacity-0"
                  style={{ color: c.color, animationDelay: `${i * 3}s` }}
                >
                  {c.text}
                </span>
              ))}
            </div>
          </div>
          <div aria-hidden className="flex h-7 items-center gap-1">
            {[0, 0.15, 0.3, 0.45, 0.6].map((d) => (
              <span
                key={d}
                className="block w-1 animate-bar-eq rounded-sm bg-mint"
                style={{ animationDelay: `${d}s` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}