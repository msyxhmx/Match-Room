// The Matches view: the scripted storylines as cards, the organic matches as compact rows.
// Pure: the page passes the list and hears the pick.

import type { PickerMatch } from "../live/useBrowse";
import { Crest } from "../ui";
import { useLabels, type Labels } from "../ui/labels";
import styles from "./browse.module.css";

export interface MatchPickerProps {
  matches: PickerMatch[];
  /** The match on the live page now. */
  currentId: string;
  onPick: (match: PickerMatch) => void;
}

const titleOf = (m: PickerMatch, labels: Labels) => m.title ?? labels.comebackTitle;
const blurbOf = (m: PickerMatch, labels: Labels) => m.description ?? labels.comebackBlurb;

export function MatchPicker({ matches, currentId, onPick }: MatchPickerProps) {
  const labels = useLabels();
  const scripted = matches.filter((m) => m.scripted);
  const more = matches.filter((m) => !m.scripted);
  return (
    <div className={styles.picker} data-screen="matches">
      <h2 className={styles.heading}>{labels.pickMatch}</h2>
      <ul className={styles.cards}>
        {scripted.map((m) => {
          const names = `${m.home.name} ${labels.versus} ${m.away.name}`;
          return (
            <li key={m.id}>
              <button
                type="button"
                className={styles.card}
                data-match={m.id}
                aria-current={m.id === currentId ? "true" : undefined}
                disabled={!m.playable}
                onClick={() => onPick(m)}
              >
                <span className={styles.crests}>
                  <Crest teamId={m.home.id} size="full" name={m.home.name} />
                  <Crest teamId={m.away.id} size="full" name={m.away.name} />
                </span>
                <span className={styles.tag}>{m.playable && m.id === currentId ? labels.nowShowing : labels.scriptedStoryline}</span>
                <span className={styles.title}>{titleOf(m, labels)}</span>
                <span className={styles.names}>{names}</span>
                <span className={styles.blurb}>{blurbOf(m, labels)}</span>
                {!m.playable && <span className={styles.tag}>{labels.needsServer}</span>}
              </button>
            </li>
          );
        })}
      </ul>
      {more.length > 0 && (
        <>
          <h2 className={styles.heading}>{labels.moreMatches}</h2>
          <ul className={styles.rows}>
            {more.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  className={styles.row}
                  data-match={m.id}
                  aria-current={m.id === currentId ? "true" : undefined}
                  disabled={!m.playable}
                  onClick={() => onPick(m)}
                >
                  <Crest teamId={m.home.id} size="full" />
                  <span className={styles.rowNames}>
                    {m.home.name} {labels.versus} {m.away.name}
                  </span>
                  <Crest teamId={m.away.id} size="full" />
                  {!m.playable && <span className={styles.tag}>{labels.needsServer}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
