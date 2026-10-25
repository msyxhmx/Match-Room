import type { CSSProperties } from "react";
import styles from "./Crest.module.css";

const files = import.meta.glob("../../assets/crests/*.svg", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

function urlFor(teamId: string, size: "full" | "badge"): string | undefined {
  const file = size === "badge" ? `${teamId}-badge` : teamId;
  return files[`../../assets/crests/${file}.svg`];
}

export interface CrestProps {
  teamId: string;
  size: "full" | "badge";
  /** Omit when the team name sits next to the crest (decorative). */
  name?: string;
  /** Overrides the parent's --crest-size. Lab use only. */
  style?: CSSProperties;
}

export function Crest({ teamId, size, name, style }: CrestProps) {
  const src = urlFor(teamId, size);
  if (!src) {
    return (
      <span className={styles.missing} data-size={size} style={style} role={name ? "img" : undefined} aria-label={name} aria-hidden={name ? undefined : true}>
        {teamId.charAt(0)}
      </span>
    );
  }
  return <img className={styles.crest} data-size={size} src={src} alt={name ?? ""} style={style} />;
}
