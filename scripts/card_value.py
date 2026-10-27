"""Do the live cards mean anything? How often each fires, how often it repeats, and whether
the side it names scores the next goal more often than team strength alone predicts.

    .venv/bin/python scripts/card_value.py --n 400

For every card naming a side, at minute m: did that side score next, within the following
15 minutes? The expected rate comes from pre-match scoring rates only (strength, home edge,
red cards so far), with no live information:

    P(side scores next within W) = r_side / (r_side + r_opp) * (1 - exp(-(r_side + r_opp) W))

Lift = observed - expected. A card that "predicts" has a lift clearly above zero. The
`random_minute` row picks random minutes and sides: its lift should be about zero, which
checks the baseline itself is fair.
"""

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path

import numpy as np

from live import metrics as M
from live.insights import detect
from sim import simulate_season

WINDOW = 15
REPEAT_WITHIN = 10


def prior_rates(tl: M.Timeline, minute: int) -> dict[str, float]:
    home, away = tl.match.home, tl.match.away
    rate = {"home": M.BASE_GOALS_PER_90 * home.attack * M.HOME_EDGE / away.defence / 90,
            "away": M.BASE_GOALS_PER_90 * away.attack / home.defence / 90}
    reds = {s: tl.cum(s, "reds", minute) for s in M.SIDES}
    for s, o in (("home", "away"), ("away", "home")):
        rate[s] *= M.RED_ATTACK ** reds[s] / M.RED_DEFENCE ** reds[o]
    return rate


def next_goal_side(goals: list[tuple[int, str]], minute: int) -> str | None:
    for gm, side in goals:
        if minute < gm <= minute + WINDOW:
            return side
    return None


def evaluate(n: int, seed: int) -> dict:
    rows: dict[str, list[tuple[float, float]]] = defaultdict(list)
    fired: dict[str, int] = defaultdict(int)
    repeats: dict[str, int] = defaultdict(int)
    rng = np.random.default_rng(seed)
    for match in simulate_season(n, seed=seed):
        tl = M.build_timeline(match)
        ev = tl.events
        g = ev[ev["is_goal"]]
        goals = list(zip(g["minute"].astype(int), g["side"], strict=True))
        last: dict[tuple[str, str | None], int] = {}
        cards = [(i.type, i.minute, i.side) for i in detect(tl)]
        picks = rng.integers(10, 80, size=4)
        cards += [("random_minute", int(m), str(rng.choice(["home", "away"]))) for m in picks]
        for kind, minute, side in cards:
            if kind != "random_minute":
                fired[kind] += 1
                key = (kind, side)
                if key in last and minute - last[key] <= REPEAT_WITHIN:
                    repeats[kind] += 1
                last[key] = minute
            if side not in ("home", "away") or kind == "goal" or minute > 90 - WINDOW:
                continue
            r = prior_rates(tl, minute)
            opp = "away" if side == "home" else "home"
            total = r[side] + r[opp]
            expected = r[side] / total * (1 - np.exp(-total * WINDOW))
            rows[kind].append((float(next_goal_side(goals, minute) == side), float(expected)))

    out = {"n_matches": n, "seed": seed, "window_min": WINDOW, "cards": {}}
    for kind in sorted(set(fired) | set(rows)):
        obs = np.array([o for o, _ in rows.get(kind, [])])
        exp = np.array([e for _, e in rows.get(kind, [])])
        entry: dict = {"per_match": round(fired.get(kind, 0) / n, 2),
                       "repeat_share": round(repeats.get(kind, 0) / fired[kind], 3)
                       if fired.get(kind) else None}
        if len(obs) >= 30:
            se = float(np.sqrt(np.sum(exp * (1 - exp))) / len(obs))
            lift = float(obs.mean() - exp.mean())
            entry.update({"tested": int(len(obs)), "scored_next": round(float(obs.mean()), 3),
                          "expected": round(float(exp.mean()), 3), "lift": round(lift, 3),
                          "z": round(lift / se, 1) if se else None})
        out["cards"][kind] = entry
    return out


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--n", type=int, default=400)
    p.add_argument("--seed", type=int, default=31)
    p.add_argument("--out", type=Path, default=None)
    args = p.parse_args()
    res = evaluate(args.n, args.seed)
    print(f"{'card':<20}{'/match':>7}{'repeat':>8}{'tested':>8}{'scored':>8}{'expect':>8}"
          f"{'lift':>7}{'z':>6}")
    for kind, e in res["cards"].items():
        rep = f"{e['repeat_share']:.0%}" if e["repeat_share"] is not None else "-"
        if "tested" in e:
            print(f"{kind:<20}{e['per_match']:>7}{rep:>8}{e['tested']:>8}{e['scored_next']:>8.1%}"
                  f"{e['expected']:>8.1%}{e['lift']:>+7.1%}{e['z']:>6}")
        else:
            print(f"{kind:<20}{e['per_match']:>7}{rep:>8}")
    if args.out:
        args.out.write_text(json.dumps(res, indent=2) + "\n")


if __name__ == "__main__":
    main()
