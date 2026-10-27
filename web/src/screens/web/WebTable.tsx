// The Table view on the web layout: the season table with the followed team lit, the team's card,
// and the season's storylines, each with its facts.

import { useState } from "react";
import type { SeasonReport, SeasonStoryline } from "../../types/live";
import { Crest } from "../../ui";
import { useLabels } from "../../ui/labels";
import { FactsLink } from "./bits";
import { ProofSheet } from "./sheet";
import styles from "./web.module.css";

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : "0");

export function WebTable({ report, team }: { report: SeasonReport; team: string | null }) {
  const labels = useLabels();
  const [open, setOpen] = useState<SeasonStoryline | null>(null);
  const heads = ["p", "w", "d", "l", "gd", "xg", "pts"] as const;
  const at = report.table.findIndex((r) => r.team.id === team);
  const mine = at >= 0 ? report.table[at] : null;
  const most = Math.max(1, ...report.table.map((r) => Math.max(r.xg_for, r.xg_against)));

  return (
    <main className={styles.main} data-screen="table">
      <div className={styles.pageTitle}>
        <h1>{labels.seasonTable}</h1>
        <span className={styles.muted}>{labels.seasonPlayed(report.matches)}</span>
      </div>

      <div className={styles.columns}>
        <section className={`${styles.card} ${styles.colMain}`} aria-label={labels.seasonTable}>
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{labels.club}</th>
                  {heads.map((h) => (
                    <th key={h} scope="col" title={labels.tableLong[h]}>
                      {labels.tableHead[h]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {report.table.map((r, i) => {
                  const you = r.team.id === team;
                  return (
                    <tr key={r.team.id} aria-current={you ? "true" : undefined}>
                      <td className={styles.pos}>{i + 1}</td>
                      <td>
                        <span className={styles.club}>
                          <Crest teamId={r.team.id} size="full" />
                          {r.team.name}
                          {you && <span className={styles.youChip}>{labels.yourTeam}</span>}
                        </span>
                      </td>
                      <td>{r.played}</td>
                      <td>{r.won}</td>
                      <td>{r.drawn}</td>
                      <td>{r.lost}</td>
                      <td>{signed(r.goals_for - r.goals_against)}</td>
                      <td className={styles.xgCell}>{r.xg_for.toFixed(1)}</td>
                      <td className={styles.pts}>{r.points}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className={styles.note}>{labels.tableNote}</p>
        </section>

        {mine && (
          <aside className={styles.colSide}>
            <section className={`${styles.card} ${styles.teamCard}`} aria-labelledby="you-h">
              <div className={styles.teamCardHead}>
                <Crest teamId={mine.team.id} size="full" />
                <div>
                  <span className={styles.eyebrow} style={{ color: "inherit" }}>
                    {labels.yourTeam}
                  </span>
                  <h2 id="you-h">{mine.team.name}</h2>
                </div>
              </div>
              <div className={styles.teamCardBody}>
                <div className={styles.tiles}>
                  <span className={styles.tile}>
                    <span className={styles.tileValue}>{labels.ordinal(at + 1)}</span>
                    <span className={styles.tileLabel}>{labels.position}</span>
                  </span>
                  <span className={styles.tile}>
                    <span className={styles.tileValue}>{mine.points}</span>
                    <span className={styles.tileLabel}>{labels.points}</span>
                  </span>
                  <span className={styles.tile}>
                    <span className={styles.tileValue}>
                      {mine.won}-{mine.drawn}-{mine.lost}
                    </span>
                    <span className={styles.tileLabel}>{labels.record}</span>
                  </span>
                </div>
                <div>
                  <div className={styles.meterRow}>
                    <span>{labels.xgFor}</span>
                    <b>{mine.xg_for.toFixed(1)}</b>
                  </div>
                  <div className={styles.meter}>
                    <span style={{ width: `${(mine.xg_for / most) * 100}%` }} />
                  </div>
                </div>
                <div>
                  <div className={styles.meterRow}>
                    <span>{labels.xgAgainst}</span>
                    <b>{mine.xg_against.toFixed(1)}</b>
                  </div>
                  <div className={styles.meter} data-tone="muted">
                    <span style={{ width: `${(mine.xg_against / most) * 100}%` }} />
                  </div>
                </div>
              </div>
            </section>
          </aside>
        )}
      </div>

      {report.storylines.length > 0 && (
        <section aria-labelledby="stories-h">
          <div className={styles.sectionHead}>
            <h2 id="stories-h" className={styles.sectionTitle}>
              {labels.seasonStorylines}
            </h2>
          </div>
          <div className={styles.storyGrid}>
            {report.storylines.map((s) => (
              <article key={s.id} className={`${styles.card} ${styles.storyline}`}>
                {s.team_id && <Crest teamId={s.team_id} size="full" />}
                <div className={styles.storylineText}>
                  <h3>{s.title}</h3>
                  <p>{s.body}</p>
                  {s.facts_used.length > 0 && <FactsLink count={s.facts_used.length} onOpen={() => setOpen(s)} />}
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      <p className={styles.footer}>{labels.footerNote}</p>

      {open && (
        <ProofSheet
          proof={{ eyebrow: labels.seasonStorylines, title: open.title, body: open.body, facts: open.facts_used, evidence: [] }}
          onClose={() => setOpen(null)}
        />
      )}
    </main>
  );
}
