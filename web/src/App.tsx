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
import { useMatchFeed } from "./live/useMatchFeed";
import type { MatchView } from "./live/feed";
import { PitchLayer } from "./pitch/PitchLayer";
import { PitchView } from "./pitch/PitchView";
import { moreImportant, overlayAt, OverlayScreen } from "./screens/OverlayScreen";
import { MatchScreen } from "./screens/MatchScreen";
import type { LiveCard, OverlayMessage, Score } from "./types/live";
import { LabelsProvider } from "./ui/labels";
import styles from "./App.module.css";

const VIDEO = { width: 1920, height: 1080 };
/** Under this width the phone layout takes over; above it the 1920 frame scales to fit. */
const PHONE_MAX = 700;
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
 * Video first: on anything wider than a phone, the screen is the 1920 × 1080 frame, zoomed to
 * fit the window like a TV picture. The recording window (1920 × 1080) gets it at 1:1.
 */
function Frame({ clubs, transparent, children }: { clubs: [string, string, string]; transparent?: boolean; children: ReactNode }) {
  const { width, height } = useWindowSize();
  const phone = width < PHONE_MAX;
  const zoom = phone ? 1 : Math.min(width / VIDEO.width, height / VIDEO.height);
  return (
    <div className={styles.window} data-transparent={transparent ? "true" : undefined}>
      <div
        className={`mr-root ${phone ? styles.phone : `video ${styles.video}`}`}
        data-transparent={transparent ? "true" : undefined}
        style={{ ...clubSlots(...clubs), ...(phone ? {} : { zoom }) }}
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

function LivePage() {
  const d = useDirector();
  const { view: fed, connection, running } = useMatchFeed(d);
  const [pinned, setPinned] = useState<string | null>(null);
  const [factsFor, setFactsFor] = useState<LiveCard | null>(null);

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

  return (
    <LabelsProvider language={language}>
      <Frame clubs={[home, away, you]}>
        {view ? (
          <MatchScreen
            pitch={
              hasPitch && fed ? (
                <PitchView>
                  <PitchLayer
                    view={fed}
                    running={running}
                    speed={d.speed}
                    analyst={d.profile.persona === "analyst"}
                    focus={d.profile.player}
                    reduced={reducedMotion()}
                    continuous
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
          />
        ) : (
          <Loading />
        )}
      </Frame>
    </LabelsProvider>
  );
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

  const message = view ? (running ? (shown?.msg ?? null) : overlayAt(view.overlays, view.minute)) : null;

  // The score bug counts a goal only once its alert is up (or would be, unheld).
  const heldKeys = new Set(held.map((h) => goalSeconds(h.msg)));
  const score = view && holds ? heldScore(view, heldKeys) : view?.score;

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
