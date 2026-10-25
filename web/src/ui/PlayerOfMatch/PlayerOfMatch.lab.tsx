import type { LabModule } from "../../lab/types";
import { briefs } from "../../lab/fixtures";
import type { PlayerLine } from "../../types/live";
import { PlayerOfMatch } from "./PlayerOfMatch";

const player = briefs.fulltime.player_of_the_match as PlayerLine;
const team = briefs.fulltime.home;

export default {
  component: "PlayerOfMatch",
  summary: "Full-time player of the match: name, badge, three stats and a six-bar involvement chart.",
  states: [
    {
      name: "full-time",
      note: "briefs.fulltime player (L. Quinn, #8 MF), focus: the 'Your player' pill shows.",
      width: "min(600px, 100%)",
      render: () => <PlayerOfMatch player={player} team={team} focus />,
    },
    {
      name: "not-focus",
      note: "Same player, focus false: no pill.",
      canvases: ["video"],
      width: "min(600px, 100%)",
      render: () => <PlayerOfMatch player={player} team={team} />,
    },
  ],
} satisfies LabModule;
