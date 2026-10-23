import type { HalftimeReport, MatchEvent, MatchSummary } from "./types/halftime";
import type {
  CatchUp,
  Language,
  LiveCard,
  LiveSnapshot,
  Lineups,
  MatchBrief,
  OverlayMessage,
  Persona,
  ScenarioInfo,
  SeasonReport,
} from "./types/live";
import mockReport from "./mock/halftime.json";

const BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}/api${path}`);
  if (!res.ok) throw new Error(`${res.status} on ${path}`);
  return res.json() as Promise<T>;
}

export const api = {
  matches: () => get<MatchSummary[]>("/matches"),
  events: (id: string, until = 45) => get<MatchEvent[]>(`/matches/${id}/events?until=${until}`),
  halftime: (id: string) => get<HalftimeReport>(`/matches/${id}/halftime`),
};

// Same shape as the API: lets the page work before the backend is up.
export const MOCK_REPORT = mockReport as HalftimeReport;

// ---------- Match-Room Live ----------

/** Who the output is for. Every Live endpoint accepts these. */
export interface ViewerProfile {
  persona?: Persona;
  lang?: Language;
  team?: string | null;
  player?: string | null;
}

function query(params: Record<string, string | number | null | undefined>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

const p = (v: ViewerProfile = {}) => ({
  persona: v.persona,
  lang: v.lang,
  team: v.team,
  player: v.player,
});

export const liveApi = {
  scenarios: () => get<ScenarioInfo[]>("/scenarios"),
  lineups: (id: string) => get<Lineups>(`/matches/${id}/lineups`),
  snapshot: (id: string, minute: number, v?: ViewerProfile) =>
    get<LiveSnapshot>(`/matches/${id}/live${query({ minute, ...p(v) })}`),
  cards: (id: string, until = 90, v?: ViewerProfile) =>
    get<LiveCard[]>(`/matches/${id}/cards${query({ until, ...p(v) })}`),
  overlays: (id: string, until = 90, v?: ViewerProfile) =>
    get<OverlayMessage[]>(`/matches/${id}/overlays${query({ until, ...p(v) })}`),
  brief: (id: string, kind: "halftime" | "fulltime", v?: ViewerProfile) =>
    get<MatchBrief>(`/matches/${id}/brief/${kind}${query(p(v))}`),
  catchup: (id: string, minute: number, v?: ViewerProfile) =>
    get<CatchUp>(`/matches/${id}/catchup${query({ minute, ...p(v) })}`),
  season: (v?: ViewerProfile) => get<SeasonReport>(`/season${query(p(v))}`),

  /** Websocket URL for the live stream. speed 60 = one match minute per second. */
  streamUrl: (id: string, opts: ViewerProfile & { speed?: number; fromMinute?: number } = {}) => {
    const http = BASE || window.location.origin;
    const ws = http.replace(/^http/, "ws");
    const { speed, fromMinute, ...v } = opts;
    return `${ws}/api/matches/${id}/stream${query({ speed, from_minute: fromMinute, ...p(v) })}`;
  },
};
