// The one data seam (handoff §5.5). Screens call useMatchFeed and get a MatchView; they never
// know whether it came from the API, the websocket or the saved match.
//
//   1. Load: a snapshot at the start minute (plus the briefs and overlays it implies).
//   2. Play: the websocket at `speed`, one tick per match minute. Pausing closes it; playing
//      reopens it from the minute we're on.
//   3. Half-time: the stream doesn't stop at 45', so we close it and hold a 15-minute break at
//      the same speed (15 s at ×60), then carry on from 45'.
//   4. Drops: "Reconnecting", retry three times (1, 2, 4 s), then "Offline · showing saved match"
//      and keep playing from the saved match, so nothing on screen breaks.
//   5. A profile switch: tell the stream (it applies from the next minute) and re-fetch the
//      words for what's already on screen, so the card cross-fades rather than re-arrives.

import { useEffect, useRef, useState } from "react";
import { api, liveApi } from "../api";
import type { MatchEvent } from "../types/halftime";
import type { Lineups, LiveSnapshot, MatchBrief, Profile, StreamMessage, StreamTick } from "../types/live";
import { addEvents, applyBrief, applyTick, fromSnapshot, relabel, replay, sameProfile, type MatchView } from "./feed";

export type Connection = "live" | "reconnecting" | "offline" | "preview";

/** Preview build (`npm run build:preview`): play the saved synthetic match, never call the API. */
const PREVIEW = import.meta.env.VITE_PREVIEW === "1";

export interface FeedState {
  view: MatchView | null;
  connection: Connection;
  /** True while the stream (or the saved match) is moving the clock. */
  running: boolean;
}

export interface FeedOptions {
  matchId: string;
  profile: Profile;
  /** Where to start: a snapshot at this minute. */
  minute: number;
  /** Times faster than real time. 60 = one match minute per second. */
  speed: number;
  playing: boolean;
  /** Change it to restart from `minute` even when nothing else changed. */
  epoch?: number;
}

const HALF = 45;
const FULL = 90;
const BREAK_MINUTES = 15;
const RETRIES = [1000, 2000, 4000];

interface Saved {
  start: LiveSnapshot;
  ticks: StreamTick[];
  halftime: MatchBrief;
  fulltime: MatchBrief;
  events: MatchEvent[];
  lineups: Lineups;
}

// One recorded set per language and persona (en-casual is the top-level set). Lazy: a build
// ships them as separate chunks and the page fetches only the ones it shows.
const PROFILE_FILES = import.meta.glob("./saved/profiles/*/*.json", { import: "default" });

async function profileFile<T>(p: Profile, name: string, fallback: () => Promise<{ default: unknown }>): Promise<T> {
  const load = PROFILE_FILES[`./saved/profiles/${p.language}-${p.persona}/${name}`];
  return (load ? await load() : (await fallback()).default) as T;
}

let sharedSaved: Promise<[MatchEvent[], Lineups]> | null = null;

/** The recorded stream (scripts/export_lab_fixtures.py) in this profile's words. Loaded only when
 * the API is down or in preview. Events and squads are the same in every language. */
async function loadSaved(p: Profile): Promise<Saved> {
  sharedSaved ??= Promise.all([import("./saved/events.json"), import("./saved/lineups.json")]).then(
    ([e, l]) => [e.default as unknown as MatchEvent[], l.default as unknown as Lineups],
  );
  const [start, ticks, halftime, fulltime, [events, lineups]] = await Promise.all([
    profileFile<LiveSnapshot>(p, "snapshot.0.json", () => import("./saved/snapshot.0.json")),
    profileFile<StreamTick[]>(p, "ticks.json", () => import("./saved/ticks.json")),
    profileFile<MatchBrief>(p, "brief.halftime.json", () => import("./saved/brief.halftime.json")),
    profileFile<MatchBrief>(p, "brief.fulltime.json", () => import("./saved/brief.fulltime.json")),
    sharedSaved,
  ]);
  return { start, ticks, halftime, fulltime, events, lineups };
}

function profileQuery(p: Profile) {
  return { persona: p.persona, lang: p.language, team: p.team, player: p.player };
}

/**
 * Plays one match from one start minute. A new start minute or speed makes a new controller
 * (the hook does that), so nothing here has to undo a jump.
 */
class FeedController {
  private view: MatchView | null = null;
  private connection: Connection = "live";
  private running = false;
  private wantPlay = false;
  private disposed = false;
  private offline = false;
  private saved: Saved | null = null;
  private ws: WebSocket | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private retry = 0;

  constructor(
    private readonly matchId: string,
    private readonly startMinute: number,
    private readonly speed: number,
    private profile: Profile,
    private readonly emit: (s: FeedState) => void,
  ) {}

  private publish() {
    if (!this.disposed) this.emit({ view: this.view, connection: this.connection, running: this.running });
  }

  private set(view: MatchView) {
    this.view = view;
    this.publish();
  }

  // ---------- loading ----------

  async load() {
    if (PREVIEW) {
      await this.goOffline();
      if (this.disposed) return;
      this.loadTrace();
      if (this.wantPlay) this.play();
      return;
    }
    try {
      const v = await this.fetchAt(this.startMinute, this.profile);
      if (this.disposed) return;
      this.set(v);
    } catch {
      if (this.disposed) return;
      await this.goOffline();
    }
    if (this.disposed) return; // a jump replaced us while we loaded: never open a stream
    this.loadTrace();
    if (this.wantPlay) this.play();
  }

  /** Everything a screen needs at minute m, from the API. */
  private async fetchAt(m: number, p: Profile): Promise<MatchView> {
    const q = profileQuery(p);
    const [snap, overlays, ht, ft, events, lineups] = await Promise.all([
      liveApi.snapshot(this.matchId, m, q),
      liveApi.overlays(this.matchId, m, q),
      m >= HALF ? liveApi.brief(this.matchId, "halftime", q) : null,
      m >= FULL ? liveApi.brief(this.matchId, "fulltime", q) : null,
      // The pitch is a bonus: if either call fails, carry on without it.
      m >= 1 ? api.events(this.matchId, m).catch(() => [] as MatchEvent[]) : ([] as MatchEvent[]),
      liveApi.lineups(this.matchId).catch(() => null),
    ]);
    let v = { ...fromSnapshot(snap), overlays, events, lineups };
    if (ht) v = applyBrief(v, ht);
    if (ft) v = applyBrief(v, ft);
    return v;
  }

  private async goOffline() {
    this.closeStream();
    this.offline = true;
    this.connection = PREVIEW ? "preview" : "offline";
    this.saved ??= await loadSaved(this.profile);
    if (this.disposed) return;
    // Keep our place: the saved match picks up at the minute we're on.
    const at = this.view?.minute ?? this.startMinute;
    const kept = this.view;
    const v = replay(this.saved.start, this.saved.ticks, at, this.saved, this.saved);
    this.set(kept ? { ...v, agentTrace: kept.agentTrace } : v);
  }

  /** The half-time agents' steps live on the older report (#9). Empty means they didn't run. */
  private loadTrace() {
    const v = this.view;
    if (!v || v.agentTrace !== null || !v.halftime) return;
    const done = (steps: MatchView["agentTrace"]) => this.view && this.set({ ...this.view, agentTrace: steps });
    if (this.offline) return void done([]);
    api
      .halftime(this.matchId)
      .then((r) => done(r.meta.agent_trace ?? []))
      .catch(() => done([]));
  }

  // ---------- playing ----------

  setPlaying(on: boolean) {
    this.wantPlay = on;
    if (!this.view) return; // load() starts it
    if (on) this.play();
    else this.stop();
  }

  private play() {
    if (this.disposed || this.running || !this.view || this.view.minute >= FULL) return;
    this.running = true;
    this.publish();
    if (this.offline) this.stepSaved();
    else this.openStream();
  }

  private stop() {
    this.running = false;
    this.closeStream();
    this.clearTimer();
    this.publish();
  }

  private clearTimer() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private openStream() {
    const v = this.view!;
    const ws = new WebSocket(
      liveApi.streamUrl(this.matchId, { speed: this.speed, fromMinute: v.minute, ...profileQuery(this.profile) }),
    );
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      if (this.connection !== "live") {
        this.connection = "live";
        this.publish();
      }
    };
    ws.onmessage = (e) => this.onMessage(JSON.parse(e.data) as StreamMessage);
    ws.onclose = () => {
      if (this.ws !== ws) return; // we closed it on purpose
      this.ws = null;
      if (this.running) this.dropped();
    };
  }

  private closeStream() {
    const ws = this.ws;
    this.ws = null;
    ws?.close();
  }

  private dropped() {
    const wait = RETRIES[this.retry++];
    if (wait === undefined) {
      void this.goOffline().then(() => this.running && !this.disposed && this.stepSaved());
      return;
    }
    this.connection = "reconnecting";
    this.publish();
    this.timer = setTimeout(() => this.running && this.openStream(), wait);
  }

  private onMessage(msg: StreamMessage) {
    if (!this.view) return;
    switch (msg.type) {
      case "tick":
        this.set(applyTick(this.view, msg));
        break;
      case "halftime":
      case "fulltime":
        this.set(applyBrief(this.view, msg.brief));
        if (msg.type === "halftime") {
          this.loadTrace();
          this.holdBreak();
        }
        break;
      case "end":
        this.closeStream();
        this.running = false;
        this.publish();
        break;
      case "error":
        console.warn("stream:", msg.detail);
        break;
    }
  }

  /** Half-time lasts 15 match minutes at our speed, then the second half starts. */
  private holdBreak() {
    this.closeStream();
    this.clearTimer();
    const ms = (BREAK_MINUTES * 60_000) / this.speed;
    this.timer = setTimeout(() => {
      if (!this.running) return;
      if (this.offline) this.stepSaved();
      else this.openStream();
    }, ms);
  }

  /** Offline: the saved match at the same pace as the stream. */
  private stepSaved() {
    this.clearTimer();
    const tick = () => {
      if (!this.running || !this.view) return;
      const saved = this.saved!; // read each minute: a profile switch swaps the set under us
      const next = saved.ticks.find((t) => t.minute === this.view!.minute + 1);
      if (!next) {
        this.running = false;
        this.publish();
        return;
      }
      let v = applyTick(this.view, next);
      // The saved ticks carry no events: take that minute's from the recorded list.
      v = { ...v, events: addEvents(v.events, saved.events.filter((e) => e.minute === next.minute)) };
      if (next.minute === HALF) v = applyBrief(v, saved.halftime);
      if (next.minute === FULL) v = applyBrief(v, saved.fulltime);
      this.set(v);
      if (next.minute === HALF) {
        this.loadTrace();
        this.timer = setTimeout(tick, (BREAK_MINUTES * 60_000) / this.speed);
      } else this.timer = setTimeout(tick, 60_000 / this.speed);
    };
    tick();
  }

  // ---------- the viewer ----------

  setProfile(p: Profile) {
    if (sameProfile(p, this.profile)) return;
    this.profile = p;
    if (!this.view) return;
    if (this.offline) {
      // Saved match (offline or preview): load this profile's recorded set, rebuild the view at
      // the minute we're on, and relabel so the card cross-fades like the online path.
      const at = this.view.minute;
      loadSaved(p)
        .then((saved) => {
          if (this.disposed || !this.view || !sameProfile(p, this.profile)) return;
          this.saved = saved;
          const fresh = replay(saved.start, saved.ticks, at, saved, saved);
          this.set(relabel(this.view, fresh));
        })
        .catch(() => undefined);
      return;
    }
    this.ws?.readyState === WebSocket.OPEN && this.ws.send(JSON.stringify({ profile: p }));
    const at = this.view.minute;
    this.fetchAt(at, p)
      .then((fresh) => {
        if (this.view && sameProfile(p, this.profile)) this.set(relabel(this.view, fresh));
      })
      .catch(() => undefined); // keep the old words; the stream still switches
  }

  dispose() {
    this.disposed = true;
    this.running = false;
    this.closeStream();
    this.clearTimer();
  }
}

export function useMatchFeed({ matchId, profile, minute, speed, playing, epoch = 0 }: FeedOptions): FeedState {
  const [state, setState] = useState<FeedState>({ view: null, connection: "live", running: false });
  const ctl = useRef<FeedController | null>(null);
  const latest = useRef({ profile, playing });
  latest.current = { profile, playing };

  useEffect(() => {
    setState({ view: null, connection: "live", running: false });
    const c = new FeedController(matchId, minute, speed, latest.current.profile, setState);
    ctl.current = c;
    c.setPlaying(latest.current.playing);
    void c.load();
    return () => c.dispose();
  }, [matchId, minute, speed, epoch]);

  const { persona, language, team, player } = profile;
  useEffect(() => {
    ctl.current?.setProfile({ persona, language, team, player });
  }, [persona, language, team, player]);

  useEffect(() => {
    ctl.current?.setPlaying(playing);
  }, [playing]);

  return state;
}
