// Small parts the web pages share: badges, the "facts checked" link, a moment row, stat rows, the
// chance-to-win split and the charts. Pure: data in, markup out.

import {
  Activity,
  ArrowLeftRight,
  CircleDot,
  Flag,
  Footprints,
  Gauge,
  ShieldCheck,
  Square,
  Target,
  Timer,
  TrendingUp,
  User,
  Zap,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import type { Side, Team } from "../../types/halftime";
import type { InsightType, LiveCard, Series, TurningPoint } from "../../types/live";
import { Crest, Icon } from "../../ui";
import { cardMinute, formatPct, keepScores } from "../../ui/format";
import { useLabels } from "../../ui/labels";
import type { StatRow } from "./stats";
import styles from "./web.module.css";

export const TYPE_ICON: Record<InsightType, LucideIcon> = {
  goal: CircleDot,
  red_card: Square,
  big_chance: Target,
  shot_speed: Zap,
  pass_of_the_moment: Footprints,
  momentum_flip: TrendingUp,
  control_shift: ArrowLeftRight,
  chaos_phase: Activity,
  pressure_spike: Gauge,
  win_prob_swing: Flag,
  tempo_shift: Timer,
  player_milestone: User,
  player_focus: User,
};

export function Badge({ tone, children, dot }: { tone: "live" | "neutral" | "checked" | "chaos" | "team"; children: ReactNode; dot?: boolean }) {
  return (
    <span className={styles.badge} data-tone={tone}>
      {dot && <span className={styles.dot} aria-hidden="true" />}
      {children}
    </span>
  );
}

/** The green tick: every claim shows its proof. */
export function FactsLink({ count, onOpen, pill, proof }: { count: number; onOpen?: () => void; pill?: boolean; proof?: boolean }) {
  const labels = useLabels();
  const text = proof ? `${labels.factsChecked(count)} · ${labels.seeProof}` : labels.factsChecked(count);
  if (!onOpen) {
    return (
      <span className={styles.factsLink}>
        <Icon icon={ShieldCheck} />
        {text}
      </span>
    );
  }
  return (
    <button type="button" className={styles.factsLink} data-pill={pill || undefined} onClick={onOpen}>
      <Icon icon={ShieldCheck} />
      {text}
    </button>
  );
}

export function TypeIcon({ card, small }: { card: Pick<LiveCard, "type" | "side">; small?: boolean }) {
  return (
    <span
      className={styles.typeIcon}
      data-side={card.side ?? undefined}
      data-tone={card.type === "chaos_phase" ? "chaos" : undefined}
      data-filled={card.type === "goal" || card.type === "red_card" || undefined}
      data-size={small ? "small" : undefined}
    >
      <Icon icon={TYPE_ICON[card.type] ?? CircleDot} />
    </span>
  );
}

/** One moment in a list. A goal is tinted in the scorer's colour and says why it matters. */
export function MomentRow({ card, onOpenFacts, compact }: { card: LiveCard; onOpenFacts?: (card: LiveCard) => void; compact?: boolean }) {
  const labels = useLabels();
  const goal = card.type === "goal";
  const kind = labels.insight[card.type] ?? card.type;
  return (
    <article className={styles.moment} data-goal={goal || undefined} data-side={card.side ?? undefined}>
      <TypeIcon card={card} small={compact} />
      <div className={styles.momentText}>
        <span className={styles.momentMeta}>
          {cardMinute(card)} · {goal ? kind.toUpperCase() : kind}
        </span>
        <h3 className={styles.momentTitle}>{keepScores(card.headline)}</h3>
        {!compact && card.body && <p className={styles.momentBody}>{keepScores(card.body)}</p>}
        {goal && !compact && card.why[0] && (
          <p className={styles.momentBody}>
            <b>{labels.whyItMatters}:</b> {keepScores(card.why[0])}
          </p>
        )}
        {card.facts_used.length > 0 && (
          <FactsLink
            count={card.facts_used.length}
            onOpen={onOpenFacts ? () => onOpenFacts(card) : undefined}
            pill={goal}
            proof={goal}
          />
        )}
      </div>
    </article>
  );
}

/** Home value · label · away value, the leader in a filled pill (like a sports card). */
export function StatRows({ rows, definitions }: { rows: StatRow[]; definitions?: boolean }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.key} className={styles.statRow}>
          <span className={styles.statValue} data-at="home" data-leader={r.leader === "home" || undefined}>
            {r.shown.home}
          </span>
          <span className={styles.statLabel}>
            {r.label}
            {definitions && r.definition && <span className={styles.statDef}>{r.definition}</span>}
          </span>
          <span className={styles.statValue} data-at="away" data-leader={r.leader === "away" || undefined}>
            {r.shown.away}
          </span>
        </div>
      ))}
    </>
  );
}

export function StatsHead({ home, away, title, id }: { home: Team; away: Team; title: string; id?: string }) {
  return (
    <div className={styles.statsHead}>
      <Crest teamId={home.id} size="full" name={home.name} />
      <h2 id={id} className={styles.cardTitle}>
        {title}
      </h2>
      <Crest teamId={away.id} size="full" name={away.name} />
    </div>
  );
}

/** Home / draw / away chance to win: three numbers over one bar. */
export function ChanceSplit({ home, draw, away, homeTeam, awayTeam }: { home: number; draw: number; away: number; homeTeam: Team; awayTeam: Team }) {
  const labels = useLabels();
  const parts: [Side | "draw", number, string][] = [
    ["home", home, homeTeam.short_name],
    ["draw", draw, labels.draw],
    ["away", away, awayTeam.short_name],
  ];
  return (
    <div>
      <div className={styles.splitNums}>
        {parts.map(([side, p, name]) => (
          <span key={side} data-side={side}>
            {side === "away" ? (
              <>
                {name} <b>{formatPct(p)}</b>
              </>
            ) : (
              <>
                <b>{formatPct(p)}</b> {name}
              </>
            )}
          </span>
        ))}
      </div>
      <div className={styles.splitBar} aria-hidden="true">
        {parts.map(([side, p]) => (
          <span key={side} data-side={side} style={{ width: `${p * 100}%` }} />
        ))}
      </div>
    </div>
  );
}

// ---------- charts ----------

const W = 900;
const at = (minute: number) => (minute / 90) * W;

function area(series: Series, upTo: number, sign: 1 | -1, h: number): string {
  const mid = h / 2;
  let d = `M0 ${mid}`;
  let last = 0;
  series.minute.forEach((m, i) => {
    if (m > upTo) return;
    const v = sign > 0 ? Math.max(series.momentum[i], 0) : Math.min(series.momentum[i], 0);
    d += ` L${at(m).toFixed(1)} ${(mid - v * mid * 0.94).toFixed(1)}`;
    last = m;
  });
  return `${d} L${at(last).toFixed(1)} ${mid} Z`;
}

function line(values: number[], minutes: number[], upTo: number, h: number, pad = 4): string {
  return minutes
    .map((m, i) => (m > upTo ? "" : `${i ? "L" : "M"}${at(m).toFixed(1)} ${(h - pad - values[i] * (h - pad * 2)).toFixed(1)}`))
    .join(" ");
}

/** Momentum: home above the line, away below; goals ride on it; the rest of the match is grey. */
export function FlowChart({ series, minute, goals, ended }: { series: Series; minute: number; goals: LiveCard[]; ended?: boolean }) {
  const labels = useLabels();
  const h = 140;
  return (
    <div className={styles.chart}>
      <div className={styles.flow}>
        {goals.map((g) => (
          <span
            key={g.insight_id}
            className={styles.flowMarker}
            data-side={g.side ?? "home"}
            style={{ left: `${(Math.min(g.minute, 90) / 90) * 100}%` }}
            title={`${cardMinute(g)} ${g.headline}`}
          >
            <Icon icon={CircleDot} />
          </span>
        ))}
        {!ended && minute > 0 && minute < 90 && (
          <span className={styles.flowNow} style={{ left: `calc(${(minute / 90) * 100}% + 6px)` }}>
            {labels.now} {minute}'
          </span>
        )}
        <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" height={h} role="img" aria-label={labels.flowTitle}>
          {!ended && <rect className={styles.chartFuture} x={at(minute)} y="0" width={W - at(minute)} height={h} />}
          <line className={styles.chartBase} x1="0" y1={h / 2} x2={W} y2={h / 2} vectorEffect="non-scaling-stroke" />
          <line className={styles.chartHalf} x1={W / 2} y1="0" x2={W / 2} y2={h} vectorEffect="non-scaling-stroke" />
          <path className={styles.area} data-side="home" d={area(series, minute, 1, h)} />
          <path className={styles.area} data-side="away" d={area(series, minute, -1, h)} />
          {!ended && minute > 0 && (
            <line className={styles.chartNow} x1={at(minute)} y1="0" x2={at(minute)} y2={h} vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>
      <div className={styles.axis}>
        <span>{labels.kickOff}</span>
        <span>{labels.halfTimeLong}</span>
        <span>{labels.fullTimeLong}</span>
      </div>
    </div>
  );
}

/** A small chance-to-win chart for the live card: one line per side, up to now. */
export function WinSpark({ series, minute }: { series: Series; minute: number }) {
  const labels = useLabels();
  const h = 90;
  return (
    <div className={styles.chart}>
      <svg viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" height={h} role="img" aria-label={labels.chanceToWin}>
        <rect className={styles.chartFuture} x={at(minute)} y="0" width={W - at(minute)} height={h} />
        <line className={styles.chartBase} x1="0" y1={h - 4} x2={W} y2={h - 4} vectorEffect="non-scaling-stroke" />
        <path className={styles.line} data-side="away" d={line(series.away_win, series.minute, minute, h)} vectorEffect="non-scaling-stroke" />
        <path className={styles.line} data-side="home" d={line(series.home_win, series.minute, minute, h)} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/**
 * The whole match's chance to win, with the turning points numbered on the line of the side they
 * helped. Drawn at its own aspect ratio, so the numbers stay round.
 */
export function TurningChart({ series, points }: { series: Series; points: TurningPoint[] }) {
  const labels = useLabels();
  const h = 230;
  const y = (p: number) => 210 - p * 200;
  const valueAt = (minute: number, side: Side | null) => {
    const i = series.minute.indexOf(minute);
    const list = side === "away" ? series.away_win : series.home_win;
    return i >= 0 ? list[i] : 0.5;
  };
  const lineOf = (values: number[]) => series.minute.map((m, i) => `${i ? "L" : "M"}${at(m).toFixed(1)} ${y(values[i]).toFixed(1)}`).join(" ");
  let lastX = -Infinity;
  let flip = false;
  return (
    <div className={styles.chart}>
    <svg viewBox={`0 0 ${W} ${h}`} role="img" aria-label={labels.turningPoints}>
      <line className={styles.chartBase} x1="0" y1="210" x2={W} y2="210" />
      <line className={styles.chartHalf} x1={W / 2} y1="0" x2={W / 2} y2="210" />
      <text className={styles.chartText} x="4" y="24">100%</text>
      <text className={styles.chartText} x="4" y="124">50%</text>
      <path className={styles.line} data-side="away" d={lineOf(series.away_win)} />
      <path className={styles.line} data-side="home" d={lineOf(series.home_win)} />
      {points.map((tp, n) => {
        const x = at(tp.minute);
        const py = y(valueAt(tp.minute, tp.side));
        // Close neighbours alternate above and below, so their numbers never overlap.
        flip = x - lastX < 60 ? !flip : false;
        lastX = x;
        const below = flip || py < 40;
        const by = below ? Math.min(py + 30, 196) : py - 30;
        const bx = Math.min(Math.max(x, 16), W - 16);
        return (
          <g key={tp.insight_id}>
            <line className={styles.pointLeader} x1={x} y1={py} x2={bx} y2={by} />
            <circle className={styles.pointDot} data-side={tp.side ?? "home"} cx={x} cy={py} r="4.5" />
            <circle className={styles.pointBadge} cx={bx} cy={by} r="11" />
            <text className={styles.pointNumber} x={bx} y={by + 4} textAnchor="middle">
              {n + 1}
            </text>
          </g>
        );
      })}
    </svg>
    </div>
  );
}
