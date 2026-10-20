import pytest

from contract import HalftimeReport
from model.features import FEATURE_COLUMNS, build_dataset, labels, match_features
from model.halftime import build_report
from model.predict import HeuristicPredictor
from sim import LEAGUE, simulate_match, simulate_season


@pytest.fixture(scope="module")
def match():
    return simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")


def test_features_use_first_half_only(match):
    f = match_features(match)
    assert set(f) == set(FEATURE_COLUMNS)
    late_goal_removed = match.events[match.events["minute"] <= 45]
    fh_goals = late_goal_removed[(late_goal_removed["type"] == "shot")
                                 & (late_goal_removed["outcome"] == "goal")]
    diff = (fh_goals["side"] == "home").sum() - (fh_goals["side"] == "away").sum()
    assert f["goal_diff"] == diff


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
