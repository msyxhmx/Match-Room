"""Expected threat (xT), learned from simulated matches with Karun Singh's value iteration.

The pitch is split into a 12 x 8 grid. For each zone we count, over many matches, what the
team on the ball did there:

- s(z): how often they shot, and g(z): how often a shot from z was scored;
- m(z) = 1 - s(z): how often they moved the ball, and T(z -> z'): where a move from z ended
  up. A failed pass ends the possession, so it moves the ball nowhere useful.

Then xT(z) = s(z) g(z) + m(z) * sum over z' of T(z -> z') xT(z'), repeated until it settles.
xT(z) reads as "the chance this possession ends in a goal, starting from z".

    .venv/bin/python -m live.xt --n 3000       # fit and write artifacts/xt_grid.json

Fitted only on synthetic matches; the brief forbids real match data.
"""

from __future__ import annotations

import argparse
import json
import os
from collections.abc import Iterable
from pathlib import Path

import numpy as np
import pandas as pd

XT_COLS, XT_ROWS = 12, 8
GRID_PATH = Path(os.getenv("XT_GRID", "artifacts/xt_grid.json"))


def zone(x, y) -> tuple[np.ndarray, np.ndarray]:
    ix = np.clip((np.asarray(x, float) / 100 * XT_COLS).astype(int), 0, XT_COLS - 1)
    iy = np.clip((np.asarray(y, float) / 100 * XT_ROWS).astype(int), 0, XT_ROWS - 1)
    return ix, iy


def counts(events: Iterable[pd.DataFrame]) -> dict[str, np.ndarray]:
    """Shot, goal, move and transition counts per zone from a stream of match events."""
    shots = np.zeros((XT_COLS, XT_ROWS))
    goals = np.zeros((XT_COLS, XT_ROWS))
    moves = np.zeros((XT_COLS, XT_ROWS))
    trans = np.zeros((XT_COLS, XT_ROWS, XT_COLS, XT_ROWS))
    for ev in events:
        sh = ev[ev["type"] == "shot"]
        ix, iy = zone(sh["x"], sh["y"])
        np.add.at(shots, (ix, iy), 1)
        np.add.at(goals, (ix, iy), (sh["outcome"] == "goal").to_numpy(float))
        ps = ev[ev["type"] == "pass"]
        ix, iy = zone(ps["x"], ps["y"])
        np.add.at(moves, (ix, iy), 1)
        ok = (ps["outcome"] == "complete").to_numpy()
        ex, ey = zone(ps["end_x"], ps["end_y"])
        np.add.at(trans, (ix[ok], iy[ok], ex[ok], ey[ok]), 1)
    return {"shots": shots, "goals": goals, "moves": moves, "trans": trans}


def solve(c: dict[str, np.ndarray], iters: int = 200, tol: float = 1e-9) -> np.ndarray:
    """Value iteration on the counts. Returns the 12 x 8 xT grid."""
    total = c["shots"] + c["moves"]
    with np.errstate(invalid="ignore", divide="ignore"):
        s = np.where(total > 0, c["shots"] / total, 0.0)
        g = np.where(c["shots"] > 0, c["goals"] / c["shots"], 0.0)
        m = np.where(total > 0, c["moves"] / total, 0.0)
        t = np.where(c["moves"][..., None, None] > 0,
                     c["trans"] / c["moves"][..., None, None], 0.0)
    xt = np.zeros((XT_COLS, XT_ROWS))
    for _ in range(iters):
        new = s * g + m * np.einsum("abcd,cd->ab", t, xt)
        if np.abs(new - xt).max() < tol:
            return new
        xt = new
    return xt


def fit(n: int = 3000, seed: int = 404) -> np.ndarray:
    from sim import simulate_season

    grid = solve(counts(m.events for m in simulate_season(n, seed=seed)))
    return (grid + grid[:, ::-1]) / 2  # the pitch is left-right symmetric: halve the noise


def save(grid: np.ndarray, n: int, seed: int, path: Path = GRID_PATH) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"n_matches": n, "seed": seed, "cols": XT_COLS, "rows": XT_ROWS,
                                "grid": np.round(grid, 5).tolist()}, indent=1) + "\n")


def load(path: Path = GRID_PATH) -> np.ndarray | None:
    """The fitted grid, or None if it is missing or the wrong shape (the caller falls back)."""
    try:
        grid = np.array(json.loads(path.read_text())["grid"], dtype=float)
    except (OSError, ValueError, KeyError, TypeError):
        return None
    return grid if grid.shape == (XT_COLS, XT_ROWS) and np.isfinite(grid).all() else None


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--n", type=int, default=3000)
    p.add_argument("--seed", type=int, default=404)
    p.add_argument("--out", type=Path, default=GRID_PATH)
    args = p.parse_args()
    grid = fit(args.n, args.seed)
    save(grid, args.n, args.seed, args.out)
    print(f"wrote {args.out}; xT ranges {grid.min():.4f}-{grid.max():.4f}")
    for j in reversed(range(XT_ROWS)):
        print(" ".join(f"{grid[i, j]:.3f}" for i in range(XT_COLS)))


if __name__ == "__main__":
    main()
