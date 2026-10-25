import type { LabModule, LabState } from "../../lab/types";
import { cards, snapshots, stoppageCard } from "../../lab/fixtures";
import type { LiveCard, LiveSnapshot } from "../../types/live";
import { MomentCard } from "./MomentCard";

function show(card: LiveCard, snap: LiveSnapshot, extra: { empty?: boolean; loading?: boolean } = {}) {
  const team = card.side === "away" ? snap.away : card.side === "home" ? snap.home : undefined;
  return <MomentCard card={card} team={team} note={snap.projection.note} {...extra} />;
}

function state(
  name: string,
  note: string,
  card: LiveCard,
  snap: LiveSnapshot,
  opts: Partial<LabState> & { empty?: boolean; loading?: boolean } = {},
): LabState {
  const { empty, loading, ...rest } = opts;
  return {
    name,
    note,
    language: card.language,
    width: "min(1440px, 100%)",
    render: () => show(card, snap, { empty, loading }),
    ...rest,
  };
}

const m75 = snapshots.m75;
const m15 = snapshots.m15;
const video: LabState["canvases"] = ["video"];

export default {
  component: "MomentCard",
  summary: "The product: one moment, why it matters, proof one tap away.",
  states: [
    state("equaliser", "NGC equaliser, your player: why-line and swing on a tinted band.", cards.equaliser, m75),
    state("goal-against", "S3: goal against your team, muted tag, no glow.", cards.goalAgainst, m15),
    state("chaos", "Chaos phase: neutral tag, no side, no glow.", cards.chaos, m15, { canvases: video }),
    state("momentum-flip", "S6: momentum swings to Northgate City.", cards.momentumFlip, m75, { canvases: video }),
    state("no-why", "Card with no why-line: no why, no swing, no gap.", cards.noWhy, m15),
    state("equaliser-ms", "Malay labels and note.", cards.equaliserMs, snapshots.m75ms),
    state("equaliser-es", "Spanish labels and note.", cards.equaliserEs, snapshots.m75es, { canvases: video }),
    state("analyst-en", "S7 step 3: analyst persona shows the second why-line.", cards.equaliserAnalyst, snapshots.m75analyst),
    state("analyst-ms", "Clipping test: the longest text the app can show.", cards.equaliserMsAnalyst, snapshots.m75msAnalyst),
    state("stoppage", "Stoppage time: 90+4'.", stoppageCard, snapshots.ft, { canvases: video }),
    state("empty", "Pre-kick-off: nothing yet.", cards.equaliser, m75, { empty: true }),
    state("loading", "Skeleton lines, same room as the card.", cards.equaliser, m75, { loading: true }),
  ],
} satisfies LabModule;
