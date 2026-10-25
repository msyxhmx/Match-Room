// Events to "moments": what the pitch can show. The feed's events are independent draws per
// minute, except inside one second, where they chain: pressure on the passer, the pass, and the
// tackle or interception at the pass's end. One chain is one moment, played at real speed.
// Nothing here invents an event: a moment only carries real events' ids, players and spots.

import { attackSign, dist, GOAL_HALF, HALF_L, toWorld, type Side, type Vec } from "./geometry";

/** The fields the pitch reads (the saved events drop the rest). */
export interface PitchEvent {
  event_id: string;
  minute: number;
  second: number;
  side: Side;
  player: string;
  type: "pass" | "shot" | "foul" | "card" | "corner" | "pressure" | "tackle" | "interception";
  x: number;
  y: number;
  outcome: string;
  end_x?: number | null;
  end_y?: number | null;
  speed_kmh?: number | null;
}

export type MomentKind = "pass" | "shot" | "foul" | "card" | "corner";

export interface Moment {
  /** The main event's id. */
  id: string;
  /** Every real event the moment shows. */
  eventIds: string[];
  /** Match seconds of the touch (minute × 60 + second). */
  t: number;
  minute: number;
  kind: MomentKind;
  side: Side;
  player: string;
  outcome: string;
  /** Where the touch is: the event's real coordinates, in world metres. */
  from: Vec;
  /** Where the ball goes: a pass's real end, or a shot's target (illustrative: the data has none). */
  to: Vec | null;
  /** Ball speed in m/s, from speed_kmh where the event has it. */
  speed: number;
  /** The tackle or interception that won the ball at the pass's end, if any. */
  winner: { id: string; player: string; side: Side } | null;
  pressed: boolean;
  /** A completed pass the match's goal alert credits as the assist ("Set up by …"): the
   *  scorer, who must be the one shown receiving it. */
  assistTo: string | null;
  /** Lower is more important: goal 0, card 1, shot 2, corner 3, foul 4, won pass 5, pass 6. */
  priority: number;
}

export const isGoal = (m: Pick<Moment, "kind" | "outcome">) => m.kind === "shot" && m.outcome === "goal";

const other = (s: Side): Side => (s === "home" ? "away" : "home");

/** A stable 0–1 number from an id, for the few illustrative choices (where a shot ends). */
export function hash01(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10007) / 10007;
}

/**
 * Where a shot ends. The data has the shooter's spot and the outcome, not the ball's end, so
 * this is the one illustrative ball position: in the net for a goal, at the keeper for a save,
 * a few metres out for a block, past the post for a miss.
 */
export function shotTarget(side: Side, from: Vec, outcome: string, id: string): Vec {
  const s = attackSign(side);
  const h = hash01(id);
  switch (outcome) {
    case "goal":
      return { x: s * (HALF_L + 1.2), y: (h * 2 - 1) * (GOAL_HALF - 0.7) };
    case "saved":
      return { x: s * (HALF_L - 1.4), y: from.y * 0.12 + (h - 0.5) * 3 };
    case "blocked": {
      const goal = { x: s * HALF_L, y: 0 };
      const k = Math.min(0.35, 5.5 / Math.max(1, dist(from, goal)));
      return { x: from.x + (goal.x - from.x) * k, y: from.y + (goal.y - from.y) * k };
    }
    default: {
      const side_ = h < 0.5 ? -1 : 1;
      return { x: s * (HALF_L + 2), y: side_ * (GOAL_HALF + 1 + 3 * hash01(id + "w")) };
    }
  }
}

const PRIORITY = { card: 1, shot: 2, corner: 3, foul: 4 } as const;

export function toMoments(events: PitchEvent[]): Moment[] {
  const sorted = [...events].sort((a, b) => a.minute - b.minute || a.second - b.second);
  const out: Moment[] = [];
  let i = 0;
  while (i < sorted.length) {
    const t = sorted[i].minute * 60 + sorted[i].second;
    const group: PitchEvent[] = [];
    while (i < sorted.length && sorted[i].minute * 60 + sorted[i].second === t) group.push(sorted[i++]);

    let pressed: PitchEvent | null = null;
    let last: Moment | null = null;
    for (const e of group) {
      if (e.type === "pressure") {
        pressed = e;
        continue;
      }
      if (e.type === "tackle" || e.type === "interception") {
        // A win counts only where the failed pass really ended (it sits at the mirrored end).
        if (last && last.kind === "pass" && last.outcome !== "complete" && !last.winner && last.to) {
          const at = toWorld(e.side, e.x, e.y);
          if (e.side === other(last.side) && dist(at, last.to) < 3) {
            last.winner = { id: e.event_id, player: e.player, side: e.side };
            last.eventIds.push(e.event_id);
            last.priority = Math.min(last.priority, 5);
          }
        }
        continue;
      }
      const from = toWorld(e.side, e.x, e.y);
      const kind = e.type as MomentKind;
      let to: Vec | null = null;
      if (kind === "pass" && e.end_x != null && e.end_y != null) to = toWorld(e.side, e.end_x, e.end_y);
      if (kind === "shot") to = shotTarget(e.side, from, e.outcome, e.event_id);
      const m: Moment = {
        id: e.event_id,
        eventIds: [e.event_id],
        t,
        minute: e.minute,
        kind,
        side: e.side,
        player: e.player,
        outcome: e.outcome,
        from,
        to,
        speed: e.speed_kmh ? e.speed_kmh / 3.6 : kind === "shot" ? 24 : 15,
        winner: null,
        pressed: false,
        assistTo: null,
        priority: kind === "pass" ? 6 : isGoal({ kind, outcome: e.outcome }) ? 0 : PRIORITY[kind],
      };
      // Pressure on this passer: same second, the other team, at the passer's (mirrored) spot.
      // The pitch shows it as generic pressing by the nearest opponents, not by the named
      // player (pressure rows' players often sit far from their role), so its id isn't claimed.
      if (pressed && pressed.side === other(e.side) && dist(toWorld(pressed.side, pressed.x, pressed.y), from) < 3) {
        m.pressed = true;
      }
      pressed = null;
      out.push(m);
      last = m;
    }
  }
  linkAssists(out);
  return out;
}

/**
 * The engine's assist rule (live/insights.py): the last completed pass by the scoring side, from
 * the minute before the goal. The goal alert names its passer, so the pitch must show the scorer
 * receiving that pass.
 */
function linkAssists(ms: Moment[]) {
  ms.forEach((g, i) => {
    if (!isGoal(g)) return;
    for (let j = i - 1; j >= 0; j--) {
      const p = ms[j];
      if (p.minute < g.minute - 1) break;
      if (p.side === g.side && p.kind === "pass" && p.outcome === "complete") {
        if (p.player !== g.player) p.assistTo = g.player;
        break;
      }
    }
  });
}
