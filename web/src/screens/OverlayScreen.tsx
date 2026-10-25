// The broadcast page (S7, /overlay): one graphic at a time over a transparent background for
// OBS, or over the pitch plate for the video (?plate=1). Never several graphics at once
// (DESIGN §9.7). Between graphics the score bug stays up on its own.

import type { OverlayMessage } from "../types/live";
import { OverlayGraphic, ScoreBug } from "../ui";
import { formatScore } from "../ui/format";
import type { MatchView } from "../live/feed";
import styles from "./screens.module.css";

export interface OverlayScreenProps {
  view: MatchView;
  message: OverlayMessage | null;
  plate?: boolean;
}

/** Lower priority number = more important (alert is 1). */
export function moreImportant(a: OverlayMessage, b: OverlayMessage): boolean {
  return a.priority < b.priority || (a.priority === b.priority && a.seq > b.seq);
}

/** The graphic for a frozen minute: the most important one that started in it, if any. */
export function overlayAt(overlays: OverlayMessage[], minute: number): OverlayMessage | null {
  let best: OverlayMessage | null = null;
  for (const o of overlays) if (o.minute === minute && (!best || moreImportant(o, best))) best = o;
  return best;
}

export function OverlayScreen({ view, message, plate }: OverlayScreenProps) {
  return (
    <div className={styles.overlay} data-plate={plate ? "true" : "false"} data-screen="overlay">
      {message ? (
        <OverlayGraphic key={message.seq} message={message} home={view.home} away={view.away} />
      ) : (
        <div className={styles.bugOnly}>
          <ScoreBug home={view.home} away={view.away} score={formatScore(view.score)} clock={view.clock} />
        </div>
      )}
    </div>
  );
}
