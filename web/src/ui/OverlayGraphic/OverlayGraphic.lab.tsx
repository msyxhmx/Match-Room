import type { LabModule } from "../../lab/types";
import { overlays, snapshots } from "../../lab/fixtures";
import type { OverlayMessage } from "../../types/live";
import { OverlayGraphic } from "./OverlayGraphic";

const { home, away } = snapshots.m75;

function pick(lang: "en" | "ms", graphic: OverlayMessage["graphic"], minute?: number): OverlayMessage {
  const m = overlays[lang].find((o) => o.graphic === graphic && (minute === undefined || o.minute === minute));
  if (!m) throw new Error(`lab fixture: no ${graphic} overlay (${lang}, ${minute})`);
  return m;
}

const alert74 = pick("en", "alert", 74);
const draw = (message: OverlayMessage) => () => (
  <OverlayGraphic message={message} home={home} away={away} />
);
const base = { canvases: ["video" as const], place: "fill" as const, background: "plate" as const };

// No stat_bug is in the engine's fixtures, so this one is the player_tag with its stat fields.
const statBug: OverlayMessage = { ...pick("en", "player_tag", 15), graphic: "stat_bug" };

export default {
  component: "OverlayGraphic",
  summary: "The broadcast overlay graphics (alert as a lower panel), drawn with the ScoreBug.",
  states: [
    { ...base, name: "alert-74", note: "Alert at 74', lower panel.", render: draw(alert74) },
    { ...base, name: "alert-74-transparent", note: "Alert on transparency.", background: "transparent", render: draw(alert74) },
    { ...base, name: "alert-74-ms", note: "Malay alert at 74' (longest text).", language: "ms", render: draw(pick("ms", "alert", 74)) },
    { ...base, name: "alert-14-against", note: "K. Quinn scores for Kingston Vale at 14'.", render: draw(pick("en", "alert", 14)) },
    { ...base, name: "lower-third", note: "The first lower_third.", render: draw(pick("en", "lower_third")) },
    { ...base, name: "player-tag", note: "The first player_tag.", render: draw(pick("en", "player_tag")) },
    { ...base, name: "stat-bug", note: "Lab-only: the fixtures have no stat_bug, so this is the 15' player_tag with graphic set to stat_bug.", render: draw(statBug) },
    { ...base, name: "momentum-bar", note: "The first momentum_bar.", render: draw(pick("en", "momentum_bar")) },
  ],
} satisfies LabModule;
