import type { LabModule, LabState } from "../lab/types";
import { agentTrace, briefs, overlays, snapshots } from "../lab/fixtures";
import { fromSnapshot, nowSeconds, replay, type MatchView } from "../live/feed";
import savedStart from "../live/saved/snapshot.0.json";
import savedTicks from "../live/saved/ticks.json";
import { pickStage } from "../live/stage";
import type { Connection } from "../live/useMatchFeed";
import type { LiveSnapshot, StreamTick } from "../types/live";
import { MatchScreen } from "./MatchScreen";
import { overlayAt, OverlayScreen } from "./OverlayScreen";

// Whole screens, one state per storyboard shot at its exact minute (STORYBOARD §3). The match is
// the saved stream replayed to that minute, which is exactly what the website shows offline, or
// a real snapshot where the shot needs another language.

const at = (m: number): MatchView =>
  replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], m, briefs);

const snap = (s: LiveSnapshot): MatchView => ({ ...fromSnapshot(s), overlays: s.overlays });

function screen(
  view: MatchView,
  opts: { speed?: number; connection?: Connection; facts?: boolean; revealed?: number; loading?: boolean } = {},
) {
  const stage = pickStage(view.cards, nowSeconds(view));
  return (
    <MatchScreen
      view={view}
      speed={opts.speed ?? 1}
      connection={opts.connection ?? "live"}
      stage={stage}
      facts={opts.facts ? stage : null}
      revealed={opts.revealed}
      loading={opts.loading}
      onOpenFacts={() => undefined}
      onCloseFacts={() => undefined}
      onSelect={() => undefined}
      onLanguage={() => undefined}
      onPersona={() => undefined}
    />
  );
}

const video = { canvases: ["video"], place: "fill" } satisfies Partial<LabState>;

export default {
  component: "Screens",
  summary: "Whole screens at each storyboard shot's minute: layout B, half-time, full-time, overlay.",
  states: [
    {
      name: "s1-equaliser-74",
      note: "S1/S2: 74', 2–2, the equaliser on stage at real speed (no ×60).",
      ...video,
      render: () => screen(at(74)),
    },
    {
      name: "s3-chaos-12",
      note: "S3: ×60 from kick-off, the 11:59 chaos phase on stage.",
      ...video,
      render: () => screen(at(12), { speed: 60 }),
    },
    {
      name: "s3-goal-against-15",
      note: "S3: ×60, the 14' goal against holds the stage over 15:00's stat card.",
      ...video,
      render: () => screen(at(15), { speed: 60 }),
    },
    {
      name: "s4-facts-15",
      note: "S4: the 14' card's Facts used sheet open: facts, two evidence IDs, Checked.",
      ...video,
      render: () => screen(at(15), { facts: true }),
    },
    {
      name: "s5-halftime-agents",
      note: "S5 plan A: the brief and the agents. LAB-ONLY trace until #9 is fixed.",
      ...video,
      render: () => screen({ ...at(45), agentTrace }),
    },
    {
      name: "s5-halftime-revealing",
      note: "S5: the trace stepping through on camera, stopped on the reject.",
      ...video,
      render: () => screen({ ...at(45), agentTrace }, { revealed: 6 }),
    },
    {
      name: "s5-halftime-plan-b",
      note: "S5 plan B: the agents didn't run, said honestly.",
      ...video,
      render: () => screen({ ...at(45), agentTrace: [] }),
    },
    {
      name: "halftime-ms-analyst",
      note: "The longest half-time text (Malay analyst) beside the agents: must fit.",
      ...video,
      language: "ms",
      render: () => screen({ ...at(45), halftime: briefs.halftimeMsAnalyst, agentTrace }),
    },
    {
      name: "halftime-ms-analyst-plan-b",
      note: "The longest half-time text alone (plan B).",
      ...video,
      language: "ms",
      render: () => screen({ ...at(45), halftime: briefs.halftimeMsAnalyst, agentTrace: [] }),
    },
    {
      name: "fulltime-ms-analyst",
      note: "The longest full-time text (Malay analyst).",
      ...video,
      language: "ms",
      render: () => screen({ ...at(90), fulltime: briefs.fulltimeMsAnalyst }),
    },
    {
      name: "s6-momentum-52",
      note: "S6: ×60, momentum swings to Northgate at 51:59; bars flip to blue.",
      ...video,
      render: () => screen(at(52), { speed: 60 }),
    },
    {
      name: "s6-goal-62",
      note: "S6: ×60, Ferreira's 61' goal makes it 1–2.",
      ...video,
      render: () => screen(at(62), { speed: 60 }),
    },
    {
      name: "s7-ms-75",
      note: "S7 step 2: the equaliser in Malay, casual.",
      ...video,
      language: "ms",
      render: () => screen(snap(snapshots.m75ms)),
    },
    {
      name: "s7-analyst-75",
      note: "S7 step 3: analyst English, with xG and shot speed.",
      ...video,
      render: () => screen(snap(snapshots.m75analyst)),
    },
    {
      name: "s7-ms-analyst-75",
      note: "The longest text the app shows (Malay analyst): must still fit layout B.",
      ...video,
      language: "ms",
      render: () => screen(snap(snapshots.m75msAnalyst)),
    },
    {
      name: "s7-overlay-plate",
      note: "S7 step 4: /overlay?minute=74&plate=1, the alert on the pitch plate.",
      ...video,
      render: () => <OverlayScreen view={at(74)} message={overlayAt(overlays.en, 74)} plate />,
    },
    {
      name: "s7-overlay-transparent",
      note: "/overlay?minute=74: the same alert, transparent for OBS.",
      ...video,
      background: "transparent",
      render: () => <OverlayScreen view={at(74)} message={overlayAt(overlays.en, 74)} />,
    },
    {
      name: "overlay-bug-only",
      note: "/overlay between graphics: the score bug alone.",
      ...video,
      background: "transparent",
      render: () => <OverlayScreen view={at(74)} message={null} />,
    },
    {
      name: "s8-fulltime",
      note: "S8: 3–2, KST dimmed, the headline, player of the match, turning points on the timeline.",
      ...video,
      render: () => screen(at(90)),
    },
    {
      name: "pre-kickoff",
      note: "Before kick-off: 0–0 in secondary, the empty moment.",
      ...video,
      render: () => screen(at(0), { speed: 60 }),
    },
    {
      name: "loading",
      note: "The first load: skeletons the size of the real parts.",
      ...video,
      render: () => screen(at(0), { loading: true }),
    },
    {
      name: "reconnecting-74",
      note: "The stream dropped: Reconnecting, nothing else changes.",
      ...video,
      render: () => screen(at(74), { speed: 60, connection: "reconnecting" }),
    },
    {
      name: "offline-74",
      note: "The API is down: the saved match plays on, with the notice.",
      ...video,
      render: () => screen(at(74), { speed: 60, connection: "offline" }),
    },
  ],
} satisfies LabModule;
