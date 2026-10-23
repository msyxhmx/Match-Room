"""Print the distributions behind the live engine's thresholds.

    .venv/bin/python scripts/calibrate_live.py --n 200

Use it after changing the simulator: the chaos normalisers in live/metrics.py
(CHAOS_NORM) should sit near the 90th percentiles printed here, and the
control / chaos thresholds should leave each phase a sensible share of minutes.
"""

import argparse
from collections import Counter

import numpy as np

from live import metrics as M
from sim import simulate_season


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--n", type=int, default=200)
    args = parser.parse_args()

    turn, vol, threat, control, chaos, phases = [], [], [], [], [], Counter()
    for match in simulate_season(args.n, seed=77):
        tl = M.build_timeline(match)
        pm = tl.per_min
        for m in range(M.WINDOW, M.FULL_TIME + 1):
            lo = m - M.WINDOW + 1
            turn.append(sum(pm[s]["turnovers"][lo:m + 1].sum() for s in M.SIDES) / M.WINDOW)
            threat.append(sum(pm[s]["threat"][lo:m + 1].sum() for s in M.SIDES) / M.WINDOW)
            vol.append(float(np.std(tl.momentum[lo:m + 1])))
            control.append(tl.control_home[m])
            chaos.append(tl.chaos[m])
            phases[tl.phase[m]] += 1

    def pct(name, xs):
        q = np.percentile(xs, [10, 50, 90, 97])
        print(f"{name:<12} p10={q[0]:.3f} p50={q[1]:.3f} p90={q[2]:.3f} p97={q[3]:.3f}")

    pct("turnovers", turn)
    pct("volatility", vol)
    pct("threat", threat)
    pct("control", control)
    pct("chaos", chaos)
    total = sum(phases.values())
    print({k: f"{v / total:.0%}" for k, v in phases.items()})


if __name__ == "__main__":
    main()
