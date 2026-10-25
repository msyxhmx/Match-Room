// The moment rule: which card holds the stage, and for how long (handoff §5.2).
//
// The engine sends several cards a minute, so "show the newest" is wrong: at 75:37 the newest
// card is "Pass of the moment", 87 seconds after the equaliser. A rule replays the match's cards
// in order and says which one is on stage at any match time. Swapping rules is one constant.
//
// Pure: same cards, same time, same answer. The screens and the lab both call it.

import type { LiveCard } from "../types/live";

export type MomentRule = "newest-explained" | "goals-hold" | "every-notable";

/** The rule the screens use. Ilham picks one of the three in the gallery. */
export const MOMENT_RULE: MomentRule = "goals-hold";

/** Match time in seconds: 74:10 → 4450. */
export function matchSeconds(card: Pick<LiveCard, "minute" | "second">): number {
  return card.minute * 60 + card.second;
}

/** How long a card of each priority is protected from a less important one, in match seconds. */
const HOLD: Record<MomentRule, Record<1 | 2 | 3, number>> = {
  "newest-explained": { 1: 0, 2: 0, 3: 0 },
  "goals-hold": { 1: 5 * 60, 2: 2 * 60, 3: 0 },
  "every-notable": { 1: 5 * 60, 2: 2 * 60, 3: 0 },
};

/** Can this card take the stage at all? */
function eligible(rule: MomentRule, card: LiveCard): boolean {
  switch (rule) {
    case "newest-explained":
    case "goals-hold":
      // The why-line is the product (DESIGN §5): a card with nothing to explain stays off stage.
      return card.priority <= 2 && card.why.length > 0;
    case "every-notable":
      // Also the stat cards with no why-line ("L. Quinn so far", every 15').
      return card.priority <= 2;
  }
}

/** Your player beats your team beats everyone else, when two cards land in the same second. */
function personal(card: LiveCard): number {
  if (card.tags.includes("focus_player")) return 2;
  if (card.tags.includes("your_team") || card.tags.includes("against_your_team")) return 1;
  return 0;
}

function chronological(a: LiveCard, b: LiveCard): number {
  return matchSeconds(a) - matchSeconds(b) || a.priority - b.priority || personal(b) - personal(a);
}

/**
 * The card on stage at match time `at` (seconds), or null before the first eligible card.
 * `cards` may come in any order (snapshots send newest first).
 *
 * A new eligible card takes the stage when it is at least as important as the one there, or
 * when the one there has used up its hold. Nothing ever empties the stage mid-match: an
 * expired card stays until something replaces it.
 */
export function pickStage(cards: LiveCard[], at: number, rule: MomentRule = MOMENT_RULE): LiveCard | null {
  let stage: LiveCard | null = null;
  for (const card of [...cards].sort(chronological)) {
    const t = matchSeconds(card);
    if (t > at) break;
    if (!eligible(rule, card)) continue;
    if (!stage) {
      stage = card;
      continue;
    }
    const held = t - matchSeconds(stage) < HOLD[rule][stage.priority];
    if (card.priority <= stage.priority || !held) stage = card;
  }
  return stage;
}
