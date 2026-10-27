// The numbers the web layout shows beside the engine's cards. The engine's own metrics win when
// they're current (the live stream sends them every minute); the saved match carries none, so
// offline the same stats are counted from the match events, with the engine's definitions
// (contract/live.py): possession = share of passes, on target = scored or saved, and so on.

import type { MatchEvent, Side } from "../../types/halftime";
import type { LiveCard, MetricLine, PlayerLine } from "../../types/live";
import type { MatchView } from "../../live/feed";
import type { Labels } from "../../ui/labels";

export interface StatRow {
  key: string;
  label: string;
  definition?: string;
  home: number;
  away: number;
  /** As shown: "2.69", "51%", "124 km/h". */
  shown: { home: string; away: string };
  /** Which side gets the filled pill; none for a stat where more isn't better or worse. */
  leader: Side | null;
}

/** Stats where the smaller number is the better one. */
const LOWER_WINS = new Set(["ppda"]);
/** Stats with no better side: no pill. */
const NO_LEADER = new Set(["avg_pass_length", "pass_difficulty", "pressures", "fouls"]);

function number(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Math.round(v * 100) / 100);
}

function shown(v: number, unit: string | null): string {
  if (!unit) return number(v);
  return unit === "%" ? `${number(v)}%` : `${number(v)} ${unit}`;
}

function leaderOf(key: string, home: number, away: number): Side | null {
  if (NO_LEADER.has(key) || home === away) return null;
  const homeAhead = LOWER_WINS.has(key) ? home < away : home > away;
  return homeAhead ? "home" : "away";
}

export function rowFromMetric(m: MetricLine): StatRow {
  return {
    key: m.key,
    label: m.label,
    definition: m.definition,
    home: m.home,
    away: m.away,
    shown: { home: shown(m.home, m.unit), away: shown(m.away, m.unit) },
    leader: leaderOf(m.key, m.home, m.away),
  };
}

/** The stats counted from the events, for when the engine's metrics aren't current. */
export function statsFromEvents(events: MatchEvent[], labels: Labels): StatRow[] {
  const count = (side: Side, test: (e: MatchEvent) => boolean) => events.filter((e) => e.side === side && test(e)).length;
  const sum = (side: Side, test: (e: MatchEvent) => boolean, of: (e: MatchEvent) => number) =>
    events.filter((e) => e.side === side && test(e)).reduce((t, e) => t + of(e), 0);
  const isShot = (e: MatchEvent) => e.type === "shot";
  const isPass = (e: MatchEvent) => e.type === "pass";
  const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

  const xg = (s: Side) => Math.round(sum(s, isShot, (e) => e.xg ?? 0) * 100) / 100;
  const passes = (s: Side) => count(s, isPass);
  const done = (s: Side) => count(s, (e) => isPass(e) && e.outcome === "complete");
  const allPasses = passes("home") + passes("away");

  const raw: [string, string, number, number, string | null][] = [
    ["xg", labels.statXg, xg("home"), xg("away"), null],
    ["shots", labels.statShots, count("home", isShot), count("away", isShot), null],
    [
      "sot",
      labels.statOnTarget,
      count("home", (e) => isShot(e) && (e.outcome === "goal" || e.outcome === "saved")),
      count("away", (e) => isShot(e) && (e.outcome === "goal" || e.outcome === "saved")),
      null,
    ],
    ["possession", labels.statPossession, pct(passes("home"), allPasses), allPasses ? 100 - pct(passes("home"), allPasses) : 0, "%"],
    ["pass_accuracy", labels.statPassAccuracy, pct(done("home"), passes("home")), pct(done("away"), passes("away")), "%"],
    ["corners", labels.statCorners, count("home", (e) => e.type === "corner"), count("away", (e) => e.type === "corner"), null],
    ["fouls", labels.statFouls, count("home", (e) => e.type === "foul"), count("away", (e) => e.type === "foul"), null],
  ];
  // The saved match's events carry xG to one decimal (enough for the pitch): summing those would
  // drift from the engine's figure, so offline we leave xG out rather than show a wrong number.
  const shots = events.filter(isShot);
  const roughXg = shots.length > 0 && shots.every((e) => Math.abs((e.xg ?? 0) * 10 - Math.round((e.xg ?? 0) * 10)) < 1e-9);
  return raw.filter(([key]) => !(key === "xg" && roughXg)).map(([key, label, home, away, unit]) => ({
    key,
    label,
    home,
    away,
    shown: { home: shown(home, unit), away: shown(away, unit) },
    leader: leaderOf(key, home, away),
  }));
}

/** Every stat for this minute, and whether it was counted here rather than sent by the engine. */
export function liveStats(view: MatchView, labels: Labels): { rows: StatRow[]; fromEvents: boolean } {
  const current = view.metricsMinute === view.minute && view.metrics.length > 0 && view.minute > 0;
  if (current) return { rows: view.metrics.map(rowFromMetric), fromEvents: false };
  return { rows: statsFromEvents(view.events, labels), fromEvents: true };
}

const TOP = ["xg", "shots", "sot", "field_tilt", "ppda", "possession", "pass_accuracy"];

/** The five stats for the overview card, in this order where they exist. */
export function topStats(rows: StatRow[]): StatRow[] {
  return TOP.map((k) => rows.find((r) => r.key === k)).filter((r): r is StatRow => !!r).slice(0, 5);
}

export interface PlayerNow {
  name: string;
  number?: number;
  position?: string;
  touches?: string;
  ballWins?: string;
  passes: { done: number; total: number };
  pressures: number;
  goals: number;
}

/**
 * The followed player right now. Touches and ball wins come from their latest "so far" card
 * (checked numbers, exactly as the card says them); passes and goals are counted from the events.
 */
export function playerNow(view: MatchView): PlayerNow | null {
  const name = view.profile.player;
  if (!name) return null;
  const focus = [...view.cards].reverse().find((c) => c.type === "player_focus" && c.players[0] === name);
  const fact = (c: LiveCard | undefined, key: string) => c?.facts_used.find((f) => f.key === key)?.value;
  const snap: PlayerLine | null = view.focus_player?.name === name ? view.focus_player : null;
  const mine = view.events.filter((e) => e.player === name);
  const ref = view.lineups?.players.find((p) => p.name === name);
  return {
    name,
    number: ref?.number ?? snap?.number,
    position: ref?.position ?? snap?.position,
    touches: fact(focus, "touches") ?? (snap ? String(snap.touches) : undefined),
    ballWins: fact(focus, "ball_wins") ?? (snap ? String(snap.ball_wins) : undefined),
    passes: {
      done: mine.filter((e) => e.type === "pass" && e.outcome === "complete").length,
      total: mine.filter((e) => e.type === "pass").length,
    },
    pressures: mine.filter((e) => e.type === "pressure").length,
    goals: mine.filter((e) => e.type === "shot" && e.outcome === "goal").length,
  };
}

/** A 0–1 chaos value in words: the engine calls a phase chaotic above 0.8. */
export function chaosWord(chaos: number): "calm" | "lively" | "wild" {
  return chaos >= 0.65 ? "wild" : chaos >= 0.4 ? "lively" : "calm";
}
