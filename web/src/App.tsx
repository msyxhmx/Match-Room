// Match-Room Live. Two routes (Static Web Apps rewrites every path to index.html):
//   /          the live match, played from the API, in director mode for the video
//   /overlay   the broadcast graphics: transparent for OBS, or ?plate=1 for the video
//
// The containers here hold the timers and the state; the screens in src/screens are pure.

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { clubSlots } from "./clubColours";
import { nowSeconds } from "./live/feed";
import { pickStage } from "./live/stage";
import { useDirector } from "./live/useDirector";
import { PREVIEW } from "./live/useMatchFeed";
import { useMatchList, useSeason } from "./live/useBrowse";
import { useMatchFeed } from "./live/useMatchFeed";
import type { MatchView } from "./live/feed";
import { PitchLayer } from "./pitch/PitchLayer";
import { PitchView } from "./pitch/PitchView";
import { moreImportant, overlayAt, OverlayScreen } from "./screens/OverlayScreen";
import { BrowseScreen } from "./screens/BrowseScreen";
import { MatchPicker } from "./screens/MatchPicker";
import { MatchScreen } from "./screens/MatchScreen";
import { SeasonScreen } from "./screens/SeasonScreen";
import type { LiveCard, MatchMeta, OverlayMessage, Score } from "./types/live";
import { KickOffButton, MatchControls, PAGE_VIEWS, TopBar, ViewSwitchContext, type PageView } from "./ui";
import { LABELS, LabelsProvider } from "./ui/labels";
import { WebMatch } from "./screens/web/WebMatch";
import { WebMatches, type NowShowing } from "./screens/web/WebMatches";
import { WebShell } from "./screens/web/WebShell";
import { WebTable } from "./screens/web/WebTable";
import { CatchUpSheet, ProofSheet, proofOfCard } from "./screens/web/sheet";
import styles from "./App.module.css";

const VIDEO = { width: 1920, height: 1080 };
/** Under this width the phone layout takes over; above it the 1920 frame scales to fit. A phone
 *  held sideways (short and wide) also gets the phone layout: the 1920 frame would shrink to
 *  about 40% and its text to 8 px. */
const PHONE_MAX = 700;
const PHONE_MAX_HEIGHT = 500;
/** How long a moment or a score counts as "just arrived" (its motion is shorter). */
const ARRIVAL_MS = 1200;
/** Half-time: one agent step every this long, so the trace reads on camera. */
const TRACE_STEP_MS = 700;
/** Overlay graphics stay up at least this long, whatever the speed. */
const OVERLAY_MIN_MS = 4000;
/** On the plate, the longest a goal alert waits for the pitch to show the goal (×1, ×60). */
const GOAL_WAIT_MS = 75_000;
const GOAL_WAIT_FAST_MS = 6000;

const reducedMotion = () => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

function useWindowSize() {
  const [size, setSize] = useState({ width: window.innerWidth, height: window.innerHeight });
  useEffect(() => {
    const on = () => setSize({ width: window.innerWidth, height: window.innerHeight });
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return size;
}

/**
 * Recordings are video first: on anything wider than a phone, the screen is the 1920 × 1080
 * frame, zoomed to fit the window like a TV picture (the recording window gets it at 1:1).
 * Plain visits get the web layout instead (`web`): a page that scrolls, at any width.
 */
function Frame({ clubs, transparent, web, children }: { clubs: [string, string, string]; transparent?: boolean; web?: boolean; children: ReactNode }) {
  const { width, height } = useWindowSize();
  const phone = width < PHONE_MAX || height < PHONE_MAX_HEIGHT;
  const zoom = phone || web ? 1 : Math.min(width / VIDEO.width, height / VIDEO.height);
  return (
    <div className={styles.window} data-transparent={transparent ? "true" : undefined} data-web={web || undefined}>
      <div
        className={`mr-root ${web ? styles.web : phone ? styles.phone : `video ${styles.video}`}`}
        data-transparent={transparent ? "true" : undefined}
        style={{ ...clubSlots(...clubs), ...(phone || web ? {} : { zoom }) }}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * True for a while after `key` changes, but only while the match is moving. A layout effect, so
 * the flag is set before the new content's first paint: no frame of it shows before its motion.
 */
function useJustChanged(key: string | null | undefined, live: boolean, ms = ARRIVAL_MS): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(key);
  useLayoutEffect(() => {
    if (key === last.current) return;
    last.current = key;
    if (!live || !key) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, live, ms]);
  return on;
}

/** The side whose score just went up, for a while after, while the match is moving. */
function useScored(score: Score | undefined, live: boolean): "home" | "away" | undefined {
  const [side, setSide] = useState<"home" | "away">();
  const last = useRef(score);
  useLayoutEffect(() => {
    const before = last.current;
    last.current = score;
    if (!live || !before || !score) return;
    const up = score.home > before.home ? "home" : score.away > before.away ? "away" : undefined;
    if (!up) return;
    setSide(up);
    const t = setTimeout(() => setSide(undefined), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [score?.home, score?.away, live]); // eslint-disable-line react-hooks/exhaustive-deps
  return side;
}

/** True for a while after the same card comes back in new words (a language or persona switch). */
function useReworded(card: LiveCard | null): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(card);
  useLayoutEffect(() => {
    const prev = last.current;
    last.current = card;
    if (!prev || !card || prev.insight_id !== card.insight_id) return;
    if (prev.language === card.language && prev.persona === card.persona) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ARRIVAL_MS);
    return () => clearTimeout(t);
  }, [card]);
  return on;
}

/**
 * Goals the pitch hasn't shown yet (match seconds). Their card and the score wait for the ball to
 * go in on the pitch, so the page and the dots agree; after GOAL_WAIT they show anyway. Only
 * goals that arrive while playing are held (a jump to a minute shows what has happened).
 */
function useGoalHold(view: MatchView | null, running: boolean, speed: number, on: boolean) {
  const [landed, setLanded] = useState<Set<number>>(() => new Set());
  const [, bump] = useState(0);
  const since = useRef<number | null>(null);
  const firstSeen = useRef(new Map<number, number>());
  useEffect(() => {
    if (!running) {
      since.current = null;
      firstSeen.current.clear();
      setLanded(new Set());
    } else if (since.current === null && view) since.current = view.minute;
  }, [running, view]);

  const held = new Set<number>();
  let next = Infinity;
  if (on && running && view && since.current !== null) {
    const wait = speed > 2 ? GOAL_WAIT_FAST_MS : GOAL_WAIT_MS;
    const now = performance.now();
    for (const e of view.events) {
      if (e.type !== "shot" || e.outcome !== "goal" || e.minute <= since.current) continue;
      const k = e.minute * 60 + e.second;
      if (landed.has(k)) continue;
      if (!firstSeen.current.has(k)) firstSeen.current.set(k, now);
      const due = firstSeen.current.get(k)! + wait;
      if (due > now) {
        held.add(k);
        next = Math.min(next, due - now);
      }
    }
  }
  // Wake up at the earliest deadline so a goal the pitch never reports still shows.
  useEffect(() => {
    if (!Number.isFinite(next)) return;
    const t = setTimeout(() => bump((n) => n + 1), next);
    return () => clearTimeout(t);
  });
  return { held, onLanded: (t: number) => setLanded((s) => new Set(s).add(t)) };
}

type Director = ReturnType<typeof useDirector>;

/** The match on the page: the feed, the pitch and the cards. Remounted per match, so nothing of
 *  the last one (cards, score, squads) carries over. `web`: the web layout (plain visits). */
function LiveView({ d, web, onSummary }: { d: Director; web?: boolean; onSummary?: (now: NowShowing) => void }) {
  const { view: fed, connection, running } = useMatchFeed(d);
  const [pinned, setPinned] = useState<string | null>(null);
  const [factsFor, setFactsFor] = useState<LiveCard | null>(null);
  const [catchUp, setCatchUp] = useState(false);

  // Layout A: the live pitch, once the squads are known.
  const hasPitch = !!fed?.lineups;
  const hold = useGoalHold(fed, running, d.speed, hasPitch);
  const view: MatchView | null = fed
    ? hold.held.size
      ? {
          ...fed,
          score: heldScore(fed, hold.held),
          cards: fed.cards.filter((c) => !(c.type === "goal" && hold.held.has(c.minute * 60 + c.second))),
        }
      : fed
    : null;

  const ruled = view ? pickStage(view.cards, nowSeconds(view)) : null;
  // A pin the viewer tapped holds the stage until the rule picks a new moment.
  useEffect(() => setPinned(null), [ruled?.insight_id]);
  const stage = (pinned && view?.cards.find((c) => c.insight_id === pinned)) || ruled;

  const arriving = useJustChanged(ruled?.insight_id, running);
  const reworded = useReworded(stage);
  const scoredSide = useScored(view?.score, running);

  // Half-time: the agents' steps appear one by one (all at once under reduced motion).
  const steps = view?.agentTrace?.length ?? 0;
  const atBreak = view?.period === "HT" && !!view.halftime;
  const [revealed, setRevealed] = useState(0);
  useEffect(() => {
    if (!atBreak || steps === 0) return setRevealed(0);
    if (reducedMotion()) return setRevealed(steps);
    setRevealed(1);
    const t = setInterval(() => setRevealed((n) => (n >= steps ? n : n + 1)), TRACE_STEP_MS);
    return () => clearInterval(t);
  }, [atBreak, steps]);

  // The on-page controls. Phone: always, pinned to the bottom. Video frame: plain visits only (a
  // director URL or ?rec=1 is a recording: the keys drive it, nothing on screen shows them).
  const controls = view && (
    <MatchControls
      playing={d.playing && running}
      ended={view.minute >= 90 && !running}
      speed={d.speed}
      onPlayPause={d.togglePlay}
      onRestart={d.restart}
      onSpeed={(s) => d.setSpeed(s, view.minute)}
    />
  );
  const videoControls = !d.director && !d.rec;
  // A plain visit opens still at kick-off, waiting on its Kick off button until the first play.
  const [kicked, setKicked] = useState(false);
  useEffect(() => {
    if (d.playing) setKicked(true);
  }, [d.playing]);
  const start = videoControls && !kicked && view && view.minute === 0 && <KickOffButton onKickOff={d.togglePlay} />;

  const facts = d.factsOpen ? (factsFor ?? stage) : null;
  const openFacts = (card: LiveCard) => {
    setFactsFor(card);
    d.setFacts(true);
  };
  const closeFacts = () => {
    setFactsFor(null);
    d.setFacts(false);
  };
  useEffect(() => {
    if (!d.factsOpen) setFactsFor(null);
  }, [d.factsOpen]);

  const language = view?.profile.language ?? d.profile.language;
  const home = view?.home.id ?? "NGC";
  const away = view?.away.id ?? "KST";
  const you = d.profile.team ?? home;

  // The Matches page's "Now showing" card follows this match while it stays open behind it.
  const latestGoal = view ? [...view.cards].reverse().find((c) => c.type === "goal") : undefined;
  useEffect(() => {
    if (!view || !onSummary) return;
    onSummary({
      matchId: view.match_id,
      score: view.score,
      minute: view.minute,
      period: view.period,
      latest: latestGoal ?? view.cards[view.cards.length - 1] ?? null,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.match_id, view?.minute, view?.score.home, view?.score.away, view?.period, view?.cards.length]);

  if (web) {
    const labels = LABELS[language];
    const pitch =
      hasPitch && fed ? (
        <PitchView reduced={reducedMotion()}>
          <PitchLayer
            view={fed}
            running={running}
            speed={d.speed}
            analyst={d.profile.persona === "analyst"}
            focus={d.profile.player}
            reduced={reducedMotion()}
            continuous
            holdOnPause
            onGoalLanded={hold.onLanded}
          />
        </PitchView>
      ) : undefined;
    const kind = (c: LiveCard) =>
      c.variant === "brief" ? (view?.period === "FT" ? labels.fullTimeLong : labels.tabHalfTime) : labels.insight[c.type];
    return (
      <LabelsProvider language={language}>
        <Frame clubs={[home, away, you]} web>
          <WebShell
            profile={d.profile}
            connection={connection}
            onLanguage={d.setLanguage}
            onPersona={d.setPersona}
          >
            {view ? (
              <WebMatch
                view={view}
                pitch={pitch}
                playing={d.playing && running}
                ended={view.minute >= 90 && !running}
                speed={d.speed}
                onPlayPause={d.togglePlay}
                onRestart={d.restart}
                onSpeed={(s) => d.setSpeed(s, view.minute)}
                waitingKickOff={!kicked && view.minute === 0}
                scoredSide={scoredSide}
                revealed={revealed}
                onOpenFacts={openFacts}
                onCatchUp={() => setCatchUp(true)}
              />
            ) : (
              <Loading />
            )}
          </WebShell>
          {view && facts && <ProofSheet proof={proofOfCard(facts, view, kind(facts), view.projection.note)} onClose={closeFacts} />}
          {view && catchUp && !facts && (
            <CatchUpSheet
              view={view}
              onClose={() => setCatchUp(false)}
              onOpenFacts={(c) => {
                setCatchUp(false);
                openFacts(c);
              }}
            />
          )}
        </Frame>
      </LabelsProvider>
    );
  }

  return (
    <LabelsProvider language={language}>
      <Frame clubs={[home, away, you]}>
        {view ? (
          <MatchScreen
            pitch={
              hasPitch && fed ? (
                <PitchView reduced={reducedMotion()}>
                  <PitchLayer
                    view={fed}
                    running={running}
                    speed={d.speed}
                    analyst={d.profile.persona === "analyst"}
                    focus={d.profile.player}
                    reduced={reducedMotion()}
                    continuous
                    holdOnPause={!d.director}
                    onGoalLanded={hold.onLanded}
                  />
                </PitchView>
              ) : undefined
            }
            view={view}
            speed={d.speed}
            connection={connection}
            stage={stage}
            arriving={arriving}
            relabel={reworded}
            scoredSide={scoredSide}
            facts={facts}
            revealed={revealed}
            onOpenFacts={openFacts}
            onCloseFacts={closeFacts}
            onSelect={(id) => setPinned(id)}
            onLanguage={d.nextLanguage}
            onPersona={d.togglePersona}
            controls={videoControls ? controls : undefined}
            start={start || undefined}
            agentsOpen={d.director || d.rec}
          />
        ) : (
          <Loading />
        )}
        {view && <div className={styles.phoneControls}>{controls}</div>}
      </Frame>
    </LabelsProvider>
  );
}

/** What the top bar shows on the Matches and Table views, where no match is loaded. */
const BROWSE_META: MatchMeta = {
  venue: "", referee: "", attendance: 0, weather: "", scenario: null, scenario_title: null, synthetic: true,
};

/** A plain visit lands on the picker; a director URL, ?rec=1 or ?match= goes straight to the match. */
function initialView(search: string): PageView {
  const q = new URLSearchParams(search);
  const asked = q.get("view") as PageView | null;
  if (asked && PAGE_VIEWS.includes(asked)) return asked;
  const direct = q.has("minute") || q.has("speed") || q.has("play") || q.get("rec") === "1" || q.has("match");
  return direct ? "live" : "matches";
}

/**
 * The live page: Matches / Live / Table on a plain visit. A director URL or ?rec=1 is a
 * recording, so it gets the live view alone: no switch, no picker.
 */
function LivePage() {
  const d = useDirector();
  const tabs = !d.director && !d.rec;
  const [view, setView] = useState<PageView>(() => (tabs ? initialView(location.search) : "live"));
  const { matches, moreLoading } = useMatchList();
  const season = useSeason(d.profile);

  useEffect(() => {
    if (!tabs) return;
    const q = new URLSearchParams(location.search);
    q.set("view", view);
    history.replaceState(null, "", `${location.pathname}?${q}`);
  }, [view, tabs]);

  const show = (next: PageView) => {
    if (next !== "live") d.pause();
    setView(next);
    window.scrollTo(0, 0);
  };
  const pick = (m: { id: string; home: { id: string } }) => {
    d.pick(m.id, m.home.id);
    setView("live");
  };

  // Once opened, the match stays mounted (hidden) behind the other views, so a look at the table
  // comes back to the same minute instead of restarting the feed.
  const [liveOpened, setLiveOpened] = useState(view === "live");
  useEffect(() => {
    if (view === "live") setLiveOpened(true);
  }, [view]);
  const [now, setNow] = useState<NowShowing | null>(null);
  const live = (view === "live" || liveOpened) && (
    <div className={styles.kept} hidden={view !== "live"}>
      <ViewSwitchContext.Provider value={tabs ? { view, onView: show } : null}>
        <LiveView key={d.matchId} d={d} web={tabs} onSummary={setNow} />
      </ViewSwitchContext.Provider>
    </div>
  );
  if (view === "live") return live;
  if (tabs) {
    return (
      <>
        {live}
        <LabelsProvider language={d.profile.language}>
          <ViewSwitchContext.Provider value={{ view, onView: show }}>
            <Frame clubs={[...sidesOf(matches, d.matchId), d.profile.team ?? "NGC"]} web>
              <WebShell
                profile={d.profile}
                connection={PREVIEW ? "preview" : "live"}
                onLanguage={d.setLanguage}
                onPersona={d.setPersona}
              >
                {view === "matches" ? (
                  <WebMatches
                    matches={matches}
                    moreLoading={moreLoading}
                    currentId={d.matchId}
                    now={now}
                    season={season}
                    team={d.profile.team}
                    onPick={(m) => (m.id === d.matchId && liveOpened ? show("live") : pick(m))}
                    onTable={() => show("table")}
                  />
                ) : (
                  <WebTable report={season} team={d.profile.team} />
                )}
              </WebShell>
            </Frame>
          </ViewSwitchContext.Provider>
        </LabelsProvider>
      </>
    );
  }
  const top = (
    <TopBar
      meta={BROWSE_META}
      profile={d.profile}
      connection={PREVIEW ? "preview" : "live"}
      onLanguage={d.nextLanguage}
      onPersona={d.togglePersona}
    />
  );
  return (
    <>
    {live}
    <LabelsProvider language={d.profile.language}>
      <ViewSwitchContext.Provider value={{ view, onView: show }}>
        <Frame clubs={["NGC", "KST", d.profile.team ?? "NGC"]}>
          <BrowseScreen top={top}>
            {view === "matches" ? (
              <MatchPicker matches={matches} moreLoading={moreLoading} currentId={d.matchId} onPick={pick} />
            ) : (
              <SeasonScreen report={season} team={d.profile.team} />
            )}
          </BrowseScreen>
        </Frame>
      </ViewSwitchContext.Provider>
    </LabelsProvider>
    </>
  );
}

/** The two sides of a listed match, for the club colour slots. */
function sidesOf(matches: { id: string; home: { id: string }; away: { id: string } }[], id: string): [string, string] {
  const m = matches.find((x) => x.id === id);
  return [m?.home.id ?? "NGC", m?.away.id ?? "KST"];
}

function Loading() {
  return <div className={styles.loading} role="status" aria-busy="true" />;
}

/**
 * The overlay: a frozen minute shows that minute's most important graphic. While playing, each
 * new graphic stays up for its ttl at our speed (at least OVERLAY_MIN_MS), and only a graphic at
 * least as important replaces one that is still up.
 *
 * On the plate the live pitch plays under the graphics. A goal alert (and the score) waits until
 * the pitch shows the ball go in, so the graphic and the dots agree; if the pitch never reports
 * it, the alert goes up anyway after GOAL_WAIT.
 */
function OverlayPage() {
  const d = useDirector();
  const { view, running } = useMatchFeed(d);
  const plate = new URLSearchParams(location.search).get("plate") === "1";
  const [shown, setShown] = useState<{ msg: OverlayMessage; until: number } | null>(null);
  const seen = useRef(0);

  // ---- goals the pitch has shown (match seconds), and alerts waiting for them ----
  const [landed, setLanded] = useState<Set<number>>(() => new Set());
  const [held, setHeld] = useState<{ msg: OverlayMessage; deadline: number }[]>([]);
  const sinceMinute = useRef<number | null>(null);
  useEffect(() => {
    if (!running) {
      sinceMinute.current = null;
      setHeld([]);
      setLanded(new Set());
    } else if (sinceMinute.current === null && view) sinceMinute.current = view.minute;
  }, [running, view]);
  const holds = plate && running;

  const show = (msg: OverlayMessage) => {
    const now = performance.now();
    setShown((cur) =>
      !cur || cur.until < now || !moreImportant(cur.msg, msg)
        ? { msg, until: now + Math.max(OVERLAY_MIN_MS, (msg.ttl_s * 1000) / d.speed) }
        : cur,
    );
  };

  useEffect(() => {
    if (!view) return;
    const fresh = view.overlays.filter((o) => o.seq > seen.current);
    seen.current = Math.max(seen.current, ...view.overlays.map((o) => o.seq));
    if (!running || fresh.length === 0) return;
    const waiting = holds ? fresh.filter(isGoalAlert) : [];
    if (waiting.length) {
      const wait = d.speed > 2 ? GOAL_WAIT_FAST_MS : GOAL_WAIT_MS;
      setHeld((h) => [...h, ...waiting.map((msg) => ({ msg, deadline: performance.now() + wait }))]);
    }
    const now = fresh.filter((o) => !waiting.includes(o));
    if (now.length) show(now.reduce((a, b) => (moreImportant(b, a) ? b : a)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, running, d.speed, holds]);

  // Release a held goal alert when its goal lands, or at its deadline.
  useEffect(() => {
    if (!held.length) return;
    const due = (h: (typeof held)[number]) => landed.has(goalSeconds(h.msg)) || h.deadline <= performance.now();
    const ready = held.filter(due);
    if (ready.length) {
      setHeld((hs) => hs.filter((h) => !ready.includes(h)));
      for (const h of ready) show(h.msg);
      return;
    }
    const next = Math.min(...held.map((h) => h.deadline)) - performance.now();
    const t = setTimeout(() => setHeld((hs) => [...hs]), Math.max(0, next));
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [held, landed]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), Math.max(0, shown.until - performance.now()));
    return () => clearTimeout(t);
  }, [shown]);

  // The score bug counts a goal only once its alert is up (or would be, unheld).
  const heldKeys = new Set(held.map((h) => goalSeconds(h.msg)));
  const score = view && holds ? heldScore(view, heldKeys) : view?.score;

  // A graphic carries the score from when it was made: one made after a goal still held (it can
  // arrive in the same tick) shows the held score too.
  const raw = view ? (running ? (shown?.msg ?? null) : overlayAt(view.overlays, view.minute)) : null;
  const message =
    raw && heldKeys.size && score && raw.fields.score !== undefined
      ? { ...raw, fields: { ...raw.fields, score: `${score.home}-${score.away}` } }
      : raw;

  const pitch =
    view && plate ? (
      <PitchLayer
        view={view}
        running={running}
        speed={d.speed}
        analyst={d.profile.persona === "analyst"}
        focus={d.profile.player}
        reduced={reducedMotion()}
        continuous
        onGoalLanded={(t) => setLanded((s) => new Set(s).add(t))}
      />
    ) : null;

  return (
    <LabelsProvider language={view?.profile.language ?? d.profile.language}>
      <Frame clubs={[view?.home.id ?? "NGC", view?.away.id ?? "KST", d.profile.team ?? "NGC"]} transparent={!plate}>
        {view && score && (
          <OverlayScreen view={{ ...view, score }} message={message} plate={plate} pitch={pitch} />
        )}
      </Frame>
    </LabelsProvider>
  );
}

/** A goal alert (the engine's insight ids read "<match>-<mmss>-goal-<n>"). */
const isGoalAlert = (o: OverlayMessage) => o.graphic === "alert" && /-goal-/.test(o.insight_id ?? "");
const goalSeconds = (o: OverlayMessage) => o.minute * 60 + o.second;

/** The score minus goals whose alert is still waiting for the pitch. */
function heldScore(view: MatchView, held: Set<number>): Score {
  const s = { ...view.score };
  for (const e of view.events)
    if (e.type === "shot" && e.outcome === "goal" && held.has(e.minute * 60 + e.second)) s[e.side] -= 1;
  return s;
}

export default function App() {
  return location.pathname.replace(/\/$/, "") === "/overlay" ? <OverlayPage /> : <LivePage />;
}
