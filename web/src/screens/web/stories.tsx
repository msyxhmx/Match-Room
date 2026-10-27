// The half-time and full-time stories on the web layout. Half-time: the brief, and beside it the
// two agents at work (the fact-checker catching a wrong number reads best on camera). Full-time:
// the result, the turning points on one chance-to-win chart, why, and the players.

import { Check, LifeBuoy, PenLine, RotateCcw, ShieldCheck, SkipForward, Wrench, X, type LucideIcon } from "lucide-react";
import { useState } from "react";
import type { AgentStep } from "../../types/halftime";
import type { BriefPoint, LiveCard, MatchBrief, PlayerLine } from "../../types/live";
import { Icon } from "../../ui";
import { cardMinute, formatScore, keepScores, turningSwing } from "../../ui/format";
import { useLabels, type Labels } from "../../ui/labels";
import type { MatchView } from "../../live/feed";
import { pointAsCard } from "../BreakScreens";
import { Badge, ChanceSplit, FactsLink, StatRows, StatsHead, TurningChart, TypeIcon } from "./bits";
import { rowFromMetric } from "./stats";
import styles from "./web.module.css";

function Points({ points, view, onOpenFacts, outline }: { points: BriefPoint[]; view: MatchView; onOpenFacts: (c: LiveCard) => void; outline?: boolean }) {
  return (
    <div className={styles.pointGrid}>
      {points.map((p) => (
        <div key={p.title} className={styles.point} data-outline={outline || undefined}>
          <h3 className={styles.pointTitle}>{p.title}</h3>
          <p className={styles.pointBody}>{keepScores(p.body)}</p>
          {p.facts_used.length > 0 && (
            <FactsLink count={p.facts_used.length} onOpen={() => onOpenFacts(pointAsCard(p, view))} />
          )}
        </div>
      ))}
    </div>
  );
}

function StoryHead({ brief, kind }: { brief: MatchBrief; kind: string }) {
  const labels = useLabels();
  return (
    <header className={styles.storyHead}>
      <div className={styles.badges}>
        <span className={styles.eyebrow}>{kind}</span>
        <Badge tone="checked">
          <Icon icon={ShieldCheck} />
          {brief.summary_source === "llm" ? labels.llmSource : labels.templateSource}
        </Badge>
      </div>
      <h1 className={styles.storyHeadline}>{keepScores(brief.headline)}</h1>
      <p className={styles.storyLead}>{keepScores(brief.summary)}</p>
    </header>
  );
}

// ---------- half-time ----------

const ACTION: Record<AgentStep["action"], { icon: LucideIcon; tone?: "positive" | "reject" | "quiet" }> = {
  tool: { icon: Wrench },
  draft: { icon: PenLine },
  accept: { icon: Check, tone: "positive" },
  reject: { icon: X, tone: "reject" },
  retry: { icon: RotateCcw, tone: "quiet" },
  skip: { icon: SkipForward, tone: "quiet" },
  fallback: { icon: LifeBuoy, tone: "quiet" },
};

function actionLabel(l: Labels, a: AgentStep["action"]): string {
  const names: Record<AgentStep["action"], string> = {
    tool: l.actionTool,
    draft: l.actionDraft,
    accept: l.actionAccept,
    reject: l.actionReject,
    retry: l.actionRetry,
    skip: l.actionSkip,
    fallback: l.actionFallback,
  };
  return names[a];
}

const agentName = (l: Labels, a: AgentStep["agent"]) =>
  a === "analyst" ? l.agentAnalyst : a === "fact_checker" ? l.agentFactChecker : l.agentPipeline;

/** A rejected claim reads "claim: reason"; the claim is struck through. */
function StepDetail({ step }: { step: AgentStep }) {
  if (step.action === "tool") return <span className={styles.stepMono}>{step.detail}</span>;
  const i = step.detail.indexOf(":");
  if (step.action === "reject" && i > 0) {
    return (
      <span className={styles.stepDetail}>
        <s>{step.detail.slice(0, i)}</s>
        {step.detail.slice(i)}
      </span>
    );
  }
  return <span className={styles.stepDetail}>{step.action === "accept" ? `“${step.detail}”` : step.detail}</span>;
}

function Agents({ steps, revealed }: { steps: AgentStep[]; revealed: number }) {
  const labels = useLabels();
  const shown = steps.slice(0, Math.max(1, revealed));
  const done = shown.length >= steps.length;
  const caught = steps.filter((s) => s.action === "reject").length;
  return (
    <aside className={`${styles.card} ${styles.agents} ${styles.colSide}`} aria-labelledby="agents-h">
      <div>
        <h2 id="agents-h" className={styles.subTitle}>
          {labels.agentsAtWork}
        </h2>
        <p className={styles.muted}>{labels.agentsLead}</p>
      </div>
      <div className={styles.agentChips}>
        <span className={styles.agentChip} data-agent="analyst">
          <span className={styles.stepIcon}>
            <Icon icon={PenLine} />
          </span>
          {labels.agentAnalyst}
        </span>
        <span className={styles.agentChip} data-agent="fact_checker">
          <span className={styles.stepIcon} data-tone="positive">
            <Icon icon={Check} />
          </span>
          {labels.agentFactChecker}
        </span>
      </div>
      <ol className={styles.steps} aria-live="polite">
        {shown.map((step, i) => {
          const a = ACTION[step.action];
          return (
            <li key={i} className={styles.step} data-action={step.action}>
              <span className={styles.stepIcon} data-tone={a.tone}>
                <Icon icon={a.icon} />
              </span>
              <div>
                <div className={styles.stepAction}>
                  {agentName(labels, step.agent)} · {actionLabel(labels, step.action)}
                </div>
                <StepDetail step={step} />
              </div>
            </li>
          );
        })}
      </ol>
      {done && (
        <p className={styles.agentsResult}>
          <b>{labels.result}:</b> {caught ? labels.agentsCaught(caught) : labels.agentsClean}
        </p>
      )}
    </aside>
  );
}

export interface HalftimeStoryProps {
  brief: MatchBrief;
  view: MatchView;
  trace: AgentStep[] | null;
  revealed: number;
  onOpenFacts: (card: LiveCard) => void;
  onContinue: () => void;
}

export function HalftimeStory({ brief, view, trace, revealed, onOpenFacts, onContinue }: HalftimeStoryProps) {
  const labels = useLabels();
  const [agentsOpen, setAgentsOpen] = useState(true);
  const steps = trace ?? [];
  // At the break the steps arrive one by one; looked at later, they're all there.
  const shownSteps = view.period === "HT" ? revealed : steps.length;
  const watch = brief.what_to_watch.filter((p) => !p.facts_used.some((f) => f.key === "home_p"));
  return (
    <div className={styles.columns}>
      <article className={`${styles.card} ${styles.storyCardBig} ${styles.colMain}`}>
        <StoryHead brief={brief} kind={labels.tabHalfTime} />

        {brief.what_happened.length > 0 && (
          <section>
            <h2 className={styles.subTitle}>{labels.whatHappened}</h2>
            <ol>
              {brief.what_happened.map((c) => (
                <li key={c.insight_id} className={styles.happenedItem}>
                  <span className={styles.happenedMinute}>{cardMinute(c)}</span>
                  <TypeIcon card={c} />
                  <div className={styles.momentText}>
                    <h3 className={styles.momentTitle}>{keepScores(c.headline)}</h3>
                    <p className={styles.momentBody}>{keepScores([c.body, c.why[0]].filter(Boolean).join(" "))}</p>
                    {c.facts_used.length > 0 && <FactsLink count={c.facts_used.length} onOpen={() => onOpenFacts(c)} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}

        {brief.why.length > 0 && (
          <section>
            <h2 className={styles.subTitle}>{labels.why}</h2>
            <Points points={brief.why} view={view} onOpenFacts={onOpenFacts} />
          </section>
        )}

        {(brief.projection || watch.length > 0) && (
          <section>
            <h2 className={styles.subTitle}>{labels.whatToWatch}</h2>
            <div className={styles.pointGrid}>
              {brief.projection && (
                <div className={styles.point} data-outline>
                  <h3 className={styles.pointTitle}>{labels.chanceToWin}</h3>
                  <ChanceSplit
                    home={brief.projection.home_win}
                    draw={brief.projection.draw}
                    away={brief.projection.away_win}
                    homeTeam={brief.home}
                    awayTeam={brief.away}
                  />
                  <p className={styles.muted}>{brief.projection.note}</p>
                </div>
              )}
              {watch.map((p) => (
                <div key={p.title} className={styles.point} data-outline>
                  <h3 className={styles.pointTitle}>{p.title}</h3>
                  <p className={styles.pointBody}>{keepScores(p.body)}</p>
                  {p.facts_used.length > 0 && <FactsLink count={p.facts_used.length} onOpen={() => onOpenFacts(pointAsCard(p, view))} />}
                </div>
              ))}
            </div>
          </section>
        )}

        <div className={styles.heroActions}>
          {view.period === "HT" && (
            <button type="button" className={styles.btnPrimary} onClick={onContinue}>
              {labels.watchSecondHalf} →
            </button>
          )}
          {steps.length > 0 && (
            <button type="button" className={styles.btnSecondary} aria-expanded={agentsOpen} onClick={() => setAgentsOpen((o) => !o)}>
              {agentsOpen ? labels.hideAgents : labels.showAgents}
            </button>
          )}
        </div>
      </article>
      {steps.length > 0 && agentsOpen && <Agents steps={steps} revealed={shownSteps} />}
    </div>
  );
}

// ---------- full-time ----------

function PlayerTiles({ p, labels }: { p: PlayerLine; labels: Labels }) {
  return (
    <div className={styles.tiles}>
      <span className={styles.tile}>
        <span className={styles.tileValue}>{p.goals}</span>
        <span className={styles.tileLabel}>{labels.goals}</span>
      </span>
      <span className={styles.tile}>
        <span className={styles.tileValue}>{p.pass_accuracy}%</span>
        <span className={styles.tileLabel}>
          {labels.passing} {p.passes_completed}/{p.passes}
        </span>
      </span>
      <span className={styles.tile}>
        <span className={styles.tileValue}>{p.touches}</span>
        <span className={styles.tileLabel}>{labels.touches}</span>
      </span>
      <span className={styles.tile}>
        <span className={styles.tileValue}>{p.ball_wins}</span>
        <span className={styles.tileLabel}>{labels.ballWins}</span>
      </span>
    </div>
  );
}

export interface FulltimeStoryProps {
  brief: MatchBrief;
  view: MatchView;
  onOpenFacts: (card: LiveCard) => void;
  onReplay: () => void;
  onTable?: () => void;
}

export function FulltimeStory({ brief, view, onOpenFacts, onReplay, onTable }: FulltimeStoryProps) {
  const labels = useLabels();
  const { home, away } = brief;
  const winner = brief.score.home > brief.score.away ? home : brief.score.away > brief.score.home ? away : null;
  const cp = brief.control_profile;
  const total = cp.home_control + cp.balanced + cp.chaos + cp.away_control || 1;
  const split: ["home" | "draw" | "chaos" | "away", number, string][] = [
    ["home", cp.home_control, labels.inControl(home.name)],
    ["draw", cp.balanced, labels.balanced],
    ["chaos", cp.chaos, labels.chaosMinutes],
    ["away", cp.away_control, labels.inControl(away.name)],
  ];
  const potm = brief.player_of_the_match;
  const mine = brief.focus_player && brief.focus_player.name !== potm?.name ? brief.focus_player : null;
  const most = potm ? Math.max(1, ...potm.involvement) : 1;
  const rows = brief.metrics.filter((m) => m.key !== "goals").map(rowFromMetric);

  return (
    <>
      <article className={`${styles.card} ${styles.storyCardBig}`}>
        <StoryHead brief={brief} kind={`${labels.fullTimeLong} · ${home.short_name} ${formatScore(brief.score)} ${away.short_name}`} />
      </article>

      {brief.turning_points.length > 0 && (
        <section className={styles.card} aria-labelledby="tp-h">
          <div className={styles.cardHead}>
            <h2 id="tp-h" className={styles.cardTitle}>
              {labels.turningPoints}
            </h2>
            <span className={styles.legend} style={{ marginTop: 0 }}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-side="home" />
                {home.name}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-side="away" />
                {away.name}
              </span>
            </span>
          </div>
          <TurningChart series={view.series} points={brief.turning_points} />
          <div className={styles.axis}>
            <span>{labels.kickOff}</span>
            <span>{labels.halfTimeLong}</span>
            <span>{labels.fullTimeLong}</span>
          </div>
          <ol className={styles.tpList}>
            {brief.turning_points.map((tp, n) => {
              const swing = turningSwing(tp, view.cards);
              const team = tp.side === "home" ? home : tp.side === "away" ? away : null;
              return (
                <li key={tp.insight_id} className={styles.tpItem} data-side={tp.side ?? undefined}>
                  <span className={styles.tpMinute}>
                    <span className={styles.tpNumber}>{n + 1}</span>
                    {tp.clock.includes("+") ? tp.clock : `${tp.minute}'`}
                  </span>
                  <span className={styles.tpTitle}>{keepScores(tp.title)}</span>
                  <span className={styles.tpSwing}>
                    {team?.short_name} {swing.before} → {swing.after}
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      )}

      <div className={styles.columns}>
        <div className={styles.colMain}>
          {brief.why.length > 0 && (
            <section className={styles.card} aria-labelledby="won-h">
              <h2 id="won-h" className={styles.subTitle}>
                {winner ? labels.whyWon(winner.name) : labels.whyLevel}
              </h2>
              <Points points={brief.why} view={view} onOpenFacts={onOpenFacts} />
              <h3 className={styles.sheetSub} style={{ marginTop: 24 }}>
                {labels.minutesSplit}
              </h3>
              <div className={styles.splitBar} data-tall aria-hidden="true">
                {split.map(([side, n]) => (
                  <span key={side} data-side={side} style={{ width: `${(n / total) * 100}%` }} />
                ))}
              </div>
              <div className={styles.legend}>
                {split.map(([side, n, name]) => (
                  <span key={side} className={styles.legendItem}>
                    <span className={styles.swatch} data-side={side} />
                    <b>{labels.minutesShort(n)}</b> {name}
                  </span>
                ))}
              </div>
            </section>
          )}
          {rows.length > 0 && (
            <section className={styles.card} aria-labelledby="ft-stats-h">
              <StatsHead home={home} away={away} title={labels.fullTimeStats} id="ft-stats-h" />
              <div className={styles.statsGrid}>
                <div>
                  <StatRows rows={rows.slice(0, Math.ceil(rows.length / 2))} />
                </div>
                <div>
                  <StatRows rows={rows.slice(Math.ceil(rows.length / 2))} />
                </div>
              </div>
            </section>
          )}
        </div>

        <aside className={styles.colSide}>
          {potm && (
            <section className={`${styles.card} ${styles.potm}`} aria-labelledby="potm-h">
              <div className={styles.potmHead} data-side={potm.side}>
                <div>
                  <span className={styles.eyebrow} style={{ color: "inherit" }}>
                    {labels.playerOfMatch}
                  </span>
                  <h2 id="potm-h">{potm.name}</h2>
                  <span>{[labels.positions[potm.position] ?? potm.position, potm.side === "home" ? home.name : away.name].join(" · ")}</span>
                </div>
                <span className={styles.potmNumber}>{potm.number}</span>
              </div>
              <div className={styles.potmBody}>
                <PlayerTiles p={potm} labels={labels} />
                <div>
                  <div className={styles.eyebrow} style={{ marginBottom: 8 }}>
                    {labels.involvement}
                  </div>
                  <div className={styles.involvement} data-side={potm.side} aria-hidden="true">
                    {potm.involvement.map((n, i) => (
                      <span key={i} style={{ height: `${(n / most) * 100}%` }} />
                    ))}
                  </div>
                  <div className={styles.involvementAxis} aria-hidden="true">
                    {potm.involvement.map((_, i) => (
                      <span key={i}>{i * 15}'</span>
                    ))}
                  </div>
                </div>
              </div>
            </section>
          )}
          {mine && (
            <section className={styles.card} aria-labelledby="mine-h">
              <div className={styles.player}>
                <span className={styles.shirt}>{mine.number}</span>
                <div>
                  <span className={styles.eyebrow}>{labels.yourPlayer}</span>
                  <h2 id="mine-h" className={styles.cardTitle}>
                    {mine.name}
                  </h2>
                </div>
              </div>
              <PlayerTiles p={mine} labels={labels} />
            </section>
          )}
          <div className={styles.heroActions}>
            <button type="button" className={styles.btnSecondary} onClick={onReplay}>
              {labels.replayMatch}
            </button>
            {onTable && (
              <button type="button" className={styles.btnPrimary} onClick={onTable}>
                {labels.seeTable} →
              </button>
            )}
          </div>
        </aside>
      </div>
    </>
  );
}
