import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  AudioLines,
  ChevronRight,
  Globe,
  Hand,
  Lightbulb,
  Mic,
  MessageCircle,
  Play,
  Type,
  Users,
  Video,
  X,
} from 'lucide-react';
import { HERO_DISCOVERIES, HERO_FEATURES } from './heroOrbContent';
import type { HeroFeature } from './heroOrbContent';

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
  { text: 'Hello!', color: '#F4F1EA' },
  { text: 'Doctor', color: '#FFB547' },
  { text: 'Thank you', color: '#4DE3C1' },
];

const FLOATING_WORDS = [
  { word: 'Hello', pos: 'left-[6%] top-[9%]', color: 'text-saffron', delay: '0s' },
  { word: 'Doctor', pos: 'right-[6%] top-[15%]', color: 'text-mint', delay: '-2s' },
  { word: 'Teacher', pos: 'left-[5%] bottom-[17%]', color: 'text-mint', delay: '-4s' },
  { word: 'Thank you', pos: 'right-[7%] bottom-[12%]', color: 'text-saffron', delay: '-1s' },
];

export function HeroOrb() {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [message, setMessage] = useState("Hey! I'm SAMVAAD. Tap to explore.");
  const [selectedFeature, setSelectedFeature] = useState(HERO_FEATURES[0]);
  const [selectedDiscovery, setSelectedDiscovery] = useState(HERO_DISCOVERIES[0]);
  const orbButtonRef = useRef<HTMLButtonElement>(null);
  const pointerInside = useRef(false);
  const keyboardFocus = useRef(false);
  const touchPinned = useRef(false);
  const suppressFocusOpen = useRef(false);
  const lastPointerType = useRef<string | null>(null);
  const seenDiscoveries = useRef(new Set([HERO_DISCOVERIES[0].id]));
  const showExplorer = isOpen || isHovered;

  function closeExplorer() {
    touchPinned.current = false;
    suppressFocusOpen.current =
      document.activeElement instanceof HTMLElement &&
      document.activeElement.matches(':focus-visible');
    orbButtonRef.current?.focus();
    setIsOpen(false);
    setIsHovered(false);
    setMessage("Hey! I'm SAMVAAD. Tap to explore.");
  }

  function showNextDiscovery() {
    let candidates = HERO_DISCOVERIES.filter(
      (discovery) => !seenDiscoveries.current.has(discovery.id)
    );

    if (candidates.length === 0) {
      seenDiscoveries.current = new Set([selectedDiscovery.id]);
      candidates = HERO_DISCOVERIES.filter(
        (discovery) => discovery.id !== selectedDiscovery.id
      );
    }
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    seenDiscoveries.current.add(next.id);
    setSelectedDiscovery(next);
  }

  function ExperienceVisual({ visual }: { visual: HeroFeature['visual'] }) {
      return (
        <div
          aria-hidden="true"
          className="hero-orb-demo relative flex min-h-[104px] items-center justify-center overflow-hidden rounded-[16px] border border-white/10 px-3 py-3"
        >
          {visual === 'dialogue' && (
            <div className="relative flex items-center gap-2">
              <span className="absolute left-5 right-5 top-1/2 h-px bg-gradient-to-r from-mint/10 via-mint/70 to-saffron/20" />
              {[
                { label: 'Sign', icon: Hand, tone: 'text-mint' },
                { label: 'Talk', icon: MessageCircle, tone: 'text-saffron' },
                { label: 'Text', icon: Type, tone: 'text-mint' },
              ].map(({ label, icon: Icon, tone }) => (
                <span key={label} className="relative flex flex-col items-center gap-1.5">
                  <span className={`flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-[#111A2B] ${tone}`}>
                    <Icon size={16} />
                  </span>
                  <span className="text-[8px] font-semibold uppercase tracking-wider text-mist">
                    {label}
                  </span>
                </span>
              ))}
            </div>
          )}

          {visual === 'recognition' && (
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-full border border-mint/30 bg-mint/[0.08] text-mint">
                <Hand size={22} />
              </span>
              <ArrowRight size={17} className="text-mist/70" />
              <span className="rounded-full border border-saffron/30 bg-saffron/[0.08] px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-saffron">
                Meaning
              </span>
            </div>
          )}

          {visual === 'speech-sign' && (
            <div className="flex items-center gap-3">
              <div className="flex h-9 items-center gap-[3px] text-mint">
                {[5, 11, 18, 10, 23, 13, 7].map((height, index) => (
                  <span
                    key={index}
                    className="w-[3px] rounded-full bg-current opacity-80"
                    style={{ height }}
                  />
                ))}
              </div>
              <ArrowRight size={16} className="text-mist/70" />
              <span className="flex h-10 items-center gap-1 rounded-xl border border-saffron/25 bg-saffron/[0.07] px-2.5 text-saffron">
                <Play size={11} fill="currentColor" />
                <span className="text-[8px] font-semibold uppercase tracking-wider">Sign clips</span>
              </span>
            </div>
          )}

          {visual === 'captions' && (
            <div className="w-full rounded-xl border border-white/10 bg-[#080D19]/75 p-2.5">
              <div className="flex items-center justify-between text-[8px] font-semibold uppercase tracking-wider text-saffron">
                <span>Sample caption</span>
                <span className="flex items-center gap-1 text-mint">
                  <span className="h-1.5 w-1.5 rounded-full bg-mint" />
                  Preview
                </span>
              </div>
              <p className="mt-1.5 font-bricolage text-[11px] font-medium text-cream">
                “Hello, how can I help?”
              </p>
              <div className="mt-2 flex h-2 items-center gap-1 opacity-60">
                {[10, 16, 7, 13, 5, 15, 9, 18, 8, 12, 6, 14].map((height, index) => (
                  <span key={index} className="w-1 rounded-full bg-mint" style={{ height }} />
                ))}
              </div>
            </div>
          )}

          {visual === 'room' && (
            <div className="flex items-center gap-2.5">
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-mint/30 bg-mint/[0.08] text-mint">
                <Users size={18} />
              </span>
              <span className="h-px w-8 bg-gradient-to-r from-mint via-white/50 to-saffron" />
              <span className="flex h-10 w-10 items-center justify-center rounded-full border border-saffron/30 bg-saffron/[0.08] text-saffron">
                <Users size={18} />
              </span>
            </div>
          )}

          {visual === 'technology' && (
            <div className="flex flex-wrap justify-center gap-1.5">
              {['React', 'TypeScript', 'Vite', 'WebRTC', 'Socket.IO'].map((technology, index) => (
                <span
                  key={technology}
                  className={`rounded-full border px-2 py-1 text-[8px] font-medium ${
                    index % 2 === 0
                      ? 'border-mint/25 bg-mint/[0.06] text-mint'
                      : 'border-saffron/25 bg-saffron/[0.06] text-saffron'
                  }`}
                >
                  {technology}
                </span>
              ))}
            </div>
          )}
        </div>
      );
  }

  const handleOrbPointerMove = (event: React.PointerEvent<HTMLDivElement | HTMLButtonElement>) => {
    const element = event.currentTarget;
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 100;
    const y = ((event.clientY - rect.top) / rect.height) * 100;
    element.style.setProperty('--pointer-x', `${x}%`);
    element.style.setProperty('--pointer-y', `${y}%`);
  };

  return (
    <>
      <style>{`
        .hero-orb-shell {
          --pointer-x: 50%;
          --pointer-y: 50%;
          position: relative;
          width: 100%;
          min-width: 0;
          padding-top: 20px;
          padding-bottom: 20px;
          perspective: 1400px;
        }

        .hero-orb-shell::before {
          content: "";
          position: absolute;
          inset: 0 0 10% 0;
          background: radial-gradient(circle at var(--pointer-x) var(--pointer-y), rgba(77, 227, 193, 0.18), transparent 18%),
            radial-gradient(circle at 70% 30%, rgba(255, 181, 71, 0.2), transparent 22%);
          opacity: 0;
          transition: opacity 300ms ease;
          pointer-events: none;
        }

        .hero-orb-shell.is-interactive::before {
          opacity: 1;
        }

        .hero-orb-button {
          position: relative;
          display: block;
          width: 100%;
          max-width: 470px;
          margin: 0 auto;
          border: 0;
          background: transparent;
          padding: 0;
          text-align: left;
          transform: scale(1) rotateX(0deg) rotateY(0deg);
          transition: transform 280ms cubic-bezier(0.2, 0, 0.2, 1), filter 280ms ease;
          will-change: transform, filter;
        }

        .hero-orb-button:hover,
        .hero-orb-button:focus-visible,
        .hero-orb-shell.is-interactive .hero-orb-button {
          transform: scale(1.02);
          filter: drop-shadow(0 0 30px rgba(77, 227, 193, 0.18));
        }

        .hero-orb-button::after {
          content: "";
          position: absolute;
          inset: 0;
          border-radius: 20px;
          background: linear-gradient(120deg, transparent 0%, rgba(255,255,255,0.24) 15%, transparent 28%);
          opacity: 0;
          transform: translateX(-18%) skewX(-18deg);
          transition: opacity 260ms ease, transform 420ms ease;
          pointer-events: none;
        }

        .hero-orb-button:hover::after,
        .hero-orb-button:focus-visible::after,
        .hero-orb-shell.is-interactive .hero-orb-button::after {
          opacity: 1;
          transform: translateX(20%) skewX(-18deg);
        }

        .orb-core-shell {
          filter: saturate(1.05) brightness(1);
          transition: filter 260ms ease;
        }

        .hero-orb-button:hover .orb-core-shell,
        .hero-orb-button:focus-visible .orb-core-shell,
        .hero-orb-shell.is-interactive .orb-core-shell {
          filter: saturate(1.18) brightness(1.08);
        }

        .orb-ripple {
          transform-origin: center;
          animation: orbPulse 2.6s ease-out infinite;
        }

        .orb-ripple-delay {
          animation-delay: 1.3s;
        }

        .hero-orb-shell.is-interactive .orb-ripple {
          stroke-width: 3;
          animation-duration: 1.9s;
        }

        .hero-orb-button:hover text,
        .hero-orb-button:focus-visible text,
        .hero-orb-shell.is-interactive .hero-orb-button text {
          filter: brightness(1.35);
        }

        .orb-bar {
          transform-box: fill-box;
          transform-origin: 50% 100%;
          animation: barPulse 2.2s ease-in-out infinite;
        }

        .hero-orb-experience {
          opacity: 0;
          transform: translateY(10px) scale(0.97);
          transition: border-color 220ms ease, background-color 220ms ease,
            transform 280ms cubic-bezier(0.2, 0.8, 0.2, 1), opacity 280ms ease;
        }

        .hero-orb-shell.is-interactive .hero-orb-experience {
          opacity: 1;
          transform: translateY(0) scale(1);
          animation: experienceReveal 360ms both;
          animation-delay: var(--experience-delay, 0ms);
        }

        .hero-orb-demo {
          background:
            radial-gradient(circle at 14% 10%, rgba(77, 227, 193, 0.12), transparent 38%),
            linear-gradient(135deg, rgba(255, 255, 255, 0.06), rgba(255, 255, 255, 0.015));
        }

        .hero-orb-discovery {
          animation: discoveryReveal 220ms ease-out;
        }

        .hero-orb-detail {
          animation: experienceDetailReveal 260ms ease-out;
        }

        @keyframes experienceReveal {
          from { opacity: 0; transform: translateY(12px) scale(0.97); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes discoveryReveal {
          from { opacity: 0; transform: translateY(6px); }
          to { opacity: 1; transform: translateY(0); }
        }

        @keyframes experienceDetailReveal {
          from { opacity: 0; transform: translateY(7px) scale(0.99); }
          to { opacity: 1; transform: translateY(0) scale(1); }
        }

        @keyframes orbPulse {
          0% { opacity: 0.5; transform: scale(0.96); }
          50% { opacity: 1; }
          100% { opacity: 0.18; transform: scale(1.08); }
        }

        @keyframes barPulse {
          0%, 100% { opacity: 0.7; transform: scaleY(0.95); }
          50% { opacity: 1; transform: scaleY(1.3); }
        }

        @media (prefers-reduced-motion: reduce) {
          .hero-orb-shell::before,
          .hero-orb-button,
          .hero-orb-button::after,
          .orb-core-shell,
          .hero-orb-experience,
          .orb-ripple,
          .orb-bar,
          .hero-orb-discovery,
          .hero-orb-detail,
          .hero-orb-shell.is-interactive .hero-orb-experience {
            transition: none !important;
            animation: none !important;
          }

          .hero-orb-shell .animate-eqr,
          .hero-orb-shell .animate-ring-spin,
          .hero-orb-shell .animate-float,
          .hero-orb-shell .animate-bar-eq,
          .hero-orb-shell .animate-dot-pulse {
            animation: none !important;
          }

          .hero-orb-shell [data-cycle='0'] {
            opacity: 1 !important;
          }
        }
      `}</style>

      <div
        className={`hero-orb-shell ${showExplorer ? 'is-interactive' : ''}`}
        onPointerMove={handleOrbPointerMove}
        onPointerEnter={(event) => {
          if (event.pointerType !== 'mouse') return;
          pointerInside.current = true;
          setIsHovered(true);
          setIsOpen(true);
          setMessage("Curious about how I work? Choose a topic to explore.");
        }}
        onPointerLeave={(event) => {
          if (event.pointerType !== 'mouse') return;
          pointerInside.current = false;
          setIsHovered(false);
          if (keyboardFocus.current || touchPinned.current) return;
          setIsOpen(false);
          setMessage("Hey! I'm SAMVAAD. Tap to explore.");
        }}
        onPointerDownCapture={() => {
          keyboardFocus.current = false;
        }}
        onFocusCapture={(event) => {
          if (suppressFocusOpen.current) {
            suppressFocusOpen.current = false;
            keyboardFocus.current = false;
            return;
          }
          if (event.target instanceof HTMLElement && event.target.matches(':focus-visible')) {
            keyboardFocus.current = true;
            setIsOpen(true);
            setIsHovered(true);
            setMessage('Welcome! Pick a topic or discover something new.');
          }
        }}
        onBlurCapture={(event) => {
          if (
            event.relatedTarget instanceof Node &&
            event.currentTarget.contains(event.relatedTarget)
          ) {
            return;
          }
          keyboardFocus.current = false;
          setIsHovered(false);
          if (pointerInside.current || touchPinned.current) return;
          setIsOpen(false);
          setMessage("Hey! I'm SAMVAAD. Tap to explore.");
        }}
      >
      {/* Orbit rings */}
      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-1/2 hidden h-[600px] w-[600px] animate-ring-spin rounded-full border border-dashed border-white/15 transition-[filter,opacity] duration-500 motion-reduce:transition-none sm:block ${
          isOpen ? 'brightness-150 opacity-100' : 'opacity-70'
        }`}
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <span className="absolute -top-[5px] left-1/2 h-2.5 w-2.5 rounded-full bg-saffron shadow-[0_0_20px_#FFB547]" />
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute left-1/2 top-1/2 hidden h-[520px] w-[520px] animate-ring-spin rounded-full border border-dashed border-mint/20 transition-[filter,opacity] duration-500 [animation-direction:reverse] [animation-duration:45s] motion-reduce:transition-none sm:block ${
          isOpen ? 'brightness-150 opacity-100' : 'opacity-70'
        }`}
        style={{ transform: 'translate(-50%, -50%)' }}
      >
        <span className="absolute -right-[5px] top-1/2 h-2.5 w-2.5 rounded-full bg-mint shadow-[0_0_20px_#4DE3C1]" />
      </div>

      {/* Floating glass cards */}
      <div className="absolute -left-5 top-12 z-20 hidden animate-float items-center gap-3 rounded-2xl border border-white/15 bg-[#121629]/80 px-4 py-3 shadow-glass backdrop-blur-xl [animation-delay:-2s] lg:flex">
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

      <div className="absolute -left-9 bottom-10 z-20 hidden w-[290px] animate-float rounded-2xl border border-white/15 bg-[#121629]/80 p-4 shadow-glass backdrop-blur-xl [animation-delay:-4s] lg:block">
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
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-saffron px-3 py-1.5 text-xs font-semibold tracking-wide text-[#1A1204]">
            <Play size={11} fill="currentColor" /> HELLO
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-[10px] bg-white/[0.06] px-3 py-1.5 text-xs font-semibold tracking-wide text-mist">
            <Play size={11} fill="currentColor" /> THANK YOU
          </span>
        </div>
      </div>

      <div className="absolute -right-3 bottom-32 z-20 hidden animate-float items-center gap-2.5 rounded-2xl border border-white/15 bg-[#121629]/80 px-4 py-3 text-sm font-medium text-cream shadow-glass backdrop-blur-xl [animation-delay:-3s] lg:flex">
        <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-mint/15 text-mint">
          <Globe size={16} />
        </span>
        Captions on Google Meet
      </div>

      <p
        aria-live="polite"
        aria-atomic="true"
        className="mx-auto mb-3 max-w-[470px] rounded-full border border-white/10 bg-[#121629]/75 px-4 py-2 text-center text-xs font-medium text-mist shadow-glass backdrop-blur-xl transition-colors duration-300 motion-reduce:transition-none sm:text-sm"
      >
        {message}
      </p>

      {/* Main orb card */}
      <button
        ref={orbButtonRef}
        type="button"
        aria-label="Explore SAMVAAD's interactive knowledge orb"
        aria-expanded={showExplorer}
        aria-controls="hero-orb-explorer"
        onPointerDown={(event) => {
          lastPointerType.current = event.pointerType;
        }}
        onClick={() => {
          if (lastPointerType.current === 'touch') {
            touchPinned.current = !touchPinned.current;
            setIsHovered(touchPinned.current);
            setIsOpen(touchPinned.current);
            setMessage(
              touchPinned.current
                ? 'Let’s explore SAMVAAD together.'
                : "Hey! I'm SAMVAAD. Tap to explore."
            );
          } else {
            setIsHovered(true);
            setIsOpen(true);
            setMessage('Welcome! Pick a topic or discover something new.');
          }
          lastPointerType.current = null;
        }}
        className={`hero-orb-button ${showExplorer ? 'drop-shadow-[0_0_32px_rgba(77,227,193,0.24)]' : ''}`}
      >
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

        <div className="orb-core-shell relative m-4 h-[430px] overflow-hidden rounded-[20px] border border-mint/20 bg-[radial-gradient(ellipse_at_50%_60%,#12203A,#080A16_75%)]">
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
                <stop offset="0" stopColor="#2A2F63" />
                <stop offset="1" stopColor="#0E1128" />
              </radialGradient>
              <linearGradient id="orbRim" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#FFB547" />
                <stop offset="1" stopColor="#4DE3C1" />
              </linearGradient>
            </defs>
            <g transform="translate(200,232)">
              {[0, 1.6].map((d) => (
                <circle
                  key={d}
                  r={84}
                  fill="none"
                  strokeWidth={2}
                  stroke={d === 0 ? '#4DE3C1' : '#FFB547'}
                  className={d === 0 ? 'orb-ripple' : 'orb-ripple orb-ripple-delay'}
                  style={{
                    transformBox: 'fill-box',
                    transformOrigin: 'center',
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
                fill="#A7ADC2"
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

          <div className="absolute bottom-3.5 left-3.5 rounded-full bg-[#0A0C16]/85 px-3 py-1.5 text-xs font-semibold tracking-[0.05em] text-mint">
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
      </button>

      <div
        id="hero-orb-explorer"
        role="region"
        aria-label="SAMVAAD discovery experiences"
        aria-hidden={!showExplorer}
        className={`mx-auto w-full min-w-0 max-w-[470px] overflow-hidden transition-[max-height,opacity,margin] duration-300 ease-out motion-reduce:transition-none ${
          showExplorer
            ? 'mt-4 max-h-[900px] opacity-100'
            : 'pointer-events-none max-h-0 opacity-0'
        }`}
      >
        <section className="relative overflow-hidden rounded-[24px] border border-mint/20 bg-[#0B1020]/95 p-3.5 shadow-[0_18px_70px_rgba(0,0,0,0.38),0_0_32px_rgba(77,227,193,0.08)] backdrop-blur-xl sm:p-4">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-20 left-1/2 h-36 w-3/4 -translate-x-1/2 rounded-full bg-mint/10 blur-3xl"
          />
          <div className="relative">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-full border border-mint/30 bg-mint/10 text-mint">
                  <AudioLines size={14} aria-hidden="true" />
                </span>
                <div>
                  <p className="text-[9px] font-semibold uppercase tracking-[0.16em] text-mint">
                    Holographic discovery
                  </p>
                  <p className="text-xs text-mist">Choose a doorway</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Close discovery explorer"
                tabIndex={showExplorer ? 0 : -1}
                onClick={closeExplorer}
                className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-white/15 bg-white/[0.04] text-mist transition-colors hover:bg-white/[0.1] hover:text-cream focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron motion-reduce:transition-none"
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>

            <div className="relative mb-3">
              <div
                aria-hidden="true"
                className="absolute left-1/2 top-0 hidden h-px w-2/3 -translate-x-1/2 bg-gradient-to-r from-transparent via-mint/45 to-transparent sm:block"
              />
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {HERO_FEATURES.map((feature, index) => {
                  const Icon = feature.icon;
                  const isSelected = selectedFeature.id === feature.id;
                  return (
                    <button
                      key={feature.id}
                      type="button"
                      aria-pressed={isSelected}
                      tabIndex={showExplorer ? 0 : -1}
                      onClick={() => setSelectedFeature(feature)}
                      style={{ ['--experience-delay' as string]: `${index * 55}ms` }}
                      className={`hero-orb-experience relative flex min-h-[64px] items-center gap-2 overflow-hidden border px-2.5 py-2 text-left focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron motion-reduce:transition-none ${
                        index % 3 === 0
                          ? 'rounded-[17px] rounded-bl-[7px]'
                          : index % 3 === 1
                            ? 'rounded-[7px] rounded-br-[17px]'
                            : 'rounded-full'
                      } ${
                        isSelected
                          ? 'border-mint/55 bg-mint/[0.12] text-cream shadow-[0_0_22px_rgba(77,227,193,0.12)]'
                          : 'border-white/10 bg-white/[0.035] text-mist hover:border-mint/30 hover:bg-white/[0.07] hover:text-cream'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 flex-none items-center justify-center rounded-xl ${
                          isSelected
                            ? 'bg-mint/15 text-mint'
                            : index % 2 === 0
                              ? 'bg-mint/[0.08] text-mint'
                              : 'bg-saffron/[0.08] text-saffron'
                        }`}
                      >
                        <Icon size={16} aria-hidden="true" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-[10px] font-semibold leading-tight sm:text-[11px]">
                          {feature.label}
                        </span>
                        <span className="mt-1 block text-[8px] uppercase tracking-[0.12em] text-mist/65">
                          {String(index + 1).padStart(2, '0')} / 06
                        </span>
                      </span>
                      {isSelected && (
                        <span
                          aria-hidden="true"
                          className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-mint shadow-[0_0_9px_#4DE3C1]"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            <article
              key={selectedFeature.id}
              aria-live="polite"
              aria-atomic="true"
              className="hero-orb-detail relative overflow-hidden rounded-[19px] border border-white/10 bg-[#10172A]/90 p-3.5 sm:p-4"
            >
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-transparent via-mint/60 to-transparent"
              />
              <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_150px] sm:items-center">
                <div className="min-w-0">
                  <p className="text-[9px] font-semibold uppercase tracking-[0.13em] text-saffron">
                    {selectedFeature.category}
                  </p>
                  <h3 className="mt-1 font-bricolage text-[17px] font-semibold leading-tight text-cream">
                    {selectedFeature.title}
                  </h3>
                  <p className="mt-1 text-[11px] font-medium text-mint/90">
                    {selectedFeature.subtitle}
                  </p>
                  <p className="mt-2 text-xs leading-relaxed text-mist">
                    {selectedFeature.description}
                  </p>
                  {selectedFeature.id === 'room' && (
                    <Link
                      to="/room"
                      tabIndex={showExplorer ? 0 : -1}
                      className="mt-3 inline-flex min-h-9 items-center gap-2 rounded-full bg-saffron px-3.5 text-[11px] font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron"
                    >
                      Enter the room <ArrowRight size={14} aria-hidden="true" />
                    </Link>
                  )}
                </div>
                <ExperienceVisual visual={selectedFeature.visual} />
              </div>
            </article>

            <div className="mt-3 flex items-start justify-between gap-3 border-t border-white/10 pt-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 text-[9px] font-semibold uppercase tracking-[0.13em] text-mint">
                  <Lightbulb size={12} aria-hidden="true" />
                  Did you know? · {selectedDiscovery.category}
                </div>
                <div
                  key={selectedDiscovery.id}
                  aria-live="polite"
                  aria-atomic="true"
                  className="hero-orb-discovery mt-1"
                >
                  <h4 className="font-bricolage text-xs font-semibold text-cream">
                    {selectedDiscovery.title}
                  </h4>
                  <p className="mt-1 text-[10px] leading-relaxed text-mist">
                    {selectedDiscovery.description}
                  </p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Show another discovery"
                tabIndex={showExplorer ? 0 : -1}
                onClick={showNextDiscovery}
                className="mt-1 inline-flex min-h-9 flex-none items-center gap-1 rounded-full border border-saffron/30 bg-saffron/[0.08] px-3 text-[10px] font-semibold text-saffron transition-colors hover:bg-saffron/15 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-saffron motion-reduce:transition-none"
              >
                Next <ChevronRight size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </section>
      </div>
    </div>
    </>
  );
}