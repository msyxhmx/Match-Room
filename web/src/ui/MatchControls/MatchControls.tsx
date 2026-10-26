// The playback controls (25 Oct: "every button on the page, no need to click Space, L or P"):
// play / pause, restart from kick-off, ×1 / ×60. Language and casual / analyst are the top bar's
// buttons. On a phone a bar pinned to the bottom of the screen, in thumb reach; on the video
// frame a compact bar on the pitch (plain visits only: director URLs and ?rec=1 record without
// it, the keys still work).

import { Pause, Play, RotateCcw } from "lucide-react";
import { Icon } from "../Icon/Icon";
import { useLabels } from "../labels";
import styles from "./MatchControls.module.css";

export interface MatchControlsProps {
  playing: boolean;
  /** Full time reached: the main button restarts instead of playing. */
  ended?: boolean;
  speed: number;
  onPlayPause: () => void;
  onRestart: () => void;
  onSpeed: (speed: number) => void;
}

const SPEEDS = [1, 60];

export function MatchControls(p: MatchControlsProps) {
  const labels = useLabels();
  const main = p.ended
    ? { icon: RotateCcw, label: labels.restart, on: p.onRestart }
    : p.playing
      ? { icon: Pause, label: labels.pause, on: p.onPlayPause }
      : { icon: Play, label: labels.play, on: p.onPlayPause };
  return (
    <nav className={styles.bar} aria-label={labels.controls} data-role="match-controls">
      <button type="button" className={styles.main} onClick={main.on} aria-label={main.label}>
        <Icon icon={main.icon} />
      </button>
      {!p.ended && (
        <button type="button" className={styles.button} onClick={p.onRestart} aria-label={labels.restart}>
          <Icon icon={RotateCcw} />
        </button>
      )}
      <div className={styles.segment} role="group" aria-label={labels.speedChoice}>
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            className={styles.segButton}
            aria-pressed={p.speed === s}
            onClick={() => p.onSpeed(s)}
          >
            ×{s}
          </button>
        ))}
      </div>
    </nav>
  );
}

/** A plain visit's first play: one big button on the still kick-off picture (Syahmi's note,
 *  26 Oct), so the viewer reads the match-up before anything moves. */
export function KickOffButton({ onKickOff }: { onKickOff: () => void }) {
  const labels = useLabels();
  return (
    <button type="button" className={styles.kickOff} onClick={onKickOff} data-role="kick-off">
      <Icon icon={Play} />
      {labels.kickOff}
    </button>
  );
}
