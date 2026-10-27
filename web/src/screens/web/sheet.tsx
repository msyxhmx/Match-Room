// The web layout's sheet: a drawer from the right on a laptop, a bottom sheet on a phone. It holds
// the proof behind a card (facts and the match events) or the "just joined" catch-up.

import { ShieldCheck, X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { EvidenceRef, Side } from "../../types/halftime";
import type { FactUsed, LiveCard } from "../../types/live";
import { Icon } from "../../ui";
import { cardMinute, formatScore, keepScores, swingOf } from "../../ui/format";
import { useLabels } from "../../ui/labels";
import type { MatchView } from "../../live/feed";
import { MomentRow } from "./bits";
import styles from "./web.module.css";

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function WebSheet({ kind, title, onClose, children }: { kind: ReactNode; title: string; onClose: () => void; children: ReactNode }) {
  const labels = useLabels();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    const back = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflow;
      back?.focus?.({ preventScroll: true });
    };
  }, []);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.sheetRoot}>
      <div className={styles.sheetScrim} onClick={onClose} data-role="scrim" />
      <div
        ref={panel}
        className={styles.sheetPanel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <div className={styles.sheetHead}>
          <span className={styles.sheetKind}>{kind}</span>
          <button type="button" className={styles.sheetClose} onClick={onClose} aria-label={labels.close}>
            <Icon icon={X} />
          </button>
        </div>
        <div className={styles.sheetBody}>
          <h2 id={titleId} className="sr-only">
            {title}
          </h2>
          {children}
        </div>
      </div>
    </div>
  );
}

/** What the proof sheet shows: a card, a brief point or a season storyline. */
export interface Proof {
  eyebrow: string;
  side?: Side | null;
  title: string;
  body?: string;
  source?: "template" | "llm";
  facts: FactUsed[];
  evidence: EvidenceRef[];
  /** The win-chance swing the card proves, and whose chance it is. */
  swing?: { team: string; before: string; after: string };
  note?: string;
}

export function proofOfCard(card: LiveCard, view: Pick<MatchView, "home" | "away">, kind: string, note?: string): Proof {
  const team = card.side === "home" ? view.home : card.side === "away" ? view.away : undefined;
  const swing = swingOf(card);
  return {
    // A brief point has no minute of its own: its kind (the half-time or full-time story) says it.
    eyebrow: card.variant === "brief" ? kind : [cardMinute(card), kind, team?.name].filter(Boolean).join(" · "),
    side: card.side,
    title: card.headline,
    body: card.body,
    source: card.source,
    facts: card.facts_used,
    evidence: card.evidence,
    swing: swing && team ? { team: team.name, before: swing.before, after: swing.after } : undefined,
    note: swing ? note : undefined,
  };
}

/** The evidence line without its leading minute, which sits in the chip beside it. */
const withoutMinute = (text: string) => text.replace(/^\d+(\+\d+)?'\s*/, "");

export function ProofSheet({ proof, onClose }: { proof: Proof; onClose: () => void }) {
  const labels = useLabels();
  const evidence = [...proof.evidence].sort((a, b) => a.minute - b.minute);
  return (
    <WebSheet
      kind={
        <>
          <Icon icon={ShieldCheck} />
          {labels.factCheck}
        </>
      }
      title={proof.title}
      onClose={onClose}
    >
      <div>
        <span className={styles.proofEyebrow} data-side={proof.side ?? undefined}>
          {proof.eyebrow}
        </span>
        <p className={styles.proofTitle}>{keepScores(proof.title)}</p>
        {proof.body && <p className={styles.proofBody}>{keepScores(proof.body)}</p>}
      </div>

      <div className={styles.checkedBox}>
        <Icon icon={ShieldCheck} />
        <div>
          <b>{labels.checked}</b>
          {labels.checkedLong}
          {proof.source && ` ${proof.source === "llm" ? labels.llmSource : labels.templateSource}.`}
        </div>
      </div>

      {proof.swing && (
        <section>
          <h3 className={styles.sheetSub}>{labels.whyItMatters}</h3>
          <div className={styles.boxed}>
            <span className={styles.muted}>{labels.chanceOf(proof.swing.team)}</span>
            <div className={styles.swingRow}>
              <span>{labels.before}</span>
              <span className={styles.swingTrack}>
                <span style={{ width: proof.swing.before }} />
              </span>
              <b>{proof.swing.before}</b>
            </div>
            <div className={styles.swingRow}>
              <span>{labels.after}</span>
              <span className={styles.swingTrack} data-side={proof.side ?? undefined}>
                <span style={{ width: proof.swing.after }} />
              </span>
              <b>{proof.swing.after}</b>
            </div>
          </div>
        </section>
      )}

      {proof.facts.length > 0 && (
        <section>
          <h3 className={styles.sheetSub}>
            {labels.factsUsed} <span>· {proof.facts.length}</span>
          </h3>
          <dl className={`${styles.boxed} ${styles.facts}`}>
            {proof.facts.map((f) => (
              <div key={f.key} className={styles.fact}>
                <dt>{f.label}</dt>
                <dd>{keepScores(f.value)}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {evidence.length > 0 && (
        <section>
          <h3 className={styles.sheetSub}>
            {labels.eventsBehind} <span>· {evidence.length}</span>
          </h3>
          <ol className={styles.evidence}>
            {evidence.map((e) => (
              <li key={e.event_id} className={styles.evidenceItem}>
                <span className={styles.evidenceMinute}>{e.minute}'</span>
                <div>
                  <div className={styles.evidenceText}>{withoutMinute(e.description)}</div>
                  <div className={styles.mono}>{e.event_id}</div>
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}

      {proof.note && <p className={styles.muted}>{proof.note}</p>}
    </WebSheet>
  );
}

/** "Just joined?": the score, who's on top, and the big moments so far. */
export function CatchUpSheet({ view, onClose, onOpenFacts }: { view: MatchView; onClose: () => void; onOpenFacts: (card: LiveCard) => void }) {
  const labels = useLabels();
  const big = view.cards.filter((c) => c.priority === 1);
  return (
    <WebSheet kind={labels.catchUpTitle} title={labels.catchUpTitle} onClose={onClose}>
      <div>
        <span className={styles.proofEyebrow}>{view.minute}'</span>
        <p className={styles.proofTitle}>
          {view.home.name} {formatScore(view.score)} {view.away.name}
        </p>
        <p className={styles.proofBody}>{view.control.label}</p>
      </div>
      {big.length ? (
        <div className={styles.moments}>
          {big.map((c) => (
            <MomentRow key={c.insight_id} card={c} onOpenFacts={onOpenFacts} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{labels.catchUpEmpty}</p>
      )}
    </WebSheet>
  );
}
