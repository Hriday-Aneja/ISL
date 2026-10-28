// Mock sample generator. It fabricates plausible landmark sequences and predictions so the
// demo works before real exports exist. useSignData falls back to this whenever
// /demo/<sign>.json is missing or unreadable, so dropping real JSON files into /public/demo
// replaces it automatically, with no code changes.
//
// NOTE: the motion below is synthetic. It will not line up with whatever video is playing;
// real exports from the Python pipeline do.

import { SIGN_LABELS, placeholderVideoFor } from './signs';
import type { FrameLandmarks, LoadedClip, Prediction, Pt } from './types';

const FRAMES = 100;
const FPS = 25;
const ASPECT = 16 / 9; // frame aspect the mock is authored for
const CX = 0.5;
const CY = 0.5;

// ---------- deterministic randomness ----------
function hash(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return h >>> 0;
}
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- hand model ----------
type Curl = [number, number, number, number, number]; // thumb, index, middle, ring, pinky (0..1)
const CURLS = {
  open: [0, 0, 0, 0, 0],
  flat: [0.1, 0, 0, 0, 0],
  fist: [1, 1, 1, 1, 1],
  point: [1, 0, 1, 1, 1],
  ell: [0, 0, 1, 1, 1],
  claw: [0.5, 0.55, 0.55, 0.55, 0.55],
  cee: [0.3, 0.35, 0.35, 0.35, 0.35],
  pinch: [0.55, 0.6, 0.15, 0.15, 0.15],
} satisfies Record<string, Curl>;
type CurlName = keyof typeof CURLS;

// Finger templates in hand-length units, wrist at (0,0), fingers pointing up (-y).
const FINGERS = [
  { mcp: [-0.17, -0.44], base: -1.67, len: [0.2, 0.14, 0.12] },
  { mcp: [-0.02, -0.48], base: -1.6, len: [0.22, 0.15, 0.12] },
  { mcp: [0.12, -0.45], base: -1.52, len: [0.2, 0.14, 0.12] },
  { mcp: [0.25, -0.38], base: -1.42, len: [0.16, 0.11, 0.1] },
] as const;
const BEND = [1.3, 2.4, 3.0]; // cumulative bend (rad) at full curl, per segment

interface HandState {
  x: number;
  y: number;
  rot: number;
  scale: number;
  curl: Curl;
}

function buildHand(s: HandState, mirror: boolean): Pt[] {
  const local: Array<[number, number]> = new Array(21);
  local[0] = [0, 0];

  // thumb (landmarks 1-4)
  let tx = -0.13;
  let ty = -0.1;
  local[1] = [tx, ty];
  const tLen = [0.2, 0.17, 0.15];
  const tBend = [0.5, 1.0, 1.4];
  for (let k = 0; k < 3; k++) {
    const a = -2.2 + s.curl[0] * tBend[k];
    tx += Math.cos(a) * tLen[k];
    ty += Math.sin(a) * tLen[k];
    local[2 + k] = [tx, ty];
  }

  // four fingers (landmarks 5-20)
  FINGERS.forEach((f, fi) => {
    const curl = s.curl[fi + 1];
    let px = f.mcp[0];
    let py = f.mcp[1];
    local[5 + fi * 4] = [px, py];
    for (let k = 0; k < 3; k++) {
      const bend = curl * BEND[k];
      const along = Math.cos(bend);
      px += Math.cos(f.base) * f.len[k] * along;
      py += Math.sin(f.base) * f.len[k] * along;
      local[6 + fi * 4 + k] = [px, py];
    }
  });

  const cos = Math.cos(s.rot);
  const sin = Math.sin(s.rot);
  return local.map(([lx, ly]) => {
    const mx = mirror ? -lx : lx;
    const rx = mx * cos - ly * sin;
    const ry = mx * sin + ly * cos;
    return [s.x + rx * s.scale, s.y + ry * s.scale] as Pt;
  });
}

// ---------- motion paths ----------
// Positions are in "height units" relative to the shoulder centre: +x is to the right of the
// image, +y is down. The signer's RIGHT hand therefore lives at negative x.
type KF = [t: number, x: number, y: number, rot: number, curl: CurlName, scale?: number];
interface Motion {
  right?: KF[];
  left?: KF[];
}

const mirrorKF = (kfs: KF[]): KF[] => kfs.map(([t, x, y, r, c, s]) => [t, -x, y, -r, c, s]);

function circle(
  cx: number,
  cy: number,
  r: number,
  t0: number,
  t1: number,
  turns: number,
  rot: number,
  curl: CurlName
): KF[] {
  const n = Math.max(8, Math.round(turns * 10));
  const out: KF[] = [];
  for (let i = 0; i <= n; i++) {
    const u = i / n;
    const a = Math.PI + u * turns * Math.PI * 2;
    out.push([t0 + u * (t1 - t0), cx + Math.cos(a) * r, cy + Math.sin(a) * r, rot, curl]);
  }
  return out;
}

const MOTIONS: Record<string, Motion> = {
  Hello: {
    right: [
      [0.08, -0.58, 0.25, 0.1, 'open'], [0.22, -0.62, -0.18, 0.15, 'open'],
      [0.4, -0.7, -0.34, 0.45, 'open'], [0.55, -0.62, -0.34, -0.35, 'open'],
      [0.7, -0.7, -0.34, 0.45, 'open'], [0.82, -0.62, -0.28, -0.2, 'open'],
      [0.94, -0.58, 0.2, 0, 'open'],
    ],
  },
  'Thank you': {
    right: [
      [0.1, -0.2, 0.2, 0, 'open'], [0.3, -0.08, -0.2, 0.05, 'open'],
      [0.45, -0.08, -0.22, 0.1, 'open'], [0.7, -0.3, -0.02, 0.25, 'open'],
      [0.9, -0.36, 0.2, 0.1, 'open'],
    ],
  },
  I: {
    right: [
      [0.12, -0.35, 0.3, 0.6, 'point'], [0.3, -0.12, 0.12, 1.3, 'point'],
      [0.45, -0.1, 0.1, 1.3, 'point'], [0.58, -0.12, 0.12, 1.3, 'point'],
      [0.88, -0.35, 0.3, 0.6, 'point'],
    ],
  },
  you: {
    right: [
      [0.1, -0.4, 0.3, 0.9, 'point'], [0.3, -0.5, 0.02, 1.35, 'point', 0.2],
      [0.45, -0.6, 0, 1.5, 'point', 0.23], [0.6, -0.5, 0.02, 1.35, 'point', 0.2],
      [0.78, -0.6, 0, 1.5, 'point', 0.23], [0.92, -0.42, 0.3, 0.9, 'point'],
    ],
  },
  he: {
    right: [
      [0.1, -0.4, 0.3, 0, 'point'], [0.3, -0.2, -0.35, 0.2, 'point'],
      [0.45, -0.22, -0.37, 0.2, 'point'], [0.7, -0.65, -0.1, 1.2, 'point'],
      [0.9, -0.5, 0.3, 0.8, 'point'],
    ],
  },
  she: {
    right: [
      [0.1, -0.4, 0.3, 0, 'point'], [0.3, -0.13, -0.2, 0.3, 'point'],
      [0.45, -0.12, -0.18, 0.3, 'point'], [0.7, -0.65, 0, 1.2, 'point'],
      [0.9, -0.5, 0.3, 0.8, 'point'],
    ],
  },
  Mother: {
    right: [
      [0.1, -0.3, 0.3, 0, 'open'], [0.3, -0.1, -0.17, 0.3, 'open'],
      [0.42, -0.1, -0.15, 0.3, 'open'], [0.52, -0.1, -0.17, 0.3, 'open'],
      [0.64, -0.1, -0.15, 0.3, 'open'], [0.9, -0.3, 0.3, 0, 'open'],
    ],
  },
  Father: {
    right: [
      [0.1, -0.3, 0.3, 0, 'open'], [0.3, -0.1, -0.42, 0.3, 'open'],
      [0.42, -0.1, -0.4, 0.3, 'open'], [0.52, -0.1, -0.42, 0.3, 'open'],
      [0.64, -0.1, -0.4, 0.3, 'open'], [0.9, -0.3, 0.3, 0, 'open'],
    ],
  },
  Son: {
    right: [
      [0.1, -0.3, 0.3, 0, 'cee'], [0.3, -0.12, -0.38, 0.2, 'cee'],
      [0.45, -0.12, -0.4, 0.2, 'cee'], [0.7, -0.12, 0.08, 0.9, 'flat'],
      [0.9, -0.3, 0.3, 0.4, 'flat'],
    ],
    left: [
      [0.5, 0.3, 0.3, -1.0, 'flat'], [0.66, 0.1, 0.12, -1.4, 'flat'],
      [0.82, 0.12, 0.12, -1.4, 'flat'], [0.92, 0.3, 0.3, -1.0, 'flat'],
    ],
  },
  Daughter: {
    right: [
      [0.1, -0.3, 0.3, 0, 'cee'], [0.3, -0.13, -0.2, 0.3, 'cee'],
      [0.45, -0.12, -0.18, 0.3, 'cee'], [0.7, -0.12, 0.08, 0.9, 'flat'],
      [0.9, -0.3, 0.3, 0.4, 'flat'],
    ],
    left: [
      [0.5, 0.3, 0.3, -1.0, 'flat'], [0.66, 0.1, 0.12, -1.4, 'flat'],
      [0.82, 0.12, 0.12, -1.4, 'flat'], [0.92, 0.3, 0.3, -1.0, 'flat'],
    ],
  },
  Parent: {
    right: [
      [0.1, -0.2, 0.3, 0, 'ell'], [0.3, -0.12, -0.18, 0.2, 'ell'],
      [0.5, -0.14, -0.36, 0.2, 'ell'], [0.7, -0.12, -0.18, 0.2, 'ell'],
      [0.9, -0.2, 0.3, 0, 'ell'],
    ],
    left: [
      [0.1, 0.2, 0.3, 0, 'ell'], [0.3, 0.12, -0.18, -0.2, 'ell'],
      [0.5, 0.14, -0.36, -0.2, 'ell'], [0.7, 0.12, -0.18, -0.2, 'ell'],
      [0.9, 0.2, 0.3, 0, 'ell'],
    ],
  },
  Doctor: {
    right: [
      [0.15, -0.3, 0.3, 1.3, 'open'], [0.32, -0.05, 0.07, 1.45, 'open'],
      [0.42, 0.02, 0.07, 1.45, 'open'], [0.52, -0.05, 0.07, 1.45, 'open'],
      [0.62, 0.02, 0.07, 1.45, 'open'], [0.72, -0.05, 0.07, 1.45, 'open'],
      [0.9, -0.3, 0.3, 1.3, 'open'],
    ],
    left: [
      [0.1, 0.35, 0.35, -1.3, 'flat'], [0.25, 0.2, 0.05, -1.45, 'flat'],
      [0.8, 0.2, 0.05, -1.45, 'flat'], [0.92, 0.35, 0.35, -1.3, 'flat'],
    ],
  },
  Lawyer: {
    right: [
      [0.1, -0.4, 0.3, 0, 'ell'], [0.3, -0.28, -0.1, 0.1, 'ell'],
      [0.45, -0.3, -0.08, 0.1, 'ell'], [0.7, -0.1, 0.12, 0.7, 'ell'],
      [0.9, -0.3, 0.3, 0, 'ell'],
    ],
  },
  Teacher: {
    right: [
      [0.1, -0.35, 0.3, 0, 'pinch'], [0.3, -0.33, -0.3, 0.4, 'pinch'],
      [0.55, -0.5, -0.15, 0.6, 'pinch'], [0.8, -0.33, -0.3, 0.4, 'pinch'],
      [0.92, -0.35, 0.3, 0, 'pinch'],
    ],
    left: [
      [0.1, 0.35, 0.3, 0, 'pinch'], [0.3, 0.33, -0.3, -0.4, 'pinch'],
      [0.55, 0.5, -0.15, -0.6, 'pinch'], [0.8, 0.33, -0.3, -0.4, 'pinch'],
      [0.92, 0.35, 0.3, 0, 'pinch'],
    ],
  },
  Student: {
    right: [
      [0.1, -0.3, 0.35, 1, 'point'], [0.3, 0.05, 0.1, 1.3, 'point'],
      [0.55, -0.15, -0.38, 0.3, 'point'], [0.88, -0.3, 0.35, 0.3, 'point'],
    ],
    left: [
      [0.1, 0.3, 0.3, -1.2, 'flat'], [0.25, 0.14, 0.08, -1.4, 'flat'],
      [0.8, 0.14, 0.08, -1.4, 'flat'], [0.92, 0.3, 0.3, -1.2, 'flat'],
    ],
  },
  House: {
    right: [
      [0.1, -0.3, 0.3, 0, 'flat'], [0.28, -0.12, -0.4, 0.7, 'flat'],
      [0.5, -0.3, -0.22, 0.1, 'flat'], [0.72, -0.3, 0.08, 0, 'flat'],
      [0.9, -0.3, 0.3, 0, 'flat'],
    ],
    left: [
      [0.1, 0.3, 0.3, 0, 'flat'], [0.28, 0.12, -0.4, -0.7, 'flat'],
      [0.5, 0.3, -0.22, -0.1, 'flat'], [0.72, 0.3, 0.08, 0, 'flat'],
      [0.9, 0.3, 0.3, 0, 'flat'],
    ],
  },
  Restaurant: {
    right: [
      [0.1, -0.3, 0.3, 0.2, 'pinch'], [0.28, -0.1, -0.12, 0.4, 'pinch'],
      [0.4, -0.2, 0.04, 0.3, 'pinch'], [0.52, -0.1, -0.12, 0.4, 'pinch'],
      [0.64, -0.2, 0.04, 0.3, 'pinch'], [0.9, -0.3, 0.3, 0.2, 'pinch'],
    ],
  },
  'Train Station': {
    right: [
      [0.1, -0.3, 0.3, 1.5, 'flat'], [0.28, -0.05, 0, 1.5, 'flat'],
      [0.45, -0.45, 0, 1.5, 'flat'], [0.62, -0.05, 0, 1.5, 'flat'],
      [0.8, -0.45, 0, 1.5, 'flat'], [0.92, -0.3, 0.3, 1.5, 'flat'],
    ],
    left: [
      [0.1, 0.3, 0.3, -1.5, 'flat'], [0.25, 0.12, 0.05, -1.5, 'flat'],
      [0.8, 0.12, 0.05, -1.5, 'flat'], [0.92, 0.3, 0.3, -1.5, 'flat'],
    ],
  },
  Waiter: {
    right: [
      [0.1, -0.3, 0.35, 0.3, 'flat'], [0.25, -0.28, 0.1, 0.9, 'flat'],
      [0.45, -0.28, 0, 0.9, 'flat'], [0.65, -0.28, 0.12, 0.9, 'flat'],
      [0.9, -0.3, 0.35, 0.3, 'flat'],
    ],
    left: [
      [0.1, 0.3, 0.35, -0.3, 'flat'], [0.25, 0.28, 0.1, -0.9, 'flat'],
      [0.45, 0.28, 0, -0.9, 'flat'], [0.65, 0.28, 0.12, -0.9, 'flat'],
      [0.9, 0.3, 0.35, -0.3, 'flat'],
    ],
  },
  Dog: {
    right: [
      [0.1, -0.4, 0.35, 0.3, 'pinch'], [0.3, -0.38, 0.1, 0.4, 'pinch'],
      [0.4, -0.38, 0.1, 0.4, 'open'], [0.5, -0.38, 0.1, 0.4, 'pinch'],
      [0.6, -0.38, 0.1, 0.4, 'open'], [0.9, -0.4, 0.35, 0.3, 'pinch'],
    ],
  },
  Bird: {
    right: [
      [0.1, -0.3, 0.3, 0.4, 'pinch'], [0.3, -0.12, -0.15, 0.6, 'pinch'],
      [0.4, -0.12, -0.15, 0.6, 'open'], [0.5, -0.12, -0.15, 0.6, 'pinch'],
      [0.6, -0.12, -0.15, 0.6, 'open'], [0.7, -0.12, -0.15, 0.6, 'pinch'],
      [0.9, -0.3, 0.3, 0.4, 'pinch'],
    ],
  },
  Beautiful: {
    right: [
      [0.08, -0.3, 0.3, 0, 'open'],
      ...circle(-0.02, -0.26, 0.2, 0.2, 0.75, 1, 0, 'open'),
      [0.88, -0.1, -0.1, 0.2, 'pinch'],
    ],
  },
  happy: {
    right: [
      [0.08, -0.3, 0.3, 0.6, 'flat'],
      ...circle(-0.06, 0.12, 0.08, 0.2, 0.88, 2, 1.3, 'flat'),
    ],
  },
  sad: {
    right: [
      [0.1, -0.1, -0.3, 0, 'claw'], [0.5, -0.14, 0, 0, 'claw'], [0.88, -0.18, 0.28, 0, 'claw'],
    ],
    left: [
      [0.1, 0.1, -0.3, 0, 'claw'], [0.5, 0.14, 0, 0, 'claw'], [0.88, 0.18, 0.28, 0, 'claw'],
    ],
  },
};

// ---------- interpolation ----------
const smooth = (u: number) => u * u * (3 - 2 * u);
const lerp = (a: number, b: number, u: number) => a + (b - a) * u;

function catmull(p0: number, p1: number, p2: number, p3: number, u: number) {
  const u2 = u * u;
  const u3 = u2 * u;
  return 0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2 + (-p0 + 3 * p1 - 3 * p2 + p3) * u3);
}

/** Samples a keyframe path at time t. Returns null outside the path's active window. */
function sample(path: KF[] | undefined, t: number): HandState | null {
  if (!path || path.length < 2) return null;
  const first = path[0][0];
  const last = path[path.length - 1][0];
  if (t < first || t > last) return null;
  let i = 0;
  while (i < path.length - 2 && t > path[i + 1][0]) i++;
  const k1 = path[i];
  const k2 = path[i + 1];
  const k0 = path[Math.max(0, i - 1)];
  const k3 = path[Math.min(path.length - 1, i + 2)];
  const span = k2[0] - k1[0] || 1;
  const u = Math.min(1, Math.max(0, (t - k1[0]) / span));
  const sc = (k: KF) => k[5] ?? 0.2;
  const ca = CURLS[k1[4]];
  const cb = CURLS[k2[4]];
  const cu = smooth(u);
  return {
    x: catmull(k0[1], k1[1], k2[1], k3[1], u),
    y: catmull(k0[2], k1[2], k2[2], k3[2], u),
    rot: catmull(k0[3], k1[3], k2[3], k3[3], u),
    scale: catmull(sc(k0), sc(k1), sc(k2), sc(k3), u),
    curl: ca.map((c, n) => lerp(c, cb[n], cu)) as Curl,
  };
}

// ---------- body ----------
const SHOULDER_X = 0.3;
const UPPER = 0.29;
const FORE = 0.27;
const REST_R: [number, number] = [-0.34, 0.5];
const REST_L: [number, number] = [0.34, 0.5];

function clampReach(sx: number, x: number, y: number, max = 0.54): [number, number] {
  const dx = x - sx;
  const d = Math.hypot(dx, y);
  if (d <= max) return [x, y];
  const k = max / d;
  return [sx + dx * k, y * k];
}

/** Where the arm's wrist is: the hand path while it's active, easing from/to the rest pose. */
function wristTarget(path: KF[] | undefined, t: number, rest: [number, number]): [number, number] {
  if (!path || path.length < 2) return rest;
  const first = path[0];
  const last = path[path.length - 1];
  const lead = 0.1;
  if (t < first[0] - lead || t > last[0] + lead) return rest;
  if (t < first[0]) {
    const u = smooth((t - (first[0] - lead)) / lead);
    return [lerp(rest[0], first[1], u), lerp(rest[1], first[2], u)];
  }
  if (t > last[0]) {
    const u = smooth((t - last[0]) / lead);
    return [lerp(last[1], rest[0], u), lerp(last[2], rest[1], u)];
  }
  const s = sample(path, t);
  return s ? [s.x, s.y] : rest;
}

/** Two-bone IK: elbow position for shoulder S and wrist W, bending outwards and down. */
function elbow(S: [number, number], W: [number, number], outward: 1 | -1): [number, number] {
  const dx = W[0] - S[0];
  const dy = W[1] - S[1];
  const d = Math.min(UPPER + FORE - 1e-3, Math.max(Math.abs(UPPER - FORE) + 1e-3, Math.hypot(dx, dy)));
  const a = (UPPER * UPPER - FORE * FORE + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(0, UPPER * UPPER - a * a));
  const ux = dx / (Math.hypot(dx, dy) || 1);
  const uy = dy / (Math.hypot(dx, dy) || 1);
  const mx = S[0] + ux * a;
  const my = S[1] + uy * a;
  const c1: [number, number] = [mx - uy * h, my + ux * h];
  const c2: [number, number] = [mx + uy * h, my - ux * h];
  // outward = +1 prefers larger x (left arm), -1 prefers smaller x (right arm)
  const score = (c: [number, number]) => c[0] * outward + c[1] * 0.6;
  return score(c1) >= score(c2) ? c1 : c2;
}

const toNorm = (x: number, y: number): Pt => [CX + x / ASPECT, CY + y];
const r3 = (n: number) => Math.round(n * 1000) / 1000;

function buildFrame(motion: Motion, f: number, rand: () => number, phase: number): FrameLandmarks {
  const t = f / (FRAMES - 1);
  const sway = Math.sin(f * 0.11 + phase) * 0.008;
  const bob = Math.sin(f * 0.17 + phase) * 0.004;

  const rs: [number, number] = [-SHOULDER_X + sway, bob];
  const ls: [number, number] = [SHOULDER_X + sway, bob];

  const rState = sample(motion.right, t);
  const lState = sample(motion.left, t);

  const rW = clampReach(rs[0], ...wristTarget(motion.right, t, REST_R));
  const lW = clampReach(ls[0], ...wristTarget(motion.left, t, REST_L));
  const rE = elbow(rs, rW, -1);
  const lE = elbow(ls, lW, 1);

  const head: [number, number] = [sway * 1.4, -0.28 + bob];
  const P: Pt[] = Array.from({ length: 33 }, () => toNorm(0, 1.4));
  const set = (i: number, x: number, y: number) => (P[i] = toNorm(x, y));
  set(0, head[0], head[1]);
  set(1, head[0] + 0.02, head[1] - 0.025); set(2, head[0] + 0.04, head[1] - 0.025); set(3, head[0] + 0.06, head[1] - 0.022);
  set(4, head[0] - 0.02, head[1] - 0.025); set(5, head[0] - 0.04, head[1] - 0.025); set(6, head[0] - 0.06, head[1] - 0.022);
  set(7, head[0] + 0.11, head[1] - 0.01); set(8, head[0] - 0.11, head[1] - 0.01);
  set(9, head[0] + 0.03, head[1] + 0.05); set(10, head[0] - 0.03, head[1] + 0.05);
  set(11, ls[0], ls[1]); set(12, rs[0], rs[1]);
  set(13, lE[0], lE[1]); set(14, rE[0], rE[1]);
  set(15, lW[0], lW[1]); set(16, rW[0], rW[1]);
  set(23, 0.2 + sway, 0.62); set(24, -0.2 + sway, 0.62);

  const hand = (state: HandState | null, mirror: boolean): Pt[] => {
    if (!state) return [];
    const wob = Math.sin(f * 0.9 + phase) * 0.003;
    const pts = buildHand({ ...state, x: state.x + wob, y: state.y + wob * 0.6 }, mirror);
    return pts.map(([x, y]) => {
      const [nx, ny] = toNorm(x, y);
      return [r3(nx + (rand() - 0.5) * 0.003), r3(ny + (rand() - 0.5) * 0.003)] as Pt;
    });
  };

  // Keep the wrist of the drawn hand glued to the arm's wrist.
  const rightHand = hand(rState ? { ...rState, x: rW[0], y: rW[1] } : null, true);
  const leftHand = hand(lState ? { ...lState, x: lW[0], y: lW[1] } : null, false);

  return {
    pose: P.map(([x, y]) => [r3(x), r3(y)] as Pt),
    left_hand: leftHand,
    right_hand: rightHand,
  };
}

// ---------- predictions ----------
const CONFUSABLE: Record<string, string[]> = {
  Mother: ['Father', 'Parent'],
  Father: ['Mother', 'Parent'],
  Son: ['Daughter', 'Parent'],
  Daughter: ['Son', 'Parent'],
  Parent: ['Mother', 'Father'],
  he: ['she', 'you'],
  she: ['he', 'you'],
  you: ['he', 'she'],
  happy: ['sad', 'Beautiful'],
  sad: ['happy', 'Beautiful'],
  Doctor: ['Lawyer', 'Student'],
  Lawyer: ['Doctor', 'Teacher'],
  Teacher: ['Student', 'Lawyer'],
  Student: ['Teacher', 'Doctor'],
  Hello: ['Thank you', 'you'],
  'Thank you': ['Hello', 'you'],
};

function mockPredictions(label: string, rand: () => number): Prediction[] {
  const top = 0.86 + rand() * 0.11;
  const rest = 1 - top;
  const others = (CONFUSABLE[label] ?? SIGN_LABELS.filter((l) => l !== label)).slice();
  if (!CONFUSABLE[label]) others.sort(() => rand() - 0.5);
  const second = rest * (0.55 + rand() * 0.15);
  const third = rest * (0.18 + rand() * 0.12);
  return [
    { label, p: r3(top) },
    { label: others[0], p: r3(second) },
    { label: others[1], p: r3(third) },
  ];
}

export function generateMockClip(label: string): LoadedClip {
  const seed = hash(label);
  const rand = mulberry32(seed);
  const phase = (seed % 628) / 100;
  const motion = MOTIONS[label] ?? MOTIONS.Hello;
  const frames: FrameLandmarks[] = [];
  for (let f = 0; f < FRAMES; f++) frames.push(buildFrame(motion, f, rand, phase));
  return {
    sign: label,
    video: placeholderVideoFor(label),
    fps: FPS,
    frames,
    predictions: mockPredictions(label, rand),
    isMock: true,
  };
}
