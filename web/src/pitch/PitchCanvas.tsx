// The pitch layer: a canvas drawn by requestAnimationFrame (React never re-renders per frame),
// plus calm DOM labels: the honesty note, always; "Analyst view" while the analyst lines are on;
// "Replay 74′" while a replay runs. On the overlay plate and in a page (PitchView).
//
//   - The overlay, and a wide page: a 1920 × 1080 canvas in plate pixels, scaled by CSS.
//   - A narrow page (PitchView `follow`): the canvas at the box's own device pixels, the plate and
//     the dots drawn through the follow camera (camera.ts); the labels go under the picture.
//
// For the lab and the filming script: `at` freezes one instant, and window.__pitchSeek(t) draws
// any instant on demand (motion is then driven from outside, frame by frame).

import { useContext, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLabels } from "../ui/labels";
import { cameraAt, FOLLOW_SCALE } from "./camera";
import type { Shot } from "./director";
import { PitchScale } from "./PitchView";
import { drawFrame, readPalette, type GhostStyle, type Palette } from "./render";
import styles from "./pitch.module.css";

export interface PitchCanvasProps {
  /** The picture at display time t (seconds since `epoch`, unless `at`/seek). */
  shot: (t: number) => Shot;
  /** The analyst layer (each team's units joined up). Fades in and out over LINES_FADE. */
  analyst: boolean;
  focus?: string | null;
  /** Freeze at this display time (a still). */
  at?: number;
  /** Display time zero, in performance.now() seconds; default: when mounted. */
  epoch?: number;
  /** Reduced motion: no fades (the shot function already steps the positions). */
  reduced?: boolean;
  /** How the illustrative ghost ball is drawn (continuous play). */
  ghost?: GhostStyle;
}

/** The analyst lines draw in and out over this long (DESIGN §9.6: 200–350 ms). */
const LINES_FADE = 0.3;

declare global {
  interface Window {
    __pitchSeek?: (t: number) => void;
  }
}

let plateImage: HTMLImageElement | null = null;
function plate(onLoad: () => void): HTMLImageElement {
  if (!plateImage) {
    plateImage = new Image();
    plateImage.src = "/plates/pitch.png";
  }
  if (!plateImage.complete) plateImage.addEventListener("load", onLoad, { once: true });
  return plateImage;
}

export function PitchCanvas({ shot, analyst, focus, at, epoch, reduced, ghost }: PitchCanvasProps) {
  const labels = useLabels();
  const view = useContext(PitchScale);
  const follow = view.follow;
  // Shown smaller inside a page: marks and labels drawn larger to keep their on-screen size.
  const boost = follow
    ? Math.min(1.9, Math.max(1, 0.6 / FOLLOW_SCALE))
    : Math.min(1.9, Math.max(1, 0.92 / view.scale));
  const canvas = useRef<HTMLCanvasElement>(null);
  const [replayMinute, setReplayMinute] = useState<number | null>(null);
  const latest = useRef({ shot, analyst, focus, reduced, ghost, boost, follow });
  latest.current = { shot, analyst, focus, reduced, ghost, boost, follow };

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d");
    if (!ctx) return;
    let palette: Palette = readPalette(el);
    const t0 = epoch ?? performance.now() / 1000;
    let raf = 0;
    let drawn = 0;
    let lastReplay: number | null = null;
    let lines = latest.current.analyst ? 1 : 0;
    let lastT: number | null = null;
    let lastPainted = at ?? 0;

    const paint = (t: number, animate: boolean) => {
      lastPainted = t;
      const { shot: s, analyst: a, focus: f, reduced: r, ghost: g, boost: k, follow: fol } = latest.current;
      const target = a ? 1 : 0;
      if (!animate || r || lastT === null) lines = target;
      else lines += Math.sign(target - lines) * Math.min(Math.abs(target - lines), Math.max(0, t - lastT) / LINES_FADE);
      lastT = t;
      const sh = s(t);
      if (fol) {
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, el.width, el.height);
        const cam = cameraAt(s, t, el.clientWidth || 1, el.clientHeight || 1, sh);
        const z = el.width / cam.width;
        ctx.setTransform(z, 0, 0, z, -cam.x0 * z, -cam.y0 * z);
        const img = plate(() => paint(lastPainted, false));
        if (img.complete) ctx.drawImage(img, 0, 0, 1920, 1080);
        drawFrame(ctx, sh.frame, {
          analyst: lines,
          palette,
          focus: f,
          ghost: g,
          boost: k,
          clear: false,
          bounds: { x0: cam.x0, x1: cam.x0 + cam.width },
        });
        ctx.setTransform(1, 0, 0, 1, 0, 0);
      } else {
        drawFrame(ctx, sh.frame, { analyst: lines, palette, focus: f, ghost: g, boost: k });
      }
      el.style.opacity = r ? "1" : String(sh.opacity);
      const rm = sh.replayOf ? sh.replayOf.minute : null;
      if (rm !== lastReplay) {
        lastReplay = rm;
        setReplayMinute(rm);
      }
      if (++drawn % 15 === 0 || drawn < 3) el.dataset.frames = String(drawn);
    };

    // Follow mode: the canvas is the box's own size in device pixels.
    const fit = () => {
      if (!latest.current.follow) return;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.round(el.clientWidth * dpr);
      const h = Math.round(el.clientHeight * dpr);
      if (w && h && (el.width !== w || el.height !== h)) {
        el.width = w;
        el.height = h;
      }
    };
    const ro = new ResizeObserver(() => {
      fit();
      paint(lastPainted, false);
    });
    if (follow) ro.observe(el);
    fit();

    if (at !== undefined) {
      paint(at, false);
    } else {
      const tick = () => {
        paint(performance.now() / 1000 - t0, true);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    window.__pitchSeek = (t: number) => {
      cancelAnimationFrame(raf);
      palette = readPalette(el);
      paint(t, false);
    };
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      delete window.__pitchSeek;
    };
  }, [at, epoch, follow]);

  // A still repaints when the switch changes (the lab, a paused page with no clock running).
  useEffect(() => {
    if (at !== undefined) window.__pitchSeek?.(at);
  }, [analyst, at]);

  const chips = (
    <>
      <div className={styles.note}>{labels.pitchNote}</div>
      {analyst && <div className={styles.chip}>{labels.analystView}</div>}
      {replayMinute !== null && (
        <div className={styles.replay}>
          {labels.replay} {replayMinute}′
        </div>
      )}
    </>
  );

  return (
    <div className={styles.pitch} data-pitch data-analyst={analyst ? "true" : "false"} data-follow={follow ? "true" : undefined}>
      <canvas
        ref={canvas}
        className={styles.canvas}
        width={follow ? undefined : 1920}
        height={follow ? undefined : 1080}
        aria-hidden="true"
      />
      {view.caption ? (
        createPortal(<div className={styles.captionLabels}>{chips}</div>, view.caption)
      ) : (
        <div className={styles.labels} style={boost !== 1 ? { transform: `scale(${boost})` } : undefined}>
          {chips}
        </div>
      )}
    </div>
  );
}
