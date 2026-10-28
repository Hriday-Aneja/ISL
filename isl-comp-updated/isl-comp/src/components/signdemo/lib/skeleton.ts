import type { FrameLandmarks, Pt } from './types';

/** Standard MediaPipe hand topology: 21 landmarks, 21 bones. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  // thumb
  [0, 1], [1, 2], [2, 3], [3, 4],
  // index
  [0, 5], [5, 6], [6, 7], [7, 8],
  // middle
  [5, 9], [9, 10], [10, 11], [11, 12],
  // ring
  [9, 13], [13, 14], [14, 15], [15, 16],
  // pinky
  [13, 17], [17, 18], [18, 19], [19, 20],
  // palm base
  [0, 17],
];

/** MediaPipe pose indices used by the reduced upper-body model. */
export const POSE = {
  NOSE: 0,
  LEFT_EAR: 7,
  RIGHT_EAR: 8,
  LEFT_SHOULDER: 11,
  RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13,
  RIGHT_ELBOW: 14,
  LEFT_WRIST: 15,
  RIGHT_WRIST: 16,
} as const;

/** Reduced pose: shoulders and both arms. Legs, hips and face mesh are intentionally left out. */
export const POSE_UPPER_BODY_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER],
  [POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW],
  [POSE.LEFT_ELBOW, POSE.LEFT_WRIST],
  [POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW],
  [POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST],
];

export interface SkeletonStyle {
  /** Neon colour of the hands. */
  accent: string;
  /** Softer colour for the body. */
  body: string;
  /** Bright colour for fingertips and joints. */
  joint: string;
  glow: number;
  lineWidth: number;
  jointRadius: number;
}

export const DEFAULT_STYLE: SkeletonStyle = {
  accent: '#4DE3C1',
  body: 'rgba(167, 173, 194, 0.55)',
  joint: '#EFFFFB',
  glow: 14,
  lineWidth: 2.4,
  jointRadius: 2.6,
};

const FINGERTIPS = new Set([4, 8, 12, 16, 20]);

function valid(p: Pt | undefined): p is Pt {
  return !!p && Number.isFinite(p[0]) && Number.isFinite(p[1]);
}

function line(ctx: CanvasRenderingContext2D, a: Pt, b: Pt, w: number, h: number) {
  ctx.beginPath();
  ctx.moveTo(a[0] * w, a[1] * h);
  ctx.lineTo(b[0] * w, b[1] * h);
  ctx.stroke();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  pose: Pt[],
  w: number,
  h: number,
  style: SkeletonStyle
) {
  if (pose.length < 17) return;
  ctx.save();
  ctx.strokeStyle = style.body;
  ctx.fillStyle = style.body;
  ctx.lineWidth = style.lineWidth * 1.4;
  ctx.lineCap = 'round';
  ctx.shadowColor = style.body;
  ctx.shadowBlur = style.glow * 0.5;

  for (const [i, j] of POSE_UPPER_BODY_CONNECTIONS) {
    if (valid(pose[i]) && valid(pose[j])) line(ctx, pose[i], pose[j], w, h);
  }

  // Head ring and neck: a single circle sized from the ears (falls back to the shoulders).
  const nose = pose[POSE.NOSE];
  const ls = pose[POSE.LEFT_SHOULDER];
  const rs = pose[POSE.RIGHT_SHOULDER];
  if (valid(nose)) {
    const le = pose[POSE.LEFT_EAR];
    const re = pose[POSE.RIGHT_EAR];
    let rx = 0.05 * w;
    if (valid(le) && valid(re)) rx = Math.max(10, Math.abs(le[0] - re[0]) * w * 0.7);
    else if (valid(ls) && valid(rs)) rx = Math.abs(ls[0] - rs[0]) * w * 0.28;
    const ry = rx * 1.2;
    ctx.beginPath();
    ctx.ellipse(nose[0] * w, nose[1] * h, rx, ry, 0, 0, Math.PI * 2);
    ctx.stroke();
    if (valid(ls) && valid(rs)) {
      line(ctx, [nose[0], nose[1] + (ry * 0.95) / h], [(ls[0] + rs[0]) / 2, (ls[1] + rs[1]) / 2], w, h);
    }
  }

  // Shoulder and elbow joints.
  for (const idx of [11, 12, 13, 14]) {
    const p = pose[idx];
    if (!valid(p)) continue;
    ctx.beginPath();
    ctx.arc(p[0] * w, p[1] * h, style.jointRadius * 1.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawHand(
  ctx: CanvasRenderingContext2D,
  hand: Pt[],
  w: number,
  h: number,
  style: SkeletonStyle
) {
  if (hand.length < 21) return;
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Glowing bones.
  ctx.strokeStyle = style.accent;
  ctx.shadowColor = style.accent;
  ctx.shadowBlur = style.glow;
  ctx.lineWidth = style.lineWidth;
  for (const [i, j] of HAND_CONNECTIONS) {
    if (valid(hand[i]) && valid(hand[j])) line(ctx, hand[i], hand[j], w, h);
  }

  // Joints, brighter at the fingertips.
  for (let i = 0; i < 21; i++) {
    const p = hand[i];
    if (!valid(p)) continue;
    const tip = FINGERTIPS.has(i);
    ctx.beginPath();
    ctx.fillStyle = tip ? style.joint : style.accent;
    ctx.shadowBlur = tip ? style.glow * 1.4 : style.glow * 0.6;
    ctx.arc(p[0] * w, p[1] * h, style.jointRadius * (tip ? 1.35 : 1), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/**
 * Draws one frame of landmarks onto a canvas context. `w` and `h` are CSS pixels (apply the
 * device-pixel-ratio transform on the context before calling). Safe with missing / partial data.
 * Reused by the replay player and by the live camera overlay.
 */
export function drawSkeleton(
  ctx: CanvasRenderingContext2D,
  frame: FrameLandmarks | null | undefined,
  w: number,
  h: number,
  style: SkeletonStyle = DEFAULT_STYLE
) {
  ctx.clearRect(0, 0, w, h);
  if (!frame) return;
  drawBody(ctx, frame.pose ?? [], w, h, style);
  drawHand(ctx, frame.left_hand ?? [], w, h, style);
  drawHand(ctx, frame.right_hand ?? [], w, h, style);
}

/** Converts MediaPipe `{x, y}` landmarks into the compact `[x, y]` format used by the demo. */
export function toPts(landmarks: ReadonlyArray<{ x: number; y: number }> | null | undefined): Pt[] {
  return landmarks ? landmarks.map((l) => [l.x, l.y] as Pt) : [];
}
