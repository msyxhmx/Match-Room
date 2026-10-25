// A timeline at one instant: where every dot and the ball are. Pure, so a lab state or a test
// can freeze any time. Players glide through their keys on a smooth curve (cubic Hermite, the
// tangents averaged and limited so a dot never overshoots a key); a tiny idle sway keeps a
// standing player from looking frozen.

import type { Role } from "./formation";
import type { Side } from "./geometry";
import { hash01 } from "./moments";
import type { BallKey, Beat, Key, Timeline } from "./plan";

export interface Dot {
  id: string;
  side: Side;
  name: string;
  number: number;
  role: Role;
  x: number;
  y: number;
}

export interface Frame {
  t: number;
  dots: Dot[];
  /** null while the ball is hidden between moments. */
  ball: { x: number; y: number; z: number; a: number } | null;
  /** The moment on screen (from the ball's fade-in to its end), if any. */
  beat: Beat | null;
}

export interface FrameOptions {
  /** Idle sway (off for tests that check exact positions). */
  sway?: boolean;
  /** Reduced motion: hold each key's picture, no travel between them. */
  steps?: boolean;
}

function find<T extends { t: number }>(keys: T[], t: number): number {
  // Last index with keys[i].t <= t (−1 before the first).
  let lo = 0;
  let hi = keys.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (keys[mid].t <= t) {
      ans = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return ans;
}

const vel = (a: Key, b: Key) => {
  const dt = Math.max(1e-6, b.t - a.t);
  return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
};

/** Tangent at key i: the mean of the two segments' velocities, limited per axis (no overshoot). */
function tangent(keys: Key[], i: number, axis: "x" | "y"): number {
  if (i <= 0 || i >= keys.length - 1) return 0;
  const a = vel(keys[i - 1], keys[i])[axis];
  const b = vel(keys[i], keys[i + 1])[axis];
  if (a * b <= 0) return 0; // turning: stop on the key
  const m = (a + b) / 2;
  const lim = 3 * Math.min(Math.abs(a), Math.abs(b));
  return Math.sign(m) * Math.min(Math.abs(m), lim);
}

export function trackAt(keys: Key[], t: number, steps = false): { x: number; y: number } {
  if (!keys.length) return { x: 0, y: 0 };
  const i = find(keys, t);
  if (i < 0) return { x: keys[0].x, y: keys[0].y };
  if (i >= keys.length - 1 || steps) return { x: keys[i].x, y: keys[i].y };
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.t - a.t;
  if (h < 1e-6) return { x: b.x, y: b.y };
  const u = (t - a.t) / h;
  const u2 = u * u;
  const u3 = u2 * u;
  const h00 = 2 * u3 - 3 * u2 + 1;
  const h10 = u3 - 2 * u2 + u;
  const h01 = -2 * u3 + 3 * u2;
  const h11 = u3 - u2;
  return {
    x: h00 * a.x + h10 * h * tangent(keys, i, "x") + h01 * b.x + h11 * h * tangent(keys, i + 1, "x"),
    y: h00 * a.y + h10 * h * tangent(keys, i, "y") + h01 * b.y + h11 * h * tangent(keys, i + 1, "y"),
  };
}

export function ballAt(keys: BallKey[], t: number, steps = false): Frame["ball"] {
  const i = find(keys, t);
  if (i < 0 || i >= keys.length - 1) return null;
  const a = keys[i];
  const b = keys[i + 1];
  const h = b.t - a.t;
  let u = h < 1e-6 ? 1 : (t - a.t) / h;
  if (steps) u = 0;
  const alpha = a.a + (b.a - a.a) * u;
  if (alpha <= 0.001) return null;
  const e = b.ease === "out" ? 1 - (1 - u) * (1 - u) : b.ease === "hold" ? u : u;
  const z = b.arc > 0 ? 4 * b.arc * u * (1 - u) : 0;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z, a: alpha };
}

const SWAY_M = 0.3;

export function frameAt(tl: Timeline, t: number, opts: FrameOptions = {}): Frame {
  const sway = opts.sway ?? true;
  const dots: Dot[] = [];
  for (const id in tl.tracks) {
    const tr = tl.tracks[id];
    if (tr.offAt !== null && t >= tr.offAt) continue;
    const p = trackAt(tr.keys, t, opts.steps);
    let { x, y } = p;
    if (sway && !opts.steps) {
      const h = hash01(id);
      const f = 0.22 + 0.2 * h;
      x += SWAY_M * Math.sin(2 * Math.PI * f * t + h * 40);
      y += SWAY_M * Math.cos(2 * Math.PI * (f * 0.8) * t + h * 17);
    }
    const s = tr.slot;
    dots.push({ id, side: s.side, name: s.name, number: s.number, role: s.role, x, y });
  }
  const beat = tl.beats.find((b) => t >= Math.max(b.s, b.touch - 0.45) && t <= b.end) ?? null;
  let ball = ballAt(tl.ball, t, opts.steps);
  // A carry: the ball at the carrier's feet, a stride ahead, easing onto the real spot at the touch.
  const i = find(tl.ball, t);
  const seg = i >= 0 ? tl.ball[i + 1] : undefined;
  if (ball && seg?.follow && tl.tracks[seg.follow]) {
    const p = trackAt(tl.tracks[seg.follow].keys, t, opts.steps);
    const a = tl.ball[i];
    const u = Math.min(1, Math.max(0, (t - a.t) / Math.max(1e-6, seg.t - a.t)));
    const k = u * u; // feet → the event's spot as the touch nears
    ball = { ...ball, x: p.x + (seg.x - p.x) * k, y: p.y + (seg.y - p.y) * k, z: 0 };
  }
  return { t, dots, ball, beat };
}
