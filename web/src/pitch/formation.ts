// Formation slots from the lineup, and the shape model: where each player stands for a given
// ball position and possession. Everything here is illustrative (the data has no positions).
//
// The shape is real: for a 4-3-3, each slot's average spot for the ball's position, with and
// without the ball, from DFL tracking of 4-2-3-1 / 4-3-3 sides (real/shape.json, made by
// scripts/dfl_extract.py; Bassek et al. 2025, CC BY 4.0). The rules below remain for any other
// lineup:
//
// Borrowed from 2D match engines (web/PITCH.md): each player has an anchor in the team's block;
// the block's centre follows the ball along the pitch (about half its movement) and across it
// (less), stretches when the team has the ball and compacts without it; the keeper stays near
// goal; only the nearest opponents press. On top: an elastic block (far from the ball, a player
// follows it less) and off-ball jobs per role and phase (teamJobs).

import { dist, HALF_L, HALF_W, own, type Side, type Vec } from "./geometry";
import { hash01 } from "./moments";
import realShape from "./real/shape.json";

export type Role = "GK" | "DF" | "MF" | "FW";

export interface SquadPlayer {
  name: string;
  number: number;
  position: string;
  side: Side;
}

export interface Slot {
  /** `${side}:${name}` */
  id: string;
  side: Side;
  name: string;
  number: number;
  role: Role;
  /** Anchor relative to the block centre, in the team's own frame (attacking +x). */
  ax: number;
  ay: number;
  /** This slot's column in the real shape table (0 the keeper, then each line right to left),
   *  or −1 when the lineup isn't a 4-3-3. */
  k: number;
}

export const slotId = (side: Side, name: string) => `${side}:${name}`;

const LINE_X: Record<Role, number> = { GK: 0, DF: -15, MF: -1, FW: 13 };
/** Lateral anchors per line size (own frame: +y is the left, facing the attack). */
const SPREAD: Record<number, number[]> = {
  1: [0],
  2: [-9, 9],
  3: [0, -17, 17],
  4: [-23, 23, -8, 8],
  5: [-25, 25, -12, 12, 0],
  6: [-25, 25, -15, 15, -5, 5],
};

const role = (p: string): Role => (p === "GK" || p === "DF" || p === "MF" || p === "FW" ? p : "MF");

/** One team's eleven as slots. Lines follow the lineup's roles (4-3-3 for the demo clubs). */
export function teamSlots(players: SquadPlayer[], side: Side): Slot[] {
  const mine = players.filter((p) => p.side === side).sort((a, b) => a.number - b.number);
  const out: Slot[] = [];
  for (const r of ["GK", "DF", "MF", "FW"] as Role[]) {
    const line = mine.filter((p) => role(p.position) === r);
    const ys = SPREAD[line.length] ?? line.map((_, i) => (i / Math.max(1, line.length - 1) - 0.5) * 50);
    line.forEach((p, i) => {
      // The midfield's centre (the lowest number) sits a little deeper: a holding midfielder.
      const deeper = r === "MF" && line.length === 3 && i === 0 ? -4 : 0;
      // Wide forwards sit a touch deeper than the centre-forward.
      const wide = r === "FW" && line.length === 3 && i > 0 ? -3 : 0;
      out.push({
        id: slotId(side, p.name),
        side,
        name: p.name,
        number: p.number,
        role: r,
        ax: LINE_X[r] + deeper + wide,
        ay: ys[i] ?? 0,
        k: -1,
      });
    });
  }
  // A 4-3-3 takes the real table's columns: each line right to left (own frame: −y is right).
  const sizes = (["GK", "DF", "MF", "FW"] as Role[]).map((r) => out.filter((s) => s.role === r).length);
  if (sizes.join() === "1,4,3,3") {
    let k = 0;
    for (const r of ["GK", "DF", "MF", "FW"] as Role[])
      for (const s of out.filter((x) => x.role === r).sort((a, b) => a.ay - b.ay)) s.k = k++;
  }
  return out;
}

/** The real table: per possession, cells along × across × 11 slots × (x, y), own frame; and how
 *  far each slot wanders off it (RMS metres, x and y) within a minute. */
const TABLE = realShape as unknown as {
  cells: [number, number];
  with: number[][][][];
  without: number[][][][];
  withSpread: number[][];
  withoutSpread: number[][];
  wanderShared: number;
};

/** The share of the wander a team has in common (real: the outfield's mean offset). */
export const SHARED = TABLE.wanderShared;

/**
 * A player's wander off his spot at time t (own frame, metres), as real players wander: the
 * real spread for his slot (RMS, within a minute), the real share of it common to his team.
 * Smooth and slow (real wanders last well over 30 s): two waves of 30–60 s and 10–20 s per axis.
 * Pure in t, so planning stays causal.
 */
export function wander(slot: Slot, t: number, inPossession: boolean): Vec {
  if (slot.k < 0) return { x: 0, y: 0 };
  const [sx, sy] = (inPossession ? TABLE.withSpread : TABLE.withoutSpread)[slot.k];
  // Part of it is the team's (a line steps up, the block slides together), part his own.
  const team = waves(slot.side);
  const own_ = waves(slot.id);
  const a = Math.sqrt(SHARED);
  const b = Math.sqrt(1 - SHARED);
  return { x: sx * (a * wave(team[0], t) + b * wave(own_[0], t)), y: sy * (a * wave(team[1], t) + b * wave(own_[1], t)) };
}

/** Two waves per axis (periods 30–60 s and 10–20 s, phases from hash01), cached per id. */
type Wave = [number, number, number, number];
const waveCache = new Map<string, [Wave, Wave]>();
function waves(who: string): [Wave, Wave] {
  let w = waveCache.get(who);
  if (!w) {
    const one = (axis: string): Wave => {
      const h = (n: number) => hash01(`${who}:wander:${axis}:${n}`);
      return [(2 * Math.PI) / (30 + 30 * h(1)), (2 * Math.PI) / (10 + 10 * h(2)), 6.283 * h(3), 6.283 * h(4)];
    };
    waveCache.set(who, (w = [one("x"), one("y")]));
  }
  return w;
}
// RMS of 0.6 sin + 0.4 sin is 0.51: scaled to 1.
const wave = ([w1, w2, p1, p2]: Wave, t: number) => (0.6 * Math.sin(w1 * t + p1) + 0.4 * Math.sin(w2 * t + p2)) / 0.51;
const [NX, NY] = TABLE.cells;
const CW = (2 * HALF_L) / NX;
const CH = (2 * HALF_W) / NY;

/** A slot's real average spot (own frame) for a ball at b (own frame), read smoothly between the
 *  cells' centres so the shape glides as the ball moves. */
function realSpot(k: number, b: Vec, inPossession: boolean): Vec {
  const t = inPossession ? TABLE.with : TABLE.without;
  const u = clamp((b.x + HALF_L) / CW - 0.5, 0, NX - 1);
  const v = clamp((b.y + HALF_W) / CH - 0.5, 0, NY - 1);
  const i0 = Math.floor(u);
  const j0 = Math.floor(v);
  const i1 = Math.min(i0 + 1, NX - 1);
  const j1 = Math.min(j0 + 1, NY - 1);
  const fu = u - i0;
  const fv = v - j0;
  const at = (i: number, j: number, c: number) => t[i][j][k][c];
  const mix = (c: number) =>
    (at(i0, j0, c) * (1 - fu) + at(i1, j0, c) * fu) * (1 - fv) + (at(i0, j1, c) * (1 - fu) + at(i1, j1, c) * fu) * fv;
  return { x: mix(0), y: mix(1) };
}

export function allSlots(players: SquadPlayer[]): Slot[] {
  return [...teamSlots(players, "home"), ...teamSlots(players, "away")];
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
/** 0 below a, 1 above b, smooth between. */
const smooth = (a: number, b: number, v: number) => {
  const u = clamp((v - a) / (b - a), 0, 1);
  return u * u * (3 - 2 * u);
};

/** Shape tuning. Distances in metres. */
export const SHAPE = {
  /** How much of the ball's movement each line follows, along and across: the back line steps
   *  up and drops, the midfield slides across with the ball, the forwards hold higher. */
  line: { GK: [0, 0], DF: [0.55, 0.25], MF: [0.4, 0.6], FW: [0.3, 0.4] } as Record<Role, [number, number]>,
  /** Block centre offset from the ball line, with and without the ball. */
  withBall: 3,
  without: -9,
  /** Length and width multipliers on the anchors. */
  stretchWith: 1.15,
  stretchWithout: 0.85,
  widthWith: 1.05,
  widthWithout: 0.72,
} as const;

/**
 * Where this slot stands, in world metres, for a ball at `ball` (world) and possession
 * `inPossession`. Pure.
 */
export function shapeAt(slot: Slot, ball: Vec, inPossession: boolean): Vec {
  const b = own(slot.side, ball);
  let p: Vec;
  if (slot.k >= 0) {
    // Each player's own spot, up to 1.5 m off the real average; the back line keeps one depth.
    const r = realSpot(slot.k, b, inPossession);
    const jx = slot.role === "DF" || slot.role === "GK" ? 0 : (hash01(`${slot.id}:x`) - 0.5) * 3;
    const jy = slot.role === "GK" ? 0 : (hash01(`${slot.id}:y`) - 0.5) * 3;
    p = { x: clamp(r.x + jx, -HALF_L + 1, HALF_L - 4), y: clamp(r.y + jy, -HALF_W + 1.5, HALF_W - 1.5) };
  } else if (slot.role === "GK") {
    p = { x: -HALF_L + 2 + clamp((b.x + HALF_L) * 0.08, 0, 11), y: clamp(b.y * 0.15, -5, 5) };
  } else {
    const off = inPossession ? SHAPE.withBall : SHAPE.without;
    const k = inPossession ? SHAPE.stretchWith : SHAPE.stretchWithout;
    const w = inPossession ? SHAPE.widthWith : SHAPE.widthWithout;
    // Each player's own spot in the block, up to 1.5 m off the textbook anchor. The back line
    // keeps one depth: it steps up and drops as a line.
    const jx = slot.role === "DF" ? 0 : (hash01(`${slot.id}:x`) - 0.5) * 3;
    const jy = (hash01(`${slot.id}:y`) - 0.5) * 3;
    // The block is elastic: a player far from the ball follows it less (down to 55%). The back
    // line measures from its middle, so it stays one line.
    const ax = clamp(off + slot.ax * k + jx, -HALF_L + 5, HALF_L - 6);
    const ay = (slot.role === "DF" ? 0 : slot.ay + jy) * w;
    const e = 1 - 0.45 * smooth(15, 45, Math.hypot(ax - b.x, ay - b.y));
    const [fx, fy] = SHAPE.line[slot.role];
    const cx = clamp(fx * b.x * e + off, -30, 24);
    const x = clamp(cx + slot.ax * k + jx, -HALF_L + 5, HALF_L - 6);
    const y = clamp((slot.ay + jy) * w + fy * b.y * e, -HALF_W + 1.5, HALF_W - 1.5);
    p = { x, y };
  }
  return own(slot.side, p);
}

/** Kick-off: each team in its own half, the centre-forward of the kicking team on the spot. */
export function kickoffAt(slot: Slot, kicking: boolean): Vec {
  const p = own(slot.side, shapeAt(slot, { x: 0, y: 0 }, kicking));
  const x = slot.role === "FW" && slot.ay === 0 && kicking ? -0.8 : Math.min(p.x, kicking ? -1 : -10);
  // Outside the centre circle unless kicking off.
  const y = !kicking && Math.hypot(x, p.y) < 10 ? Math.sign(p.y || 1) * 10 : p.y;
  return own(slot.side, { x, y });
}

/** How hard a player goes to his spot: "slow" walks (jogs if far), "auto" picks by the gap,
 *  "urgent" runs (a switch of play, a turnover, a run into the box, recovering goal side). */
export type Pace = "slow" | "auto" | "urgent";

export interface Job {
  at: Vec;
  pace: Pace;
}

/**
 * The team's spots for a ball at `ball`, with each player's off-ball job (world metres). Pure.
 * In possession: one forward runs in behind or checks short, the ball-side full-back overlaps
 * when the ball is wide, the nearest midfielder offers a short option, the far side walks.
 * Without it: the shape, with the far-side winger tucking in at a walk. (The press and the cover
 * are on the ball, so plan.ts adds them: it knows who is nearest.)
 */
export function teamJobs(team: Slot[], ball: Vec, inPossession: boolean): Record<string, Job> {
  const out: Record<string, Job> = {};
  if (!team.length) return out;
  const side = team[0].side;
  const b = own(side, ball);
  const home: Record<string, Vec> = {};
  for (const s of team) {
    home[s.id] = own(side, shapeAt(s, ball, inPossession));
    // Far from the ball across the pitch: no hurry.
    const far = Math.abs(home[s.id].y - b.y) > 28 && s.role !== "GK";
    out[s.id] = { at: home[s.id], pace: far ? "slow" : "auto" };
  }
  const put = (s: Slot | undefined, at: Vec, pace: Pace) => {
    if (s) out[s.id] = { at: { x: clamp(at.x, -HALF_L + 3, HALF_L - 3), y: clamp(at.y, -HALF_W + 2, HALF_W - 2) }, pace };
  };
  const nearestTo = (ss: Slot[], p: Vec) => {
    let best: Slot | undefined;
    for (const s of ss) if (!best || dist(home[s.id], p) < dist(home[best.id], p)) best = s;
    return best;
  };
  const wing = Math.sign(b.y || 1);
  const of = (r: Role) => team.filter((s) => s.role === r);
  // A coin per ball spot (5 m cells), so the same picture always gets the same jobs.
  const coin = (salt: string) => hash01(`${side}:${salt}:${Math.round(b.x / 5)}:${Math.round(b.y / 5)}`);

  if (inPossession) {
    const fw = nearestTo(of("FW"), b);
    if (fw && b.x > -15) {
      if (coin("run") < 0.6) {
        // In behind: on the last line's shoulder, into the box once the ball is near it.
        const x = Math.min(HALF_L - 11, Math.max(home[fw.id].x + 6, b.x + 14));
        put(fw, { x, y: home[fw.id].y * 0.6 + b.y * 0.2 }, x > HALF_L - 22 ? "urgent" : "auto");
      } else {
        put(fw, { x: b.x + 7, y: b.y + (home[fw.id].y > b.y ? 6 : -6) }, "auto"); // checks short
      }
    }
    if (Math.abs(b.y) > 14) {
      const fb = of("DF").filter((s) => Math.sign(s.ay) === wing).sort((a, c) => Math.abs(c.ay) - Math.abs(a.ay))[0];
      if (fb) put(fb, { x: Math.max(home[fb.id].x, b.x + 5), y: wing * (HALF_W - 4) }, "auto"); // the overlap
    }
    // A short option: the nearest midfielder, a pass away, inside and a little behind the ball.
    const mf = nearestTo(of("MF"), b);
    if (mf) put(mf, { x: b.x - 5, y: b.y - wing * 8 }, "auto");
  } else if (team[0].k < 0) {
    // (The real shape has the forwards' defending spots; the rules' shape needs these.)
    // The forwards stay up, about the halfway line, for the counter.
    for (const s of of("FW")) put(s, { x: Math.max(home[s.id].x, -4), y: home[s.id].y }, "slow");
    for (const s of of("FW"))
      if (s.ay !== 0 && Math.sign(s.ay) !== wing && Math.abs(home[s.id].y - b.y) > 20)
        put(s, { x: home[s.id].x - 2, y: home[s.id].y * 0.6 }, "slow"); // the far winger tucks in
  }
  for (const id in out) out[id].at = own(side, out[id].at);
  return out;
}
