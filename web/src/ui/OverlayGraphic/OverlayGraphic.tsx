import { keepScores } from "../format";
import { Activity, CircleDot, Flame, Send, Sparkles, TrendingUp, User, Zap, type LucideIcon } from "lucide-react";
import type { Team } from "../../types/halftime";
import type { OverlayMessage } from "../../types/live";
import { Crest } from "../Crest/Crest";
import { useLabels } from "../labels";
import { Pill } from "../Pill/Pill";
import { ScoreBug } from "../ScoreBug/ScoreBug";
import styles from "./OverlayGraphic.module.css";

export interface OverlayGraphicProps {
  message: OverlayMessage;
  home: Team;
  away: Team;
}

const TYPE_ICON: Record<string, LucideIcon> = {
  goal: CircleDot,
  chaos_phase: Activity,
  momentum_flip: TrendingUp,
  control_shift: TrendingUp,
  pass_of_the_moment: Send,
  shot_speed: Zap,
  pressure_spike: Flame,
  player_focus: User,
  player_milestone: User,
};

function sideOf(teamId: string | undefined, home: Team, away: Team): "home" | "away" | "none" {
  if (teamId && teamId === home.id) return "home";
  if (teamId && teamId === away.id) return "away";
  return "none";
}

export function OverlayGraphic({ message, home, away }: OverlayGraphicProps) {
  const labels = useLabels();
  const f = message.fields;
  const side = sideOf(f.team_id, home, away);
  const typeLabel = (labels.insight as Record<string, string>)[f.type];
  const tag = typeLabel ? (
    <Pill tone="neutral" icon={TYPE_ICON[f.type] ?? Sparkles}>{typeLabel}</Pill>
  ) : null;
  const crest = f.team_id ? <Crest teamId={f.team_id} size="full" name={f.team} /> : null;

  let body;
  switch (message.graphic) {
    case "alert":
      body = (
        <section className={styles.alert} data-side={side} data-state="on">
          <div className={styles.panel}>
            {crest}
            <div className={styles.copy}>
              {tag}
              <h2 className={styles.headline}>{keepScores(f.headline)}</h2>
              <p className={styles.text}>{keepScores(f.body)}</p>
            </div>
          </div>
        </section>
      );
      break;
    case "lower_third":
      body = (
        <section className={styles.lower} data-side={side}>
          <div className={styles.panel}>
            <div className={styles.copy}>
              {tag}
              <h2 className={styles.title}>{keepScores(f.headline)}</h2>
              <p className={styles.text}>{keepScores(f.body)}</p>
            </div>
          </div>
        </section>
      );
      break;
    case "player_tag":
      body = (
        <section className={styles.player} data-side={side}>
          <div className={styles.panel}>
            {f.team_id && <Crest teamId={f.team_id} size="full" name={f.team} />}
            <div className={styles.copy}>
              <p className={styles.name}>
                <span className={styles.number}>#{f.number}</span> {f.player}
              </p>
              <h2 className={styles.text}>{keepScores(f.headline)}</h2>
            </div>
          </div>
        </section>
      );
      break;
    case "stat_bug":
      body = (
        <section className={styles.stat} data-side={side}>
          <div className={styles.panel}>
            <p className={styles.statLabel}>{f.stat_label}</p>
            <p className={styles.statValue}>{f.stat_value}</p>
          </div>
        </section>
      );
      break;
    case "momentum_bar": {
      const m = Math.max(-1, Math.min(1, parseFloat(f.momentum) || 0));
      // Positive momentum fills left from the centre (home); negative fills right (away).
      const toward = m >= 0 ? "home" : "away";
      body = (
        <section className={styles.momentum}>
          <div className={styles.panel}>
            <p className={styles.phase}>{f.phase_label}</p>
            <div className={styles.barRow}>
              <span className={styles.code} data-side="home">{home.short_name}</span>
              <div className={styles.track} data-role="momentum-track">
                <span className={styles.fill} data-side={toward} style={{ width: `${Math.abs(m) * 50}%` }} />
              </div>
              <span className={styles.code} data-side="away">{away.short_name}</span>
            </div>
          </div>
        </section>
      );
      break;
    }
    default:
      body = null;
  }

  return (
    <div className={styles.stage} data-graphic={message.graphic}>
      <ScoreBug home={home} away={away} score={f.score} clock={f.clock} />
      {body}
    </div>
  );
}
