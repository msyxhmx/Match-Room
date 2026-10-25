import type { Team } from "../../types/halftime";
import type { Period, Score } from "../../types/live";
import { Crest } from "../Crest/Crest";
import { formatMinute, formatScore } from "../format";
import { useLabels } from "../labels";
import { Pill } from "../Pill/Pill";
import styles from "./ScoreHeader.module.css";

export interface ScoreHeaderProps {
  home: Team;
  away: Team;
  score: Score;
  period: Period;
  minute: number;
  /** Match speed; above 1 adds a neutral "×60" pill next to Live. */
  speed?: number;
  /** From `scorersFrom(cards)`. */
  scorers?: { home: string[]; away: string[] };
  /** Side that just scored: sets data-state="scored" on it (step 8 animates it). */
  scoredSide?: "home" | "away";
  loading?: boolean;
}

function Side({
  side,
  team,
  scorers,
  scored,
}: {
  side: "home" | "away";
  team: Team;
  scorers: string[];
  scored: boolean;
}) {
  return (
    <div className={styles.side} data-side={side} data-state={scored ? "scored" : undefined}>
      <div className={styles.crest}>
        <Crest teamId={team.id} size="full" />
      </div>
      <div className={styles.info}>
        <p className={styles.name}>{team.name}</p>
        {scorers.length > 0 && (
          <ul className={styles.scorers}>
            {scorers.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export function ScoreHeader({
  home,
  away,
  score,
  period,
  minute,
  speed,
  scorers,
  scoredSide,
  loading,
}: ScoreHeaderProps) {
  const labels = useLabels();

  if (loading) {
    return (
      <section className={styles.root} data-loading="true" aria-busy="true" aria-label={labels.loading}>
        <div className={styles.side} data-side="home">
          <span className={`${styles.crest} ${styles.skel} ${styles.skelCrest}`} />
          <span className={`${styles.skel} ${styles.skelName}`} />
        </div>
        <div className={styles.centre}>
          <span className={`${styles.skel} ${styles.skelScore}`} />
        </div>
        <div className={styles.side} data-side="away">
          <span className={`${styles.crest} ${styles.skel} ${styles.skelCrest}`} />
          <span className={`${styles.skel} ${styles.skelName}`} />
        </div>
      </section>
    );
  }

  const pre = period === "pre";
  const final = period === "FT";
  const live = period === "1H" || period === "2H";
  const homeDim = final && score.home < score.away;
  const awayDim = final && score.away < score.home;

  return (
    <section className={styles.root} data-period={period} aria-label={`${home.name} ${formatScore(score)} ${away.name}`}>
      <Side side="home" team={home} scorers={scorers?.home ?? []} scored={scoredSide === "home"} />
      <div className={styles.centre}>
        <p className={styles.score} data-pre={pre ? "true" : undefined} aria-hidden="true">
          <span data-dim={homeDim ? "true" : undefined}>{score.home}</span>
          <span className={styles.dash}>–</span>
          <span data-dim={awayDim ? "true" : undefined}>{score.away}</span>
        </p>
        <div className={styles.status}>
          {live && (
            <>
              <Pill tone="live">{labels.live}</Pill>
              <span className={styles.minute}>{formatMinute(minute, period)}</span>
              {speed !== undefined && speed > 1 && <Pill tone="neutral">×{speed}</Pill>}
            </>
          )}
          {period === "HT" && <Pill tone="neutral">{labels.halfTime}</Pill>}
          {final && <Pill tone="neutral">{labels.fullTime}</Pill>}
          {pre && <Pill tone="neutral">{labels.kickOff}</Pill>}
        </div>
      </div>
      <Side side="away" team={away} scorers={scorers?.away ?? []} scored={scoredSide === "away"} />
    </section>
  );
}
