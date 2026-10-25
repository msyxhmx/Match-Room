// The shape every `<Component>.lab.tsx` exports. The lab (lab.html, dev only) collects them with
// import.meta.glob, so a builder adds states without touching a shared registry.

import type { ReactNode } from "react";
import type { Language } from "../types/live";

export type Canvas = "video" | "phone";

export interface LabState {
  /** kebab-case, unique within the component. The shot id is `<Component>--<name>--<canvas>`. */
  name: string;
  /** One line: what this state proves, e.g. "S3: goal against your team". */
  note: string;
  render: (canvas: Canvas) => ReactNode;
  /** Default: both. */
  canvases?: Canvas[];
  /**
   * Where the component sits in the frame. "center", "top" and "bottom" pad the frame to the
   * safe area (video) or the gutter (phone). "fill" gives the whole frame: the component owns
   * its own margins (sheets, overlays, whole screens).
   */
  place?: "center" | "top" | "bottom" | "fill";
  /** "transparent" draws a checkerboard so you can see what OBS would key out. */
  background?: "ground" | "card" | "transparent" | "plate";
  clubs?: { home: string; away: string; you?: string };
  language?: Language;
  /** Width of the stage inside the frame, as a CSS length. Default: the full safe width. */
  width?: string;
  /** Phone only: a taller frame for a page that scrolls, so one shot holds the whole page. */
  phoneHeight?: number;
}

export interface LabModule {
  component: string;
  /** One line on what the component is for. */
  summary: string;
  states: LabState[];
}
