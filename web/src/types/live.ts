// Mirrors contract/live.py (Match-Room Live). If the Python contract changes,
// update this file and regenerate the mocks with `make schema`
// (contract/live.schema.json is the machine-readable version; real samples
// live in web/src/mock/live/).

import type { EvidenceRef, MatchEvent, Side, Team } from "./halftime";

export type Persona = "casual" | "analyst";
export type Language = "en" | "ms" | "es";
export type Period = "pre" | "1H" | "HT" | "2H" | "FT";
export type Phase = "home_control" | "away_control" | "chaos" | "balanced";
export type InsightType =
  | "goal"
  | "red_card"
  | "big_chance"
  | "shot_speed"
  | "pass_of_the_moment"
  | "momentum_flip"
  | "control_shift"
  | "chaos_phase"
  | "pressure_spike"
  | "win_prob_swing"
  | "tempo_shift"
  | "player_milestone"
  | "player_focus";
export type Graphic = "lower_third" | "alert" | "stat_bug" | "momentum_bar" | "player_tag";

export interface Profile {
  persona: Persona;
  language: Language;
  team: string | null; // favourite team id, e.g. "NGC"
  player: string | null; // focus player name, e.g. "L. Quinn"
}

export interface Score {
  home: number;
  away: number;
}

export interface MatchMeta {
  venue: string;
  referee: string;
  attendance: number;
  weather: string;
  scenario: string | null;
  scenario_title: string | null;
  synthetic: boolean;
}

export interface PlayerRef {
  name: string;
  number: number;
  position: string;
  team_id: string;
  side: Side;
}

export interface Lineups {
  match_id: string;
  home: Team;
  away: Team;
  meta: MatchMeta;
  players: PlayerRef[];
}

export interface MetricLine {
  key: string;
  label: string;
  home: number;
  away: number;
  unit: string | null;
  definition: string; // show on tap / hover
}

export interface ControlState {
  home_share: number; // 0-1; > 0.57 home in control, < 0.43 away in control
  chaos: number; // 0-1; > 0.80 chaotic phase
  tempo: number; // passes per minute, both teams, last 10'
  momentum: number; // -1 (away on top) .. +1 (home on top)
  phase: Phase;
  label: string; // localised, e.g. "Northgate City in control"
}

export interface Driver {
  key: string;
  label: string;
  value: string;
}

export interface WinProjection {
  home_win: number;
  draw: number;
  away_win: number;
  drivers: Driver[];
  note: string; // "a projection, not betting odds" in the viewer's language
}

export interface Series {
  minute: number[];
  momentum: number[];
  control_home: number[];
  chaos: number[];
  home_win: number[];
  draw: number[];
  away_win: number[];
}

export interface FactUsed {
  key: string;
  label: string;
  value: string; // exactly as it appears in the text
}

export interface LiveCard {
  insight_id: string;
  type: InsightType;
  variant: string;
  minute: number;
  second: number;
  clock: string;
  priority: 1 | 2 | 3; // 1 headline, 2 notable, 3 detail
  side: Side | null;
  team_id: string | null;
  players: string[];
  headline: string;
  body: string;
  why: string[];
  facts_used: FactUsed[]; // the trust trail
  evidence: EvidenceRef[];
  tags: string[]; // "your_team" | "against_your_team" | "focus_player"
  language: Language;
  persona: Persona;
  source: "template" | "llm";
}

export interface OverlayMessage {
  seq: number;
  match_id: string;
  minute: number;
  second: number;
  clock: string;
  graphic: Graphic;
  priority: number;
  ttl_s: number; // seconds on screen at real speed
  insight_id: string | null;
  language: Language;
  fields: Record<string, string>; // flat: binds to ${headline}-style template slots
}

export interface PlayerLine {
  name: string;
  number: number;
  position: string;
  team_id: string;
  side: Side;
  touches: number;
  passes: number;
  passes_completed: number;
  pass_accuracy: number;
  xt_added: number;
  shots: number;
  goals: number;
  xg: number;
  ball_wins: number;
  pressures: number;
  top_shot_speed_kmh: number | null;
  involvement: number[]; // touches per 15-minute block
  cards: string[];
}

export interface LiveSnapshot {
  match_id: string;
  minute: number;
  clock: string;
  period: Period;
  home: Team;
  away: Team;
  score: Score;
  meta: MatchMeta;
  profile: Profile;
  metrics: MetricLine[];
  control: ControlState;
  projection: WinProjection;
  series: Series;
  cards: LiveCard[]; // newest first
  overlays: OverlayMessage[]; // on screen at this minute
  focus_player: PlayerLine | null;
  recent_events: MatchEvent[]; // shots and cards, last 10'
}

export interface BriefPoint {
  title: string;
  body: string;
  facts_used: FactUsed[];
  evidence: EvidenceRef[];
}

export interface TurningPoint {
  insight_id: string;
  minute: number;
  clock: string;
  title: string;
  side: Side | null;
  win_before: number;
  win_after: number;
}

export interface ControlProfile {
  home_control: number;
  away_control: number;
  chaos: number;
  balanced: number;
}

export interface MatchBrief {
  match_id: string;
  kind: "halftime" | "fulltime";
  minute: number;
  home: Team;
  away: Team;
  score: Score;
  meta: MatchMeta;
  profile: Profile;
  headline: string;
  summary: string;
  summary_source: "template" | "llm";
  what_happened: LiveCard[];
  why: BriefPoint[];
  what_to_watch: BriefPoint[]; // half-time only
  turning_points: TurningPoint[];
  control_profile: ControlProfile;
  metrics: MetricLine[];
  projection: WinProjection | null; // half-time only
  player_of_the_match: PlayerLine | null; // full-time only
  focus_player: PlayerLine | null;
}

export interface CatchUp {
  match_id: string;
  minute: number;
  clock: string;
  home: Team;
  away: Team;
  score: Score;
  profile: Profile;
  headline: string;
  cards: LiveCard[];
  control: ControlState;
  projection: WinProjection;
}

export interface ScenarioInfo {
  key: string;
  match_id: string;
  title: string;
  description: string;
  home: Team;
  away: Team;
}

export interface SeasonRow {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goals_for: number;
  goals_against: number;
  points: number;
  xg_for: number;
  xg_against: number;
  control_share: number;
  chaos_share: number;
  wins_against_run: number;
}

export interface SeasonStoryline {
  id: string;
  title: string;
  body: string;
  team_id: string | null;
  facts_used: FactUsed[];
}

export interface SeasonReport {
  matches: number;
  profile: Profile;
  table: SeasonRow[];
  storylines: SeasonStoryline[];
}

// Websocket /api/matches/{id}/stream messages
export interface StreamTick {
  type: "tick";
  minute: number;
  clock: string;
  period: Period;
  score: Score;
  control: ControlState;
  projection: WinProjection;
  metrics: MetricLine[];
  new_events: MatchEvent[];
  new_cards: LiveCard[];
  new_overlays: OverlayMessage[];
}

export interface StreamBrief {
  type: "halftime" | "fulltime";
  brief: MatchBrief;
}

export type StreamMessage =
  | StreamTick
  | StreamBrief
  | { type: "end" }
  | { type: "error"; detail: string };
