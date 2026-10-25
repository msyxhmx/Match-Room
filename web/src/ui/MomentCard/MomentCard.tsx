import {
  Activity,
  ChevronUp,
  CircleDot,
  Flame,
  Send,
  Sparkles,
  TrendingUp,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { Team } from "../../types/halftime";
import type { InsightType, LiveCard } from "../../types/live";
import { ChanceSwing } from "../ChanceSwing/ChanceSwing";
import { cardMinute, swingOf, keepScores } from "../format";
import { Icon } from "../Icon/Icon";
import { useLabels } from "../labels";
import { Pill } from "../Pill/Pill";
import styles from "./MomentCard.module.css";

export interface MomentCardProps {
  card: LiveCard;
  /** The club the card's side belongs to; the swing needs its name. */
  team?: Team;
  /** The projection note, shown exactly as the engine wrote it. */
  note: string;
  onOpenFacts?: () => void;
  loading?: boolean;
  empty?: boolean;
}

const TYPE_ICON: Partial<Record<InsightType, LucideIcon>> = {
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

export function MomentCard({
  card,
  team,
  note,
  onOpenFacts,
  loading,
  empty,
}: MomentCardProps) {
  const labels = useLabels();
  // Step 8 hook: the card slides in. No animation in step 6.
  const state = "arriving";

  if (loading || empty) {
    return (
      <div className={styles.root}>
        <article
          className={styles.card}
          data-state={state}
          data-variant={loading ? "loading" : "empty"}
          aria-busy={loading || undefined}
        >
          {loading ? (
            <div className={styles.skeleton} aria-label={labels.loading} role="status">
              <span className={styles.bone} data-size="tag" />
              <span className={styles.bone} data-size="headline" />
              <span className={styles.bone} data-size="line" />
              <span className={styles.bone} data-size="line" data-short="" />
            </div>
          ) : (
            <p className={styles.empty}>{labels.emptyMoment}</p>
          )}
        </article>
      </div>
    );
  }

  const against = card.type === "goal" && card.tags.includes("against_your_team");
  const side = card.side;
  // Club glow: your team, or a neutral card that has a side. Never goal against, never chaos.
  const glow = side && !against && card.type !== "chaos_phase" ? side : "none";
  const swing = swingOf(card);
  const showSwing = card.why.length > 0 && swing && team && side;
  const analyst = card.persona === "analyst";
  const hasWhy = card.why.length > 0;

  const tag = (
    <div className={styles.tags}>
      <span className={styles.minute}>{cardMinute(card)}</span>
      <Pill tone={against ? "muted" : "neutral"} icon={TYPE_ICON[card.type] ?? Sparkles}>
        {against ? labels.goalAgainst : labels.insight[card.type]}
      </Pill>
      {card.tags.includes("focus_player") && (
        <Pill tone="you" icon={User}>
          {labels.yourPlayer}
        </Pill>
      )}
    </div>
  );

  // Numbers once: when a why-line on show already says both percentages, the swing skips its own.
  const says = (line?: string) => !!swing && !!line && line.includes(swing.before) && line.includes(swing.after);
  const shownWhy = hasWhy ? (analyst ? card.why.slice(0, 2) : card.why.slice(0, 1)) : [];
  const sayNumbers = shownWhy.some(says);

  const why = hasWhy && (
    <div className={styles.why}>
      <p className={styles.whyLine} data-role={says(card.why[0]) ? "probability" : undefined}>{keepScores(card.why[0])}</p>
      {analyst && card.why[1] && (
        <p className={styles.whyMore} data-role={says(card.why[1]) ? "probability" : undefined}>
          {keepScores(card.why[1])}
        </p>
      )}
    </div>
  );

  const swingEl = showSwing && (
    <div className={styles.swing}>
      <ChanceSwing team={team} side={side} swing={swing} note={note} numbers={!sayNumbers} />
    </div>
  );

  const button = (
    <button type="button" className={styles.facts} onClick={onOpenFacts}>
      {labels.factsUsed} · {card.facts_used.length}
      <Icon icon={ChevronUp} />
    </button>
  );

  const text = (
    <div className={styles.text}>
      <h2 className={styles.headline}>{keepScores(card.headline)}</h2>
      <p className={styles.body}>{keepScores(card.body)}</p>
    </div>
  );

  return (
    <div className={styles.root}>
      <article
        className={styles.card}
        data-state={state}
        data-glow={glow}
        data-type={card.type}
        data-has-why={hasWhy}
      >
        {tag}
        {text}
        <div className={styles.band} data-glow={glow}>
          {why}
          <div className={styles.footer}>
            {swingEl}
            {button}
          </div>
        </div>
      </article>
    </div>
  );
}
