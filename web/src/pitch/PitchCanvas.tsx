// The pitch layer on the plate: a 1920 × 1080 canvas drawn by requestAnimationFrame (React never
// re-renders per frame), plus two calm DOM labels: the honesty note, always, and "Replay 74'"
// while a replay runs. On the plate only: the transparent OBS page never shows it.
//
// For the lab and the filming script: `at` freezes one instant, and window.__pitchSeek(t) draws
// any instant on demand (motion is then driven from outside, frame by frame).

import { useEffect, useRef, useState } from "react";
import { useLabels } from "../ui/labels";
import type { Shot } from "./director";
import { drawFrame, readPalette, type Look, type Palette } from "./render";
import styles from "./pitch.module.css";

export interface PitchCanvasProps {
  /** The picture at display time t (seconds, on the performance clock unless `at`/seek). */
  shot: (t: number) => Shot;
  look: Look;
  focus?: string | null;
  /** Freeze at this display time (a still). */
  at?: number;
  /** Display time zero, in performance.now() seconds; default: when mounted. */
  epoch?: number;
}

declare global {
  interface Window {
    __pitchSeek?: (t: number) => void;
  }
}

export function PitchCanvas({ shot, look, focus, at, epoch }: PitchCanvasProps) {
  const labels = useLabels();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [replayMinute, setReplayMinute] = useState<number | null>(null);
  const latest = useRef({ shot, look, focus });
  latest.current = { shot, look, focus };

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

    const paint = (t: number) => {
      const { shot: s, look: l, focus: f } = latest.current;
      const sh = s(t);
      drawFrame(ctx, sh.frame, { look: l, palette, focus: f });
      el.style.opacity = String(sh.opacity);
      const r = sh.replayOf ? sh.replayOf.minute : null;
      if (r !== lastReplay) {
        lastReplay = r;
        setReplayMinute(r);
      }
      if (++drawn % 15 === 0 || drawn < 3) el.dataset.frames = String(drawn);
    };

    if (at !== undefined) {
      paint(at);
    } else {
      const tick = () => {
        paint(performance.now() / 1000 - t0);
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }
    window.__pitchSeek = (t: number) => {
      cancelAnimationFrame(raf);
      palette = readPalette(el);
      paint(t);
    };
    return () => {
      cancelAnimationFrame(raf);
      delete window.__pitchSeek;
    };
  }, [at, epoch]);

  return (
    <div className={styles.pitch} data-pitch>
      <canvas ref={canvas} className={styles.canvas} width={1920} height={1080} aria-hidden="true" />
      <div className={styles.labels}>
        <div className={styles.note}>{labels.pitchNote}</div>
        {replayMinute !== null && (
          <div className={styles.replay}>
            {labels.replay} {replayMinute}′
          </div>
        )}
      </div>
    </div>
  );
}
