// The live match, layout B "centre stage" (DESIGN §9.9): top bar, score, the moment, the
// timeline. Pure: the container (MatchScreen) decides which card is on stage and when it is
// arriving; this only places the parts.

import { useRef } from "react";
import type { Team } from "../types/halftime";
import type { LiveCard } from "../types/live";
import { FactsSheet, MomentCard, ScoreHeader, Timeline, TopBar } from "../ui";
import { scorersFrom } from "../ui/format";
import type { MatchView } from "../live/feed";
import type { Connection } from "../live/useMatchFeed";
import styles from "./screens.module.css";

export interface LiveScreenProps {
  view: MatchView;
  speed: number;
  connection: Connection;
  /** The card on stage (the moment rule, or a pin the viewer picked). */
  stage: LiveCard | null;
  arriving?: boolean;
  /** The stage card was just re-worded (language or persona switch). */
  relabel?: boolean;
  scoredSide?: "home" | "away";
  /** The card whose facts are open, if any. */
  facts?: LiveCard | null;
  onOpenFacts?: (card: LiveCard) => void;
  onCloseFacts?: () => void;
  onSelect?: (insightId: string) => void;
  onLanguage?: () => void;
  onPersona?: () => void;
  loading?: boolean;
}

export function teamOf(view: Pick<MatchView, "home" | "away">, card: Pick<LiveCard, "side">): Team | undefined {
  return card.side === "home" ? view.home : card.side === "away" ? view.away : undefined;
}

/** The last card whose facts were open, so the sheet can play its closing motion. */
export function useLastFacts(facts: LiveCard | null | undefined): LiveCard | null {
  const last = useRef<LiveCard | null>(null);
  if (facts) last.current = facts;
  return last.current;
}

export function LiveScreen(props: LiveScreenProps) {
  const { view, speed, connection, stage, arriving, relabel, scoredSide, facts } = props;
  const sheetCard = useLastFacts(facts);
  const note = view.projection.note;
  const you = view.profile.team === view.away.id ? view.away : view.home;

  return (
    <div className={styles.screen} data-screen="live">
      <TopBar
        meta={view.meta}
        profile={view.profile}
        team={view.profile.team ? you : undefined}
        connection={connection}
        onLanguage={props.onLanguage}
        onPersona={props.onPersona}
      />
      <ScoreHeader
        home={view.home}
        away={view.away}
        score={view.score}
        period={view.period}
        minute={view.minute}
        speed={speed}
        scorers={scorersFrom(view.cards)}
        scoredSide={scoredSide}
        loading={props.loading}
      />
      <div className={styles.stage}>
        <div className={styles.moment}>
          <MomentCard
            // A new card is a new element, so its arrival never replays on the old one.
            key={stage?.insight_id ?? "empty"}
            card={stage ?? (view.cards[0] as LiveCard)}
            team={stage ? teamOf(view, stage) : undefined}
            note={note}
            arriving={arriving}
            relabel={relabel}
            empty={!stage && !props.loading}
            loading={props.loading}
            onOpenFacts={stage && props.onOpenFacts ? () => props.onOpenFacts!(stage) : undefined}
          />
        </div>
      </div>
      <Timeline
        series={view.series}
        minute={view.minute}
        cards={view.cards}
        selectedId={stage?.insight_id}
        onSelect={props.onSelect}
        title={view.control.label}
        loading={props.loading}
      />
      {sheetCard && <FactsSheet open={!!facts} card={sheetCard} note={note} onClose={props.onCloseFacts} />}
    </div>
  );
}
