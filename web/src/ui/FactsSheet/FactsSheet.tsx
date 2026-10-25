import { Check } from "lucide-react";
import type { LiveCard } from "../../types/live";
import { cardMinute } from "../format";
import { Pill } from "../Pill/Pill";
import { Sheet } from "../Sheet/Sheet";
import { useLabels } from "../labels";
import styles from "./FactsSheet.module.css";

export interface FactsSheetProps {
  open: boolean;
  card: LiveCard;
  note: string;
  onClose?: () => void;
  detent?: "medium" | "large";
}

export function FactsSheet({ open, card, note, onClose, detent = "medium" }: FactsSheetProps) {
  const labels = useLabels();
  const evidence = [...card.evidence].sort((a, b) => a.minute - b.minute);
  const showsProbability = card.facts_used.some((f) => f.key.startsWith("win_"));
  const source = card.source === "template" ? labels.templateSource : labels.llmSource;

  return (
    <Sheet open={open} onClose={onClose} title={card.headline} detent={detent}>
      <div className={styles.root}>
        <p className={styles.sub}>
          <span className={styles.minute}>{cardMinute(card)}</span>
          <span>{labels.insight[card.type]}</span>
        </p>

        <section className={styles.group} aria-labelledby={`${card.insight_id}-facts`}>
          <h3 id={`${card.insight_id}-facts`} className={styles.heading}>
            {labels.factsUsed}
          </h3>
          <dl className={styles.list}>
            {card.facts_used.map((f) => (
              <div className={styles.fact} key={f.key}>
                <dt className={styles.label}>{f.label}</dt>
                <dd
                  className={styles.value}
                  data-role={f.key.startsWith("win_") ? "probability" : undefined}
                >
                  {f.value}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        <section className={styles.group} aria-labelledby={`${card.insight_id}-evidence`}>
          <h3 id={`${card.insight_id}-evidence`} className={styles.heading}>
            {labels.evidence}
          </h3>
          <ul className={styles.list}>
            {evidence.map((e) => (
              <li className={styles.evidence} key={e.event_id}>
                <span className={styles.description}>{e.description}</span>
                <span className={styles.eventId}>{e.event_id}</span>
              </li>
            ))}
          </ul>
        </section>

        <footer className={styles.footer}>
          <Pill tone="positive" icon={Check}>
            {labels.checked}
          </Pill>
          <p className={styles.source}>{source}</p>
          {showsProbability && (
            <p className={styles.note} data-role="projection-note">
              {note}
            </p>
          )}
        </footer>
      </div>
    </Sheet>
  );
}
