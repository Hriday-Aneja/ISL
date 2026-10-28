import { useEffect, useState } from 'react';
import { generateMockClip } from '../lib/mockData';
import { slugify } from '../lib/signs';
import type { FrameLandmarks, LoadedClip, Pt } from '../lib/types';

export interface SignDataState {
  status: 'loading' | 'ready';
  clip: LoadedClip | null;
  /** Set when /demo/<sign>.json exists but could not be used (bad shape, parse error). */
  warning: string | null;
}

// ---------- validation ----------
function toPts(raw: unknown, name: string): Pt[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error(`${name} must be an array`);
  return raw.map((p, i) => {
    if (Array.isArray(p) && typeof p[0] === 'number' && typeof p[1] === 'number') return [p[0], p[1]] as Pt;
    if (p && typeof p === 'object' && typeof (p as { x?: unknown }).x === 'number') {
      const o = p as { x: number; y: number };
      return [o.x, o.y] as Pt; // accept MediaPipe-style {x, y, z}
    }
    throw new Error(`${name}[${i}] is not a point`);
  });
}

/** Validates and normalises a parsed JSON document into a clip. Throws with a readable message. */
export function parseClip(json: unknown, label: string): LoadedClip {
  if (!json || typeof json !== 'object') throw new Error('not a JSON object');
  const o = json as Record<string, unknown>;
  if (!Array.isArray(o.frames) || o.frames.length === 0) throw new Error('"frames" must be a non-empty array');

  const frames: FrameLandmarks[] = o.frames.map((f, i) => {
    if (!f || typeof f !== 'object') throw new Error(`frames[${i}] is not an object`);
    const fr = f as Record<string, unknown>;
    return {
      pose: toPts(fr.pose, `frames[${i}].pose`),
      left_hand: toPts(fr.left_hand, `frames[${i}].left_hand`),
      right_hand: toPts(fr.right_hand, `frames[${i}].right_hand`),
    };
  });

  const predictions = (Array.isArray(o.predictions) ? o.predictions : [])
    .filter(
      (p): p is { label: string; p: number } =>
        !!p && typeof (p as { label?: unknown }).label === 'string' && typeof (p as { p?: unknown }).p === 'number'
    )
    .sort((a, b) => b.p - a.p);
  if (predictions.length === 0) throw new Error('"predictions" must contain {label, p} entries');

  const fps = typeof o.fps === 'number' && o.fps > 0 ? o.fps : 25;
  return {
    sign: typeof o.sign === 'string' ? o.sign : label,
    video: typeof o.video === 'string' && o.video ? o.video : null,
    fps,
    frames,
    predictions,
    isMock: false,
  };
}

// ---------- loading ----------
type Outcome = { clip: LoadedClip; warning: string | null };
const cache = new Map<string, Outcome>();
const inFlight = new Map<string, Promise<Outcome>>();

function jsonUrl(label: string) {
  return `${import.meta.env.BASE_URL}demo/${slugify(label)}.json`;
}

async function load(label: string): Promise<Outcome> {
  const url = jsonUrl(label);
  try {
    const res = await fetch(url, { headers: { Accept: 'application/json' } });
    const type = res.headers.get('content-type') ?? '';
    // A dev server answers unknown paths with index.html (200). Treat that as "no file".
    if (!res.ok || type.includes('text/html')) return { clip: generateMockClip(label), warning: null };
    const text = await res.text();
    try {
      return { clip: parseClip(JSON.parse(text), label), warning: null };
    } catch (e) {
      const why = e instanceof Error ? e.message : 'invalid data';
      return {
        clip: generateMockClip(label),
        warning: `Couldn't use ${slugify(label)}.json (${why}); showing placeholder data.`,
      };
    }
  } catch {
    return { clip: generateMockClip(label), warning: null }; // offline / network error
  }
}

function getOutcome(label: string): Promise<Outcome> {
  const hit = cache.get(label);
  if (hit) return Promise.resolve(hit);
  let p = inFlight.get(label);
  if (!p) {
    p = load(label).then((o) => {
      cache.set(label, o);
      inFlight.delete(label);
      return o;
    });
    inFlight.set(label, p);
  }
  return p;
}

/** Loads /public/demo/<sign>.json, falling back to generated mock data. */
export function useSignData(label: string | null): SignDataState {
  const [state, setState] = useState<SignDataState>(() => {
    const hit = label ? cache.get(label) : undefined;
    return hit ? { status: 'ready', ...hit } : { status: 'loading', clip: null, warning: null };
  });

  useEffect(() => {
    if (!label) {
      setState({ status: 'loading', clip: null, warning: null });
      return;
    }
    const hit = cache.get(label);
    if (hit) {
      setState({ status: 'ready', ...hit });
      return;
    }
    let cancelled = false;
    setState({ status: 'loading', clip: null, warning: null });
    getOutcome(label).then((o) => {
      if (!cancelled) setState({ status: 'ready', ...o });
    });
    return () => {
      cancelled = true;
    };
  }, [label]);

  return state;
}
