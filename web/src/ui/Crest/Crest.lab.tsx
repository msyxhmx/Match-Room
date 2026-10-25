import type { LabModule } from "../../lab/types";
import { Crest } from "./Crest";

const IDS = ["NGC", "KST", "ASH", "ELM", "HAR", "MIL", "QNB", "RIV"];
const wrap = { display: "flex", flexWrap: "wrap" as const, gap: "var(--space-2)", alignItems: "center" };

export default {
  component: "Crest",
  summary: "Club crest (full or 28 px badge) with a letter fallback for unknown ids.",
  states: [
    {
      name: "all-full",
      note: "All eight clubs at 128 px (64 px on the phone, where 128 would not fit the width).",
      render: (canvas) => (
        <div style={{ ...wrap, ["--crest-size" as string]: canvas === "video" ? "128px" : "var(--space-8)" }}>
          {IDS.map((id) => <Crest key={id} teamId={id} size="full" name={id} />)}
        </div>
      ),
    },
    {
      name: "all-badges",
      note: "All eight badges, 28 px on the phone and 40 px on video.",
      render: (canvas) => (
        <div style={{ ...wrap, ["--crest-size" as string]: canvas === "video" ? "var(--space-5)" : "28px" }}>
          {IDS.map((id) => <Crest key={id} teamId={id} size="badge" name={id} />)}
        </div>
      ),
    },
    {
      name: "missing",
      note: "Unknown id XXX: a grey circle with the first letter, never a broken image.",
      render: () => (
        <div style={{ ...wrap, ["--crest-size" as string]: "var(--space-8)" }}>
          <Crest teamId="XXX" size="full" name="Unknown club" />
          <Crest teamId="XXX" size="badge" />
        </div>
      ),
    },
  ],
} satisfies LabModule;
