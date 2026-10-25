// Draws one frame on the plate's canvas (1920 × 1080, the plate's own pixels). Imperative and
// cheap: 22 discs, the ball, a few labels. One look for everyone (Ilham's pick, 25 Oct:
// "broadcast"), plus the analyst layer: each team's units joined up, drawn in when the viewer
// switches to Analyst.

import type { Frame } from "./frame";
import { dist, project, type Vec } from "./geometry";

/** Colours and font from the theme's CSS variables, read once per mount (tokens only). */
export interface Palette {
  home: string;
  away: string;
  white: string;
  ink: string;
  family: string;
}

export function readPalette(el: Element): Palette {
  const cs = getComputedStyle(el);
  const v = (name: string) => cs.getPropertyValue(name).trim();
  return {
    home: v("--home-primary"),
    away: v("--away-primary"),
    white: v("--surface-card"),
    ink: v("--text-primary"),
    family: v("--font-sans"),
  };
}

/** How the illustrative ball between real moments is drawn (continuous play). */
export type GhostStyle = "solid" | "ghost" | "ghost-pulse";

export interface DrawOptions {
  /** Default "ghost". */
  ghost?: GhostStyle;
  /** The analyst layer, 0 (off) to 1 (on): it fades in and out with the persona switch. */
  analyst: number;
  palette: Palette;
  /** The viewer's focus player (a soft halo), e.g. "L. Quinn". */
  focus?: string | null;
  /** Inside a page the canvas is shown smaller: draw marks this much larger so they keep their
   *  on-screen size (dots 14 px and up, name pills at 23 px or more). Default 1. */
  boost?: number;
  /** Follow camera: the caller set the transform and cleared; keep name pills inside these
   *  plate-pixel bounds (default the video safe area, 100–1820). */
  bounds?: { x0: number; x1: number };
  /** Default true. False: the caller already cleared (a camera transform is set). */
  clear?: boolean;
}

/** Disc and ball sizes in metres; perspective scales them (14 px and up on the far side). */
const DOT_R_M = 0.85;
/** Drawn larger than life (as broadcast graphics do) so it survives 8 Mbps video. */
const BALL_R_M = 0.6;
const MIN_BALL_PX = 8;
/** Name tags: 24 px text, the video's floor is 23 px. */
const TAG_PX_BASE = 24;

function lineUnit(ctx: CanvasRenderingContext2D, pts: Vec[], colour: string, alpha: number, width: number) {
  if (pts.length < 2) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.lineJoin = "round";
  ctx.beginPath();
  pts.forEach((p, i) => {
    const s = project(p.x, p.y);
    if (i === 0) ctx.moveTo(s.u, s.v);
    else ctx.lineTo(s.u, s.v);
  });
  ctx.stroke();
  ctx.globalAlpha = 1;
}

export function drawFrame(ctx: CanvasRenderingContext2D, f: Frame, o: DrawOptions) {
  const { palette: P } = o;
  const k = o.boost ?? 1;
  const DOT_R = DOT_R_M * k;
  const BALL_R = BALL_R_M * k;
  const TAG_PX = TAG_PX_BASE * k;
  if (o.clear !== false) ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  const colour = (side: "home" | "away") => (side === "home" ? P.home : P.away);

  // ---- analyst: each team's back line, midfield and front line, joined, under everything.
  // The team without the ball is drawn stronger: its shape is what an analyst reads. ----
  if (o.analyst > 0.001) {
    for (const side of ["home", "away"] as const) {
      const defending = f.possession !== null && f.possession !== side;
      for (const role of ["DF", "MF", "FW"] as const) {
        const line = f.dots.filter((d) => d.side === side && d.role === role).sort((a, b) => a.y - b.y);
        lineUnit(ctx, line, colour(side), (defending ? 0.75 : 0.35) * o.analyst, (defending ? 3 : 2) * k);
      }
    }
  }

  // ---- the real pass, while it travels and rests ----
  const b = f.beat;
  if (b && b.moment.to && f.t >= b.touch) {
    const m = b.moment;
    const fade = Math.max(0, Math.min(1, (b.end - f.t) / 0.4));
    const k = Math.min(1, (f.t - b.touch) / Math.max(0.01, b.land - b.touch));
    const tip = { x: m.from.x + (m.to!.x - m.from.x) * k, y: m.from.y + (m.to!.y - m.from.y) * k };
    ctx.setLineDash([10, 8]);
    lineUnit(ctx, [m.from, tip], P.white, 0.85 * fade, 3 * k);
    ctx.setLineDash([]);
  }

  // ---- shadows, then discs, far to near ----
  const dots = [...f.dots].sort((a, b2) => b2.y - a.y);
  for (const d of dots) {
    const g = project(d.x + 0.25, d.y + 0.35);
    ctx.globalAlpha = 0.28;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.ellipse(g.u, g.v, DOT_R * 1.05 * g.scale, DOT_R * 0.42 * g.scale, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  const drawBall = () => {
    if (!f.ball) return;
    const { x, y, z } = f.ball;
    const style = o.ghost ?? "ghost";
    const a = f.ball.a * (f.ball.ghost && style !== "solid" ? 0.5 : 1);
    const g = project(x, y);
    const s = project(x, y, z + BALL_R);
    const r = Math.max(MIN_BALL_PX * k, BALL_R * s.scale);
    // A real touch: a ring that opens around the ball for half a second ("this one's real").
    if (style === "ghost-pulse" && b && !f.ball.ghost && f.t >= b.touch && f.t < b.touch + 0.5) {
      const k = (f.t - b.touch) / 0.5;
      ctx.globalAlpha = 0.9 * (1 - k);
      ctx.strokeStyle = P.white;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(s.u, s.v, r + 4 + k * 22, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 0.35 * a;
    ctx.fillStyle = P.ink;
    ctx.beginPath();
    ctx.ellipse(g.u, g.v, r * 1.1, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = a;
    ctx.fillStyle = P.white;
    ctx.strokeStyle = P.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(s.u, s.v, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.globalAlpha = 1;
  };

  for (const d of dots) {
    const c = project(d.x, d.y, DOT_R);
    const r = DOT_R * c.scale;
    const keeper = d.role === "GK";
    if (o.focus && d.name === o.focus && d.side === "home") {
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = P.white;
      ctx.beginPath();
      ctx.arc(c.u, c.v, r + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.fillStyle = keeper ? P.white : colour(d.side);
    ctx.strokeStyle = keeper ? colour(d.side) : P.white;
    ctx.lineWidth = keeper ? 4 : 2.5;
    ctx.beginPath();
    ctx.arc(c.u, c.v, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
  // The ball last: always visible, even at a player's feet.
  drawBall();

  // ---- who's on the ball: the real event's player ----
  if (b) {
    const names: { id: string; at: number }[] = [{ id: b.actor, at: b.touch - 0.45 }];
    if (b.winnerShown && b.receiver) names.push({ id: b.receiver, at: b.land - 0.15 });
    let shownTag = false;
    for (const n of names.reverse()) {
      if (shownTag || f.t < n.at) continue;
      const d = f.dots.find((x) => x.id === n.id);
      if (!d) continue;
      shownTag = true;
      const c = project(d.x, d.y, DOT_R * 2);
      const text = d.name;
      ctx.font = `600 ${TAG_PX}px ${P.family}`;
      const w = ctx.measureText(text).width + 24 * k;
      const h = TAG_PX + 14 * k;
      const bx0 = o.bounds ? o.bounds.x0 + 8 * k : 100;
      const bx1 = o.bounds ? o.bounds.x1 - 8 * k : 1820;
      const x = Math.max(bx0, Math.min(bx1 - w, c.u - w / 2));
      const y = c.v - h - 10;
      const fade = Math.max(0, Math.min(1, (b.end - f.t) / 0.3, (f.t - n.at) / 0.2));
      ctx.globalAlpha = fade;
      ctx.fillStyle = colour(d.side);
      ctx.beginPath();
      ctx.roundRect(x, y, w, h, h / 2);
      ctx.fill();
      ctx.fillStyle = P.white;
      ctx.textBaseline = "middle";
      ctx.fillText(text, x + 12 * k, y + h / 2 + 1);
      ctx.globalAlpha = 1;
    }
  }
}

/** For checks: how far the ball is from the named player at an instant (metres). */
export const ballGap = (f: Frame, id: string) => {
  const d = f.dots.find((x) => x.id === id);
  return d && f.ball ? dist(d, f.ball) : Infinity;
};
