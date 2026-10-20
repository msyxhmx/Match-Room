import type { MatchEvent, Team } from "../types/halftime";

interface Props {
  events: MatchEvent[]; // shots and cards only
  clock: number;
  home: Team;
  away: Team;
  onSkip: () => void;
}

function describe(e: MatchEvent): string {
  if (e.type === "card") return `${e.outcome === "red" ? "Red" : "Yellow"} card, ${e.player}`;
  const what: Record<string, string> = {
    goal: "Goal",
    saved: "Shot saved",
    blocked: "Shot blocked",
    off_target: "Shot wide",
  };
  return `${what[e.outcome] ?? "Shot"}, ${e.player}`;
}

export function Replay({ events, clock, home, away, onSkip }: Props) {
  const shown = events.filter((e) => e.minute <= clock).slice(-8).reverse();
  return (
    <section className="replay" aria-live="polite">
      <div className="replay-track" aria-hidden>
        <div className="replay-fill" style={{ width: `${(clock / 45) * 100}%` }} />
        {events
          .filter((e) => e.outcome === "goal" || e.type === "card")
          .map((e) => (
            <span
              key={e.event_id}
              className={`replay-pip ${e.side} ${e.outcome === "goal" ? "goal" : "card"}`}
              style={{ left: `${(e.minute / 45) * 100}%`, opacity: e.minute <= clock ? 1 : 0.25 }}
            />
          ))}
      </div>
      <ol className="replay-feed">
        {shown.map((e) => (
          <li key={e.event_id} className={e.outcome === "goal" ? "is-goal" : undefined}>
            <span className="feed-min">{e.minute}'</span>
            <span className={`feed-team ${e.side}-ink`}>
              {e.side === "home" ? home.short_name : away.short_name}
            </span>
            <span>{describe(e)}</span>
          </li>
        ))}
        {shown.length === 0 && <li className="feed-empty">Kick-off</li>}
      </ol>
      <button className="btn-quiet" onClick={onSkip}>
        Skip to half-time
      </button>
    </section>
  );
}
