"""Half-time story agents (Explain stage).

Two Azure OpenAI agents write the story together:
  * the analyst investigates the first half through tools (stats, key events,
    momentum, prediction factors) and drafts 3-5 cards;
  * the fact-checker reviews every card: hard rules first (each cited event id
    was really returned by a tool, every number, player and team appears in the
    tool output, no wording that calls the result), then an LLM check that the cited
    events support the claim.

Rejected cards go back to the analyst once, with the reasons; cards that still
fail are dropped. Fewer than 3 surviving cards, a timeout or any error raises,
and `build_story()` falls back to the template. Every step lands in the trace
the page shows as "how this story was made".

The tools only read `match.first_half()`, so nothing after minute 45 leaks in.
"""

from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path

import pandas as pd

from contract import AgentStep, InsightCard, Prediction
from model.features import BLOCKS, tilt_by_block
from model.story import _describe, _ref, key_events
from sim.simulator import SimulatedMatch
from sim.teams import LEAGUE

log = logging.getLogger(__name__)
PROMPTS = Path(__file__).parent / "prompts"

LLM_TIMEOUT_S = 10  # per call; a slow response must fall back, not stall the page
DEADLINE_S = 30  # whole pipeline
MAX_TOOL_ROUNDS = 6  # per analyst turn
MAX_EVENTS = 25

NUM_RE = re.compile(r"\d+(?:\.\d+)?")
PLAYER_RE = re.compile(r"\b[A-Z]\. [A-Z][A-Za-z\-]*(?:'[A-Z][A-Za-z\-]*)?")  # O'Brien, not Quinn's
# Wording that calls the result; the match is not over at half-time. Kept identical to
# live.narrate.FINAL_RESULT_RE["en"] (tests/test_agents.py checks it).
FINAL_RESULT_RE = re.compile(
    r"\b(?:victor(?:y|ies|ious)|won|winners?|defeated|triumph\w*|ultimately|in the end"
    r"|final (?:score|result|whistle)|full[- ]time|(?:match|game) (?:ended|finished|is over)"
    r"|(?:secured|sealed|clinched|claimed|earned|grabbed) (?:an? |the )?(?:[\w-]+ )?wins?)\b",
    re.IGNORECASE)

TOOL_SPECS = [
    {"type": "function", "function": {
        "name": "get_stats",
        "description": "First-half stats for both sides: goals, xG, shots, possession, cards...",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_key_events",
        "description": "First-half events with their event_id, to cite as evidence.",
        "parameters": {"type": "object", "properties": {
            "kind": {"type": "string", "enum": ["all", "goals", "chances", "cards", "corners"],
                     "description": "chances = shots worth 0.15 xG or more"},
            "side": {"type": "string", "enum": ["home", "away"]},
        }},
    }},
    {"type": "function", "function": {
        "name": "get_momentum",
        "description": "Share of final-third play per 15-minute block, and how it shifted.",
        "parameters": {"type": "object", "properties": {}},
    }},
    {"type": "function", "function": {
        "name": "get_top_factors",
        "description": "The features that drive the model's second-half prediction most.",
        "parameters": {"type": "object", "properties": {}},
    }},
]


def _pct(share: float) -> int:
    return round(100 * share)


def _clip(text: str, limit: int) -> str:
    """Cut a long detail at a word, with an ellipsis, so the trace never shows half a word."""
    if len(text) <= limit:
        return text
    return text[: limit - 1].rsplit(" ", 1)[0].rstrip(" ,.;:") + "…"


class StoryTools:
    """The analyst's tools. Everything they return is recorded: a card may only
    cite events and quote numbers and names that came out of here."""

    def __init__(self, match: SimulatedMatch, f: dict[str, float], stats: dict,
                 prediction: Prediction) -> None:
        self.match, self.f, self.stats, self.prediction = match, f, stats, prediction
        self.fh = match.first_half()
        self.teams = {"home": match.home.short_name, "away": match.away.short_name}
        self.names = {"home": match.home.name, "away": match.away.name}
        self.seen: dict[str, pd.Series] = {}
        self.corpus: list[str] = []

    def record(self, data: object) -> str:
        text = json.dumps(data)
        self.corpus.append(text)
        return text

    def call(self, name: str, args: dict) -> str:
        fn = {"get_stats": self.get_stats, "get_key_events": self.get_key_events,
              "get_momentum": self.get_momentum, "get_top_factors": self.get_top_factors}.get(name)
        if fn is None:
            return json.dumps({"error": f"unknown tool {name!r}"})
        try:
            return self.record(fn(**args))
        except TypeError as exc:
            return json.dumps({"error": f"bad arguments: {exc}"})

    def get_stats(self) -> dict:
        passes = self.stats["home"]["passes"] + self.stats["away"]["passes"] or 1
        out = {}
        for side in ("home", "away"):
            s = self.stats[side]
            out[side] = {
                "team": self.names[side], "goals": int(s["goals"]), "xg": round(s["xg"], 2),
                "shots": int(s["shots"]), "shots_on_target": int(s["sot"]),
                "possession_pct": _pct(s["passes"] / passes),
                "pass_accuracy_pct": _pct(s["pass_acc"]), "corners": int(s["corners"]),
                "fouls": int(s["fouls"]), "yellow_cards": int(s["yellow"]),
                "red_cards": int(s["red"]),
            }
        return out

    def get_key_events(self, kind: str = "all", side: str | None = None) -> dict:
        key = key_events(self.match)
        corners = self.fh[self.fh["type"] == "corner"]
        shots = key[key["type"] == "shot"]
        ev = {
            "goals": shots[shots["outcome"] == "goal"],
            "chances": shots[shots["xg"] >= 0.15],
            "cards": key[key["type"] == "card"],
            "corners": corners,
        }.get(kind, pd.concat([key, corners]))
        if side in ("home", "away"):
            ev = ev[ev["side"] == side]
        ev = ev.sort_values(["minute", "second"]).head(MAX_EVENTS)
        out = []
        for _, e in ev.iterrows():
            self.seen[e["event_id"]] = e
            out.append({"event_id": e["event_id"], "minute": int(e["minute"]),
                        "team": self.names[e["side"]], "text": _describe(e, self.teams)})
        return {"events": out}

    def get_momentum(self) -> dict:
        blocks = [{"start_minute": s, "end_minute": e,
                   "home_final_third_pct": _pct(t), "away_final_third_pct": _pct(1 - t)}
                  for (s, e), t in zip(BLOCKS, tilt_by_block(self.fh), strict=True)]
        trend = self.f["momentum_trend"]
        shift = ("steady" if abs(trend) < 0.12
                 else f"toward {self.names['home' if trend > 0 else 'away']}")
        return {"home": self.names["home"], "away": self.names["away"], "blocks": blocks,
                "half_home_final_third_pct": _pct(self.f["tilt_home"]), "shift": shift}

    def get_top_factors(self) -> dict:
        return {"factors": [{"label": fc.label, "value": fc.value,
                             "favours": self.names[fc.favours]}
                            for fc in self.prediction.factors]}


class StoryAgents:
    """Analyst + fact-checker. `run()` returns the cards or raises; `trace` is kept
    either way."""

    def __init__(self, match: SimulatedMatch, f: dict[str, float], stats: dict,
                 prediction: Prediction) -> None:
        self.match = match
        self.tools = StoryTools(match, f, stats, prediction)
        self.trace: list[AgentStep] = []
        self.client = None
        self.started = 0.0

    def step(self, agent: str, action: str, detail: str) -> None:
        self.trace.append(AgentStep(agent=agent, action=action, detail=_clip(detail, 200)))

    # ---------- LLM plumbing ----------

    def _chat(self, messages: list[dict], tools: list[dict] | None = None):
        if time.monotonic() - self.started > DEADLINE_S:
            raise TimeoutError(f"story agents went past {DEADLINE_S}s")
        kwargs = {
            "model": os.environ["AZURE_OPENAI_DEPLOYMENT"],
            "response_format": {"type": "json_object"},
            "messages": messages,
        }
        if tools:
            kwargs["tools"] = tools
        if os.getenv("AZURE_OPENAI_TEMPERATURE") is not None:
            kwargs["temperature"] = float(os.environ["AZURE_OPENAI_TEMPERATURE"])
        return self.client.chat.completions.create(**kwargs).choices[0].message

    # ---------- analyst ----------

    def _analyst_turn(self, messages: list[dict]) -> list[dict]:
        for _ in range(MAX_TOOL_ROUNDS):
            msg = self._chat(messages, TOOL_SPECS)
            if not msg.tool_calls:
                messages.append({"role": "assistant", "content": msg.content})
                cards = json.loads(msg.content).get("cards", [])[:5]
                self.step("analyst", "draft", f"Drafted {len(cards)} cards")
                return cards
            messages.append({"role": "assistant", "content": msg.content or "", "tool_calls": [
                {"id": tc.id, "type": "function",
                 "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                for tc in msg.tool_calls]})
            for tc in msg.tool_calls:
                args = json.loads(tc.function.arguments or "{}")
                shown = ", ".join(f"{k}={v}" for k, v in args.items())
                self.step("analyst", "tool", f"{tc.function.name}({shown})")
                messages.append({"role": "tool", "tool_call_id": tc.id,
                                 "content": self.tools.call(tc.function.name, args)})
        raise RuntimeError(f"analyst still calling tools after {MAX_TOOL_ROUNDS} rounds")

    # ---------- fact-checker ----------

    def hard_problems(self, card: dict) -> list[str]:
        """Rule checks: evidence exists and was seen, nothing is invented."""
        title, body = card.get("title"), card.get("body")
        if not isinstance(title, str) or not isinstance(body, str) or not title or not body:
            return ["missing title or body"]
        ids = card.get("evidence_event_ids") or []
        if not isinstance(ids, list) or not all(isinstance(eid, str) for eid in ids):
            return ["evidence_event_ids is not a list of ids"]
        if not ids:
            return ["cites no evidence"]
        problems = [f"cites {eid!r}, which no tool returned" for eid in ids
                    if eid not in self.tools.seen]
        corpus = " ".join(self.tools.corpus)
        allowed = {round(float(n), 2) for n in NUM_RE.findall(corpus)}
        text = f"{title} {body}"
        problems += [f"number {n} is not in the data" for n in NUM_RE.findall(text)
                     if round(float(n), 2) not in allowed]
        problems += [f"player {p!r} is not in the data" for p in PLAYER_RE.findall(text)
                     if p not in corpus]
        problems += [f"{w!r} calls the result, but it is only half-time"
                     for w in FINAL_RESULT_RE.findall(text)]
        playing = {self.match.home.id, self.match.away.id}
        for t in LEAGUE:
            if t.id not in playing and (t.name in text
                                        or re.search(rf"\b{re.escape(t.short_name)}\b", text)):
                problems.append(f"team {t.name!r} is not in this match")
        return problems

    def _llm_verdicts(self, cards: list[dict], indices: list[int]) -> dict[int, str]:
        """index -> reason, for each card the LLM fact-checker does not support."""
        payload = {"stats": self.tools.get_stats(), "cards": [
            {"index": i, "title": cards[i]["title"], "body": cards[i]["body"],
             "evidence": [_describe(self.tools.seen[eid], self.tools.teams)
                          for eid in cards[i]["evidence_event_ids"]]}
            for i in indices]}
        msg = self._chat([
            {"role": "system", "content": (PROMPTS / "fact_checker.md").read_text("utf-8")},
            {"role": "user", "content": json.dumps(payload)},
        ])
        verdicts = json.loads(msg.content).get("verdicts", [])
        return {v["index"]: v.get("reason") or "not supported by its evidence"
                for v in verdicts if v.get("index") in indices and not v.get("supported", True)}

    def _check(self, cards: list[dict]) -> dict[int, str]:
        """index -> reason for every rejected card; records a verdict per card."""
        rejected = {}
        for i, card in enumerate(cards):
            problems = self.hard_problems(card)
            if problems:
                rejected[i] = "; ".join(problems)
        passed = [i for i in range(len(cards)) if i not in rejected]
        if passed:
            try:
                rejected.update(self._llm_verdicts(cards, passed))
            except TimeoutError:
                raise
            except Exception:  # noqa: BLE001 - the rule checks above still stand
                log.exception("LLM fact-check failed; keeping rule checks only")
                self.step("fact_checker", "skip", "LLM check unavailable; rule checks only")
        for i, card in enumerate(cards):
            title = str(card.get("title") or f"card {i + 1}")
            if i in rejected:
                self.step("fact_checker", "reject", f"{title}: {rejected[i]}")
            else:
                self.step("fact_checker", "accept", title)
        return rejected

    # ---------- the pipeline ----------

    def run(self) -> list[InsightCard]:
        from openai import AzureOpenAI

        self.started = time.monotonic()
        self.client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            timeout=LLM_TIMEOUT_S,
            max_retries=1,
        )
        h, a = int(self.tools.stats["home"]["goals"]), int(self.tools.stats["away"]["goals"])
        brief = self.tools.record({"home": self.match.home.name, "away": self.match.away.name,
                                   "half_time_score": f"{h}-{a}"})
        messages = [{"role": "system", "content": (PROMPTS / "analyst.md").read_text("utf-8")},
                    {"role": "user", "content": brief}]

        cards = self._analyst_turn(messages)
        rejected = self._check(cards)
        if rejected:
            self.step("fact_checker", "retry", f"Sent {len(rejected)} card(s) back to the analyst")
            feedback = [{"title": cards[i].get("title"), "problem": reason}
                        for i, reason in rejected.items()]
            messages.append({"role": "user", "content": json.dumps({
                "fact_checker_rejected": feedback,
                "instruction": "Fix or replace these cards and return the full set of 3 to 5.",
            })})
            cards = self._analyst_turn(messages)
            rejected = self._check(cards)

        kept = [c for i, c in enumerate(cards) if i not in rejected]
        if len(kept) < 3:
            raise ValueError(f"only {len(kept)} cards passed the fact-checker")
        return [InsightCard(id=f"agent-{i}", title=c["title"], body=c["body"],
                            evidence=[_ref(self.tools.seen[eid], self.tools.teams)
                                      for eid in dict.fromkeys(c["evidence_event_ids"])])
                for i, c in enumerate(kept)]
