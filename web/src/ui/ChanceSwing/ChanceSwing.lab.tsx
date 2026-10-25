import type { LabModule } from "../../lab/types";
import { cards, snapshots } from "../../lab/fixtures";
import { swingOf, type Swing } from "../format";
import { ChanceSwing } from "./ChanceSwing";

const { home, away } = snapshots.m75;
const note = snapshots.m75.projection.note;

export default {
  component: "ChanceSwing",
  summary: "The evidence line in a moment card: win chance before and after, with the note.",
  states: [
    {
      name: "equaliser",
      note: "cards.equaliser: NGC 5% to 28%.",
      width: "min(960px, 100%)",
      render: () => <ChanceSwing team={home} side="home" swing={swingOf(cards.equaliser)!} note={note} />,
    },
    {
      name: "no-numbers",
      note: "numbers={false}: label, bar with the before tick, and note; no big numbers (the goal cards say them in the why-line).",
      width: "min(960px, 100%)",
      render: () => <ChanceSwing team={home} side="home" swing={swingOf(cards.equaliser)!} note={note} numbers={false} />,
    },
    {
      name: "against",
      note: "cards.goalAgainst (S3): KST 22% to 69%, away side.",
      width: "min(960px, 100%)",
      render: () => (
        <ChanceSwing team={away} side="away" swing={swingOf(cards.goalAgainst)!} note={snapshots.m15.projection.note} />
      ),
    },
    {
      name: "falling",
      note: "LAB-ONLY swing, made up: 69% to 22%. Shows a falling swing.",
      width: "min(960px, 100%)",
      render: () => {
        const swing: Swing = { before: "69%", after: "22%", rising: false };
        return <ChanceSwing team={away} side="away" swing={swing} note={note} />;
      },
    },
    {
      name: "ms",
      note: "Malay label and note (snapshots.m75ms), real equaliser swing.",
      language: "ms",
      width: "min(960px, 100%)",
      render: () => (
        <ChanceSwing team={home} side="home" swing={swingOf(cards.equaliserMs)!} note={snapshots.m75ms.projection.note} />
      ),
    },
  ],
} satisfies LabModule;
