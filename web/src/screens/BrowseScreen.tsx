// The frame for the Matches and Table views: the top bar, then the view, which scrolls.

import type { ReactNode } from "react";
import styles from "./browse.module.css";

export function BrowseScreen({ top, children }: { top: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.screen} data-screen="browse">
      {top}
      <div className={styles.body}>{children}</div>
    </div>
  );
}
