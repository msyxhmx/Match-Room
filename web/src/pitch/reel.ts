// The live pitch played by real football: a library of recorded DFL play (public/pitch/reel.json,
// from scripts/dfl_reel.py) cut together so the match's moments happen in it. The planner's
// movement read as animation; recorded players move like players, so every dot follows a real one.
//
// The rule (Ilham's call, 27 Oct; docs/architecture.md): each shown moment is made by the right
// player, in match order, at about its time, by a real touch of the same kind that lands within
// CAP_M (25 m) of the event's spot. Between moments the real play goes on with its ball drawn as
// the ghost (illustrative, half strength, no names). Clips are joined by a cut (the 0.18 s dip),
// never by blending two recordings into each other.
//
//   ×1   one recording plays on; a forced moment (goal, card, shot, corner, foul) is played by the
//        real event nearest its spot, by continuing the recording when it has one in time, else by
//        a cut to a clip that leads into one. After a goal the scorer's side celebrates, then a
//        cut to a real kick-off.
//   ×60  a highlights reel: goals, cards and shots play back to back as clips labelled with their
//        minute; lesser ones are skipped once the reel falls behind; a goal jumps the queue (the
//        score waits for it). Between highlights the last clip's play goes on, unlabelled.
//
// Causal like the planner: a moment is used only from its tick's arrival, and every cut is at or
// after it, so a replan on a new tick never changes what was already shown. Pure: the same inputs
// give the same programme. Data: DFL / Sportec open data (Bassek et al. 2025), CC BY 4.0.

import { allSlots, type Role, type Slot, type SquadPlayer } from "./formation";
import { dist, HALF_L, type Side, type Vec } from "./geometry";
import { frameAt, type Frame, type FrameOptions } from "./frame";
import { isGoal, type Moment } from "./moments";
import type { BallKey, Beat, Key, Timeline, Track } from "./plan";
import type { Shot } from "./director";
import type { LiveOptions } from "./schedule";

// ---------------------------------------------------------------- the library

export interface RealEvent {
  /** Frame of the touch (snapped to the ball). */
  f: number;
  kind: "pass" | "shot" | "tackle" | "corner" | "foul" | "card" | "kickoff" | "freekick" | "goalkick" | "throwin";
  /** Entity: 0–10 home slots 1–11, 11–21 away slots 1–11. */
  by: number | null;
  to: number | null;
  ok: boolean | null;
  out?: "goal" | "saved" | "wide" | "blocked" | "post" | null;
  open?: boolean;
  card?: "yellow" | "red" | null;
}

export interface Reel {
  id: string;
  n: number;
  /** Frame-major, per frame 23 entities × (x, y) in decimetres; the ball is entity 22. */
  pos: Int16Array;
  z: Int16Array;
  alive: string;
  poss: string;
  events: RealEvent[];
}

export interface Library {
  hz: number;
  reels: Reel[];
}

interface RawLibrary {
  hz: number;
  reels: (Omit<Reel, "pos" | "z"> & { pos: string; z: string })[];
}

function int16(b64: string): Int16Array {
  const bin = atob(b64);
  const out = new Int16Array(bin.length >> 1);
  for (let i = 0; i < out.length; i++) {
    const v = bin.charCodeAt(2 * i) | (bin.charCodeAt(2 * i + 1) << 8);
    out[i] = v >= 0x8000 ? v - 0x10000 : v;
  }
  return out;
}

export function decodeLibrary(raw: RawLibrary): Library {
  return { hz: raw.hz, reels: raw.reels.map((r) => ({ ...r, pos: int16(r.pos), z: int16(r.z) })) };
}

let loading: Promise<Library | null> | null = null;
/** The library, fetched once (about 2–5 MB, compressed in transit); null if it can't be had. */
export function loadLibrary(url = "/pitch/reel.json"): Promise<Library | null> {
  loading ??= fetch(url)
    .then((r) => (r.ok ? r.json() : null))
    .then((raw) => (raw ? decodeLibrary(raw as RawLibrary) : null))
    .catch(() => null);
  return loading;
}

// ---------------------------------------------------------------- fitting a recording to ours

/** Every touch within this of its event's spot (Ilham's rule, 27 Oct). */
export const CAP_M = 25;

/** How a recording is turned onto our pitch: `rot` swaps ends (and so the teams), `mir`
 *  mirrors across the halfway line's axis (y → −y). */
export interface Fit {
  rot: boolean;
  mir: boolean;
}
const FITS: Fit[] = [
  { rot: false, mir: false },
  { rot: false, mir: true },
  { rot: true, mir: false },
  { rot: true, mir: true },
];

const BALL = 22;
const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** Where entity e is at frame f of a reel, on our pitch. */
export function posAt(r: Reel, e: number, f: number, fit: Fit): Vec {
  const i = (f * 23 + e) * 2;
  let x = r.pos[i] / 10;
  let y = r.pos[i + 1] / 10;
  if (fit.rot) {
    x = -x;
    y = -y;
  }
  if (fit.mir) y = -y;
  return { x, y };
}

/** Our side of a real entity under a fit. */
const sideOf = (e: number, fit: Fit): Side => ((e < 11) !== fit.rot ? "home" : "away");
/** The real entity that plays our (side, slot number) by default. */
const entityOf = (side: Side, number: number, fit: Fit) => ((side === "home") !== fit.rot ? 0 : 11) + number - 1;
const roleOf = (e: number): Role => {
  const k = (e % 11) + 1;
  return k === 1 ? "GK" : k <= 5 ? "DF" : k <= 8 ? "MF" : "FW";
};

/** Who has the ball at a frame, on our pitch. */
function possAt(r: Reel, f: number, fit: Fit): Side | null {
  const c = r.poss[Math.max(0, Math.min(r.n - 1, f))];
  if (c !== "h" && c !== "a") return null;
  return (c === "h") !== fit.rot ? "home" : "away";
}

/** The real entity making a touch: the event's, or (a corner names only the team) the side's
 *  player nearest the ball. */
function toucherOf(r: Reel, ev: RealEvent, fit: Fit, side: Side | null): number | null {
  if (ev.by !== null) return ev.by;
  if (!side) return null;
  const ball = posAt(r, BALL, ev.f, fit);
  let best: number | null = null;
  let bd = Infinity;
  for (let e = 0; e < 22; e++) {
    if (sideOf(e, fit) !== side) continue;
    const d = dist(posAt(r, e, ev.f, fit), ball);
    if (d < bd) {
      bd = d;
      best = e;
    }
  }
  return best;
}

/** The frame of a touch: where its player is nearest the ball, within about a second and a half
 *  (a foul's clock is the whistle's, not the contact's), and how near that is. */
function touchFrame(r: Reel, ev: RealEvent, e: number, hz: number): { f: number; gap: number } {
  const w = Math.round((ev.kind === "foul" || ev.kind === "card" ? 1.6 : 1) * hz);
  let best = { f: ev.f, gap: Infinity };
  for (let f = Math.max(0, ev.f - w); f <= Math.min(r.n - 1, ev.f + w); f++) {
    const i = (f * 23 + e) * 2;
    const j = (f * 23 + BALL) * 2;
    const gap = Math.hypot(r.pos[i] - r.pos[j], r.pos[i + 1] - r.pos[j + 1]) / 10;
    if (gap < best.gap - 0.05) best = { f, gap };
  }
  return best;
}
/** A touch counts when its player is this near the ball. */
const ON_BALL = 2.5;

/** Real event kinds that can play a moment. */
function plays(m: Moment, ev: RealEvent): boolean {
  switch (m.kind) {
    case "shot":
      return ev.kind === "shot";
    case "corner":
      return ev.kind === "corner";
    case "foul":
      return ev.kind === "foul";
    case "card":
      return ev.kind === "card" || ev.kind === "foul";
    case "pass":
      return ev.kind === "pass" && (m.outcome === "complete") === !!ev.ok;
  }
}

/** Our shot outcomes against the recording's: a match plays the real ball as it went. */
const SHOT_OUT: Record<string, string[]> = {
  goal: ["goal"],
  saved: ["saved"],
  blocked: ["blocked"],
  off_target: ["wide", "post"],
};

interface Candidate {
  reel: Reel;
  ev: RealEvent;
  fit: Fit;
  toucher: number;
  spot: Vec;
  cost: number;
}

/** A clip may start this long before its touch, and must run on this long after it. */
const LEAD_MAX = 8;
const TAIL_MIN = 4;

function candidates(lib: Library, m: Moment, role: Role, used: Map<string, number>, near: Vec | null): Candidate[] {
  const out: Candidate[] = [];
  const hz = lib.hz;
  for (const reel of lib.reels) {
    for (let ev of reel.events) {
      if (!plays(m, ev) || ev.f + TAIL_MIN * hz >= reel.n) continue;
      for (const fit of FITS) {
        const toucher0 = toucherOf(reel, { ...ev }, fit, ev.by === null ? m.side : null);
        if (toucher0 === null || sideOf(toucher0, fit) !== m.side) continue;
        const tf = touchFrame(reel, ev, toucher0, hz);
        if (tf.gap > ON_BALL) continue;
        ev = { ...ev, f: tf.f };
        const ball = posAt(reel, BALL, ev.f, fit);
        const off = dist(ball, m.from);
        if (off > CAP_M) continue;
        const toucher = toucher0;
        // A keeper's touch is our keeper's, and only his.
        if ((roleOf(toucher) === "GK") !== (role === "GK")) continue;
        let cost = off;
        if (roleOf(toucher) !== role) cost += 6;
        if (m.kind === "shot") {
          const want = SHOT_OUT[m.outcome] ?? [];
          if (!want.includes(ev.out ?? "")) cost += isGoal(m) ? 40 : 15;
          if (ev.open === false) cost += 4;
        }
        if (ev.f < 2 * hz) cost += 10; // little run-up to show
        cost += 30 * (used.get(`${reel.id}:${ev.f}`) ?? 0);
        if (near) cost += 0.15 * dist(posAt(reel, BALL, Math.max(0, ev.f - 3 * hz), fit), near);
        out.push({ reel, ev, fit, toucher, spot: ball, cost });
      }
    }
  }
  return out.sort((a, b) => a.cost - b.cost);
}

// ---------------------------------------------------------------- segments

interface Anchor {
  moment: Moment;
  ev: RealEvent;
  toucher: number;
  /** Display time of the touch. */
  t: number;
}

/** One recording played from display time `at` (its frame f0) to `end`, under one fit, each of
 *  our players on one real track. A cut joins segments. */
interface Segment {
  at: number;
  end: number;
  reel: Reel;
  fit: Fit;
  f0: number;
  /** Our slot id → real entity. */
  map: Record<string, number>;
  anchors: Anchor[];
  /** ×60: the highlight this clip shows (the chip), until `labelUntil`. */
  label: Moment | null;
  labelUntil: number;
  /** Hold the first frame until `hold` (a kick-off waiting for play to start). */
  hold?: number;
  tl?: Timeline;
}

const timeOf = (s: Segment, f: number, hz: number) => (s.hold ?? s.at) + (f - s.f0) / hz;
const frameOf = (s: Segment, t: number, hz: number) => s.f0 + (t - (s.hold ?? s.at)) * hz;
/** The last display time a segment's recording can reach. */
const reelEnd = (s: Segment, hz: number) => timeOf(s, s.reel.n - 1, hz);

function defaultMap(slots: Slot[], fit: Fit): Record<string, number> {
  const map: Record<string, number> = {};
  for (const s of slots) map[s.id] = entityOf(s.side, s.number, fit);
  return map;
}

/** Put our actor on the real toucher: swap tracks with whoever had it. */
function withActor(map: Record<string, number>, actor: string, toucher: number): Record<string, number> {
  const out = { ...map };
  const holder = Object.keys(out).find((id) => out[id] === toucher);
  const mine = out[actor];
  out[actor] = toucher;
  if (holder && holder !== actor) out[holder] = mine;
  return out;
}

// ---------------------------------------------------------------- the timeline of a segment

const SHOT_SPEED = 28;
/** After a touch, how long its beat stays on screen. */
const HOLD: Record<Moment["kind"], number> = { pass: 0.6, shot: 1.2, corner: 1.2, foul: 1.4, card: 1.8 };

function segmentTimeline(s: Segment, slots: Slot[], hz: number, sentOff: Map<string, number>): Timeline {
  if (s.tl) return s.tl;
  const r = s.reel;
  const first = Math.max(0, Math.floor(frameOf(s, s.at, hz)) - 2);
  // A held kick-off keeps its first frames even when play is still far off (the break).
  const last = Math.max(s.hold !== undefined ? Math.min(r.n - 1, s.f0 + 1) : 0, Math.min(r.n - 1, Math.ceil(frameOf(s, s.end, hz)) + 2));
  const held = (f: number) => (s.hold !== undefined && f <= s.f0 ? s.f0 : f);
  const tracks: Record<string, Track> = {};
  for (const slot of slots) {
    const off = sentOff.get(slot.id);
    if (off !== undefined && off <= s.at) continue;
    const e = s.map[slot.id];
    const keys: Key[] = [];
    if (s.hold !== undefined) {
      const p = posAt(r, e, s.f0, s.fit);
      keys.push({ t: s.at, ...p });
    }
    for (let f = Math.max(first, s.hold !== undefined ? s.f0 : first); f <= last; f++) {
      const p = posAt(r, e, held(f), s.fit);
      keys.push({ t: timeOf(s, f, hz), x: p.x, y: p.y });
    }
    tracks[slot.id] = { slot, keys, offAt: off !== undefined && off < s.end ? off : null };
  }
  const entityToSlot = new Map(Object.entries(s.map).map(([id, e]) => [e, id]));

  const ball: BallKey[] = [];
  const pushBall = (t: number, p: Vec, z: number) => ball.push({ t, x: p.x, y: p.y, z, a: 1, ease: "linear", arc: 0 });
  if (s.hold !== undefined) pushBall(s.at, posAt(r, BALL, s.f0, s.fit), r.z[s.f0] / 10);
  // A goal the recording didn't score: from the real strike our shot flies on into the net.
  const goal = s.anchors.find((a) => isGoal(a.moment) && a.ev.out !== "goal");
  for (let f = Math.max(first, s.hold !== undefined ? s.f0 : first); f <= last; f++) {
    const t = timeOf(s, f, hz);
    if (goal && t > goal.t) break;
    pushBall(t, posAt(r, BALL, held(f), s.fit), Math.max(0, r.z[held(f)] / 10));
  }
  let goalLand: number | null = null;
  if (goal) {
    const strike = posAt(r, BALL, goal.ev.f, s.fit);
    const to = goal.moment.to ?? { x: Math.sign(strike.x) * (HALF_L + 1.2), y: 0 };
    goalLand = goal.t + Math.max(0.35, dist(strike, to) / SHOT_SPEED);
    pushBall(goalLand, to, 0.8);
    pushBall(Math.max(s.end, goalLand) + 0.5, to, 0);
  }

  const beats: Beat[] = s.anchors.map((a) => {
    const m = a.moment;
    const from = posAt(r, BALL, a.ev.f, s.fit);
    let land = a.t + 0.5;
    let to: Vec | null = null;
    if (m.kind === "shot") {
      if (a === goal && goalLand !== null) {
        land = goalLand;
        to = m.to;
      } else {
        // Where the real ball went: over the line, or the first frame it's stopped or touched.
        let f = a.ev.f + 1;
        const lim = Math.min(r.n - 1, a.ev.f + Math.round(2.2 * hz));
        for (; f < lim; f++) {
          const p = posAt(r, BALL, f, s.fit);
          if (Math.abs(p.x) >= HALF_L || dist(p, posAt(r, BALL, f - 1, s.fit)) < 0.6) break;
        }
        land = timeOf(s, f, hz);
        to = posAt(r, BALL, f, s.fit);
      }
    } else if (m.kind === "pass" || m.kind === "corner") {
      const next = r.events.find((e) => e.f > a.ev.f && e.kind !== "card");
      const f = Math.min(r.n - 1, next ? next.f : a.ev.f + Math.round(1.5 * hz));
      land = timeOf(s, f, hz);
      to = posAt(r, BALL, f, s.fit);
    }
    const receiver =
      (m.kind === "pass" || m.kind === "corner") && a.ev.to !== null && a.ev.ok ? entityToSlot.get(a.ev.to) ?? null : null;
    return {
      // The moment where it was played: the pass line and the figures' looks follow the real ball.
      moment: { ...m, from, to },
      s: a.t - 0.45,
      touch: a.t,
      land,
      end: Math.min(s.end, land + HOLD[m.kind]),
      ideal: a.t,
      actor: entityToSlot.get(a.toucher)!,
      receiver,
      winnerShown: false,
    };
  });

  s.tl = {
    tracks,
    ball,
    ghost: [],
    beats,
    dropped: [],
    start: s.at,
    end: s.end,
    initialBall: { at: posAt(r, BALL, s.f0, s.fit), side: possAt(r, s.f0, s.fit) ?? "home" },
  };
  return s.tl;
}

// ---------------------------------------------------------------- the programme

export interface ReelProgram {
  shotAt: (t: number, o?: FrameOptions) => Shot;
  goalsLand: { t: number; moment: Moment }[];
  /** For checks: each shown moment, where and when it was played. */
  shown: { moment: Moment; t: number; spot: Vec; actor: string; highlight: boolean }[];
  segments: { at: number; end: number; reel: string; label: string | null }[];
}

const DIP = 0.18;
/** ×1: a cut leads into its touch by this much, when it can. */
const LEAD_X1 = 5;
/** ×1: a continuing recording may play a moment this early or late. */
const EARLY = 2;
const LATE = 6;
/** ×60: a highlight's lead-in, its tail after the touch lands, and how far behind the clock a
 *  highlight may start before it's skipped (a goal never is: it cuts in). */
const LEAD_X60 = { goal: 2.2, other: 2.6 };
const TAIL_X60 = { goal: 3.2, other: 1.4 };
const LAG_X60 = { 1: 5, 2: 3.5, 3: 2 } as const;
/** After a goal at ×1, the celebration plays this long before the cut to the kick-off. */
const CELEBRATE = 14;

/** Moments the programme shows: at ×1 every forced one (not plain passes); at ×60 the reel's. */
function x60Rank(m: Moment): 0 | 1 | 2 | 3 | null {
  if (isGoal(m)) return 0;
  if (m.kind === "card") return m.outcome === "yellow" ? 2 : 1;
  if (m.kind === "shot") return m.outcome === "saved" ? 2 : 3;
  return null;
}

export function reelProgram(players: SquadPlayer[], moments: Moment[], o: LiveOptions, lib: Library): ReelProgram {
  const hz = lib.hz;
  const slots = allSlots(players);
  const bySlot = new Map(slots.map((s) => [`${s.side}:${s.name}`, s]));
  const fast = o.speed > 2;
  const known = (m: Moment) => o.arrivals.get(m.minute) ?? Infinity;
  const ideal = (m: Moment) => known(m) + (m.t - m.minute * 60) / o.speed;
  let lastTick = -1;
  for (const k of o.arrivals.keys()) lastTick = Math.max(lastTick, k);
  const tick = 60 / o.speed;
  const until = lastTick < 0 ? o.start + 2 * tick : o.arrivals.get(lastTick)! + (lastTick === 45 || lastTick >= 90 ? tick : 2 * tick);

  const used = new Map<string, number>();
  const use = (c: { reel: Reel; ev: RealEvent }) => used.set(`${c.reel.id}:${c.ev.f}`, (used.get(`${c.reel.id}:${c.ev.f}`) ?? 0) + 1);
  const segs: Segment[] = [];
  const sentOff = new Map<string, number>();
  const shown: ReelProgram["shown"] = [];
  const goalsLand: ReelProgram["goalsLand"] = [];

  // ---- where play is now (for choosing what comes next) ----
  const ballNow = (t: number): Vec | null => {
    const s = segs[segs.length - 1];
    if (!s) return null;
    const f = Math.max(0, Math.min(s.reel.n - 1, Math.round(frameOf(s, t, hz))));
    return posAt(s.reel, BALL, f, s.fit);
  };

  /** A cut at `at` to a clip of the candidate, its touch at `touch` (or the clip from `f0`). */
  const cutTo = (at: number, c: { reel: Reel; fit: Fit; f0: number }, map: Record<string, number>, hold?: number): Segment => {
    const prev = segs[segs.length - 1];
    if (prev) prev.end = Math.min(prev.end, at);
    const s: Segment = { at, end: Infinity, reel: c.reel, fit: c.fit, f0: c.f0, map, anchors: [], label: null, labelUntil: -Infinity, hold };
    segs.push(s);
    return s;
  };

  /** Keep play going to `upto`: when a recording runs out, cut to another from where the ball is,
   *  with the same side on it. Chosen from what's on screen only (causal). */
  const fill = (upto: number) => {
    for (let guard = 0; guard < 200; guard++) {
      const s = segs[segs.length - 1];
      const out = reelEnd(s, hz) - 0.4;
      if (out >= upto) return;
      const f = Math.max(0, Math.min(s.reel.n - 1, Math.round(frameOf(s, out, hz))));
      const best = playFrom(posAt(s.reel, BALL, f, s.fit), possAt(s.reel, f, s.fit), s.reel);
      if (!best) return;
      cutTo(out, best, defaultMap(slots, best.fit));
    }
  };

  /** Open play from near `ball` with `side` on it: a clip start every 4 s with 20 s after. */
  const playFrom = (ball: Vec, side: Side | null, not: Reel | null) => {
    let best: { reel: Reel; fit: Fit; f0: number; cost: number } | null = null;
    for (const reel of lib.reels) {
      if (reel === not) continue;
      for (let g = 0; g + 20 * hz < reel.n; g += 4 * hz) {
        if (reel.alive[g] !== "1") continue;
        for (const fit of FITS) {
          let cost = dist(posAt(reel, BALL, g, fit), ball) + (possAt(reel, g, fit) === side ? 0 : 15);
          cost += 25 * (used.get(`${reel.id}:f${g}`) ?? 0);
          if (!best || cost < best.cost) best = { reel, fit, f0: g, cost };
        }
      }
    }
    if (best) used.set(`${best.reel.id}:f${best.f0}`, (used.get(`${best.reel.id}:f${best.f0}`) ?? 0) + 1);
    return best;
  };

  /** A real kick-off by `side`, cut to at `at`, its touch held until `play`. */
  const kickoff = (at: number, side: Side, play: number) => {
    let best: { reel: Reel; fit: Fit; f0: number; cost: number } | null = null;
    for (const reel of lib.reels)
      for (const ev of reel.events) {
        if (ev.kind !== "kickoff" || ev.f < 2 * hz || ev.f + 20 * hz >= reel.n) continue;
        for (const fit of FITS) {
          const by = toucherOf(reel, ev, fit, ev.by === null ? possAt(reel, ev.f + hz, fit) : null);
          if (by === null || sideOf(by, fit) !== side) continue;
          const cost = 25 * (used.get(`${reel.id}:${ev.f}`) ?? 0) + (fit.mir ? 0.1 : 0);
          if (!best || cost < best.cost) best = { reel, fit, f0: ev.f - Math.round(1.5 * hz), cost };
        }
      }
    if (!best) return false;
    used.set(`${best.reel.id}:${best.f0 + Math.round(1.5 * hz)}`, 1);
    cutTo(at, best, defaultMap(slots, best.fit), play > at ? play : undefined);
    return true;
  };

  // ---- the start: a kick-off, or play around the ball ----
  // The session starts on Kick off: the ball is played at once (minute 1's tick comes a tick later).
  if (o.initial.kind === "kickoff") kickoff(o.start, o.initial.kicking, o.start);
  if (!segs.length) {
    const ball = o.initial.kind === "shape" ? o.initial.ball : { x: 0, y: 0 };
    const c = playFrom(ball, o.initial.kind === "shape" ? o.initial.side : "home", null) ?? { reel: lib.reels[0], fit: FITS[0], f0: 0 };
    cutTo(o.start, c, defaultMap(slots, c.fit));
  }

  const arrived = moments.filter((m) => o.arrivals.has(m.minute)).sort((a, b) => ideal(a) - ideal(b));
  let busy = o.start; // ×1: the last moment's end; ×60: the last highlight's end
  let halfDone = false;
  let goalHeld = -Infinity;
  /** The break: from a tick after minute 45 the kick-off picture holds until the second half's
   *  first tick (a while off: known only when it comes, and only what follows it changes). */
  const breakAt = () => {
    halfDone = true;
    const end45 = o.arrivals.get(45);
    if (end45 === undefined) return;
    const brk = Math.max(busy, end45 + tick);
    let second = Infinity;
    for (const [mm, a] of o.arrivals) if (mm > 45) second = Math.min(second, a);
    fill(brk);
    kickoff(brk, "away", second === Infinity ? brk + 3600 : Math.max(brk, second));
    busy = Math.max(busy, brk);
  };
  for (const m of arrived) {
    if (m.kind === "card" && (m.outcome === "red" || m.outcome === "second_yellow")) sentOff.set(`${m.side}:${m.player}`, Math.max(ideal(m), known(m)) + 2);
  }

  for (const m of arrived) {
    const slot = bySlot.get(`${m.side}:${m.player}`);
    if (!slot) continue;
    const k = known(m);
    if (k < o.start) continue;
    if (!halfDone && m.minute > 45) breakAt();

    if (fast) {
      const rank = x60Rank(m);
      if (rank === null) continue;
      const goal = rank === 0;
      let at = Math.max(k, busy);
      if (!goal && at - ideal(m) > LAG_X60[rank as 1 | 2 | 3]) continue;
      // A goal cuts in, but never before the highlight on screen has been played.
      if (goal) at = Math.max(k, goalHeld, Math.min(at, ideal(m) - LEAD_X60.goal));
      const lead = goal ? LEAD_X60.goal : LEAD_X60.other;
      const c = candidates(lib, m, slot.role, used, null)[0];
      if (!c) continue;
      use(c);
      fill(at);
      const f0 = Math.max(0, c.ev.f - Math.round(lead * hz));
      const s = cutTo(at, { reel: c.reel, fit: c.fit, f0 }, withActor(defaultMap(slots, c.fit), slot.id, c.toucher));
      const t = timeOf(s, c.ev.f, hz);
      s.anchors.push({ moment: m, ev: c.ev, toucher: c.toucher, t });
      s.label = m;
      const tl = segmentTimeline({ ...s, end: t + 6 }, slots, hz, sentOff);
      const land = tl.beats[0]?.land ?? t + 1;
      s.labelUntil = land + (goal ? TAIL_X60.goal : TAIL_X60.other);
      busy = s.labelUntil;
      shown.push({ moment: m, t, spot: posAt(c.reel, BALL, c.ev.f, c.fit), actor: slot.id, highlight: true });
      goalHeld = land + (goal ? 1 : 0.3);
      if (goal) goalsLand.push({ t: land, moment: m });
      continue;
    }

    // ×1: forced moments only (a plain pass is play the recording already has).
    if (m.kind === "pass") continue;
    const want = ideal(m);
    const cur = segs[segs.length - 1];
    // Does the recording on screen have one, in time, by the player already on it?
    let done = false;
    const from = Math.max(k + 0.5, want - EARLY, busy + 0.5);
    for (let ev of cur.reel.events) {
      if (!plays(m, ev)) continue;
      const by = toucherOf(cur.reel, ev, cur.fit, ev.by === null ? m.side : null);
      if (by === null) continue;
      const tf = touchFrame(cur.reel, ev, by, hz);
      if (tf.gap > ON_BALL) continue;
      ev = { ...ev, f: tf.f };
      const t = timeOf(cur, ev.f, hz);
      if (t < from || t > want + LATE || t > cur.end || ev.f + TAIL_MIN * hz >= cur.reel.n) continue;
      if (!plays(m, ev)) continue;
      const toucher = toucherOf(cur.reel, ev, cur.fit, ev.by === null ? m.side : null);
      if (toucher === null || cur.map[slot.id] !== toucher) continue;
      const spot = posAt(cur.reel, BALL, ev.f, cur.fit);
      if (dist(spot, m.from) > CAP_M) continue;
      if (m.kind === "shot" && !(SHOT_OUT[m.outcome] ?? []).includes(ev.out ?? "")) continue;
      fill(t); // (no-op: the recording reaches t)
      cur.anchors.push({ moment: m, ev, toucher, t });
      shown.push({ moment: m, t, spot, actor: slot.id, highlight: false });
      busy = t + 1.5;
      done = true;
      break;
    }
    if (!done) {
      const at = Math.max(k, busy, want - LEAD_X1);
      const c = candidates(lib, m, slot.role, used, ballNow(at))[0];
      if (!c) continue;
      use(c);
      fill(at);
      // Lead into the touch from the cut, landing it at its time when the clip allows.
      const lead = Math.max(1.2, Math.min(want - at, c.ev.f / hz, LEAD_MAX));
      const f0 = Math.max(0, c.ev.f - Math.round(lead * hz));
      const s = cutTo(at, { reel: c.reel, fit: c.fit, f0 }, withActor(defaultMap(slots, c.fit), slot.id, c.toucher));
      const t = timeOf(s, c.ev.f, hz);
      s.anchors.push({ moment: m, ev: c.ev, toucher: c.toucher, t });
      shown.push({ moment: m, t, spot: c.spot, actor: slot.id, highlight: false });
      busy = t + 1.5;
    }
    if (isGoal(m)) {
      const s = segs[segs.length - 1];
      const tl = segmentTimeline({ ...s, end: Math.min(reelEnd(s, hz), shown[shown.length - 1].t + 8) }, slots, hz, sentOff);
      const land = tl.beats[tl.beats.length - 1]?.land ?? shown[shown.length - 1].t + 1;
      goalsLand.push({ t: land, moment: m });
      // The celebration, then the other side kicks off.
      const back = Math.min(land + CELEBRATE, reelEnd(s, hz) - 0.4);
      fill(back);
      kickoff(back, other(m.side), back + 2.5);
      busy = back + 2.5;
    }
  }
  if (!halfDone && lastTick >= 45 && lastTick < 90) breakAt();
  fill(until);
  segs[segs.length - 1].end = Math.max(until, busy, segs[segs.length - 1].at);

  // ---- reading it ----
  const finals = segs.map((s) => ({ ...s, tl: undefined as Timeline | undefined }));
  const tlOf = (s: Segment) => (s.tl ??= segmentTimeline(s, slots, hz, sentOff));
  const shotAt = (t: number, fo?: FrameOptions): Shot => {
    let i = finals.length - 1;
    while (i > 0 && finals[i].at > t) i--;
    const s = finals[i];
    const f = frameAt(tlOf(s), t, { ...fo, continuous: false });
    finish(f, s, t);
    const edge = Math.min(t - s.at, i < finals.length - 1 ? s.end - t : Infinity);
    const opacity = i === 0 && t - s.at < DIP ? 1 : edge >= DIP ? 1 : 0.35 + 0.65 * Math.max(0, edge / DIP);
    const replayOf = s.label && t < s.labelUntil ? s.label : null;
    return { frame: f, replayOf, opacity };
  };
  const finish = (f: Frame, s: Segment, t: number) => {
    // The recording's possession, and its ball as the ghost outside our moments.
    const fr = Math.max(0, Math.min(s.reel.n - 1, Math.round(frameOf(s, t, hz))));
    f.possession = possAt(s.reel, fr, s.fit) ?? f.possession;
    if (f.ball && !f.beat) f.ball = { ...f.ball, ghost: true };
  };
  return {
    shotAt,
    goalsLand,
    shown,
    segments: finals.map((s) => ({ at: s.at, end: s.end, reel: s.reel.id, label: s.label ? `${s.label.minute}′ ${s.label.kind}` : null })),
  };
}
