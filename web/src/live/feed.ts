// The match as the screens see it, and the pure steps that build it: start from a snapshot,
// apply each stream tick, take the briefs. The hook (useMatchFeed) feeds these from the API,
// the websocket or the saved match; the screens never know which.

import type { AgentStep, MatchEvent } from "../types/halftime";
import type {
  LiveCard,
  LiveSnapshot,
  Lineups,
  MatchBrief,
  OverlayMessage,
  Profile,
  StreamTick,
} from "../types/live";
import { matchSeconds } from "./stage";

export type MatchView = Omit<LiveSnapshot, "cards" | "overlays" | "recent_events" | "metrics"> & {
  /** Every card so far, chronological (the snapshot sends newest first). */
  cards: LiveCard[];
  /** Every overlay graphic so far, in `seq` order. */
  overlays: OverlayMessage[];
  halftime: MatchBrief | null;
  fulltime: MatchBrief | null;
  /** The half-time agents' steps. `null` until known; `[]` means they did not run (#9). */
  agentTrace: AgentStep[] | null;
  /** Every match event so far, chronological by minute then second. */
  events: MatchEvent[];
  /** The squads, once known. */
  lineups: Lineups | null;
};

const bySeconds = (a: LiveCard, b: LiveCard) => matchSeconds(a) - matchSeconds(b);

export function fromSnapshot(s: LiveSnapshot): MatchView {
  const { cards, overlays, recent_events: _e, metrics: _m, ...rest } = s;
  return {
    ...rest,
    cards: [...cards].sort(bySeconds),
    overlays: [],
    halftime: null,
    fulltime: null,
    agentTrace: null,
    events: [],
    lineups: null,
  };
}

/** New events onto the list, chronological; ids we already have are skipped (a reconnect). */
export function addEvents(have: MatchEvent[], incoming: MatchEvent[]): MatchEvent[] {
  if (!incoming.length) return have;
  const seen = new Set(have.map((e) => e.event_id));
  const fresh = incoming.filter((e) => !seen.has(e.event_id));
  if (!fresh.length) return have;
  return [...have, ...fresh].sort((a, b) => a.minute - b.minute || a.second - b.second);
}

/** One match minute from the stream. Series grow by the tick's own values (they match). */
export function applyTick(v: MatchView, t: StreamTick): MatchView {
  if (t.minute <= v.minute) return v; // a replay after a reconnect
  const s = v.series;
  const p = t.projection;
  return {
    ...v,
    minute: t.minute,
    clock: t.clock,
    period: t.period,
    score: t.score,
    control: t.control,
    projection: p,
    series: {
      minute: [...s.minute, t.minute],
      momentum: [...s.momentum, t.control.momentum],
      control_home: [...s.control_home, t.control.home_share],
      chaos: [...s.chaos, t.control.chaos],
      home_win: [...s.home_win, p.home_win],
      draw: [...s.draw, p.draw],
      away_win: [...s.away_win, p.away_win],
    },
    cards: [...v.cards, ...[...t.new_cards].sort(bySeconds)],
    overlays: [...v.overlays, ...t.new_overlays],
    events: addEvents(v.events, t.new_events ?? []), // the saved ticks carry none
  };
}

export function applyBrief(v: MatchView, brief: MatchBrief): MatchView {
  return brief.kind === "halftime" ? { ...v, halftime: brief } : { ...v, fulltime: brief };
}

/**
 * The same match in another language or depth: `fresh` is the API's view at our minute, in the
 * new words. Our clock and series stay. Cards keep their insight_id, so the screen cross-fades
 * text instead of re-arriving; cards that came in while `fresh` loaded are kept.
 */
export function relabel(v: MatchView, fresh: MatchView): MatchView {
  const later = v.cards.filter((c) => c.minute > fresh.minute);
  return {
    ...v,
    profile: fresh.profile,
    meta: fresh.meta,
    control: v.minute === fresh.minute ? fresh.control : v.control,
    projection: v.minute === fresh.minute ? fresh.projection : v.projection,
    cards: [...fresh.cards, ...later],
    overlays: fresh.overlays,
    halftime: fresh.halftime,
    fulltime: fresh.fulltime,
    events: v.events,
    lineups: v.lineups,
  };
}

/** A recorded match fast-forwarded to minute `m`: kick-off, every tick up to `m`, the briefs. */
export function replay(
  start: LiveSnapshot,
  ticks: StreamTick[],
  m: number,
  briefs: { halftime?: MatchBrief; fulltime?: MatchBrief } = {},
  extra: { events?: MatchEvent[]; lineups?: Lineups } = {},
): MatchView {
  let v = fromSnapshot(start);
  for (const t of ticks) if (t.minute <= m) v = applyTick(v, t);
  if (m >= 45 && briefs.halftime) v = applyBrief(v, briefs.halftime);
  if (m >= 90 && briefs.fulltime) v = applyBrief(v, briefs.fulltime);
  // Ticks carry no events offline, so the recorded list stands in; later ones are skipped by id.
  return { ...v, events: (extra.events ?? []).filter((e) => e.minute <= m), lineups: extra.lineups ?? null };
}

/** Same profile? Only these four fields matter to the engine. */
export function sameProfile(a: Profile, b: Profile): boolean {
  return a.persona === b.persona && a.language === b.language && a.team === b.team && a.player === b.player;
}

/** Match seconds "now" for the moment rule: the end of the current minute's tick. */
export function nowSeconds(v: Pick<MatchView, "minute">): number {
  return v.minute * 60 + 59;
}
