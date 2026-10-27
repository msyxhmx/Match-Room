// The pitch inside a page (the live match screen). Two ways, by the room it gets:
//   - wide (desktop, the video frame, a phone held sideways): the plate cropped to the pitch,
//     the whole pitch in view, the same 1920 × 1080 canvas as the overlay scaled to the box
//   - narrow (a phone held upright, under FOLLOW_UNDER px): a 4:3 box and the follow camera
//     (camera.ts), the canvas drawn at the screen's own pixels: sharper, and far cheaper
// Under reduced motion it never follows (no panning): the whole pitch, cropped.
// Labels that don't fit in a small picture (the honesty note, "Replay 74′", "Analyst view") go
// in a caption row under it.

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./pitch.module.css";

/** The plate rows that hold the pitch (goals and touchlines included), in plate pixels. */
export const CROP = { top: 328, bottom: 882 } as const;
const CROP_H = CROP.bottom - CROP.top;
/** A box narrower than this (CSS px) follows the ball. */
export const FOLLOW_UNDER = 600;
/** Below this scale the in-picture labels would be unreadable: they go in the caption row. */
const SMALL = 0.45;

export interface PitchViewport {
  /** CSS px per plate px when the whole crop is shown (the wide way). */
  scale: number;
  /** Narrow: the follow camera; PitchCanvas sizes its canvas to the box and draws the plate. */
  follow: boolean;
  /** Where labels go when they don't fit in the picture (null: in the picture). */
  caption: HTMLElement | null;
  /** Multiplies the players' and ball's drawn size (1: as on the video frame). */
  marks: number;
}

export const PitchScale = createContext<PitchViewport>({ scale: 1, follow: false, caption: null, marks: 1 });

/** `marks`: the players and ball a little smaller or larger than the frame's (the web layout's
 *  card draws them at 0.8: at its size the legibility boost made them read too big). */
export function PitchView({ children, reduced, marks = 1 }: { children: ReactNode; reduced?: boolean; marks?: number }) {
  const outer = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(1920);
  const [caption, setCaption] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const el = outer.current;
    if (!el) return;
    const fit = () => setWidth(el.clientWidth);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const follow = width < FOLLOW_UNDER && !reduced;
  const scale = width / 1920;
  const small = follow || scale < SMALL;
  const ctx: PitchViewport = { scale, follow, caption: small ? caption : null, marks };

  return (
    <div ref={outer}>
      {follow ? (
        <div className={styles.view} style={{ aspectRatio: "4 / 3" }} data-pitch-view data-follow="true">
          <PitchScale.Provider value={ctx}>{children}</PitchScale.Provider>
        </div>
      ) : (
        <div
          className={styles.view}
          style={{ aspectRatio: `1920 / ${CROP_H}` }}
          data-pitch-view
          data-small={small ? "true" : undefined}
        >
          <div className={styles.viewInner} style={{ transform: `scale(${scale}) translateY(${-CROP.top}px)` }}>
            <PitchScale.Provider value={ctx}>{children}</PitchScale.Provider>
          </div>
        </div>
      )}
      {small && <div ref={setCaption} className={styles.captionRow} />}
    </div>
  );
}
