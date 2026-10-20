"""Generate synthetic matches to inspect: python -m sim --n 5 --out data/raw/events.csv"""

import argparse
from pathlib import Path

import pandas as pd

from sim.simulator import simulate_season


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--n", type=int, default=5)
    parser.add_argument("--seed", type=int, default=0)
    parser.add_argument("--out", type=Path, default=Path("data/raw/events.csv"))
    args = parser.parse_args()

    matches = simulate_season(args.n, seed=args.seed)
    events = pd.concat([m.events for m in matches], ignore_index=True)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    events.to_csv(args.out, index=False)
    for m in matches:
        h, a = m.final_score()
        print(f"{m.match_id}: {m.home.name} {h}-{a} {m.away.name} ({len(m.events)} events)")
    print(f"wrote {len(events)} events to {args.out}")


if __name__ == "__main__":
    main()
