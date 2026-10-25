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
import { toMoments, type PitchEvent, type Moment } from "../pitch/moments";
import { PitchCanvas } from "../pitch/PitchCanvas";
import { readPalette } from "../pitch/render";
import { replayMinute, replayMoment } from "../pitch/schedule";
import type { SquadPlayer } from "../pitch/formation";

const players = (savedLineups as unknown as { players: SquadPlayer[] }).players;
const moments: Moment[] = toMoments(savedEvents as unknown as PitchEvent[]);

/** 74' paused: the equaliser and its build-up, looping. */
const equaliser = replayMinute(players, moments, 74)!;
const equaliserGoal = equaliser.timeline.beats.find((b) => b.moment.minute === 74 && b.moment.kind === "shot")!;

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

export const PITCH_SCENES = {
  equaliser: { shot: (t: number): Shot => loopShot(equaliser, t), still: equaliserGoal.touch + 0.25, length: equaliser.length },
  flow60: { shot: (t: number): Shot => flow.shotAt(t), still: flow.cuts[0] ? flow.cuts[0].at - 1.2 : 2, length: 11 },
  corner: { shot: (t: number): Shot => loopShot(corner, t), still: cornerBeat.touch + 0.6, length: corner.length },
} as const;

/** S7 as filmed: the overlay paused on 74' (score bug, the goal alert) over the moving pitch. */
const view74 = replay(savedStart as unknown as LiveSnapshot, savedTicks as unknown as StreamTick[], 74, briefs);
const alert74 = overlayAt(view74.overlays, 74);

type Persona = "casual" | "analyst";
const PERSONAS: Persona[] = ["casual", "analyst"];

function Scene({ scene, persona }: { scene: keyof typeof PITCH_SCENES; persona: Persona }) {
  const s = PITCH_SCENES[scene];
  const pitch = <PitchCanvas shot={s.shot} analyst={persona === "analyst"} focus="L. Quinn" at={s.still} />;
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
  casual: "Casual: discs, the real pass drawn, the event's player named",
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
  summary: "The live pitch: 22 dots and the ball from the real events, casual and analyst.",
  states: [
    state("calibration", "The plate camera from pitch.py: projected lines over the render", () => <Calibration />),
    ...PERSONAS.flatMap((p) => [
      state(`equaliser-${p}`, `${NOTES[p]}. S7 paused on 74': the equaliser loops`, () => (
        <Scene scene="equaliser" persona={p} />
      )),
      state(`flow60-${p}`, `${NOTES[p]}. ×60 from 70', the 74' goal cut in as a replay`, () => (
        <Scene scene="flow60" persona={p} />
      )),
      state(`corner-${p}`, `${NOTES[p]}. A corner set-up`, () => <Scene scene="corner" persona={p} />),
    ]),
  ],
} satisfies LabModule;
