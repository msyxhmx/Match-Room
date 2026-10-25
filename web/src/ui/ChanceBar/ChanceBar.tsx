import type { Team } from "../../types/halftime";
import type { WinProjection } from "../../types/live";
import { formatPct } from "../format";
import { useLabels } from "../labels";
import styles from "./ChanceBar.module.css";

export interface ChanceBarProps {
  home: Team;
  away: Team;
  projection: WinProjection;
}

export function ChanceBar({ home, away, projection }: ChanceBarProps) {
  const labels = useLabels();
  const parts = [
    { key: "home", label: home.short_name, p: projection.home_win },
    { key: "draw", label: labels.draw, p: projection.draw },
    { key: "away", label: away.short_name, p: projection.away_win },
  ];
  const columns = parts.map((x) => `minmax(var(--space-1), ${Math.max(x.p, 0.0001)}fr)`).join(" ");
  return (
    <figure className={styles.root}>
      <figcaption className={styles.caption}>{labels.chanceToWin}</figcaption>
      <div className={styles.track} style={{ gridTemplateColumns: columns }} aria-hidden="true">
        {parts.map((x) => (
          <span key={x.key} className={styles.seg} data-seg={x.key} />
        ))}
      </div>
      <p className={styles.labels}>
        {parts.map((x) => (
          <span key={x.key} className={styles.label} data-seg={x.key}>
            {x.label} <span data-role="probability">{formatPct(x.p)}</span>
          </span>
        ))}
      </p>
      <p className={styles.note} data-role="projection-note">
        {projection.note}
      </p>
    </figure>
  );
}
