import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import styles from "./Pill.module.css";

export type PillTone = "live" | "neutral" | "muted" | "positive" | "you";

export interface PillProps {
  tone: PillTone;
  icon?: LucideIcon;
  size?: "caption" | "body";
  children: ReactNode;
}

export function Pill({ tone, icon, size = "caption", children }: PillProps) {
  return (
    <span className={styles.pill} data-tone={tone} data-size={size}>
      {icon && <Icon icon={icon} />}
      {children}
    </span>
  );
}
