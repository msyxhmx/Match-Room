// Mirrors contract/models.py. If the Python contract changes, update this file
// and regenerate the mock with `make schema` (contract/halftime.schema.json is
// the machine-readable version).

export type Side = "home" | "away";

export interface Team {
  id: string;
  name: string;
  short_name: string;
}

export interface MatchEvent {
  event_id: string;
  match_id: string;
  minute: number;
  second: number;
  side: Side;
  team_id: string;
  player: string;
  type: "pass" | "shot" | "foul" | "card" | "corner" | "pressure" | "tackle" | "interception";
  x: number;
  y: number;
  outcome: string;
  xg: number | null;
  end_x: number | null;
  end_y: number | null;
  speed_kmh: number | null;
  under_pressure: boolean | null;
}

export interface StatLine {
  key: string;
  label: string;
  home: number;
  away: number;
}

export interface MomentumBlock {
  start_minute: number;
  end_minute: number;
  home_share: number;
}

export interface EvidenceRef {
  event_id: string;
  minute: number;
  description: string;
}

export interface InsightCard {
  id: string;
  title: string;
  body: string;
  evidence: EvidenceRef[];
}

export interface Factor {
  feature: string;
  label: string;
  value: number;
  impact: number;
  favours: Side;
}

export interface Prediction {
  result: { home_win: number; draw: number; away_win: number };
  next_goal: { home: number; away: number; none: number };
  factors: Factor[];
}

export interface WatchItem {
  id: string;
  title: string;
  detail: string;
}

export interface HalftimeReport {
  match_id: string;
  generated_at: string;
  home: Team;
  away: Team;
  score: { home: number; away: number };
  stats: StatLine[];
  momentum: MomentumBlock[];
  story: InsightCard[];
  prediction: Prediction;
  what_to_watch: WatchItem[];
  meta: { model_version: string; story_source: "llm" | "template"; synthetic: boolean };
}

export interface MatchSummary {
  match_id: string;
  home: Team;
  away: Team;
  scenario: string | null; // scripted storyline key, null = organic match
  title: string | null;
}
