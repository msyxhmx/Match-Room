import type { PlayerLine } from "../../types/live";
import type { Team } from "../../types/halftime";
import { Crest } from "../Crest/Crest";
import { useLabels } from "../labels";
import { Pill } from "../Pill/Pill";
import styles from "./PlayerOfMatch.module.css";

export interface PlayerOfMatchProps {
  player: PlayerLine;
  team: Team;
  focus?: boolean;
  /** Leave out the involvement chart, where the frame has no room (the full-time screen). */
  compact?: boolean;
}

export function PlayerOfMatch({ player, team, focus = false, compact = false }: PlayerOfMatchProps) {
  const l = useLabels();
  const peak = Math.max(1, ...player.involvement);
  const summary = `${l.involvement}: ${player.involvement.join(", ")}`;

  return (
    <section className={styles.root} data-side={player.side}>
      <p className={styles.kicker}>{l.playerOfMatch}</p>
      <div className={styles.head}>
        <Crest teamId={team.id} size="full" name={team.name} />
        <div className={styles.who}>
          <h3 className={styles.name}>{player.name}</h3>
          <span className={styles.meta}>#{player.number} · {player.position}</span>
        </div>
        {focus && <Pill tone="you">{l.yourPlayer}</Pill>}
      </div>

      <dl className={styles.stats}>
        <div className={styles.stat}>
          <dd className={styles.value}>{player.goals}</dd>
          <dt className={styles.label}>{l.goals}</dt>
        </div>
        <div className={styles.stat}>
          <dd className={styles.value}>{player.xg.toFixed(2)}</dd>
          <dt className={styles.label}>{l.xg}</dt>
        </div>
        <div className={styles.stat}>
          <dd className={styles.value}>{Math.round(player.pass_accuracy)}%</dd>
          <dt className={styles.label}>{l.passAccuracy}</dt>
        </div>
      </dl>

      {!compact && (
        <figure className={styles.figure} role="img" aria-label={summary}>
          <div className={styles.bars} aria-hidden="true">
            {player.involvement.map((n, i) => (
              <span key={i} className={styles.bar} style={{ height: `${(n / peak) * 100}%` }} />
            ))}
          </div>
          <figcaption className={styles.caption}>{l.involvement}</figcaption>
        </figure>
      )}
    </section>
  );
}
