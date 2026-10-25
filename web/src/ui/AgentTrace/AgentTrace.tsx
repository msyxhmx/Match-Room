import { Check, LifeBuoy, PenLine, RotateCcw, SkipForward, Wrench, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { AgentStep } from "../../types/halftime";
import { Icon } from "../Icon/Icon";
import { useLabels, type Labels } from "../labels";
import { Pill, type PillTone } from "../Pill/Pill";
import styles from "./AgentTrace.module.css";

export interface AgentTraceProps {
  steps: AgentStep[];
  /** Show only the first n steps, so the screen can step through them on camera. */
  revealed?: number;
  source: "template" | "llm";
}

const ACTION: Record<AgentStep["action"], { icon: LucideIcon; tone: PillTone }> = {
  tool: { icon: Wrench, tone: "neutral" },
  draft: { icon: PenLine, tone: "neutral" },
  accept: { icon: Check, tone: "positive" },
  reject: { icon: X, tone: "muted" },
  retry: { icon: RotateCcw, tone: "muted" },
  skip: { icon: SkipForward, tone: "muted" },
  fallback: { icon: LifeBuoy, tone: "muted" },
};

function actionLabel(l: Labels, a: AgentStep["action"]): string {
  switch (a) {
    case "tool": return l.actionTool;
    case "draft": return l.actionDraft;
    case "accept": return l.actionAccept;
    case "reject": return l.actionReject;
    case "retry": return l.actionRetry;
    case "skip": return l.actionSkip;
    case "fallback": return l.actionFallback;
  }
}

function agentLabel(l: Labels, a: AgentStep["agent"]): string {
  return a === "analyst" ? l.agentAnalyst : a === "fact_checker" ? l.agentFactChecker : l.agentPipeline;
}

/** A rejected detail reads "claim: reason". The claim (before the first colon) is struck through. */
function RejectDetail({ text }: { text: string }) {
  const i = text.indexOf(":");
  if (i < 0) return <>{text}</>;
  return (
    <>
      <s className={styles.claim}>{text.slice(0, i)}</s>
      {text.slice(i)}
    </>
  );
}

export function AgentTrace({ steps, revealed, source }: AgentTraceProps) {
  const l = useLabels();

  if (steps.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty} data-role="agent-trace-empty">
          <span className={styles.emptyIcon}>
            <Icon icon={Check} />
          </span>
          <span className={styles.emptyText}>{source === "llm" ? l.llmSource : l.templateSource}</span>
        </div>
      </div>
    );
  }

  const shown = revealed === undefined ? steps : steps.slice(0, Math.max(0, revealed));
  const lastIndex = steps.length - 1;

  // Consecutive steps by the same agent share one name, so each step is one line: its action,
  // then its detail. It reads as a conversation: the analyst works, the fact-checker answers.
  const groups: { agent: AgentStep["agent"]; steps: { step: AgentStep; i: number }[] }[] = [];
  shown.forEach((step, i) => {
    const last = groups[groups.length - 1];
    if (last && last.agent === step.agent) last.steps.push({ step, i });
    else groups.push({ agent: step.agent, steps: [{ step, i }] });
  });

  return (
    <div className={styles.root}>
      <h3 className={styles.title}>{l.agentsAtWork}</h3>
      <ol className={styles.list}>
        {groups.map((g) => (
          <li key={g.steps[0].i} className={styles.group} data-agent={g.agent}>
            <span className={styles.agent}>{agentLabel(l, g.agent)}</span>
            <ol className={styles.steps}>
              {g.steps.map(({ step, i }) => {
                const { icon, tone } = ACTION[step.action];
                const isReject = step.action === "reject";
                const isFinal = step.action === "accept" && i === lastIndex;
                return (
                  <li key={i} className={styles.row} data-action={step.action} data-final={isFinal || undefined}>
                    <span className={styles.action}>
                      {isReject && (
                        <span className={styles.bigIcon}>
                          <Icon icon={X} />
                        </span>
                      )}
                      {isFinal ? (
                        <Pill tone="positive" icon={Check}>{l.checked}</Pill>
                      ) : (
                        <Pill tone={tone} icon={isReject ? undefined : icon}>{actionLabel(l, step.action)}</Pill>
                      )}
                    </span>{" "}
                    <span className={styles.detail}>
                      {isReject ? <RejectDetail text={step.detail} /> : step.detail}
                    </span>
                  </li>
                );
              })}
            </ol>
          </li>
        ))}
      </ol>
    </div>
  );
}
