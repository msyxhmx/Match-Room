import copy
import json
from types import SimpleNamespace
from unittest.mock import patch

import pytest

from live.narrate import FINAL_RESULT_RE as LIVE_FINAL_RESULT_RE
from model.agents import FINAL_RESULT_RE, LLM_TIMEOUT_S, StoryTools
from model.features import match_features, side_stats
from model.halftime import build_report
from model.predict import HeuristicPredictor
from model.story import build_story
from sim import LEAGUE, simulate_match


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.delenv("AZURE_OPENAI_TEMPERATURE", raising=False)


def _inputs():
    match = simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")
    f = match_features(match)
    fh = match.first_half()
    stats = {"home": side_stats(fh, "home"), "away": side_stats(fh, "away")}
    return match, f, stats, HeuristicPredictor().predict(f)


def _event_ids(n=3):
    tools = StoryTools(*_inputs())
    return [e["event_id"] for e in tools.get_key_events()["events"][:n]]


def _msg(content=None, tool_calls=None):
    return SimpleNamespace(content=content, tool_calls=tool_calls)


def _call_tool(name, args=None):
    return _msg(tool_calls=[SimpleNamespace(
        id=f"call-{name}", function=SimpleNamespace(name=name, arguments=json.dumps(args or {})))])


def _cards(*cards):
    return _msg(json.dumps({"cards": [
        {"title": t, "body": b, "evidence_event_ids": ids} for t, b, ids in cards]}))


def _verdicts(*supported):
    return _msg(json.dumps({"verdicts": [
        {"index": i, "supported": s, "reason": "" if s else "evidence is about the other side"}
        for i, s in supported]}))


class FakeClient:
    """Plays scripted replies: analyst calls carry `tools`, fact-checker calls don't."""

    def __init__(self, analyst, checker):
        self.queues = {"analyst": list(analyst), "checker": list(checker)}
        self.calls = []
        self.chat = SimpleNamespace(completions=SimpleNamespace(create=self.create))

    def create(self, **kwargs):
        role = "analyst" if "tools" in kwargs else "checker"
        self.calls.append((role, copy.deepcopy(kwargs)))  # messages keeps growing
        reply = self.queues[role].pop(0)
        if isinstance(reply, Exception):
            raise reply
        return SimpleNamespace(choices=[SimpleNamespace(message=reply)])


def _run(client):
    with patch("openai.AzureOpenAI", return_value=client) as ctor:
        cards, source, trace = build_story(*_inputs())
    return cards, source, trace, ctor


def test_analyst_uses_tools_and_checked_cards_are_kept(env):
    a, b, c = _event_ids()
    client = FakeClient(
        analyst=[_call_tool("get_key_events"), _call_tool("get_momentum"),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]), ("Three", "Third.", [c]))],
        checker=[_verdicts((0, True), (1, True), (2, True))],
    )
    cards, source, trace, ctor = _run(client)

    assert source == "llm"
    assert [c.title for c in cards] == ["One", "Two", "Three"]
    assert cards[0].evidence[0].event_id == a and cards[0].evidence[0].description
    assert [s.action for s in trace] == ["tool", "tool", "draft", "accept", "accept", "accept"]
    assert trace[0].detail == "get_key_events()"
    # a slow response must fall back, not stall the page
    assert ctor.call_args.kwargs["timeout"] == LLM_TIMEOUT_S
    assert ctor.call_args.kwargs["max_retries"] == 1
    assert all("temperature" not in kw for _, kw in client.calls)
    # the tool result went back to the analyst
    second = client.calls[1][1]["messages"]
    assert second[-1]["role"] == "tool" and a in second[-1]["content"]


def test_invented_facts_are_sent_back_once_then_fixed(env):
    a, b, c = _event_ids()
    client = FakeClient(
        analyst=[
            _call_tool("get_key_events"),
            _cards(("Made up", "Pure fiction.", ["EV-NOPE"]),
                   ("Big number", "They had 97 shots.", [b]),
                   ("Wrong match", "Northgate City look sharp.", [c]),
                   ("Fine", "This one is fine.", [a])),
            _cards(("One", "First.", [a]), ("Two", "Second.", [b]), ("Three", "Third.", [c])),
        ],
        checker=[_verdicts((3, True)), _verdicts((0, True), (1, True), (2, True))],
    )
    cards, source, trace, _ = _run(client)

    assert source == "llm" and len(cards) == 3
    rejects = [s.detail for s in trace if s.action == "reject"]
    assert "EV-NOPE" in rejects[0]
    assert "number 97" in rejects[1]
    assert "Northgate City" in rejects[2]
    assert [s.action for s in trace].count("retry") == 1
    # only the card that passed the rule checks reached the LLM fact-checker
    first_check = json.loads(client.calls[2][1]["messages"][1]["content"])
    assert [card["index"] for card in first_check["cards"]] == [3]
    # the reasons reached the analyst
    feedback = client.calls[3][1]["messages"][-1]["content"]
    assert "EV-NOPE" in feedback


def test_cards_still_rejected_after_retry_fall_back_to_template(env):
    a, b, c = _event_ids()
    draft = _cards(("One", "First.", [a]), ("Two", "Second.", [b]), ("Three", "Third.", [c]))
    client = FakeClient(
        analyst=[_call_tool("get_key_events"), draft, draft],
        checker=[_verdicts((0, True), (1, False), (2, True)),
                 _verdicts((0, True), (1, False), (2, False))],
    )
    cards, source, trace, _ = _run(client)

    assert source == "template"
    assert cards[0].id == "scoreline"
    assert trace[-1].agent == "pipeline" and trace[-1].action == "fallback"


def test_cards_that_call_the_result_are_sent_back(env):
    a, b, c = _event_ids()
    client = FakeClient(
        analyst=[_call_tool("get_key_events"),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]),
                        ("Job done", "Ultimately, they secured a victory.", [c])),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]), ("Three", "Third.", [c]))],
        checker=[_verdicts((0, True), (1, True)), _verdicts((0, True), (1, True), (2, True))],
    )
    cards, source, trace, _ = _run(client)

    assert source == "llm" and [c.title for c in cards] == ["One", "Two", "Three"]
    reject = next(s.detail for s in trace if s.action == "reject")
    assert "'Ultimately' calls the result" in reject and "'victory'" in reject


def test_final_result_wording_matches_the_live_validator():
    assert FINAL_RESULT_RE.pattern == LIVE_FINAL_RESULT_RE["en"].pattern
    assert FINAL_RESULT_RE.flags == LIVE_FINAL_RESULT_RE["en"].flags


def test_cards_without_evidence_are_rejected(env):
    a, b, _ = _event_ids()
    client = FakeClient(
        analyst=[_call_tool("get_key_events"),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]),
                        ("Three", "No proof.", [])),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]))],
        checker=[_verdicts((0, True), (1, True)), _verdicts((0, True), (1, True))],
    )
    _, source, trace, _ = _run(client)

    assert "cites no evidence" in next(s.detail for s in trace if s.action == "reject")
    assert source == "template"  # two cards are not enough


def test_llm_error_falls_back_to_template(env):
    client = FakeClient(analyst=[RuntimeError("service unavailable")], checker=[])
    cards, source, trace, _ = _run(client)

    assert source == "template" and len(cards) >= 3
    assert [s.action for s in trace] == ["fallback"]


def test_fact_checker_error_keeps_rule_checks(env):
    a, b, c = _event_ids()
    client = FakeClient(
        analyst=[_call_tool("get_key_events"),
                 _cards(("One", "First.", [a]), ("Two", "Second.", [b]), ("Three", "Third.", [c]))],
        checker=[RuntimeError("bad gateway")],
    )
    _, source, trace, _ = _run(client)

    assert source == "llm"
    assert "skip" in [s.action for s in trace]


def test_temperature_is_sent_when_set(env, monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_TEMPERATURE", "0.2")
    client = FakeClient(analyst=[RuntimeError("stop")], checker=[])
    _run(client)

    assert client.calls[0][1]["temperature"] == 0.2


def test_tools_only_see_the_first_half():
    tools = StoryTools(*_inputs())
    events = tools.get_key_events()["events"]
    assert events and all(e["minute"] <= 45 for e in events)
    assert all(e["event_id"] in tools.seen for e in events)
    corners = tools.get_key_events(kind="corners", side="home")["events"]
    assert all("corner" in e["text"] for e in corners)


def test_no_keys_means_template_and_empty_trace(monkeypatch):
    for key in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"):
        monkeypatch.delenv(key, raising=False)
    match = simulate_match(LEAGUE[0], LEAGUE[5], seed=11, match_id="TEST-1")
    report = build_report(match, HeuristicPredictor())

    assert report.meta.story_source == "template"
    assert report.meta.agent_trace == []
