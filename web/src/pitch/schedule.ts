// When moments play, for the two ways the overlay runs:
//   - live: each minute's events arrive in one tick; a moment's ideal time is the tick's
//     arrival plus its second at our speed. At ×1 that's the match's own clock; at ×60 one
//     minute passes per second, so the planner keeps the forced moments and the few fillers
//     that fit (a highlights feel), with the shape drifting in between.
//   - replay: a frozen minute (the overlay paused on 74') loops its headline moment and the
//     few seconds before it at real speed.

import { attackSign, clampToPitch, type Side, type Vec } from "./geometry";
import { slotId, type SquadPlayer } from "./formation";
import { isGoal, type Moment } from "./moments";
import { plan, type Timeline } from "./plan";

/** The minute's most important moment: goal, card, shot, corner, foul, won pass, pass. */
export function headline(moments: Moment[], minute: number): Moment | null {
  let best: Moment | null = null;
  for (const m of moments)
    if (m.minute === minute && (!best || m.priority < best.priority || (m.priority === best.priority && m.t < best.t)))
      best = m;
  return best;
}

/** Seconds of build-up a replay shows before its headline: a paused minute loops a longer one,
 *  a replay cut into the ×60 flow a short one. */
export const BUILD_UP = { loop: 10, cut: 0 } as const;
/** A replay cut starts its player this far (m) behind the ball. */
const RUN_IN = 7;
/** Seconds of pitch before the first replayed touch. */
const PRE_ROLL = 0.8;

export interface Replay {
  timeline: Timeline;
  /** The loop length in display seconds. */
  length: number;
  headline: Moment;
}

/**
 * A replay of one moment at ×1 from display time 0: the build-up seconds before it, then it.
 * With no build-up (a cut into the ×60 flow) its player starts a few strides from the ball.
 */
export function replayMoment(players: SquadPlayer[], moments: Moment[], target: Moment, buildUp: number): Replay | null {
  // A cut (no build-up) shows its moment alone, so it's the same on every replan: plan it once.
  if (buildUp === 0) {
    const hit = cutCache.get(target);
    if (hit && hit.players === players) return hit.replay;
    const replay = planReplay(players, moments, target, buildUp);
    cutCache.set(target, { players, replay });
    return replay;
  }
  return planReplay(players, moments, target, buildUp);
}

const cutCache = new WeakMap<Moment, { players: SquadPlayer[]; replay: Replay | null }>();

function planReplay(players: SquadPlayer[], moments: Moment[], target: Moment, buildUp: number): Replay | null {
  const from = Math.max(target.minute * 60, target.t - buildUp);
  const window = moments.filter((m) => m === target || (m.t >= from && m.t < target.t));
  const first = window[0] ?? target;
  const place: Record<string, Vec> = {};
  if (buildUp === 0) {
    const s = attackSign(target.side);
    place[slotId(target.side, target.player)] = clampToPitch({ x: target.from.x - s * RUN_IN, y: target.from.y * 0.85 });
  }
  const timeline = plan(players, window, {
    ideal: (m) => m.t - from + PRE_ROLL,
    speed: 1,
    start: 0,
    initial: { kind: "shape", ball: first.from, side: first.side },
    place,
  });
  if (!timeline.beats.some((b) => b.moment === target)) return null;
  const last = timeline.beats[timeline.beats.length - 1];
  const length = (last ? last.end : timeline.end) + (isGoal(target) ? 0.4 : 0.8);
  return { timeline, length, headline: target };
}

/** A frozen minute's loop: its headline moment with the build-up. */
export function replayMinute(players: SquadPlayer[], moments: Moment[], minute: number): Replay | null {
  const h = headline(moments, minute);
  return h ? replayMoment(players, moments, h, BUILD_UP.loop) : null;
}

/** Moments that get a replay cut into the fast flow: goals and cards. */
export const cutsToReplay = (m: Moment) => isGoal(m) || m.kind === "card";

/** Tick arrivals: minute → display time the tick arrived. */
export type Arrivals = Map<number, number>;

export interface LiveOptions {
  speed: number;
  arrivals: Arrivals;
  /** Display time the pitch starts from (the first arrival). */
  start: number;
  /** The picture to start from: kick-off at minute 0 (or after the break), else the shape. */
  initial: { kind: "kickoff"; kicking: Side } | { kind: "shape"; ball: Vec; side: Side };
  /** Plan from the start, not on from the last plan (tests compare the two). */
  fresh?: boolean;
}

/** Per lineup, the last live plan and what it was planned from: the next tick's plan carries on
 *  from it (PlanOptions.resume) instead of replanning the whole session. */
const lastLive = new WeakMap<SquadPlayer[], { o: LiveOptions; arrivals: Map<number, number>; tl: Timeline }>();

export function liveTimeline(players: SquadPlayer[], moments: Moment[], o: LiveOptions): Timeline {
  // Play goes on till well after the next tick is due (two ticks' time); at the end of a half it
  // stops a tick after the last one.
  let last = -1;
  for (const m of o.arrivals.keys()) last = Math.max(last, m);
  const tick = 60 / o.speed;
  const until = last < 0 ? undefined : o.arrivals.get(last)! + (last === 45 || last >= 90 ? tick : 2 * tick);
  // Carry on from the last plan when this one only adds ticks to it.
  let resume: { from: Timeline; after: number } | undefined;
  const L = o.fresh ? undefined : lastLive.get(players);
  if (L && L.o.speed === o.speed && L.o.start === o.start && JSON.stringify(L.o.initial) === JSON.stringify(o.initial)) {
    let same = true;
    let after = Infinity;
    for (const [m, t] of L.arrivals) if (o.arrivals.get(m) !== t) same = false;
    for (const [m, t] of o.arrivals) if (!L.arrivals.has(m)) after = Math.min(after, t);
    if (same && after < Infinity) resume = { from: L.tl, after };
  }
  const tl = plan(players, moments, {
    resume,
    until,
    ideal: (m) => {
      const at = o.arrivals.get(m.minute);
      return at === undefined ? null : at + (m.t - m.minute * 60) / o.speed;
    },
    known: (m) => o.arrivals.get(m.minute) ?? Infinity,
    speed: o.speed,
    start: o.start,
    initial: o.initial,
  });
  // A copy: the live page adds to its arrivals in place.
  lastLive.set(players, { o, arrivals: new Map(o.arrivals), tl });
  return tl;
}
