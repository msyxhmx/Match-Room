// Mock-ups: the live pitch on the live match page (Ilham, 25 Oct: "the main point of the demo").
// Each state is the real components (top bar, score, moment card, timeline) and the real pitch,
// placed a different way, at 74:10 with the equaliser on stage. Lab-only: the layouts live
// here until one is picked.

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
import { MomentCard, ScoreBug, Timeline, TopBar } from "../ui";
import { formatScore } from "../ui/format";
import { PITCH_SCENES } from "./Pitch.lab";
import { teamOf } from "./LiveScreen";

const view: MatchView = replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], 74, briefs);
const stage = pickStage(view.cards, nowSeconds(view)) as LiveCard;
const scene = PITCH_SCENES.continuous;

const pitch = () => <PitchCanvas shot={scene.shot} analyst={false} focus="L. Quinn" at={scene.still} ghost="ghost" />;
const card = () => <MomentCard card={stage} team={teamOf(view, stage)} note={view.projection.note} />;
const top = () => (
  <TopBar meta={view.meta} profile={view.profile} team={view.home} connection="preview" />
);
const timeline = () => (
  <Timeline series={view.series} minute={view.minute} cards={view.cards} selectedId={stage.insight_id} title={view.control.label} />
);

const page = (children: ReactNode) => (
  <div
    style={{
      position: "absolute",
      inset: 0,
      padding: "var(--space-6) var(--safe-x)",
      display: "flex",
      flexDirection: "column",
      gap: "var(--space-3)",
      background: "var(--surface-ground)",
    }}
  >
    {children}
  </div>
);

const bug = () => (
  <div style={{ position: "absolute", top: "var(--space-2)", left: "var(--space-2)" }}>
    <ScoreBug home={view.home} away={view.away} score={formatScore(view.score)} clock={view.clock} />
  </div>
);

/** A: the pitch is the stage, full width, the score riding on it; the moment card below. */
function Stage() {
  return page(
    <>
      {top()}
      <div style={{ position: "relative" }}>
        <PitchView>{pitch()}</PitchView>
        {bug()}
      </div>
      {card()}
    </>,
  );
}

/** B: the pitch and the timeline on the left, the moment card on the right. */
function Split() {
  return page(
    <>
      {top()}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.75fr) minmax(0, 1fr)",
          gap: "var(--space-4)",
          alignItems: "start",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", minWidth: 0 }}>
          <div style={{ position: "relative" }}>
            <PitchView>{pitch()}</PitchView>
            {bug()}
          </div>
          {timeline()}
        </div>
        <div style={{ minWidth: 0 }}>{card()}</div>
      </div>
    </>,
  );
}

const state = (name: string, note: string, render: () => ReactNode): LabState => ({
  name,
  note,
  canvases: ["video"],
  place: "fill",
  render,
});

export default {
  component: "LivePitch",
  summary: "Mock-ups: the live pitch on the live match page, two layouts.",
  states: [
    state("stage", "A: the pitch full width with the score on it, the moment card below", () => <Stage />),
    state("split", "B: the pitch and the timeline on the left, the moment card on the right", () => <Split />),
  ],
} satisfies LabModule;
