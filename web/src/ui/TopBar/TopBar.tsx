import { ChevronsUpDown, CloudOff, FlaskConical, Info, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import markUrl from "../../assets/brand/mark.svg";
import wordmarkUrl from "../../assets/brand/wordmark.svg";
import type { Team } from "../../types/halftime";
import type { MatchMeta, Profile } from "../../types/live";
import { Icon } from "../Icon/Icon";
import { Pill } from "../Pill/Pill";
import { personaLabel, useLabels } from "../labels";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  meta: MatchMeta;
  profile: Profile;
  team?: Team;
  connection: "live" | "reconnecting" | "offline" | "preview";
  /** Tapping the language pill: next language. Without a handler the pill is a plain label. */
  onLanguage?: () => void;
  /** Tapping the persona pill: casual ↔ analyst. */
  onPersona?: () => void;
}

function Switch({ onClick, label, children }: { onClick?: () => void; label: string; children: ReactNode }) {
  if (!onClick) return <Pill tone="neutral">{children}</Pill>;
  return (
    <button type="button" className={styles.switch} onClick={onClick} aria-label={label}>
      <Pill tone="neutral">
        {children}
        {/* Phones: a small up-down chevron says "tap to change" (the video frame stays as filmed). */}
        <span className={styles.hint}>
          <Icon icon={ChevronsUpDown} />
        </span>
      </Pill>
    </button>
  );
}

export function TopBar({ meta, profile, team, connection, onLanguage, onPersona }: TopBarProps) {
  const labels = useLabels();
  const following = [team?.name, profile.player].filter(Boolean).join(" · ");

  return (
    <header className={styles.root} data-connection={connection}>
      <div className={styles.brand}>
        <img className={styles.wordmark} src={wordmarkUrl} alt="Match-Room Live" />
        <img className={styles.mark} src={markUrl} alt="" />
        {meta.scenario_title && <span className={styles.scenario}>{meta.scenario_title}</span>}
      </div>
      <div className={styles.meta}>
        {connection === "reconnecting" && (
          <span role="status">
            <Pill tone="muted" icon={RefreshCw}>
              {labels.reconnecting}
            </Pill>
          </span>
        )}
        {connection === "offline" && (
          <span role="status">
            <Pill tone="muted" icon={CloudOff}>
              {labels.offline}
            </Pill>
          </span>
        )}
        {connection === "preview" && (
          <span role="status">
            <Pill tone="neutral" icon={FlaskConical}>
              {labels.preview}
            </Pill>
          </span>
        )}
        {following && (
          <span className={styles.following}>
            {labels.following} {following}
          </span>
        )}
        <Switch onClick={onLanguage} label={`${labels.changeLanguage}: ${profile.language.toUpperCase()}`}>
          {profile.language.toUpperCase()}
        </Switch>
        <Switch onClick={onPersona} label={`${labels.changeDepth}: ${personaLabel(labels, profile.persona)}`}>
          {personaLabel(labels, profile.persona)}
        </Switch>
      </div>
      <div className={styles.synthetic}>
        <Pill tone="neutral" icon={Info}>
          {labels.synthetic}
        </Pill>
      </div>
    </header>
  );
}
