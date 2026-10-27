import json
import re
import string
from unittest.mock import MagicMock, patch

import pytest

from contract import Profile
from live.engine import MatchEngine
from live.insights import PRIORITY, Fact
from live.narrate import FINAL_RESULT_RE, llm_rewrite, validate
from live.templates import BRIEF, EXTRAS, LANGS, T
from sim import SCENARIOS, simulate_scenario


def _templates():
    for type_, variants in T.items():
        for variant, langs in variants.items():
            for lang, entry in langs.items():
                for key, text in entry.items():
                    for t in text if isinstance(text, list) else [text]:
                        yield f"{type_}/{variant}/{lang}/{key}", t
    for type_, langs in EXTRAS.items():
        for lang, entries in langs.items():
            for key, t in entries.items():
                yield f"extra/{type_}/{lang}/{key}", t
    for key, langs in BRIEF.items():
        for lang, t in langs.items():
            yield f"brief/{key}/{lang}", t


def test_templates_have_no_literal_numbers():
    """Every number shown must come from a fact, so the validator can prove it."""
    for name, text in _templates():
        literal = re.sub(r"\{[^}]*\}", "", text)
        assert not re.search(r"\d", literal), name


def test_every_type_and_language_is_covered():
    for type_ in [*PRIORITY, "player_focus"]:
        for lang in LANGS:
            assert any(lang in v for v in T[type_].values()), (type_, lang)
    for key, langs in BRIEF.items():
        assert set(langs) == set(LANGS), key


def test_brief_placeholders_are_known():
    for name, text in _templates():
        fields = [f for _, f, _, _ in string.Formatter().parse(text) if f]
        assert all(re.fullmatch(r"[a-z_0-9]+", f) for f in fields), name


def test_validator_catches_invented_facts():
    facts = {"player": Fact("L. Quinn", "player"), "team": Fact("Northgate City", "team"),
             "xg": Fact(0.42, "dec2"), "minute": Fact(61, "int")}
    assert validate("L. Quinn scores for Northgate City from a 0.42 xG chance.", facts,
                    "en") == []
    assert validate("L. Quinn scores from a 0.55 xG chance.", facts, "en")
    assert validate("K. Kovac scores for Northgate City.", facts, "en")
    assert validate("L. Quinn scores against Kingston Vale.", facts, "en")
    assert validate("Gol de L. Quinn con 0,42 xG.", facts, "es") == []


@pytest.mark.parametrize("key", list(SCENARIOS))
def test_all_cards_and_briefs_validate(key, caplog):
    engine = MatchEngine(simulate_scenario(key))
    event_ids = set(engine.match.events["event_id"])
    for lang in LANGS:
        for persona in ("casual", "analyst"):
            profile = Profile(persona=persona, language=lang, team=engine.match.home.id,
                              player=engine.match.home.players[9].name)
            for card in engine.cards(profile):
                assert card.headline and card.body
                text = " ".join([card.headline, card.body, *card.why])
                for f in card.facts_used:
                    assert f.value in text, (card.type, f.key, f.value)
                assert all(e.event_id in event_ids for e in card.evidence)
            engine.brief("halftime", profile)
            engine.brief("fulltime", profile)
            engine.catchup(70, profile)
    assert "failed validation" not in caplog.text


def _llm_env(monkeypatch):
    monkeypatch.setenv("AZURE_OPENAI_ENDPOINT", "https://example.openai.azure.com")
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("AZURE_OPENAI_DEPLOYMENT", "gpt-4o-mini")
    monkeypatch.delenv("LIVE_LLM", raising=False)


def _client(text):
    client = MagicMock()
    client.chat.completions.create.return_value.choices[0].message.content = json.dumps(
        {"text": text})
    return client


FACTS = {"team": Fact("Northgate City", "team"), "team_minutes": Fact(47, "int")}


def test_llm_rewrite_accepted_when_provable(monkeypatch):
    _llm_env(monkeypatch)
    with patch("openai.AzureOpenAI", return_value=_client("Northgate City ran it: 47 minutes.")):
        assert llm_rewrite("draft", FACTS, "en", "casual", "a summary") == \
               "Northgate City ran it: 47 minutes."


def test_llm_rewrite_rejected_when_it_invents(monkeypatch):
    _llm_env(monkeypatch)
    with patch("openai.AzureOpenAI", return_value=_client("Northgate City had 52 minutes.")):
        assert llm_rewrite("draft", FACTS, "en", "casual", "a summary") is None


def test_llm_rewrite_off_without_keys(monkeypatch):
    for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY", "AZURE_OPENAI_DEPLOYMENT"):
        monkeypatch.delenv(k, raising=False)
    assert llm_rewrite("draft", FACTS, "en", "casual", "a summary") is None


# What the deployed half-time brief for the comeback scenario said at 0-2 (Northgate win 3-2).
HT_CALLS_RESULT = ("The match saw 15 chaotic minutes without clear control from either side, "
                   "highlighted by a key moment at 14' when Kingston Vale scored against the run "
                   "of play. Ultimately, Kingston Vale secured a 2-0 victory over Northgate City.")
HT_FACTS = {"chaos_minutes": Fact(15, "int"), "turn_minute": Fact(14, "int"),
            "home": Fact("Northgate City", "team"), "away": Fact("Kingston Vale", "team"),
            "score": Fact("0-2", "score")}


def test_halftime_brief_may_not_call_the_result():
    assert validate(HT_CALLS_RESULT, HT_FACTS, "en", kind="halftime") == [
        "final-result wording 'Ultimately' at half-time",
        "final-result wording 'victory' at half-time"]
    assert validate("Kingston Vale secured a 2-0 win.", HT_FACTS, "en", kind="halftime")
    assert validate(HT_CALLS_RESULT, HT_FACTS, "en", kind="fulltime") == []
    assert validate(HT_CALLS_RESULT, HT_FACTS, "en") == []


@pytest.mark.parametrize("lang, text", [
    ("en", "Kingston Vale won the first half 2-0."),
    ("en", "The final score was 0-2."),
    ("ms", "Akhirnya, Kingston Vale meraih kemenangan 2-0."),
    ("ms", "Northgate City tewas 0-2."),
    ("es", "Finalmente, Kingston Vale ganó 2-0."),
    ("es", "Victoria de Kingston Vale por 0-2."),
])
def test_final_result_wording_caught_in_every_language(lang, text):
    assert validate(text, HT_FACTS, lang, kind="halftime")
    assert validate(text, HT_FACTS, lang, kind="fulltime") == []


@pytest.mark.parametrize("lang, text", [
    ("en", "Kingston Vale lead 0-2 at the break after 15 chaotic minutes."),
    ("ms", "Kingston Vale mendahului 0-2 pada waktu rehat."),
    ("es", "Kingston Vale ganan 0-2 al descanso; al final de la primera parte, 15 minutos."),
])
def test_halftime_lead_wording_is_allowed(lang, text):
    assert validate(text, HT_FACTS, lang, kind="halftime") == []


def test_llm_rewrite_rejects_result_at_halftime(monkeypatch):
    _llm_env(monkeypatch)
    with patch("openai.AzureOpenAI", return_value=_client(HT_CALLS_RESULT)):
        assert llm_rewrite("draft", HT_FACTS, "en", "analyst", "a summary",
                           kind="halftime") is None
        assert llm_rewrite("draft", HT_FACTS, "en", "analyst", "a summary",
                           kind="fulltime") == HT_CALLS_RESULT


def test_halftime_brief_falls_back_to_template(monkeypatch, caplog):
    _llm_env(monkeypatch)
    engine = MatchEngine(simulate_scenario("comeback"))
    profile = Profile(persona="analyst", language="en", team=engine.match.home.id)
    with patch("openai.AzureOpenAI", return_value=_client(HT_CALLS_RESULT)):
        brief = engine.brief("halftime", profile)
    assert brief.summary_source == "template"
    assert "Ultimately" not in brief.summary
    assert "final-result wording 'Ultimately' at half-time" in caplog.text


@pytest.mark.parametrize("key", list(SCENARIOS))
def test_halftime_template_summaries_do_not_call_the_result(key):
    """The template is the fallback, so it must pass the half-time check itself."""
    engine = MatchEngine(simulate_scenario(key))
    for lang in LANGS:
        brief = engine.brief("halftime", Profile(language=lang))
        assert not FINAL_RESULT_RE[lang].search(brief.summary), (lang, brief.summary)


def test_possessive_names_are_not_invented_players():
    facts = {"player": Fact("L. Quinn", "player"), "other": Fact("K. O'Brien", "player")}
    assert validate("L. Quinn's header beat K. O'Brien.", facts, "en") == []
    assert validate("M. Smith's header.", facts, "en") == ["player 'M. Smith' not in facts"]
