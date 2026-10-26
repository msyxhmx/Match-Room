"""Interpret stage: turn raw synthetic events into football metrics, minute by minute.

Everything is computed from events with `minute <= m`, so any state can be
rebuilt for any point in the match (live, replay, catch-up). All definitions,
weights and thresholds live here and are published in docs/live-engine.md;
nothing is a black box.

Coordinates: 0-100, from the acting team's point of view (x = 100 is the goal
they attack). Pitch assumed 105 x 68 m.
"""

from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from live import xt as xt_fit
from sim.simulator import PITCH_LENGTH_M, PITCH_WIDTH_M, SimulatedMatch

SIDES = ("home", "away")
FULL_TIME = 90
WINDOW = 10  # minutes, for rolling control / chaos / tempo / pressing

# ---------- expected threat (xT) grid ----------
# A 12 x 8 zone grid of "probability this possession ends in a goal from here".
# Learned from simulated matches with Karun Singh's value iteration (live/xt.py,
# artifacts/xt_grid.json). If that file is missing or broken, fall back to a smooth
# hand-drawn surface with the same shape as Singh's published one.
XT_COLS, XT_ROWS = xt_fit.XT_COLS, xt_fit.XT_ROWS


def _xt_surface(x: float, y: float) -> float:
    return 0.004 + 0.32 * math.exp(-(100 - x) / 13.0) * math.exp(-(((y - 50) / 24.0) ** 2))


XT_HAND_DRAWN = np.array([[_xt_surface((i + 0.5) * 100 / XT_COLS, (j + 0.5) * 100 / XT_ROWS)
                           for j in range(XT_ROWS)] for i in range(XT_COLS)])
_fitted = xt_fit.load()
XT_GRID = XT_HAND_DRAWN if _fitted is None else _fitted
XT_SOURCE = "hand-drawn" if _fitted is None else "fitted"


def xt_at(x: np.ndarray, y: np.ndarray) -> np.ndarray:
    ix = np.clip((np.asarray(x, float) / 100 * XT_COLS).astype(int), 0, XT_COLS - 1)
    iy = np.clip((np.asarray(y, float) / 100 * XT_ROWS).astype(int), 0, XT_ROWS - 1)
    return XT_GRID[ix, iy]


# ---------- pass difficulty (xPass) ----------
# Completion probability from pass length, how far into the final third it
# ends, and whether the passer was under pressure. Difficulty = 1 - p.
XPASS = {"intercept": 3.4, "per_metre": -0.055, "final_third_depth": -0.025, "pressure": -0.7}


def completion_prob(length_m: np.ndarray, end_x: np.ndarray,
                    under_pressure: np.ndarray) -> np.ndarray:
    z = (XPASS["intercept"] + XPASS["per_metre"] * length_m
         + XPASS["final_third_depth"] * np.maximum(end_x - 60, 0)
         + XPASS["pressure"] * under_pressure.astype(float))
    return 1 / (1 + np.exp(-z))


# ---------- control vs chaos (our own composite, weights stated) ----------
CONTROL_WEIGHTS = {"possession": 0.4, "field_tilt": 0.4, "retention": 0.2}
CHAOS_WEIGHTS = {"turnovers": 0.4, "volatility": 0.3, "threat": 0.3}
# Normalisers: roughly the 90th percentile of each input over simulated matches
# (see scripts/calibrate_live.py), so chaos ~1 means "top-10% wild".
CHAOS_NORM = {"turnovers": 2.8, "volatility": 0.38, "threat": 0.14}
CONTROL_THRESHOLD = 0.60  # rolling control share above this = one side in control
CHAOS_THRESHOLD = 0.76
MOMENTUM_DECAY = 0.85  # per minute; half-life ~4 minutes
PRESS_ZONE_X = 40  # defensive actions at x >= 40 (own frame) count as pressing high
BUILD_UP_X = 60  # opponent passes from x < 60 (their frame) are build-up play

PHASES = ("home_control", "away_control", "chaos", "balanced")


def annotate(events: pd.DataFrame) -> pd.DataFrame:
    """Add per-event derived columns: pass length, difficulty, xT added, threat."""
    ev = events.copy()
    is_pass = ev["type"] == "pass"
    dx = (ev["end_x"] - ev["x"]) * PITCH_LENGTH_M / 100
    dy = (ev["end_y"] - ev["y"]) * PITCH_WIDTH_M / 100
    ev["length_m"] = np.where(is_pass, np.hypot(dx, dy), np.nan)
    pressure = ev["under_pressure"].fillna(False).astype(bool).to_numpy()
    p = completion_prob(ev["length_m"].fillna(0).to_numpy(), ev["end_x"].fillna(0).to_numpy(),
                        pressure)
    ev["difficulty"] = np.where(is_pass, 1 - p, np.nan)
    completed = is_pass & (ev["outcome"] == "complete")
    xt_gain = xt_at(ev["end_x"].fillna(0), ev["end_y"].fillna(0)) - xt_at(ev["x"], ev["y"])
    ev["xt_added"] = np.where(completed, xt_gain, 0.0)
    ev["threat"] = np.maximum(ev["xt_added"], 0) + ev["xg"].fillna(0)
    ev["is_goal"] = (ev["type"] == "shot") & (ev["outcome"] == "goal")
    ev["defensive"] = ev["type"].isin(["tackle", "interception", "foul"])
    ev["press_high"] = ev["defensive"] & (ev["x"] >= PRESS_ZONE_X)
    ev["build_up"] = is_pass & (ev["x"] < BUILD_UP_X)
    return ev


@dataclass
class Timeline:
    """Per-minute arrays (index = minute, 0 = kick-off) for one match."""

    match: SimulatedMatch
    events: pd.DataFrame  # annotated
    per_min: dict[str, dict[str, np.ndarray]]  # side -> metric -> counts per minute
    momentum: np.ndarray  # -1 (away on top) .. +1 (home on top)
    control_home: np.ndarray  # rolling home control share 0..1
    chaos: np.ndarray  # rolling chaos index 0..1
    tempo: np.ndarray  # rolling passes per minute (both teams)
    phase: list[str]
    projection: list[dict]  # win projection per minute

    def cum(self, side: str, key: str, minute: int) -> float:
        return float(self.per_min[side][key][: minute + 1].sum())

    def window(self, side: str, key: str, minute: int, width: int = WINDOW) -> float:
        lo = max(0, minute - width + 1)
        return float(self.per_min[side][key][lo: minute + 1].sum())

    def until(self, minute: int) -> pd.DataFrame:
        return self.events[self.events["minute"] <= minute]

    def score(self, minute: int) -> tuple[int, int]:
        return int(self.cum("home", "goals", minute)), int(self.cum("away", "goals", minute))


PER_MIN_KEYS = ["passes", "completed", "final_third", "xg", "shots", "sot", "goals", "xt",
                "threat", "turnovers", "press_high", "build_up", "pressures", "reds",
                "defensive", "corners", "fouls"]


def _per_minute(ev: pd.DataFrame) -> dict[str, dict[str, np.ndarray]]:
    out: dict[str, dict[str, np.ndarray]] = {}
    is_pass = ev["type"] == "pass"
    cols = {
        "passes": is_pass,
        "completed": is_pass & (ev["outcome"] == "complete"),
        "final_third": is_pass & (ev["x"] > 66),
        "xg": ev["xg"].fillna(0),
        "shots": ev["type"] == "shot",
        "sot": (ev["type"] == "shot") & ev["outcome"].isin(["goal", "saved"]),
        "goals": ev["is_goal"],
        "xt": ev["xt_added"],
        "threat": ev["threat"],
        "turnovers": is_pass & (ev["outcome"] == "incomplete"),
        "press_high": ev["press_high"],
        "build_up": ev["build_up"],
        "pressures": ev["type"] == "pressure",
        "reds": (ev["type"] == "card") & (ev["outcome"] == "red"),
        "defensive": ev["defensive"],
        "corners": ev["type"] == "corner",
        "fouls": ev["type"] == "foul",
    }
    frame = pd.DataFrame({k: v.astype(float) for k, v in cols.items()})
    frame["minute"], frame["side"] = ev["minute"].to_numpy(), ev["side"].to_numpy()
    for side in SIDES:
        g = frame[frame["side"] == side].groupby("minute")[PER_MIN_KEYS].sum()
        g = g.reindex(range(FULL_TIME + 1), fill_value=0.0)
        out[side] = {k: g[k].to_numpy() for k in PER_MIN_KEYS}
    return out


def _share(a: float, b: float, default: float = 0.5) -> float:
    return a / (a + b) if (a + b) > 0 else default


def build_timeline(match: SimulatedMatch) -> Timeline:
    ev = annotate(match.events)
    pm = _per_minute(ev)
    n = FULL_TIME + 1

    # momentum: recency-weighted share of threat (xT gained + xG), -1..1
    momentum = np.zeros(n)
    h_acc = a_acc = 0.0
    for m in range(1, n):
        h_acc = h_acc * MOMENTUM_DECAY + pm["home"]["threat"][m]
        a_acc = a_acc * MOMENTUM_DECAY + pm["away"]["threat"][m]
        momentum[m] = (h_acc - a_acc) / (h_acc + a_acc + 0.02)

    control = np.full(n, 0.5)
    chaos = np.zeros(n)
    tempo = np.zeros(n)
    phase = ["balanced"] * n
    for m in range(1, n):
        lo = max(1, m - WINDOW + 1)
        w = {s: {k: pm[s][k][lo: m + 1].sum() for k in PER_MIN_KEYS} for s in SIDES}
        span = m - lo + 1
        poss = _share(w["home"]["passes"], w["away"]["passes"])
        tilt = _share(w["home"]["final_third"], w["away"]["final_third"])
        ret_h = w["home"]["completed"] / w["home"]["passes"] if w["home"]["passes"] else 0.0
        ret_a = w["away"]["completed"] / w["away"]["passes"] if w["away"]["passes"] else 0.0
        retention = _share(ret_h, ret_a)
        control[m] = (CONTROL_WEIGHTS["possession"] * poss + CONTROL_WEIGHTS["field_tilt"] * tilt
                      + CONTROL_WEIGHTS["retention"] * retention)

        turnovers = (w["home"]["turnovers"] + w["away"]["turnovers"]) / span
        volatility = float(np.std(momentum[lo: m + 1])) if span > 1 else 0.0
        threat = (w["home"]["threat"] + w["away"]["threat"]) / span
        chaos[m] = (CHAOS_WEIGHTS["turnovers"] * min(turnovers / CHAOS_NORM["turnovers"], 1)
                    + CHAOS_WEIGHTS["volatility"] * min(volatility / CHAOS_NORM["volatility"], 1)
                    + CHAOS_WEIGHTS["threat"] * min(threat / CHAOS_NORM["threat"], 1))
        tempo[m] = (w["home"]["passes"] + w["away"]["passes"]) / span
        phase[m] = classify_phase(control[m], chaos[m])

    tl = Timeline(match, ev, pm, momentum, control, chaos, tempo, phase, [])
    tl.projection = [project(tl, m) for m in range(n)]
    return tl


def classify_phase(control_home: float, chaos: float) -> str:
    if chaos >= CHAOS_THRESHOLD:
        return "chaos"
    if control_home >= CONTROL_THRESHOLD:
        return "home_control"
    if control_home <= 1 - CONTROL_THRESHOLD:
        return "away_control"
    return "balanced"


# ---------- win projection (simplified Poisson, explained) ----------
BASE_GOALS_PER_90 = 1.65  # fitted on simulated matches (make live-calibration checks it)
LIVE_HALF_WEIGHT_MIN = 90  # live xG gets half the weight at this minute; also fitted
HOME_EDGE = 1.08
RED_ATTACK, RED_DEFENCE = 0.72, 0.85
MAX_GOALS = 10


def _poisson(mu: float) -> np.ndarray:
    k = np.arange(MAX_GOALS + 1)
    return np.exp(-mu) * mu ** k / np.array([math.factorial(int(i)) for i in k])


def project(tl: Timeline, minute: int) -> dict:
    """Final-result projection at `minute`: current score + Poisson goals in the
    time left. Scoring rates blend pre-match strength with live chance creation
    (xG per minute), weighted toward live data as the match goes on."""
    home, away = tl.match.home, tl.match.away
    prior = {
        "home": BASE_GOALS_PER_90 * home.attack * HOME_EDGE / away.defence / 90,
        "away": BASE_GOALS_PER_90 * away.attack / home.defence / 90,
    }
    live_weight = minute / (minute + LIVE_HALF_WEIGHT_MIN)
    rate, live_rate = {}, {}
    reds = {s: tl.cum(s, "reds", minute) for s in SIDES}
    for s in SIDES:
        opp = "away" if s == "home" else "home"
        live_rate[s] = tl.cum(s, "xg", minute) / minute if minute else prior[s]
        r = (1 - live_weight) * prior[s] + live_weight * live_rate[s]
        r *= RED_ATTACK ** reds[s] / RED_DEFENCE ** reds[opp]
        rate[s] = r
    left = max(FULL_TIME - minute, 0)
    h_now, a_now = tl.score(minute)
    ph, pa = _poisson(rate["home"] * left), _poisson(rate["away"] * left)
    grid = np.outer(ph, pa)
    diff = (h_now - a_now) + np.subtract.outer(np.arange(MAX_GOALS + 1), np.arange(MAX_GOALS + 1))
    total = grid.sum()
    return {
        "minute": minute,
        "home_win": float(grid[diff > 0].sum() / total),
        "draw": float(grid[diff == 0].sum() / total),
        "away_win": float(grid[diff < 0].sum() / total),
        "home_goals_rest": rate["home"] * left,
        "away_goals_rest": rate["away"] * left,
        "minutes_left": left,
        "home_rate90": rate["home"] * 90,
        "away_rate90": rate["away"] * 90,
        "home_live_rate90": live_rate["home"] * 90,
        "away_live_rate90": live_rate["away"] * 90,
        "home_reds": reds["home"],
        "away_reds": reds["away"],
        "live_weight": live_weight,
    }


# ---------- metric lines for the stats panel ----------

METRIC_DEFS: list[tuple[str, str, str | None, str]] = [
    ("goals", "Goals", None, "Goals scored."),
    ("xg", "Expected goals (xG)", None,
     "Sum of the chance quality of every shot: the probability each shot is scored."),
    ("shots", "Shots", None, "All attempts on goal."),
    ("sot", "Shots on target", None, "Shots that were scored or saved."),
    ("xt", "Expected threat added (xT)", None,
     "How much completed passes increased the chance of scoring, from a 12x8 zone grid "
     "learned from simulated matches."),
    ("possession", "Possession", "%", "Share of all passes played."),
    ("field_tilt", "Field tilt", "%", "Share of passes played in the final third."),
    ("pass_accuracy", "Pass accuracy", "%", "Completed passes / passes attempted."),
    ("avg_pass_length", "Average pass length", "m", "Mean distance of attempted passes."),
    ("pass_difficulty", "Average pass difficulty", "%",
     "1 - expected completion probability, from length, depth and pressure."),
    ("ppda", "PPDA (pressing)", None,
     "Opponent build-up passes allowed per defensive action high up the pitch. "
     "Lower = more intense pressing."),
    ("pressures", "Pressures", None, "Times a player closed down the ball carrier."),
    ("ball_wins", "Ball wins", None, "Tackles and interceptions."),
    ("top_shot_speed", "Fastest shot", "km/h", "Highest ball speed of any shot."),
    ("corners", "Corners", None, "Corners won."),
    ("fouls", "Fouls", None, "Fouls committed."),
]


def side_metrics(tl: Timeline, minute: int) -> dict[str, dict[str, float]]:
    ev = tl.until(minute)
    out: dict[str, dict[str, float]] = {}
    totals = {k: sum(tl.cum(s, k, minute) for s in SIDES) for k in ("passes", "final_third")}
    for s in SIDES:
        e = ev[ev["side"] == s]
        passes = e[e["type"] == "pass"]
        shots = e[e["type"] == "shot"]
        opp = "away" if s == "home" else "home"
        press_high = tl.cum(s, "press_high", minute)
        out[s] = {
            "goals": tl.cum(s, "goals", minute),
            "xg": round(tl.cum(s, "xg", minute), 2),
            "shots": tl.cum(s, "shots", minute),
            "sot": tl.cum(s, "sot", minute),
            "xt": round(tl.cum(s, "xt", minute), 2),
            "possession": round(100 * _share(tl.cum(s, "passes", minute),
                                             totals["passes"] - tl.cum(s, "passes", minute))),
            "field_tilt": round(100 * _share(tl.cum(s, "final_third", minute),
                                             totals["final_third"]
                                             - tl.cum(s, "final_third", minute))),
            "pass_accuracy": round(100 * (passes["outcome"] == "complete").mean())
            if len(passes) else 0,
            "avg_pass_length": round(float(passes["length_m"].mean()), 1) if len(passes) else 0,
            "pass_difficulty": round(100 * float(passes["difficulty"].mean()))
            if len(passes) else 0,
            "ppda": round(tl.cum(opp, "build_up", minute) / press_high, 1) if press_high else 0,
            "pressures": tl.cum(s, "pressures", minute),
            "ball_wins": float(e["type"].isin(["tackle", "interception"]).sum()),
            "top_shot_speed": round(float(shots["speed_kmh"].max()), 1) if len(shots) else 0,
            "corners": tl.cum(s, "corners", minute),
            "fouls": tl.cum(s, "fouls", minute),
        }
    return out


def window_ppda(tl: Timeline, side: str, minute: int, width: int = WINDOW) -> float | None:
    opp = "away" if side == "home" else "home"
    actions = tl.window(side, "press_high", minute, width)
    if actions == 0:
        return None
    return tl.window(opp, "build_up", minute, width) / actions


# ---------- players ----------

def player_lines(tl: Timeline, minute: int, only: str | None = None) -> list[dict]:
    ev = tl.until(minute)
    out = []
    for side, team in (("home", tl.match.home), ("away", tl.match.away)):
        e = ev[ev["side"] == side]
        for p in team.players:
            if only is not None and p.name != only:
                continue
            pe = e[e["player"] == p.name]
            passes = pe[pe["type"] == "pass"]
            shots = pe[pe["type"] == "shot"]
            blocks = [int(((pe["minute"] > a) & (pe["minute"] <= a + 15)).sum())
                      for a in range(0, FULL_TIME, 15)]
            out.append({
                "name": p.name, "number": p.number, "position": p.position, "team_id": team.id,
                "side": side,
                "touches": int(len(pe)),
                "passes": int(len(passes)),
                "passes_completed": int((passes["outcome"] == "complete").sum()),
                "pass_accuracy": round(100 * float((passes["outcome"] == "complete").mean()))
                if len(passes) else 0,
                "xt_added": round(float(pe["xt_added"].sum()), 3),
                "shots": int(len(shots)),
                "goals": int(shots["outcome"].eq("goal").sum()),
                "xg": round(float(shots["xg"].sum()), 2),
                "ball_wins": int(pe["type"].isin(["tackle", "interception"]).sum()),
                "pressures": int((pe["type"] == "pressure").sum()),
                "top_shot_speed_kmh": round(float(shots["speed_kmh"].max()), 1)
                if len(shots) else None,
                "involvement": blocks,
                "cards": [str(c) for c in pe[pe["type"] == "card"]["outcome"]],
            })
    return out


def impact_score(p: dict) -> float:
    """Simple player-of-the-match score: goals, chance quality, threat, ball wins."""
    return 1.0 * p["goals"] + 0.6 * p["xg"] + 4.0 * max(p["xt_added"], 0) + 0.05 * p["ball_wins"]
