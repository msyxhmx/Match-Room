// The pitch simulation on the plate (web/src/pitch), from the saved comeback match, for each
// persona: casual (the broadcast look) and analyst (plus each team's units joined up). A state shows one still; scripts/pitch-film.mjs
// films it frame by frame through window.__pitchSeek. Lab-only.

import { useEffect, useRef, type ReactNode } from "react";
import type { LabModule, LabState } from "../lab/types";
import { briefs } from "../lab/fixtures";
import { replay } from "../live/feed";
import savedStart from "../live/saved/snapshot.0.json";
import savedTicks from "../live/saved/ticks.json";
import type { LiveSnapshot, StreamTick } from "../types/live";
import { overlayAt, OverlayScreen } from "./OverlayScreen";
import savedEvents from "../live/saved/events.json";
import savedLineups from "../live/saved/lineups.json";
import { loopShot, program, type Shot } from "../pitch/director";
import { project, HALF_L, HALF_W } from "../pitch/geometry";
import { isGoal, toMoments, type PitchEvent, type Moment } from "../pitch/moments";
import { PitchCanvas } from "../pitch/PitchCanvas";
import { readPalette, type GhostStyle } from "../pitch/render";
import { BUILD_UP, replayMinute, replayMoment } from "../pitch/schedule";
import type { SquadPlayer } from "../pitch/formation";
import { frameAt } from "../pitch/frame";
import { realTimeline, type Passage } from "../pitch/real";
import realSlice from "../pitch/real/slice.json";
import { decodeLibrary, reelProgram } from "../pitch/reel";
import reelData from "../../public/pitch/reel.json";

const players = (savedLineups as unknown as { players: SquadPlayer[] }).players;
const moments: Moment[] = toMoments(savedEvents as unknown as PitchEvent[]);

/** 74' paused: the equaliser and its build-up, looping. */
const equaliser = replayMinute(players, moments, 74)!;
const equaliserGoal = equaliser.timeline.beats.find((b) => b.moment.minute === 74 && b.moment.kind === "shot")!;
/** Each goal's replay (the frozen-minute loop), played by its real move and by the planner. */
const GOALS = moments.filter(isGoal);
const goalReplays = Object.fromEntries(
  GOALS.flatMap((g) =>
    (["real", "planner"] as const).map((by) => {
      const r = replayMoment(players, moments, g, BUILD_UP.loop, { planner: by === "planner" })!;
      const still = r.timeline.beats[r.timeline.beats.length - 1].touch + 0.25;
      return [`goal${g.minute}-${by}`, { shot: (t: number): Shot => loopShot(r, t), still, length: r.length }];
    }),
  ),
);

/** ×60 from 70': the live flow, with the 74' goal cut in as a replay. */
const FROM = 70;
const arrivals = new Map<number, number>();
for (let m = FROM + 1; m <= 80; m++) arrivals.set(m, m - FROM - 1 + 0.5);
const flow = program(players, moments.filter((m) => m.minute > FROM && m.minute <= 80), {
  speed: 60,
  arrivals,
  start: 0,
  initial: { kind: "shape", ball: { x: 0, y: 0 }, side: "home" },
});

/** A corner, with the few seconds before it. */
const cornerMoment = moments.find((m) => m.kind === "corner" && m.minute > 20)!;
const corner = replayMoment(players, moments, cornerMoment, 6)!;
const cornerBeat = corner.timeline.beats.find((b) => b.moment === cornerMoment)!;

/** ×1 from 74:00, continuous play (the ghost ball between real moments), through the equaliser. */
const live73 = (() => {
  const arr = new Map<number, number>();
  for (let m = 74; m <= 76; m++) arr.set(m, (m - 74) * 60);
  return program(players, toMoments((savedEvents as unknown as PitchEvent[]).filter((e) => e.minute <= 76), { live: true }), {
    speed: 1,
    arrivals: arr,
    start: -2,
    initial: { kind: "shape", ball: { x: 0, y: 0 }, side: "home" },
  });
})();
const CONT_FROM = -1;

/** Real football (DFL tracking, anonymised) through the same figures: the reference. */
const realPassages = (realSlice as unknown as { passages: Passage[] }).passages;
const REAL = Object.fromEntries(
  realPassages.map((p) => {
    const tl = realTimeline(p);
    const shot = (t: number): Shot => ({ frame: frameAt(tl, ((t % tl.end) + tl.end) % tl.end), replayOf: null, opacity: 1 });
    return [`real-${p.kind}`, { shot, still: 4, length: tl.end }];
  }),
);

/** Real play (reel.ts) as the live page plays it: ×60 from kick-off (the highlights reel, the
 *  break 15 s), and ×1 from 72' (the session starting there) around the 74' equaliser. */
const reelLib = decodeLibrary(reelData as unknown as Parameters<typeof decodeLibrary>[0]);
const liveMoments = toMoments(savedEvents as unknown as PitchEvent[], { live: true });
const reel60 = reelProgram(players, liveMoments, {
  speed: 60,
  arrivals: new Map(Array.from({ length: 90 }, (_, i) => [i + 1, i + 1 + (i + 1 > 45 ? 15 : 0)] as [number, number])),
  start: 0,
  initial: { kind: "kickoff", kicking: "home" },
}, reelLib);
const REEL1_FROM = 72;
const reel1 = reelProgram(players, liveMoments.filter((m) => m.minute > REEL1_FROM && m.minute <= 80), {
  speed: 1,
  arrivals: new Map(Array.from({ length: 8 }, (_, i) => [REEL1_FROM + 1 + i, 60 * (i + 1)] as [number, number])),
  start: 0,
  initial: { kind: "shape", ball: { x: 0, y: 0 }, side: "home" },
}, reelLib);
/** ×1: from 20 s before the equaliser's touch. */
const reel1From = (reel1.shown.find((s) => isGoal(s.moment))?.t ?? 130) - 20;

export const PITCH_SCENES = {
  reel60: { shot: (t: number): Shot => reel60.shotAt(t), still: 10, length: 106 },
  reel1: { shot: (t: number): Shot => reel1.shotAt(t + reel1From), still: 20, length: 40 },
  /** The same ×1 programme from its start (72'), for filming any part of it. */
  reel1all: { shot: (t: number): Shot => reel1.shotAt(t), still: 20, length: 480 },
  equaliser: { shot: (t: number): Shot => loopShot(equaliser, t), still: equaliserGoal.touch + 0.25, length: equaliser.length },
  flow60: { shot: (t: number): Shot => flow.shotAt(t), still: flow.cuts[0] ? flow.cuts[0].at - 1.2 : 2, length: 11 },
  corner: { shot: (t: number): Shot => loopShot(corner, t), still: cornerBeat.touch + 0.6, length: corner.length },
  continuous: {
    shot: (t: number): Shot => live73.shotAt(t + CONT_FROM, { continuous: true }),
    still: 4.5,
    length: 20,
  },
  ...REAL,
  ...goalReplays,
} as const;

/** S7 as filmed: the overlay paused on 74' (score bug, the goal alert) over the moving pitch. */
const view74 = replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], 74, briefs);
const alert74 = overlayAt(view74.overlays, 74);

type Persona = "casual" | "analyst";
const PERSONAS: Persona[] = ["casual", "analyst"];

function Scene({ scene, persona, ghost }: { scene: keyof typeof PITCH_SCENES | `real-${string}` | `goal${number}-${"real" | "planner"}`; persona: Persona; ghost?: GhostStyle }) {
  const s = (PITCH_SCENES as Record<string, (typeof PITCH_SCENES)["equaliser"]>)[scene];
  const pitch = <PitchCanvas shot={s.shot} analyst={persona === "analyst"} focus="L. Quinn" at={s.still} ghost={ghost} />;
  if (scene !== "equaliser") return pitch;
  return (
    <>
      {pitch}
      <OverlayScreen view={view74} message={alert74} />
    </>
  );
}

/** The plate's markings, projected: if the camera matches, the lines sit on the render's. */
function Calibration() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    const p = readPalette(ref.current!);
    ctx.strokeStyle = p.home;
    ctx.lineWidth = 3;
    const line = (pts: [number, number][]) => {
      ctx.beginPath();
      pts.forEach(([x, y], i) => {
        const s = project(x, y);
        if (i) ctx.lineTo(s.u, s.v);
        else ctx.moveTo(s.u, s.v);
      });
      ctx.stroke();
    };
    const L = HALF_L;
    const W = HALF_W;
    line([[-L, -W], [L, -W], [L, W], [-L, W], [-L, -W]]);
    line([[0, -W], [0, W]]);
    for (const s of [-1, 1]) {
      line([[s * L, -20.16], [s * (L - 16.5), -20.16], [s * (L - 16.5), 20.16], [s * L, 20.16]]);
      line([[s * L, -9.16], [s * (L - 5.5), -9.16], [s * (L - 5.5), 9.16], [s * L, 9.16]]);
    }
    const circle: [number, number][] = [];
    for (let a = 0; a <= 64; a++) circle.push([9.15 * Math.cos((a / 64) * 2 * Math.PI), 9.15 * Math.sin((a / 64) * 2 * Math.PI)]);
    line(circle);
  }, []);
  return <canvas ref={ref} width={1920} height={1080} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />;
}

const NOTES: Record<Persona, string> = {
  casual: "Casual: movement from real tracking data (DFL): the real shape, players who wander, press and play the ghost ball between real moments; the real pass drawn, the event's player named",
  analyst: "Analyst: the same, plus each team's units joined up (the side without the ball stronger)",
};

const state = (name: string, note: string, render: () => ReactNode): LabState => ({
  name,
  note,
  canvases: ["video"],
  place: "fill",
  background: "plate",
  render,
});

export default {
  component: "Pitch",
  summary: "The live pitch: 22 players and the ball from the real events, casual and analyst.",
  states: [
    state("calibration", "The plate camera from pitch.py: projected lines over the render", () => <Calibration />),
    state("reel60", "Real play, ×60: the highlights reel from kick-off (DFL recordings, CC BY 4.0)", () => <Scene scene="reel60" persona="casual" />),
    state("reel1", "Real play, ×1: the 74' equaliser in live play (DFL recordings, CC BY 4.0)", () => <Scene scene="reel1" persona="casual" />),
    state("reel1all", "Real play, ×1 from 72' (seek any instant)", () => <Scene scene="reel1all" persona="casual" />),
    ...PERSONAS.flatMap((p) => [
      state(`equaliser-${p}`, `${NOTES[p]}. S7 paused on 74': the equaliser loops`, () => (
        <Scene scene="equaliser" persona={p} />
      )),
      state(`flow60-${p}`, `${NOTES[p]}. ×60 from 70', the 74' goal cut in as a replay`, () => (
        <Scene scene="flow60" persona={p} />
      )),
      state(`corner-${p}`, `${NOTES[p]}. A corner set-up`, () => <Scene scene="corner" persona={p} />),
    ]),
    ...GOALS.flatMap((g) =>
      (["real", "planner"] as const).map((by) =>
        state(`goal${g.minute}-${by}`, `The ${g.minute}' goal's replay loop, ${by === "real" ? "played by its real move (DFL, CC BY 4.0)" : "by the planner"}`, () => (
          <Scene scene={`goal${g.minute}-${by}`} persona="casual" />
        )),
      ),
    ),
    ...realPassages.flatMap((p) =>
      PERSONAS.map((persona) =>
        state(`real-${p.kind}-${persona}`, `Real football (DFL open data, CC BY 4.0, anonymised): a ${p.kind} passage at 5 Hz, through our figures`, () => (
          <Scene scene={`real-${p.kind}`} persona={persona} />
        )),
      ),
    ),
    ...(["solid", "ghost", "ghost-pulse"] as GhostStyle[]).map((g) =>
      state(`continuous-${g}`, `Continuous play at ×1 from 74:00, the ball between real moments drawn "${g}"`, () => (
        <Scene scene="continuous" persona="casual" ghost={g} />
      )),
    ),
  ],
} satisfies LabModule;
