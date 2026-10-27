// Goal replays played by a real move (real/replays.json, from scripts/dfl_match.py): a recorded
// attack from the DFL tracking data whose touches come in the same order, by the same pattern of
// players, as the goal's move. Every dot follows a real player, so the replay moves like real
// football; the planner's replay stays for a goal with no fitting move, and for everything else.
//
// The rule (docs/architecture.md): a replay played by a real move may put a touch up to `capM`
// (25 m) from its event's spot, because the move is played as it was; the right player still
// makes each touch, in order. The live pitch never does. Anonymised: sides and slot numbers.
// Data: DFL / Sportec open data (Bassek et al. 2025), CC BY 4.0. See web/PITCH.md.

import type { Slot } from "./formation";
import type { Moment } from "./moments";
import type { BallKey, Beat, Key, Timeline, Track } from "./plan";
import type { Passage } from "./real";
import data from "./real/replays.json";

export interface RealReplay {
  /** The goal's event id. */
  goal: string;
  /** "as played", or "stretched 9%" (the pitch stretched so the real shot is on ours). */
  how: string;
  /** Our touches, oldest first, the shot last: when the real one is (passage seconds) and how
   *  far its ball is from our event's spot. */
  touches: { id: string; t: number; offM: number }[];
  passage: Passage;
}

export const REAL_REPLAYS = data as unknown as { match: string; capM: number; replays: RealReplay[] };

/** The real move for a goal, if one fits (only the saved match has them). */
export const realReplayFor = (goalId: string): RealReplay | null =>
  REAL_REPLAYS.replays.find((r) => r.goal === goalId) ?? null;

/** Our shot's flight into the net (m/s): a firm real shot. */
const SHOT_SPEED = 28;
/** A replay cut into the ×60 flow is kept short: the real move from this long before the shot,
 *  to this long after our shot lands (as the planner's cut). */
const CUT_LEAD = 2;
const CUT_TAIL = 0.4;

/**
 * The goal's move played by the real one, from display time 0. Every dot follows its matched real
 * player (same side and slot number); each of our touches is a beat at its real touch; the real
 * ball runs until the shot, then our shot flies into the net. `slots`: our 22 (formation.ts); a
 * player sent off before the goal isn't there. `cut`: only the shot's last seconds.
 */
export function realTimeline(r: RealReplay, slots: Slot[], moments: Moment[], cut = false): Timeline | null {
  const p = r.passage;
  const byId = new Map(moments.map((m) => [m.id, m]));
  const all = r.touches.map((tc) => ({ ...tc, moment: byId.get(tc.id) }));
  if (all.some((tc) => !tc.moment)) return null;
  const shot = all[all.length - 1];

  // Our shot flies on at a real shot's pace from where the real one was struck.
  const k0 = Math.round(shot.t * p.hz);
  const strike = { x: p.ball.x[k0] / 10, y: p.ball.y[k0] / 10 };
  const to = shot.moment!.to ?? { x: Math.sign(strike.x) * 53.7, y: 0 };
  const flight = Math.max(0.35, Math.hypot(to.x - strike.x, to.y - strike.y) / SHOT_SPEED);

  // The frames shown (i0..i1 of the passage) and display time from the first.
  const last = p.ball.x.length - 1;
  const i0 = cut ? Math.max(0, Math.floor((shot.t - CUT_LEAD) * p.hz)) : 0;
  const i1 = cut ? Math.min(last, Math.ceil((shot.t + flight + CUT_TAIL) * p.hz)) : last;
  const off = i0 / p.hz;
  const at = (i: number) => i / p.hz - off;
  const end = Math.max(at(i1), shot.t - off + flight + (cut ? CUT_TAIL : 0.1));
  const touches = all.filter((tc) => tc === shot || tc.t - off >= 0.45).map((tc) => ({ ...tc, t: tc.t - off }));

  const sentOff = new Set(
    moments
      .filter((m) => m.kind === "card" && (m.outcome === "red" || m.outcome === "second_yellow") && m.t < shot.moment!.t)
      .map((m) => `${m.side}:${m.player}`),
  );
  const out: Record<string, Track> = {};
  for (const slot of slots) {
    if (sentOff.has(slot.id)) continue;
    const k = p.players.findIndex((pl) => pl.side === slot.side && pl.number === slot.number);
    if (k < 0) return null;
    // Two frames either side of those shown: the curve through the keys eases to a stop on the
    // first and last, which would hurry the frames next to them.
    const keys: Key[] = [];
    for (let i = Math.max(0, i0 - 2); i <= Math.min(last, i1 + 2); i++) keys.push({ t: at(i), x: p.x[k][i] / 10, y: p.y[k][i] / 10 });
    out[slot.id] = { slot, keys, offAt: null };
  }
  const actorOf = (m: Moment) => Object.keys(out).find((id) => out[id].slot.side === m.side && out[id].slot.name === m.player);
  if (touches.some((tc) => !actorOf(tc.moment!))) return null;

  // One moment on screen at a time: each pass ends as the next touch's run-up starts; the goal
  // holds to the end (the scorer celebrates, the keeper's dive stays made).
  const beats: Beat[] = [];
  touches.forEach((tc, j) => {
    const next = touches[j + 1];
    const land = next ? Math.max(tc.t + 0.2, next.t - 0.5) : tc.t + flight;
    beats.push({
      moment: tc.moment!,
      s: Math.max(beats[j - 1]?.end ?? 0, tc.t - 0.45),
      touch: tc.t,
      land,
      end: next ? land : end,
      ideal: tc.t,
      actor: actorOf(tc.moment!)!,
      receiver: next && tc.moment!.kind === "pass" ? actorOf(next.moment!)! : null,
      winnerShown: false,
    });
  });
  const shotAt = shot.t - off;
  const ball: BallKey[] = [];
  for (let i = i0; i <= i1 && at(i) <= shotAt; i++)
    ball.push({ t: at(i), x: p.ball.x[i] / 10, y: p.ball.y[i] / 10, z: p.ball.z[i] / 10, a: 1, ease: "linear", arc: 0 });
  ball.push({ t: shotAt + flight, x: to.x, y: to.y, a: 1, ease: "linear", arc: 0 });
  ball.push({ t: Math.max(end, shotAt + flight + 0.1), x: to.x, y: to.y, a: 1, ease: "hold", arc: 0 });
  return {
    tracks: out,
    ball,
    ghost: [],
    beats,
    dropped: [],
    start: 0,
    end,
    initialBall: { at: { x: p.ball.x[i0] / 10, y: p.ball.y[i0] / 10 }, side: touches[0].moment!.side },
  };
}
