import type { LabModule } from "../../lab/types";
import { briefs, snapshots } from "../../lab/fixtures";
import type { WinProjection } from "../../types/live";
import { ChanceBar } from "./ChanceBar";

const { home, away } = snapshots.m75;
const width = "min(960px, 100%)";
const even: WinProjection = {
  ...snapshots.m75.projection,
  home_win: 0.34,
  draw: 0.33,
  away_win: 0.33,
};

export default {
  component: "ChanceBar",
  summary: "Three-way win chance bar for the half-time brief.",
  states: [
    {
      name: "halftime",
      note: "briefs.halftime.projection: NGC 2%, draw 7%, KST 91%. The home segment is under 6% and keeps a minimum width.",
      width,
      render: () => <ChanceBar home={home} away={away} projection={briefs.halftime.projection!} />,
    },
    {
      name: "even",
      note: "LAB-ONLY projection, made up: 0.34 / 0.33 / 0.33 (note text is the real 75' note).",
      width,
      render: () => <ChanceBar home={home} away={away} projection={even} />,
    },
    {
      name: "es",
      note: "Spanish labels with the 75' projection from snapshots.m75es (no ES half-time brief fixture).",
      language: "es",
      width,
      render: () => <ChanceBar home={home} away={away} projection={snapshots.m75es.projection} />,
    },
  ],
} satisfies LabModule;
