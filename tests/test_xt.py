import json

import numpy as np
import pandas as pd

from live import metrics as M
from live import xt
from sim import simulate_season


def _counts(**cells):
    c = {"shots": np.zeros((12, 8)), "goals": np.zeros((12, 8)), "moves": np.zeros((12, 8)),
         "trans": np.zeros((12, 8, 12, 8))}
    for key, entries in cells.items():
        for idx, v in entries:
            c[key][idx] += v
    return c


def test_value_iteration_passes_threat_back():
    # Zone A always passes to zone B; B always shoots and scores half the time.
    a, b = (5, 4), (11, 4)
    c = _counts(moves=[(a, 10)], trans=[(a + b, 10)], shots=[(b, 10)], goals=[(b, 5)])
    grid = xt.solve(c)
    assert grid[b] == 0.5 and grid[a] == 0.5
    # A zone where passes fail half the time is worth half as much.
    c = _counts(moves=[(a, 10)], trans=[(a + b, 5)], shots=[(b, 10)], goals=[(b, 5)])
    assert xt.solve(c)[a] == 0.25


def test_possession_outcomes_mark_the_scoring_possession():
    ev = pd.DataFrame({
        "type": ["pass", "pass", "shot", "pass", "pass"],
        "side": ["home", "home", "home", "away", "away"],
        "outcome": ["complete", "complete", "goal", "complete", "incomplete"],
        "x": [30, 60, 90, 50, 55], "y": [50] * 5})
    out = xt.possession_outcomes(ev)
    assert out["scored"].tolist() == [1, 1, 1, 0, 0]


def test_load_falls_back_when_missing_or_broken(tmp_path):
    assert xt.load(tmp_path / "nope.json") is None
    bad = tmp_path / "bad.json"
    bad.write_text(json.dumps({"grid": [[1, 2], [3, 4]]}))
    assert xt.load(bad) is None
    good = tmp_path / "good.json"
    xt.save(np.full((12, 8), 0.01), n=1, seed=0, path=good)
    assert xt.load(good).shape == (12, 8)


def test_fitted_grid_has_the_right_shape():
    grid = xt.solve(xt.counts(m.events for m in simulate_season(40, seed=12)))
    centre = grid[:, 3:5].mean(axis=1)
    assert centre[-1] > centre[8] > centre[2]  # threat rises toward goal
    assert grid.max() < 0.6 and grid.min() >= 0


def test_live_metrics_use_a_valid_grid():
    assert M.XT_GRID.shape == (12, 8)
    assert M.XT_SOURCE in {"fitted", "hand-drawn"}
