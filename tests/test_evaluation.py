import numpy as np
import pandas as pd

from model.dixon_coles import DixonColes
from model.evaluation import calibration, reliability, rps, score
from model.features import baseline_inputs, match_features
from sim import LEAGUE, simulate_match, simulate_season


def test_rps_rewards_near_misses():
    # The away side won (class 2). Calling a draw is closer than calling a home win.
    assert rps([2], [[0, 0, 1]]) == 0
    assert rps([2], [[0, 1, 0]]) < rps([2], [[1, 0, 0]])
    assert abs(rps([2], [[1, 0, 0]]) - 1.0) < 1e-12


def test_reliability_is_zero_when_forecasts_come_true():
    # Said 20% ten times, it happened twice; said 80% ten times, it happened eight times.
    p = np.array([0.2] * 10 + [0.8] * 10)
    hit = np.array([1] * 2 + [0] * 8 + [1] * 8 + [0] * 2)
    ece, table = reliability(hit, p)
    assert ece == 0 and [r["n"] for r in table] == [10, 10]


def test_calibration_and_score_shapes():
    y = np.array([0, 1, 2, 0])
    p = np.array([[0.6, 0.3, 0.1], [0.3, 0.4, 0.3], [0.1, 0.3, 0.6], [0.5, 0.3, 0.2]])
    cal = calibration(y, p, ["home_win", "draw", "away_win"])
    assert set(cal["per_class"]) == {"home_win", "draw", "away_win"} and cal["mean_ece"] >= 0
    assert set(score(y, p, ordered=True)) == {"log_loss", "accuracy", "rps"}
    assert "rps" not in score(y, p)


def test_baseline_inputs_use_first_half_for_the_score():
    m = simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")
    b = baseline_inputs(m)
    assert b["ht_home"] - b["ht_away"] == match_features(m)["goal_diff"]
    assert (b["ht_home"] + b["h2_home"], b["ht_away"] + b["h2_away"]) == m.final_score()


def test_dixon_coles_probabilities():
    rows = []
    for m in simulate_season(150, seed=3):
        rows.append(baseline_inputs(m))
    df = pd.DataFrame(rows)
    model = DixonColes().fit(df)
    p = model.predict_proba(df)
    assert np.allclose(p.sum(axis=1), 1)
    # A two-goal half-time lead must make the home win more likely than level at the break.
    level = df.iloc[[0]].assign(ht_home=0.0, ht_away=0.0)
    ahead = df.iloc[[0]].assign(ht_home=2.0, ht_away=0.0)
    assert model.predict_proba(ahead)[0, 0] > model.predict_proba(level)[0, 0]
