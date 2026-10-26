// Real football through our drawing: a passage of DFL tracking data (real/slice.json, from
// scripts/dfl_extract.py) as a Timeline, so the lab, film:pitch and test:pitch can play and
// measure real movement with the same figures, camera and checks as the planner's.
//
// Anonymised: players are a side, a role and a slot number (1 the keeper, 2–5 the back line,
// 6–8 the midfield, 9–11 the front three). Lab and tests only: the app never loads this file.
// Data: DFL / Sportec open data (Bassek et al. 2025), CC BY 4.0. See web/PITCH.md.

import type { Role } from "./formation";
import { dist, type Side, type Vec } from "./geometry";
import type { Moment } from "./moments";
import type { BallKey, Beat, Key, Timeline, Track } from "./plan";

export interface Passage {
  kind: string;
  hz: number;
  players: { side: Side; role: Role; number: number }[];
  /** Per player, decimetres in the world frame (home attacks +x). */
  x: number[][];
  y: number[][];
  ball: { x: number[]; y: number[]; z: number[] };
  /** Per frame: "1" ball in play. */
  alive: string;
  /** Per frame: "h" / "a" in possession, "-" neither. */
  poss: string;
  /** Seconds from the passage's start; by/to index players. */
  events: { t: number; kind: string; by: number; to: number | null; ok: boolean | null }[];
}

export const realId = (p: Passage["players"][number]) => `${p.side}:#${p.number}`;

/** A pass or shot's touch: the frame within a second of the event where the ball is nearest
 *  its player (event clocks are set by hand and run up to a second off the tracking). */
function snap(p: Passage, at: number, by: number, after = 0): number {
  const n = p.ball.x.length;
  let best = Math.round(at * p.hz);
  let bd = Infinity;
  for (let i = Math.max(after, Math.round((at - 1) * p.hz)); i <= Math.min(n - 1, Math.round((at + 1) * p.hz)); i++) {
    const d = Math.hypot(p.x[by][i] - p.ball.x[i], p.y[by][i] - p.ball.y[i]);
    if (d < bd) {
      bd = d;
      best = i;
    }
  }
  return best;
}

export function realTimeline(p: Passage): Timeline {
  const n = p.ball.x.length;
  const dt = 1 / p.hz;
  const tracks: Record<string, Track> = {};
  p.players.forEach((pl, k) => {
    const keys: Key[] = [];
    for (let i = 0; i < n; i++) keys.push({ t: i * dt, x: p.x[k][i] / 10, y: p.y[k][i] / 10 });
    tracks[realId(pl)] = {
      slot: { id: realId(pl), side: pl.side, name: `#${pl.number}`, number: pl.number, role: pl.role, ax: 0, ay: 0, k: -1 },
      keys,
      offAt: null,
    };
  });
  const ball: BallKey[] = [];
  for (let i = 0; i < n; i++)
    ball.push({ t: i * dt, x: p.ball.x[i] / 10, y: p.ball.y[i] / 10, z: p.ball.z[i] / 10, a: 1, ease: "linear", arc: 0 });
  const at = (i: number): Vec => ({ x: p.ball.x[i] / 10, y: p.ball.y[i] / 10 });

  // Passes and shots as beats, so the figures kick, receive and the name pill shows.
  const beats: Beat[] = [];
  const strikes = p.events.filter((e) => e.kind === "pass" || e.kind === "shot");
  let after = 0;
  strikes.forEach((e, j) => {
    const i0 = snap(p, e.t, e.by, after);
    const next = strikes[j + 1];
    let i1 = Math.min(n - 1, next ? snap(p, next.t, next.by, i0 + 1) : i0 + 2 * p.hz);
    if (e.kind === "pass" && e.to !== null && e.to !== undefined) {
      // Lands where the receiver first has it (within 1.5 m), else at the next touch.
      for (let i = i0 + 2; i < i1; i++)
        if (Math.hypot(p.x[e.to][i] - p.ball.x[i], p.y[e.to][i] - p.ball.y[i]) < 15) {
          i1 = i;
          break;
        }
    }
    if (i1 <= i0) return;
    after = i1;
    const pl = p.players[e.by];
    const from = at(i0);
    const to = at(i1);
    const touch = i0 * dt;
    const land = i1 * dt;
    const moment: Moment = {
      id: `real-${p.kind}-${j}`,
      eventIds: [],
      t: touch,
      minute: 0,
      kind: e.kind === "shot" ? "shot" : "pass",
      side: pl.side,
      player: `#${pl.number}`,
      outcome: e.kind === "shot" ? "off_target" : e.ok ? "complete" : "incomplete",
      from,
      to,
      speed: dist(from, to) / Math.max(dt, land - touch),
      winner: null,
      pressed: false,
      assistTo: null,
      priority: e.kind === "shot" ? 2 : 6,
    };
    const receiver = e.to !== null && e.to !== undefined && e.kind === "pass" ? realId(p.players[e.to]) : null;
    beats.push({ moment, s: Math.max(0, touch - 0.45), touch, land, end: land + 0.3, ideal: touch, actor: realId(pl), receiver, winnerShown: false });
  });

  return {
    tracks,
    ball,
    ghost: [],
    beats,
    dropped: [],
    start: 0,
    end: (n - 1) * dt,
    initialBall: { at: at(0), side: p.poss[0] === "a" ? "away" : "home" },
  };
}
