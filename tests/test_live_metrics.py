import copy

import numpy as np
import pytest

from live import metrics as M
from live.insights import detect
from sim import LEAGUE, simulate_match, simulate_scenario

CUT = 60


@pytest.fixture(scope="module")
def match():
    return simulate_match(LEAGUE[1], LEAGUE[4], seed=21, match_id="LIVE-1")


def _truncated(match, minute):
    cut = copy.deepcopy(match)
    cut.events = cut.events[cut.events["minute"] <= minute].reset_index(drop=True)
    return cut


def test_no_future_leakage(match):
    """State and insights at minute m must not depend on anything after m."""
    full = M.build_timeline(match)
    cut = M.build_timeline(_truncated(match, CUT))
    for m in (1, 15, 45, CUT):
        assert full.score(m) == cut.score(m)
        assert full.momentum[m] == pytest.approx(cut.momentum[m])
        assert full.control_home[m] == pytest.approx(cut.control_home[m])
        assert full.chaos[m] == pytest.approx(cut.chaos[m])
        assert full.projection[m]["home_win"] == pytest.approx(cut.projection[m]["home_win"])
        assert M.side_metrics(full, m) == M.side_metrics(cut, m)
    early = [(i.type, i.minute, i.facts.keys()) for i in detect(full) if i.minute <= CUT]
    late = [(i.type, i.minute, i.facts.keys()) for i in detect(cut) if i.minute <= CUT]
    assert early == late


def test_xt_rises_towards_goal():
    centre = [float(M.xt_at(np.array([x]), np.array([50.0]))[0]) for x in (10, 50, 80, 95)]
    assert centre == sorted(centre) and centre[-1] > 5 * centre[0]


def test_pass_difficulty_grows_with_length_and_pressure():
    p = M.completion_prob(np.array([10.0, 40.0, 40.0]), np.array([50.0, 50.0, 50.0]),
                          np.array([False, False, True]))
    assert p[0] > p[1] > p[2]


def test_ranges_and_projection(match):
    tl = M.build_timeline(match)
    assert (tl.control_home >= 0).all() and (tl.control_home <= 1).all()
    assert (tl.chaos >= 0).all() and (tl.chaos <= 1).all()
    assert (np.abs(tl.momentum) <= 1).all()
    for p in tl.projection:
        assert p["home_win"] + p["draw"] + p["away_win"] == pytest.approx(1, abs=1e-6)
    h, a = tl.score(M.FULL_TIME)
    final = tl.projection[M.FULL_TIME]
    expected = "home_win" if h > a else "away_win" if a > h else "draw"
    assert final[expected] == pytest.approx(1)
    assert set(tl.phase) <= set(M.PHASES)


def test_red_card_lowers_projection():
    tl = M.build_timeline(simulate_scenario("red-card"))
    assert tl.projection[30]["home_win"] < tl.projection[29]["home_win"]
