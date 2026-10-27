// The web layout's frame: the header (brand, Matches / Live / Table, language, casual / analyst,
// "Synthetic data") and the page under it. On a phone the actions fold into a menu button and the
// three views become a row of pills.

import { ChevronDown, CloudOff, FlaskConical, Globe, Info, RefreshCw, SlidersHorizontal } from "lucide-react";
import type { ReactNode } from "react";
import markUrl from "../../assets/brand/mark.svg";
import type { Language, Persona, Profile } from "../../types/live";
import { Icon, PAGE_VIEWS, useViewSwitch, type PageView } from "../../ui";
import { useLabels } from "../../ui/labels";
import { LANGUAGES } from "../../live/useDirector";
import type { Connection } from "../../live/useMatchFeed";
import styles from "./web.module.css";

export interface WebShellProps {
  profile: Profile;
  connection: Connection;
  onLanguage: (language: Language) => void;
  onPersona: (persona: Persona) => void;
  children: ReactNode;
}

/** Reconnecting, offline or preview: always in sight, on a phone too. */
function ConnectionStatus({ connection }: { connection: Connection }) {
  const labels = useLabels();
  return (
    <>
      {connection === "reconnecting" && (
        <span className={styles.status} role="status">
          <Icon icon={RefreshCw} />
          {labels.reconnecting}
        </span>
      )}
      {connection === "offline" && (
        <span className={styles.status} role="status">
          <Icon icon={CloudOff} />
          {labels.offline}
        </span>
      )}
      {connection === "preview" && (
        <span className={styles.status} role="status">
          <Icon icon={FlaskConical} />
          {labels.preview}
        </span>
      )}
    </>
  );
}

function Actions({ profile, onLanguage, onPersona, id }: Omit<WebShellProps, "children"> & { id: string }) {
  const labels = useLabels();
  return (
    <>
      <label className={styles.selectWrap}>
        <span className="sr-only">{labels.languageMenu}</span>
        <Icon icon={Globe} />
        <select
          id={`${id}-lang`}
          className={styles.select}
          value={profile.language}
          onChange={(e) => onLanguage(e.target.value as Language)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {labels.languageNames[l]}
            </option>
          ))}
        </select>
        <span className={styles.selectChevron}>
          <Icon icon={ChevronDown} />
        </span>
      </label>
      <div className={styles.segment} role="group" aria-label={labels.changeDepth}>
        {(["casual", "analyst"] as Persona[]).map((p) => (
          <button
            key={p}
            type="button"
            className={styles.segmentButton}
            aria-pressed={profile.persona === p}
            onClick={() => onPersona(p)}
          >
            {p === "analyst" ? labels.analyst : labels.casual}
          </button>
        ))}
      </div>
      <span className={styles.synthetic}>
        <Icon icon={Info} />
        {labels.synthetic}
      </span>
    </>
  );
}

export function WebShell(props: WebShellProps) {
  const labels = useLabels();
  const views = useViewSwitch();
  const names: Record<PageView, string> = { matches: labels.viewMatches, live: labels.viewLive, table: labels.viewTable };
  return (
    <div className={styles.page} data-screen="web">
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <a
            className={styles.brand}
            href="?view=matches"
            onClick={(e) => {
              if (!views) return;
              e.preventDefault();
              views.onView("matches");
            }}
          >
            <img src={markUrl} alt="" />
            <span>
              Match-Room <span className={styles.brandLive}>Live</span>
            </span>
          </a>
          {views && (
            <nav className={styles.nav} aria-label={labels.viewsLabel}>
              {PAGE_VIEWS.map((v) => (
                <button
                  key={v}
                  type="button"
                  className={styles.navLink}
                  aria-current={v === views.view ? "page" : undefined}
                  onClick={() => views.onView(v)}
                  data-view={v}
                >
                  {names[v]}
                </button>
              ))}
            </nav>
          )}
          {props.connection !== "live" && (
            <div className={styles.statusSlot}>
              <ConnectionStatus connection={props.connection} />
            </div>
          )}
          <div className={`${styles.actions} ${styles.actionsWide}`}>
            <Actions {...props} id="wide" />
          </div>
          <details className={styles.menu}>
            <summary className={styles.menuButton} aria-label={`${labels.languageMenu} · ${labels.changeDepth}`}>
              <Icon icon={SlidersHorizontal} />
            </summary>
            <div className={styles.menuPanel}>
              <Actions {...props} id="narrow" />
            </div>
          </details>
        </div>
      </header>
      {props.children}
    </div>
  );
}
