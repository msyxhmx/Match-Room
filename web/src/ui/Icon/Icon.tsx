import type { LucideIcon } from "lucide-react";
import styles from "./Icon.module.css";

export interface IconProps {
  icon: LucideIcon;
  /** Without a label the icon is decorative (aria-hidden). */
  label?: string;
}

export function Icon({ icon: Glyph, label }: IconProps) {
  return (
    <Glyph
      className={styles.icon}
      size="1em"
      strokeWidth={2.25}
      aria-hidden={label ? undefined : true}
      role={label ? "img" : undefined}
      aria-label={label}
    />
  );
}
