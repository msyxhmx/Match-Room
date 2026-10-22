"""All-season view: the same control / chaos / chance metrics, rolled up across
a synthetic round-robin, plus storylines that cite their numbers."""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from itertools import combinations

import numpy as np

from contract import Profile, SeasonReport, SeasonRow, SeasonStoryline, Team
from live import metrics as M
from live.engine import say
from live.insights import Fact
from live.templates import BRIEF
from sim.simulator import simulate_match
from sim.teams import LEAGUE

SEASON_SEED = 2027


@dataclass
class _Tally:
    played: int = 0
    won: int = 0
    drawn: int = 0
    lost: int = 0
    gf: int = 0
    ga: int = 0
    xgf: float = 0.0
    xga: float = 0.0
    control_minutes: int = 0
    chaos_minutes: int = 0
    minutes: int = 0
    wins_against_run: int = 0

    @property
    def points(self) -> int:
        return 3 * self.won + self.drawn


@lru_cache(maxsize=2)
def season_tallies(seed: int = SEASON_SEED) -> dict[str, _Tally]:
    """Single round-robin (every pair once, home side alternating)."""
    rng = np.random.default_rng(seed)
    tallies = {t.id: _Tally() for t in LEAGUE}
    for i, (a, b) in enumerate(combinations(LEAGUE, 2)):
        home, away = (a, b) if rng.random() < 0.5 else (b, a)
        match = simulate_match(home, away, seed=seed * 1000 + i, match_id=f"SEA-{seed}-{i:03d}")
        tl = M.build_timeline(match)
        h, g = tl.score(M.FULL_TIME)
        phases = tl.phase[1:]
        ctrl = {"home": phases.count("home_control"), "away": phases.count("away_control")}
        chaos = phases.count("chaos")
        for side, team, gf, ga in (("home", home, h, g), ("away", away, g, h)):
            t = tallies[team.id]
            opp = "away" if side == "home" else "home"
            t.played += 1
            t.gf += gf
            t.ga += ga
            t.xgf += tl.cum(side, "xg", M.FULL_TIME)
            t.xga += tl.cum(opp, "xg", M.FULL_TIME)
            t.control_minutes += ctrl[side]
            t.chaos_minutes += chaos
            t.minutes += M.FULL_TIME
            if gf > ga:
                t.won += 1
                if ctrl[side] < ctrl[opp]:
                    t.wins_against_run += 1
            elif gf == ga:
                t.drawn += 1
            else:
                t.lost += 1
    return tallies


def _team(t) -> Team:
    return Team(id=t.id, name=t.name, short_name=t.short_name)


def season_report(profile: Profile, seed: int = SEASON_SEED) -> SeasonReport:
    tallies = season_tallies(seed)
    teams = {t.id: t for t in LEAGUE}
    rows = [SeasonRow(team=_team(teams[k]), played=t.played, won=t.won, drawn=t.drawn,
                      lost=t.lost, goals_for=t.gf, goals_against=t.ga, points=t.points,
                      xg_for=round(t.xgf, 2), xg_against=round(t.xga, 2),
                      control_share=round(t.control_minutes / t.minutes, 3),
                      chaos_share=round(t.chaos_minutes / t.minutes, 3),
                      wins_against_run=t.wins_against_run)
            for k, t in tallies.items()]
    rows.sort(key=lambda r: (-r.points, -(r.goals_for - r.goals_against), -r.goals_for))

    lang = profile.language
    stories: list[SeasonStoryline] = []

    def add(key: str, row: SeasonRow, facts: dict[str, Fact]) -> None:
        body, used = say(key, lang, {"team": Fact(row.team.name, "team"), **facts})
        stories.append(SeasonStoryline(id=key, title=BRIEF[f"{key}_title"][lang], body=body,
                                       team_id=row.team.id, facts_used=used))

    leader = rows[0]
    add("season_leader", leader, {"points": Fact(leader.points, "int"),
                                  "played": Fact(leader.played, "int")})
    ctrl = max(rows, key=lambda r: r.control_share)
    add("season_control", ctrl, {"share": Fact(ctrl.control_share, "pct")})
    run = max(rows, key=lambda r: r.wins_against_run)
    if run.wins_against_run:
        add("season_run", run, {"count": Fact(run.wins_against_run, "int")})
    finish = max(rows, key=lambda r: r.goals_for - r.xg_for)
    if finish.goals_for - finish.xg_for >= 1:
        add("season_finish", finish, {"goals": Fact(finish.goals_for, "int"),
                                      "xg": Fact(finish.xg_for, "dec1")})
    chaos = max(rows, key=lambda r: r.chaos_share)
    add("season_chaos", chaos, {"share": Fact(chaos.chaos_share, "pct")})
    if profile.team:
        mine = next((r for r in rows if r.team.id == profile.team), None)
        if mine:
            add("season_yours", mine, {"position": Fact(rows.index(mine) + 1, "int"),
                                       "points": Fact(mine.points, "int"),
                                       "xg": Fact(mine.xg_for, "dec1"),
                                       "xga": Fact(mine.xg_against, "dec1")})
            stories.insert(0, stories.pop())
    return SeasonReport(matches=sum(r.played for r in rows) // 2, profile=profile, table=rows,
                        storylines=stories)
