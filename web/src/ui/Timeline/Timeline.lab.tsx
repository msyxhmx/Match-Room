import type { LabModule } from "../../lab/types";
import { briefs, snapshots } from "../../lab/fixtures";
import type { LiveSnapshot } from "../../types/live";
import { Timeline } from "./Timeline";

function from(s: LiveSnapshot, over: Partial<Parameters<typeof Timeline>[0]> = {}) {
  return (
    <Timeline
      series={s.series}
      minute={s.minute}
      cards={s.cards}
      title={s.control.label}
      {...over}
    />
  );
}

const goal74 = snapshots.m75.cards.find((c) => c.minute === 74 && c.type === "goal")!;

export default {
  component: "Timeline",
  summary: "One bar per minute: who had the momentum, the goals, tappable moments and turning points.",
  states: [
    {
      name: "kickoff",
      note: "snapshots.pre: nothing has happened, every minute is an empty stub.",
      render: () => from(snapshots.pre),
    },
    {
      name: "m15",
      note: "snapshots.m15: the 14' goal against, a chaos stretch, nothing past 15'.",
      render: () => from(snapshots.m15),
    },
    {
      name: "half-time",
      note: "snapshots.ht: the first half drawn, the second half empty.",
      canvases: ["video"],
      render: () => from(snapshots.ht),
    },
    {
      name: "m75-selected",
      note: "snapshots.m75 with the 74' goal selected: outlined goal and a stem to the bars.",
      render: () => from(snapshots.m75, { selectedId: goal74.insight_id }),
    },
    {
      name: "m75-pin-selected",
      note: "snapshots.m75 with the 51' momentum pin selected (filled, with its stem).",
      canvases: ["video"],
      render: () => {
        const pin = snapshots.m75.cards.find((c) => c.type === "momentum_flip")!;
        return from(snapshots.m75, { selectedId: pin.insight_id });
      },
    },
    {
      name: "full-time-turning",
      note: "snapshots.ft with briefs.fulltime.turning_points: four labels (14', 37', 74', 87') and the note.",
      render: () =>
        from(snapshots.ft, {
          turningPoints: briefs.fulltime.turning_points,
          note: snapshots.ft.projection.note,
        }),
    },
    {
      name: "loading",
      note: "Skeleton blocks the size of the real chart.",
      canvases: ["video"],
      render: () => from(snapshots.ft, { loading: true }),
    },
  ],
} satisfies LabModule;
