import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

const NAMES = ['Thumb', 'Index', 'Middle', 'Ring', 'Little'];
// curl 0 = straight, 1 = fully bent
const PRESETS: { name: string; curl: number[]; spread?: number[] }[] = [
  { name: 'Open hand', curl: [0, 0, 0, 0, 0] },
  { name: 'Fist', curl: [1, 1, 1, 1, 1] },
  { name: 'Pointing', curl: [1, 0, 1, 1, 1] },
  { name: 'Two fingers', curl: [1, 0, 0, 1, 1], spread: [0, -0.2, 0.2, 0, 0] },
  { name: 'Thumb up', curl: [0, 1, 1, 1, 1] },
  { name: 'Three up', curl: [1, 0, 0, 0, 1] },
  { name: 'Round', curl: [0.7, 0.7, 0, 0, 0] },
  { name: 'Horns', curl: [1, 0, 1, 1, 0] },
];
// [x, base y, length scale, base spread]
const FINGERS = [
  [0.0, 0, 0, 0],
  [-0.62, 1.05, 1.0, 0.0],
  [-0.2, 1.1, 1.12, 0],
  [0.22, 1.05, 1.02, 0],
  [0.62, 0.95, 0.8, 0],
];

export function HandLab() {
  const mount = useRef<HTMLDivElement>(null);
  const goal = useRef<{ curl: number[]; spread: number[] }>({ curl: Array(5).fill(0), spread: Array(5).fill(0) });
  const [shown, setShown] = useState<number[]>(Array(5).fill(0));
  const [hot, setHot] = useState<number | null>(null);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
    cam.position.set(0, 0.6, 9);
    scene.add(new THREE.HemisphereLight(0xe8e2d5, 0x1a1d20, 1.0));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(3, 5, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc58b4e, 1.3);
    rim.position.set(-5, 2, -4);
    scene.add(rim);

    const skin = new THREE.MeshStandardMaterial({ color: 0xd4cdbf, roughness: 0.82 });
    const hotSkin = new THREE.MeshStandardMaterial({ color: 0xd4cdbf, roughness: 0.82, emissive: 0xc58b4e, emissiveIntensity: 0.55 });

    const hand = new THREE.Group();
    scene.add(hand);
    const palm = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.7, 0.62, 4, 4, 2), skin);
    palm.scale.set(1, 1, 1);
    hand.add(palm);
    const wrist = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.7, 0.9, 24), skin);
    wrist.position.y = -1.25;
    wrist.scale.z = 0.7;
    hand.add(wrist);

    type Joint = THREE.Group;
    const chains: { base: Joint; joints: Joint[]; max: number[]; isThumb: boolean }[] = [];
    const hitMeshes: THREE.Mesh[] = [];
    FINGERS.forEach(([x, y, len], f) => {
      const isThumb = f === 0;
      const base = new THREE.Group();
      base.position.set(isThumb ? -1.0 : x, isThumb ? -0.35 : 0.8, 0);
      if (isThumb) base.rotation.z = 0.85;
      hand.add(base);
      const segLens = (isThumb ? [0.72, 0.62, 0.52] : [0.78, 0.62, 0.5]).map((s) => s * (isThumb ? 1 : len));
      const r = isThumb ? 0.17 : f === 4 ? 0.125 : 0.145;
      const joints: Joint[] = [];
      let parent: THREE.Object3D = base;
      segLens.forEach((L, j) => {
        const jt = new THREE.Group();
        jt.position.y = j === 0 ? 0 : segLens[j - 1];
        parent.add(jt);
        const seg = new THREE.Mesh(new THREE.CapsuleGeometry(r * (1 - j * 0.08), L - r * 1.6, 6, 14), skin);
        seg.position.y = L / 2;
        seg.userData.finger = f;
        jt.add(seg);
        hitMeshes.push(seg);
        joints.push(jt);
        parent = jt;
      });
      void y;
      chains.push({ base, joints, max: isThumb ? [0.5, 0.9, 1.0] : [1.45, 1.6, 1.2], isThumb });
    });

    const cur = { curl: Array(5).fill(0), spread: Array(5).fill(0) };
    const apply = () => {
      chains.forEach((c, f) => {
        const k = cur.curl[f];
        c.joints.forEach((j, i) => (j.rotation.x = k * c.max[i]));
        if (c.isThumb) c.base.rotation.z = 0.85 - k * 0.55;
        else c.base.rotation.z = -cur.spread[f];
      });
    };

    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height);
      cam.aspect = r.width / Math.max(1, r.height);
      cam.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // pointer: fingertip drag = bend (up/down) + spread (left/right); empty space = turn hand
    const ray = new THREE.Raycaster();
    const ndc = new THREE.Vector2();
    const pick = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, cam);
      const h = ray.intersectObjects(hitMeshes, false)[0];
      return h ? (h.object.userData.finger as number) : null;
    };
    let drag: { f: number | null; x: number; y: number; c: number; s: number } | null = null;
    let hover: number | null = null;
    const down = (e: PointerEvent) => {
      const f = pick(e);
      drag = { f, x: e.clientX, y: e.clientY, c: f === null ? 0 : goal.current.curl[f], s: f === null ? 0 : goal.current.spread[f] };
      el.setPointerCapture(e.pointerId);
    };
    const move = (e: PointerEvent) => {
      if (!drag) {
        const f = pick(e);
        if (f !== hover) {
          hover = f;
          setHot(f);
          el.style.cursor = f === null ? 'grab' : 'pointer';
        }
        return;
      }
      if (drag.f === null) {
        hand.rotation.y = Math.max(-1.2, Math.min(1.2, hand.rotation.y + (e.clientX - drag.x) * 0.008));
        hand.rotation.x = Math.max(-0.6, Math.min(0.6, hand.rotation.x + (e.clientY - drag.y) * 0.006));
        drag.x = e.clientX;
        drag.y = e.clientY;
      } else {
        goal.current.curl[drag.f] = Math.max(0, Math.min(1, drag.c + (e.clientY - drag.y) / 140));
        if (drag.f !== 0) goal.current.spread[drag.f] = Math.max(-0.4, Math.min(0.4, drag.s + (e.clientX - drag.x) / 400));
      }
    };
    const up = () => (drag = null);
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);

    let raf = 0;
    let last = 0;
    const tick = (ms: number) => {
      for (let f = 0; f < 5; f++) {
        cur.curl[f] += (goal.current.curl[f] - cur.curl[f]) * 0.18;
        cur.spread[f] += (goal.current.spread[f] - cur.spread[f]) * 0.18;
      }
      apply();
      hitMeshes.forEach((m) => (m.material = m.userData.finger === (drag?.f ?? hover) ? hotSkin : skin));
      hand.position.y = Math.sin(ms / 1400) * 0.04; // slight breathing
      if (ms - last > 90) {
        last = ms;
        setShown(cur.curl.map((v) => Math.round(v * 100) / 100));
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      el.removeEventListener('pointerdown', down);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const setPreset = (i: number) => {
    goal.current = { curl: [...PRESETS[i].curl], spread: [...(PRESETS[i].spread ?? [0, 0, 0, 0, 0])] };
  };
  const nearest = PRESETS.find((p) => p.curl.every((v, i) => Math.abs(v - shown[i]) < 0.14));

  return (
    <section id="hand-lab" className="mx-auto grid max-w-[1312px] items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.1fr] lg:px-16">
      <div>
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-saffron">§01 · Make a shape</p>
        <h2 className="mt-5 font-display text-[clamp(32px,4.2vw,56px)] font-bold leading-[1.02] tracking-[-0.035em]">
          A sign is five fingers deciding what to say.
        </h2>
        <p className="mt-6 max-w-[460px] text-[17px] leading-relaxed text-mist">
          Drag a fingertip down to bend it, sideways to spread it. Drag the empty space to turn the hand. For
          someone who cannot speak, this is the whole voice.
        </p>
        <div className="mt-8 flex flex-wrap gap-2">
          {PRESETS.map((p, i) => (
            <button
              key={p.name}
              onClick={() => setPreset(i)}
              className="rounded-[4px] border border-white/15 px-3.5 py-2 text-sm text-mist transition-colors hover:border-saffron/70 hover:text-cream"
            >
              {p.name}
            </button>
          ))}
        </div>
        <div className="mt-9 space-y-2.5 border-l border-saffron/60 pl-5">
          {NAMES.map((n, i) => (
            <div key={n} className="flex items-center gap-3 font-mono text-[11px] uppercase tracking-[0.14em] text-mist">
              <span className={`w-14 ${hot === i ? 'text-saffron' : ''}`}>{n}</span>
              <span className="h-px flex-1 bg-white/10">
                <i className="block h-px bg-saffron" style={{ width: `${shown[i] * 100}%` }} />
              </span>
              <span className="w-8 text-right">{Math.round(shown[i] * 100)}</span>
            </div>
          ))}
          <p className="pt-3 font-display text-2xl text-cream">{nearest ? nearest.name : 'Your own shape'}</p>
        </div>
        <p className="mt-6 font-mono text-[11px] uppercase tracking-[0.12em] text-mist/70">
          Handshapes only. Not ISL vocabulary.
        </p>
      </div>
      <div className="relative h-[560px] rounded-[6px] border border-white/10 bg-night-card">
        <div ref={mount} className="absolute inset-0 touch-none select-none" aria-label="Interactive 3D hand" />
        <p className="pointer-events-none absolute bottom-4 left-5 font-mono text-[11px] uppercase tracking-[0.14em] text-mist/70">
          Drag a finger
        </p>
      </div>
    </section>
  );
}
