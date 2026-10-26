// The follow camera for small screens (a phone held upright): the pitch shown about 2.3× closer,
// panning with the ball like a TV camera. A pure function of the display time: a weighted average
// of where the ball was over the last WINDOW_S seconds, the weights rising from 0 at both ends
// (a triangle), so a jump in the target (the ball appearing after a goal) eases in instead of
// lurching. A still, a filmed frame and a test all agree. It snaps at a cut (a replay starting or
// ending) instead of sweeping across.

import type { Shot } from "./director";
import type { FrameOptions } from "./frame";
import type { Frame } from "./frame";
import { PLATE, project } from "./geometry";

export interface Camera {
  /** The plate-pixel rectangle on screen. */
  x0: number;
  y0: number;
  width: number;
  height: number;
}

/** CSS px per plate px the camera aims for: far dots ~12 px, names ~15 px on a 360 px phone. */
export const FOLLOW_SCALE = 0.42;
/** The pitch rows the camera keeps in view (far touchline to near touchline, with the goals). */
const PITCH_MID_Y = 605;
const WINDOW_S = 2;
/** What a shot function may be asked for: the camera's samples ask for the ball only. */
export type ShotOptions = Pick<FrameOptions, "ballOnly">;
const LITE: ShotOptions = { ballOnly: true };
const SAMPLES = 64;

function focus(f: Frame): number | null {
  // A real moment: frame the whole pass (its start and end), so the ball travels across a
  // steady picture instead of the camera whipping after a long ball.
  if (f.beat && f.beat.moment.to) {
    const a = project(f.beat.moment.from.x, f.beat.moment.from.y).u;
    const b = project(f.beat.moment.to.x, f.beat.moment.to.y).u;
    if (!f.ball) return (a + b) / 2;
    // Eases from the ball onto the whole pass as the moment starts, and back as it ends, so
    // the switch doesn't jolt the camera.
    const bt = f.beat;
    const w = Math.max(0, Math.min(1, (f.t - (bt.touch - 0.45)) / 0.6, (bt.end - f.t) / 0.6));
    const ball = project(f.ball.x, f.ball.y).u;
    return ball + ((a + b) / 2 - ball) * w * w * (3 - 2 * w);
  }
  if (f.ball) return project(f.ball.x, f.ball.y).u;
  if (f.beat) return project(f.beat.moment.from.x, f.beat.moment.from.y).u;
  if (!f.dots.length) return null;
  let u = 0;
  for (const d of f.dots) u += project(d.x, d.y).u;
  return u / f.dots.length;
}

/** The camera for a box of boxW × boxH CSS px at display time t. */
export function cameraAt(shot: (t: number, o?: ShotOptions) => Shot, t: number, boxW: number, boxH: number, current?: Shot): Camera {
  const width = Math.min(PLATE.width, Math.max(760, boxW / FOLLOW_SCALE));
  const height = (width * boxH) / boxW;
  const now = current ?? shot(t);
  let sum = 0;
  let n = 0;
  let first: number | null = null;
  let cut = false;
  for (let i = 0; i <= SAMPLES; i++) {
    const age = (i / SAMPLES) * WINDOW_S;
    const w = Math.min(age, WINDOW_S - age) + 1e-3; // a triangle: 0 at both ends
    // A cut: don't drag the old picture's ball along. The camera acts as if it had held on the
    // new picture's first frame, so it eases from there instead of lurching after its first
    // few frames.
    // The samples need only the ball (cheap); the players only when there's no ball to follow.
    let s = cut ? null : i === 0 ? now : shot(t - age, LITE);
    if (s && !s.frame.ball && !s.frame.beat && !s.frame.dots.length) s = shot(t - age);
    if (s && s.replayOf !== now.replayOf) {
      cut = true;
      // The new picture's first frame: find the cut between this sample and the one after it.
      let lo = t - age;
      let hi = t - ((i - 1) / SAMPLES) * WINDOW_S;
      for (let k = 0; k < 8; k++) {
        const mid = (lo + hi) / 2;
        if (shot(mid).replayOf === now.replayOf) hi = mid;
        else lo = mid;
      }
      const at = shot(hi, LITE);
      first = focus(at.frame.ball || at.frame.beat ? at.frame : shot(hi).frame) ?? first;
    }
    const u: number | null = s && !cut ? focus(s.frame) : first;
    if (u === null) continue;
    if (!cut) first = u;
    sum += u * w;
    n += w;
  }
  const cx = n ? sum / n : PLATE.width / 2;
  const half = width / 2;
  const x0 = Math.min(PLATE.width - width, Math.max(0, cx - half));
  const y0 = Math.min(PLATE.height - height, Math.max(0, PITCH_MID_Y - height / 2));
  return { x0, y0, width, height };
}
