// A timeline at one instant: where every dot and the ball are. Pure, so a lab state or a test
// can freeze any time. Players glide through their keys on a smooth curve (cubic Hermite, the
// tangents averaged and limited so a dot never overshoots a key). A standing player stands
// still: his life comes from the figure's idle pose (figures.ts), not from drifting.

import type { Role } from "./formation";
import type { Side } from "./geometry";
import { ghostAt } from "./ghost";
import type { BallKey, Beat, Key, Timeline } from "./plan";

export interface Dot {
  id: string;
  side: Side;
  name: string;
  number: number;
  role: Role;
  x: number;
  y: number;
  /** Metres travelled along the track so far, and strides taken (a stride is two steps, its
   *  length from strideM). The figure's legs follow the ground actually covered, so they don't
   *  skate. Both come from the track's keys alone. */
  run: number;
  strides: number;
}

export interface Frame {
  t: number;
  dots: Dot[];
  /** null while the ball is hidden between moments. `ghost`: the illustrative ball between
   *  real moments (continuous play), never at a real event. */
  ball: { x: number; y: number; z: number; a: number; ghost?: boolean } | null;
  /** The moment on screen (from the ball's fade-in to its end), if any. */
  beat: Beat | null;
  /** Who has the ball after the latest touch (null before the first). */
  possession: Side | null;
}

export interface FrameOptions {
  /** Reduced motion: hold each key's picture, no travel between them. */
  steps?: boolean;
  /** Continuous play: between real moments the ghost ball keeps moving (ghost.ts). */
  continuous?: boolean;
  /** Only the ball, the beat and possession, no players (the follow camera's samples). */
  ballOnly?: boolean;
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

/** A stride (two steps) in metres at v m/s: about 1.7 walking, 2.6 jogging, 3.3 running, 4.2
 *  sprinting, so the cadence (v / stride) rises with speed as well. */
export const strideM = (v: number) => Math.min(4.2, 1 + 0.45 * v);

/** Per track: metres and strides covered up to each key (straight between keys). Cached. */
const odometers = new WeakMap<Key[], { run: Float64Array; strides: Float64Array }>();
function odometer(keys: Key[]) {
  let o = odometers.get(keys);
  if (o) return o;
  o = { run: new Float64Array(keys.length), strides: new Float64Array(keys.length) };
  for (let i = 1; i < keys.length; i++) {
    const dx = keys[i].x - keys[i - 1].x;
    const dy = keys[i].y - keys[i - 1].y;
    const d = Math.sqrt(dx * dx + dy * dy);
    o.run[i] = o.run[i - 1] + d;
    o.strides[i] = o.strides[i - 1] + d / strideM(d / Math.max(1e-6, keys[i].t - keys[i - 1].t));
  }
  odometers.set(keys, o);
  return o;
}

/** Metres and strides covered by time t, at position p (trackAt's, for the same t). */
function covered(keys: Key[], t: number, p: { x: number; y: number }, steps = false): { run: number; strides: number } {
  if (!keys.length) return { run: 0, strides: 0 };
  const o = odometer(keys);
  const i = find(keys, t);
  if (i < 0) return { run: 0, strides: 0 };
  if (i >= keys.length - 1 || steps) return { run: o.run[i], strides: o.strides[i] };
  const seg = o.run[i + 1] - o.run[i];
  const dx = p.x - keys[i].x;
  const dy = p.y - keys[i].y;
  const k = seg > 1e-9 ? Math.min(1, Math.sqrt(dx * dx + dy * dy) / seg) : 0;
  return { run: o.run[i] + seg * k, strides: o.strides[i] + (o.strides[i + 1] - o.strides[i]) * k };
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
  const e = b.ease === "out" ? u + 0.3 * u * (1 - u) : u; // a pass slows a little (starts 1.3× its average)
  const z = a.z !== undefined && b.z !== undefined ? a.z + (b.z - a.z) * u : b.arc > 0 ? 4 * b.arc * u * (1 - u) : 0;
  return { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e, z, a: alpha };
}

export function frameAt(tl: Timeline, t: number, opts: FrameOptions = {}): Frame {
  const dots: Dot[] = [];
  for (const id in opts.ballOnly ? {} : tl.tracks) {
    const tr = tl.tracks[id];
    if (tr.offAt !== null && t >= tr.offAt) continue;
    const { x, y } = trackAt(tr.keys, t, opts.steps);
    const { run, strides } = covered(tr.keys, t, { x, y }, opts.steps);
    const s = tr.slot;
    dots.push({ id, side: s.side, name: s.name, number: s.number, role: s.role, x, y, run, strides });
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
    // He's too far from where the pass landed to carry it: it rolls on to the real spot.
    const start = trackAt(tl.tracks[seg.follow].keys, a.t, opts.steps);
    if (Math.hypot(start.x - a.x, start.y - a.y) > 3) {
      const e = u * u * (3 - 2 * u);
      ball = { ...ball, x: a.x + (seg.x - a.x) * e, y: a.y + (seg.y - a.y) * e, z: 0 };
      return finish();
    }
    // Ease from where the pass landed onto his feet, then onto the event's spot as the touch nears.
    const w = Math.min(1, (t - a.t) / 0.8);
    const inn = w * w * (3 - 2 * w);
    const fx = a.x + (p.x - a.x) * inn;
    const fy = a.y + (p.y - a.y) * inn;
    const k = u * u * (3 - 2 * u); // smooth onto the spot (peak 1.5× average, not 2×)
    ball = { ...ball, x: fx + (seg.x - fx) * k, y: fy + (seg.y - fy) * k, z: 0 };
  }
  return finish();

  function finish(): Frame {
  if (opts.continuous && !opts.steps) {
    if (ball) ball = { ...ball, a: 1 }; // the ghost hands over: no fade at the real ball's ends
    else {
      const g = ghostAt(tl, t);
      if (g) ball = { x: g.x, y: g.y, z: 0, a: 1, ghost: true };
    }
  }
  let possession: Side | null = null;
  for (const b of tl.beats) {
    if (b.touch > t) break;
    const m = b.moment;
    possession = m.kind === "pass" && m.outcome !== "complete" && t >= b.land ? (m.side === "home" ? "away" : "home") : m.side;
  }
  return { t, dots, ball, beat, possession };
  }
}
