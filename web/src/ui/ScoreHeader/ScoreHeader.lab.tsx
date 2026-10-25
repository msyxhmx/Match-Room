import type { LabModule } from "../../lab/types";
import { snapshots } from "../../lab/fixtures";
import type { LiveSnapshot } from "../../types/live";
import { scorersFrom } from "../format";
import { ScoreHeader, type ScoreHeaderProps } from "./ScoreHeader";

// A snapshot's real teams, score, period, minute and goal-card scorers; `over` edits one thing.
function from(s: LiveSnapshot, over: Partial<ScoreHeaderProps> = {}) {
  return (
    <ScoreHeader
      home={s.home}
      away={s.away}
      score={s.score}
      period={s.period}
      minute={s.minute}
      scorers={scorersFrom(s.cards)}
      {...over}
    />
  );
}

const m75 = snapshots.m75;

export default {
  component: "ScoreHeader",
  summary: "The hero: crests, score and match status on an open stage with a glow behind each crest.",
  states: [
    {
      name: "live-74",
      note: "m75: 2–2, 74', real scorers from the m75 cards.",
      render: () => from(m75),
    },
    {
      name: "x60",
      note: "m15 at ×60 speed: neutral pill next to Live.",
      canvases: ["video"],
      render: () => from(snapshots.m15, { speed: 60 }),
    },
    { name: "pre", note: "snapshots.pre: Kick-off pill, 0–0 in secondary.", render: () => from(snapshots.pre) },
    {
      name: "half-time",
      note: "snapshots.ht with its real half-time score.",
      canvases: ["video"],
      render: () => from(snapshots.ht),
    },
    {
      name: "full-time",
      note: "snapshots.ft: 3–2, the losing score dimmed.",
      render: () => from(snapshots.ft),
    },
    {
      name: "stoppage",
      note: "90+4' stoppage time (snapshots.ft edited to minute 94, period 2H).",
      canvases: ["video"],
      render: () => from(snapshots.ft, { period: "2H", minute: 94 }),
    },
    {
      name: "double-digit",
      note: "LAB-ONLY score 10–9 on the m75 teams, a width stress test.",
      render: () => from(m75, { score: { home: 10, away: 9 } }),
    },
    {
      name: "other-clubs",
      note: "LAB-ONLY teams RIV v HAR (Riverside Rovers, Harbour Athletic), clubs set on the state.",
      canvases: ["video"],
      clubs: { home: "RIV", away: "HAR" },
      render: () =>
        from(m75, {
          home: { id: "RIV", name: "Riverside Rovers", short_name: "RIV" },
          away: { id: "HAR", name: "Harbour Athletic", short_name: "HAR" },
        }),
    },
    {
      name: "missing-crest",
      note: "LAB-ONLY away team id XXX, which has no crest file.",
      canvases: ["phone"],
      render: () => from(m75, { away: { id: "XXX", name: "Unknown FC", short_name: "XXX" } }),
    },
    { name: "loading", note: "Skeleton blocks the size of crest, name and score.", render: () => from(m75, { loading: true }) },
  ],
} satisfies LabModule;
