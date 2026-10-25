import type { LabModule } from "../../lab/types";
import { snapshots } from "../../lab/fixtures";
import { TopBar } from "./TopBar";

const m75 = snapshots.m75;
const analystMs = snapshots.m75msAnalyst;

export default {
  component: "TopBar",
  summary: "Quiet chrome: wordmark, scenario, who is following, connection, and the Synthetic data pill.",
  states: [
    {
      name: "live-en",
      note: "snapshots.m75 meta and profile, connected.",
      place: "top",
      language: "en",
      render: () => <TopBar meta={m75.meta} profile={m75.profile} team={m75.home} connection="live" />,
    },
    {
      name: "analyst-ms",
      note: "Malay analyst profile: the longest labels.",
      place: "top",
      language: "ms",
      render: () => <TopBar meta={analystMs.meta} profile={analystMs.profile} team={analystMs.home} connection="live" />,
    },
    {
      name: "reconnecting",
      note: "Muted pill with RefreshCw, never red.",
      place: "top",
      language: "en",
      render: () => <TopBar meta={m75.meta} profile={m75.profile} team={m75.home} connection="reconnecting" />,
    },
    {
      name: "offline",
      note: "Muted pill with CloudOff: offline, showing the saved match.",
      place: "top",
      language: "en",
      render: () => <TopBar meta={m75.meta} profile={m75.profile} team={m75.home} connection="offline" />,
    },
    {
      name: "preview",
      note: "Neutral pill with FlaskConical: the preview build plays the saved synthetic match.",
      place: "top",
      language: "en",
      render: () => <TopBar meta={m75.meta} profile={m75.profile} team={m75.home} connection="preview" />,
    },
    {
      name: "no-following",
      note: "Profile with team and player null: no Following text.",
      canvases: ["video"],
      place: "top",
      language: "en",
      render: () => (
        <TopBar meta={m75.meta} profile={{ ...m75.profile, team: null, player: null }} connection="live" />
      ),
    },
  ],
} satisfies LabModule;
