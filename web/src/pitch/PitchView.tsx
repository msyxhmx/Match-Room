// The pitch inside a page (the live match screen): the plate cropped to the pitch itself, the
// grey sky and foreground cut away, scaled to whatever box it is given. Inside, the same
// 1920 × 1080 canvas as on the overlay, so the camera, dot sizes and labels are identical.

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLabels } from "../ui/labels";
import styles from "./pitch.module.css";

/** Below this scale the in-picture labels would be unreadable: show the note as a caption. */
const SMALL = 0.45;

/** The plate rows that hold the pitch (goals and touchlines included), in plate pixels. */
export const CROP = { top: 328, bottom: 882 } as const;

/** How much smaller than 1:1 the pitch is shown (PitchCanvas draws marks larger to match). */
export const PitchScale = createContext(1);
const CROP_H = CROP.bottom - CROP.top;

export function PitchView({ children }: { children: ReactNode }) {
  const labels = useLabels();
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const fit = () => setScale(el.clientWidth / 1920);
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const small = scale < SMALL;
  return (
    <div>
      <div
        ref={box}
        className={styles.view}
        style={{ aspectRatio: `1920 / ${CROP_H}` }}
        data-pitch-view
        data-small={small ? "true" : undefined}
      >
        <div className={styles.viewInner} style={{ transform: `scale(${scale}) translateY(${-CROP.top}px)` }}>
          <PitchScale.Provider value={scale}>{children}</PitchScale.Provider>
        </div>
      </div>
      {small && <p className={styles.caption}>{labels.pitchNote}</p>}
    </div>
  );
}
