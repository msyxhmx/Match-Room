import pytest

from contract import LiveSnapshot, MatchBrief, Profile, SeasonReport
from live.engine import MatchEngine
from live.season import season_report
from sim import simulate_scenario


@pytest.fixture(scope="module")
def engine():
    return MatchEngine(simulate_scenario("comeback"))


def test_snapshot_matches_contract(engine):
    snap = engine.snapshot(67, Profile(persona="analyst", language="ms", team="NGC"))
    LiveSnapshot.model_validate(snap.model_dump())
    assert snap.period == "2H" and len(snap.series.minute) == 68
    assert all(c.minute <= 67 for c in snap.cards)
    assert [c.minute for c in snap.cards] == sorted((c.minute for c in snap.cards), reverse=True)
    assert all(m.definition for m in snap.metrics)


def test_casual_is_a_subset_of_analyst(engine):
    casual = {c.insight_id for c in engine.cards(Profile(persona="casual"))}
    analyst = {c.insight_id for c in engine.cards(Profile(persona="analyst"))}
    assert casual < analyst


def test_focus_player_and_team_personalise(engine):
    player = engine.match.home.players[9].name
    profile = Profile(team="NGC", player=player)
    cards = engine.cards(profile)
    assert any(c.type == "player_focus" and "focus_player" in c.tags for c in cards)
    assert all("your_team" in c.tags for c in cards if c.team_id == "NGC")
    assert engine.snapshot(30, profile).focus_player.name == player


def test_comeback_story_is_detected(engine):
    goals = [c for c in engine.cards(Profile()) if c.type == "goal"]
    assert goals[0].variant == "against_run"
    brief = engine.brief("fulltime", Profile())
    MatchBrief.model_validate(brief.model_dump())
    assert "come from behind" in brief.headline
    assert brief.player_of_the_match is not None and brief.turning_points


def test_comeback_goals_have_distinct_titles(engine):
    goals = [c for c in engine.cards(Profile()) if c.type == "goal" and c.team_id == "NGC"]
    assert [g.variant for g in goals][-2:] == ["equaliser", "late_go_ahead"]
    tps = engine.brief("fulltime", Profile()).turning_points
    titles = [t.title for t in tps]
    assert len(titles) == len(set(titles))


def test_halftime_brief_has_projection_and_watch(engine):
    brief = engine.brief("halftime", Profile(language="es"))
    assert brief.projection is not None and brief.what_to_watch
    assert brief.score.home == 0 and brief.score.away == 2


def test_overlays_are_timed_and_flat(engine):
    overlays = engine.overlays(Profile())
    assert [o.seq for o in overlays] == list(range(1, len(overlays) + 1))
    assert [(o.minute, o.second) for o in overlays] == sorted((o.minute, o.second)
                                                              for o in overlays)
    assert all(isinstance(v, str) for o in overlays for v in o.fields.values())
    assert {"alert", "momentum_bar"} <= {o.graphic for o in overlays}


def test_catchup_and_tick(engine):
    c = engine.catchup(80, Profile())
    assert 1 <= len(c.cards) <= 5 and "80" in c.headline
    t = engine.tick(61, Profile())
    assert t.new_events and all(e.minute == 61 for e in t.new_events)


def test_season_report():
    report = season_report(Profile(team="MIL", language="ms"))
    SeasonReport.model_validate(report.model_dump())
    assert report.matches == 28 and len(report.table) == 8
    assert report.storylines[0].team_id == "MIL"
    points = [r.points for r in report.table]
    assert points == sorted(points, reverse=True)


def test_every_card_cites_evidence():
    from live import metrics as M
    from live.insights import detect
    from sim import simulate_season

    for match in simulate_season(6, seed=8):
        for insight in detect(M.build_timeline(match)):
            assert insight.evidence, insight.type
