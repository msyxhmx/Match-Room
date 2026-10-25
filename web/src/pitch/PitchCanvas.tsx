// The pitch layer on the plate: a 1920 × 1080 canvas drawn by requestAnimationFrame (React never
// re-renders per frame), plus calm DOM labels: the honesty note, always; "Analyst view" while
// the analyst lines are on; "Replay 74′" while a replay runs. On the plate only: the
// transparent OBS page never shows it.
//
// For the lab and the filming script: `at` freezes one instant, and window.__pitchSeek(t) draws
// any instant on demand (motion is then driven from outside, frame by frame).

import { useEffect, useRef, useState } from "react";
import { useLabels } from "../ui/labels";
import type { Shot } from "./director";
import { drawFrame, readPalette, type Palette } from "./render";
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
}

/** The analyst lines draw in and out over this long (DESIGN §9.6: 200–350 ms). */
const LINES_FADE = 0.3;

declare global {
  interface Window {
    __pitchSeek?: (t: number) => void;
  }
}

export function PitchCanvas({ shot, analyst, focus, at, epoch, reduced }: PitchCanvasProps) {
  const labels = useLabels();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [replayMinute, setReplayMinute] = useState<number | null>(null);
  const latest = useRef({ shot, analyst, focus, reduced });
  latest.current = { shot, analyst, focus, reduced };

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

    const paint = (t: number, animate: boolean) => {
      const { shot: s, analyst: a, focus: f, reduced: r } = latest.current;
      const target = a ? 1 : 0;
      if (!animate || r || lastT === null) lines = target;
      else lines += Math.sign(target - lines) * Math.min(Math.abs(target - lines), Math.max(0, t - lastT) / LINES_FADE);
      lastT = t;
      const sh = s(t);
      drawFrame(ctx, sh.frame, { analyst: lines, palette, focus: f });
      el.style.opacity = r ? "1" : String(sh.opacity);
      const rm = sh.replayOf ? sh.replayOf.minute : null;
      if (rm !== lastReplay) {
        lastReplay = rm;
        setReplayMinute(rm);
      }
      if (++drawn % 15 === 0 || drawn < 3) el.dataset.frames = String(drawn);
    };

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
      delete window.__pitchSeek;
    };
  }, [at, epoch]);

  // A still repaints when the switch changes (the lab, a paused page with no clock running).
  useEffect(() => {
    if (at !== undefined) window.__pitchSeek?.(at);
  }, [analyst, at]);

  return (
    <div className={styles.pitch} data-pitch data-analyst={analyst ? "true" : "false"}>
      <canvas ref={canvas} className={styles.canvas} width={1920} height={1080} aria-hidden="true" />
      <div className={styles.labels}>
        <div className={styles.note}>{labels.pitchNote}</div>
        {analyst && <div className={styles.chip}>{labels.analystView}</div>}
        {replayMinute !== null && (
          <div className={styles.replay}>
            {labels.replay} {replayMinute}′
          </div>
        )}
      </div>
    </div>
  );
}
