// Half-time (S5) and full-time (S8). Same frame as the live screen: the top bar stays, so the
// viewer never loses "Synthetic data" or their profile.
//
// Half-time: the brief on the left (1080), the agents on the right (600). No score header: the
//   brief's headline already says "Kingston Vale lead 0-2 at the break", and both columns need
//   the height. Plain visits open with the brief alone and a button that shows the agents
//   (Syahmi's note, 26 Oct); director URLs (S5) and the lab show them from the start.
// Full-time: the score header (the loser dims), the brief's headline and the player of the
//   match, then the timeline with every turning point and its swing. The swings are said once,
//   on the timeline; the brief leaves its own list out.

import { useLayoutEffect, useRef, useState } from "react";
import type { BriefPoint, LiveCard } from "../types/live";
import { AgentTrace, BriefPanel, FactsSheet, ScoreHeader, Timeline, TopBar } from "../ui";
import { scorersFrom } from "../ui/format";
import { useLabels, type Labels } from "../ui/labels";
import type { MatchView } from "../live/feed";
import type { Connection } from "../live/useMatchFeed";
import { useLastFacts } from "./LiveScreen";
import styles from "./screens.module.css";

interface BreakProps {
  view: MatchView;
  connection: Connection;
  facts?: LiveCard | null;
  onOpenFacts?: (card: LiveCard) => void;
  onCloseFacts?: () => void;
  onLanguage?: () => void;
  onPersona?: () => void;
}

function Bar({ view, connection, onLanguage, onPersona }: BreakProps) {
  const you = view.profile.team === view.away.id ? view.away : view.home;
  return (
    <TopBar
      meta={view.meta}
      profile={view.profile}
      team={view.profile.team ? you : undefined}
      connection={connection}
      onLanguage={onLanguage}
      onPersona={onPersona}
    />
  );
}

/**
 * A brief point opens the same facts sheet as a card. The sheet only reads the card fields a
 * point also has, so the point is shown as a card with no swing of its own.
 */
export function pointAsCard(point: BriefPoint, view: MatchView): LiveCard {
  return {
    insight_id: `brief:${point.title}`,
    type: "player_focus",
    variant: "brief",
    minute: view.minute,
    second: 0,
    clock: `${view.minute}:00`,
    priority: 2,
    side: null,
    team_id: null,
    players: [],
    headline: point.title,
    body: point.body,
    why: [],
    facts_used: point.facts_used,
    evidence: point.evidence,
    tags: [],
    language: view.profile.language,
    persona: view.profile.persona,
    source: (view.halftime ?? view.fulltime)?.summary_source ?? "template",
  };
}

export function HalfTimeScreen(props: BreakProps & { revealed?: number; agentsOpen?: boolean }) {
  const { view, facts, revealed } = props;
  const [open, setOpen] = useState(props.agentsOpen ?? true);
  const sheetCard = useLastFacts(facts);
  const brief = view.halftime!;
  const labels = useLabels();
  // A real trace can be longer than the column: keep the newest step in view, like a log.
  const trace = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = trace.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [revealed, view.agentTrace, open]);
  // Plan B (#9): the agents didn't run. The brief's own source line already says "written from
  // templates", so the brief stands alone at full width rather than beside an empty panel.
  const alone = view.agentTrace !== null && view.agentTrace.length === 0;
  return (
    <div className={styles.screen} data-screen="halftime">
      <Bar {...props} />
      <div className={styles.halftime} data-alone={alone || !open || undefined}>
        {/* The longest brief (Malay analyst) runs past the column, so it scrolls; English fits. */}
        <div className={styles.brief} tabIndex={0} role="region" aria-label={labels.halfTimeLong}>
          <BriefPanel brief={brief} onOpenFacts={(p) => props.onOpenFacts?.(pointAsCard(p, view))} />
        </div>
        {!alone && open && (
          // Focusable, so a keyboard can scroll a long trace (WCAG 2.1.1).
          <div className={styles.trace} ref={trace} tabIndex={0} role="region" aria-label={labels.agentsAtWork}>
            {view.agentTrace && (
              <AgentTrace steps={view.agentTrace} revealed={revealed} source={brief.summary_source} />
            )}
          </div>
        )}
      </div>
      {!alone && view.agentTrace && (
        <button type="button" className={styles.agentsToggle} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          {open ? labels.hideAgents : labels.showAgents}
        </button>
      )}
      {sheetCard && <FactsSheet open={!!facts} card={sheetCard} note={view.projection.note} onClose={props.onCloseFacts} />}
    </div>
  );
}

/** Full time: who controlled the whole match, from the brief's minutes. The live label only
 *  says who held it in the last minutes, which can be the side that lost. */
function matchControl(view: MatchView, labels: Labels): string {
  const cp = view.fulltime!.control_profile;
  if (cp.home_control === cp.away_control) return labels.balanced;
  return labels.inControl(cp.home_control > cp.away_control ? view.home.name : view.away.name);
}

export function FullTimeScreen(props: BreakProps) {
  const { view, facts } = props;
  const sheetCard = useLastFacts(facts);
  const brief = view.fulltime!;
  const note = view.projection.note;
  const labels = useLabels();
  return (
    <div className={styles.screen} data-screen="fulltime">
      <Bar {...props} />
      <ScoreHeader
        home={view.home}
        away={view.away}
        score={view.score}
        period="FT"
        minute={view.minute}
        scorers={scorersFrom(view.cards)}
      />
      <div className={styles.stage}>
        <div className={styles.moment}>
          <BriefPanel
            brief={brief}
            note={note}
            turningPoints={false}
            onOpenFacts={(p) => props.onOpenFacts?.(pointAsCard(p, view))}
          />
        </div>
      </div>
      <Timeline
        series={view.series}
        minute={view.minute}
        cards={view.cards}
        onSelect={(id) => {
          const card = view.cards.find((c) => c.insight_id === id);
          if (card) props.onOpenFacts?.(card);
        }}
        turningPoints={brief.turning_points}
        title={matchControl(view, labels)}
        note={note}
      />
      {sheetCard && <FactsSheet open={!!facts} card={sheetCard} note={note} onClose={props.onCloseFacts} />}
    </div>
  );
}
