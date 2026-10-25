import { ArrowRight } from "lucide-react";
import type { CSSProperties } from "react";
import type { Side, Team } from "../../types/halftime";
import type { Swing } from "../format";
import { Icon } from "../Icon/Icon";
import { useLabels } from "../labels";
import styles from "./ChanceSwing.module.css";

export interface ChanceSwingProps {
  team: Team;
  side: Side;
  swing: Swing;
  /** The projection note, shown exactly as the engine wrote it. */
  note: string;
  /** Draw the big before → after numbers. False when the sentence above already says them. */
  numbers?: boolean;
  /** The card just arrived: the bar fills from `before` to `after` (step 8). */
  arriving?: boolean;
}

const pct = (v: string) => `${Math.min(100, Math.max(0, parseFloat(v)))}%`;

export function ChanceSwing({ team, side, swing, note, numbers = true, arriving }: ChanceSwingProps) {
  const labels = useLabels();
  return (
    <div className={styles.root} data-side={side} data-rising={swing.rising} data-numbers={numbers}>
      <p className={styles.label} data-role="chance-label">
        <span className={styles.what}>{labels.chanceToWin}</span>{" "}
        <span className={styles.team}>{team.name}</span>
      </p>
      {numbers && (
        <p className={styles.numbers} data-role="probability">
          <span className={styles.before}>{swing.before}</span>
          <Icon icon={ArrowRight} />
          <span className={styles.after}>{swing.after}</span>
        </p>
      )}
      <div
        className={styles.track}
        aria-hidden="true"
        data-state={arriving ? "from" : "to"}
        style={{ "--from": pct(swing.before), "--to": pct(swing.after) } as CSSProperties}
      >
        <span className={styles.fill} />
        <span className={styles.tick} style={{ left: pct(swing.before) }} />
      </div>
      <p className={styles.note} data-role="projection-note">
        {note}
      </p>
    </div>
  );
}
