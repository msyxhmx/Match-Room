// How numbers and minutes are written on screen (DESIGN §7, §8.1). Every component formats
// through these, so the UI and the engine's card text never disagree on camera.

import type { FactUsed, LiveCard, Score, TurningPoint } from "../types/live";

/**
 * Engine text with every score's hyphen made non-breaking ("0-1" never splits as "0-" / "1").
 * U+2011 looks the same as the engine's hyphen, so the words stay exactly as written.
 */
export function keepScores(text: string): string {
  return text.replace(/(\d)-(\d)/g, "$1\u2011$2");
}

/** "2–2": an en dash in the UI chrome. Card text keeps the engine's hyphen. */
export function formatScore(score: Score): string {
  return `${score.home}–${score.away}`;
}

/**
 * A 0–1 probability as a whole percentage, rounded exactly like the engine's text
 * (`round(float(v) * 100)` in live/narrate.py): Python rounds an exact half to even. Same
 * float maths, same answer: 0.685 → "69%" (68.50000000000001), 0.885 → "88%" (88.5 exactly).
 * Prefer a card's own fact string where there is one; this is for raw numbers.
 */
export function formatPct(p: number): string {
  const v = p * 100;
  const floor = Math.floor(v);
  const r = v - floor === 0.5 ? (floor % 2 === 0 ? floor : floor + 1) : Math.round(v);
  return `${r}%`;
}

/** "74'" from 74, "45+2'" from 47 in the first half, "90+4'" from 94. */
export function formatMinute(minute: number, period?: "1H" | "2H" | string): string {
  if (period === "1H" && minute > 45) return `45+${minute - 45}'`;
  if (minute > 90) return `90+${minute - 90}'`;
  return `${minute}'`;
}

/** The card's own minute label. The engine's clock is "74:10"; on screen we write "74'". */
export function cardMinute(card: Pick<LiveCard, "minute" | "clock">): string {
  // A clock the engine already wrote as stoppage time ("90+4'") is kept as it is.
  return card.clock.includes("+") ? card.clock : formatMinute(card.minute);
}

/** The win-chance swing a card proves, read from its facts (never parsed from the prose). */
export interface Swing {
  before: string; // "5%", exactly as in the facts
  after: string; // "28%"
  rising: boolean;
}

export function swingOf(card: Pick<LiveCard, "facts_used">): Swing | null {
  const value = (key: string) => card.facts_used.find((f: FactUsed) => f.key === key)?.value;
  const before = value("win_before");
  const after = value("win_after");
  if (!before || !after) return null;
  return { before, after, rising: parseFloat(after) >= parseFloat(before) };
}

/**
 * A turning point's swing, taken from its card when we have it. TurningPoint stores win chances
 * rounded to 3 decimals, so 14' arrives as 0.685 ("68%") while its card, built from the full
 * value, says "69%". The card is what the viewer already saw, so it wins.
 */
export function turningSwing(
  tp: Pick<TurningPoint, "insight_id" | "win_before" | "win_after">,
  cards: Pick<LiveCard, "insight_id" | "facts_used">[],
): Swing {
  const card = cards.find((c) => c.insight_id === tp.insight_id);
  return (card && swingOf(card)) ?? {
    before: formatPct(tp.win_before),
    after: formatPct(tp.win_after),
    rising: tp.win_after >= tp.win_before,
  };
}

/**
 * Scorer strings for the score header, one per player: "K. Quinn 14', 37'". Goal cards are
 * grouped by side, then by player (the scorer is `players[0]`), minutes in order.
 */
export function scorersFrom(cards: LiveCard[]): { home: string[]; away: string[] } {
  const out: { home: string[]; away: string[] } = { home: [], away: [] };
  const goals = cards
    .filter((c) => c.type === "goal" && (c.side === "home" || c.side === "away") && c.players.length)
    .sort((a, b) => a.minute - b.minute || a.second - b.second);
  for (const side of ["home", "away"] as const) {
    const byPlayer = new Map<string, string[]>();
    for (const c of goals.filter((g) => g.side === side)) {
      const list = byPlayer.get(c.players[0]) ?? [];
      list.push(cardMinute(c));
      byPlayer.set(c.players[0], list);
    }
    out[side] = [...byPlayer].map(([name, minutes]) => `${name} ${minutes.join(", ")}`);
  }
  return out;
}
