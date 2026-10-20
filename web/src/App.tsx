import { useCallback, useEffect, useRef, useState } from "react";
import { api, MOCK_REPORT } from "./api";
import { Halftime } from "./components/Halftime";
import { Replay } from "./components/Replay";
import { Scoreboard } from "./components/Scoreboard";
import type { HalftimeReport, MatchEvent, MatchSummary } from "./types/halftime";

type Phase = "pick" | "replay" | "halftime";
const REPLAY_MS = 9000; // 45 match minutes in 9 seconds

const prefersReducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

export default function App() {
  const [matches, setMatches] = useState<MatchSummary[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [offline, setOffline] = useState(false);
  const [phase, setPhase] = useState<Phase>("pick");
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [report, setReport] = useState<HalftimeReport | null>(null);
  const [clock, setClock] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const raf = useRef<number>(0);

  useEffect(() => {
    api
      .matches()
      .then((m) => {
        setMatches(m);
        setSelected(m[0]?.match_id ?? "");
      })
      .catch(() => {
        // API not reachable: show the sample report so the page still works.
        setOffline(true);
        setReport(MOCK_REPORT);
        setClock(45);
        setPhase("halftime");
      });
    return () => cancelAnimationFrame(raf.current);
  }, []);

  const finish = useCallback(() => {
    cancelAnimationFrame(raf.current);
    setClock(45);
    setPhase("halftime");
  }, []);

  const start = async () => {
    setError(null);
    try {
      const [ev, rep] = await Promise.all([api.events(selected), api.halftime(selected)]);
      setEvents(ev.filter((e) => e.type === "shot" || e.type === "card"));
      setReport(rep);
    } catch (e) {
      setError(`Couldn't load ${selected}: ${(e as Error).message}. Check the API is running.`);
      return;
    }
    if (prefersReducedMotion()) return finish();
    setPhase("replay");
    setClock(0);
    const t0 = performance.now();
    const tick = (now: number) => {
      const minute = Math.min(45, Math.floor(((now - t0) / REPLAY_MS) * 45));
      setClock(minute);
      if (minute < 45) raf.current = requestAnimationFrame(tick);
      else finish();
    };
    raf.current = requestAnimationFrame(tick);
  };

  const summary = matches.find((m) => m.match_id === selected);
  const teams = report ?? summary;
  const liveScore = {
    home: events.filter((e) => e.minute <= clock && e.outcome === "goal" && e.side === "home").length,
    away: events.filter((e) => e.minute <= clock && e.outcome === "goal" && e.side === "away").length,
  };
  const score = phase === "halftime" && report ? report.score : liveScore;

  return (
    <div className="page">
      <div className="masthead">
        <span className="brand">Halftime Insights</span>
        {phase === "halftime" && !offline && (
          <button className="btn-quiet" onClick={() => { setPhase("pick"); setClock(0); setEvents([]); }}>
            Choose another match
          </button>
        )}
      </div>

      {offline && (
        <p className="notice" role="status">
          Showing a sample report. The API isn't reachable; start it with <code>make api</code>.
        </p>
      )}

      {teams && <Scoreboard home={teams.home} away={teams.away} score={score} clock={clock} />}

      {phase === "pick" && (
        <section className="picker">
          <label htmlFor="match">Match</label>
          <select id="match" value={selected} onChange={(e) => setSelected(e.target.value)}>
            {matches.map((m) => (
              <option key={m.match_id} value={m.match_id}>
                {m.home.name} v {m.away.name}
              </option>
            ))}
          </select>
          <button className="btn" onClick={start} disabled={!selected}>
            Replay first half
          </button>
          {error && <p className="error" role="alert">{error}</p>}
        </section>
      )}

      {phase === "replay" && teams && (
        <Replay events={events} clock={clock} home={teams.home} away={teams.away} onSkip={finish} />
      )}

      {phase === "halftime" && report && <Halftime report={report} />}
    </div>
  );
}
