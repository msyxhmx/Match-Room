// The players on the pitch: small standing figures in their kit (Ilham's pick, 26 Oct, from the
// characters prototype: "standing players" over discs and top-down figures). Each one runs with a
// stride that follows its speed, faces its run (or the ball when still), kicks on a pass, shot or
// corner, the keeper dives at a shot on target, and the scorer celebrates.
//
// Positions are still frame.ts's illustrative choreography: only the drawing changes. The pose
// is pure: it comes from this frame and one a moment earlier (the caller's), so a replay, the
// film script and the tests all get the same picture. Reduced motion: held poses, no stride, no
// hop, the dive shown already made.

import type { Dot, Frame } from "./frame";
import { dist, project, type Vec } from "./geometry";
import { hash01, isGoal } from "./moments";
import type { Palette } from "./render";

/** How far back the caller's earlier frame is, in display seconds. */
export const PREV_DT = 1 / 15;
/** Figure height in metres before the boost: drawn larger than life, as the discs were. */
export const FIGURE_H_M = 3.1;
/** Faster than this between the two frames is a cut (a replay starts), not a run. */
const CUT_SPEED = 30;
/** Strides per second, in radians of leg swing, and the swing at a full run. */
const CADENCE = 9;
const SWING = 0.55;
/** A run this fast or faster swings the legs fully. */
const FULL_RUN = 3;
/** The kick: starts this long before the touch and lasts this long. */
const KICK_LEAD = 0.3;
const KICK_LEN = 0.65;

export interface FigurePose {
  /** Which way the figure looks on screen: 1 right, -1 left. */
  facing: 1 | -1;
  /** m/s between the two frames (0 at a cut). */
  speed: number;
  /** Leg swing from straight down, radians, signed (0 standing or under reduced motion). */
  stride: number;
  /** 0..1 through a kick (wind up, strike, follow through), or null. */
  kick: number | null;
  /** The keeper's dive: 0..1 and the point on his line the ball crosses, or null. */
  dive: { p: number; to: Vec } | null;
  /** Seconds since the scorer's goal went in, or null. */
  celebrate: number | null;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/** Screen direction (left or right) of a world-plane direction from a point. */
function screenSide(at: Vec, dir: Vec): 1 | -1 {
  const a = project(at.x, at.y);
  const b = project(at.x + dir.x, at.y + dir.y);
  return b.u >= a.u ? 1 : -1;
}

export function figurePose(d: Dot, before: Dot | undefined, f: Frame, still = false): FigurePose {
  const moved = before ? dist(d, before) : 0;
  const speed = moved / PREV_DT > CUT_SPEED ? 0 : moved / PREV_DT;
  // Facing: the run, blended with the ball so a jog doesn't flip a player who's watching it.
  const run = speed > 0 && before ? { x: (d.x - before.x) / PREV_DT, y: (d.y - before.y) / PREV_DT } : { x: 0, y: 0 };
  const toBall = f.ball ? { x: f.ball.x - d.x, y: f.ball.y - d.y } : { x: 0, y: 0 };
  const nb = Math.hypot(toBall.x, toBall.y) || 1;
  let look = { x: run.x + (toBall.x / nb) * 1.2, y: run.y + (toBall.y / nb) * 1.2 };
  if (look.x === 0 && look.y === 0) look = { x: d.side === "home" ? 1 : -1, y: 0 };

  const amp = Math.min(1, speed / FULL_RUN);
  const stride = still ? 0 : Math.sin(f.t * CADENCE + hash01(d.id) * 2 * Math.PI) * SWING * amp;

  let kick: number | null = null;
  let dive: FigurePose["dive"] = null;
  let celebrate: number | null = null;
  const b = f.beat;
  if (b) {
    const m = b.moment;
    const strikes = m.kind === "pass" || m.kind === "shot" || m.kind === "corner";
    if (strikes && b.actor === d.id && f.t >= b.touch - KICK_LEAD && f.t < b.touch - KICK_LEAD + KICK_LEN) {
      kick = still ? 0.75 : (f.t - (b.touch - KICK_LEAD)) / KICK_LEN;
      if (m.to) look = { x: m.to.x - d.x, y: m.to.y - d.y };
    }
    if (m.kind === "shot" && m.outcome !== "blocked" && m.to && d.role === "GK" && d.side !== m.side && f.t >= b.touch) {
      const p = clamp01((f.t - b.touch) / Math.max(0.2, b.land - b.touch + 0.15));
      dive = { p: still ? 1 : p, to: { x: d.x, y: m.to.y } };
    }
    if (isGoal(m) && b.actor === d.id && f.t >= b.land) celebrate = f.t - b.land;
  }
  return { facing: screenSide(d, look), speed, stride, kick, dive, celebrate };
}

export interface FigureOptions {
  palette: Palette;
  /** Marks drawn larger inside a page (see DrawOptions.boost). */
  boost: number;
  focus?: string | null;
  /** The frame PREV_DT earlier, for speed and facing; without it everyone stands. */
  prev?: Frame | null;
  /** Reduced motion: held poses. */
  still?: boolean;
}

/** All 22, far to near so nearer players overlap farther ones. */
export function drawFigures(ctx: CanvasRenderingContext2D, f: Frame, o: FigureOptions) {
  const before = new Map((o.prev?.dots ?? []).map((d) => [d.id, d]));
  const dots = [...f.dots].sort((a, b) => b.y - a.y);
  for (const d of dots) drawFigure(ctx, d, figurePose(d, before.get(d.id), f, o.still), o);
}

function drawFigure(ctx: CanvasRenderingContext2D, d: Dot, pose: FigurePose, o: FigureOptions) {
  const P = o.palette;
  const g = project(d.x, d.y);
  // Figure units: the body is drawn 2.6 units tall, FIGURE_H_M metres on the pitch.
  const u = ((g.scale * FIGURE_H_M) / 2.6) * o.boost;
  const team = d.side === "home" ? P.home : P.away;
  const keeper = d.role === "GK";
  const shirt = keeper ? P.white : team;
  const trim = keeper ? team : P.white;

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

  if (pose.celebrate !== null && !o.still) ctx.translate(0, -Math.abs(Math.sin(pose.celebrate * 9)) * 0.35 * u);
  if (pose.dive) {
    // Along his line toward where the ball crosses it. Across the goal is mostly up and down on
    // screen from this camera, so the body tips toward that point and slides along the screen.
    const at = project(pose.dive.to.x, pose.dive.to.y);
    const du = at.u - g.u;
    const dv = at.v - g.v;
    const len = Math.max(1, Math.hypot(du, dv));
    const tilt = Math.max(-1.35, Math.min(1.35, Math.atan2(du, -dv)));
    const e = Math.sin((pose.dive.p * Math.PI) / 2);
    const slide = Math.min(len, 1.6 * u) * e;
    ctx.translate((du / len) * slide, (dv / len) * slide - 0.4 * u * Math.sin(pose.dive.p * Math.PI));
    ctx.rotate(tilt * e);
  }
  ctx.scale(pose.facing, 1);

  const limb = (from: Vec, ang: number, len: number, width: number, colour: string): Vec => {
    const to = { x: from.x + Math.sin(ang) * len, y: from.y + Math.cos(ang) * len };
    ctx.strokeStyle = colour;
    ctx.lineWidth = width * u;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(from.x * u, from.y * u);
    ctx.lineTo(to.x * u, to.y * u);
    ctx.stroke();
    return to;
  };

  // Legs: angles from straight down, forward positive. A kick draws the front leg back, then
  // through; a diving keeper's legs trail.
  let back = -pose.stride;
  let front = pose.stride;
  if (pose.kick !== null) {
    const k = pose.kick;
    front = k < 0.45 ? -0.9 * (k / 0.45) : -0.9 + 2.5 * clamp01((k - 0.45) / 0.3);
    back = -0.15;
  }
  if (pose.dive) {
    back = -0.35;
    front = 0.25;
  }
  const lift = (a: number) => (o.still ? 0 : Math.max(0, -a) * 0.3);
  const leg = (ang: number, x: number) => {
    const knee = limb({ x, y: -1.05 }, ang, 0.5, 0.26, P.ink); // shorts and thigh
    limb({ x: knee.x, y: knee.y - lift(ang) }, ang * 0.7, 0.52, 0.2, team); // socks in the club colour
  };
  ctx.globalAlpha = 0.85;
  leg(back, -0.08);
  ctx.globalAlpha = 1;
  leg(front, 0.08);

  ctx.fillStyle = shirt;
  ctx.strokeStyle = trim;
  ctx.lineWidth = 2 * o.boost;
  ctx.beginPath();
  ctx.roundRect(-0.32 * u, -1.95 * u, 0.64 * u, 0.98 * u, 0.2 * u);
  ctx.fill();
  ctx.stroke();

  // Arms swing against the legs; straight up in a dive or a celebration.
  const up = pose.dive !== null || pose.celebrate !== null;
  const shoulder = { x: 0, y: -1.8 };
  limb(shoulder, up ? Math.PI * 0.92 : pose.stride * 0.8, 0.62, 0.16, shirt);
  limb(shoulder, up ? Math.PI * 1.08 : -pose.stride * 0.8, 0.62, 0.16, shirt);

  ctx.fillStyle = P.ink;
  ctx.beginPath();
  ctx.arc(0.04 * u, -2.25 * u, 0.27 * u, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
