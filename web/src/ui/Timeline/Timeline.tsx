import { Activity } from "lucide-react";
import type { LiveCard, Series, TurningPoint } from "../../types/live";
import { cardMinute, turningSwing } from "../format";
import { Icon } from "../Icon/Icon";
import { useLabels } from "../labels";
import styles from "./Timeline.module.css";

export interface TimelineProps {
  series: Series;
  /** Match minute now. Nothing after it is ever drawn. */
  minute: number;
  cards: LiveCard[];
  selectedId?: string;
  onSelect?: (insightId: string) => void;
  /** Full-time only: the goals that moved the win chance, labelled above the chart. */
  turningPoints?: TurningPoint[];
  /** The message: "Northgate City in control". */
  title: string;
  /** The projection note, shown when turning points show win chances. */
  note?: string;
  loading?: boolean;
}

// The chart is drawn in its own units and stretched (preserveAspectRatio="none"), so the pins
// and labels are HTML positioned by the same fractions. A slot is 4 units: 3 bar + 1 gap.
const SLOT = 4;
const BAR = 3;
const HT_GAP = 4; // extra units between 45' and 46'
const WIDTH = 91 * SLOT + HT_GAP;
const HEIGHT = 100;
const HALF = HEIGHT / 2;
const STUB = 3; // half-height of an empty minute, in units

const x0 = (m: number) => m * SLOT + (m > 45 ? HT_GAP : 0);
/** Centre of minute m as a percentage of the chart width. */
const at = (m: number) => `${(((x0(m) + BAR / 2) / WIDTH) * 100).toFixed(3)}%`;
const atNum = (m: number) => ((x0(m) + BAR / 2) / WIDTH) * 100;
const clamp = (v: number) => Math.max(-1, Math.min(1, v));

export function Timeline({
  series, minute, cards, selectedId, onSelect, turningPoints, title, note, loading,
}: TimelineProps) {
  const labels = useLabels();

  if (loading) {
    return (
      <figure className={styles.root} aria-busy="true" aria-label={labels.loading}>
        <div className={styles.skelTitle} />
        <div className={styles.lane} />
        <div className={styles.skelChart} />
        <div className={styles.axis} />
      </figure>
    );
  }

  const momentum = new Map<number, number>();
  const chaos = new Map<number, number>();
  series.minute.forEach((m, k) => {
    if (m > minute) return; // never read past now
    momentum.set(m, series.momentum[k] ?? 0);
    chaos.set(m, series.chaos[k] ?? 0);
  });

  const bars = [];
  for (let m = 0; m <= 90; m++) {
    const v = momentum.get(m);
    const x = x0(m);
    if ((chaos.get(m) ?? 0) > 0.8) {
      bars.push(<rect key={`c${m}`} className={styles.chaos} x={x - 0.5} y={0} width={SLOT} height={HEIGHT} />);
    }
    if (v === undefined || v === 0) {
      bars.push(<rect key={`s${m}`} className={styles.stub} x={x} y={HALF - STUB} width={BAR} height={STUB * 2} />);
    } else {
      const h = Math.abs(clamp(v)) * HALF;
      bars.push(
        <rect
          key={`b${m}`}
          className={v > 0 ? styles.home : styles.away}
          x={x}
          y={v > 0 ? HALF - h : HALF}
          width={BAR}
          height={h}
        />,
      );
    }
  }

  // Chaos stretches of 3+ minutes get an icon above the middle.
  const stretches: { from: number; to: number }[] = [];
  const pinNear = (m: number) => pins.some((c) => Math.abs(c.minute - m) <= 2);
  let run: number | null = null;
  for (let m = 0; m <= minute + 1; m++) {
    const hot = m <= minute && (chaos.get(m) ?? 0) > 0.8;
    if (hot && run === null) run = m;
    if (!hot && run !== null) {
      if (m - run >= 3) stretches.push({ from: run, to: m - 1 });
      run = null;
    }
  }

  const visible = cards.filter((c) => c.minute <= minute);
  const goals = visible.filter((c) => c.type === "goal" && (c.side === "home" || c.side === "away"));
  const pins = visible
    .filter((c) => c.type !== "goal" && c.priority <= 2)
    .sort((a, b) => a.minute - b.minute);
  // Close pins slide right until their 48 px targets stop overlapping (container units).
  const shifts = new Map<string, string>();
  pins.forEach((c, i) => {
    const prev = pins[i - 1];
    if (!prev) return shifts.set(c.insight_id, "0px");
    const d = (atNum(c.minute) - atNum(prev.minute)).toFixed(3);
    shifts.set(c.insight_id, `max(0px, calc(${shifts.get(prev.insight_id)} + var(--space-6) - ${d}cqw))`);
  });
  const selected = visible.find((c) => c.insight_id === selectedId);
  const tps = (turningPoints ?? []).filter((t) => t.minute <= minute);
  const tpCards = cards;

  const axis: { m: number; text: string; phone: boolean }[] = [
    { m: 0, text: "0'", phone: true },
    { m: 15, text: "15'", phone: false },
    { m: 30, text: "30'", phone: false },
    { m: 45, text: labels.halfTime, phone: true },
    { m: 60, text: "60'", phone: false },
    { m: 75, text: "75'", phone: false },
    { m: 90, text: "90'", phone: true },
  ];
  const axisPos = (m: number) => (m === 45 ? `${(((x0(45) + BAR + HT_GAP / 2) / WIDTH) * 100).toFixed(3)}%` : at(m));

  return (
    <figure className={styles.root}>
      <div className={styles.head}>
        <figcaption className={styles.title}>{title}</figcaption>
        {tps.length > 0 && note && (
          <p className={styles.note} data-role="projection-note">
            {note}
          </p>
        )}
      </div>

      <div className={styles.lane}>
        {tps.map((t) => {
          const swing = turningSwing(t, tpCards);
          const p = atNum(t.minute);
          const edge = p > 88 ? "end" : p < 12 ? "start" : "mid";
          return (
            <span key={t.insight_id} className={styles.tp} data-edge={edge} data-side={t.side ?? "none"} style={{ left: at(t.minute) }}>
              <span className={styles.tpMinute}>{t.clock.includes("+") ? t.clock : `${t.minute}'`}</span>
              {" · "}
              <span data-role="probability">
                {swing.before} → {swing.after}
              </span>
            </span>
          );
        })}
      </div>

      <div className={styles.chart}>
        <svg className={styles.svg} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true">
          {bars}
        </svg>
        <div className={styles.centre} />

        {selected && (
          <span className={styles.stem} data-side={selected.side ?? "none"} style={{ left: at(selected.minute) }} aria-hidden="true" />
        )}

        {stretches.filter((s) => !pinNear((s.from + s.to) / 2)).map((s) => (
          <span key={s.from} className={styles.chaosIcon} style={{ left: at((s.from + s.to) / 2) }}>
            <Icon icon={Activity} />
          </span>
        ))}

        {goals.map((g) => (
          <span
            key={g.insight_id}
            className={styles.goal}
            data-side={g.side}
            data-selected={g.insight_id === selectedId || undefined}
            style={{ left: at(g.minute) }}
          />
        ))}

        {pins.map((c) => (
          <button
            key={c.insight_id}
            type="button"
            className={styles.pin}
            data-selected={c.insight_id === selectedId || undefined}
            aria-label={`${cardMinute(c)} ${c.headline}`}
            aria-pressed={c.insight_id === selectedId}
            style={{ left: at(c.minute), translate: shifts.get(c.insight_id) }}
            onClick={() => onSelect?.(c.insight_id)}
          >
            <span className={styles.ring} />
          </button>
        ))}
      </div>

      <div className={styles.axis} aria-hidden="true">
        {axis.map((a) => (
          <span
            key={a.m}
            className={styles.tick}
            data-phone={a.phone || undefined}
            data-edge={a.m === 0 ? "start" : a.m === 90 ? "end" : "mid"}
            style={{ left: axisPos(a.m) }}
          >
            {a.text}
          </span>
        ))}
      </div>
    </figure>
  );
}
