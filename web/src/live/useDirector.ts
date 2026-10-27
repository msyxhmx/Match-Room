// Director mode (STORYBOARD §7): every storyboard shot starts from a URL, and hidden keys drive
// the take so nothing is clicked on camera. Nothing on screen reveals the keys.
//
//   ?minute=74      start at a minute (a snapshot), paused unless &play=1
//   ?speed=60       times faster than real time (the ×60 pill shows whenever it's above 1)
//   ?lang=ms  ?persona=analyst  ?team=NGC  ?player=L.%20Quinn  ?match=SCN-comeback
//
//   Space  play / pause        L  next language     P  casual ↔ analyst
//   F      facts sheet         1 3 4 5 6 7 8  jump to that storyboard shot's start (paused)
//
// The keys only change what the URL could already say, so a reload reproduces the frame.

import { useCallback, useEffect, useState } from "react";
import type { Language, Persona, Profile } from "../types/live";

export interface Direction {
  matchId: string;
  profile: Profile;
  minute: number;
  speed: number;
  playing: boolean;
  factsOpen: boolean;
  /** Bumps on every scene jump, so the same scene twice restarts the take. */
  epoch: number;
  /** A director URL (it named a minute, speed or play state) rather than a plain visit. Plain
   *  visits keep a bare address, so the link always opens at kick-off at ×60 behind a Kick off
   *  button, and show the on-page controls; director URLs are for recording and show none on
   *  the video frame. */
  director: boolean;
  /** `?rec=1`: recording, no on-page controls whatever the URL. */
  rec: boolean;
}

export const LANGUAGES: Language[] = ["en", "ms", "es"];

/** Where each storyboard shot starts. Paused, so the take begins on a key press. */
export const SCENES: Record<string, { minute: number; speed: number; note: string }> = {
  "1": { minute: 73, speed: 1, note: "S1: Space, and 74' arrives at real speed: 1–2 → 2–2" },
  "3": { minute: 0, speed: 60, note: "S3: Space plays from kick-off at ×60; the 14' goal against" },
  "4": { minute: 15, speed: 60, note: "S4: F opens the 14' card's facts" },
  "5": { minute: 45, speed: 60, note: "S5: the half-time brief and the agents" },
  "6": { minute: 45, speed: 60, note: "S6: Space plays the second half at ×60" },
  "7": { minute: 74, speed: 60, note: "S7: the equaliser, then L and P" },
  "8": { minute: 90, speed: 60, note: "S8: full time" },
};

function num(v: string | null, fallback: number, lo: number, hi: number): number {
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback;
}

export function readDirection(search: string): Direction {
  const q = new URLSearchParams(search);
  const lang = q.get("lang") as Language | null;
  return {
    matchId: q.get("match") ?? "SCN-comeback",
    profile: {
      language: lang && LANGUAGES.includes(lang) ? lang : "en",
      persona: q.get("persona") === "analyst" ? "analyst" : "casual",
      team: q.has("team") ? q.get("team") || null : "NGC",
      player: q.has("player") ? q.get("player") || null : "L. Quinn",
    },
    minute: num(q.get("minute"), 0, 0, 90),
    speed: num(q.get("speed"), 60, 1, 6000),
    // A plain visit waits on its Kick off button (Syahmi's note, 26 Oct); ?rec=1 plays at once;
    // a director URL with a minute waits for Space.
    playing: q.has("play") ? q.get("play") === "1" : q.get("rec") === "1" && !q.has("minute"),
    factsOpen: q.get("facts") === "1",
    epoch: 0,
    director: q.has("minute") || q.has("speed") || q.has("play"),
    rec: q.get("rec") === "1",
  };
}

function writeUrl(d: Direction) {
  const q = new URLSearchParams(location.search);
  if (d.director) {
    q.set("minute", String(d.minute));
    q.set("speed", String(d.speed));
    q.set("play", d.playing ? "1" : "0");
  }
  // A plain visit keeps a bare address (language and persona only, and only when changed), so a
  // refresh or a copied link opens at kick-off at ×60, waiting on its Kick off button.
  if (d.director || d.profile.language !== "en") q.set("lang", d.profile.language);
  else q.delete("lang");
  if (d.director || d.profile.persona !== "casual") q.set("persona", d.profile.persona);
  else q.delete("persona");
  const s = q.toString();
  history.replaceState(null, "", s ? `${location.pathname}?${s}` : location.pathname);
}

function typing(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement | null;
  return !!t && (t.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(t.tagName));
}

export function useDirector() {
  const [d, setD] = useState<Direction>(() => readDirection(location.search));

  const update = useCallback((change: (d: Direction) => Direction) => setD((prev) => change(prev)), []);

  const nextLanguage = useCallback(
    () =>
      update((x) => ({
        ...x,
        profile: { ...x.profile, language: LANGUAGES[(LANGUAGES.indexOf(x.profile.language) + 1) % LANGUAGES.length] },
      })),
    [update],
  );
  const togglePersona = useCallback(
    () =>
      update((x) => ({
        ...x,
        profile: { ...x.profile, persona: (x.profile.persona === "casual" ? "analyst" : "casual") as Persona },
      })),
    [update],
  );
  /** The web header's menus: pick a language or a depth directly. */
  const setLanguage = useCallback(
    (language: Language) => update((x) => ({ ...x, profile: { ...x.profile, language } })),
    [update],
  );
  const setPersona = useCallback(
    (persona: Persona) => update((x) => ({ ...x, profile: { ...x.profile, persona } })),
    [update],
  );
  const setFacts = useCallback((open: boolean) => update((x) => ({ ...x, factsOpen: open })), [update]);
  // The on-page controls (25 Oct: "every button on the page").
  const togglePlay = useCallback(() => update((x) => ({ ...x, playing: !x.playing })), [update]);
  const restart = useCallback(
    () => update((x) => ({ ...x, minute: 0, playing: true, factsOpen: false, epoch: x.epoch + 1 })),
    [update],
  );
  /** A new speed, carrying on from the minute on screen. */
  const setSpeed = useCallback(
    (speed: number, fromMinute: number) =>
      update((x) => (x.speed === speed ? x : { ...x, speed, minute: fromMinute, epoch: x.epoch + 1 })),
    [update],
  );

  /** Switch to another match: kick-off, paused, following its home side, no player picked.
   *  The URL says so too, so a reload opens the same match. */
  const pick = useCallback(
    (matchId: string, teamId: string) => {
      const q = new URLSearchParams(location.search);
      q.set("match", matchId);
      q.set("team", teamId);
      q.set("player", "");
      history.replaceState(null, "", `${location.pathname}?${q}`);
      update((x) => ({
        ...x,
        matchId,
        profile: { ...x.profile, team: teamId, player: null },
        minute: 0,
        playing: false,
        factsOpen: false,
        epoch: x.epoch + 1,
      }));
    },
    [update],
  );
  /** Stop the clock, e.g. when the page leaves the live view. */
  const pause = useCallback(() => update((x) => (x.playing ? { ...x, playing: false } : x)), [update]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || typing(e)) return;
      const k = e.key.toLowerCase();
      if (k === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        update((x) => ({ ...x, playing: !x.playing }));
      } else if (k === "l") nextLanguage();
      else if (k === "p") togglePersona();
      else if (k === "f") update((x) => ({ ...x, factsOpen: !x.factsOpen }));
      else if (SCENES[k]) {
        const s = SCENES[k];
        update((x) => ({
          ...x, minute: s.minute, speed: s.speed, playing: false, factsOpen: false, epoch: x.epoch + 1,
        }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [update, nextLanguage, togglePersona]);

  useEffect(() => writeUrl(d), [d]);

  return { ...d, nextLanguage, togglePersona, setLanguage, setPersona, setFacts, togglePlay, restart, setSpeed, pick, pause };
}
