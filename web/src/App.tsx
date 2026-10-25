// Match-Room Live. Two routes (Static Web Apps rewrites every path to index.html):
//   /          the live match, played from the API, in director mode for the video
//   /overlay   the broadcast graphics: transparent for OBS, or ?plate=1 for the video
//
// The containers here hold the timers and the state; the screens in src/screens are pure.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { clubSlots } from "./clubColours";
import { nowSeconds } from "./live/feed";
import { pickStage } from "./live/stage";
import { useDirector } from "./live/useDirector";
import { useMatchFeed } from "./live/useMatchFeed";
import { moreImportant, overlayAt, OverlayScreen } from "./screens/OverlayScreen";
import { MatchScreen } from "./screens/MatchScreen";
import type { LiveCard, OverlayMessage } from "./types/live";
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

/** True for a while after `key` changes, but only while the match is moving. */
function useJustChanged(key: string | null | undefined, live: boolean, ms = ARRIVAL_MS): boolean {
  const [on, setOn] = useState(false);
  const last = useRef(key);
  useEffect(() => {
    if (key === last.current) return;
    last.current = key;
    if (!live || !key) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), ms);
    return () => clearTimeout(t);
  }, [key, live, ms]);
  return on;
}

function LivePage() {
  const d = useDirector();
  const { view, connection, running } = useMatchFeed(d);
  const [pinned, setPinned] = useState<string | null>(null);
  const [factsFor, setFactsFor] = useState<LiveCard | null>(null);

  const ruled = view ? pickStage(view.cards, nowSeconds(view)) : null;
  // A pin the viewer tapped holds the stage until the rule picks a new moment.
  useEffect(() => setPinned(null), [ruled?.insight_id]);
  const stage = (pinned && view?.cards.find((c) => c.insight_id === pinned)) || ruled;

  const arriving = useJustChanged(ruled?.insight_id, running);
  const scoreKey = view ? `${view.score.home}-${view.score.away}` : null;
  const scored = useJustChanged(scoreKey, running);
  const [scoredSide, setScoredSide] = useState<"home" | "away">();
  const prevScore = useRef(view?.score);
  useEffect(() => {
    const before = prevScore.current;
    prevScore.current = view?.score;
    if (!before || !view) return;
    if (view.score.home > before.home) setScoredSide("home");
    else if (view.score.away > before.away) setScoredSide("away");
  }, [scoreKey]); // eslint-disable-line react-hooks/exhaustive-deps

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
            view={view}
            speed={d.speed}
            connection={connection}
            stage={stage}
            arriving={arriving}
            scoredSide={scored ? scoredSide : undefined}
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
 */
function OverlayPage() {
  const d = useDirector();
  const { view, running } = useMatchFeed(d);
  const plate = new URLSearchParams(location.search).get("plate") === "1";
  const [shown, setShown] = useState<{ msg: OverlayMessage; until: number } | null>(null);
  const seen = useRef(0);

  useEffect(() => {
    if (!view) return;
    const fresh = view.overlays.filter((o) => o.seq > seen.current);
    seen.current = Math.max(seen.current, ...view.overlays.map((o) => o.seq));
    if (!running || fresh.length === 0) return;
    const best = fresh.reduce((a, b) => (moreImportant(b, a) ? b : a));
    const now = performance.now();
    setShown((cur) =>
      !cur || cur.until < now || !moreImportant(cur.msg, best)
        ? { msg: best, until: now + Math.max(OVERLAY_MIN_MS, (best.ttl_s * 1000) / d.speed) }
        : cur,
    );
  }, [view, running, d.speed]);

  useEffect(() => {
    if (!shown) return;
    const t = setTimeout(() => setShown(null), Math.max(0, shown.until - performance.now()));
    return () => clearTimeout(t);
  }, [shown]);

  const message = view ? (running ? (shown?.msg ?? null) : overlayAt(view.overlays, view.minute)) : null;

  return (
    <LabelsProvider language={view?.profile.language ?? d.profile.language}>
      <Frame clubs={[view?.home.id ?? "NGC", view?.away.id ?? "KST", d.profile.team ?? "NGC"]} transparent={!plate}>
        {view && <OverlayScreen view={view} message={message} plate={plate} />}
      </Frame>
    </LabelsProvider>
  );
}

export default function App() {
  return location.pathname.replace(/\/$/, "") === "/overlay" ? <OverlayPage /> : <LivePage />;
}
