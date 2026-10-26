"""Is the live "chance to win" honest? Score it minute by minute on fresh simulated matches.

    .venv/bin/python scripts/check_live_calibration.py --n 2000

For each checkpoint minute it runs the live projection (live/metrics.py `project`) on every
match and compares it with the final result: log loss, RPS, accuracy, and calibration
(mean ECE plus a reliability table per class). Writes artifacts/live_calibration.json.
Uses its own seed, so these matches are not the ones the half-time model trained on.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np

from live import metrics as M
from model.evaluation import calibration, score
from sim import simulate_season

CLASSES = ["home_win", "draw", "away_win"]
MINUTES = [10, 20, 30, 45, 60, 75, 85]


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--n", type=int, default=2000)
    p.add_argument("--seed", type=int, default=2026)
    p.add_argument("--out", type=Path, default=Path("artifacts/live_calibration.json"))
    args = p.parse_args()

    proba = {m: [] for m in MINUTES}
    y = []
    for match in simulate_season(args.n, seed=args.seed):
        tl = M.build_timeline(match)
        h, a = match.final_score()
        y.append(0 if h > a else 2 if a > h else 1)
        for m in MINUTES:
            pr = M.project(tl, m)
            proba[m].append([pr["home_win"], pr["draw"], pr["away_win"]])
    y = np.array(y)

    out = {"n_matches": args.n, "seed": args.seed, "by_minute": {}}
    print(f"{'minute':>6}{'log loss':>10}{'RPS':>8}{'accuracy':>10}{'mean ECE':>10}"
          f"{'draw said':>11}{'draw real':>11}")
    for m in MINUTES:
        pm = np.array(proba[m])
        cal = calibration(y, pm, CLASSES)
        out["by_minute"][str(m)] = {**score(y, pm, ordered=True), "calibration": cal,
                                    "mean_predicted": dict(zip(CLASSES, pm.mean(0).round(3)
                                                               .tolist(), strict=True))}
        s = out["by_minute"][str(m)]
        print(f"{m:>6}{s['log_loss']:>10.4f}{s['rps']:>8.4f}{s['accuracy']:>10.1%}"
              f"{cal['mean_ece']:>10.4f}{pm[:, 1].mean():>11.1%}{(y == 1).mean():>11.1%}")
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(out, indent=2))
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
