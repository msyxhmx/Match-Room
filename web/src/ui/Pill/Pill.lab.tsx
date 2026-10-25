import { Activity, Check, RefreshCw } from "lucide-react";
import type { LabModule } from "../../lab/types";
import { LABELS } from "../labels";
import { Pill } from "./Pill";

const row = { display: "flex", gap: "var(--space-2)", flexWrap: "wrap" as const, alignItems: "center" };

export default {
  component: "Pill",
  summary: "Inline label in five tones; the building block for status and tags.",
  states: [
    {
      name: "tones",
      note: "All five tones in a row, English labels.",
      render: () => (
        <div style={row}>
          <Pill tone="live">{LABELS.en.live}</Pill>
          <Pill tone="neutral">{LABELS.en.halfTime}</Pill>
          <Pill tone="muted">{LABELS.en.reconnecting}</Pill>
          <Pill tone="positive">{LABELS.en.checkedShort}</Pill>
          <Pill tone="you">{LABELS.en.yourPlayer}</Pill>
        </div>
      ),
    },
    {
      name: "with-icons",
      note: "Check positive, RefreshCw muted, Activity neutral.",
      render: () => (
        <div style={row}>
          <Pill tone="positive" icon={Check}>{LABELS.en.checked}</Pill>
          <Pill tone="muted" icon={RefreshCw}>{LABELS.en.reconnecting}</Pill>
          <Pill tone="neutral" icon={Activity}>{LABELS.en.insight.chaos_phase}</Pill>
        </div>
      ),
    },
    {
      name: "long-ms",
      note: "Malay labels, the longest strings; body size too.",
      language: "ms",
      render: () => (
        <div style={row}>
          <Pill tone="positive" icon={Check}>{LABELS.ms.checked}</Pill>
          <Pill tone="live">{LABELS.ms.live}</Pill>
          <Pill tone="neutral" size="body">{LABELS.ms.checked}</Pill>
        </div>
      ),
    },
  ],
} satisfies LabModule;
