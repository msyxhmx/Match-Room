import { X } from "lucide-react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { Icon } from "../Icon/Icon";
import { useLabels } from "../labels";
import styles from "./Sheet.module.css";

export interface SheetProps {
  open: boolean;
  onClose?: () => void;
  title: string;
  detent?: "medium" | "large";
  children: ReactNode;
}

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function Sheet({ open, onClose, title, detent = "medium", children }: SheetProps) {
  const labels = useLabels();
  const panel = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) panel.current?.focus();
  }, [open]);

  if (!open) return null;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onClose?.();
      return;
    }
    if (e.key !== "Tab" || !panel.current) return;
    const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    if (!items.length) return e.preventDefault();
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div className={styles.root} data-state="open" data-detent={detent}>
      <div className={styles.scrim} onClick={onClose} data-role="scrim" />
      <div
        ref={panel}
        className={styles.panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <span className={styles.grabber} aria-hidden="true" />
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>
            {title}
          </h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={labels.close}>
            <Icon icon={X} />
          </button>
        </header>
        <div className={styles.body} tabIndex={0}>
          {children}
        </div>
      </div>
    </div>
  );
}
