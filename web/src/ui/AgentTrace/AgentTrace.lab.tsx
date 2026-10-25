import type { LabModule } from "../../lab/types";
import { agentTrace } from "../../lab/fixtures";
import { AgentTrace } from "./AgentTrace";

const LAB = "Lab-only steps (fixtures.agentTrace), worded like model/agents.py; no live trace exists yet.";

export default {
  component: "AgentTrace",
  summary: "The half-time agents' steps as a log: analyst drafts, fact-checker rejects, validator signs off.",
  states: [
    {
      name: "full",
      note: `All 9 steps; reject row heavier, final accept reads "Checked by the validator". ${LAB}`,
      width: "min(600px, 100%)",
      render: () => <AgentTrace steps={agentTrace} source="llm" />,
    },
    {
      name: "revealed-5",
      note: `Revealed 5: stops on the reject. ${LAB}`,
      canvases: ["video"],
      width: "min(600px, 100%)",
      render: () => <AgentTrace steps={agentTrace} revealed={5} source="llm" />,
    },
    {
      name: "empty",
      note: "No steps: the honest Plan B, written from templates, checked by the validator.",
      width: "min(600px, 100%)",
      render: () => <AgentTrace steps={[]} source="template" />,
    },
    {
      name: "ms",
      note: `Malay labels. ${LAB}`,
      canvases: ["video"],
      language: "ms",
      width: "min(600px, 100%)",
      render: () => <AgentTrace steps={agentTrace} source="llm" />,
    },
  ],
} satisfies LabModule;
