import type { BriefPoint, MatchBrief, TurningPoint } from "../../types/live";
import { ChanceBar } from "../ChanceBar/ChanceBar";
import { formatMinute, keepScores, turningSwing } from "../format";
import { useLabels } from "../labels";
import { Pill } from "../Pill/Pill";
import { PlayerOfMatch } from "../PlayerOfMatch/PlayerOfMatch";
import styles from "./BriefPanel.module.css";

export interface BriefPanelProps {
  brief: MatchBrief;
  /** The projection note at full-time, where the brief has no projection of its own. */
  note?: string;
  onOpenFacts?: (point: BriefPoint) => void;
}

export function BriefPanel({ brief, note, onOpenFacts }: BriefPanelProps) {
  const l = useLabels();
  const halftime = brief.kind === "halftime";
  const pom = brief.player_of_the_match;
  const pomTeam = pom ? (pom.side === "away" ? brief.away : brief.home) : null;
  const focus = !!pom && brief.focus_player?.name === pom.name;
  const finalNote = brief.projection?.note ?? note;

  // The "Projection" point repeats the chance bar's numbers and note in words. The bar says it
  // once, so that point is drawn as the bar (title and facts button kept, body left out).
  const note0 = brief.projection?.note;
  const isProjection = (p: BriefPoint) => !!note0 && p.body.includes(note0);
  const projectionPoint = halftime ? brief.what_to_watch.find(isProjection) : undefined;
  const watch = brief.what_to_watch.filter((p) => !isProjection(p));

  const factsButton = (p: BriefPoint) =>
    p.facts_used.length > 0 && (
      <button type="button" className={styles.facts} onClick={() => onOpenFacts?.(p)}>
        {l.factsUsed} · {p.facts_used.length}
      </button>
    );

  const points = (title: string, list: BriefPoint[]) =>
    list.length > 0 && (
      <section className={styles.group}>
        <h3 className={styles.groupTitle}>{title}</h3>
        <ul className={styles.points}>
          {list.map((p) => (
            <li key={p.title} className={styles.point}>
              <div className={styles.pointHead}>
                <h4 className={styles.pointTitle}>{keepScores(p.title)}</h4>
                {factsButton(p)}
              </div>
              <p className={styles.pointBody}>{keepScores(p.body)}</p>
            </li>
          ))}
        </ul>
      </section>
    );

  const turning = (tp: TurningPoint) => {
    const swing = turningSwing(tp, brief.what_happened);
    return (
      <li key={tp.insight_id} className={styles.turn}>
        <span className={styles.minute}>{formatMinute(tp.minute)}</span>
        <span className={styles.dot} data-side={tp.side ?? "none"} aria-hidden="true" />
        <span className={styles.turnTitle}>{keepScores(tp.title)}</span>
        <span className={styles.swing} data-role="probability">
          {swing.before} → {swing.after}
        </span>
      </li>
    );
  };

  return (
    <article className={styles.root} data-kind={brief.kind}>
      <header className={styles.header}>
        <div className={styles.kind}>
          <Pill tone="neutral">{halftime ? l.halfTimeLong : l.fullTimeLong}</Pill>
          <p className={styles.source}>
            {brief.summary_source === "llm" ? l.llmSource : l.templateSource}
          </p>
        </div>
        <h2 className={styles.headline}>{keepScores(brief.headline)}</h2>
        <p className={styles.summary}>{keepScores(brief.summary)}</p>
      </header>

      {halftime ? (
        <>
          <div className={styles.columns}>
            {points(l.why, brief.why)}
            {points(l.whatToWatch, watch)}
          </div>
          {brief.projection && (
            <div className={styles.tint}>
              {projectionPoint && (
                <div className={styles.pointHead}>
                  <h4 className={styles.pointTitle}>{keepScores(projectionPoint.title)}</h4>
                  {factsButton(projectionPoint)}
                </div>
              )}
              <ChanceBar home={brief.home} away={brief.away} projection={brief.projection} />
            </div>
          )}
        </>
      ) : (
        <>
          <section className={styles.group}>
            <h3 className={styles.groupTitle}>{l.turningPoints}</h3>
            <ol className={styles.turns}>{brief.turning_points.map(turning)}</ol>
            {finalNote && (
              <p className={styles.note} data-role="projection-note">
                {finalNote}
              </p>
            )}
          </section>
          {pom && pomTeam && (
            <div className={styles.pom}>
              <PlayerOfMatch player={pom} team={pomTeam} focus={focus} />
            </div>
          )}
        </>
      )}
    </article>
  );
}
