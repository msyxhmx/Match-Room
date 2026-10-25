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

import { attackSign, clampToPitch, dist, HALF_L, own, type Side, type Vec } from "./geometry";
import { allSlots, kickoffAt, shapeAt, slotId, type Slot, type SquadPlayer } from "./formation";
import { isGoal, type Moment } from "./moments";

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

export interface Timeline {
  tracks: Record<string, Track>;
  ball: BallKey[];
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
}

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

/** At ×60 the ball rests for less: more of the match fits. */
const FAST_HOLD = 0.6;
let holdScale = 1;
const holdOf = (m: Moment) => (isGoal(m) ? HOLD.goal : HOLD[m.kind] * holdScale);
const lerp = (a: Vec, b: Vec, k: number): Vec => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k });
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const other = (s: Side): Side => (s === "home" ? "away" : "home");

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
  for (const s of slots) {
    pos[s.id] =
      init.kind === "kickoff" ? kickoffAt(s, s.side === init.kicking) : shapeAt(s, init.ball, s.side === init.side);
  }
  for (const id in opts.place ?? {}) if (pos[id]) pos[id] = { ...opts.place![id] };

  let cursor = opts.start;
  const write = (t: number) => {
    for (const id of active) {
      const keys = tracks[id].keys;
      const k = { t, x: pos[id].x, y: pos[id].y };
      if (keys.length && t - keys[keys.length - 1].t < 1e-3) keys[keys.length - 1] = k;
      else keys.push(k);
    }
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

  /** Move everyone toward their targets within the time, keeping at least 2 m apart. */
  const step = (targets: Record<string, Vec>, dt: number, caps: Record<string, number>, pinned: Set<string>) => {
    const ids = [...active];
    // The pre-run: someone with a forced moment soon heads for it, more strongly as it nears.
    const tEnd = cursor + Math.max(0, dt);
    for (const u of upcoming) {
      if (u.known > cursor || u.ideal <= tEnd || u.ideal > tEnd + PRE_RUN || pinned.has(u.actor) || !targets[u.actor]) continue;
      const k = Math.min(0.85, 1 - (u.ideal - tEnd) / PRE_RUN);
      targets[u.actor] = lerp(targets[u.actor], u.spot, k);
    }
    // Separation on the targets, two passes; pinned players (on the ball) don't yield.
    for (let pass = 0; pass < 2; pass++) {
      for (let a = 0; a < ids.length; a++)
        for (let b = a + 1; b < ids.length; b++) {
          const A = targets[ids[a]];
          const B = targets[ids[b]];
          const d = dist(A, B);
          if (d >= 2 || d < 1e-6) continue;
          const push = (2 - d) / 2;
          const ux = (B.x - A.x) / d;
          const uy = (B.y - A.y) / d;
          const pa = pinned.has(ids[a]);
          const pb = pinned.has(ids[b]);
          if (pa && pb) continue;
          const ka = pa ? 0 : pb ? 2 : 1;
          const kb = pb ? 0 : pa ? 2 : 1;
          targets[ids[a]] = { x: A.x - ux * push * ka, y: A.y - uy * push * ka };
          targets[ids[b]] = { x: B.x + ux * push * kb, y: B.y + uy * push * kb };
        }
    }
    for (const id of ids) {
      const t = clampToPitch(targets[id] ?? pos[id]);
      pos[id] = toward(pos[id], t, (caps[id] ?? V_RUN) * Math.max(0, dt));
    }
  };

  const shapeTargets = (ball: Vec, poss: Side): Record<string, Vec> => {
    const out: Record<string, Vec> = {};
    for (const s of live()) out[s.id] = shapeAt(s, ball, s.side === poss);
    return out;
  };

  const beats: Beat[] = [];
  const dropped: Timeline["dropped"] = [];
  let prev: Beat | null = null;
  let prevHold: Record<string, Vec> = {};

  /** Finish the previous moment's hold at `until` (cut short if earlier), then a goal's reset. */
  const closePrev = (until: number) => {
    if (!prev) return;
    const m = prev.moment;
    const holdEnd = Math.min(until, prev.land + holdOf(m));
    step({ ...prevHold }, holdEnd - prev.land, {}, new Set(prev.receiver ? [prev.receiver] : []));
    prev.end = Math.max(prev.land, holdEnd);
    write(prev.end);
    cursor = prev.end;
    if (m.kind === "card" && (m.outcome === "red" || m.outcome === "second_yellow")) {
      tracks[prev.actor].offAt = prev.end;
      active.delete(prev.actor);
    }
    if (isGoal(m) && until > holdEnd) {
      const kicking = other(m.side);
      const t: Record<string, Vec> = {};
      for (const s of live()) t[s.id] = kickoffAt(s, s.side === kicking);
      step(t, until - holdEnd, {}, new Set());
      zone = { x: 0, y: 0 };
      cursor = until;
      write(cursor);
    }
    prev = null;
  };

  const naturalFree = () =>
    prev ? prev.land + holdOf(prev.moment) + (isGoal(prev.moment) ? RESET : 0) : cursor;

  const knownAt = opts.known ?? (() => -Infinity);
  const queue = moments
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

  while (p < queue.length) {
    const free = naturalFree();
    // Fillers that can no longer start in time are skipped.
    while (p < queue.length && !isForced(queue[p].m, opts.speed) && queue[p].ideal < free - maxLag) {
      dropped.push({ moment: queue[p].m, reason: "late" });
      p++;
    }
    if (p >= queue.length) break;
    const horizon = Math.max(free, queue[p].ideal) + window;
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
      cursor = s; // waiting for this moment: everyone holds
      write(s);
    }
    // The hold may have moved the actor a little: keep the run within V_ACTOR.
    touch = Math.max(touch, s + dist(pos[actor], spot) / V_ACTOR);

    // ---- approach: s → touch ----
    const dtA = touch - s;
    const zoneA = lerp(zone, m.from, 0.6);
    const targets = shapeTargets(zoneA, m.side);
    const caps: Record<string, number> = {};
    const pinned = new Set([actor]);
    const used = new Set([actor]);
    const def = other(m.side);
    if (m.kind === "corner") {
      const att = nearest(m.side, own(m.side, { x: HALF_L, y: 0 }), 5, used);
      att.forEach((s2, i) => {
        targets[s2.id] = own(m.side, { x: CORNER_ATT[i][0], y: CORNER_ATT[i][1] * Math.sign(own(m.side, m.from).y || 1) });
        used.add(s2.id);
      });
      const dd = nearest(def, own(m.side, { x: HALF_L, y: 0 }), 6, used);
      dd.forEach((s2, i) => {
        targets[s2.id] = own(m.side, { x: CORNER_DEF[i][0], y: CORNER_DEF[i][1] * Math.sign(own(m.side, m.from).y || 1) });
      });
      const gk = live().find((x) => x.side === def && x.role === "GK");
      if (gk) targets[gk.id] = own(m.side, { x: HALF_L - 1, y: 0 });
    } else {
      // The nearest one or two opponents close the ball down, goal side.
      const n = m.kind === "foul" ? 1 : m.pressed ? 2 : 1;
      const gap = m.kind === "foul" ? 1.1 : m.pressed ? 1.6 : 4;
      for (const pr of nearest(def, m.from, n, used)) {
        // Goal side; for a shot, from the side, out of the ball's path.
        const goalSide =
          m.kind === "shot"
            ? { x: m.from.x - attackSign(m.side) * 0.6, y: m.from.y + (m.from.y > 0 ? -1.8 : 1.8) }
            : { x: m.from.x - attackSign(m.side) * gap, y: m.from.y };
        targets[pr.id] = goalSide;
        caps[pr.id] = V_ACTOR;
        used.add(pr.id);
      }
      if (m.winner) {
        const w = slotId(m.winner.side, m.winner.player);
        if (tracks[w] && active.has(w) && m.to) {
          targets[w] = lerp(targets[w], m.to, 0.5); // reading the pass
          caps[w] = V_ACTOR;
        }
      }
    }
    targets[actor] = spot;
    caps[actor] = Infinity; // reach was checked: touch leaves enough time at V_ACTOR
    step(targets, dtA, caps, pinned);
    pos[actor] = spot;
    cursor = touch;
    write(touch);

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
      const t2 = shapeTargets(lerp(zoneA, to, 0.5), m.kind === "pass" && m.outcome !== "complete" ? def : m.side);
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
        if (m.outcome === "blocked") receiver = nearest(def, to, 1, new Set())[0]?.id ?? null;
      }
      if (receiver) {
        t2[receiver] = m.outcome === "saved" ? to : { x: to.x - dir.x * 0.6, y: to.y - dir.y * 0.6 };
        c2[receiver] = V_RECEIVE;
        pin2.add(receiver);
      }
      pin2.add(actor);
      step(t2, dtF, c2, pin2);
      cursor = land;
      write(land);
      zone = to;
    } else {
      zone = m.from;
    }

    // ---- what the hold (land → end) moves toward; written when the next moment is known ----
    const hold = shapeTargets(zone, possAfter);
    for (const s2 of live()) if (s2.role !== "GK") hold[s2.id] = lerp(pos[s2.id], hold[s2.id], 0.5);
    hold[actor] = pos[actor];
    if (receiver) hold[receiver] = pos[receiver];
    if (isGoal(m)) {
      // The scorer wheels away towards the nearest corner; teammates follow.
      const flag = { x: attackSign(m.side) * (HALF_L - 4), y: Math.sign(m.from.y || 1) * 26 };
      hold[actor] = toward(pos[actor], flag, 9);
      for (const s2 of nearest(m.side, pos[actor], 3, new Set([actor]))) hold[s2.id] = lerp(pos[s2.id], hold[actor], 0.7);
    }
    if (m.kind === "foul" || m.kind === "card") {
      for (const s2 of live()) hold[s2.id] = pos[s2.id];
      if (m.kind === "card")
        for (const s2 of [...nearest(m.side, m.from, 1, new Set([actor])), ...nearest(def, m.from, 1, new Set())])
          hold[s2.id] = toward(pos[s2.id], m.from, Math.max(0, dist(pos[s2.id], m.from) - 2.2));
    }
    if (m.kind === "corner") for (const s2 of live()) hold[s2.id] = pos[s2.id];
    prevHold = hold;

    const beat: Beat = { moment: m, s, touch, land, end: land + holdOf(m), ideal, actor, receiver, winnerShown };
    beats.push(beat);
    prev = beat;
  }
  closePrev(naturalFree());

  const initialBall =
    init.kind === "kickoff" ? { at: { x: 0, y: 0 }, side: init.kicking } : { at: init.ball, side: init.side };
  return { tracks, ball: ballKeys(beats), beats, dropped, start: opts.start, end: cursor, initialBall };
}

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
      const d = dist(f, to);
      const arc = m.kind === "pass" && d > 28 ? Math.min(7, d * 0.12) : 0;
      out.push({ t: b.land, x: to.x, y: to.y, a: 1, ease: m.kind === "shot" ? "linear" : "out", arc });
    }
    if (carries(b, beats[i + 1])) return; // the next beat's touch key carries it there
    const fadeAt = Math.max(b.land, b.end - FADE);
    out.push({ t: fadeAt, x: to.x, y: to.y, a: 1, ease: "hold", arc: 0 });
    out.push({ t: Math.max(fadeAt, b.end), x: to.x, y: to.y, a: 0, ease: "hold", arc: 0 });
  });
  return out;
}
