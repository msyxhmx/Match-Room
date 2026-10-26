// Continuous play: the ball between real moments. The data has no touches there, so this is
// illustration, drawn as a "ghost" ball so a viewer can tell it from the real one. The ghost is
// carried by the player who has it and passed on to a teammate now and then (aimed where that
// teammate will be). Once the next real moment's approach starts, it is played to that
// moment's spot and arrives exactly when the real ball takes over. Real touches stay exactly
// where and when the events say.
//
// Pure: computed from the timeline alone (the dots' planned positions), cached per gap. The
// play before the next moment's approach never depends on that moment, so planning again after
// a new tick doesn't change what was already shown.

import { attackSign, dist, HALF_L, HALF_W, own, type Side, type Vec } from "./geometry";
import { trackAt } from "./frame";
import { hash01, isGoal } from "./moments";
import type { Timeline } from "./plan";
import { LEAD } from "./plan";

/** One stretch of the ghost: carried by a player, or in flight between two points. */
type Seg =
  | { kind: "carry"; t0: number; t1: number; by: string; blendFrom?: Vec; blendTill?: number }
  | { kind: "fly"; t0: number; t1: number; from: Vec; to: Vec };

interface Gap {
  t0: number;
  /** Open-ended illustrative play from t0 (independent of the next moment). */
  segs: Seg[];
  /** Once the next moment is known: from `cut`, a last pass to its spot, landing at `arrive`. */
  final: { cut: number; arrive: number; from: Vec; to: Vec } | null;
  /** The ghost stops here (the next moment's real ball, or never). */
  t1: number;
}

/** Illustrative passes go at a real pass's average speed for their length (DFL: 6 m/s over
 *  5 m, 9.5 over 25 m, 16 over 50 m); none faster than MAX_SPEED. */
const passSpeed = (d: number) => 4.9 + 0.19 * d;
const MAX_SPEED = 20;
/** A carrier passes on after roughly this long (real receivers keep it 0.7–2.4 s, median 1.35). */
const PASS_EVERY = 1.6;
/** A pass slows a little as it travels (starts at 1.3× its average speed, not 2×). */
const ease = (u: number) => u + 0.3 * u * (1 - u);
/** After a goal: no ball while they celebrate and reset. */
const GOAL_QUIET = 3.6;
/** After a ball off the pitch: none while the goal kick is set up. */
const DEAD = 1.2;
const offPitch = (p: Vec) => Math.abs(p.x) > HALF_L || Math.abs(p.y) > HALF_W;
/** How far ahead the open-ended play is planned (s). */
const HORIZON = 600;

const cache = new WeakMap<Timeline, Map<number, Gap | null>>();

/** In from the lines: a carrier at the line keeps the ghost on the pitch, not a stride over it. */
const IN = 0.3;

/** The ghost at a player's feet, a stride ahead. Every ghost position is a feet spot or a straight
 *  line between two of them, so keeping these on the pitch keeps the whole ghost on it. */
function feet(tl: Timeline, id: string, t: number): Vec | null {
  const tr = tl.tracks[id];
  if (!tr || (tr.offAt !== null && t >= tr.offAt)) return null;
  const p = trackAt(tr.keys, t);
  return {
    x: Math.max(-HALF_L + IN, Math.min(HALF_L - IN, p.x + attackSign(tr.slot.side) * 0.6)),
    y: Math.max(-HALF_W + IN, Math.min(HALF_W - IN, p.y)),
  };
}

function nearestOf(tl: Timeline, side: Side | null, p: Vec, t: number, except?: string): string | null {
  let best: string | null = null;
  let bd = Infinity;
  for (const k in tl.tracks) {
    const tr = tl.tracks[k];
    if (k === except || (side && tr.slot.side !== side) || tr.slot.role === "GK") continue;
    const f = feet(tl, k, t);
    if (!f) continue;
    const d = dist(f, p);
    if (d < bd) {
      bd = d;
      best = k;
    }
  }
  return best;
}

function segAt(tl: Timeline, s: Seg, t: number): Vec | null {
  if (s.kind === "fly") {
    const e = ease((t - s.t0) / Math.max(1e-6, s.t1 - s.t0));
    return { x: s.from.x + (s.to.x - s.from.x) * e, y: s.from.y + (s.to.y - s.from.y) * e };
  }
  const f = feet(tl, s.by, t);
  if (!f) return null;
  if (s.blendFrom && s.blendTill && t < s.blendTill) {
    const u = (t - s.t0) / Math.max(1e-6, s.blendTill - s.t0);
    const e = u * u * (3 - 2 * u);
    return { x: s.blendFrom.x + (f.x - s.blendFrom.x) * e, y: s.blendFrom.y + (f.y - s.blendFrom.y) * e };
  }
  return f;
}

const posIn = (tl: Timeline, segs: Seg[], t: number): Vec | null => {
  for (const s of segs) if (t >= s.t0 && t < s.t1) return segAt(tl, s, t);
  return null;
};

/** Illustrative play from (t0, ball at `from`, held by `holder`): carries and forward passes. */
function openPlay(tl: Timeline, t0: number, from: Vec, holder: string, seed: string): Seg[] {
  const segs: Seg[] = [];
  const f0 = feet(tl, holder, t0) ?? from;
  // Onto the holder at no more than 12 m/s on average, however far he is (no 1.5 s cap: a
  // holder 40 m away would make the ball fly at 40 m/s).
  const blendTill = t0 + Math.max(0.3, dist(from, f0) / 12);
  let t = t0;
  let by = holder;
  let first = true;
  for (let n = 0; t < t0 + HORIZON && n < 400; n++) {
    const pass = Math.max(t + PASS_EVERY * (0.8 + 0.4 * hash01(`${seed}:${n}`)), first ? blendTill + 0.3 : 0);
    segs.push(first ? { kind: "carry", t0: t, t1: pass, by, blendFrom: from, blendTill } : { kind: "carry", t0: t, t1: pass, by });
    first = false;
    const at = feet(tl, by, pass);
    if (!at) break;
    // A teammate 10–30 m away, mostly forward (toward the goal they attack).
    const side = tl.tracks[by].slot.side;
    let best: { k: string; score: number; to: Vec; flight: number } | null = null;
    for (const k in tl.tracks) {
      const tr = tl.tracks[k];
      if (k === by || tr.slot.side !== side || tr.slot.role === "GK") continue;
      const guess = feet(tl, k, pass + 0.8);
      if (!guess) continue;
      const d = dist(at, guess);
      if (d < 10 || d > 30) continue;
      const flight = Math.max(0.6, d / passSpeed(d));
      const to = feet(tl, k, pass + flight) ?? guess;
      const forward = own(side, to).x - own(side, at).x;
      const score = -0.35 * forward + 8 * hash01(`${k}:${seed}:${n}`);
      if (!best || score < best.score) best = { k, score, to, flight };
    }
    if (!best) {
      t = pass;
      continue;
    }
    segs.push({ kind: "fly", t0: pass, t1: pass + best.flight, from: at, to: best.to });
    by = best.k;
    t = pass + best.flight;
  }
  return segs;
}

/** The gap after beat i (i = −1: from the timeline's start to its first beat). */
function planGap(tl: Timeline, i: number): Gap | null {
  const a = i >= 0 ? tl.beats[i] : null;
  const b = tl.beats[i + 1];
  let start: number;
  let from: Vec;
  let holder: string | null;
  if (!a) {
    start = tl.start;
    from = tl.initialBall.at;
    holder = nearestOf(tl, tl.initialBall.side, from, start);
  } else if (isGoal(a.moment)) {
    // Kick-off: the conceding side's player nearest the centre spot.
    start = a.end + GOAL_QUIET;
    from = { x: 0, y: 0 };
    holder = nearestOf(tl, a.moment.side === "home" ? "away" : "home", from, start);
  } else if (offPitch(a.moment.to ?? a.moment.from)) {
    // A shot wide or over: the ball is dead. The defending keeper restarts with a goal kick.
    const side: Side = a.moment.side === "home" ? "away" : "home";
    start = a.end + DEAD;
    holder = Object.keys(tl.tracks).find((k) => tl.tracks[k].slot.side === side && tl.tracks[k].slot.role === "GK") ?? null;
    from = (holder && feet(tl, holder, start)) || { x: 0, y: 0 };
  } else {
    start = a.end;
    from = a.moment.to ?? a.moment.from;
    holder = a.receiver ?? nearestOf(tl, null, from, start);
  }
  if (!holder) return null;
  const segs = openPlay(tl, start, from, holder, a?.moment.id ?? "start");
  if (!b) return { t0: start, segs, final: null, t1: Infinity };

  // The next moment: a last pass to its spot. It leaves no earlier than the moment's approach
  // (its tick has arrived), so the play before then never depends on it.
  const arrive = Math.max(b.s, b.touch - LEAD);
  if (arrive <= start) return null;
  let cut = Math.max(start, b.s, arrive - 1);
  for (let k = 0; k < 2; k++) {
    const p = posIn(tl, segs, cut) ?? from;
    const flight = Math.min(2.2, Math.max(0.4, dist(p, b.moment.from) / passSpeed(dist(p, b.moment.from))));
    cut = Math.max(start, b.s, arrive - flight);
  }
  const p = posIn(tl, segs, cut) ?? from;
  const speed = dist(p, b.moment.from) / Math.max(1e-3, arrive - cut);
  return {
    t0: start,
    segs,
    // Too far to play in time: the ghost bows out and the real ball appears (no teleport).
    final: speed <= MAX_SPEED ? { cut, arrive, from: p, to: b.moment.from } : null,
    t1: speed <= MAX_SPEED ? arrive : cut,
  };
}

/** The ghost ball at t, or null when the real ball is showing (or nothing is). */
export function ghostAt(tl: Timeline, t: number): Vec | null {
  const beats = tl.beats;
  // The last beat that has ended by t (−1: before the first).
  let lo = 0;
  let hi = beats.length - 1;
  let i = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (beats[mid].end <= t) {
      i = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  let gaps = cache.get(tl);
  if (!gaps) cache.set(tl, (gaps = new Map()));
  if (!gaps.has(i)) gaps.set(i, planGap(tl, i));
  const g = gaps.get(i);
  if (!g || t < g.t0 || t >= g.t1) return null;
  if (g.final && t >= g.final.cut) {
    const f = g.final;
    const e = ease((t - f.cut) / Math.max(1e-6, f.arrive - f.cut));
    return { x: f.from.x + (f.to.x - f.from.x) * e, y: f.from.y + (f.to.y - f.from.y) * e };
  }
  return posIn(tl, g.segs, t);
}
