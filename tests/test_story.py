import json
from unittest.mock import MagicMock, patch

from model.features import match_features, side_stats
from model.halftime import build_report
from model.predict import HeuristicPredictor, load_predictor
from model.story import llm_story, possessive
from sim import LEAGUE, simulate_match, simulate_season


def _env(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.delenv("AZURE_OPENAI_TEMPERATURE", raising=False)


def _payload():
    return json.dumps({"cards": [
        {"title": "t1", "body": "b1", "evidence_event_ids": []},
        {"title": "t2", "body": "b2", "evidence_event_ids": []},
        {"title": "t3", "body": "b3", "evidence_event_ids": []},
    ]})


def test_llm_story_omits_temperature_by_default(monkeypatch):
    _env(monkeypatch)
    match = simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")
    f = match_features(match)
    fh = match.first_half()
    stats = {"home": side_stats(fh, "home"), "away": side_stats(fh, "away")}
    prediction = HeuristicPredictor().predict(f)

    client = MagicMock()
    client.chat.completions.create.return_value.choices[0].message.content = _payload()
    with patch("openai.AzureOpenAI", return_value=client):
        cards = llm_story(match, f, stats, prediction)

    assert len(cards) == 3
    assert "temperature" not in client.chat.completions.create.call_args.kwargs


def test_llm_story_sends_temperature_when_set(monkeypatch):
    _env(monkeypatch)
    monkeypatch.setenv("AZURE_OPENAI_TEMPERATURE", "0.2")
    match = simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")
    f = match_features(match)
    fh = match.first_half()
    stats = {"home": side_stats(fh, "home"), "away": side_stats(fh, "away")}
    prediction = HeuristicPredictor().predict(f)

    client = MagicMock()
    client.chat.completions.create.return_value.choices[0].message.content = _payload()
    with patch("openai.AzureOpenAI", return_value=client):
        llm_story(match, f, stats, prediction)

    assert client.chat.completions.create.call_args.kwargs["temperature"] == 0.2


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