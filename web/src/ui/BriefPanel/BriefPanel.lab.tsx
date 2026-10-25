import type { LabModule, LabState } from "../../lab/types";
import { briefs, snapshots } from "../../lab/fixtures";
import type { MatchBrief } from "../../types/live";
import { BriefPanel } from "./BriefPanel";

function state(name: string, note: string, brief: MatchBrief, extra: Partial<LabState> = {}): LabState {
  const ft = brief.kind === "fulltime";
  return {
    name,
    note,
    language: brief.profile.language,
    place: "top",
    width: ft ? "min(1440px, 100%)" : "min(1080px, 100%)",
    render: (canvas) => {
      const panel = <BriefPanel brief={brief} note={ft ? snapshots.ft.projection.note : undefined} />;
      // On the phone the panel is taller than the screen: the app scrolls it, so the lab does too.
      return canvas === "phone" ? (
        <div tabIndex={0} style={{ maxHeight: "calc(844px - 2 * var(--gutter))", overflowY: "auto" }}>{panel}</div>
      ) : (
        panel
      );
    },
    ...extra,
  };
}

export default {
  component: "BriefPanel",
  summary: "The half-time and full-time story: headline, why, what to watch, turning points.",
  states: [
    state("half-time", "Why, what to watch and the chance bar with its note.", briefs.halftime),
    state("full-time", "Turning points with their swings, the note and the player of the match.", briefs.fulltime),
    state("full-time-ms-analyst", "Longest text: Malay, analyst.", briefs.fulltimeMsAnalyst, { canvases: ["video"] }),
  ],
} satisfies LabModule;
