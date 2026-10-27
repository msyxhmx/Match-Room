import pandas as pd
import pytest

pytest.importorskip("kloppy")

from contract import Profile  # noqa: E402
from live.engine import MatchEngine  # noqa: E402
from sim import LEAGUE, simulate_match, simulate_scenario  # noqa: E402
from sim.kloppy_io import from_kloppy, match_from_kloppy, to_kloppy  # noqa: E402


def test_round_trip_is_exact():
    m = simulate_match(LEAGUE[0], LEAGUE[3], seed=9, match_id="RT-1")
    back = from_kloppy(to_kloppy(m))
    pd.testing.assert_frame_equal(m.events.reset_index(drop=True), back.reset_index(drop=True),
                                  check_dtype=False)


def test_dataset_metadata():
    m = simulate_scenario("comeback")
    ds = to_kloppy(m)
    assert [t.team_id for t in ds.metadata.teams] == ["NGC", "KST"]
    assert (ds.metadata.score.home, ds.metadata.score.away) == m.final_score()
    assert len(ds.records) == len(m.events)


def test_live_engine_runs_on_a_kloppy_feed():
    m = simulate_scenario("comeback")
    engine = MatchEngine(match_from_kloppy(to_kloppy(m)))
    assert "come from behind" in engine.brief("fulltime", Profile()).headline
