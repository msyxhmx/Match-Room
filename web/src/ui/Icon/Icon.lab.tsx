import { Check } from "lucide-react";
import type { LabModule } from "../../lab/types";
import { Icon } from "./Icon";

const sample = (text: string) => (
  <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
    {[
      ["caption2", "--type-caption2"],
      ["body", "--type-body"],
      ["headline", "--type-headline"],
      ["title1", "--type-title1"],
    ].map(([name, token]) => (
      <div key={name} style={{ font: `var(${token})`, display: "flex", gap: "var(--space-1)", alignItems: "center" }}>
        <Icon icon={Check} />
        <span>{text} {name}</span>
      </div>
    ))}
  </div>
);

export default {
  component: "Icon",
  summary: "Lucide icon that follows the surrounding font size (1em, stroke 2.25).",
  states: [
    {
      name: "sizes",
      note: "A Check icon next to caption2, body, headline and title1 text; lab-only sample words.",
      render: () => sample("Checked"),
    },
  ],
} satisfies LabModule;
