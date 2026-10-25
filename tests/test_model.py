import copy

import pandas as pd
import pytest

from contract import HalftimeReport
from model.features import FEATURE_COLUMNS, build_dataset, labels, match_features
from model.halftime import build_report
from model.predict import HeuristicPredictor, load_predictor
from sim import LEAGUE, simulate_match, simulate_season


@pytest.fixture(scope="module")
def match():
    return simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")


def test_features_use_first_half_only(match):
    baseline = match_features(match)
    assert set(baseline) == set(FEATURE_COLUMNS)

    # Dropping every event after minute 45 must not change the features.
    dropped = copy.deepcopy(match)
    dropped.events = dropped.events[dropped.events["minute"] <= 45].reset_index(drop=True)
    assert match_features(dropped) == baseline

    # Adding extra goals after minute 45 must not change the features.
    with_extra = copy.deepcopy(match)
    extra = match.events.iloc[[0]].copy()
    extra["event_id"] = "EXTRA-GOAL"
    extra["minute"] = 90
    extra["type"] = "shot"
    extra["outcome"] = "goal"
    extra["xg"] = 0.8
    extra["side"] = "home"
    with_extra.events = pd.concat([match.events, extra], ignore_index=True).reset_index(drop=True)
    assert match_features(with_extra) == baseline


def test_labels(match):
    lab = labels(match)
    assert lab["result"] in {"home_win", "draw", "away_win"}
    assert lab["next_goal"] in {"home", "away", "none"}


def test_dataset_shape():
    df = build_dataset(simulate_season(20, seed=9))
    assert len(df) == 20 and set(FEATURE_COLUMNS) <= set(df.columns)


def test_heuristic_probabilities_sum_to_one(match):
    p = HeuristicPredictor().predict(match_features(match))
    assert abs(p.result.home_win + p.result.draw + p.result.away_win - 1) < 0.01
    assert abs(p.next_goal.home + p.next_goal.away + p.next_goal.none - 1) < 0.01
    assert len(p.factors) == 3


def test_report_matches_contract(match):
    report = build_report(match, HeuristicPredictor())
    HalftimeReport.model_validate(report.model_dump())
    assert 3 <= len(report.story) <= 5
    event_ids = set(match.events["event_id"])
    for card in report.story:
        assert all(e.event_id in event_ids for e in card.evidence)


def test_load_predictor_falls_back_on_corrupt_artifact(tmp_path):
    bad = tmp_path / "model.joblib"
    bad.write_text("not a valid joblib artifact")
    predictor = load_predictor(bad)
    assert isinstance(predictor, HeuristicPredictor)
    assert predictor.version == "heuristic-v0"


def test_load_predictor_falls_back_on_feature_mismatch(tmp_path):
    import joblib

    stale = tmp_path / "model.joblib"
    joblib.dump({"version": "xgb-old", "features": FEATURE_COLUMNS[:-1]}, stale)
    assert isinstance(load_predictor(stale), HeuristicPredictor)
