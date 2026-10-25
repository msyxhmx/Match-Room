// The live match page with the live pitch: layout A "pitch stage" (Ilham's pick, 25 Oct), the
// real LiveScreen with a pitch, at 74' with the equaliser on stage. The pitch plays ×1 from
// 74:00 with continuous play (the ghost ball). Lab-only.

import type { ReactNode } from "react";
import type { LabModule, LabState } from "../lab/types";
import { briefs } from "../lab/fixtures";
import { nowSeconds, replay, type MatchView } from "../live/feed";
import savedStart from "../live/saved/snapshot.0.json";
import savedTicks from "../live/saved/ticks.json";
import { pickStage } from "../live/stage";
import { PitchCanvas } from "../pitch/PitchCanvas";
import { PitchView } from "../pitch/PitchView";
import type { LiveCard, LiveSnapshot, StreamTick } from "../types/live";
import { LiveScreen } from "./LiveScreen";
import { PITCH_SCENES } from "./Pitch.lab";

const view: MatchView = replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], 74, briefs);
const stage = pickStage(view.cards, nowSeconds(view)) as LiveCard;
const scene = PITCH_SCENES.continuous;

function Stage({ analyst = false, speed = 1 }: { analyst?: boolean; speed?: number }) {
  return (
    <LiveScreen
      view={view}
      speed={speed}
      connection="preview"
      stage={stage}
      pitch={
        <PitchView>
          <PitchCanvas shot={scene.shot} analyst={analyst} focus="L. Quinn" at={scene.still} ghost="ghost" />
        </PitchView>
      }
    />
  );
}

const state = (name: string, note: string, render: () => ReactNode, canvases: LabState["canvases"] = ["video"]): LabState => ({
  name,
  note,
  canvases,
  place: "fill",
  render,
});

export default {
  component: "LivePitch",
  summary: "The live match page with the live pitch (layout A, pitch stage).",
  states: [
    state("stage", "Layout A at 74': the pitch with the score bug, the equaliser card below", () => <Stage />, ["video", "phone"]),
    state("stage-analyst", "Analyst: the team-shape lines on the same moment", () => <Stage analyst />),
    state("stage-x60", "At ×60: the speed pill rides on the pitch's score bug", () => <Stage speed={60} />),
  ],
} satisfies LabModule;
