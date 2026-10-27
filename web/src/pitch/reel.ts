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
import { dist, GOAL_HALF, HALF_L, type Side, type Vec } from "./geometry";
import { frameAt, type Frame, type FrameOptions } from "./frame";
import { isGoal, type Moment } from "./moments";
import type { BallKey, Beat, Key, Timeline, Track } from "./plan";
import type { Shot } from "./director";
import type { LiveOptions } from "./schedule";

// ---------------------------------------------------------------- the library

const BALL = 22;

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
  /** The ball as shown (see shownBall): metres, and its opacity. */
  bx: Float32Array;
  by: Float32Array;
  bz: Float32Array;
  ba: Float32Array;
  /** Frames of the recording's own goals: never shown unless one plays ours. */
  goals: number[];
  /** The last frame worth showing: a second after its ball was last shown (a recording that
   *  ends while the ball is out of play is cut there, not left with players and no ball). */
  last: number;
}

export interface Library {
  hz: number;
  reels: Reel[];
}

interface RawLibrary {
  hz: number;
  reels: (Omit<Reel, "pos" | "z" | "bx" | "by" | "bz" | "ba" | "goals" | "last"> & { pos: string; z: string })[];
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
  return {
    hz: raw.hz,
    reels: raw.reels.map((r) => {
      const pos = int16(r.pos);
      const z = int16(r.z);
      const ball = shownBall(r.n, pos, z, r.alive);
      let last = r.n - 1;
      while (last > 0 && ball.ba[last] === 0) last--;
      return { ...r, pos, z, goals: ownGoals(r, pos, z), ...ball, last: Math.min(r.n - 1, last + 5) };
    }),
  };
}

/** Frames where the recording's ball goes in: its goal events' shots, and any other ball that
 *  ends up in a net (a goal ruled out has no goal event). A net's shot is the one before it. */
function ownGoals(r: RawLibrary["reels"][number], pos: Int16Array, z: Int16Array): number[] {
  const out = new Set(r.events.filter((e) => e.kind === "shot" && e.out === "goal").map((e) => e.f));
  const inNet = (f: number) =>
    Math.abs(pos[(f * 23 + BALL) * 2]) > (HALF_L + 0.3) * 10 && Math.abs(pos[(f * 23 + BALL) * 2 + 1]) < GOAL_HALF * 10 && z[f] < 24;
  for (let f = 1; f < r.n; f++) {
    if (!inNet(f) || inNet(f - 1)) continue;
    const shot = [...r.events].reverse().find((e) => e.kind === "shot" && e.f <= f && e.f >= f - 15);
    out.add(shot ? shot.f : Math.max(0, f - 5));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * The ball as the pitch shows it. In play it's the tracked ball. Out of play the tracking can
 * hold it off the pitch where it went out, then jump it to the restart: so a dead ball shows only
 * while it's on the pitch (or rolling out, its first 0.8 s), never across a jump, and sits on the
 * restart's spot for the 4 s before a restart it would otherwise jump to. It fades in and out.
 */
function shownBall(n: number, pos: Int16Array, z: Int16Array, alive: string) {
  const bx = new Float32Array(n);
  const by = new Float32Array(n);
  const bz = new Float32Array(n);
  const vis = new Float32Array(n);
  for (let f = 0; f < n; f++) {
    bx[f] = pos[(f * 23 + BALL) * 2] / 10;
    by[f] = pos[(f * 23 + BALL) * 2 + 1] / 10;
    bz[f] = Math.max(0, z[f] / 10);
  }
  const on = (f: number) => Math.abs(bx[f]) <= HALF_L + 1 && Math.abs(by[f]) <= 35;
  const jump = (f: number) => f > 0 && Math.hypot(bx[f] - bx[f - 1], by[f] - by[f - 1]) > 3;
  const ROLL = 4; // frames at 5 Hz
  const READY = 20;
  let since = Infinity; // frames since the ball went dead
  for (let f = 0; f < n; f++) {
    since = alive[f] === "1" ? -1 : since + 1;
    vis[f] = alive[f] === "1" || since < ROLL || on(f) ? 1 : 0;
  }
  for (let f = 1; f < n; f++)
    if (jump(f) && !(alive[f] === "1" && alive[f - 1] === "1")) {
      vis[f - 1] = 0;
      if (alive[f] !== "1") vis[f] = 0;
    }
  // The restart: the ball waits on its spot, rather than jumping there as it's played.
  for (let d1 = 1; d1 < n; d1++) {
    if (alive[d1] !== "1" || alive[d1 - 1] === "1") continue;
    if (Math.hypot(bx[d1] - bx[d1 - 1], by[d1] - by[d1 - 1]) < 2 && vis[d1 - 1]) continue;
    let d0 = d1;
    while (d0 > 0 && alive[d0 - 1] !== "1") d0--;
    const from = Math.max(d0, d1 - READY);
    for (let f = from; f < d1; f++) {
      bx[f] = bx[d1];
      by[f] = by[d1];
      bz[f] = bz[d1];
      vis[f] = 1;
    }
    if (from > d0) vis[from - 1] = 0;
  }
  // Fades: up and down over two frames, never past what's visible.
  const ba = new Float32Array(vis);
  for (let f = 1; f < n; f++) ba[f] = Math.min(vis[f], ba[f - 1] + 0.5);
  for (let f = n - 2; f >= 0; f--) ba[f] = Math.min(ba[f], ba[f + 1] + 0.5);
  return { bx, by, bz, ba };
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

/** A shot really struck there: in play, the ball off at a shot's pace (DFL's shot clock can run
 *  seconds off). */
function struck(r: Reel, f: number, hz: number): boolean {
  if (r.alive[f] !== "1" || f + 2 >= r.n) return false;
  const v = Math.hypot(r.bx[f + 2] - r.bx[f], r.by[f + 2] - r.by[f]) / (2 / hz);
  return v > 8;
}

/** A clip never starts this soon (s) after the recording's own goal: its ball is still in the
 *  net, its scorers still celebrating. */
const AFTER_GOAL = 30;
/** No goal of the recording's own between these frames (except `own`, the one playing ours). */
const clear = (r: Reel, a: number, b: number, own = -1) => !r.goals.some((g) => g >= a && g <= b && g !== own);

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
        if (m.kind === "shot" && !struck(reel, ev.f, hz)) continue;
        // A real goal only ever plays one of ours; nobody else's goal shows, before or after.
        if (ev.kind === "shot" && reel.goals.includes(ev.f) && !isGoal(m)) continue;
        if (!clear(reel, ev.f - (LEAD_MAX + AFTER_GOAL) * hz, ev.f + TAIL_MIN * hz, ev.f)) continue;
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
const reelEnd = (s: Segment, hz: number) => {
  // ...or a second before the recording's own goal, unless that goal plays ours.
  const own = s.anchors.find((a) => isGoal(a.moment))?.ev.f ?? -1;
  const g = s.reel.goals.find((f) => f > s.f0 && f !== own);
  return timeOf(s, Math.min(s.reel.last, g === undefined ? Infinity : Math.max(s.f0, g - hz)), hz);
};

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

/** A keeper as recorded within KEEPER_FREE m of his goal line; further out, eased toward
 *  KEEPER_MAX (just outside his box). Real Bundesliga keepers sweep up to halfway when their side
 *  attacks, which reads as a mistake on our pitch (Ilham, 27 Oct). Never faster than recorded. */
const KEEPER_FREE = 14;
const KEEPER_MAX = 24;
function keeperHome(p: Vec, side: Side): Vec {
  const sign = side === "home" ? 1 : -1;
  const out = sign * p.x + HALF_L; // metres from his own goal line
  if (out <= KEEPER_FREE) return p;
  const span = KEEPER_MAX - KEEPER_FREE;
  const eased = KEEPER_FREE + span * Math.tanh((out - KEEPER_FREE) / span);
  return { x: sign * (eased - HALF_L), y: p.y };
}
/** How far past KEEPER_FREE a reel's keepers stand at a frame (for choosing clips). */
const keepersOut = (r: Reel, f: number) =>
  Math.max(0, r.pos[(f * 23) * 2] / 10 + HALF_L - KEEPER_FREE) + Math.max(0, HALF_L - r.pos[(f * 23 + 11) * 2] / 10 - KEEPER_FREE);

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
    const at = (f: number) => (slot.role === "GK" ? keeperHome(posAt(r, e, f, s.fit), slot.side) : posAt(r, e, f, s.fit));
    if (s.hold !== undefined) keys.push({ t: s.at, ...at(s.f0) });
    for (let f = Math.max(first, s.hold !== undefined ? s.f0 : first); f <= last; f++) {
      const p = at(held(f));
      keys.push({ t: timeOf(s, f, hz), x: p.x, y: p.y });
    }
    tracks[slot.id] = { slot, keys, offAt: off !== undefined && off < s.end ? off : null };
  }
  const entityToSlot = new Map(Object.entries(s.map).map(([id, e]) => [e, id]));

  const ball: BallKey[] = [];
  const pushBall = (t: number, p: Vec, z: number, a = 1) => ball.push({ t, x: p.x, y: p.y, z, a, ease: "linear", arc: 0 });
  // The ball as shown (shownBall), turned by the fit.
  const shown = (f: number): Vec => {
    let x = r.bx[f];
    let y = r.by[f];
    if (s.fit.rot) {
      x = -x;
      y = -y;
    }
    return { x, y: s.fit.mir ? -y : y };
  };
  if (s.hold !== undefined) pushBall(s.at, shown(s.f0), r.bz[s.f0], r.ba[s.f0]);
  // A goal the recording didn't score: from the real strike our shot flies on into the net.
  const goal = s.anchors.find((a) => isGoal(a.moment) && a.ev.out !== "goal");
  for (let f = Math.max(first, s.hold !== undefined ? s.f0 : first); f <= last; f++) {
    const t = timeOf(s, f, hz);
    if (goal && t > goal.t) break;
    pushBall(t, shown(held(f)), r.bz[held(f)], r.ba[held(f)]);
  }
  let goalLand: number | null = null;
  if (goal) {
    const strike = posAt(r, BALL, goal.ev.f, s.fit);
    const to = goal.moment.to ?? { x: Math.sign(strike.x) * (HALF_L + 1.2), y: 0 };
    goalLand = goal.t + Math.max(0.35, dist(strike, to) / SHOT_SPEED);
    pushBall(goalLand, to, 0.8);
    pushBall(Math.max(s.end, goalLand) + 0.5, to, 0);
  }

  // Where a touch's ball goes: a shot over the line or to the first frame it's stopped or
  // touched; a pass to the next touch.
  const flight = (ev: RealEvent, shot: boolean): { land: number; to: Vec } => {
    let f = ev.f + 1;
    if (shot) {
      const lim = Math.min(r.n - 1, ev.f + Math.round(2.2 * hz));
      for (; f < lim; f++) {
        const p = posAt(r, BALL, f, s.fit);
        if (Math.abs(p.x) >= HALF_L || dist(p, posAt(r, BALL, f - 1, s.fit)) < 0.6) break;
      }
    } else {
      const next = r.events.find((e) => e.f > ev.f && e.kind !== "card" && e.kind !== "foul");
      f = Math.min(r.n - 1, next ? next.f : ev.f + Math.round(1.5 * hz));
    }
    return { land: timeOf(s, f, hz), to: posAt(r, BALL, f, s.fit) };
  };
  const keepersOutOf = (e: number, f: number) => {
    const p = posAt(r, e, f, s.fit);
    return dist(p, keeperHome(p, sideOf(e, s.fit)));
  };
  // Our keeper of a side (a saved shot is his to gather).
  const keeperOf = (side: Side) => slots.find((x) => x.side === side && x.role === "GK" && tracks[x.id])?.id ?? null;

  const beats: Beat[] = s.anchors.map((a) => {
    const m = a.moment;
    const from = posAt(r, BALL, a.ev.f, s.fit);
    let land = a.t + 0.5;
    let to: Vec | null = null;
    if (m.kind === "shot" && a === goal && goalLand !== null) {
      land = goalLand;
      to = m.to;
    } else if (m.kind === "shot" || m.kind === "pass" || m.kind === "corner") {
      ({ land, to } = flight(a.ev, m.kind === "shot"));
    }
    const receiver =
      (m.kind === "pass" || m.kind === "corner") && a.ev.to !== null && a.ev.ok
        ? entityToSlot.get(a.ev.to) ?? null
        : m.kind === "shot" && m.outcome === "saved"
          ? keeperOf(other(m.side))
          : null;
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

  // The recording's own touches between ours: bodies kick, control, dive and gather on them, as
  // ghosts (no names, no pass line: they aren't our events).
  const lo = Math.floor(frameOf(s, s.at, hz));
  const hi = Math.ceil(frameOf(s, s.end, hz));
  for (const ev of r.events) {
    if (ev.f < lo || ev.f > hi || ev.by === null || ev.kind === "throwin" || ev.kind === "tackle" || ev.kind === "foul" || ev.kind === "card") continue;
    if (s.anchors.some((a) => Math.abs(a.ev.f - ev.f) <= 3)) continue;
    if (r.alive[ev.f] !== "1" || touchFrame(r, ev, ev.by, hz).gap > 2) continue;
    const shot = ev.kind === "shot";
    if (shot && (!struck(r, ev.f, hz) || r.goals.includes(ev.f))) continue;
    const actor = entityToSlot.get(ev.by);
    if (!actor) continue;
    if (tracks[actor]?.slot.role === "GK" && keepersOutOf(ev.by, ev.f) > 1) continue;
    const side = sideOf(ev.by, s.fit);
    const touch = timeOf(s, ev.f, hz);
    const { land, to } = flight(ev, shot);
    const kind: Moment["kind"] = shot ? "shot" : ev.kind === "corner" ? "corner" : "pass";
    const outcome = shot ? ({ saved: "saved", blocked: "blocked" } as Record<string, string>)[ev.out ?? ""] ?? "off_target" : ev.ok ? "complete" : "incomplete";
    const receiver = shot
      ? outcome === "saved"
        ? keeperOf(other(side))
        : null
      : ev.ok && ev.to !== null
        ? entityToSlot.get(ev.to) ?? null
        : null;
    beats.push({
      moment: {
        id: `real:${r.id}:${ev.f}`, eventIds: [], t: 0, minute: 0, kind, side, player: "", outcome,
        from: posAt(r, BALL, ev.f, s.fit), to, speed: 15, winner: null, pressed: false, assistTo: null, priority: 9,
      },
      s: touch - 0.45,
      touch,
      land,
      end: Math.min(s.end, land + 0.3),
      ideal: touch,
      actor,
      receiver,
      winnerShown: false,
      ghost: true,
    });
  }

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
  segments: { at: number; end: number; reel: string; label: string | null; f0: number; hold: number | null }[];
}

const DIP = 0.18;
/** Real events where somebody plays the ball. */
const TOUCHES = new Set<RealEvent["kind"]>(["pass", "shot", "corner", "goalkick", "freekick", "kickoff", "throwin", "tackle"]);
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
  /** A cut at a quiet instant near `t`: at or before it back to `earliest`, else after it up to
   *  `latest`. Quiet: nobody touches the ball from 1 s before to 1.5 s after (a run-up and swing), and
   *  the ball is slow, so a kick is never cut mid-swing or mid-flight. `t` itself if there's none. From the
   *  segment alone (causal). */
  const quiet = (s: Segment, t: number, earliest: number, latest = t) => {
    const r = s.reel;
    const touches = r.events.filter((e) => TOUCHES.has(e.kind)).map((e) => timeOf(s, e.f, hz));
    // A restart is struck when the ball comes back into play (set pieces' clocks run early).
    for (let f = 1; f < r.n; f++) if (r.alive[f] === "1" && r.alive[f - 1] !== "1") touches.push(timeOf(s, f, hz));
    const slow = (f: number) => f < 1 || f >= r.n || Math.hypot(r.bx[f] - r.bx[f - 1], r.by[f] - r.by[f - 1]) * hz < 6;
    const calm = (u: number) => {
      if (touches.some((x) => x > u - 1 && x < u + 1.5)) return false;
      const f = Math.round(frameOf(s, u, hz));
      if (f < 1 || f >= r.n) return false;
      return slow(f) && slow(f + 3);
    };
    for (let u = t; u >= earliest; u -= 0.2) if (calm(u)) return u;
    for (let u = t + 0.2; u <= latest; u += 0.2) if (calm(u)) return u;
    return t;
  };

  const fill = (upto: number) => {
    for (let guard = 0; guard < 200; guard++) {
      const s = segs[segs.length - 1];
      const end = reelEnd(s, hz) - 0.4;
      if (end >= upto) return;
      // Out of recording: cut in its last 8 s at a quiet instant, after any moment of ours in it.
      const out = quiet(s, end, Math.max(end - 15, s.at + 2, ...s.anchors.map((a) => a.t + 2.5)));
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
        if (reel.alive[g] !== "1" || !clear(reel, g - AFTER_GOAL * hz, g + 20 * hz)) continue;
        for (const fit of FITS) {
          let cost = dist(posAt(reel, BALL, g, fit), ball) + (possAt(reel, g, fit) === side ? 0 : 15) + 0.5 * keepersOut(reel, g);
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
    const brk0 = Math.max(busy, end45 + tick);
    let second = Infinity;
    for (const [mm, a] of o.arrivals) if (mm > 45) second = Math.min(second, a);
    fill(brk0);
    const prev = segs[segs.length - 1];
    const brk = quiet(prev, brk0, brk0, Math.min(brk0 + 2, reelEnd(prev, hz) - 0.4));
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
      // A little later if that lands mid-kick in the play on screen (a goal waits less).
      const prev = segs[segs.length - 1];
      at = quiet(prev, at, at, Math.min(at + (goal ? 0.8 : 1.5), reelEnd(prev, hz) - 0.4));
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
      if (m.kind === "shot" && (!(SHOT_OUT[m.outcome] ?? []).includes(ev.out ?? "") || !struck(cur.reel, ev.f, hz))) continue;
      if (cur.reel.goals.includes(ev.f) && !isGoal(m)) continue;
      if (t > reelEnd(cur, hz)) continue;
      fill(t); // (no-op: the recording reaches t)
      cur.anchors.push({ moment: m, ev, toucher, t });
      shown.push({ moment: m, t, spot, actor: slot.id, highlight: false });
      busy = t + 1.5;
      done = true;
      break;
    }
    if (!done) {
      const at0 = Math.max(k, busy, want - LEAD_X1);
      const c = candidates(lib, m, slot.role, used, ballNow(at0))[0];
      if (!c) continue;
      use(c);
      // The recording on screen runs out first: cut straight to this clip, leading in longer,
      // rather than to a filler for a moment and then again.
      const ending = reelEnd(cur, hz) - 0.4;
      const straight = ending < at0 && ending >= Math.max(k, busy) && want - ending <= LEAD_MAX;
      if (!straight) fill(at0);
      // Up to 2 s early, so the cut lands at a quiet instant of the play it leaves.
      const prev = segs[segs.length - 1];
      const t0 = straight ? ending : at0;
      const at = quiet(
        prev,
        t0,
        Math.max(k, busy, t0 - 2, prev.at + 1, ...prev.anchors.map((a) => a.t + 2.5)),
        Math.min(t0 + 1, want - 1.5, reelEnd(prev, hz) - 0.4),
      );
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
      const back = quiet(s, Math.min(land + CELEBRATE, reelEnd(s, hz) - 0.4), land + 4);
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
    if (f.ball && (!f.beat || f.beat.ghost)) f.ball = { ...f.ball, ghost: true };
  };
  return {
    shotAt,
    goalsLand,
    shown,
    segments: finals.map((s) => ({ at: s.at, end: s.end, reel: s.reel.id, label: s.label ? `${s.label.minute}′ ${s.label.kind}` : null, f0: s.f0, hold: s.hold ?? null })),
  };
}
