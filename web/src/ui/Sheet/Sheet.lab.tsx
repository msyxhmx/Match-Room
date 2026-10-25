import type { LabModule } from "../../lab/types";
import { cards } from "../../lab/fixtures";
import { Sheet } from "./Sheet";

const card = cards.goalAgainst;
const facts = (
  <ul>
    {card.facts_used.map((f) => (
      <li key={f.key}>
        {f.label}: {f.value}
      </li>
    ))}
  </ul>
);

export default {
  component: "Sheet",
  summary: "Bottom sheet with scrim, grabber, title and close button.",
  states: [
    {
      name: "medium",
      note: "Medium detent (50%) with the 14' card's facts as plain text.",
      place: "fill",
      render: () => (
        <Sheet open title={card.headline} detent="medium">
          {facts}
        </Sheet>
      ),
    },
    {
      name: "large",
      note: "Large detent (88%) with the same facts.",
      place: "fill",
      render: () => (
        <Sheet open title={card.headline} detent="large">
          {facts}
        </Sheet>
      ),
    },
    {
      name: "overflow",
      note: "LAB-ONLY: 40 made-up rows to prove the body scrolls inside the panel.",
      place: "fill",
      render: () => (
        <Sheet open title={card.headline} detent="medium">
          <ul>
            {Array.from({ length: 40 }, (_, i) => (
              <li key={i}>Row {i + 1}</li>
            ))}
          </ul>
        </Sheet>
      ),
    },
  ],
} satisfies LabModule;
