import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import type { HandLandmarker } from '@mediapipe/tasks-vision';

// Same CDN sources as signdemo/live/mediapipe.ts. Video never leaves the browser.
const WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm';
const MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Bone radius as a fraction of palm length (wrist -> middle knuckle). Tapers toward the tip.
const FINGER_R = [
  [0.13, 0.11, 0.095], // thumb
  [0.105, 0.09, 0.078], // index
  [0.108, 0.092, 0.08], // middle
  [0.1, 0.086, 0.074], // ring
  [0.088, 0.075, 0.065], // little
];
const BONES: { a: number; b: number; r: number }[] = [];
FINGER_R.forEach((rs, f) => {
  const base = f === 0 ? 1 : 5 + (f - 1) * 4;
  rs.forEach((r, s) => BONES.push({ a: base + s, b: base + s + 1, r }));
});
[[0, 1], [0, 5], [5, 9], [9, 13], [13, 17], [0, 17]].forEach(([a, b]) => BONES.push({ a, b, r: 0.1 }));
const JOINT_R = Array.from({ length: 21 }, (_, i) => {
  const out = BONES.filter((b) => b.a === i).map((b) => b.r);
  if (out.length) return Math.max(...out) * 1.02;
  return (BONES.find((b) => b.b === i)?.r ?? 0.08) * 0.8;
});
const OUTLINE = [0, 1, 5, 9, 13, 17];
const UP = new THREE.Vector3(0, 1, 0);

function makeHand(scene: THREE.Scene, mat: THREE.Material) {
  const group = new THREE.Group();
  group.visible = false;
  scene.add(group);
  const boneGeo = new THREE.CylinderGeometry(0.78, 1, 1, 14, 1); // +Y end (distal) is narrower
  const jointGeo = new THREE.SphereGeometry(1, 18, 14);
  const bones = BONES.map(() => group.add(new THREE.Mesh(boneGeo, mat)) && group.children[group.children.length - 1] as THREE.Mesh);
  const joints = JOINT_R.map(() => group.add(new THREE.Mesh(jointGeo, mat)) && group.children[group.children.length - 1] as THREE.Mesh);
  const palmGeo = new THREE.BufferGeometry();
  const palmPos = new Float32Array(2 * OUTLINE.length * 3 * 3);
  palmGeo.setAttribute('position', new THREE.BufferAttribute(palmPos, 3));
  const palmMat = (mat as THREE.MeshStandardMaterial).clone();
  palmMat.side = THREE.DoubleSide;
  group.add(new THREE.Mesh(palmGeo, palmMat));

  const P = Array.from({ length: 21 }, () => new THREE.Vector3());
  const tmp = { d: new THREE.Vector3(), m: new THREE.Vector3(), q: new THREE.Quaternion(), n: new THREE.Vector3(), c: new THREE.Vector3() };
  let primed = false;

  return {
    group,
    update(target: THREE.Vector3[]) {
      target.forEach((t, i) => (primed ? P[i].lerp(t, 0.55) : P[i].copy(t)));
      primed = true;
      const palm = P[0].distanceTo(P[9]) || 1;
      BONES.forEach((b, i) => {
        tmp.d.subVectors(P[b.b], P[b.a]);
        const len = tmp.d.length() || 0.001;
        tmp.m.addVectors(P[b.a], P[b.b]).multiplyScalar(0.5);
        bones[i].position.copy(tmp.m);
        bones[i].quaternion.copy(tmp.q.setFromUnitVectors(UP, tmp.d.divideScalar(len)));
        bones[i].scale.set(b.r * palm, len, b.r * palm);
      });
      joints.forEach((j, i) => {
        j.position.copy(P[i]);
        j.scale.setScalar(JOINT_R[i] * palm);
      });
      // thick palm: two fans offset along the palm normal
      tmp.n.crossVectors(tmp.d.subVectors(P[5], P[0]), tmp.m.subVectors(P[17], P[0])).normalize().multiplyScalar(palm * 0.1);
      tmp.c.set(0, 0, 0);
      OUTLINE.forEach((o) => tmp.c.add(P[o]));
      tmp.c.multiplyScalar(1 / OUTLINE.length);
      let k = 0;
      [1, -1].forEach((side) => {
        OUTLINE.forEach((o, i) => {
          const nx = P[OUTLINE[(i + 1) % OUTLINE.length]];
          [tmp.c, P[o], nx].forEach((v) => {
            palmPos[k++] = v.x + tmp.n.x * side;
            palmPos[k++] = v.y + tmp.n.y * side;
            palmPos[k++] = v.z + tmp.n.z * side;
          });
        });
      });
      palmGeo.attributes.position.needsUpdate = true;
      palmGeo.computeVertexNormals();
    },
  };
}

export function MirrorHands() {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<{ lm: HandLandmarker; stream: MediaStream } | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'live' | 'error'>('idle');
  const [count, setCount] = useState(0);
  const [showCam, setShowCam] = useState(true);

  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    el.appendChild(renderer.domElement);
    renderer.domElement.className = 'absolute inset-0 h-full w-full';
    const scene = new THREE.Scene();
    const cam = new THREE.PerspectiveCamera(40, 4 / 3, 0.1, 50);
    cam.position.z = 7;
    scene.add(new THREE.HemisphereLight(0xe8e2d5, 0x1a1d20, 1.1));
    const key = new THREE.DirectionalLight(0xfff0dc, 2.4);
    key.position.set(2, 4, 6);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc58b4e, 1.4);
    rim.position.set(-4, 1, -3);
    scene.add(rim);

    const mats = [0xd9d2c4, 0xcfd3c6].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.78 }));
    const hands = mats.map((m) => makeHand(scene, m));
    const miss = [99, 99];

    let VW = 1, VH = 1;
    const resize = () => {
      const r = el.getBoundingClientRect();
      renderer.setSize(r.width, r.height, false);
      cam.aspect = r.width / Math.max(1, r.height);
      cam.updateProjectionMatrix();
      VH = 2 * cam.position.z * Math.tan((cam.fov * Math.PI) / 360);
      VW = VH * cam.aspect;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf = 0, lastT = -1, lastCount = -1;
    const tick = () => {
      const t = track.current;
      const v = video.current;
      if (t && v && v.readyState >= 2 && v.currentTime !== lastT) {
        lastT = v.currentTime;
        const res = t.lm.detectForVideo(v, performance.now());
        const used = [false, false];
        res.landmarks.forEach((lm, i) => {
          let slot = res.handedness[i]?.[0]?.categoryName === 'Left' ? 0 : 1;
          if (used[slot]) slot = 1 - slot;
          used[slot] = true;
          miss[slot] = 0;
          // mirror view: flip x; MediaPipe z is depth relative to the wrist (smaller = nearer)
          hands[slot].group.visible = true;
          hands[slot].update(lm.map((p) => new THREE.Vector3((0.5 - p.x) * VW, (0.5 - p.y) * VH, -p.z * VW * 1.1)));
        });
        [0, 1].forEach((s) => {
          if (!used[s] && ++miss[s] > 5) hands[s].group.visible = false;
        });
        const n = res.landmarks.length;
        if (n !== lastCount) setCount((lastCount = n));
      }
      renderer.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      track.current?.stream.getTracks().forEach((s) => s.stop());
      track.current?.lm.close();
      track.current = null;
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  const start = async () => {
    setStatus('loading');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false });
      const v = video.current!;
      v.srcObject = stream;
      await v.play();
      const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
      const fs = await FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: 'GPU' | 'CPU') =>
        HandLandmarker.createFromOptions(fs, { baseOptions: { modelAssetPath: MODEL, delegate }, runningMode: 'VIDEO', numHands: 2 });
      const lm = await make('GPU').catch(() => make('CPU'));
      track.current = { lm, stream };
      setStatus('live');
    } catch {
      setStatus('error');
    }
  };

  return (
    <section id="hand-lab" className="mx-auto grid max-w-[1312px] items-center gap-12 px-6 py-24 lg:grid-cols-[1fr_1.25fr] lg:px-16">
      <div>
        <p className="eyebrow">Your hands, mirrored</p>
        <h2 className="mt-5 font-display text-[clamp(32px,4.4vw,54px)] font-bold leading-[1.02] tracking-[-0.035em]">
          For someone who cannot speak, the hands are the voice.
        </h2>
        <p className="mt-6 max-w-[460px] text-[17px] leading-relaxed text-mist">
          Hold up both hands. Two 3D hands copy every finger you move. This is the first thing Samvaad does
          with a signer: watch the hands, closely.
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          {status !== 'live' ? (
            <button
              onClick={start}
              disabled={status === 'loading'}
              className="inline-flex min-h-[52px] items-center rounded-[4px] bg-saffron px-7 text-base font-semibold text-[#1A1204] transition-transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {status === 'loading' ? 'Starting…' : 'Start camera'}
            </button>
          ) : (
            <button
              onClick={() => setShowCam((s) => !s)}
              className="rounded-[4px] border border-white/15 px-4 py-2.5 text-sm text-mist hover:text-cream"
            >
              {showCam ? 'Hide my camera' : 'Show my camera'}
            </button>
          )}
          <span className="font-mono text-xs uppercase tracking-[0.14em] text-mist">
            {status === 'live' ? `${count} ${count === 1 ? 'hand' : 'hands'} tracked` : status === 'error' ? 'Camera unavailable' : ''}
          </span>
        </div>
        <p className="mt-8 max-w-[460px] font-mono text-[11px] uppercase leading-relaxed tracking-[0.12em] text-mist/70">
          Runs in your browser. No video leaves your device. Depth is estimated, so moving toward the camera is approximate.
        </p>
      </div>
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-[6px] border border-white/10 bg-night-card">
        <video
          ref={video}
          muted
          playsInline
          className={`absolute inset-0 h-full w-full -scale-x-100 object-cover grayscale transition-opacity duration-500 ${
            status === 'live' && showCam ? 'opacity-[0.22]' : 'opacity-0'
          }`}
        />
        <div ref={wrap} className="absolute inset-0" aria-label="Two 3D hands mirroring your hands" />
        {status !== 'live' && (
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center px-8 text-center font-mono text-xs uppercase leading-relaxed tracking-[0.16em] text-mist">
            {status === 'error' ? 'Allow camera access to see your hands here' : 'Your hands will appear here'}
          </p>
        )}
      </div>
    </section>
  );
}
