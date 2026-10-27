// The pitch on the overlay plate, fed by the match view (useMatchFeed's events and lineups).
//
//   paused   the minute's headline moment loops with its build-up (S7 opens paused on 74'); or,
//            with `holdOnPause` (plain visits), the pitch freezes where it is and play carries on
//            from that frame, the pitch's clock skipping the pause (Syahmi's note, 26 Oct)
//   playing  the live programme: each tick's arrival time anchors that minute's moments; ×1 plays
//            them on the match clock, ×60 plays what fits and cuts to a replay for goals and cards
//
// It tells the page when each goal's ball crosses the line (onGoalLanded, match seconds), so the
// overlay can hold the goal alert and the score until the pitch shows the goal (handoff §3).

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchView } from "../live/feed";
import type { ShotOptions } from "./camera";
import { loopShot, program, type Shot } from "./director";
import { frameAt } from "./frame";
import type { SquadPlayer } from "./formation";
import { toMoments, type Moment, type PitchEvent } from "./moments";
import { PitchCanvas } from "./PitchCanvas";
import { plan } from "./plan";
import { loadLibrary, reelProgram, type Library } from "./reel";
import { replayMinute } from "./schedule";

export interface PitchLayerProps {
  view: MatchView;
  running: boolean;
  speed: number;
  analyst: boolean;
  focus?: string | null;
  reduced?: boolean;
  /** Continuous play: the ghost ball between real moments (Ilham's pick, 25 Oct). */
  continuous?: boolean;
  /** A viewer's pause freezes the picture instead of looping the minute's headline. */
  holdOnPause?: boolean;
  onGoalLanded?: (matchSeconds: number) => void;
}

const now = () => performance.now() / 1000;

/** `?pitch=planner` keeps the planner's movement (the real-play library is the default). */
const PLANNER = typeof location !== "undefined" && new URLSearchParams(location.search).get("pitch") === "planner";

/** The shape around the latest moment up to a minute: the picture to start from. */
function initialAt(moments: Moment[], minute: number) {
  if (minute <= 0) return { kind: "kickoff", kicking: "home" } as const;
  if (minute === 45) return { kind: "kickoff", kicking: "away" } as const;
  const last = [...moments].reverse().find((m) => m.minute <= minute);
  return last
    ? ({ kind: "shape", ball: last.from, side: last.side } as const)
    : ({ kind: "kickoff", kicking: "home" } as const);
}

export function PitchLayer({ view, running, speed, analyst, focus, reduced, continuous, holdOnPause, onGoalLanded }: PitchLayerProps) {
  const players = view.lineups?.players as SquadPlayer[] | undefined;
  // Live play links assists only within a tick (causal); a paused loop knows the whole minute.
  const moments = useMemo(() => toMoments(view.events as unknown as PitchEvent[], { live: true }), [view.events]);
  const known = useMemo(() => toMoments(view.events as unknown as PitchEvent[]), [view.events]);
  const epoch = useRef(now()).current;

  // ---- the pitch's clock: display time less the time spent on hold ----
  const hold = useRef({ total: 0, since: null as number | null });
  const [frozenAt, setFrozenAt] = useState<number | undefined>(undefined);
  const clock = () => now() - epoch - hold.current.total;

  // ---- the live session: tick arrivals on the pitch's clock ----
  const session = useRef<{
    startMinute: number;
    start: number;
    minute: number;
    speed: number;
    arrivals: Map<number, number>;
  } | null>(null);
  const [arrivedCount, setArrivedCount] = useState(0);
  useEffect(() => {
    const h = hold.current;
    if (!running) {
      if (holdOnPause && session.current) {
        // Hold: keep the session and freeze the canvas on this instant.
        if (h.since === null) {
          h.since = now();
          setFrozenAt(now() - epoch);
        }
      } else session.current = null;
      return;
    }
    if (h.since !== null) {
      h.total += now() - h.since;
      h.since = null;
      setFrozenAt(undefined);
      // A held session carries on only from the same minute at the same speed (not a restart).
      const held = session.current;
      if (held && (held.minute !== view.minute || held.speed !== speed)) session.current = null;
    }
    const t = clock();
    if (!session.current) {
      session.current = { startMinute: view.minute, start: t, minute: view.minute, speed, arrivals: new Map() };
      setArrivedCount((n) => n + 1000); // a new session: plan from its start picture now
    }
    const s = session.current;
    if (view.minute > s.startMinute && !s.arrivals.has(view.minute)) {
      s.arrivals.set(view.minute, t);
      s.minute = view.minute;
      setArrivedCount((n) => n + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, view.minute, epoch, holdOnPause, speed]);

  // Real play (reel.ts) once its library is in; the planner until then, or if it can't load.
  const [lib, setLib] = useState<Library | null>(null);
  useEffect(() => {
    if (PLANNER) return;
    let on = true;
    loadLibrary().then((l) => on && setLib(l));
    return () => {
      on = false;
    };
  }, []);

  const live = useMemo(() => {
    const s = session.current;
    if (!(running || holdOnPause) || !s || !players) return null;
    const arrived = moments.filter((m) => s.arrivals.has(m.minute));
    const o = { speed, arrivals: s.arrivals, start: s.start, initial: initialAt(moments, s.startMinute) };
    return lib ? reelProgram(players, arrived, o, lib) : program(players, arrived, o);
    // arrivedCount changes with each new tick's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, holdOnPause, arrivedCount, players, moments, speed, lib]);

  // ---- paused: loop the minute's headline ----
  const loop = useMemo(() => {
    if (running || !players || live) return null;
    const r = replayMinute(players, known, view.minute);
    if (r) return { replay: r, from: now() - epoch };
    // Nothing to replay: the teams in shape around the latest moment.
    const still = plan(players, [], { ideal: () => null, speed: 1, start: 0, initial: initialAt(moments, view.minute) });
    return { still };
  }, [running, players, known, moments, view.minute, epoch, live]);

  // ---- goals: tell the page when each one lands ----
  const landed = useRef(onGoalLanded);
  landed.current = onGoalLanded;
  useEffect(() => {
    if (!live || !running) return;
    const t = clock();
    const timers = live.goalsLand
      .filter((g) => g.t >= t - 0.05)
      .map((g) => setTimeout(() => landed.current?.(g.moment.t), Math.max(0, (g.t - t) * 1000)));
    return () => timers.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live, running, epoch]);

  if (!players) return null;
  const steps = !!reduced;
  const fo = { steps, continuous };
  const shot = (t: number, o?: ShotOptions): Shot => {
    const fo2 = o ? { ...fo, ...o } : fo;
    if (live) return live.shotAt(t - hold.current.total, fo2);
    if (loop && "replay" in loop && loop.replay) return loopShot(loop.replay, t - loop.from, fo2);
    if (loop && "still" in loop && loop.still) return { frame: frameAt(loop.still, t, fo2), replayOf: null, opacity: 1 };
    return { frame: { t, dots: [], ball: null, beat: null, possession: null }, replayOf: null, opacity: 1 };
  };
  return <PitchCanvas shot={shot} analyst={analyst} focus={focus} at={frozenAt} epoch={epoch} reduced={reduced} ghost="ghost" />;
}
