import type { CSSProperties } from 'react';

// A sparse, seeded scatter of white dots. Decorative only; a few of them twinkle slowly.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const r = rng(29);
const DOTS = Array.from({ length: 52 }, (_, i) => ({
  left: r() * 100,
  top: r() * 100,
  size: 1 + r() * 1.8 + (i % 13 === 0 ? 1.6 : 0),
  o: 0.14 + r() * 0.42,
  twinkle: i % 4 === 0,
  delay: r() * 6,
}));

export function DotField() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
      {DOTS.map((d, i) => (
        <span
          key={i}
          className={`landing-dot absolute rounded-full bg-cream ${d.twinkle ? 'is-twinkle' : ''}`}
          style={
            {
              left: `${d.left}%`,
              top: `${d.top}%`,
              width: d.size,
              height: d.size,
              opacity: d.o,
              '--o': d.o,
              animationDelay: `${d.delay}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
