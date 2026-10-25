import { CloudOff, Info, RefreshCw } from "lucide-react";
import markUrl from "../../assets/brand/mark.svg";
import wordmarkUrl from "../../assets/brand/wordmark.svg";
import type { Team } from "../../types/halftime";
import type { MatchMeta, Profile } from "../../types/live";
import { Pill } from "../Pill/Pill";
import { personaLabel, useLabels } from "../labels";
import styles from "./TopBar.module.css";

export interface TopBarProps {
  meta: MatchMeta;
  profile: Profile;
  team?: Team;
  connection: "live" | "reconnecting" | "offline";
}

export function TopBar({ meta, profile, team, connection }: TopBarProps) {
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
        {following && (
          <span className={styles.following}>
            {labels.following} {following}
          </span>
        )}
        <Pill tone="neutral">{profile.language.toUpperCase()}</Pill>
        <Pill tone="neutral">{personaLabel(labels, profile.persona)}</Pill>
      </div>
      <div className={styles.synthetic}>
        <Pill tone="neutral" icon={Info}>
          {labels.synthetic}
        </Pill>
      </div>
    </header>
  );
}
