import type { LabModule } from "../../lab/types";
import { MatchControls, type MatchControlsProps } from "./MatchControls";

const noop = () => undefined;
const base: MatchControlsProps = {
  playing: true,
  speed: 60,
  onPlayPause: noop,
  onRestart: noop,
  onSpeed: noop,
};

export default {
  component: "MatchControls",
  summary: "The on-page playback controls: play / pause, restart, ×1 / ×60 (phone: pinned bottom bar).",
  states: [
    { name: "playing-x60", note: "Playing at ×60: Pause, Restart, ×60 pressed.", place: "bottom", render: () => <MatchControls {...base} /> },
    {
      name: "paused-x1",
      note: "Paused at ×1: Play, Restart, ×1 pressed.",
      place: "bottom",
      render: () => <MatchControls {...base} playing={false} speed={1} />,
    },
    {
      name: "ended",
      note: "Full time: the main button restarts; no separate restart.",
      place: "bottom",
      render: () => <MatchControls {...base} playing={false} ended />,
    },
  ],
} satisfies LabModule;
