"""Half-time story (Explain stage).

Two generators with the same output:
  * template_story(): rule-based cards, always available, never invents facts
  * StoryAgents:      an analyst and a fact-checker on Azure OpenAI (model/agents.py);
                      any failure falls back to the template.
"""

from __future__ import annotations

import logging
import os

import pandas as pd

from contract import AgentStep, EvidenceRef, InsightCard, Prediction, WatchItem
from sim.simulator import SimulatedMatch

log = logging.getLogger(__name__)


# ---------- facts: the only things the story layer may talk about ----------

def _describe(ev: pd.Series, teams: dict[str, str]) -> str:
    who = f"{ev['player']} ({teams[ev['side']]})"
    if ev["type"] == "shot":
        xg = f", {ev['xg']:.2f} xG" if pd.notna(ev["xg"]) else ""
        verb = {"goal": "scores", "saved": "forces a save", "blocked": "has a shot blocked",
                "off_target": "shoots wide"}.get(ev["outcome"], "shoots")
        return f"{ev['minute']}' {who} {verb}{xg}"
    if ev["type"] == "card":
        return f"{ev['minute']}' {ev['outcome'].title()} card for {who}"
    return f"{ev['minute']}' {ev['type']} by {who}"


def _ref(ev: pd.Series, teams: dict[str, str]) -> EvidenceRef:
    return EvidenceRef(event_id=ev["event_id"], minute=int(ev["minute"]),
                       description=_describe(ev, teams))


def possessive(name: str) -> str:
    """Possessive form, handling names that already end in 's'."""
    return f"{name}'" if name.endswith("s") else f"{name}'s"


def key_events(match: SimulatedMatch) -> pd.DataFrame:
    """Goals, big chances (xG >= 0.15) and cards from the first half."""
    fh = match.first_half()
    shots = fh[fh["type"] == "shot"]
    return pd.concat([
        shots[(shots["outcome"] == "goal") | (shots["xg"] >= 0.15)],
        fh[fh["type"] == "card"],
    ]).sort_values(["minute", "second"])


# ---------- template generator ----------

def template_story(match: SimulatedMatch, f: dict[str, float], stats: dict) -> list[InsightCard]:
    teams = {"home": match.home.short_name, "away": match.away.short_name}
    names = {"home": match.home.name, "away": match.away.name}
    fh = match.first_half()
    shots = fh[fh["type"] == "shot"]
    goals = shots[shots["outcome"] == "goal"]
    h, a = int(stats["home"]["goals"]), int(stats["away"]["goals"])
    cards: list[InsightCard] = []

    # 1. the scoreline
    if h == a:
        title = "Level at the break" if h else "Goalless, but not quiet"
    else:
        lead = "home" if h > a else "away"
        title = f"{names[lead]} lead {max(h, a)}-{min(h, a)}"
    goal_text = "; ".join(_describe(g, teams) for _, g in goals.iterrows()) or "no goals yet"
    cards.append(InsightCard(
        id="scoreline", title=title,
        body=f"Goals: {goal_text}. Shots {int(stats['home']['shots'])}-"
             f"{int(stats['away']['shots'])}, xG {stats['home']['xg']:.2f}-"
             f"{stats['away']['xg']:.2f}.",
        evidence=[_ref(g, teams) for _, g in goals.iterrows()],
    ))

    # 2. chance quality vs scoreline
    best = shots.sort_values("xg", ascending=False).head(2)
    xg_lead = "home" if f["xg_diff"] > 0 else "away"
    score_disagrees = f["goal_diff"] == 0 or (f["goal_diff"] > 0) != (xg_lead == "home")
    if abs(f["xg_diff"]) >= 0.4 and score_disagrees:
        body = (f"{names[xg_lead]} have created the better chances ({abs(f['xg_diff']):.2f} xG "
                f"more) but the scoreline does not reflect it yet.")
        title = f"{teams[xg_lead]} deserve more"
    elif abs(f["xg_diff"]) >= 0.4:
        body = (f"{possessive(names[xg_lead])} lead is backed by chance quality: "
                f"{abs(f['xg_diff']):.2f} xG more than their opponents.")
        title = "The lead is earned"
    else:
        body = (f"Chance quality is close ({stats['home']['xg']:.2f} vs "
                f"{stats['away']['xg']:.2f} xG).")
        title = "Little between them"
    cards.append(InsightCard(id="chance-quality", title=title, body=body,
                             evidence=[_ref(s, teams) for _, s in best.iterrows()]))

    # 3. territory and momentum
    tilt_side = "home" if f["tilt_home"] >= 0.5 else "away"
    share = f["tilt_home"] if tilt_side == "home" else 1 - f["tilt_home"]
    trend = f["momentum_trend"]
    swing = ""
    if abs(trend) >= 0.12:
        swing_side = "home" if trend > 0 else "away"
        swing = f" Momentum swung toward {names[swing_side]} as the half went on."
    late = shots[shots["minute"] > 30].sort_values("xg", ascending=False).head(2)
    cards.append(InsightCard(
        id="territory", title=f"{teams[tilt_side]} own the territory",
        body=f"{names[tilt_side]} had {share:.0%} of the play in the final third.{swing}",
        evidence=[_ref(s, teams) for _, s in late.iterrows()],
    ))

    # 4. discipline (only if it matters)
    card_ev = fh[fh["type"] == "card"]
    if f["red_diff"] != 0 or len(card_ev) >= 3:
        reds = card_ev[card_ev["outcome"] == "red"]
        if len(reds):
            side = reds.iloc[0]["side"]
            body = f"{names[side]} are down to ten men, which reshapes the second half."
            title = "Down to ten"
        else:
            body = f"{len(card_ev)} yellow cards already; someone may be on thin ice."
            title = "Tempers rising"
        cards.append(InsightCard(id="discipline", title=title, body=body,
                                 evidence=[_ref(c, teams) for _, c in card_ev.iterrows()]))

    # 5. set pieces (only if lopsided)
    if abs(f["corners_diff"]) >= 3:
        side = "home" if f["corners_diff"] > 0 else "away"
        cards.append(InsightCard(
            id="set-pieces", title="Set-piece pressure",
            body=f"{names[side]} have won {int(abs(f['corners_diff']))} more corners.",
        ))
    return cards[:5]


# ---------- agents (Azure OpenAI) ----------

def llm_available() -> bool:
    return all(os.getenv(k) for k in ("AZURE_OPENAI_ENDPOINT", "AZURE_OPENAI_API_KEY",
                                       "AZURE_OPENAI_DEPLOYMENT"))


def build_story(match, f, stats, prediction) -> tuple[list[InsightCard], str, list[AgentStep]]:
    """Story cards, their source and the agents' trace. Agents when Azure OpenAI is
    configured, templates otherwise or on any agent failure."""
    if llm_available():
        from model.agents import StoryAgents  # imports this module

        agents = StoryAgents(match, f, stats, prediction)
        try:
            return agents.run(), "llm", agents.trace
        except Exception as exc:  # noqa: BLE001 - any LLM failure must not break half-time
            log.exception("Story agents failed; using template")
            agents.step("pipeline", "fallback", f"Using template cards ({type(exc).__name__})")
            return template_story(match, f, stats), "template", agents.trace
    return template_story(match, f, stats), "template", []


# ---------- what to watch ----------

def what_to_watch(match: SimulatedMatch, f: dict[str, float],
                  prediction: Prediction) -> list[WatchItem]:
    names = {"home": match.home.name, "away": match.away.name}
    items: list[WatchItem] = []
    if f["goal_diff"] != 0:
        lead = "home" if f["goal_diff"] > 0 else "away"
        chase = "away" if lead == "home" else "home"
        chase_tilt = f["tilt_home"] if chase == "home" else 1 - f["tilt_home"]
        items.append(WatchItem(
            id="hold-the-lead", title=f"Can {names[lead]} hold on?",
            detail=f"{names[chase]} had {chase_tilt:.0%} of final-third play. If that rises, "
                   f"their next-goal chances climb from "
                   f"{getattr(prediction.next_goal, chase):.0%}.",
        ))
    if f["red_diff"] != 0:
        short = "home" if f["red_diff"] > 0 else "away"
        items.append(WatchItem(id="ten-men", title=f"{names[short]} with ten men",
                               detail="Watch whether they sit deep or keep pressing; "
                                      "fatigue usually shows after the hour."))
    if abs(f["momentum_trend"]) >= 0.12:
        side = "home" if f["momentum_trend"] > 0 else "away"
        items.append(WatchItem(
            id="momentum", title=f"{possessive(names[side])} momentum",
            detail="They finished the half on top. If the first 10 minutes after the break go "
                   "the same way, the prediction shifts toward them.",
        ))
    top = next((factor for factor in prediction.factors
                if factor.feature not in {"goal_diff", "strength_diff"}), None)
    if top and len(items) < 3:
        items.append(WatchItem(
            id="top-factor", title=f"Watch: {top.label.lower()}",
            detail=f"This is the biggest driver of the prediction right now "
                   f"(favours {names[top.favours]}). A swing here changes the odds most.",
        ))
    return items[:3]
