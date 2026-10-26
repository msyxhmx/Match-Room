// The Table view: the season table with the followed team lit, and the season's storylines.

import type { SeasonReport } from "../types/live";
import { Crest } from "../ui";
import { useLabels } from "../ui/labels";
import styles from "./browse.module.css";

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

export function SeasonScreen({ report, team }: { report: SeasonReport; team: string | null }) {
  const labels = useLabels();
  const heads = ["p", "w", "d", "l", "gd", "xg", "pts"] as const;
  return (
    <div className={styles.picker} data-screen="table">
      <h2 className={styles.heading}>
        {labels.seasonTable} <span className={styles.tag}>{labels.seasonPlayed(report.matches)}</span>
      </h2>
      <table className={styles.table}>
        <thead>
          <tr>
            <th className={styles.pos} scope="col">#</th>
            <th className={styles.club} scope="col">{labels.club}</th>
            {heads.map((h) => (
              <th key={h} scope="col" className={h === "xg" ? styles.xg : styles.num} title={labels.tableLong[h]} data-col={h}>
                {labels.tableHead[h]}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {report.table.map((r, i) => (
            <tr key={r.team.id} data-you={r.team.id === team ? "true" : undefined} aria-current={r.team.id === team ? "true" : undefined}>
              <td className={styles.pos}>{i + 1}</td>
              <td className={styles.club}>
                <span className={styles.clubCell}>
                  <Crest teamId={r.team.id} size="full" />
                  <span className={styles.clubName}>{r.team.name}</span>
                </span>
              </td>
              <td className={styles.num}>{r.played}</td>
              <td className={styles.num}>{r.won}</td>
              <td className={styles.num}>{r.drawn}</td>
              <td className={styles.num}>{r.lost}</td>
              <td className={styles.num}>{signed(r.goals_for - r.goals_against)}</td>
              <td className={styles.xg}>{r.xg_for.toFixed(1)}</td>
              <td className={`${styles.num} ${styles.pts}`}>{r.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h2 className={styles.heading}>{labels.seasonStorylines}</h2>
      <ul className={styles.stories}>
        {report.storylines.map((s) => (
          <li key={s.id} className={styles.story}>
            {s.team_id && <Crest teamId={s.team_id} size="full" />}
            <div>
              <p className={styles.title}>{s.title}</p>
              <p className={styles.blurb}>{s.body}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
