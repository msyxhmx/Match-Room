import type { Team } from "../types/halftime";

interface Props {
  home: Team;
  away: Team;
  score: { home: number; away: number };
  clock: number; // match minute shown on the board
}

export function Scoreboard({ home, away, score, clock }: Props) {
  const label = clock >= 45 ? "Half-time" : `${clock}'`;
  return (
    <header className="board" aria-label={`${home.name} ${score.home}, ${away.name} ${score.away}, ${label}`}>
      <div className="board-team home">
        <span className="board-code">{home.short_name}</span>
        <span className="board-name">{home.name}</span>
      </div>
      <div className="board-score">
        <span className="home-ink">{score.home}</span>
        <span className="board-sep" aria-hidden>
          –
        </span>
        <span className="away-ink">{score.away}</span>
        <span className="board-clock">{label}</span>
      </div>
      <div className="board-team away">
        <span className="board-code">{away.short_name}</span>
        <span className="board-name">{away.name}</span>
      </div>
    </header>
  );
}
