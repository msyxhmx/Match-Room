import type { LabModule } from "../../lab/types";
import { cards, snapshots } from "../../lab/fixtures";
import { FactsSheet } from "./FactsSheet";

export default {
  component: "FactsSheet",
  summary: "The proof sheet for a moment card: facts used, evidence with event IDs, validator footer.",
  states: [
    {
      name: "goal-against-medium",
      note: "S4: cards.goalAgainst, medium detent.",
      place: "fill",
      language: "en",
      render: () => <FactsSheet open card={cards.goalAgainst} note={snapshots.m15.projection.note} />,
    },
    {
      name: "equaliser-large",
      note: "cards.equaliser, large detent.",
      canvases: ["video"],
      place: "fill",
      language: "en",
      render: () => <FactsSheet open card={cards.equaliser} note={snapshots.m75.projection.note} detent="large" />,
    },
    {
      name: "analyst-ms",
      note: "Malay analyst card: the longest text.",
      place: "fill",
      language: "ms",
      render: () => (
        <FactsSheet open card={cards.equaliserMsAnalyst} note={snapshots.m75msAnalyst.projection.note} />
      ),
    },
    {
      name: "no-probability",
      note: "cards.chaos has no win facts, so no projection note.",
      canvases: ["video"],
      place: "fill",
      language: "en",
      render: () => <FactsSheet open card={cards.chaos} note={snapshots.m15.projection.note} />,
    },
  ],
} satisfies LabModule;
