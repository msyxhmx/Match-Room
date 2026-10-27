// The data for the Matches and Table views. Both have a saved fallback, so the page works with
// no API: the picker offers the comeback alone, the table reads the saved season.

import { useEffect, useState } from "react";
import { api, liveApi } from "../api";
import { clubColours } from "../clubColours";
import seasonMock from "../mock/live/season.json";
import type { Team } from "../types/halftime";
import type { Profile, SeasonReport } from "../types/live";
import { PREVIEW } from "./useMatchFeed";

/** The one match the saved data can play without the server. */
export const SAVED_MATCH = "SCN-comeback";

export interface PickerMatch {
  id: string;
  home: Team;
  away: Team;
  /** Scripted storylines only (the engine's own words). */
  title?: string;
  description?: string;
  scripted: boolean;
  playable: boolean;
}

const team = (id: string): Team => ({ id, name: clubColours(id).name, short_name: id });

/** The comeback built from club names alone, for when no list can load. */
const SAVED_FALLBACK: PickerMatch = {
  id: SAVED_MATCH,
  home: team("NGC"),
  away: team("KST"),
  scripted: true,
  playable: true,
};

export interface MatchList {
  /** Scripted storylines first, then the organic matches. */
  matches: PickerMatch[];
  /** The organic matches are still on their way. */
  moreLoading: boolean;
}

/** The scripted cards show as soon as /api/scenarios answers; the organic matches follow when
 *  /api/matches does. Playable: whatever the server listed; with no server, only the saved
 *  comeback. */
export function useMatchList(): MatchList {
  const [scripted, setScripted] = useState<PickerMatch[]>([SAVED_FALLBACK]);
  const [more, setMore] = useState<PickerMatch[]>([]);
  const [moreLoading, setMoreLoading] = useState(!PREVIEW);
  useEffect(() => {
    if (PREVIEW) return;
    let live = true;
    liveApi
      .scenarios()
      .then((sc) => {
        if (!live) return;
        const cards: PickerMatch[] = sc.map((s) => ({
          id: s.match_id, home: s.home, away: s.away, title: s.title, description: s.description,
          scripted: true, playable: true,
        }));
        if (!cards.some((m) => m.id === SAVED_MATCH)) cards.unshift(SAVED_FALLBACK);
        setScripted(cards);
      })
      .catch(() => live && setScripted([SAVED_FALLBACK]));
    api
      .matches()
      .then((ms) => {
        if (!live) return;
        setMore(
          ms
            .filter((m) => m.scenario === null)
            .map((m) => ({ id: m.match_id, home: m.home, away: m.away, scripted: false, playable: true })),
        );
      })
      .catch(() => live && setMore([]))
      .finally(() => live && setMoreLoading(false));
    return () => {
      live = false;
    };
  }, []);
  return { matches: [...scripted, ...more], moreLoading };
}

/** The season table for this viewer, or the saved one when the call fails (or in preview). */
export function useSeason(profile: Profile): SeasonReport {
  const [report, setReport] = useState<SeasonReport>(seasonMock as unknown as SeasonReport);
  useEffect(() => {
    if (PREVIEW) return;
    let live = true;
    liveApi
      .season({ persona: profile.persona, lang: profile.language, team: profile.team })
      .then((r) => live && setReport(r))
      .catch(() => live && setReport(seasonMock as unknown as SeasonReport));
    return () => {
      live = false;
    };
  }, [profile.persona, profile.language, profile.team]);
  return report;
}
