// The Matches view on the web layout: what the app does in one line, the match on now, three
// features, the scripted storylines, the other matches and a look at the table.

import { ShieldCheck, TrendingUp, Zap, type LucideIcon } from "lucide-react";
import type { PickerMatch } from "../../live/useBrowse";
import type { LiveCard, Period, Score, SeasonReport } from "../../types/live";
import { Crest, Icon } from "../../ui";
import { cardMinute, formatMinute, keepScores } from "../../ui/format";
import { useLabels } from "../../ui/labels";
import { Badge, TypeIcon } from "./bits";
import styles from "./web.module.css";

/** Where the open match is, for the "Now showing" card. */
export interface NowShowing {
  matchId: string;
  score: Score;
  minute: number;
  period: Period;
  latest: LiveCard | null;
}

export interface WebMatchesProps {
  matches: PickerMatch[];
  moreLoading: boolean;
  currentId: string;
  now: NowShowing | null;
  season: SeasonReport;
  team: string | null;
  onPick: (m: PickerMatch) => void;
  onTable: () => void;
}

const FEATURES: [LucideIcon, "featureMoments" | "featureControl" | "featureStory", boolean][] = [
  [Zap, "featureMoments", false],
  [TrendingUp, "featureControl", false],
  [ShieldCheck, "featureStory", true],
];

export function WebMatches({ matches, moreLoading, currentId, now, season, team, onPick, onTable }: WebMatchesProps) {
  const labels = useLabels();
  const scripted = matches.filter((m) => m.scripted);
  const more = matches.filter((m) => !m.scripted);
  const current = matches.find((m) => m.id === currentId) ?? scripted[0];
  const title = (m: PickerMatch) => m.title ?? (m.id === "SCN-comeback" ? labels.comebackTitle : `${m.home.name} ${labels.versus} ${m.away.name}`);
  const blurb = (m: PickerMatch) => m.description ?? (m.id === "SCN-comeback" ? labels.comebackBlurb : "");
  const live = now && now.matchId === current?.id ? now : null;
  const started = !!live && live.minute > 0;

  const rows = season.table.map((r, i) => ({ r, pos: i + 1 }));
  const shown = rows.slice(0, 5);
  const mine = rows.find((x) => x.r.team.id === team);
  if (mine && mine.pos > 5) shown.push(mine);

  return (
    <main className={styles.main} data-screen="matches">
      <section className={styles.hero}>
        <div className={styles.heroText}>
          <h1 className={styles.heroTitle}>{labels.heroTitle}</h1>
          <p className={styles.heroLead}>{labels.heroLead}</p>
          <div className={styles.heroActions}>
            {current && (
              <button type="button" className={styles.btnPrimary} onClick={() => onPick(current)}>
                {started ? labels.continueWatching : labels.watchMatch(title(current))}
              </button>
            )}
            <a className={styles.btnSecondary} href="#how">
              {labels.howItWorks}
            </a>
          </div>
        </div>
        {current && (
          <button type="button" className={styles.nowCard} onClick={() => onPick(current)} data-match={current.id}>
            <span className={styles.nowTop}>
              <span className={styles.eyebrow}>
                {labels.nowShowing} · {title(current)}
              </span>
              {live && live.period === "FT" ? (
                <Badge tone="neutral">{labels.fullTimeLong}</Badge>
              ) : live && live.period === "HT" ? (
                <Badge tone="neutral">{labels.halfTimeLong}</Badge>
              ) : started ? (
                <Badge tone="live" dot>
                  {labels.live} · {formatMinute(live.minute, live.period)}
                </Badge>
              ) : (
                <Badge tone="neutral">{labels.kickOff}</Badge>
              )}
            </span>
            {[current.home, current.away].map((t, i) => (
              <span key={t.id} className={styles.nowTeam}>
                <Crest teamId={t.id} size="full" />
                <span>{t.name}</span>
                {started && <span className={styles.nowScore}>{i === 0 ? live.score.home : live.score.away}</span>}
              </span>
            ))}
            {live?.latest && (
              <span className={styles.nowLatest} data-side={live.latest.side ?? undefined}>
                <TypeIcon card={live.latest} small />
                <span>
                  <b>{cardMinute(live.latest)}</b> {keepScores(live.latest.headline)}
                </span>
              </span>
            )}
            <span className={styles.nowCta}>{started ? labels.continueWatching : labels.watch} →</span>
          </button>
        )}
      </section>

      <section id="how" aria-label={labels.howItWorks} className={styles.features}>
        {FEATURES.map(([icon, key, checked]) => (
          <div key={key} className={styles.feature}>
            <span className={styles.featureIcon} data-tone={checked ? "checked" : undefined}>
              <Icon icon={icon} />
            </span>
            <div>
              <div className={styles.featureTitle}>{labels[`${key}Title`]}</div>
              <div className={styles.featureBody}>{labels[`${key}Body`]}</div>
            </div>
          </div>
        ))}
      </section>

      <section aria-labelledby="storylines-h">
        <div className={styles.sectionHead}>
          <h2 id="storylines-h" className={styles.sectionTitle}>
            {labels.storylines}
          </h2>
          <span className={styles.cardLead}>{labels.storylinesLead}</span>
        </div>
        <div className={styles.storyGrid}>
          {scripted.map((m) => (
            <button
              key={m.id}
              type="button"
              className={styles.storyCard}
              aria-current={m.id === currentId ? "true" : undefined}
              disabled={!m.playable}
              onClick={() => onPick(m)}
              data-match={m.id}
            >
              <span className={styles.storyTop}>
                <span className={styles.crests}>
                  <Crest teamId={m.home.id} size="full" name={m.home.name} />
                  <Crest teamId={m.away.id} size="full" name={m.away.name} />
                </span>
                {m.id === currentId && (
                  <Badge tone="live" dot>
                    {labels.nowShowing}
                  </Badge>
                )}
              </span>
              <span>
                <span className={styles.storyTitle}>{title(m)}</span>
                <span className={styles.storyTeams} style={{ display: "block" }}>
                  {m.home.name} {labels.versus} {m.away.name}
                </span>
              </span>
              <span className={styles.storyBlurb}>{blurb(m)}</span>
              <span className={styles.storyCta}>{m.playable ? `${m.id === currentId && started ? labels.continueWatching : labels.watch} →` : labels.needsServer}</span>
            </button>
          ))}
        </div>
      </section>

      <div className={styles.columns}>
        <section className={`${styles.card} ${styles.colMain}`} aria-labelledby="more-h" style={{ gap: 0 }}>
          <h2 id="more-h" className={styles.cardTitle}>
            {labels.moreMatches}
          </h2>
          {more.length === 0 && moreLoading && (
            <p className={styles.empty} role="status" aria-busy="true">
              {labels.loadingMatches}
            </p>
          )}
          {more.length === 0 && !moreLoading && <p className={styles.empty}>{labels.needsServer}</p>}
          <div className={styles.moreGrid}>
            {more.map((m) => (
              <button key={m.id} type="button" className={styles.moreRow} disabled={!m.playable} onClick={() => onPick(m)} data-match={m.id}>
                <span className={styles.moreTeams}>
                  {[m.home, m.away].map((t) => (
                    <span key={t.id}>
                      <Crest teamId={t.id} size="full" />
                      {t.name}
                    </span>
                  ))}
                </span>
                <span className={styles.moreCta}>{labels.watch} →</span>
              </button>
            ))}
          </div>
        </section>

        <section className={`${styles.card} ${styles.colSide}`} aria-labelledby="mini-h" style={{ gap: 0 }}>
          <div className={styles.cardHead}>
            <h2 id="mini-h" className={styles.cardTitle}>
              {labels.seasonTable}
            </h2>
            <button type="button" className={styles.storyCta} onClick={onTable}>
              {labels.fullTable} →
            </button>
          </div>
          <div className={styles.miniRow} data-head>
            <span>#</span>
            <span>{labels.club}</span>
            <span>{labels.tableHead.p}</span>
            <span>{labels.tableHead.pts}</span>
          </div>
          {shown.map(({ r, pos }) => (
            <div key={r.team.id} className={styles.miniRow} data-you={r.team.id === team || undefined}>
              <span>{pos}</span>
              <span className={styles.club}>
                <Crest teamId={r.team.id} size="full" />
                {r.team.name}
              </span>
              <span>{r.played}</span>
              <span>{r.points}</span>
            </div>
          ))}
        </section>
      </div>

      <p className={styles.footer}>{labels.footerNote}</p>
    </main>
  );
}
