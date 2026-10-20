import type { HalftimeReport, MatchEvent, MatchSummary } from "./types/halftime";
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
