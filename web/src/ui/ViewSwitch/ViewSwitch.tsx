import { createContext, useContext } from "react";
import { useLabels } from "../labels";
import styles from "./ViewSwitch.module.css";

export type PageView = "matches" | "live" | "table";
export const PAGE_VIEWS: PageView[] = ["matches", "live", "table"];

export interface ViewSwitchState {
  view: PageView;
  onView: (view: PageView) => void;
}

/** The page puts its view here on a plain visit; the top bar shows the switch when it is set.
 *  Director URLs and ?rec=1 leave it empty, so a recording never shows it. */
export const ViewSwitchContext = createContext<ViewSwitchState | null>(null);
export const useViewSwitch = () => useContext(ViewSwitchContext);

/** Matches / Live / Table, a segmented control for the page header. */
export function ViewSwitch({ view, onView }: ViewSwitchState) {
  const labels = useLabels();
  const names: Record<PageView, string> = { matches: labels.viewMatches, live: labels.viewLive, table: labels.viewTable };
  return (
    <div className={styles.root} role="group" aria-label={labels.viewsLabel}>
      {PAGE_VIEWS.map((v) => (
        <button key={v} type="button" className={styles.segment} aria-pressed={v === view} onClick={() => onView(v)} data-view={v}>
          {names[v]}
        </button>
      ))}
    </div>
  );
}
