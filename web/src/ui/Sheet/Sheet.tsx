import { X } from "lucide-react";
import { useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
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

  // Closing plays its motion before the sheet leaves: `shown` outlives `open` until the
  // panel's animation ends (or at once, when nothing animates).
  const [shown, setShown] = useState(open);
  if (open && !shown) setShown(true);
  const closing = shown && !open;

  useEffect(() => {
    // preventScroll: the panel starts below the frame (it rises in), and a plain focus() would
    // scroll the whole screen up to reveal it.
    if (open) panel.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    if (closing && !panel.current?.getAnimations().length) setShown(false);
  }, [closing]);

  if (!shown) return null;

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
    <div
      className={styles.root}
      data-state={open ? "open" : "closed"}
      data-detent={detent}
      aria-hidden={closing || undefined}
      onAnimationEnd={(e) => closing && e.target === panel.current && setShown(false)}
    >
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
