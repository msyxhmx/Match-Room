"""Scripted storylines for the synthetic simulator.

A scenario nudges the simulator so a demo match reliably contains a story:
a red card at 30', a comeback, a press that fades. Everything else (passes,
chances, most goals) is still simulated, so the engine has to *detect* the
story from the events; it is never told what happened.

Scenarios are labelled in the API so nobody mistakes them for organic matches.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from sim.teams import TEAMS_BY_ID


@dataclass(frozen=True)
class Scenario:
    key: str
    title: str
    description: str
    home_id: str
    away_id: str
    seed: int
    # block index (0 = 1-15', 5 = 76-90') -> home share swing, replacing the random one
    swing: dict[int, float] = field(default_factory=dict)
    forced_goals: tuple[tuple[int, str], ...] = ()  # (minute, side)
    forced_reds: tuple[tuple[int, str], ...] = ()  # (minute, side)
    scorers: dict[int, str] = field(default_factory=dict)  # forced-goal minute -> player
    shot_rate_mult: float = 1.0


SCENARIOS: dict[str, Scenario] = {
    s.key: s
    for s in [
        Scenario(
            key="comeback",
            title="The comeback",
            description="Away side go 2-0 up before the break; the home side take over "
                        "after half-time and turn it round.",
            home_id="NGC", away_id="KST", seed=1685,
            swing={0: -0.06, 1: -0.10, 2: -0.12, 3: 0.14, 4: 0.18, 5: 0.20},
            forced_goals=((14, "away"), (37, "away"), (61, "home"), (74, "home"), (87, "home")),
            scorers={14: "K. Quinn", 74: "L. Quinn"},
        ),
        Scenario(
            key="red-card",
            title="Down to ten",
            description="The home favourites lead, then lose a player to a red card on "
                        "30 minutes.",
            home_id="RIV", away_id="ASH", seed=131,
            forced_reds=((30, "home"),),
            forced_goals=((22, "home"),),
        ),
        Scenario(
            key="press-and-fade",
            title="Press, then fade",
            description="The away side press high and dominate the first half, then run "
                        "out of legs.",
            home_id="ELM", away_id="RIV", seed=119,
            swing={0: -0.16, 1: -0.18, 2: -0.12, 3: 0.04, 4: 0.12, 5: 0.16},
        ),
        Scenario(
            key="end-to-end",
            title="End to end",
            description="Two attacking sides trade chances all afternoon.",
            home_id="HAR", away_id="NGC", seed=100,
            swing={0: 0.12, 1: -0.12, 2: 0.10, 3: -0.10, 4: 0.12, 5: -0.12},
            shot_rate_mult=1.7,
        ),
    ]
}


def scenario_teams(s: Scenario):
    return TEAMS_BY_ID[s.home_id], TEAMS_BY_ID[s.away_id]
