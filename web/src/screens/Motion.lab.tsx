import { useEffect, useState, type ReactNode } from "react";
import type { LabModule, LabState } from "../lab/types";
import { briefs } from "../lab/fixtures";
import { nowSeconds, replay, type MatchView } from "../live/feed";
import savedStart from "../live/saved/snapshot.0.json";
import savedTicks from "../live/saved/ticks.json";
import { pickStage } from "../live/stage";
import snap75ms from "../lab/fixtures/snapshot.75.ms.json";
import type { LiveCard, LiveSnapshot, StreamTick } from "../types/live";
import { LabelsProvider } from "../ui/labels";
import { LiveScreen } from "./LiveScreen";

// Step 8: the motions, played on demand so scripts/motion.mjs can film them frame by frame.
// Each state shows its "before" frame, then plays the change when the page receives the
// `lab:play` event. Lab-only: timers and events are fine here.

const at = (m: number): MatchView =>
  replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], m, briefs);

const stageOf = (v: MatchView): LiveCard | null => pickStage(v.cards, nowSeconds(v));

function usePlay(): boolean {
  const [played, setPlayed] = useState(false);
  useEffect(() => {
    const go = () => setPlayed(true);
    window.addEventListener("lab:play", go);
    return () => window.removeEventListener("lab:play", go);
  }, []);
  return played;
}

/** S1: 73' (1–2, the 61' goal on stage) → 74' (2–2, the equaliser arrives). */
function Equaliser() {
  const played = usePlay();
  const view = at(played ? 74 : 73);
  return (
    <LiveScreen
      view={view}
      speed={1}
      connection="live"
      stage={stageOf(view)}
      arriving={played}
      scoredSide={played ? "home" : undefined}
    />
  );
}

/** S4: the 14' card's facts sheet opens. */
function Facts() {
  const played = usePlay();
  const view = at(15);
  const stage = stageOf(view);
  return <LiveScreen view={view} speed={60} connection="live" stage={stage} facts={played ? stage : null} />;
}

/** S7: the same card switches to Malay; its text cross-fades. */
function Reword() {
  const played = usePlay();
  const view = at(74);
  const stage = stageOf(view)!;
  // The Malay words for the same card come from the engine's Malay snapshot at 75'.
  const language = played ? "ms" : "en";
  return (
    <LabelsProvider language={language}>
      <LiveScreen
        view={{ ...view, profile: { ...view.profile, language } }}
        speed={1}
        connection="live"
        stage={played ? msCard(stage) : stage}
        relabel={played}
      />
    </LabelsProvider>
  );
}

function msCard(card: LiveCard): LiveCard {
  return (snap75ms as unknown as LiveSnapshot).cards.find((c) => c.insight_id === card.insight_id) ?? card;
}

function variant(name: string, motion: string, note: string, body: () => ReactNode): LabState {
  return {
    name,
    note,
    canvases: ["video"],
    place: "fill",
    render: () => <div data-motion={motion} style={{ display: "contents" }}>{body()}</div>,
  };
}

export default {
  component: "Motion",
  summary: "Step 8: each motion, played on the `lab:play` event, in each candidate feel.",
  states: [
    variant("equaliser-calm", "calm", "S1 in the calm feel: fades and small rises.", () => <Equaliser />),
    variant("equaliser-broadcast", "broadcast", "S1 in the broadcast feel: the score rolls, a firmer spring.", () => <Equaliser />),
    variant("equaliser-pitch", "pitch", "S1 in the pitch feel: the card sweeps in from its side.", () => <Equaliser />),
    variant("facts-sheet", "calm", "S4: the sheet rises over the scrim (the same in every feel).", () => <Facts />),
    variant("reword-ms", "calm", "S7: English to Malay on the same card, a cross-fade.", () => <Reword />),
  ],
} satisfies LabModule;
