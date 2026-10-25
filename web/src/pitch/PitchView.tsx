// The pitch inside a page (the live match screen): the plate cropped to the pitch itself, the
// grey sky and foreground cut away, scaled to whatever box it is given. Inside, the same
// 1920 × 1080 canvas as on the overlay, so the camera, dot sizes and labels are identical.

import { createContext, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import styles from "./pitch.module.css";

/** The plate rows that hold the pitch (goals and touchlines included), in plate pixels. */
export const CROP = { top: 318, bottom: 892 } as const;

/** How much smaller than 1:1 the pitch is shown (PitchCanvas draws marks larger to match). */
export const PitchScale = createContext(1);
const CROP_H = CROP.bottom - CROP.top;

export function PitchView({ children }: { children: ReactNode }) {
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
  return (
    <div ref={box} className={styles.view} style={{ aspectRatio: `1920 / ${CROP_H}` }} data-pitch-view>
      <div className={styles.viewInner} style={{ transform: `scale(${scale}) translateY(${-CROP.top}px)` }}>
        <PitchScale.Provider value={scale}>{children}</PitchScale.Provider>
      </div>
    </div>
  );
}
