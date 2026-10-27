// The match on the web layout: the score card with its tabs and controls, then the tab. Overview
// is the live page (pitch, flow, stats | right now, chance to win, moments, your player); the
// half-time and full-time stories open by themselves when their brief arrives.

import { Clock, Pause, Play, RotateCcw, Star } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import type { Team } from "../../types/halftime";
import type { LiveCard } from "../../types/live";
import { Crest, Icon, useViewSwitch } from "../../ui";
import { formatMinute, formatPct, formatScore, scorersFrom } from "../../ui/format";
import { useLabels } from "../../ui/labels";
import type { MatchView } from "../../live/feed";
import { Badge, ChanceSplit, FlowChart, MomentRow, StatRows, StatsHead, WinSpark } from "./bits";
import { FulltimeStory, HalftimeStory } from "./stories";
import { chaosWord, liveStats, playerNow, topStats } from "./stats";
import styles from "./web.module.css";

type Tab = "overview" | "moments" | "stats" | "halftime" | "fulltime";

export interface WebMatchProps {
  view: MatchView;
  /** The live pitch (PitchView + PitchLayer), once the squads are known. */
  pitch?: ReactNode;
  playing: boolean;
  ended: boolean;
  speed: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeed: (speed: number) => void;
  /** A plain visit before the first play: the Kick off button on the pitch. */
  waitingKickOff: boolean;
  scoredSide?: "home" | "away";
  /** Half-time: how many of the agents' steps are showing so far. */
  revealed: number;
  onOpenFacts: (card: LiveCard) => void;
  onCatchUp: () => void;
}

const SPEEDS = [1, 60];

function Controls(p: Pick<WebMatchProps, "playing" | "ended" | "speed" | "onPlayPause" | "onRestart" | "onSpeed">) {
  const labels = useLabels();
  const main = p.ended
    ? { icon: RotateCcw, label: labels.restart, on: p.onRestart }
    : p.playing
      ? { icon: Pause, label: labels.pause, on: p.onPlayPause }
      : { icon: Play, label: labels.play, on: p.onPlayPause };
  return (
    <div className={styles.controls} role="group" aria-label={labels.controls} data-role="match-controls">
      <button type="button" className={styles.iconButton} data-main onClick={main.on} aria-label={main.label}>
        <Icon icon={main.icon} />
      </button>
      {!p.ended && (
        <button type="button" className={styles.iconButton} onClick={p.onRestart} aria-label={labels.restart}>
          <Icon icon={RotateCcw} />
        </button>
      )}
      <div className={styles.segment} role="group" aria-label={labels.speedChoice}>
        {SPEEDS.map((s) => (
          <button key={s} type="button" className={styles.segmentButton} aria-pressed={p.speed === s} onClick={() => p.onSpeed(s)}>
            ×{s}
          </button>
        ))}
      </div>
    </div>
  );
}

/** One side of the score card. `reserve`: the other side shows "Your team", so this one keeps the
 *  same room and the crests stay level. */
function TeamBlock({ team, you, loser, reserve }: { team: Team; you: boolean; loser: boolean; reserve: boolean }) {
  const labels = useLabels();
  return (
    <div className={styles.team} data-loser={loser || undefined}>
      <Crest teamId={team.id} size="full" name={team.name} />
      <span className={styles.teamName}>{team.name}</span>
      {(you || reserve) && (
        <span style={you ? undefined : { visibility: "hidden" }} aria-hidden={you ? undefined : true}>
          <Badge tone="team">
            <Icon icon={Star} />
            {labels.yourTeam}
          </Badge>
        </span>
      )}
    </div>
  );
}

function Status({ view }: { view: MatchView }) {
  const labels = useLabels();
  if (view.period === "FT") return <Badge tone="neutral">{labels.fullTimeLong}</Badge>;
  if (view.period === "HT") return <Badge tone="neutral">{labels.halfTimeLong}</Badge>;
  if (view.minute === 0) return <Badge tone="neutral">{labels.kickOff}</Badge>;
  return (
    <Badge tone="live" dot>
      {labels.live} · <span className={styles.minute}>{formatMinute(view.minute, view.period)}</span>
    </Badge>
  );
}

export function WebMatch(props: WebMatchProps) {
  const { view } = props;
  const labels = useLabels();
  const views = useViewSwitch();
  const [tab, setTab] = useState<Tab>(view.period === "FT" && view.fulltime ? "fulltime" : view.period === "HT" && view.halftime ? "halftime" : "overview");

  // The stories open themselves when their brief arrives, and the live page comes back when the
  // second half starts. A tab the viewer picks stays until the period changes.
  const last = useRef({ period: view.period, ht: !!view.halftime, ft: !!view.fulltime });
  useEffect(() => {
    const was = last.current;
    const now = { period: view.period, ht: !!view.halftime, ft: !!view.fulltime };
    last.current = now;
    if (now.period === "FT" && now.ft && !(was.period === "FT" && was.ft)) setTab("fulltime");
    else if (now.period === "HT" && now.ht && !(was.period === "HT" && was.ht)) setTab("halftime");
    else if (was.period === "HT" && now.period === "2H") setTab((t) => (t === "halftime" ? "overview" : t));
  }, [view.period, view.halftime, view.fulltime]);
  // A restart or another match: back to the live page.
  useEffect(() => {
    if (view.minute === 0) setTab("overview");
  }, [view.minute, view.match_id]);

  const ft = view.period === "FT";
  const loser = ft && view.score.home !== view.score.away ? (view.score.home < view.score.away ? "home" : "away") : null;
  const scorers = scorersFrom(view.cards);
  const meta = [
    view.meta.scenario_title,
    view.meta.venue,
    view.meta.attendance ? view.meta.attendance.toLocaleString("en-GB") : "",
    view.meta.weather,
  ].filter(Boolean);
  const tabs: [Tab, string][] = [
    ["overview", labels.tabOverview],
    ["moments", labels.tabMoments],
    ["stats", labels.tabStats],
    ...(view.halftime ? ([["halftime", labels.tabHalfTime]] as [Tab, string][]) : []),
    ...(view.fulltime ? ([["fulltime", labels.fullTimeLong]] as [Tab, string][]) : []),
  ];
  const kickOff = props.waitingKickOff && (
    <button type="button" className={styles.btnPrimary} onClick={props.onPlayPause} data-role="kick-off">
      <Icon icon={Play} />
      {labels.kickOff}
    </button>
  );

  return (
    <main className={styles.main} data-screen="live" data-tab={tab}>
      <section className={styles.scoreCard} data-period={view.period} aria-label={`${view.home.name} ${formatScore(view.score)} ${view.away.name}`}>
        <h1 className="sr-only">
          {view.home.name} {formatScore(view.score)} {view.away.name}
        </h1>
        {meta.length > 0 && <p className={styles.scoreMeta}>{meta.join(" · ")}</p>}
        <div className={styles.scoreRow}>
          <TeamBlock team={view.home} you={view.profile.team === view.home.id} reserve={view.profile.team === view.away.id} loser={loser === "home"} />
          <div className={styles.scoreCenter}>
            <div className={styles.score} data-scored={props.scoredSide} key={`${view.score.home}-${view.score.away}`}>
              <span data-loser={loser === "home" || undefined}>{view.score.home}</span>
              <span className={styles.scoreSep} aria-hidden="true">
                –
              </span>
              <span data-loser={loser === "away" || undefined}>{view.score.away}</span>
            </div>
            <Status view={view} />
            {!props.pitch && kickOff}
          </div>
          <TeamBlock team={view.away} you={view.profile.team === view.away.id} reserve={view.profile.team === view.home.id} loser={loser === "away"} />
        </div>
        {(scorers.home.length > 0 || scorers.away.length > 0) && (
          <div className={styles.scorers}>
            <span>{scorers.home.join(" · ")}</span>
            <span />
            <span>{scorers.away.join(" · ")}</span>
          </div>
        )}
        <div className={styles.scoreBar}>
          <div className={styles.tabs} role="tablist" aria-label={labels.matchSections}>
            {tabs.map(([id, name]) => (
              <button
                key={id}
                type="button"
                role="tab"
                className={styles.tab}
                aria-selected={tab === id}
                onClick={() => setTab(id)}
                data-tab={id}
              >
                {name}
              </button>
            ))}
          </div>
          <div className={styles.controls}>
            {!ft && view.minute > 0 && (
              <button type="button" className={`${styles.control} ${styles.catchUpWide}`} onClick={props.onCatchUp}>
                <Icon icon={Clock} />
                {labels.catchUp}
              </button>
            )}
            <Controls {...props} />
          </div>
        </div>
      </section>

      {!ft && view.minute > 0 && (
        <div className={styles.catchUpNarrow}>
          <button type="button" className={styles.control} onClick={props.onCatchUp}>
            <Icon icon={Clock} />
            {labels.catchUp}
          </button>
        </div>
      )}

      {tab === "overview" && <Overview {...props} kickOff={kickOff} onAllMoments={() => setTab("moments")} onAllStats={() => setTab("stats")} />}
      {tab === "moments" && <Moments view={view} onOpenFacts={props.onOpenFacts} />}
      {tab === "stats" && <Stats view={view} />}
      {tab === "halftime" && view.halftime && (
        <HalftimeStory
          brief={view.halftime}
          view={view}
          trace={view.agentTrace}
          revealed={props.revealed}
          onOpenFacts={props.onOpenFacts}
          onContinue={() => {
            setTab("overview");
            if (!props.playing) props.onPlayPause();
          }}
        />
      )}
      {tab === "fulltime" && view.fulltime && (
        <FulltimeStory
          brief={view.fulltime}
          view={view}
          onOpenFacts={props.onOpenFacts}
          onReplay={props.onRestart}
          onTable={views ? () => views.onView("table") : undefined}
        />
      )}
      <p className={styles.footer}>{labels.footerNote}</p>
    </main>
  );
}

function Overview(props: WebMatchProps & { kickOff: ReactNode; onAllMoments: () => void; onAllStats: () => void }) {
  const { view } = props;
  const labels = useLabels();
  const goals = view.cards.filter((c) => c.type === "goal" && c.side);
  const { rows } = liveStats(view, labels);
  const top = topStats(rows);
  const recent = [...view.cards].reverse().slice(0, 4);
  const player = playerNow(view);
  const ended = view.period === "FT";
  const share = view.control.home_share;
  const leader = share >= 0.5 ? view.home : view.away;
  const phaseSide = view.control.phase === "home_control" ? "home" : view.control.phase === "away_control" ? "away" : undefined;

  // data-order: the phone's single column puts the moments right under "Right now".
  return (
    <div className={styles.columns} data-mix>
      <div className={styles.colMain}>
        {props.pitch && (
          <section className={styles.card} aria-labelledby="pitch-h" data-order="1">
            <div className={styles.cardHead}>
              <h2 id="pitch-h" className={styles.cardTitle}>
                {labels.livePitch}
              </h2>
              {view.profile.persona === "analyst" && <Badge tone="neutral">{labels.analystView}</Badge>}
            </div>
            <div className={styles.pitchBox}>
              {props.pitch}
              {props.kickOff && <div className={styles.pitchStart}>{props.kickOff}</div>}
            </div>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-side="home" />
                {view.home.name}
              </span>
              <span className={styles.legendItem}>
                <span className={styles.swatch} data-side="away" />
                {view.away.name}
              </span>
            </div>
          </section>
        )}

        <section className={styles.card} aria-labelledby="flow-h" data-order="5">
          <div className={styles.cardHead}>
            <h2 id="flow-h" className={styles.cardTitle}>
              {labels.flowTitle}
            </h2>
            <span className={styles.cardLead}>{labels.flowLead}</span>
          </div>
          <FlowChart series={view.series} minute={view.minute} goals={goals} ended={ended} />
          <div className={styles.legend}>
            <span className={styles.legendItem}>
              <span className={styles.swatch} data-side="home" />
              {labels.flowAbove(view.home.name)}
            </span>
            <span className={styles.legendItem}>
              <span className={styles.swatch} data-side="away" />
              {labels.flowBelow(view.away.name)}
            </span>
          </div>
        </section>

        <section className={styles.card} aria-labelledby="top-h" data-order="6">
          <StatsHead home={view.home} away={view.away} title={labels.topStats} id="top-h" />
          <StatRows rows={top} />
          <button type="button" className={styles.linkButton} onClick={props.onAllStats}>
            {labels.allStats} →
          </button>
        </section>
      </div>

      <aside className={styles.colSide}>
        {view.minute > 0 && (
          <section className={styles.card} aria-labelledby="now-h" data-order="2">
            <h2 id="now-h" className={styles.eyebrow}>
              {ended ? labels.fullTimeLong : labels.rightNow}
            </h2>
            <p className={styles.controlNow} data-side={phaseSide}>
              {view.control.label}
            </p>
            {!ended && (
              <>
                <p className={styles.momentBody}>{labels.controlShare(leader.name, formatPct(Math.max(share, 1 - share)))}</p>
                <div style={{ marginTop: 12 }}>
                  <div className={styles.splitBar} aria-hidden="true">
                    <span data-side="home" style={{ width: `${share * 100}%` }} />
                    <span data-side="away" style={{ width: `${(1 - share) * 100}%` }} />
                  </div>
                  <div className={styles.controlLegend}>
                    <span>
                      {view.home.short_name} <b>{formatPct(share)}</b>
                    </span>
                    <Badge tone="chaos">{labels.chaosLevel(labels.chaosWords[chaosWord(view.control.chaos)])}</Badge>
                    <span>
                      <b>{formatPct(1 - share)}</b> {view.away.short_name}
                    </span>
                  </div>
                </div>
              </>
            )}
          </section>
        )}

        {!ended && (
          <section className={styles.card} aria-labelledby="win-h" data-order="4">
            <div className={styles.cardHead}>
              <h2 id="win-h" className={styles.cardTitle}>
                {labels.chanceToWin}
              </h2>
            </div>
            <ChanceSplit
              home={view.projection.home_win}
              draw={view.projection.draw}
              away={view.projection.away_win}
              homeTeam={view.home}
              awayTeam={view.away}
            />
            {view.minute > 0 && (
              <div style={{ marginTop: 14 }}>
                <WinSpark series={view.series} minute={view.minute} />
              </div>
            )}
            <p className={styles.note}>{view.projection.note}</p>
          </section>
        )}

        <section className={styles.card} aria-labelledby="moments-h" data-order="3">
          <div className={styles.cardHead}>
            <h2 id="moments-h" className={styles.cardTitle}>
              {labels.keyMoments}
            </h2>
            <span className={styles.cardLead}>{labels.newestFirst}</span>
          </div>
          {recent.length ? (
            <div className={styles.moments}>
              {recent.map((c) => (
                <MomentRow key={c.insight_id} card={c} onOpenFacts={props.onOpenFacts} />
              ))}
            </div>
          ) : (
            <p className={styles.empty}>{labels.emptyMoment}</p>
          )}
          {view.cards.length > recent.length && (
            <button type="button" className={styles.linkButton} onClick={props.onAllMoments}>
              {labels.seeAllMoments} →
            </button>
          )}
        </section>

        {player && (
          <section className={styles.card} aria-labelledby="player-h" data-order="7">
            <div className={styles.player}>
              <span className={styles.shirt}>{player.number ?? player.name.charAt(0)}</span>
              <div>
                <span className={styles.eyebrow}>{labels.yourPlayer}</span>
                <h2 id="player-h" className={styles.cardTitle}>
                  {player.name}
                </h2>
                {player.position && <span className={styles.muted}>{labels.positions[player.position] ?? player.position}</span>}
              </div>
            </div>
            <div className={styles.tiles}>
              {player.touches !== undefined && (
                <span className={styles.tile}>
                  <span className={styles.tileValue}>{player.touches}</span>
                  <span className={styles.tileLabel}>{labels.touches}</span>
                </span>
              )}
              <span className={styles.tile}>
                <span className={styles.tileValue}>
                  {player.passes.done}/{player.passes.total}
                </span>
                <span className={styles.tileLabel}>{labels.passing}</span>
              </span>
              {player.ballWins !== undefined && (
                <span className={styles.tile}>
                  <span className={styles.tileValue}>{player.ballWins}</span>
                  <span className={styles.tileLabel}>{labels.ballWins}</span>
                </span>
              )}
              <span className={styles.tile}>
                <span className={styles.tileValue}>{player.goals > 0 ? player.goals : player.pressures}</span>
                <span className={styles.tileLabel}>{player.goals > 0 ? labels.goals : labels.pressures}</span>
              </span>
            </div>
          </section>
        )}
      </aside>
    </div>
  );
}

function Moments({ view, onOpenFacts }: { view: MatchView; onOpenFacts: (card: LiveCard) => void }) {
  const labels = useLabels();
  const all = [...view.cards].reverse();
  return (
    <section className={styles.card} aria-labelledby="all-moments-h">
      <div className={styles.cardHead}>
        <h2 id="all-moments-h" className={styles.cardTitle}>
          {labels.keyMoments}
        </h2>
        <span className={styles.cardLead}>{labels.newestFirst}</span>
      </div>
      {all.length ? (
        <div className={styles.moments}>
          {all.map((c) => (
            <MomentRow key={c.insight_id} card={c} onOpenFacts={onOpenFacts} />
          ))}
        </div>
      ) : (
        <p className={styles.empty}>{labels.emptyMoment}</p>
      )}
    </section>
  );
}

function Stats({ view }: { view: MatchView }) {
  const labels = useLabels();
  const { rows, fromEvents } = liveStats(view, labels);
  const half = Math.ceil(rows.length / 2);
  return (
    <section className={styles.card} aria-labelledby="all-stats-h">
      <StatsHead home={view.home} away={view.away} title={labels.tabStats} id="all-stats-h" />
      <div className={styles.statsGrid}>
        <div>
          <StatRows rows={rows.slice(0, half)} definitions={!fromEvents} />
        </div>
        <div>
          <StatRows rows={rows.slice(half)} definitions={!fromEvents} />
        </div>
      </div>
      {fromEvents && <p className={styles.note}>{labels.statsFromEvents}</p>}
    </section>
  );
}
