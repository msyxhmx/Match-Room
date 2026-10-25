from sim import LEAGUE, simulate_match, simulate_season
from sim.simulator import EVENT_COLUMNS


def test_simulation_is_deterministic():
    a = simulate_match(LEAGUE[0], LEAGUE[1], seed=1)
    b = simulate_match(LEAGUE[0], LEAGUE[1], seed=1)
    assert a.events.equals(b.events)


def test_events_have_contract_shape():
    m = simulate_match(LEAGUE[2], LEAGUE[3], seed=5)
    assert list(m.events.columns) == EVENT_COLUMNS
    assert m.events["minute"].between(1, 90).all()
    assert m.events["x"].between(0, 100).all()
    assert m.events["event_id"].is_unique


def test_goal_rate_is_football_like():
    matches = simulate_season(150, seed=3)
    avg = sum(sum(m.final_score()) for m in matches) / len(matches)
    assert 2.0 < avg < 3.8


def test_cards_follow_their_foul():
    for m in simulate_season(20, seed=3):
        ev = m.events.reset_index(drop=True)
        for i in ev.index[ev["type"] == "card"]:
            foul = ev.loc[:i - 1][ev.loc[:i - 1]["type"] == "foul"].iloc[-1]
            card = ev.loc[i]
            assert (foul["minute"], foul["second"], foul["player"]) == (
                card["minute"], card["second"], card["player"])


def test_shots_stay_on_the_pitch():
    for m in simulate_season(20, seed=3):
        assert m.events["x"].max() <= 100
