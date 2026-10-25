import type { LabModule } from "../../lab/types";
import { overlays, snapshots } from "../../lab/fixtures";
import { ScoreBug } from "./ScoreBug";

const { home, away } = snapshots.m75;
const alert = overlays.en.find((o) => o.graphic === "alert" && o.minute === 74)!;
const bug = () => <ScoreBug home={home} away={away} score={alert.fields.score} clock={alert.fields.clock} />;

export default {
  component: "ScoreBug",
  summary: "Strict broadcast score bug for the overlay: badges, codes, score, clock.",
  states: [
    {
      name: "on-plate",
      note: "The 74:10 alert's fields on the pitch plate.",
      canvases: ["video"],
      place: "fill",
      background: "plate",
      render: bug,
    },
    {
      name: "transparent",
      note: "Same, on transparency (what OBS keys).",
      canvases: ["video"],
      place: "fill",
      background: "transparent",
      render: bug,
    },
  ],
} satisfies LabModule;
