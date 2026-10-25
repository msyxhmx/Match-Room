import type { Team } from "../../types/halftime";
import { Crest } from "../Crest/Crest";
import styles from "./ScoreBug.module.css";

export interface ScoreBugProps {
  home: Team;
  away: Team;
  /** From the overlay fields, as sent ("2-2"). Drawn with an en dash. */
  score: string;
  /** From the overlay fields, as sent ("74:10"). */
  clock: string;
}

export function ScoreBug({ home, away, score, clock }: ScoreBugProps) {
  return (
    <div className={styles.bug} data-role="score-bug">
      <span className={styles.team} data-side="home">
        <Crest teamId={home.id} size="badge" />
        <span className={styles.code}>{home.short_name}</span>
      </span>
      <span className={styles.score}>{score.replace("-", "–")}</span>
      <span className={styles.team} data-side="away">
        <span className={styles.code}>{away.short_name}</span>
        <Crest teamId={away.id} size="badge" />
      </span>
      <span className={styles.clock}>{clock}</span>
    </div>
  );
}
