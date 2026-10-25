"""Synthetic match simulator, v1.

Two passes:

1. Core match: minute-by-minute Poisson-style draws for
   passes, shots, fouls, cards and corners, driven by team strength, pressing,
   home advantage, a random momentum swing per 15-minute block, game state
   (trailing teams push) and red cards. An optional `Scenario` can script a
   storyline (forced goals, red cards, momentum swings) for demos.
2. Enrichment (v1): pass end points, ball and shot speed, pressure events and
   the tackles/interceptions that win the ball back after a failed pass. It
   draws from its *own* random stream, so a given seed produces exactly the
   same goals, shots and cards as v0 and the trained model stays valid.

v1.1 (25 Oct): a red card's defence penalty now lasts the rest of the match (it was
undone a minute later), and a card shares its foul's second and player. Both keep the
random stream, so only matches with a red card play out differently; retrained after.

Output rows follow contract.Event.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from sim.scenarios import Scenario
from sim.teams import LEAGUE, REFEREES, VENUES, TeamProfile

HOME_ADVANTAGE = 1.08
BASE_SHOT_RATE = 0.135  # per team per minute at equal strength and 50% share
PASSES_PER_MINUTE = 9.0
FOUL_RATE = 0.22
CORNER_RATE = 0.11
YELLOW_GIVEN_FOUL = 0.15
RED_GIVEN_FOUL = 0.012

EVENT_COLUMNS = [
    "event_id", "match_id", "minute", "second", "side", "team_id", "player",
    "type", "x", "y", "outcome", "xg", "end_x", "end_y", "speed_kmh", "under_pressure",
]
CORE_COLUMNS = EVENT_COLUMNS[:12]
PITCH_LENGTH_M, PITCH_WIDTH_M = 105.0, 68.0


@dataclass
class SimulatedMatch:
    match_id: str
    home: TeamProfile
    away: TeamProfile
    events: pd.DataFrame
    meta: dict = field(default_factory=dict)
    scenario: str | None = None

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
    scenario: Scenario | None = None,
) -> SimulatedMatch:
    rng = np.random.default_rng(seed)
    match_id = match_id or f"SIM-{seed if seed is not None else rng.integers(1e9)}"
    teams = {"home": home, "away": away}
    attack = {"home": home.attack * HOME_ADVANTAGE, "away": away.attack}
    goals = {"home": 0, "away": 0}
    block_swing = rng.normal(0.0, 0.07, size=6)  # one momentum swing per 15-minute block
    shot_mult = 1.0
    forced_goals: dict[int, list[str]] = {}
    forced_reds: dict[int, list[str]] = {}
    if scenario is not None:
        for block, swing in scenario.swing.items():
            block_swing[block] = swing
        shot_mult = scenario.shot_rate_mult
        for minute, side in scenario.forced_goals:
            forced_goals.setdefault(minute, []).append(side)
        for minute, side in scenario.forced_reds:
            forced_reds.setdefault(minute, []).append(side)

    rows: list[tuple] = []

    def add(minute: int, side: str, kind: str, x: float, y: float, outcome: str,
            xg: float | None = None, like: tuple[int, str] | None = None) -> tuple[int, str]:
        """Append an event; returns its (second, player). `like` copies them from an
        earlier event (a card takes its foul's). The draws still happen so the random
        stream, and so every later event, stays the same for a given seed."""
        team = teams[side]
        second, player = int(rng.integers(0, 60)), _pick_players(rng, team, kind, 1)[0]
        if like is not None:
            second, player = like
        rows.append((
            None, match_id, minute, second, side, team.id, player, kind,
            round(float(x), 1), round(float(y), 1), outcome,
            None if xg is None else round(float(xg), 3),
        ))
        return second, player

    defence = {"home": home.defence, "away": away.defence}  # built once: red cards persist
    for minute in range(1, 91):
        block = min((minute - 1) // 15, 5)
        strength_edge = (attack["home"] - attack["away"]) * 0.18
        press_edge = (home.press - away.press) * 0.08
        chase = 0.04 * np.clip(goals["away"] - goals["home"], -2, 2)
        share = float(np.clip(0.5 + strength_edge + press_edge + chase + block_swing[block],
                              0.22, 0.78))
        shares = {"home": share, "away": 1.0 - share}

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
            if rng.random() < rate * shot_mult:
                xg = float(np.clip(rng.beta(1.3, 11.0) * (attack[side] / defence[opp]), 0.01, 0.9))
                x = min(100 - (4 + 30 * (1 - xg) ** 2) + rng.normal(0, 2), 100)
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

        for side in forced_goals.get(minute, []):  # scripted storyline goals
            xg = float(rng.uniform(0.18, 0.55))
            add(minute, side, "shot", 100 - (4 + 30 * (1 - xg) ** 2), rng.normal(50, 6),
                "goal", xg)
            goals[side] += 1

        # fouls and cards (the defending side fouls more, pressing teams more again)
        if rng.random() < FOUL_RATE:
            p_home_fouls = shares["away"] * (0.8 + 0.4 * home.press)
            p_away_fouls = shares["home"] * (0.8 + 0.4 * away.press)
            side = "home" if rng.random() < p_home_fouls / (p_home_fouls + p_away_fouls) else "away"
            x = rng.uniform(10, 80)
            foul = add(minute, side, "foul", x, rng.uniform(5, 95), "committed")
            r = rng.random()
            if r < RED_GIVEN_FOUL:
                add(minute, side, "card", x, 50, "red", like=foul)
                attack[side] *= 0.72
                defence[side] *= 0.85
            elif r < RED_GIVEN_FOUL + YELLOW_GIVEN_FOUL:
                add(minute, side, "card", x, 50, "yellow", like=foul)

        for side in forced_reds.get(minute, []):  # scripted storyline red cards
            x = rng.uniform(20, 60)
            foul = add(minute, side, "foul", x, rng.uniform(5, 95), "committed")
            add(minute, side, "card", x, 50, "red", like=foul)
            attack[side] *= 0.72
            defence[side] *= 0.85

        # corners
        if rng.random() < CORNER_RATE:
            side = "home" if rng.random() < share else "away"
            add(minute, side, "corner", 100, rng.choice([0.0, 100.0]), "awarded")

    core = pd.DataFrame(rows, columns=CORE_COLUMNS)
    core = core.sort_values(["minute", "second"], kind="stable").reset_index(drop=True)

    # Enrichment uses its own stream so the core match above never changes.
    rng2 = np.random.default_rng(None if seed is None else [seed, 7919])
    events = enrich(core, teams, rng2)
    events["event_id"] = [f"{match_id}-{i:04d}" for i in range(len(events))]
    meta = match_meta(home, rng2)
    return SimulatedMatch(match_id, home, away, events, meta=meta,
                          scenario=scenario.key if scenario else None)


def match_meta(home: TeamProfile, rng: np.random.Generator) -> dict:
    return {
        "venue": VENUES.get(home.id, f"{home.name} Ground"),
        "referee": REFEREES[int(rng.integers(len(REFEREES)))],
        "attendance": int(rng.integers(18_000, 61_000)),
        "weather": str(rng.choice(["Clear", "Overcast", "Light rain", "Windy", "Cold"])),
    }


def enrich(core: pd.DataFrame, teams: dict[str, TeamProfile],
           rng: np.random.Generator) -> pd.DataFrame:
    """Add pass end points, ball/shot speeds, pressure and ball-winning events.

    Coordinates stay in the acting team's frame (x = 100 is the goal they
    attack), so a defensive action at the passer's (x, y) sits at
    (100 - x, 100 - y) for the defending team.
    """
    ev = core.copy()
    n = len(ev)
    ev["end_x"] = np.nan
    ev["end_y"] = np.nan
    ev["speed_kmh"] = np.nan
    ev["under_pressure"] = None
    other = {"home": "away", "away": "home"}

    # passes: length depends on whether they were completed, angles lean forward
    is_pass = (ev["type"] == "pass").to_numpy()
    done = (ev["outcome"] == "complete").to_numpy()
    length_m = np.where(done, 4 + rng.gamma(2.2, 8.0, n), 6 + rng.gamma(2.2, 11.0, n))
    angle = rng.normal(0.0, 0.95, n)
    x, y = ev["x"].to_numpy(float), ev["y"].to_numpy(float)
    end_x = np.clip(x + length_m * np.cos(angle) / PITCH_LENGTH_M * 100, 0, 100)
    end_y = np.clip(y + length_m * np.sin(angle) / PITCH_WIDTH_M * 100, 0, 100)
    pass_speed = np.clip(28 + 1.05 * length_m + rng.normal(0, 6, n), 15, 110)

    opp_press = np.array([teams[other[s]].press for s in ev["side"]])
    p_pressure = 0.10 + 0.30 * opp_press + 0.15 * (x > 50) + 0.15 * ~done
    pressured = rng.random(n) < p_pressure

    ev.loc[is_pass, "end_x"] = end_x[is_pass].round(1)
    ev.loc[is_pass, "end_y"] = end_y[is_pass].round(1)
    ev.loc[is_pass, "speed_kmh"] = pass_speed[is_pass].round(1)
    ev.loc[is_pass, "under_pressure"] = pressured[is_pass]

    # shots: harder hits from range, with plenty of noise
    is_shot = (ev["type"] == "shot").to_numpy()
    dist_m = np.hypot((100 - x) * PITCH_LENGTH_M / 100, (y - 50) * PITCH_WIDTH_M / 100)
    shot_speed = np.clip(rng.normal(74 + 0.9 * dist_m, 13, n), 35, 132)
    ev.loc[is_shot, "speed_kmh"] = shot_speed[is_shot].round(1)

    # new rows: pressure before a pressured pass, ball won after a failed one
    extra: list[dict] = []
    ord_extra: list[int] = []
    for i in np.flatnonzero(is_pass & (pressured | ~done)):
        row = ev.iloc[i]
        opp = other[row["side"]]
        team = teams[opp]
        base = {"match_id": row["match_id"], "minute": row["minute"], "second": row["second"],
                "side": opp, "team_id": team.id, "xg": np.nan, "end_x": np.nan,
                "end_y": np.nan, "speed_kmh": np.nan, "under_pressure": None}
        if pressured[i]:
            extra.append({**base, "player": _pick_players(rng, team, "foul", 1)[0],
                          "type": "pressure", "x": round(100 - x[i], 1), "y": round(100 - y[i], 1),
                          "outcome": "applied" if done[i] else "forced_error"})
            ord_extra.append(0)
        if not done[i]:
            kind = "interception" if rng.random() < 0.6 else "tackle"
            extra.append({**base, "player": _pick_players(rng, team, "foul", 1)[0],
                          "type": kind, "x": round(100 - end_x[i], 1),
                          "y": round(100 - end_y[i], 1), "outcome": "won"})
            ord_extra.append(2)

    ev["_ord"] = 1
    if extra:
        add = pd.DataFrame(extra)
        add["_ord"] = ord_extra
        ev = pd.concat([ev, add], ignore_index=True)
    ev["event_id"] = None
    ev = ev.sort_values(["minute", "second", "_ord"], kind="stable").reset_index(drop=True)
    return ev[EVENT_COLUMNS]


def simulate_scenario(key: str) -> SimulatedMatch:
    from sim.scenarios import SCENARIOS, scenario_teams

    sc = SCENARIOS[key]
    home, away = scenario_teams(sc)
    return simulate_match(home, away, seed=sc.seed, match_id=f"SCN-{key}", scenario=sc)


def simulate_season(n_matches: int, seed: int = 0) -> list[SimulatedMatch]:
    """Random fixtures between league teams; deterministic for a given seed."""
    rng = np.random.default_rng(seed)
    matches = []
    for i in range(n_matches):
        h, a = rng.choice(len(LEAGUE), size=2, replace=False)
        matches.append(simulate_match(LEAGUE[h], LEAGUE[a], seed=seed * 1_000_003 + i,
                                      match_id=f"SIM-{seed}-{i:05d}"))
    return matches
