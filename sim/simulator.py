"""Synthetic match simulator, v0.

Deliberately simple (see the plan's risk table): minute-by-minute Poisson-style
draws for passes, shots, fouls, cards and corners, driven by team strength,
pressing, home advantage, a random momentum swing per 15-minute block, game
state (trailing teams push) and red cards. Realism can be added later without
changing the output shape, which follows contract.Event.
"""

from __future__ import annotations

from dataclasses import dataclass

import numpy as np
import pandas as pd

from sim.teams import LEAGUE, TeamProfile

HOME_ADVANTAGE = 1.08
BASE_SHOT_RATE = 0.135  # per team per minute at equal strength and 50% share
PASSES_PER_MINUTE = 9.0
FOUL_RATE = 0.22
CORNER_RATE = 0.11
YELLOW_GIVEN_FOUL = 0.15
RED_GIVEN_FOUL = 0.012

EVENT_COLUMNS = [
    "event_id", "match_id", "minute", "second", "side", "team_id", "player",
    "type", "x", "y", "outcome", "xg",
]


@dataclass
class SimulatedMatch:
    match_id: str
    home: TeamProfile
    away: TeamProfile
    events: pd.DataFrame

    def first_half(self) -> pd.DataFrame:
        return self.events[self.events["minute"] <= 45]

    def final_score(self) -> tuple[int, int]:
        goals = self.events[(self.events["type"] == "shot") & (self.events["outcome"] == "goal")]
        return int((goals["side"] == "home").sum()), int((goals["side"] == "away").sum())


_ROLE_WEIGHTS = {
    "shot": {"GK": 0.0, "DF": 0.4, "MF": 1.0, "FW": 2.6},
    "foul": {"GK": 0.1, "DF": 1.6, "MF": 1.3, "FW": 0.6},
    "other": {"GK": 0.5, "DF": 1.0, "MF": 1.4, "FW": 0.8},
}
_weight_cache: dict[tuple[str, str], np.ndarray] = {}


def _player_probs(team: TeamProfile, kind: str) -> np.ndarray:
    key = (team.id, kind if kind in _ROLE_WEIGHTS else "other")
    if key not in _weight_cache:
        w = np.array([_ROLE_WEIGHTS[key[1]][p.position] for p in team.players])
        _weight_cache[key] = w / w.sum()
    return _weight_cache[key]


def _pick_players(rng: np.random.Generator, team: TeamProfile, kind: str, n: int) -> list[str]:
    idx = rng.choice(len(team.players), size=n, p=_player_probs(team, kind))
    return [team.players[i].name for i in idx]


def simulate_match(
    home: TeamProfile,
    away: TeamProfile,
    seed: int | None = None,
    match_id: str | None = None,
) -> SimulatedMatch:
    rng = np.random.default_rng(seed)
    match_id = match_id or f"SIM-{seed if seed is not None else rng.integers(1e9)}"
    teams = {"home": home, "away": away}
    attack = {"home": home.attack * HOME_ADVANTAGE, "away": away.attack}
    goals = {"home": 0, "away": 0}
    block_swing = rng.normal(0.0, 0.07, size=6)  # one momentum swing per 15-minute block

    rows: list[tuple] = []

    def add(minute: int, side: str, kind: str, x: float, y: float, outcome: str,
            xg: float | None = None) -> None:
        team = teams[side]
        rows.append((
            None, match_id, minute, int(rng.integers(0, 60)), side, team.id,
            _pick_players(rng, team, kind, 1)[0], kind, round(float(x), 1), round(float(y), 1),
            outcome, None if xg is None else round(float(xg), 3),
        ))

    for minute in range(1, 91):
        block = min((minute - 1) // 15, 5)
        strength_edge = (attack["home"] - attack["away"]) * 0.18
        press_edge = (home.press - away.press) * 0.08
        chase = 0.04 * np.clip(goals["away"] - goals["home"], -2, 2)
        share = float(np.clip(0.5 + strength_edge + press_edge + chase + block_swing[block],
                              0.22, 0.78))
        shares = {"home": share, "away": 1.0 - share}
        defence = {"home": home.defence, "away": away.defence}

        # passes (vectorised per side: they are ~90% of all events)
        n_passes = rng.poisson(PASSES_PER_MINUTE)
        n_home = rng.binomial(n_passes, share)
        for side, n in (("home", n_home), ("away", n_passes - n_home)):
            if n == 0:
                continue
            opp = "away" if side == "home" else "home"
            xs = np.clip(rng.normal(30 + 40 * shares[side], 22, size=n), 1, 99).round(1)
            ys = rng.uniform(2, 98, size=n).round(1)
            completion = 0.86 - 0.18 * (xs > 66) - 0.06 * teams[opp].press
            done = rng.random(n) < completion
            secs = rng.integers(0, 60, size=n)
            team = teams[side]
            players = _pick_players(rng, team, "pass", n)
            for x, y, ok, sec, player in zip(xs, ys, done, secs, players, strict=True):
                rows.append((None, match_id, minute, int(sec), side, team.id, player, "pass",
                             float(x), float(y), "complete" if ok else "incomplete", None))

        # shots
        for side, opp in (("home", "away"), ("away", "home")):
            rate = BASE_SHOT_RATE * (attack[side] / defence[opp]) * (2 * shares[side]) ** 0.9
            if rng.random() < rate:
                xg = float(np.clip(rng.beta(1.3, 11.0) * (attack[side] / defence[opp]), 0.01, 0.9))
                x = 100 - (4 + 30 * (1 - xg) ** 2) + rng.normal(0, 2)
                y = np.clip(rng.normal(50, 10 * (1 - xg) + 3), 5, 95)
                r = rng.random()
                if r < xg:
                    outcome = "goal"
                    goals[side] += 1
                elif r < xg + 0.33:
                    outcome = "saved"
                elif r < xg + 0.58:
                    outcome = "blocked"
                else:
                    outcome = "off_target"
                add(minute, side, "shot", x, y, outcome, xg)

        # fouls and cards (the defending side fouls more, pressing teams more again)
        if rng.random() < FOUL_RATE:
            p_home_fouls = shares["away"] * (0.8 + 0.4 * home.press)
            p_away_fouls = shares["home"] * (0.8 + 0.4 * away.press)
            side = "home" if rng.random() < p_home_fouls / (p_home_fouls + p_away_fouls) else "away"
            x = rng.uniform(10, 80)
            add(minute, side, "foul", x, rng.uniform(5, 95), "committed")
            r = rng.random()
            if r < RED_GIVEN_FOUL:
                add(minute, side, "card", x, 50, "red")
                attack[side] *= 0.72
                defence[side] *= 0.85
            elif r < RED_GIVEN_FOUL + YELLOW_GIVEN_FOUL:
                add(minute, side, "card", x, 50, "yellow")

        # corners
        if rng.random() < CORNER_RATE:
            side = "home" if rng.random() < share else "away"
            add(minute, side, "corner", 100, rng.choice([0.0, 100.0]), "awarded")

    events = pd.DataFrame(rows, columns=EVENT_COLUMNS)
    events = events.sort_values(["minute", "second"], kind="stable").reset_index(drop=True)
    events["event_id"] = [f"{match_id}-{i:04d}" for i in range(len(events))]
    return SimulatedMatch(match_id, home, away, events)


def simulate_season(n_matches: int, seed: int = 0) -> list[SimulatedMatch]:
    """Random fixtures between league teams; deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    matches = []
    for i in range(n_matches):
        h, a = rng.choice(len(LEAGUE), size=2, replace=False)
        matches.append(simulate_match(LEAGUE[h], LEAGUE[a], seed=seed * 1_000_003 + i,
                                      match_id=f"SIM-{seed}-{i:05d}"))
    return matches
