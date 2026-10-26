// The choreography: moments in, a timeline of keyframes out (22 players and the ball).
// Pure and deterministic, so the lab and the tests can freeze any instant.
//
// The rules (web/PITCH.md has the why):
//   - The pitch plays one moment at a time, at real speed: the player comes to the ball at the
//     event's real spot, the ball travels along the real pass at its real speed, the receiver
//     (or the real tackler) meets it. Between moments the ball fades out; the teams reshape.
//   - A moment plays at its ideal time (from the clock) or, if a player can't get there at a
//     run, later. A filler moment that would run too late is skipped (never moved or invented).
//     Forced moments (at ×1: goals, cards, shots, corners, fouls) always play, and may cut the
//     moment before them short. Faster than ×2 nothing is forced (see isForced).
//   - Nobody runs faster than V_ACTOR; everyone else moves at most V_RUN.
//   - Players move like players (web/PITCH.md, "Speeds"): stepped every SUB seconds, each one
//     reacts to a new picture after his own delay, stands within a deadband of his spot, else
//     walks, jogs or runs by the gap and the urgency, and speeds up and slows down at human rates.
//     A player who must be somewhere at a given instant (on the ball, meeting a pass) gets there
//     exactly, on a smooth run that starts from his current speed.
//   - Between real moments the ball keeps moving, drawn as a "ghost" (illustrative): its holder
//     carries it, passes on to a teammate who meets it, and the nearest opponent presses him;
//     the shape follows it. Before a real moment it's played to the real spot, landing as the
//     real ball shows. Nothing here depends on a moment before it is known.

import { attackSign, clampToPitch, dist, HALF_L, HALF_W, own, type Side, type Vec } from "./geometry";
import { allSlots, kickoffAt, slotId, teamJobs, wander, type Pace, type Role, type Slot, type SquadPlayer } from "./formation";
import { hash01, isGoal, type Moment } from "./moments";

export interface Key {
  t: number;
  x: number;
  y: number;
}

export interface Track {
  slot: Slot;
  keys: Key[];
  /** Display time the player leaves the pitch (a red card), or null. */
  offAt: number | null;
}

export interface BallKey {
  t: number;
  x: number;
  y: number;
  /** Opacity 0–1: the ball fades out between moments. */
  a: number;
  /** How the segment that ends at this key moves: a pass slows ("out"), a shot doesn't. */
  ease: "hold" | "linear" | "out";
  /** Peak height (m) of the segment that ends here: lofted long passes. */
  arc: number;
  /** Measured height (m) at this key (real tracking, real.ts): a segment whose ends both have
   *  one goes linearly between them, instead of the arc. */
  z?: number;
  /** The segment that ends here is a carry: the ball sits at this player's feet. */
  follow?: string;
}

export interface Beat {
  moment: Moment;
  /** Display seconds: the approach starts, the touch (ball at the event's real spot), the ball
   *  lands, the moment ends. */
  s: number;
  touch: number;
  land: number;
  end: number;
  ideal: number;
  actor: string;
  receiver: string | null;
  /** The real tackler/interceptor got there and is the one shown winning the ball. */
  winnerShown: boolean;
}

/** One stretch of the ghost ball: at a player's feet, or in flight. A flight with no `from`
 *  starts where the stretch before it leaves the ball (his feet, or still easing onto them); one
 *  cut short keeps its pace and vanishes at `gone`. */
export type GhostSeg =
  | { kind: "carry"; t0: number; t1: number; by: string; blendFrom?: Vec; blendTill?: number }
  | { kind: "fly"; t0: number; t1: number; from: Vec | null; to: Vec; gone?: number };

export interface Timeline {
  tracks: Record<string, Track>;
  ball: BallKey[];
  /** The ghost ball between real moments, in time order (continuous play). */
  ghost: GhostSeg[];
  beats: Beat[];
  dropped: { moment: Moment; reason: string }[];
  start: number;
  end: number;
  /** Where the ball is, and who has it, in the starting picture (continuous play starts here). */
  initialBall: { at: Vec; side: Side };
}

export interface PlanOptions {
  /** Display time each moment would ideally touch; null = not known yet (not planned). */
  ideal: (m: Moment) => number | null;
  /** Times faster than real time; decides what's forced and how late a filler may run. */
  speed: number;
  /** Display time a moment became known (its tick arrived). The plan never uses a moment
   *  before then, so planning again after a new tick never changes what was already shown.
   *  Default: known from the start (a replay). */
  known?: (m: Moment) => number;
  /** Display time of the first frame. */
  start: number;
  /** The starting picture: kick-off, or the shape around a ball. */
  initial: { kind: "kickoff"; kicking: Side } | { kind: "shape"; ball: Vec; side: Side };
  /** Starting spots for named players (slot id → world), over the shape: a replay cut starts
   *  with its player a few strides from the ball. */
  place?: Record<string, Vec>;
  /** Live: plan at least this far (display time), past when the next tick can arrive. Play goes
   *  on between moments, so a plan that ended early would freeze the picture until then. */
  until?: number;
  /** Live: carry on from an earlier plan of the same session instead of from the start. Its
   *  moments must all be in this one, and every moment new here known no earlier than `after`.
   *  Planning is causal, so everything that earlier plan did before `after` stands; this picks
   *  up from its last checkpoint that nothing new could have changed (same result, a fraction of
   *  the work: the live page replans on every tick). */
  resume?: { from: Timeline; after: number };
}

/** Who has the ghost (from `since`, passing on at `until`), or the pass on its way to `recv`. */
interface Ill {
  by: string;
  side: Side;
  since: number;
  until: number;
  fly: { to: Vec; till: number; recv: string } | null;
  carry: GhostSeg | null;
  /** Before `since` (a dead ball): the picture everyone settles into. */
  wait?: { at: Record<string, Vec>; pace: Record<string, Pace> };
}

/** The planner's state at the start of a moment's turn (see PlanOptions.resume). */
interface Checkpoint {
  /** The furthest (display time) any earlier turn looked or moved to. */
  reach: number;
  cursor: number;
  zone: Vec;
  lastPoss: Side | null;
  lastBall: Vec;
  legNo: number;
  pos: Record<string, Vec>;
  aim: Record<string, Vec>;
  active: string[];
  offAt: Record<string, number | null>;
  VX: Float64Array;
  VY: Float64Array;
  standing: Uint8Array;
  waiting: Float64Array;
  going: [string, { due: number; v1: number }][];
  /** Each track's length then, and its last key as it was (merging may move it later). */
  keys: Record<string, { n: number; last: Key | null }>;
  ghostN: number;
  /** The ghost's holder, with copies of the segments he may still change. */
  ill: { state: Omit<Ill, "carry">; carryAt: number; carry: GhostSeg | null; flyAt: number; fly: GhostSeg | null } | null;
  pending: { by: string; side: Side; from: Vec; delay: number } | null;
  beatsN: number;
  droppedN: number;
  prev: Beat | null;
  prevHold: Record<string, Vec>;
  prevPace: Record<string, Pace>;
  /** The queue still to go, by moment id, in its order then. */
  queue: string[];
}
/** Per plan: its last few checkpoints and every moment id it queued. */
const checkpoints = new WeakMap<Timeline, { cps: Checkpoint[]; queued: Set<string> }>();
const KEEP_CPS = 24;

/** Average m/s over a leg. The curve between keys peaks at up to 1.5× the average, so these
 *  keep the fastest dot under a sprint (9 m/s): a run for the shape, a sprint to the ball. */
export const V_RUN = 5;
export const V_ACTOR = 6;
const V_RECEIVE = 6;
/** A player with a forced moment coming starts drifting to its spot this early (a run). */
const PRE_RUN = 8;
/** The ball shows at the spot this long before the touch. */
export const LEAD = 0.45;
const FADE = 0.25;
const HOLD = { pass: 0.9, shot: 1.1, goal: 2.4, foul: 1.4, card: 1.6, corner: 1.8 } as const;
const RESET = 3.2;
/** After a goal: the scorer is mobbed this long before everyone heads back. */
const GOAL_MOB = 1.6;

/** The movement model. Gaits in m/s: the typical speed inside each real speed band (DFL,
 *  real/stats.json "gait": walk 1.35, jog 2.93, run 4.64). */
export const GAIT = { walk: 1.35, jog: 2.9, run: 4.6 } as const;
/** Simulation step (s): a key every step while a player moves. */
const SUB = 0.2;
/** Within this of his spot a standing player stays put (near the ball; up to FAR_BAND far
 *  from it); a moving one stops this close. Real players stand 2–10% of the time (DFL): they
 *  keep adjusting, so the bands are tight. */
export const DEADBAND = 1.5;
const FAR_BAND = 4;
const STOP = 0.6;
/** m/s² speeding up and slowing down: 0 to a run takes about 1.5 s. Real players (DFL, over
 *  0.2 s): speeding up p90 2.1, p99 4.2; braking p90 2.2, p99 5.1. */
const ACC = 3;
const DEC = 4.5;
/** Reaction to a new picture (s): this per role, plus up to 0.4 more per player. */
const REACT: Record<Role, number> = { GK: 0.2, DF: 0.3, MF: 0.35, FW: 0.4 };
/** Seconds of settling planned after a live plan's last moment, beyond a tick's length. */
const SETTLE = 5;
/** A ball switched across the pitch this far (m) makes the shape hurry. */
const SWITCH = 25;

/** The ghost: a holder keeps it about this long (real receivers 0.7–2.4 s, median 1.35, DFL);
 *  passes go 8–32 m at a real pass's speed for their length; none faster than GHOST_MAX. */
const KEEP = 1.35;
export const passSpeed = (d: number) => 4.9 + 0.19 * d;
const GHOST_MAX = 20;
/** A dead ball (wide, a foul) is set up this long before play goes on; a kick-off this long
 *  after the goal's mob. */
const DEAD = 1.2;
const KICKOFF = 4;
/** The ghost sits a stride ahead of its holder, kept 0.3 m inside the lines. */
export const feetOf = (p: Vec, side: Side): Vec => ({
  x: Math.max(-HALF_L + 0.3, Math.min(HALF_L - 0.3, p.x + attackSign(side) * 0.6)),
  y: Math.max(-HALF_W + 0.3, Math.min(HALF_W - 0.3, p.y)),
});

/** A long approach is re-pictured this often (s). */
const REPICTURE = 1.2;

/** At ×60 the ball rests for less: more of the match fits. */
const FAST_HOLD = 0.6;
let holdScale = 1;
const holdOf = (m: Moment) => (isGoal(m) ? HOLD.goal : HOLD[m.kind] * holdScale);
const lerp = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** Length of (x, y). Math.hypot is slow, and the planner steps every player every SUB. */
const len = (x: number, y: number) => Math.sqrt(x * x + y * y);

/** b sits on the straight, steady line from a to (t, x, y) (within 2 cm): its ends say it all. */
const steady = (a: Key, b: Key, t: number, x: number, y: number) => {
  const k = (b.t - a.t) / Math.max(1e-9, t - a.t);
  return len(a.x + (x - a.x) * k - b.x, a.y + (y - a.y) * k - b.y) < 0.02;
};

function toward(p: Vec, target: Vec, maxD: number): Vec {
  const d = dist(p, target);
  if (d <= maxD || d < 1e-9) return { ...target };
  const k = maxD / d;
  return { x: p.x + (target.x - p.x) * k, y: p.y + (target.y - p.y) * k };
}

/**
 * Is this moment always shown at this speed? At ×1 everything but a plain pass. Faster, nothing:
 * real-speed play can't keep up with a minute a second, so the live flow only takes what fits,
 * and goals and cards get their own replay (schedule.ts) instead.
 */
export function isForced(m: Moment, speed: number): boolean {
  return speed <= 2 && m.kind !== "pass";
}

/** Corner set-up spots, in the attacking team's own frame (goal at +x). */
const CORNER_ATT = [
  [HALF_L - 7, -5],
  [HALF_L - 9, 1],
  [HALF_L - 7, 6],
  [HALF_L - 13, -3],
  [HALF_L - 14, 7],
];
const CORNER_DEF = [
  [HALF_L - 5, -3.5],
  [HALF_L - 5, 2.5],
  [HALF_L - 8, -1],
  [HALF_L - 8, 5],
  [HALF_L - 11, -6],
  [HALF_L - 3, 5],
];

export function plan(players: SquadPlayer[], moments: Moment[], opts: PlanOptions): Timeline {
  const slots = allSlots(players);
  const tracks: Record<string, Track> = {};
  for (const s of slots) tracks[s.id] = { slot: s, keys: [], offAt: null };
  const pos: Record<string, Vec> = {};
  const active = new Set(slots.map((s) => s.id));

  const init = opts.initial;
  let zone: Vec = init.kind === "kickoff" ? { x: 0, y: 0 } : init.ball;
  for (const s of slots) if (init.kind === "kickoff") pos[s.id] = kickoffAt(s, s.side === init.kicking);
  if (init.kind === "shape")
    for (const side of ["home", "away"] as Side[]) {
      const jobs = teamJobs(slots.filter((s) => s.side === side), init.ball, side === init.side);
      for (const id in jobs) pos[id] = jobs[id].at;
    }
  for (const id in opts.place ?? {}) if (pos[id]) pos[id] = { ...opts.place![id] };

  // The movement model's state, per slot (index): velocity, standing in his deadband, the spot he
  // is acting on (`aim`: he reacts to a new one after his delay), and from hash01 his reaction
  // delay and his tempo (0.9–1.1× the gait speeds). Flat arrays: the planner steps every
  // player every SUB seconds of the match, and replans on every tick.
  const index: Record<string, number> = {};
  slots.forEach((s, i) => (index[s.id] = i));
  const VX = new Float64Array(slots.length);
  const VY = new Float64Array(slots.length);
  const standing = new Uint8Array(slots.length).fill(1);
  /** Since when a player has had a picture he hasn't taken in yet (NaN: none). His delay runs
   *  from there, across phases: a run of short phases can't keep resetting it. */
  const waiting = new Float64Array(slots.length).fill(NaN);
  const react = slots.map((s) => REACT[s.role] + 0.4 * hash01(`${s.id}:react`));
  const tempo = slots.map((s) => 0.9 + 0.2 * hash01(`${s.id}:tempo`));
  const seed = slots.map((s) => hash01(`${s.id}:bend`));
  const aim: Record<string, Vec> = {};
  for (const s of slots) aim[s.id] = { ...pos[s.id] };

  let cursor = opts.start;
  /** Keys at t for everyone on the pitch. A key on a straight, steady line between its
   *  neighbours (standing still included) is merged away, so a standing player costs two keys. */
  const key = (keys: Key[], t: number, x: number, y: number) => {
    const n = keys.length;
    const last = keys[n - 1];
    if (n && (t - last.t < 1e-3 || (n >= 2 && steady(keys[n - 2], last, t, x, y)))) {
      last.t = t;
      last.x = x;
      last.y = y;
    } else keys.push({ t, x, y });
  };
  const write = (t: number) => {
    for (const id of active) key(tracks[id].keys, t, pos[id].x, pos[id].y);
  };
  write(cursor);

  const live = () => slots.filter((s) => active.has(s.id));
  const nearest = (side: Side, at: Vec, n: number, except: Set<string>, outfield = true) =>
    live()
      .filter((s) => s.side === side && !except.has(s.id) && (!outfield || s.role !== "GK"))
      .sort((a, b) => dist(pos[a.id], at) - dist(pos[b.id], at))
      .slice(0, n);

  // Forced moments still to come, for the pre-run (filled once the queue is built).
  let upcoming: { actor: string; spot: Vec; ideal: number; known: number }[] = [];

  const PACE: Record<Pace, number> = { slow: 0, auto: 1, urgent: 2 };
  /** The gait for a gap (m) at a pace (PACE), before the player's tempo. */
  const gaitFor = (gap: number, pace: number, cap: number) =>
    pace === 0
      ? gap < 12 ? GAIT.walk : GAIT.jog
      : pace === 2
        ? gap < 4 ? GAIT.jog : cap > V_RUN && gap > 8 ? cap : GAIT.run
        : gap < 6 ? GAIT.walk : gap < 18 ? GAIT.jog : GAIT.run;

  /** Committed runs to a due spot: when it's due and the speed it arrives with. */
  const going = new Map<string, { due: number; v1: number }>();
  let legNo = 0;

  interface Leg {
    /** Display time a player must be on his target (and not before). */
    due?: Record<string, number>;
    pace?: Record<string, Pace>;
  }

  /**
   * Move everyone toward their targets for dt, stepped (keys every SUB), keeping at least 2 m
   * apart. Pinned and due players react at once; the rest after their own delay.
   *
   * A free player stands in his deadband, else goes at the gait for his gap and pace, slowing
   * to arrive, his run bent one way or the other (15–55°, a new bend each picture) and
   * straightening near the spot: players arc their runs rather than slide along rails.
   *
   * A player due on his spot at a given time (on the ball, meeting a pass), once it's time to go
   * at a natural pace (or the run gets tight), runs a smooth curve from his current speed that
   * lands exactly on time, still moving a little (up to 3 m/s: onto the ball, into the pass).
   * Out of reach, he chases freely instead.
   */
  const step = (targets: Record<string, Vec>, dt: number, caps: Record<string, number>, pinned: Set<string>, leg: Leg = {}) => {
    const ids = [...active];
    // The pre-run: someone with a forced moment soon heads for it, more strongly as it nears.
    const tEnd = cursor + Math.max(0, dt);
    for (const u of upcoming) {
      if (u.known > cursor || u.ideal <= tEnd || u.ideal > tEnd + PRE_RUN || pinned.has(u.actor) || !targets[u.actor]) continue;
      const k = Math.min(0.85, 1 - (u.ideal - tEnd) / PRE_RUN);
      targets[u.actor] = lerp(targets[u.actor], u.spot, k);
    }
    // Separation on the targets, two passes; pinned players (on the ball) don't yield.
    const n = ids.length;
    const tg = ids.map((id) => targets[id]);
    const pin = ids.map((id) => pinned.has(id));
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < n; a++)
        for (let b = a + 1; b < n; b++) {
          const A = tg[a];
          const B = tg[b];
          if (!A || !B || (pin[a] && pin[b]) || Math.abs(A.x - B.x) >= 2 || Math.abs(A.y - B.y) >= 2) continue;
          const d = dist(A, B);
          if (d >= 2 || d < 1e-6) continue;
          const push = (2 - d) / 2;
          const ux = (B.x - A.x) / d;
          const uy = (B.y - A.y) / d;
          const ka = pin[a] ? 0 : pin[b] ? 2 : 1;
          const kb = pin[b] ? 0 : pin[a] ? 2 : 1;
          tg[a] = { x: A.x - ux * push * ka, y: A.y - uy * push * ka };
          tg[b] = { x: B.x + ux * push * kb, y: B.y + uy * push * kb };
        }
    }
    const I = ids.map((id) => index[id]);
    const px = ids.map((id) => pos[id].x);
    const py = ids.map((id) => pos[id].y);
    const goalNew = ids.map((id, k) => clampToPitch(tg[k] ?? aim[id]));
    const keys = ids.map((id) => tracks[id].keys);
    const goalOld = ids.map((id) => clampToPitch(aim[id]));
    const cap = ids.map((id) => Math.min(caps[id] ?? V_RUN, V_ACTOR));
    const due = ids.map((id) => leg.due?.[id] ?? NaN);
    const pace = ids.map((id, k) => PACE[leg.pace?.[id] ?? (Number.isNaN(due[k]) ? "auto" : "urgent")]);
    const now = ids.map((_, k) => pin[k] || !Number.isNaN(due[k]));
    legNo++;
    const bend = I.map((i) => {
      const hb = (seed[i] + legNo * 0.618034) % 1; // a new, well-spread draw each picture
      // 5–25°: real teams move more together than apart (co-movement 60–70%, DFL).
      return (hb < 0.5 ? -1 : 1) * (0.09 + 0.35 * Math.abs(2 * hb - 1));
    });

    /** One step toward a due spot; false: not yet, or out of reach. */
    const dueStep = (k: number, gx: number, gy: number, h: number, t: number): boolean => {
      const id = ids[k];
      const i = I[k];
      const left = due[k] - t;
      const gap = len(gx - px[k], gy - py[k]);
      if (going.get(id)?.due !== due[k]) {
        if (gap > cap[k] * left + 0.05) return false;
        if (left > Math.max(gap / gaitFor(gap, 1, cap[k]), 0.5) && gap < 0.6 * cap[k] * left) return false;
        going.set(id, { due: due[k], v1: Math.min(gap / left, 3) });
      }
      const v1 = going.get(id)!.v1;
      const ux = gap > 1e-6 ? (gx - px[k]) / gap : 0;
      const uy = gap > 1e-6 ? (gy - py[k]) / gap : 0;
      standing[i] = 0;
      if (left <= h + 1e-9) {
        px[k] = gx;
        py[k] = gy;
        VX[i] = ux * v1;
        VY[i] = uy * v1;
        return true;
      }
      const u = h / left;
      // Up to 3× the average: about the most a run can start with and still not pass the spot.
      const v0 = clamp(VX[i] * ux + VY[i] * uy, 0, (3 * gap) / left);
      // Cubic Hermite along the line: from his speed now to v1 on the spot at `due`.
      const s = (u * u * u - 2 * u * u + u) * v0 * left + (-2 * u * u * u + 3 * u * u) * gap + (u * u * u - u * u) * v1 * left;
      const ds = ((3 * u * u - 4 * u + 1) * v0 * left + (-6 * u * u + 6 * u) * gap + (3 * u * u - 2 * u) * v1 * left) / left;
      px[k] += ux * s;
      py[k] += uy * s;
      VX[i] = ux * ds;
      VY[i] = uy * ds;
      return true;
    };

    /** One free step: stand in the deadband, else the gait, slowing to arrive, bent. */
    const freeStep = (k: number, gx: number, gy: number, h: number) => {
      const i = I[k];
      const gap = len(gx - px[k], gy - py[k]);
      if (standing[i] && gap <= DEADBAND) return; // inside any deadband: stays put
      const vx = VX[i];
      const vy = VY[i];
      const speed = len(vx, vy);
      let want = 0;
      // The deadband widens away from the ball: far from play, a player lets small shifts go.
      const band = DEADBAND + (FAR_BAND - DEADBAND) * clamp((len(px[k] - lastBall.x, py[k] - lastBall.y) - 10) / 20, 0, 1);
      if (gap > (standing[i] ? band : STOP))
        want = Math.min(gaitFor(gap, pace[k], cap[k]) * tempo[i], cap[k], Math.sqrt(2 * DEC * Math.max(0, gap - STOP / 2)));
      const a = bend[k] * clamp((gap - 1.5) / 5, 0, 1);
      const ex = gap > 1e-6 ? (gx - px[k]) / gap : 0;
      const ey = gap > 1e-6 ? (gy - py[k]) / gap : 0;
      const c = Math.cos(a);
      const sn = Math.sin(a);
      let dx = (ex * c - ey * sn) * want - vx;
      let dy = (ex * sn + ey * c) * want - vy;
      const lim = (want < speed ? DEC : ACC) * h;
      const dn = len(dx, dy);
      if (dn > lim) {
        dx *= lim / dn;
        dy *= lim / dn;
      }
      let nx = vx + dx;
      let ny = vy + dy;
      const ns = len(nx, ny);
      if (ns > cap[k]) {
        nx *= cap[k] / ns;
        ny *= cap[k] / ns;
      }
      if (want === 0 && ns < 0.3) {
        standing[i] = 1;
        VX[i] = 0;
        VY[i] = 0;
        return;
      }
      standing[i] = 0;
      VX[i] = nx;
      VY[i] = ny;
      px[k] = clamp(px[k] + nx * h, -HALF_L - 0.5, HALF_L + 0.5);
      py[k] = clamp(py[k] + ny * h, -HALF_W - 0.5, HALF_W + 0.5);
    };

    const t0 = cursor;
    const t1 = cursor + Math.max(0, dt);
    for (let t = t0; t < t1 - 1e-6; ) {
      const h = Math.min(SUB, t1 - t);
      for (let k = 0; k < n; k++) {
        if (!now[k] && t - (Number.isNaN(waiting[I[k]]) ? t0 : waiting[I[k]]) >= react[I[k]] - 1e-9) now[k] = true;
        const g = now[k] ? goalNew[k] : goalOld[k];
        if (!Number.isNaN(due[k]) && dueStep(k, g.x, g.y, h, t)) continue;
        freeStep(k, g.x, g.y, h);
      }
      t += h;
      for (let k = 0; k < n; k++) key(keys[k], t, px[k], py[k]);
      // Everyone has reacted and stands, nobody is due: nothing moves until the next picture.
      let still = true;
      for (let k = 0; k < n && still; k++) still = now[k] && standing[I[k]] === 1 && Number.isNaN(due[k]);
      if (still) {
        for (let k = 0; k < n; k++) key(keys[k], t1, px[k], py[k]);
        break;
      }
    }
    for (let k = 0; k < n; k++) {
      pos[ids[k]] = { x: px[k], y: py[k] };
      if (now[k]) {
        aim[ids[k]] = goalNew[k];
        waiting[I[k]] = NaN;
      } else if (Number.isNaN(waiting[I[k]])) waiting[I[k]] = t0;
    }
  };

  let lastPoss: Side | null = init.kind === "kickoff" ? init.kicking : init.side;
  let lastBall: Vec = zone;
  /** The shape around a ball with each player's job and pace (formation.ts). A turnover or a
   *  switch of play hurries anyone far from his spot; the side without the ball recovers goal
   *  side at a run. */
  const shape = (ball: Vec, poss: Side) => {
    const at: Record<string, Vec> = {};
    const pace: Record<string, Pace> = {};
    for (const side of ["home", "away"] as Side[]) {
      const jobs = teamJobs(live().filter((s) => s.side === side), ball, side === poss);
      for (const id in jobs) {
        // Each player wanders off his spot as real players do (formation.ts, wander), aimed a
        // second ahead.
        const w = own(side, wander(tracks[id].slot, cursor + 1, side === poss)); // own() just flips
        at[id] = clampToPitch({ x: jobs[id].at.x + w.x, y: jobs[id].at.y + w.y }, -1);
        pace[id] = jobs[id].pace;
      }
    }
    const hurry = poss !== lastPoss || Math.abs(ball.y - lastBall.y) > SWITCH;
    for (const s of live()) {
      // The side without the ball leaves its forwards up, for the counter.
      if (s.side !== poss && s.role === "FW") pace[s.id] = "slow";
      if (s.role === "GK" || dist(pos[s.id], at[s.id]) < 12) continue;
      const behind = s.side !== poss && s.role !== "FW" && own(s.side, pos[s.id]).x > own(s.side, ball).x + 3;
      if (hurry || behind) pace[s.id] = "urgent";
    }
    lastPoss = poss;
    lastBall = ball;
    return { at, pace };
  };

  // ---- the ghost ball between real moments ----
  const ghost: GhostSeg[] = [];
  let ill: Ill | null = null;
  /** Who takes over once the real ball's moment ends, and after how long a dead ball. */
  let pending: { by: string; side: Side; from: Vec; delay: number } | null = null;
  const keepFor = (id: string, t: number) => KEEP * (0.6 + 0.8 * hash01(`${id}:${t.toFixed(1)}:keep`));
  /** `by` has the ghost from t, easing onto his feet from `from`. */
  const takes = (by: string, side: Side, from: Vec, t: number, wait?: Ill["wait"]) => {
    const blendTill = t + Math.max(0.3, dist(from, feetOf(pos[by], side)) / 12);
    // He keeps it a moment once it's at his feet.
    const carry: GhostSeg = { kind: "carry", t0: t, t1: Math.max(t + keepFor(by, t), blendTill + 0.4), by, blendFrom: from, blendTill };
    ghost.push(carry);
    ill = { by, side, since: t, until: carry.t1, fly: null, carry, wait };
  };
  /** Steps everyone to `end` toward a picture, and writes the keys. */
  const run = (targets: Record<string, Vec>, end: number, caps: Record<string, number>, pinned: Set<string>, leg: Leg) => {
    if (end <= cursor + 1e-6) return;
    step(targets, end - cursor, caps, pinned, leg);
    cursor = end;
    write(cursor);
  };
  /** The next real moment's player, heading for its spot (`stop`: when the final picture takes
   *  over). Only once that moment is known. */
  interface Pull {
    actor: string;
    spot: Vec;
    stop: number;
  }

  /**
   * Illustrative play up to `until`. The holder carries the ghost a few metres on at a jog, the
   * nearest opponent closes him down goal side (3–7 m off: real passers' nearest opponent is a
   * median 5 m away), the shape follows the ball. Then he passes to a teammate 8–32 m away
   * (forward preferred) at a real pass's speed, landing where that teammate is heading, and the
   * teammate is due on it. Play stops at `until`, mid-carry or mid-flight, and goes on from
   * there next time.
   */
  const play = (until: number, pull?: Pull) => {
    let guard = 0;
    while (ill && cursor < until - 1e-6 && guard++ < 2000) {
      const I: Ill = ill;
      const def = other(I.side);
      if (!active.has(I.by)) {
        const n = nearest(I.side, pos[I.by], 1, new Set([I.by]), false)[0];
        if (!n) {
          ill = null;
          break;
        }
        I.by = n.id;
      }
      const pullTo = (targets: Record<string, Vec>, pace: Record<string, Pace>) => {
        // Not while he's due on a pass in flight: that run is timed to its spot.
        if (!pull || !targets[pull.actor] || I.fly?.recv === pull.actor) return;
        const k = clamp(1 - (pull.stop - cursor) / 6, 0, 0.85);
        targets[pull.actor] = lerp(targets[pull.actor], pull.spot, k);
        if (k > 0.3) pace[pull.actor] = "urgent";
      };
      if (cursor < I.since) {
        // A dead ball: everyone settles (the shape around it, or back for a kick-off).
        const { at, pace } = I.wait ? { at: { ...I.wait.at }, pace: { ...I.wait.pace } } : shape(pos[I.by], I.side);
        pullTo(at, pace);
        run(at, Math.min(until, I.since), {}, new Set(), { pace });
        continue;
      }
      if (I.fly) {
        const f = I.fly;
        const { at, pace } = shape(f.to, I.side);
        const caps: Record<string, number> = { [f.recv]: V_RECEIVE };
        at[f.recv] = f.to;
        const pr = nearest(def, f.to, 1, new Set(), true)[0];
        if (pr) {
          at[pr.id] = toward(pos[pr.id], f.to, Math.max(0, dist(pos[pr.id], f.to) - 4));
          pace[pr.id] = "urgent";
        }
        pullTo(at, pace);
        run(at, Math.min(until, f.till), caps, new Set([f.recv]), { due: { [f.recv]: f.till }, pace });
        if (cursor < f.till - 1e-6) break; // still in the air at `until`
        takes(f.recv, I.side, f.to, f.till);
        zone = f.to;
        continue;
      }
      // Carrying.
      const end = Math.min(until, I.until);
      const me = own(I.side, pos[I.by]);
      const { at, pace } = shape(pos[I.by], I.side);
      const caps: Record<string, number> = {};
      const keeper = tracks[I.by].slot.role === "GK";
      at[I.by] = keeper ? pos[I.by] : own(I.side, { x: Math.min(HALF_L - 8, me.x + 3.5), y: me.y * 0.92 });
      pace[I.by] = "auto";
      const pr = keeper ? undefined : nearest(def, pos[I.by], 1, new Set())[0];
      if (pr) {
        const g = 3 + 4 * hash01(`${pr.id}:${I.by}:${I.since.toFixed(1)}:press`);
        at[pr.id] = own(I.side, { x: Math.min(HALF_L - 1, me.x + 3.5 + g), y: me.y * 0.95 });
        pace[pr.id] = "urgent";
        caps[pr.id] = V_ACTOR;
      }
      pullTo(at, pace);
      run(at, end, caps, new Set(), { pace });
      zone = pos[I.by];
      if (end < I.until - 1e-6) break; // stopped at `until`, still carrying
      // Pass on: to where a teammate is heading in the picture around the ball at his feet.
      const from = feetOf(pos[I.by], I.side);
      const { at: spots } = shape(from, I.side);
      let best: { id: string; to: Vec; flight: number; score: number } | null = null;
      for (const c of live()) {
        if (c.side !== I.side || c.id === I.by || c.role === "GK") continue;
        const to = spots[c.id];
        if (!to) continue;
        const d = dist(from, to);
        if (d < 8 || d > 32) continue;
        const flight = Math.max(0.5, d / passSpeed(d));
        if (dist(pos[c.id], to) > V_RECEIVE * 0.6 * flight + 1.5) continue;
        if (pull && c.id === pull.actor && dist(to, pull.spot) > 8) continue;
        if (pull && cursor + flight > pull.stop) continue; // it must land before the final pass
        const score = -0.35 * (own(I.side, to).x - own(I.side, from).x) + 8 * hash01(`${c.id}:${I.by}:${cursor.toFixed(1)}:pass`);
        if (!best || score < best.score) best = { id: c.id, to, flight, score };
      }
      if (!best) {
        // Nobody on: he keeps it a little longer.
        I.until = cursor + keepFor(I.by, cursor);
        if (I.carry) I.carry.t1 = I.until;
        continue;
      }
      if (I.carry) I.carry.t1 = cursor;
      ghost.push({ kind: "fly", t0: cursor, t1: cursor + best.flight, from: null, to: best.to });
      I.fly = { to: best.to, till: cursor + best.flight, recv: best.id };
      I.carry = null;
    }
  };

  /** Where a player was at t, from his keys (straight between them: close enough to time a pass). */
  const posAt = (id: string, t: number): Vec => {
    const k = tracks[id].keys;
    let i = k.length - 1;
    while (i > 0 && k[i].t > t) i--;
    const a = k[i];
    const b = k[Math.min(i + 1, k.length - 1)];
    const u = b.t > a.t ? clamp((t - a.t) / (b.t - a.t), 0, 1) : 0;
    return { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u };
  };

  /** After the approach is planned (so the holder's track is known): the ghost from `I` to the
   *  real moment's spot, landing at `arrive` as the real ball shows. A corner: it runs out to the
   *  flag and waits there. No time to play it at a pass's pace: it bows out. */
  const handOver = (I: Ill | null, m: Moment, from: number, arrive: number) => {
    if (!I) return;
    let carry = I.carry;
    let t0 = Math.max(from, I.since);
    let by = I.by;
    if (I.fly && I.fly.till > arrive - 0.7) {
      // A pass decided before this moment was known, landing too late to play on: cut short
      // from now (the ghost bows out; the real ball fades in at its spot).
      for (let i = ghost.length - 1; i >= 0; i--) {
        const g = ghost[i];
        if (g.kind === "fly" && Math.abs(g.t1 - I.fly.till) < 1e-6) {
          g.gone = Math.max(g.t0, from);
          break;
        }
      }
      return;
    }
    if (I.fly) {
      t0 = I.fly.till;
      by = I.fly.recv;
      carry = { kind: "carry", t0, t1: t0, by, blendFrom: I.fly.to, blendTill: t0 + 0.25 };
      ghost.push(carry);
    }
    if (!carry || carry.kind !== "carry") return;
    const done = (t: number) => (carry!.t1 = Math.max(carry!.t0, t));
    if (t0 >= arrive - 0.3 || !tracks[by]) {
      done(Math.min(carry.t1, t0));
      return;
    }
    // Where the ghost is at t: at his feet, or still easing onto them (as ghost.ts draws it).
    const c = carry;
    const ballAt = (t: number): Vec => {
      const f = feetOf(posAt(by, t), I.side);
      if (!c.blendFrom || !c.blendTill || t >= c.blendTill) return f;
      const u = clamp((t - c.t0) / Math.max(1e-6, c.blendTill - c.t0), 0, 1);
      const e = u * u * (3 - 2 * u);
      return lerp(c.blendFrom, f, e);
    };
    // He passes it on so it lands on time: at a pass's pace for the distance, faster if it must.
    const land0 = arrive;
    let cut = Math.max(t0, land0 - 1);
    let d = 0;
    for (let k = 0; k < 3; k++) {
      d = dist(ballAt(cut), m.from);
      const flight = Math.max(clamp(d / passSpeed(d), 0.4, 2.2), d / GHOST_MAX);
      cut = Math.max(t0, (m.kind === "corner" ? Math.min(land0, t0 + flight) : land0) - flight);
    }
    const land = m.kind === "corner" ? Math.min(land0, cut + Math.max(0.4, d / passSpeed(d))) : land0;
    if (d / Math.max(1e-3, land - cut) > GHOST_MAX) {
      done(Math.min(carry.t1, t0));
      return;
    }
    done(cut);
    ghost.push({ kind: "fly", t0: cut, t1: land, from: null, to: m.from });
    if (land < arrive) ghost.push({ kind: "fly", t0: land, t1: arrive, from: m.from, to: m.from }); // at the flag
  };

  const beats: Beat[] = [];
  const dropped: Timeline["dropped"] = [];
  let prev: Beat | null = null;
  let prevHold: Record<string, Vec> = {};
  let prevPace: Record<string, Pace> = {};

  /** Finish the previous moment's hold at `until` (cut short if earlier), then a goal's reset. */
  const closePrev = (until: number) => {
    if (!prev) return;
    const m = prev.moment;
    const holdEnd = Math.min(until, prev.land + holdOf(m));
    // The receiver holds the ball; a scorer is off at once.
    const quick = prev.receiver ? [prev.receiver] : isGoal(m) ? [prev.actor] : [];
    step({ ...prevHold }, holdEnd - prev.land, {}, new Set(quick), { pace: prevPace });
    prev.end = Math.max(prev.land, holdEnd);
    write(prev.end);
    cursor = prev.end;
    if (m.kind === "card" && (m.outcome === "red" || m.outcome === "second_yellow")) {
      tracks[prev.actor].offAt = prev.end;
      active.delete(prev.actor);
    }
    // The ghost takes over from the real ball (after a dead ball's set-up).
    if (pending && active.has(pending.by)) takes(pending.by, pending.side, pending.from, prev.end + pending.delay);
    pending = null;
    if (isGoal(m) && until > holdEnd) {
      const kicking = other(m.side);
      const t: Record<string, Vec> = {};
      const slow: Record<string, Pace> = {};
      for (const s of live()) {
        t[s.id] = kickoffAt(s, s.side === kicking);
        slow[s.id] = "slow"; // back for the restart: a walk, a jog from far
      }
      // First the scorer's nearest teammates mob him while the side that conceded stands, then
      // everyone walks back.
      const mob = Math.min(GOAL_MOB, until - holdEnd);
      const first: Record<string, Vec> = { ...t };
      const at = pos[prev.actor];
      first[prev.actor] = at;
      for (const s of nearest(m.side, at, 4, new Set([prev.actor]))) first[s.id] = toward(pos[s.id], at, Math.max(0, dist(pos[s.id], at) - 1.5));
      for (const s of live()) if (s.side === kicking) first[s.id] = pos[s.id];
      step(first, mob, {}, new Set(), { pace: slow });
      cursor = holdEnd + mob;
      write(cursor);
      // Back for the kick-off, which the conceding side's centre-forward takes KICKOFF after
      // the mob (not when the next moment comes: that may not be known yet).
      zone = { x: 0, y: 0 };
      const taker = nearest(kicking, { x: 0, y: 0 }, 1, new Set())[0];
      if (taker) takes(taker.id, kicking, { x: 0, y: 0 }, cursor + KICKOFF, { at: t, pace: slow });
      if (ill) play(until);
      else run(t, until, {}, new Set(), { pace: slow });
    }
    prev = null;
  };

  const naturalFree = () =>
    prev ? prev.land + holdOf(prev.moment) + (isGoal(prev.moment) ? RESET : 0) : cursor;

  const knownAt = opts.known ?? (() => -Infinity);
  let queue = moments
    .map((m) => ({ m, ideal: opts.ideal(m) }))
    .filter((q): q is { m: Moment; ideal: number } => q.ideal !== null && q.ideal >= opts.start - 0.01)
    .sort((a, b) => a.ideal - b.ideal || a.m.t - b.m.t);

  upcoming = queue
    .filter((q) => isForced(q.m, opts.speed))
    .map((q) => ({ actor: slotId(q.m.side, q.m.player), spot: q.m.from, ideal: q.ideal, known: knownAt(q.m) }));
  const slow = opts.speed <= 2;
  holdScale = slow ? 1 : FAST_HOLD;
  const maxLag = slow ? 1.5 : 1.2;
  const window = slow ? 0.25 : 0.6;
  /** A filler's score: its importance, then how near its player already is (15 m ≈ one step). */
  const score = (m: Moment) => {
    const a = slotId(m.side, m.player);
    return m.priority + (pos[a] ? dist(pos[a], m.from) / 15 : 9);
  };
  let p = 0;
  let looked = -Infinity;
  const cps: Checkpoint[] = [];
  const queued = new Set(queue.map((q) => q.m.id));

  const save = (): Checkpoint => {
    const keys: Checkpoint["keys"] = {};
    const offAt: Checkpoint["offAt"] = {};
    for (const id in tracks) {
      const k = tracks[id].keys;
      keys[id] = { n: k.length, last: k.length ? { ...k[k.length - 1] } : null };
      offAt[id] = tracks[id].offAt;
    }
    let flyAt = -1;
    if (ill?.fly) for (let i = ghost.length - 1; i >= 0 && flyAt < 0; i--) if (ghost[i].kind === "fly" && Math.abs(ghost[i].t1 - ill.fly.till) < 1e-9) flyAt = i;
    const carryAt = ill?.carry ? ghost.lastIndexOf(ill.carry) : -1;
    return {
      reach: looked,
      cursor,
      zone,
      lastPoss,
      lastBall,
      legNo,
      pos: { ...pos },
      aim: { ...aim },
      active: [...active],
      offAt,
      VX: VX.slice(),
      VY: VY.slice(),
      standing: standing.slice(),
      waiting: waiting.slice(),
      going: [...going],
      keys,
      ghostN: ghost.length,
      ill: ill && {
        state: { by: ill.by, side: ill.side, since: ill.since, until: ill.until, fly: ill.fly && { ...ill.fly }, wait: ill.wait },
        carryAt,
        carry: carryAt >= 0 ? { ...ghost[carryAt] } : null,
        flyAt,
        fly: flyAt >= 0 ? { ...ghost[flyAt] } : null,
      },
      pending: pending && { ...pending },
      beatsN: beats.length,
      droppedN: dropped.length,
      prev: prev && { ...prev },
      prevHold,
      prevPace,
      queue: queue.slice(p).map((q) => q.m.id),
    };
  };

  /** Pick up from an earlier plan's checkpoint: false if none fits. */
  const resume = (): boolean => {
    const r = opts.resume;
    const old = r && checkpoints.get(r.from);
    if (!r || !old) return false;
    let cp: Checkpoint | undefined;
    for (let i = old.cps.length - 1; i >= 0 && !cp; i--) if (old.cps[i].reach < r.after && old.cps[i].cursor < r.after) cp = old.cps[i];
    if (!cp) return false;
    // Every moment it had still to go is here, and every new one comes after `after`.
    const byId = new Map(queue.map((q) => [q.m.id, q]));
    for (const id of old.queued) if (!byId.has(id)) return false;
    const fresh = queue.filter((q) => !old.queued.has(q.m.id));
    if (fresh.some((q) => knownAt(q.m) < r.after)) return false;
    const was = r.from;
    const moment = (m: Moment) => byId.get(m.id)?.m ?? moments.find((x) => x.id === m.id) ?? m;
    for (const id in tracks) {
      const k = cp.keys[id];
      if (!k || !was.tracks[id]) return false;
      tracks[id].keys = was.tracks[id].keys.slice(0, k.n);
      if (k.last) tracks[id].keys[k.n - 1] = { ...k.last };
      tracks[id].offAt = cp.offAt[id];
    }
    active.clear();
    for (const id of cp.active) active.add(id);
    for (const id in cp.pos) pos[id] = cp.pos[id];
    for (const id in cp.aim) aim[id] = cp.aim[id];
    VX.set(cp.VX);
    VY.set(cp.VY);
    standing.set(cp.standing);
    waiting.set(cp.waiting);
    going.clear();
    for (const [id, g] of cp.going) going.set(id, g);
    cursor = cp.cursor;
    zone = cp.zone;
    lastPoss = cp.lastPoss;
    lastBall = cp.lastBall;
    legNo = cp.legNo;
    looked = cp.reach;
    ghost.push(...was.ghost.slice(0, cp.ghostN));
    ill = null;
    if (cp.ill) {
      const c = cp.ill;
      if (c.carry) ghost[c.carryAt] = { ...c.carry };
      if (c.fly) ghost[c.flyAt] = { ...c.fly };
      ill = { ...c.state, fly: c.state.fly && { ...c.state.fly }, carry: c.carry ? ghost[c.carryAt] : null };
    }
    pending = cp.pending && { ...cp.pending };
    for (const b of was.beats.slice(0, cp.beatsN)) beats.push({ ...b, moment: moment(b.moment) });
    if (cp.prev) beats[cp.beatsN - 1] = { ...cp.prev, moment: moment(cp.prev.moment) };
    prev = cp.prev ? beats[cp.beatsN - 1] : null;
    for (const d of was.dropped.slice(0, cp.droppedN)) dropped.push({ ...d, moment: moment(d.moment) });
    prevHold = cp.prevHold;
    prevPace = cp.prevPace;
    // The queue as it stood, the new moments in their sorted places after it (all later than
    // anything it had looked at).
    const rest = cp.queue.map((id) => byId.get(id)!);
    for (const q of fresh) {
      let at = rest.length;
      while (at > 0 && (rest[at - 1].ideal > q.ideal || (rest[at - 1].ideal === q.ideal && rest[at - 1].m.t > q.m.t))) at--;
      rest.splice(at, 0, q);
    }
    queue = rest;
    p = 0;
    cps.push(...old.cps.filter((c) => c.cursor <= cp!.cursor && c.reach <= cp!.reach && c !== cp));
    return true;
  };

  if (!resume()) {
    // The ghost starts with whoever is nearest the starting ball, on the side that has it.
    const side = init.kind === "kickoff" ? init.kicking : init.side;
    const at = init.kind === "kickoff" ? { x: 0, y: 0 } : init.ball;
    const n = nearest(side, at, 1, new Set())[0];
    if (n) takes(n.id, side, at, opts.start);
  }

  while (p < queue.length) {
    // A checkpoint: what every turn so far has done and looked at (see PlanOptions.resume).
    looked = Math.max(looked, cursor);
    cps.push(save());
    if (cps.length > KEEP_CPS) cps.shift();
    const free = naturalFree();
    // Fillers that can no longer start in time are skipped.
    while (p < queue.length && !isForced(queue[p].m, opts.speed) && queue[p].ideal < free - maxLag) {
      dropped.push({ moment: queue[p].m, reason: "late" });
      p++;
    }
    if (p >= queue.length) break;
    const horizon = Math.max(free, queue[p].ideal) + window;
    looked = Math.max(looked, horizon);
    // Decide only among moments already known when the decision is made.
    const decideAt = Math.max(free, knownAt(queue[p].m));
    let pick = -1;
    for (let j = p; j < queue.length && queue[j].ideal <= horizon; j++) {
      const q = queue[j];
      if (knownAt(q.m) > decideAt) continue;
      if (!isForced(q.m, opts.speed) && q.ideal < free - maxLag) continue;
      if (isForced(q.m, opts.speed)) {
        pick = j;
        break; // the earliest forced moment wins
      }
      if (pick < 0 || score(q.m) < score(queue[pick].m)) pick = j;
    }
    if (pick < 0) pick = p;
    // Skipped: the known ones before the pick. Unknown ones stay queued (they sort after).
    const later: typeof queue = [];
    for (let j = p; j < pick; j++)
      if (knownAt(queue[j].m) > decideAt) later.push(queue[j]);
      else dropped.push({ moment: queue[j].m, reason: "busy" });
    queue.splice(p, pick - p); // the pick is now at p
    queue.splice(p + 1, 0, ...later); // the unknown ones wait right after it
    pick = p;
    p = pick + 1;

    const { m, ideal } = queue[pick];
    const forced = isForced(m, opts.speed);
    const actor = slotId(m.side, m.player);
    if (!tracks[actor] || !active.has(actor)) {
      dropped.push({ moment: m, reason: "no-player" });
      continue;
    }
    const slot = tracks[actor].slot;
    if (!forced && slot.role === "GK" && own(m.side, m.from).x > -HALF_L + 18) {
      dropped.push({ moment: m, reason: "keeper-zone" });
      continue;
    }

    // Where the actor stands to play it: just behind the ball (a corner taker at the flag).
    const back = attackSign(m.side) * 0.7;
    const spot: Vec = m.kind === "corner" ? { ...m.from } : clampToPitch({ x: m.from.x - back, y: m.from.y });

    // When can the approach start? A forced moment may cut the previous one short.
    let s = free;
    if (prev && forced && ideal < free) s = Math.max(prev.land + 0.2, ideal - 1.2);
    if (!prev) s = Math.max(cursor, Math.min(free, ideal));
    // Nobody moves for a moment before it is known (its tick arrived).
    s = Math.max(s, Math.min(ideal, knownAt(m)));
    looked = Math.max(looked, s);
    const reach = dist(pos[actor], spot) / V_ACTOR;
    let touch = Math.max(ideal, s + Math.max(reach, LEAD + 0.1));
    if (!forced && touch - ideal > maxLag) {
      dropped.push({ moment: m, reason: "unreachable" });
      continue;
    }
    if (!forced) {
      const flight = m.to ? dist(m.from, m.to) / Math.max(4, m.speed) : 0;
      const busyTill = touch + flight + 0.2;
      const blocks = queue.some(
        (q, j) => j > pick && isForced(q.m, opts.speed) && knownAt(q.m) <= s && q.ideal > s && q.ideal - 1 < busyTill,
      );
      if (blocks) {
        dropped.push({ moment: m, reason: "make-way" });
        continue;
      }
    }
    closePrev(s);
    s = Math.max(s, cursor);
    if (s > cursor + 1e-3) {
      // Waiting for this moment (not known yet): play goes on, or everyone settles.
      if (ill) play(s);
      if (s > cursor + 1e-3) {
        step({ ...aim }, s - cursor, {}, new Set());
        cursor = s;
        write(s);
      }
      s = cursor; // a pass in flight lands first
    }
    // The hold may have moved the actor a little: keep the run within V_ACTOR.
    touch = Math.max(touch, s + dist(pos[actor], spot) / V_ACTOR);
    // Now the moment is known: play on until its player must set off and the ghost is played
    // to its spot, then the approach's picture.
    if (ill && m.kind !== "corner") {
      const arrive0 = Math.max(s, touch - LEAD);
      const stop = Math.min(arrive0 - 2.2, touch - dist(pos[actor], spot) / GAIT.run - 1);
      if (stop > cursor + 0.5) {
        play(stop, { actor, spot, stop });
        touch = Math.max(touch, cursor + dist(pos[actor], spot) / V_ACTOR);
      }
    }
    const handing = ill;
    const handFrom = cursor;
    ill = null;

    // ---- approach: (after play) → touch ----
    const dtA = touch - cursor;
    const zoneA = lerp(zone, m.from, 0.6);
    const pinned = new Set([actor]);
    const def = other(m.side);
    /** The approach's picture around `z`: the shape with its jobs, the press, the cover, the
     *  corner set-up, the actor on his spot. */
    const approach = (z: Vec) => {
      const { at: targets, pace } = shape(z, m.side);
      const caps: Record<string, number> = {};
      const used = new Set([actor]);
      if (m.kind === "corner") {
        const att = nearest(m.side, own(m.side, { x: HALF_L, y: 0 }), 5, used);
        att.forEach((s2, i) => {
          targets[s2.id] = own(m.side, { x: CORNER_ATT[i][0], y: CORNER_ATT[i][1] * Math.sign(own(m.side, m.from).y || 1) });
          pace[s2.id] = "urgent";
          used.add(s2.id);
        });
        const dd = nearest(def, own(m.side, { x: HALF_L, y: 0 }), 6, used);
        dd.forEach((s2, i) => {
          targets[s2.id] = own(m.side, { x: CORNER_DEF[i][0], y: CORNER_DEF[i][1] * Math.sign(own(m.side, m.from).y || 1) });
          pace[s2.id] = "urgent";
        });
        const gk = live().find((x) => x.side === def && x.role === "GK");
        if (gk) targets[gk.id] = own(m.side, { x: HALF_L - 1, y: 0 });
      } else {
        // The nearest one or two opponents close the ball down, goal side.
        const n = m.kind === "foul" ? 1 : m.pressed ? 2 : 1;
        // Real passers have the nearest opponent 2.7–9 m away (median 5, DFL); under pressure, close.
        const gap = m.kind === "foul" ? 1.1 : m.pressed ? 2.6 : 6;
        nearest(def, m.from, n, used).forEach((pr, i) => {
          // Goal side (between the ball and his own goal); for a shot, from the side, out of the
          // ball's path. A second presser cuts the lane inside, a few metres further off.
          const sg = attackSign(m.side);
          const inside = m.from.y > 0 ? -1 : 1;
          const goalSide =
            m.kind === "shot"
              ? { x: m.from.x - sg * 0.6, y: m.from.y + inside * 1.8 }
              : i === 0
                ? { x: m.from.x + sg * gap, y: m.from.y }
                : { x: m.from.x + sg * (gap + 2.5), y: m.from.y + inside * 4 };
          targets[pr.id] = goalSide;
          caps[pr.id] = V_ACTOR;
          pace[pr.id] = "urgent";
          used.add(pr.id);
        });
        // The second man covers: a few metres goal side of the press, toward the middle.
        if (m.kind !== "shot")
          for (const cv of nearest(def, m.from, 1, used)) {
            targets[cv.id] = { x: m.from.x + attackSign(m.side) * 8, y: m.from.y * 0.7 };
            pace[cv.id] = "urgent";
            used.add(cv.id);
          }
        if (m.winner) {
          const w = slotId(m.winner.side, m.winner.player);
          if (tracks[w] && active.has(w) && m.to) {
            targets[w] = lerp(targets[w], m.to, 0.5); // reading the pass
            caps[w] = V_ACTOR;
            pace[w] = "urgent";
          }
        }
      }
      targets[actor] = spot;
      caps[actor] = V_ACTOR; // reach was checked: touch leaves enough time at V_ACTOR
      return { targets, caps, pace };
    };
    // A fresh picture every REPICTURE (each player's wander moves on): nobody arrives and
    // freezes while the ball is about to be played.
    for (let first = true; first || cursor < touch - 1e-6; first = false) {
      const end = Math.min(touch, cursor + REPICTURE);
      const { targets, caps, pace } = approach(zoneA);
      step(targets, end - cursor, caps, pinned, { due: { [actor]: touch }, pace });
      cursor = end;
      if (end < touch) write(cursor);
      if (dtA <= 0) break;
    }
    pos[actor] = spot;
    cursor = touch;
    write(touch);
    handOver(handing, m, handFrom, Math.max(s, touch - LEAD));

    // ---- the ball moves: touch → land ----
    let land = touch;
    let receiver: string | null = null;
    let winnerShown = false;
    const to = m.to;
    let possAfter: Side = m.side;
    if (to && (m.kind === "pass" || m.kind === "shot")) {
      const d = dist(m.from, to);
      land = touch + clamp(d / Math.max(4, m.speed), m.kind === "shot" ? 0.25 : 0.3, m.kind === "shot" ? 1.6 : 2.5);
      const dtF = land - touch;
      const { at: t2, pace: p2 } = shape(lerp(zoneA, to, 0.5), m.kind === "pass" && m.outcome !== "complete" ? def : m.side);
      const c2: Record<string, number> = {};
      const pin2 = new Set<string>();
      const dir = d > 1e-6 ? { x: (to.x - m.from.x) / d, y: (to.y - m.from.y) / d } : { x: 0, y: 0 };
      t2[actor] = { x: spot.x + dir.x * 1.5, y: spot.y + dir.y * 1.5 }; // follow-through
      const gkDef = live().find((x) => x.side === def && x.role === "GK");
      if (m.kind === "pass") {
        if (m.outcome === "complete") {
          // The credited assist goes to the scorer; otherwise the nearest teammate (illustrative).
          const scorer = m.assistTo ? slotId(m.side, m.assistTo) : null;
          const mate = scorer && active.has(scorer) ? tracks[scorer].slot : nearest(m.side, to, 1, new Set([actor]), false)[0];
          if (mate) receiver = mate.id;
        } else {
          possAfter = def;
          if (m.winner) {
            const w = slotId(m.winner.side, m.winner.player);
            const meet = { x: to.x - dir.x * 0.6, y: to.y - dir.y * 0.6 };
            if (tracks[w] && active.has(w) && dist(pos[w], meet) <= V_RECEIVE * dtF) {
              receiver = w;
              winnerShown = true;
            }
          }
          if (!receiver) receiver = nearest(def, to, 1, new Set(), false)[0]?.id ?? null;
        }
      } else if (gkDef) {
        const gx = attackSign(m.side) * (HALF_L - 0.7);
        if (m.outcome === "saved") receiver = gkDef.id;
        else if (m.outcome === "goal") t2[gkDef.id] = { x: gx, y: clamp(to.y * 0.6, -3.3, 3.3) }; // beaten
        else t2[gkDef.id] = { x: gx, y: clamp(to.y * 0.3, -2, 2) };
        c2[gkDef.id] = V_RECEIVE;
        p2[gkDef.id] = "urgent";
        if (m.outcome === "blocked") receiver = nearest(def, to, 1, new Set())[0]?.id ?? null;
      }
      if (receiver) {
        t2[receiver] = m.outcome === "saved" ? to : { x: to.x - dir.x * 0.6, y: to.y - dir.y * 0.6 };
        c2[receiver] = V_RECEIVE;
        pin2.add(receiver);
      }
      pin2.add(actor);
      step(t2, dtF, c2, pin2, { due: receiver ? { [receiver]: land } : {}, pace: p2 });
      cursor = land;
      write(land);
      zone = to;
    } else {
      zone = m.from;
    }

    // ---- what the hold (land → end) moves toward; written when the next moment is known ----
    const { at: hold, pace: holdPace } = shape(zone, possAfter);
    for (const s2 of live()) if (s2.role !== "GK") hold[s2.id] = lerp(pos[s2.id], hold[s2.id], 0.5);
    hold[actor] = pos[actor];
    if (receiver) hold[receiver] = pos[receiver];
    if (isGoal(m)) {
      // The scorer wheels away towards the nearest corner; the nearest teammates chase him, the
      // rest of his side drift toward him, and the side that conceded stops where it is.
      const flag = { x: attackSign(m.side) * (HALF_L - 4), y: Math.sign(m.from.y || 1) * 26 };
      hold[actor] = toward(pos[actor], flag, 14);
      holdPace[actor] = "urgent";
      const chase = new Set(nearest(m.side, pos[actor], 3, new Set([actor])).map((s2) => s2.id));
      for (const s2 of live()) {
        if (s2.id === actor || s2.role === "GK") continue;
        if (s2.side !== m.side) hold[s2.id] = pos[s2.id];
        else if (chase.has(s2.id)) hold[s2.id] = lerp(pos[s2.id], hold[actor], 0.7);
        else if (dist(pos[s2.id], hold[actor]) < 40) {
          hold[s2.id] = lerp(pos[s2.id], hold[actor], 0.35);
          holdPace[s2.id] = "slow";
        } else hold[s2.id] = pos[s2.id];
      }
    }
    if (m.kind === "foul" || m.kind === "card") {
      for (const s2 of live()) hold[s2.id] = pos[s2.id];
      if (m.kind === "card")
        for (const s2 of [...nearest(m.side, m.from, 1, new Set([actor])), ...nearest(def, m.from, 1, new Set())])
          hold[s2.id] = toward(pos[s2.id], m.from, Math.max(0, dist(pos[s2.id], m.from) - 2.2));
    }
    if (m.kind === "corner") for (const s2 of live()) hold[s2.id] = pos[s2.id];
    prevHold = hold;
    prevPace = holdPace;

    // Who has the ghost once this moment ends.
    {
      const gkDef = live().find((x) => x.side === def && x.role === "GK");
      // A restart: from the real ball's spot if play runs straight on, else from his feet.
      const restart = (side: Side, at: Vec, delay: number) => {
        const n = nearest(side, at, 1, new Set([actor]), true)[0];
        if (n) pending = { by: n.id, side, from: delay > 0 ? feetOf(pos[n.id], side) : end, delay };
      };
      const end = m.to ?? m.from;
      if (isGoal(m)) pending = null; // the kick-off (closePrev)
      else if (receiver) pending = { by: receiver, side: possAfter === m.side ? m.side : def, from: end, delay: 0 };
      else if (m.kind === "shot" && gkDef) pending = { by: gkDef.id, side: def, from: pos[gkDef.id], delay: DEAD }; // a goal kick
      else if (m.kind === "foul" || m.kind === "card") restart(def, m.from, DEAD); // the free kick
      else if (m.kind === "corner") restart(def, own(m.side, { x: HALF_L - 12, y: 0 }), 0); // cleared
      else restart(possAfter, end, 0);
      if (receiver && m.kind === "shot" && m.outcome === "saved") pending = { by: receiver, side: def, from: end, delay: 0 };
    }

    const beat: Beat = { moment: m, s, touch, land, end: land + holdOf(m), ideal, actor, receiver, winnerShown };
    beats.push(beat);
    prev = beat;
  }
  closePrev(naturalFree());
  // Live, after the last moment everyone keeps settling into his spot, just as he would while
  // the next moment is awaited: a plan with one more tick shows the same picture until it
  // differs. (A replay has no next tick.)
  const end = cursor;
  if (opts.known) {
    const settle = SETTLE + 60 / opts.speed; // till the next tick can arrive (it stops once all stand)
    const till = Math.max(cursor + settle, opts.until ?? -Infinity);
    if (ill) play(till);
    if (till > cursor) {
      step({ ...aim }, till - cursor, {}, new Set());
      write(till);
    }
  }

  const initialBall =
    init.kind === "kickoff" ? { at: { x: 0, y: 0 }, side: init.kicking } : { at: init.ball, side: init.side };
  const tl: Timeline = { tracks, ball: ballKeys(beats), ghost, beats, dropped, start: opts.start, end, initialBall };
  checkpoints.set(tl, { cps, queued });
  return tl;
}

/** The share of real passes lofted (over 1 m) by length (DFL, real/stats.json "byLength"):
 *  a chip or a throw now and then, a third of passes of 30–45 m, every pass past 45 m. */
const LOFTED: [number, number][] = [[5, 0.2], [15, 0.1], [25, 0.13], [37.5, 0.4], [50, 1]];
const loftedShare = (d: number) => {
  if (d <= LOFTED[0][0]) return LOFTED[0][1];
  for (let i = 1; i < LOFTED.length; i++)
    if (d <= LOFTED[i][0]) {
      const [d0, p0] = LOFTED[i - 1];
      const [d1, p1] = LOFTED[i];
      return p0 + ((p1 - p0) * (d - d0)) / (d1 - d0);
    }
  return 1;
};

/** A ball peaking above this (m) is met in the air (a header); lower, it's controlled. */
export const HEAD = 1.8;

/** Peak height (m) of a moment's ball in flight. The data has no height, so it's illustrative:
 *  lofted as often as real passes of its length are, about 0.16 m per metre (8 m at 50 m). */
export const loft = (m: Moment) => {
  const d = m.to ? dist(m.from, m.to) : 0;
  if (m.kind !== "pass" || hash01(`${m.id}:loft`) >= loftedShare(d)) return 0;
  return clamp(d * 0.16, 1.5, 11);
};

/** The ball: it shows only during moments, at the real spot, along the real pass. */
function ballKeys(beats: Beat[]): BallKey[] {
  const out: BallKey[] = [];
  /** A credited assist: the scorer keeps the ball and carries it to his shot (illustrative
   *  carry). Only for a linked assist, which is known before the pass is shown. */
  const carries = (b: Beat, next: Beat | undefined) =>
    !!next && !!b.moment.assistTo && !!b.receiver && b.receiver === next.actor && b.moment.kind === "pass";
  beats.forEach((b, i) => {
    const m = b.moment;
    const f = m.from;
    const carriedIn = i > 0 && carries(beats[i - 1], b);
    if (!carriedIn) {
      const t0 = Math.max(b.s, b.touch - LEAD);
      out.push({ t: t0, x: f.x, y: f.y, a: 0, ease: "hold", arc: 0 });
      out.push({ t: Math.min(b.touch, t0 + 0.2), x: f.x, y: f.y, a: 1, ease: "hold", arc: 0 });
    }
    if (carriedIn) {
      // The ball rests where the pass landed until that moment ends, then goes with the
      // receiver to the real spot.
      const prev = beats[i - 1];
      const to = prev.moment.to ?? prev.moment.from;
      const wait = Math.max(prev.land, Math.min(prev.end, b.touch - 0.3));
      if (wait > prev.land + 1e-3) out.push({ t: wait, x: to.x, y: to.y, a: 1, ease: "hold", arc: 0 });
    }
    out.push({ t: b.touch, x: f.x, y: f.y, a: 1, ease: carriedIn ? "linear" : "hold", arc: 0, follow: carriedIn ? b.actor : undefined });
    const to = m.to ?? f;
    if (b.land > b.touch) {
      const arc = loft(m);
      out.push({ t: b.land, x: to.x, y: to.y, a: 1, ease: m.kind === "shot" ? "linear" : "out", arc });
    }
    if (carries(b, beats[i + 1])) return; // the next beat's touch key carries it there
    const fadeAt = Math.max(b.land, b.end - FADE);
    out.push({ t: fadeAt, x: to.x, y: to.y, a: 1, ease: "hold", arc: 0 });
    out.push({ t: Math.max(fadeAt, b.end), x: to.x, y: to.y, a: 0, ease: "hold", arc: 0 });
  });
  return out;
}
