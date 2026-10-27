"""First-half features (Interpret stage).

Everything here uses only events up to minute 45, so nothing from the second
half leaks into the model. Labels (final result, next goal) are computed
separately in `labels()`.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from sim.simulator import SimulatedMatch

HALF = 45
BLOCKS = [(1, 15), (16, 30), (31, 45)]

# Human-readable names, used by the explanation and story layers.
FEATURE_LABELS: dict[str, str] = {
    "goal_diff": "Half-time goal difference",
    "xg_diff": "xG difference",
    "shots_diff": "Shot difference",
    "sot_diff": "Shots on target difference",
    "possession_home": "Home possession share",
    "tilt_home": "Home field tilt (final-third share)",
    "pass_acc_diff": "Pass accuracy difference",
    "corners_diff": "Corner difference",
    "yellow_diff": "Yellow card difference",
    "red_diff": "Red card difference",
    "momentum_last15": "Home share of final-third play, 31-45'",
    "momentum_trend": "Momentum change, first to last 15'",
    "strength_diff": "Pre-match strength gap",
}
FEATURE_COLUMNS = list(FEATURE_LABELS)


def side_stats(first_half: pd.DataFrame, side: str) -> dict[str, float]:
    ev = first_half[first_half["side"] == side]
    passes = ev[ev["type"] == "pass"]
    shots = ev[ev["type"] == "shot"]
    cards = ev[ev["type"] == "card"]
    return {
        "goals": float((shots["outcome"] == "goal").sum()),
        "shots": float(len(shots)),
        "sot": float(shots["outcome"].isin(["goal", "saved"]).sum()),
        "xg": float(shots["xg"].sum()),
        "passes": float(len(passes)),
        "pass_acc": float((passes["outcome"] == "complete").mean()) if len(passes) else 0.0,
        "final_third_passes": float((passes["x"] > 66).sum()),
        "corners": float((ev["type"] == "corner").sum()),
        "fouls": float((ev["type"] == "foul").sum()),
        "yellow": float((cards["outcome"] == "yellow").sum()),
        "red": float((cards["outcome"] == "red").sum()),
    }


def tilt_by_block(first_half: pd.DataFrame) -> list[float]:
    """Home share of final-third passes in each 15-minute block (0.5 = even)."""
    out = []
    for start, end in BLOCKS:
        blk = first_half[(first_half["minute"] >= start) & (first_half["minute"] <= end)]
        ft = blk[(blk["type"] == "pass") & (blk["x"] > 66)]
        home, total = (ft["side"] == "home").sum(), len(ft)
        out.append(float(home / total) if total else 0.5)
    return out


def match_features(match: SimulatedMatch) -> dict[str, float]:
    fh = match.first_half()
    h, a = side_stats(fh, "home"), side_stats(fh, "away")
    tilt = tilt_by_block(fh)
    total_passes = h["passes"] + a["passes"]
    total_ft = h["final_third_passes"] + a["final_third_passes"]
    return {
        "goal_diff": h["goals"] - a["goals"],
        "xg_diff": round(h["xg"] - a["xg"], 3),
        "shots_diff": h["shots"] - a["shots"],
        "sot_diff": h["sot"] - a["sot"],
        "possession_home": round(h["passes"] / total_passes, 3) if total_passes else 0.5,
        "tilt_home": round(h["final_third_passes"] / total_ft, 3) if total_ft else 0.5,
        "pass_acc_diff": round(h["pass_acc"] - a["pass_acc"], 3),
        "corners_diff": h["corners"] - a["corners"],
        "yellow_diff": h["yellow"] - a["yellow"],
        "red_diff": h["red"] - a["red"],
        "momentum_last15": round(tilt[-1], 3),
        "momentum_trend": round(tilt[-1] - tilt[0], 3),
        "strength_diff": round(
            (match.home.attack + match.home.defence) - (match.away.attack + match.away.defence), 3
        ),
    }


def labels(match: SimulatedMatch) -> dict[str, str]:
    h, a = match.final_score()
    result = "home_win" if h > a else "away_win" if a > h else "draw"
    goals = match.events[(match.events["type"] == "shot") & (match.events["outcome"] == "goal")]
    later = goals[goals["minute"] > HALF]
    next_goal = later.iloc[0]["side"] if len(later) else "none"
    return {"result": result, "next_goal": next_goal}


def baseline_inputs(match: SimulatedMatch) -> dict[str, float]:
    """What the Dixon-Coles baseline needs: pre-match strengths, the half-time score, and
    (as its training target only) second-half goals. Not model features."""
    goals = match.events[(match.events["type"] == "shot") & (match.events["outcome"] == "goal")]
    first = goals[goals["minute"] <= HALF]
    second = goals[goals["minute"] > HALF]
    return {
        "home_attack": match.home.attack, "home_defence": match.home.defence,
        "away_attack": match.away.attack, "away_defence": match.away.defence,
        "ht_home": float((first["side"] == "home").sum()),
        "ht_away": float((first["side"] == "away").sum()),
        "h2_home": float((second["side"] == "home").sum()),
        "h2_away": float((second["side"] == "away").sum()),
    }


def build_dataset(matches: list[SimulatedMatch]) -> pd.DataFrame:
    rows = []
    for m in matches:
        rows.append({"match_id": m.match_id, **match_features(m), **labels(m),
                     **baseline_inputs(m)})
    df = pd.DataFrame(rows)
    df[FEATURE_COLUMNS] = df[FEATURE_COLUMNS].astype(np.float64)
    return df
