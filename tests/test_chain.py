import pytest

from sim import LEAGUE, simulate_match, simulate_season
from sim.chain import shot_xg
from sim.simulator import ENGINES, EVENT_COLUMNS


@pytest.mark.parametrize("engine", ENGINES)
def test_both_engines_follow_the_contract(engine):
    m = simulate_match(LEAGUE[2], LEAGUE[3], seed=5, engine=engine)
    assert list(m.events.columns) == EVENT_COLUMNS
    assert m.events["minute"].between(1, 90).all()
    assert m.events["x"].between(0, 100).all() and m.events["y"].between(0, 100).all()
    assert m.events["event_id"].is_unique
    again = simulate_match(LEAGUE[2], LEAGUE[3], seed=5, engine=engine)
    assert m.events.equals(again.events)


def test_unknown_engine_is_rejected():
    with pytest.raises(ValueError):
        simulate_match(LEAGUE[0], LEAGUE[1], seed=1, engine="nope")


def test_the_ball_moves_from_event_to_event():
    """A completed pass ends where the same side's next pass or shot starts (plus a forward
    carry), unless the other side touched the ball in between."""
    checked = 0
    for m in simulate_season(10, seed=3, engine="chain"):
        last = None
        for row in m.events.itertuples():
            if last is not None and (row.minute > 45) != (last.minute > 45):
                last = None  # half-time kick-off
            if row.type in ("interception", "tackle", "corner") or (
                    row.type in ("pass", "shot") and last is not None and row.side != last.side):
                last = None
            if row.type in ("pass", "shot") and last is not None:
                assert row.y == pytest.approx(last.end_y, abs=0.051)
                assert row.x >= last.end_x - 0.051
                checked += 1
            if row.type == "shot":
                last = None
            elif row.type == "pass":
                last = row if row.outcome == "complete" else None
    assert checked > 3000


def test_xg_comes_from_location():
    assert shot_xg(95, 50) > shot_xg(89.5, 50) > shot_xg(83, 50) > shot_xg(75, 50)
    assert shot_xg(89.5, 50) > shot_xg(89.5, 80)  # tight angle
    assert 0.15 < shot_xg(89.5, 50) < 0.35  # penalty-spot distance, open play
    for m in simulate_season(10, seed=4, engine="chain"):
        shots = m.events[m.events["type"] == "shot"]
        far = shots[shots["x"] < 78]["xg"]
        near = shots[(shots["x"] > 92) & (shots["y"].between(40, 60))]["xg"]
        if len(far) and len(near):
            assert far.mean() < near.mean()


def test_events_stay_in_their_half():
    for m in simulate_season(20, seed=6, engine="chain"):
        ev = m.events
        assert ev["second"].between(0, 59).all()
        assert list(ev["minute"]) == sorted(ev["minute"])
        assert (ev["minute"] <= 45).any() and (ev["minute"] > 45).any()


def test_chain_totals_are_football_like():
    ms = simulate_season(120, seed=8, engine="chain")
    n = len(ms)
    goals = sum(sum(m.final_score()) for m in ms) / n
    passes = sum((m.events["type"] == "pass").sum() for m in ms) / n
    shots = sum((m.events["type"] == "shot").sum() for m in ms) / n
    assert 2.4 < goals < 3.8 and 650 < passes < 950 and 18 < shots < 32


def test_nobody_receives_their_own_pass():
    for m in simulate_season(10, seed=3, engine="chain"):
        last, half = None, 1
        for row in m.events.itertuples():
            if row.minute > 45 and half == 1:
                half, last = 2, None
            if row.type in ("pass", "shot") and last is not None and row.side == last[0]:
                assert row.player != last[1], (row.minute, row.player)
            if row.type == "pass":
                last = (row.side, row.player) if row.outcome == "complete" else None
            elif row.type in ("shot", "interception", "tackle"):
                last = None
