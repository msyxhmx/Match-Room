// The players on the pitch: small standing figures in their kit (Ilham's pick, 26 Oct, from the
// characters prototype: "standing players" over discs and top-down figures).
//
// The body follows the movement (web/PITCH.md, "The look"):
//   - a gait from the speed: standing (weight shifting, breathing), a walk (short stride, low
//     arms), a jog, a sprint (long stride, knees up, leaning in about 15°, arms pumping). The legs
//     move with the ground actually covered (frame.ts's strides), so feet don't skate;
//   - leaning forward when speeding up and back when braking (from a third, earlier frame);
//   - seen from the side, the front (running toward the camera) or the back (running away, the
//     shirt number on show), by the run's direction on screen;
//   - actions from the beats: the kick, dribble touches while carrying, controlling a pass, the
//     real tackler's slide, a jump for a lofted ball, the keeper's ready crouch, dive and save,
//     and the scorer running off with his arms out.
//
// Positions are still frame.ts's illustrative choreography: only the drawing changes. The pose
// is pure: it comes from this frame and several earlier ones (the caller's: 1/15, 2/15, 0.25, 0.5
// and 1 s back; speed, view and facing use the long windows so bodies stay calm), so a replay,
// the film script and the tests all get the same picture. Reduced motion: held poses, no stride,
// bob or hop, the dive shown already made.

import type { Dot, Frame } from "./frame";
import { strideM } from "./frame";
import { dist, GOAL_HALF, HALF_L, own, project, type Vec } from "./geometry";
import { hash01, isGoal } from "./moments";
import { HEAD, loft } from "./plan";
import type { Palette } from "./render";

/** How far back the caller's earlier frame is, in display seconds (the one before that is twice
 *  as far). */
export const PREV_DT = 1 / 15;
/** The longer look-backs that keep the body calm: speed and view from QUARTER_DT, facing when
 *  slow from HALF_DT. Pass those frames' dots as `past` (without them the short window is used). */
export const QUARTER_DT = 0.25;
export const HALF_DT = 0.5;
/** And a full second back: the stand-vs-moving blend rides over a short pause between runs. */
export const FULL_DT = 1;
export interface Past {
  /** The dot QUARTER_DT earlier. */
  q?: Dot;
  /** The dot HALF_DT earlier. */
  h?: Dot;
  /** The dot FULL_DT earlier. */
  w?: Dot;
}
/** Figure height in metres before the boost: drawn larger than life, as the discs were. */
export const FIGURE_H_M = 3.1;
/** Faster than this between the two frames is a cut (a replay starts), not a run. */
const CUT_SPEED = 30;
/** Slower than this (m/s) the body stays side on; faster, front/back only inside a narrow cone
 *  toward or away from the camera (|dv| > FRONT_BACK × |du| on screen), so diagonals don't toggle. */
const SIDE_BELOW = 2;
const FRONT_BACK = 2;
/** A look is clearly left or right when |du| > FACE_CLEAR × |dv| on screen. */
const FACE_CLEAR = 0.8;
/** The kick: starts this long before the touch and lasts this long. */
const KICK_LEAD = 0.3;
const KICK_LEN = 0.65;
/** Leg length (hip to heel) in figure units: the body is 2.6 units tall. */
const THIGH = 0.5;
const SHIN = 0.52;
const HIP_Y = -1.05;
const SHOULDER_Y = -1.8;
/** The keeper crouches ready when the ball is this close to his goal line (his third). */
const KEEPER_THIRD = 35;

export type Gait = "stand" | "walk" | "jog" | "sprint";
export type View = "side" | "front" | "back";

/** The gait for a speed (m/s). The drawing blends within each (cadence, stride, lean). */
export const gaitOf = (v: number): Gait => (v < 0.5 ? "stand" : v < 2.5 ? "walk" : v < 4.5 ? "jog" : "sprint");

export interface FigurePose {
  /** 0..1: standing to moving, a blend over 0.3..0.8 m/s of the speed over the last second
   *  (a short pause between runs doesn't drop the body back to its idle pose). */
  move: number;
  /** 0..1: the same blend on the quarter-second speed: how much the legs and arms swing. */
  swing: number;
  /** Which way the figure looks on screen: 1 right, -1 left. */
  facing: 1 | -1;
  /** Seen from the side, from the front (coming toward the camera) or from the back. */
  view: View;
  /** m/s between the two frames (0 at a cut). */
  speed: number;
  gait: Gait;
  /** Leg cycle in radians (2π a stride), from the ground covered; 0 under reduced motion. */
  phase: number;
  /** Near leg's swing from straight down, radians, signed (0 standing or under reduced motion). */
  stride: number;
  /** Half a stride on the ground (m): the drawing sizes the leg swing from it. */
  step: number;
  /** Forward lean (radians, + toward the facing): the gait's, plus speeding up or braking. */
  lean: number;
  /** 0..1 through a kick (wind up, strike, follow through), or null. */
  kick: number | null;
  /** Dribble touches while carrying the ball. */
  dribble: boolean;
  /** 0..1 through controlling a pass, or null. */
  control: number | null;
  /** 0..1 through the real tackler's slide, or null. */
  tackle: number | null;
  /** 0..1 through a jump for a lofted ball, or null. */
  header: number | null;
  /** The keeper's ready crouch. */
  crouch: boolean;
  /** The keeper's dive: 0..1 and the point on his line the ball crosses, or null. */
  dive: { p: number; to: Vec } | null;
  /** 0..1 into the keeper gathering a saved shot, or null. */
  catch: number | null;
  /** Seconds since the scorer's goal went in, or null. */
  celebrate: number | null;
  /** Seconds on the clock, for standing players' weight shift and breathing. */
  t: number;
  /** Per-player offset (0..1) so standing players don't breathe in step. */
  seed: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);
const smooth = (a: number, b: number, v: number) => {
  const u = clamp01((v - a) / (b - a));
  return u * u * (3 - 2 * u);
};
/** 0..1 through [a, b), or null outside it. */
const through = (t: number, a: number, b: number) => (t >= a && t < b ? (t - a) / (b - a) : null);

/** Left or right on screen. Mirrors only when the screen direction is clearly sideways; a look
 *  toward or away from the camera (or hardly anywhere) keeps the team's default way, so a jog
 *  down the pitch doesn't flip a player on every wobble. */
function faceOf(at: Vec, dir: Vec, dflt: 1 | -1): 1 | -1 {
  const a = project(at.x, at.y);
  const b = project(at.x + dir.x, at.y + dir.y);
  const du = b.u - a.u;
  const dv = b.v - a.v;
  return Math.abs(du) > FACE_CLEAR * Math.abs(dv) ? (du > 0 ? 1 : -1) : dflt;
}

/** Side, front or back, from a direction on the ground as seen on screen. */
function viewOf(at: Vec, dir: Vec, speed: number): View {
  const n = Math.hypot(dir.x, dir.y);
  if (n < 1e-9 || speed < SIDE_BELOW) return "side";
  const a = project(at.x, at.y);
  const b = project(at.x + dir.x / n, at.y + dir.y / n);
  const du = b.u - a.u;
  const dv = b.v - a.v;
  if (Math.abs(dv) <= FRONT_BACK * Math.abs(du)) return "side";
  return dv < 0 ? "back" : "front";
}

/** Velocity (m/s) between two dots, or null at a cut. */
function velocity(d: Dot, before: Dot | undefined): Vec | null {
  if (!before) return null;
  const v = { x: (d.x - before.x) / PREV_DT, y: (d.y - before.y) / PREV_DT };
  return Math.hypot(v.x, v.y) > CUT_SPEED ? null : v;
}

/** Velocity (m/s) over a longer window of dt seconds, or null at a cut or without the dot. */
function velocityOver(d: Dot, then: Dot | undefined, dt: number): Vec | null {
  if (!then) return null;
  const v = { x: (d.x - then.x) / dt, y: (d.y - then.y) / dt };
  return Math.hypot(v.x, v.y) > CUT_SPEED ? null : v;
}

export function figurePose(d: Dot, before: Dot | undefined, f: Frame, still = false, earlier?: Dot, past?: Past): FigurePose {
  // Speed and view from the longer window (the short one jitters); facing when slow from the longest.
  const vShort = velocity(d, before) ?? { x: 0, y: 0 };
  const vq = velocityOver(d, past?.q, QUARTER_DT);
  const vh = velocityOver(d, past?.h, HALF_DT);
  const vLong = vq && vh ? { x: (vq.x + vh.x) / 2, y: (vq.y + vh.y) / 2 } : vq ?? vh;
  const vel = past?.q || past?.h ? vLong ?? { x: 0, y: 0 } : vShort;
  const velSlow = past?.h ? vh ?? vel : vel;
  const speed = Math.hypot(vel.x, vel.y);
  const gait = gaitOf(speed);
  const swing = smooth(0.3, 0.8, speed);
  const vw = velocityOver(d, past?.w, FULL_DT);
  // Ground covered over the last second (path length, so a turn or a pause in it still counts).
  const sw0 = past?.w ? (d.run - past.w.run) / FULL_DT : 0;
  const sw = sw0 >= 0 && sw0 <= 12 ? sw0 : 0; // a cut (a replay starts) isn't ground covered
  const move = past?.h ? smooth(0.3, 0.8, Math.max(Math.hypot(velSlow.x, velSlow.y), sw)) : swing;
  // Facing: the run, blended with the ball so a jog doesn't flip a player who's watching it.
  const toBall = f.ball ? { x: f.ball.x - d.x, y: f.ball.y - d.y } : { x: 0, y: 0 };
  const nb = Math.hypot(toBall.x, toBall.y) || 1;
  // The ball only decides when he's nearly still; a jog or run looks where it goes.
  // A keeper watches the ball unless he's sprinting (he shuffles and backpedals facing play).
  const bw =
    d.role === "GK"
      ? 3 * (1 - smooth(3.5, 5, Math.hypot(velSlow.x, velSlow.y)))
      : 1.2 * (1 - smooth(0.4, 2, Math.hypot(velSlow.x, velSlow.y)));
  const vFace = vw ? { x: 0.3 * velSlow.x + 0.7 * vw.x, y: 0.3 * velSlow.y + 0.7 * vw.y } : velSlow;
  let look = { x: vFace.x + (toBall.x / nb) * bw, y: vFace.y + (toBall.y / nb) * bw };
  const dflt: 1 | -1 = d.side === "home" ? 1 : -1;
  if (look.x === 0 && look.y === 0) look = { x: dflt, y: 0 };
  let view = viewOf(d, vFace, Math.hypot(vFace.x, vFace.y));

  // The stride: phase from the strides covered; the swing that matches it is the drawing's.
  const moving = !still && swing > 0;
  const phase = moving ? 2 * Math.PI * d.strides + hash01(d.id) * 0.4 : 0;
  const step = moving ? (strideM(speed) / 2) * swing : 0;
  const legM = ((THIGH + SHIN) * FIGURE_H_M) / 2.6;
  const stride = moving ? Math.asin(Math.min(0.75, step / (2 * legM))) * Math.sin(phase) : 0;

  // Lean: into a sprint (about 15°), plus speeding up (forward) or braking (back).
  let lean = 0;
  if (!still) {
    lean = 0.05 * smooth(0.5, 3, speed) + 0.21 * smooth(3.5, 6.5, speed);
    const v0 = before && earlier ? velocity(before, earlier) : null;
    if (v0 && speed > 0.3) {
      const along = ((vel.x - v0.x) * vel.x + (vel.y - v0.y) * vel.y) / speed / PREV_DT;
      lean += clamp(0.04 * along, -0.12, 0.12);
    }
    lean = Math.min(lean, 0.36); // about 20° at most
  }

  let kick: number | null = null;
  let control: number | null = null;
  let tackle: number | null = null;
  let header: number | null = null;
  let dive: FigurePose["dive"] = null;
  let caught: number | null = null;
  let celebrate: number | null = null;
  const b = f.beat;
  const t = f.t;
  if (b) {
    const m = b.moment;
    const strikes = m.kind === "pass" || m.kind === "shot" || m.kind === "corner";
    if (strikes && b.actor === d.id) {
      const k = through(t, b.touch - KICK_LEAD, b.touch - KICK_LEAD + KICK_LEN);
      if (k !== null) {
        kick = still ? 0.75 : k;
        if (m.to) look = { x: m.to.x - d.x, y: m.to.y - d.y };
      }
    }
    if (b.receiver === d.id && m.to && b.land > b.touch) {
      const from = { x: m.from.x - d.x, y: m.from.y - d.y };
      if (m.kind === "pass" && loft(m) > HEAD) {
        // A lofted ball: up to meet it as it drops.
        const p = through(t, b.land - 0.45, b.land + 0.15);
        if (p !== null) {
          header = still ? 0.5 : p;
          look = from;
        }
      } else if (b.winnerShown) {
        // The real tackler or interceptor: the slide, into the ball's path.
        const p = through(t, b.land - 0.45, b.land + 0.6);
        if (p !== null) {
          tackle = still ? 0.5 : p;
          look = { x: m.to.x - m.from.x, y: m.to.y - m.from.y };
        }
      } else if (m.kind === "shot" && m.outcome === "saved") {
        if (t >= b.land - 0.25) {
          caught = still ? 1 : clamp01((t - (b.land - 0.25)) / 0.25);
          look = from;
        }
      } else if (m.kind === "pass") {
        const p = through(t, b.land - 0.3, b.land + 0.35);
        if (p !== null) {
          control = still ? 0.5 : p;
          look = from;
        }
      }
    }
    // The beaten keeper dives for a shot that crosses his line on target or near it, not for
    // one that flies well wide.
    if (
      m.kind === "shot" && m.outcome !== "blocked" && m.outcome !== "saved" && m.to &&
      d.role === "GK" && d.side !== m.side && t >= b.touch &&
      Math.abs(m.to.y) < GOAL_HALF + 2.5 && Math.abs(m.to.x) > HALF_L - 4
    ) {
      const p = clamp01((t - b.touch) / Math.max(0.2, b.land - b.touch + 0.15));
      dive = { p: still ? 1 : p, to: { x: d.x, y: m.to.y } };
    }
    if (isGoal(m) && b.actor === d.id && t >= b.land) celebrate = t - b.land;
  }
  // The keeper, set and ready, while the other side has the ball in his third (not when it's at
  // his own feet: a goal kick, a ball he's gathering).
  const crouch =
    d.role === "GK" && !dive && caught === null && kick === null && !!f.ball && own(d.side, f.ball).x < -HALF_L + KEEPER_THIRD &&
    speed < 2.5 && f.possession !== d.side && dist(d, f.ball) > 5;
  if (crouch && f.ball) look = toBall;
  // Carrying the ball: it's at his feet, on the ground.
  const dribble =
    kick === null && control === null && tackle === null && !!f.ball && f.ball.z < 0.3 && speed > 1 && dist(d, f.ball) < 1.6;
  if (kick !== null || control !== null || tackle !== null || header !== null || dive || caught !== null || crouch || celebrate !== null)
    view = "side";

  return {
    move: still ? 0 : move,
    swing: still ? 0 : swing,
    facing: faceOf(d, look, dflt),
    view,
    speed,
    gait,
    phase,
    stride,
    step,
    lean,
    kick,
    dribble,
    control,
    tackle,
    header,
    crouch,
    dive,
    catch: caught,
    celebrate,
    t,
    seed: hash01(d.id),
  };
}

export interface FigureOptions {
  palette: Palette;
  /** Marks drawn larger inside a page (see DrawOptions.boost). */
  boost: number;
  focus?: string | null;
  /** The frame PREV_DT earlier, for speed and facing; without it everyone stands. */
  prev?: Frame | null;
  /** The frame 2 × PREV_DT earlier, for speeding up and braking (the lean). */
  earlier?: Frame | null;
  /** The frames QUARTER_DT and HALF_DT earlier: the calm speed, view and facing. */
  quarter?: Frame | null;
  half?: Frame | null;
  full?: Frame | null;
  /** Reduced motion: held poses. */
  still?: boolean;
}

/** All 22, far to near so nearer players overlap farther ones. */
export function drawFigures(ctx: CanvasRenderingContext2D, f: Frame, o: FigureOptions) {
  const before = new Map((o.prev?.dots ?? []).map((d) => [d.id, d]));
  const earlier = new Map((o.earlier?.dots ?? []).map((d) => [d.id, d]));
  const quarter = new Map((o.quarter?.dots ?? []).map((d) => [d.id, d]));
  const half = new Map((o.half?.dots ?? []).map((d) => [d.id, d]));
  const full = new Map((o.full?.dots ?? []).map((d) => [d.id, d]));
  const dots = [...f.dots].sort((a, b) => b.y - a.y);
  for (const d of dots) {
    const past = { q: quarter.get(d.id), h: half.get(d.id), w: full.get(d.id) };
    drawFigure(ctx, d, figurePose(d, before.get(d.id), f, o.still, earlier.get(d.id), past), o);
  }
}

/** A leg as two angles from straight down (forward positive): thigh, and shin. */
type Leg = [number, number];

function drawFigure(ctx: CanvasRenderingContext2D, d: Dot, pose: FigurePose, o: FigureOptions) {
  const P = o.palette;
  const g = project(d.x, d.y);
  // Figure units: the body is drawn 2.6 units tall, FIGURE_H_M metres on the pitch.
  const u = ((g.scale * FIGURE_H_M) / 2.6) * o.boost;
  const team = d.side === "home" ? P.home : P.away;
  const keeper = d.role === "GK";
  const shirt = keeper ? P.white : team;
  const trim = keeper ? team : P.white;
  const still = !!o.still;
  const v = pose.speed;
  const ph = pose.phase;

  ctx.save();
  ctx.translate(g.u, g.v);

  // On the ground, whatever the body does: the shadow and the focus player's ring.
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.ellipse(0, 0, 0.55 * u, 0.2 * u, 0, 0, Math.PI * 2);
  ctx.fill();
  if (o.focus && d.name === o.focus && d.side === "home") {
    ctx.globalAlpha = 0.6;
    ctx.strokeStyle = P.white;
    ctx.lineWidth = 3 * o.boost;
    ctx.beginPath();
    ctx.ellipse(0, 0, 0.85 * u, 0.32 * u, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ---- the pose: legs, arms (upper arm, elbow bend) and body lean ----
  // The swing that covers half a stride with these legs, on screen: feet don't skate.
  const legPx = (THIGH + SHIN) * u;
  const swing = pose.step > 0 ? Math.asin(Math.min(0.75, (pose.step * g.scale) / (2 * legPx))) : 0;
  const kneeUp = 0.35 + 1.25 * smooth(2, 7, v); // heel lift in the swing: a walk to a sprint
  const legAt = (p: number): Leg => {
    const th = swing * Math.sin(p);
    return [th, th - kneeUp * Math.max(0, Math.cos(p)) * (swing > 0 ? 1 : 0) - 0.08 * (swing > 0 ? 1 : 0)];
  };
  let near: Leg = legAt(ph);
  let far: Leg = legAt(ph + Math.PI);
  const armAmp = still ? 0 : 0.25 + 0.75 * smooth(1, 7, v);
  const elbow = 0.2 + 1.3 * smooth(1.5, 6, v);
  let nearArm: Leg = [-armAmp * Math.sin(ph) * pose.swing, 0];
  let farArm: Leg = [armAmp * Math.sin(ph) * pose.swing, 0];
  nearArm[1] = nearArm[0] + elbow;
  farArm[1] = farArm[0] + elbow;
  let lean = pose.lean;
  let lift = 0; // off the ground (units): a jump
  let slide = 0; // a tackle: 0..1 down onto the ground

  // Standing: weight shifting from foot to foot, the chest rising and falling.
  let sway = 0;
  let breathe = 0;
  if (pose.move < 1 && !still) {
    // Standing blends into the gait over 0.3..0.8 m/s: no snap between the two poses.
    const k = 1 - pose.move;
    const mix = (a: Leg, b: Leg): Leg => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    sway = 0.035 * Math.sin(pose.t * 0.9 + pose.seed * 20) * k;
    breathe = 0.018 * Math.sin(pose.t * 2.3 + pose.seed * 13) * k;
    near = mix(near, [0.06 + sway, 0.06 + sway]);
    far = mix(far, [-0.06 + sway, -0.06 + sway]);
    nearArm = mix(nearArm, [0.08, 0.25]);
    farArm = mix(farArm, [-0.05, 0.2]);
  }
  if (pose.dribble && !still) {
    // A touch every other stride: the near foot reaches for the ball.
    const tap = Math.floor(ph / (2 * Math.PI)) % 2 === 0 ? Math.max(0, Math.sin(ph)) ** 3 : 0;
    near = [near[0] + 0.2 * tap, near[1] + 0.35 * tap];
  }
  if (pose.kick !== null) {
    // Draws the striking leg back, then through.
    const k = pose.kick;
    const th = k < 0.45 ? -0.9 * (k / 0.45) : -0.9 + 2.5 * clamp01((k - 0.45) / 0.3);
    near = [th, th - (k < 0.45 ? 0.9 * (k / 0.45) : 0.2)];
    far = [-0.15, -0.2];
    nearArm = [-0.6, -0.3];
    farArm = [0.9, 1.2];
    lean = -0.1;
  }
  if (pose.control !== null) {
    // Cushions the pass: the near foot up to meet it, arms out for balance.
    const e = Math.sin(pose.control * Math.PI);
    near = [0.75 * e, 0.2 * e];
    far = [0, -0.05];
    nearArm = [0.9 * e, 1.1 * e];
    farArm = [-0.8 * e, -0.6 * e];
    lean = -0.12 * e;
  }
  if (pose.header !== null) {
    const p = pose.header;
    const e = Math.sin(p * Math.PI);
    lift = still ? 0 : 0.55 * e;
    near = [0.25 * e, -0.9 * e];
    far = [-0.2 * e, -1.1 * e];
    nearArm = [2.3 * e, 2.6 * e];
    farArm = [1.9 * e, 2.3 * e];
    lean = p > 0.55 ? 0.35 * e : -0.15 * e; // arches back, then heads it
  }
  if (pose.tackle !== null) {
    // Down fast, slides through, then back up.
    const p = pose.tackle;
    slide = p < 0.25 ? smooth(0, 0.25, p) : p < 0.75 ? 1 : 1 - smooth(0.75, 1, p);
    if (still) slide = 1;
    near = [0.35 * slide, 0.35 * slide];
    far = [-0.1 * slide, -1.1 * slide];
    nearArm = [1.2 * slide, 1.5 * slide];
    farArm = [-2.2 * slide, -2.4 * slide];
    lean = 0;
  }
  if (pose.crouch) {
    near = [0.65, -0.3];
    far = [0.5, -0.4];
    nearArm = [0.85, 1.4];
    farArm = [0.7, 1.3];
    lean = 0.4;
  }
  if (pose.catch !== null) {
    // Gathers it: down behind the ball (shots here travel along the ground), arms scooping it up.
    const e = smooth(0, 1, pose.catch);
    near = [0.9 * e, -0.5 * e];
    far = [0.3 * e, -1.2 * e];
    nearArm = [0.5 * e, 0.3 * e];
    farArm = [0.4 * e, 0.2 * e];
    lean = 0.6 * e;
  }
  if (pose.dive) {
    near = [0.25, 0.25];
    far = [-0.35, -0.35];
  }
  if (pose.dive || pose.celebrate !== null) {
    // Arms up in a dive; out wide as the scorer runs off.
    const up = !!pose.dive;
    nearArm = up ? [Math.PI * 0.92, Math.PI * 0.92] : [1.5, 1.6];
    farArm = up ? [Math.PI * 1.08, Math.PI * 1.08] : [-1.5, -1.6];
  }

  // Feet on the ground: the body sits as low as its lower foot allows (a crouch, a stride).
  const footY = (l: Leg) => HIP_Y + Math.cos(l[0]) * THIGH + Math.cos(l[1]) * SHIN;
  const ground = slide > 0 ? 0 : -Math.max(footY(near), footY(far));

  if (pose.dive) {
    // Along his line toward where the ball crosses it. Across the goal is mostly up and down on
    // screen from this camera, so the body tips toward that point and slides along the screen.
    const at = project(pose.dive.to.x, pose.dive.to.y);
    const du = at.u - g.u;
    const dv = at.v - g.v;
    const len = Math.max(1, Math.hypot(du, dv));
    const tilt = Math.max(-1.35, Math.min(1.35, Math.atan2(du, -dv)));
    const e = Math.sin((pose.dive.p * Math.PI) / 2);
    const slideD = Math.min(len, 1.6 * u) * e;
    ctx.translate((du / len) * slideD, (dv / len) * slideD - 0.4 * u * Math.sin(pose.dive.p * Math.PI));
    ctx.rotate(tilt * e);
  }
  ctx.translate(0, (ground - lift) * u);
  ctx.scale(pose.facing, 1);
  if (slide > 0) {
    // Lying back along the ground, feet first toward the ball.
    ctx.translate(0.6 * slide * u, 0);
    ctx.rotate(-1.15 * slide);
  }

  const seg = (from: Vec, ang: number, len: number, width: number, colour: string, k = 1): Vec => {
    const to = { x: from.x + Math.sin(ang) * len * k, y: from.y + Math.cos(ang) * len };
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x * u, from.y * u);
    ctx.lineTo(to.x * u, to.y * u);
    ctx.stroke();
    return to;
  };
  // Legs: shorts and thigh in ink, socks in the club colour.
  const drawLeg = (l: Leg, x: number) => {
    const knee = seg({ x, y: HIP_Y }, l[0], THIGH, 0.26, P.ink);
    seg(knee, l[1], SHIN, 0.2, team);
  };
  const drawArm = (a: Leg, x: number) => {
    const el = seg({ x, y: SHOULDER_Y + breathe }, a[0], 0.32, 0.16, shirt);
    seg(el, a[1], 0.3, 0.15, shirt);
  };
  /** Torso, arms and head lean from the hips. */
  const upper = (draw: () => void) => {
    ctx.save();
    ctx.translate(sway * u, HIP_Y * u);
    ctx.rotate(lean);
    ctx.translate(0, -HIP_Y * u);
    draw();
    ctx.restore();
  };
  const torso = (w: number) => {
    ctx.fillStyle = shirt;
    ctx.strokeStyle = trim;
    ctx.lineWidth = 2 * o.boost;
    ctx.beginPath();
    ctx.roundRect((-w / 2) * u, (-1.95 + breathe) * u, w * u, (0.98 - breathe) * u, 0.2 * u);
    ctx.fill();
    ctx.stroke();
  };
  const head = (x: number) => {
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.arc(x * u, (-2.25 + breathe) * u, 0.27 * u, 0, Math.PI * 2);
    ctx.fill();
  };

  if (pose.view === "side") {
    ctx.globalAlpha = 0.85;
    upper(() => drawArm(farArm, -0.02));
    drawLeg(far, -0.08);
    ctx.globalAlpha = 1;
    drawLeg(near, 0.08);
    upper(() => {
      torso(0.64);
      drawArm(nearArm, 0.02);
      head(0.04);
    });
  } else {
    // Front or back: legs side by side, a step shows as the knee coming up; arms at the sides.
    const lift1 = (p: number) => (pose.step > 0 ? Math.max(0, Math.sin(p)) * smooth(0.5, 6, v) : 0);
    const fbLeg = (x: number, l: number) => {
      const kneeY = HIP_Y + THIGH * (1 - 0.55 * l);
      seg({ x, y: HIP_Y }, 0, kneeY - HIP_Y, 0.26, P.ink);
      seg({ x, y: kneeY }, 0, SHIN * (1 - 0.35 * l), 0.2, team);
    };
    const fbArm = (x: number, out: number, l: number) => {
      const el = seg({ x, y: SHOULDER_Y + breathe }, out, 0.32, 0.16, shirt);
      seg(el, out * 0.5, 0.3 * (1 - 0.5 * l * smooth(1, 5, v)), 0.15, shirt);
    };
    const a = lift1(ph);
    const b = lift1(ph + Math.PI);
    ctx.translate(sway * u, 0);
    fbLeg(-0.13, a);
    fbLeg(0.13, b);
    torso(0.74);
    fbArm(-0.43, -0.22, b);
    fbArm(0.43, 0.22, a);
    if (pose.view === "back" && 0.42 * u >= 5) {
      // The shirt number, in the trim colour.
      ctx.fillStyle = trim;
      ctx.font = `700 ${Math.round(0.42 * u)}px ${P.family}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(d.number), 0, (-1.45 + breathe) * u);
    }
    head(0);
  }

  ctx.restore();
}
