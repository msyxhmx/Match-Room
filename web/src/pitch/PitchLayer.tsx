// The pitch on the overlay plate, fed by the match view (useMatchFeed's events and lineups).
//
//   paused   the minute's headline moment loops with its build-up (S7 opens paused on 74')
//   playing  the live programme: each tick's arrival time anchors that minute's moments; ×1 plays
//            them on the match clock, ×60 plays what fits and cuts to a replay for goals and cards
//
// It tells the page when each goal's ball crosses the line (onGoalLanded, match seconds), so the
// overlay can hold the goal alert and the score until the pitch shows the goal (handoff §3).

import { useEffect, useMemo, useRef, useState } from "react";
import type { MatchView } from "../live/feed";
import { loopShot, program, type Shot } from "./director";
import { frameAt } from "./frame";
import type { SquadPlayer } from "./formation";
import { toMoments, type Moment, type PitchEvent } from "./moments";
import { PitchCanvas } from "./PitchCanvas";
import { plan } from "./plan";
import { replayMinute } from "./schedule";

export interface PitchLayerProps {
  view: MatchView;
  running: boolean;
  speed: number;
  analyst: boolean;
  focus?: string | null;
  reduced?: boolean;
  onGoalLanded?: (matchSeconds: number) => void;
}

const now = () => performance.now() / 1000;

/** The shape around the latest moment up to a minute: the picture to start from. */
function initialAt(moments: Moment[], minute: number) {
  if (minute <= 0) return { kind: "kickoff", kicking: "home" } as const;
  if (minute === 45) return { kind: "kickoff", kicking: "away" } as const;
  const last = [...moments].reverse().find((m) => m.minute <= minute);
  return last
    ? ({ kind: "shape", ball: last.from, side: last.side } as const)
    : ({ kind: "kickoff", kicking: "home" } as const);
}

export function PitchLayer({ view, running, speed, analyst, focus, reduced, onGoalLanded }: PitchLayerProps) {
  const players = view.lineups?.players as SquadPlayer[] | undefined;
  // Live play links assists only within a tick (causal); a paused loop knows the whole minute.
  const moments = useMemo(() => toMoments(view.events as unknown as PitchEvent[], { live: true }), [view.events]);
  const known = useMemo(() => toMoments(view.events as unknown as PitchEvent[]), [view.events]);
  const epoch = useRef(now()).current;

  // ---- the live session: tick arrivals on the pitch's clock ----
  const session = useRef<{ startMinute: number; start: number; arrivals: Map<number, number> } | null>(null);
  const [arrivedCount, setArrivedCount] = useState(0);
  useEffect(() => {
    if (!running) {
      session.current = null;
      return;
    }
    const t = now() - epoch;
    if (!session.current) {
      session.current = { startMinute: view.minute, start: t, arrivals: new Map() };
      setArrivedCount((n) => n + 1000); // a new session: plan from its start picture now
    }
    const s = session.current;
    if (view.minute > s.startMinute && !s.arrivals.has(view.minute)) {
      s.arrivals.set(view.minute, t);
      setArrivedCount((n) => n + 1);
    }
  }, [running, view.minute, epoch]);

  const live = useMemo(() => {
    const s = session.current;
    if (!running || !s || !players) return null;
    const arrived = moments.filter((m) => s.arrivals.has(m.minute));
    return program(players, arrived, {
      speed,
      arrivals: s.arrivals,
      start: s.start,
      initial: initialAt(moments, s.startMinute),
    });
    // arrivedCount changes with each new tick's arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, arrivedCount, players, moments, speed]);

  // ---- paused: loop the minute's headline ----
  const loop = useMemo(() => {
    if (running || !players) return null;
    const r = replayMinute(players, known, view.minute);
    if (r) return { replay: r, from: now() - epoch };
    // Nothing to replay: the teams in shape around the latest moment.
    const still = plan(players, [], { ideal: () => null, speed: 1, start: 0, initial: initialAt(moments, view.minute) });
    return { still };
  }, [running, players, known, moments, view.minute, epoch]);

  // ---- goals: tell the page when each one lands ----
  const landed = useRef(onGoalLanded);
  landed.current = onGoalLanded;
  useEffect(() => {
    if (!live) return;
    const t = now() - epoch;
    const timers = live.goalsLand
      .filter((g) => g.t >= t - 0.05)
      .map((g) => setTimeout(() => landed.current?.(g.moment.t), Math.max(0, (g.t - t) * 1000)));
    return () => timers.forEach(clearTimeout);
  }, [live, epoch]);

  if (!players) return null;
  const steps = !!reduced;
  const shot = (t: number): Shot => {
    if (live) return live.shotAt(t, { steps });
    if (loop && "replay" in loop && loop.replay) return loopShot(loop.replay, t - loop.from, { steps });
    if (loop && "still" in loop && loop.still) return { frame: frameAt(loop.still, t, { sway: !steps }), replayOf: null, opacity: 1 };
    return { frame: { t, dots: [], ball: null, beat: null, possession: null }, replayOf: null, opacity: 1 };
  };
  return <PitchCanvas shot={shot} analyst={analyst} focus={focus} epoch={epoch} reduced={reduced} />;
}
