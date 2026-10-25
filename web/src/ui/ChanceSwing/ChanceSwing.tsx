import { ArrowRight } from "lucide-react";
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
}

const pct = (v: string) => `${Math.min(100, Math.max(0, parseFloat(v)))}%`;

export function ChanceSwing({ team, side, swing, note }: ChanceSwingProps) {
  const labels = useLabels();
  return (
    <div className={styles.root} data-side={side} data-rising={swing.rising}>
      <p className={styles.label}>
        <span className={styles.what}>{labels.chanceToWin}</span>{" "}
        <span className={styles.team}>{team.name}</span>
      </p>
      <p className={styles.numbers} data-role="probability">
        <span className={styles.before}>{swing.before}</span>
        <Icon icon={ArrowRight} />
        <span className={styles.after}>{swing.after}</span>
      </p>
      <div className={styles.track} aria-hidden="true" data-state="to">
        <span className={styles.fill} style={{ width: pct(swing.after) }} />
        <span className={styles.tick} style={{ left: pct(swing.before) }} />
      </div>
      <p className={styles.note} data-role="projection-note">
        {note}
      </p>
    </div>
  );
}
