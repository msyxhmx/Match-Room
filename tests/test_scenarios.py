from sim import LEAGUE, SCENARIOS, simulate_match, simulate_scenario
from sim.simulator import EVENT_COLUMNS


def _ht(match):
    fh = match.first_half()
    g = fh[(fh["type"] == "shot") & (fh["outcome"] == "goal")]
    return int((g["side"] == "home").sum()), int((g["side"] == "away").sum())


def test_scenarios_tell_their_story():
    comeback = simulate_scenario("comeback")
    assert _ht(comeback) == (0, 2)
    h, a = comeback.final_score()
    assert h > a

    red = simulate_scenario("red-card")
    reds = red.events[(red.events["type"] == "card") & (red.events["outcome"] == "red")]
    assert ((reds["minute"] == 30) & (reds["side"] == "home")).any()


def test_scenarios_are_deterministic_and_labelled():
    for key in SCENARIOS:
        a, b = simulate_scenario(key), simulate_scenario(key)
        assert a.events.equals(b.events)
        assert a.scenario == key and a.match_id == f"SCN-{key}"


def test_enrichment_shape():
    m = simulate_match(LEAGUE[0], LEAGUE[1], seed=4)
    ev = m.events
    assert list(ev.columns) == EVENT_COLUMNS
    passes = ev[ev["type"] == "pass"]
    assert passes["end_x"].notna().all() and passes["speed_kmh"].notna().all()
    assert passes["under_pressure"].notna().all()
    shots = ev[ev["type"] == "shot"]
    assert shots["speed_kmh"].between(35, 132).all()
    # every failed pass is won back by the other side
    failed = int((passes["outcome"] == "incomplete").sum())
    assert int(ev["type"].isin(["tackle", "interception"]).sum()) == failed
    assert set(ev["type"]) <= {"pass", "shot", "foul", "card", "corner", "pressure", "tackle",
                               "interception"}
    assert {"venue", "referee", "attendance", "weather"} <= set(m.meta)
