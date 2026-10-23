from model.halftime import build_report
from model.predict import load_predictor
from model.story import possessive
from sim import simulate_season


def test_possessive():
    assert possessive("Riverside Rovers") == "Riverside Rovers'"
    assert possessive("Harbour Athletic") == "Harbour Athletic's"


def test_what_to_watch_skips_fixed_factors():
    predictor = load_predictor()
    for match in simulate_season(6, seed=2026):
        report = build_report(match, predictor)
        for item in report.what_to_watch:
            title = item.title.lower()
            assert "goal difference" not in title
            assert "strength" not in title