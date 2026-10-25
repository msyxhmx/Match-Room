// Lab fixtures. Everything here is real engine output (scripts/export_lab_fixtures.py) or a
// small, named edit of it for an edge case. Never invent card text: the screenshots must show
// what the demo will really show.

import type { AgentStep } from "../types/halftime";
import type { LiveCard, LiveSnapshot, MatchBrief, OverlayMessage } from "../types/live";

import snap0 from "./fixtures/snapshot.0.en.json";
import snap15 from "./fixtures/snapshot.15.en.json";
import snap45 from "./fixtures/snapshot.45.en.json";
import snap75 from "./fixtures/snapshot.75.en.json";
import snap90 from "./fixtures/snapshot.90.en.json";
import snap75ms from "./fixtures/snapshot.75.ms.json";
import snap75es from "./fixtures/snapshot.75.es.json";
import snap75analyst from "./fixtures/snapshot.75.en-analyst.json";
import snap75msAnalyst from "./fixtures/snapshot.75.ms-analyst.json";
import overlaysEn from "./fixtures/overlays.en.json";
import overlaysMs from "./fixtures/overlays.ms.json";
import briefHt from "./fixtures/brief.halftime.en.json";
import briefFt from "./fixtures/brief.fulltime.en.json";
import briefFtMsAnalyst from "./fixtures/brief.fulltime.ms-analyst.json";

export const snapshots = {
  pre: snap0 as unknown as LiveSnapshot,
  m15: snap15 as unknown as LiveSnapshot,
  ht: snap45 as unknown as LiveSnapshot,
  m75: snap75 as unknown as LiveSnapshot,
  ft: snap90 as unknown as LiveSnapshot,
  m75ms: snap75ms as unknown as LiveSnapshot,
  m75es: snap75es as unknown as LiveSnapshot,
  m75analyst: snap75analyst as unknown as LiveSnapshot,
  m75msAnalyst: snap75msAnalyst as unknown as LiveSnapshot,
};

export const briefs = {
  halftime: briefHt as unknown as MatchBrief,
  fulltime: briefFt as unknown as MatchBrief,
  fulltimeMsAnalyst: briefFtMsAnalyst as unknown as MatchBrief,
};

export const overlays = {
  en: overlaysEn as unknown as OverlayMessage[],
  ms: overlaysMs as unknown as OverlayMessage[],
};

function find(snapshot: LiveSnapshot, minute: number, type: LiveCard["type"]): LiveCard {
  const card = snapshot.cards.find((c) => c.minute === minute && c.type === type);
  if (!card) throw new Error(`lab fixture: no ${type} card at ${minute}' in ${snapshot.minute}'`);
  return card;
}

/** The moments the video shows, by storyboard shot. */
export const cards = {
  /** S3: K. Quinn, 14', against your team, 22% → 69%. */
  goalAgainst: find(snapshots.m15, 14, "goal"),
  /** S1, S7: L. Quinn equalises at 74', your team and your player, 5% → 28%. */
  equaliser: find(snapshots.m75, 74, "goal"),
  equaliserMs: find(snapshots.m75ms, 74, "goal"),
  equaliserEs: find(snapshots.m75es, 74, "goal"),
  equaliserAnalyst: find(snapshots.m75analyst, 74, "goal"),
  /** The longest text the app can show: analyst, Malay. The clipping test. */
  equaliserMsAnalyst: find(snapshots.m75msAnalyst, 74, "goal"),
  /** S3: the 11' chaos phase, no side. */
  chaos: find(snapshots.m15, 11, "chaos_phase"),
  /** S6: momentum swings to Northgate City at 51'. */
  momentumFlip: find(snapshots.m75, 51, "momentum_flip"),
  /** A card the engine sends with no why-line (`why: []`). */
  noWhy: find(snapshots.m15, 15, "player_focus"),
  /** A priority-3 detail card. */
  detail: find(snapshots.m75, 67, "shot_speed"),
};

/** Stoppage time: the 87' winner's text, re-timed to 90+4'. Only the clock changes. */
export const stoppageCard: LiveCard = { ...find(snapshots.ft, 87, "goal"), minute: 94, clock: "90+4'" };

/**
 * LAB-ONLY FIXTURE, not engine output. The live API returns an empty trace until issue #9 is
 * fixed, so this walks through every action the AgentTrace must draw, in the order the
 * half-time agents run, worded like the real steps in model/agents.py (`step()` calls).
 */
export const agentTrace: AgentStep[] = [
  { agent: "analyst", action: "tool", detail: "get_stats()" },
  { agent: "analyst", action: "tool", detail: "get_key_events(kind=goals)" },
  { agent: "analyst", action: "tool", detail: "get_momentum()" },
  { agent: "analyst", action: "draft", detail: "Drafted 4 cards" },
  { agent: "fact_checker", action: "accept", detail: "Kingston Vale lead 0-2 at the break" },
  { agent: "fact_checker", action: "reject", detail: "Northgate in charge: 70% control is not in the stats (64%)" },
  { agent: "fact_checker", action: "retry", detail: "Sent 1 card(s) back to the analyst" },
  { agent: "analyst", action: "draft", detail: "Drafted 1 cards" },
  { agent: "fact_checker", action: "accept", detail: "Northgate in charge, Kingston clinical" },
];
