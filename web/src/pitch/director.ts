// The director: which picture the pitch shows at a display time. The live flow, with a replay
// cut in for each goal and card at ×60 (TV grammar: cut to the replay, cut back to live).
// Pure: the component, the lab and the tests all ask the same function.

import { frameAt, type Frame, type FrameOptions } from "./frame";
import type { SquadPlayer } from "./formation";
import type { Moment } from "./moments";
import type { Timeline } from "./plan";
import { BUILD_UP, cutsToReplay, liveTimeline, replayMoment, type LiveOptions, type Replay } from "./schedule";

export interface Cut {
  /** Display time the replay starts. */
  at: number;
  replay: Replay;
}

export interface Shot {
  frame: Frame;
  /** The moment being replayed, or null for live. */
  replayOf: Moment | null;
  /** 0–1: dips at a cut, so the change reads as a cut and not a jump. */
  opacity: number;
}

export interface Program {
  live: Timeline;
  cuts: Cut[];
  shotAt: (t: number, o?: FrameOptions) => Shot;
  /** Display time each goal's ball crosses the line: the overlay holds the alert till then. */
  goalsLand: { t: number; moment: Moment }[];
}

const DIP = 0.18;

export function program(players: SquadPlayer[], moments: Moment[], o: LiveOptions): Program {
  const live = liveTimeline(players, moments, o);
  const cuts: Cut[] = [];
  const goalsLand: Program["goalsLand"] = [];
  if (o.speed > 2) {
    let free = -Infinity;
    for (const m of moments) {
      const arrived = o.arrivals.get(m.minute);
      if (arrived === undefined || !cutsToReplay(m)) continue;
      const at = Math.max(free, arrived + (m.t - m.minute * 60) / o.speed);
      if (at < o.start) continue;
      const replay = replayMoment(players, moments, m, BUILD_UP.cut);
      if (!replay) continue;
      cuts.push({ at, replay });
      free = at + replay.length;
      const g = replay.timeline.beats.find((b) => b.moment === m);
      if (g && m.kind === "shot") goalsLand.push({ t: at + g.land, moment: m });
    }
  } else {
    for (const b of live.beats) if (b.moment.kind === "shot" && b.moment.outcome === "goal") goalsLand.push({ t: b.land, moment: b.moment });
  }

  const shotAt = (t: number, fo?: FrameOptions): Shot => {
    for (const c of cuts) {
      const local = t - c.at;
      if (local >= 0 && local < c.replay.length) {
        const edge = Math.min(local, c.replay.length - local);
        return { frame: frameAt(c.replay.timeline, local, fo), replayOf: c.replay.headline, opacity: dip(edge) };
      }
      const after = t - (c.at + c.replay.length);
      if (after >= 0 && after < DIP) return { frame: frameAt(live, t, fo), replayOf: null, opacity: dip(after) };
    }
    return { frame: frameAt(live, t, fo), replayOf: null, opacity: 1 };
  };
  return { live, cuts, shotAt, goalsLand };
}

const dip = (edge: number) => (edge >= DIP ? 1 : 0.35 + 0.65 * (edge / DIP));

/** A single loop (a paused minute): replay the headline over and over. */
export function loopShot(r: Replay, t: number, o?: FrameOptions): Shot {
  const local = ((t % r.length) + r.length) % r.length;
  const edge = Math.min(local, r.length - local);
  return { frame: frameAt(r.timeline, local, o), replayOf: r.headline, opacity: dip(edge) };
}
