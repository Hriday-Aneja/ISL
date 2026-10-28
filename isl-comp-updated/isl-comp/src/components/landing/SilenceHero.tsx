import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import * as THREE from 'three';

/**
 * Hero concept: a field of words that cannot get out. Reach for them and they
 * scatter. Press and hold (= sign) and they gather into an open hand.
 */

const N = 2400;
const FINGERS = [
  { b: [-1.0, 0.0], a: -0.25, l: 1.4 },
  { b: [-0.5, 0.25], a: -0.1, l: 1.75 },
  { b: [0.0, 0.35], a: 0, l: 1.95 },
  { b: [0.5, 0.25], a: 0.1, l: 1.8 },
  { b: [1.0, -0.6], a: 1.0, l: 1.3 },
];

function handPoint(): [number, number] {
  if (Math.random() < 0.38) {
    const a = Math.random() * Math.PI * 2;
    const d = Math.sqrt(Math.random());
    return [Math.cos(a) * d * 1.25, -0.6 + Math.sin(a) * d];
  }
  const f = FINGERS[Math.floor(Math.random() * FINGERS.length)];
  const t = Math.random();
  const w = (Math.random() - 0.5) * 0.3;
  const dx = Math.sin(f.a);
  const dy = Math.cos(f.a);
  return [f.b[0] + dx * f.l * t + dy * w, f.b[1] + dy * f.l * t - dx * w];
}

export function SilenceHero({ signCount }: { signCount: number }) {
  const mount = useRef<HTMLDivElement>(null);
  const held = useRef(false);
  const [signing, setSigning] = useState(false);

  const setHeld = (v: boolean) => {
    held.current = v;
    setSigning(v);
  };

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) setHeld(true);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(45, 1, 0.1, 50);
    cam.position.z = 9;

    const pos = new Float32Array(N * 3);
    const col = new Float32Array(N * 3);
    const home = new Float32Array(N * 2);
    const tgt = new Float32Array(N * 2);
    const hcol = new Float32Array(N * 3);
    const seed = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      home[i * 2] = Math.random() - 0.5;
      home[i * 2 + 1] = Math.random() - 0.5;
      const [x, y] = handPoint();
      tgt[i * 2] = x;
      tgt[i * 2 + 1] = y;
      seed[i] = Math.random() * 100;
      const k = Math.min(1, Math.max(0, (y + 1.6) / 3.9)); // mint (palm) -> saffron (fingertips)
      hcol[i * 3] = 0.55 + 0.22 * k;
      hcol[i * 3 + 1] = 0.65 - 0.1 * k;
      hcol[i * 3 + 2] = 0.59 - 0.28 * k;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    scene.add(new THREE.Points(geo, mat));

    let W = 1, H = 1, aspect = 1;
    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height);
      aspect = r.width / Math.max(1, r.height);
      cam.aspect = aspect;
      cam.updateProjectionMatrix();
      H = 2 * cam.position.z * Math.tan((cam.fov * Math.PI) / 360);
      W = H * aspect;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    const ptr = { x: 99, y: 99 };
    const onMove = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ptr.x = ((e.clientX - r.left) / r.width - 0.5) * W;
      ptr.y = -((e.clientY - r.top) / r.height - 0.5) * H;
    };
    const down = () => setHeld(true);
    const up = () => setHeld(false);
    window.addEventListener('pointermove', onMove);
    el.addEventListener('pointerdown', down);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);

    let t = held.current ? 1 : 0;
    let raf = 0;
    const tick = (ms: number) => {
      const time = ms / 1000;
      t += ((held.current ? 1 : 0) - t) * 0.045;
      const e = t * t * (3 - 2 * t);
      const wide = aspect > 1.2;
      const hs = H / 5.4;
      const ox = wide ? W * 0.23 : 0;
      const oy = wide ? -0.35 * hs : -H * 0.2;
      for (let i = 0; i < N; i++) {
        const s = seed[i];
        let sx = home[i * 2] * W + Math.sin(time * 0.3 + s) * 0.25;
        let sy = home[i * 2 + 1] * H + Math.cos(time * 0.27 + s) * 0.25;
        // idle tremor: the words shake, trapped
        sx += (Math.random() - 0.5) * 0.04 * (1 - e);
        sy += (Math.random() - 0.5) * 0.04 * (1 - e);
        // reaching for them pushes them away
        const dx = sx - ptr.x;
        const dy = sy - ptr.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 1.4) {
          const p = (1 - d / 1.4) ** 2 * 1.3 * (1 - e);
          sx += (dx / d) * p;
          sy += (dy / d) * p;
        }
        const hx = tgt[i * 2] * hs + ox;
        const hy = tgt[i * 2 + 1] * hs + oy;
        pos[i * 3] = sx + (hx - sx) * e;
        pos[i * 3 + 1] = sy + (hy - sy) * e;
        col[i * 3] = 0.38 + (hcol[i * 3] - 0.38) * e;
        col[i * 3 + 1] = 0.38 + (hcol[i * 3 + 1] - 0.38) * e;
        col[i * 3 + 2] = 0.36 + (hcol[i * 3 + 2] - 0.36) * e;
      }
      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate = true;
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      el.removeEventListener('pointerdown', down);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const fade = (on: boolean) =>
    `col-start-1 row-start-1 transition-all duration-700 ${
      on ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
    }`;

  return (
    <section className="relative min-h-[88vh] overflow-hidden border-b border-white/[0.08]">
      <div ref={mount} className="absolute inset-0 touch-none select-none" aria-hidden />
      <div className="pointer-events-none relative mx-auto flex min-h-[88vh] max-w-[1312px] flex-col justify-center px-6 py-24 lg:px-16">
        <div className="max-w-[560px]">
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-saffron">
            <span className="font-deva normal-case tracking-normal">संवाद</span> · Samvaad
          </p>

          <div className="mt-6 grid">
            <div className={fade(!signing)}>
              <h1 className="font-display text-[clamp(40px,5.6vw,80px)] font-bold leading-[0.98] tracking-[-0.035em]">
                Every word is there.
                <br />
                <span className="text-mist">None of them get out.</span>
              </h1>
              <p className="mt-7 text-[18px] leading-relaxed text-mist">
                In a clinic, a classroom, a video call, a deaf person is often the one voice in the
                room nobody can hear. Interpreters are scarce. So the words stay trapped.
              </p>
            </div>
            <div className={fade(signing)}>
              <h1 className="font-display text-[clamp(40px,5.6vw,80px)] font-bold leading-[0.98] tracking-[-0.035em]">
                There.
                <br />
                <span className="text-saffron">Someone understood.</span>
              </h1>
              <p className="mt-7 text-[18px] leading-relaxed text-mist">
                Samvaad turns signs into live captions and speech back into signs, so a conversation
                doesn&apos;t have to wait for an interpreter to begin.
              </p>
            </div>
          </div>

          <p
            className={`mt-8 flex items-center gap-3 font-mono text-xs uppercase tracking-[0.14em] transition-opacity duration-500 ${
              signing ? 'opacity-0' : 'text-mint opacity-100'
            }`}
          >
            <span className="h-2 w-2 animate-dot-pulse rounded-full bg-mint" />
            Reach for the words. Press and hold anywhere to sign.
          </p>

          <div className="pointer-events-auto mt-10 flex flex-wrap gap-3.5">
            <Link
              to="/room"
              className="inline-flex min-h-[52px] items-center gap-2.5 rounded-full bg-saffron px-7 text-base font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5"
            >
              Start a conversation <ArrowRight size={18} strokeWidth={2.4} />
            </Link>
            <Link
              to="/how-it-works"
              className="inline-flex min-h-[52px] items-center rounded-full border border-white/20 px-7 text-base font-semibold text-cream transition-colors hover:bg-white/[0.06]"
            >
              How it works
            </Link>
            <button
              type="button"
              aria-pressed={signing}
              onKeyDown={(e) => (e.key === ' ' || e.key === 'Enter') && setHeld(true)}
              onKeyUp={() => setHeld(false)}
              onBlur={() => setHeld(false)}
              className="inline-flex min-h-[52px] items-center rounded-full px-5 font-mono text-xs uppercase tracking-[0.14em] text-mist underline-offset-4 hover:text-cream hover:underline"
            >
              Hold space to sign
            </button>
          </div>

          <p className="mt-10 font-mono text-xs uppercase tracking-[0.16em] text-mist/80">
            {signCount} signs · two-way · runs on your device
          </p>
        </div>
      </div>
    </section>
  );
}
