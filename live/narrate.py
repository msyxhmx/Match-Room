"""Narration: insight + profile -> a LiveCard in the viewer's language and depth.

Template first, always. Every rendered sentence goes through `validate()`,
which rejects any number that is not one of the insight's facts and any player
or team name that is not part of it. The same check guards the optional LLM
rewrite: if Azure OpenAI returns anything unprovable, we keep the template.
"""

from __future__ import annotations

import json
import logging
import os
import re
import string

import pandas as pd

from contract import EvidenceRef, FactUsed, LiveCard, Profile
from live.insights import Fact, Insight
from live.templates import EXTRAS, FACT_LABELS, T
from sim.teams import LEAGUE

log = logging.getLogger(__name__)

NUM_RE = re.compile(r"\d+(?:[.,]\d+)?")
PLAYER_RE = re.compile(r"\b[A-Z]\. [A-Z][A-Za-z\-]*(?:'[A-Z][A-Za-z\-]*)?")  # O'Brien, not Quinn's
TEAM_NAMES = {t.name for t in LEAGUE}
LLM_TIMEOUT_S = 10  # per call; a slow rewrite must fall back to the template, not stall the feed
CASUAL_EXTRAS = {"assist", "player_goals", "player"}


# ---------- formatting ----------

def _dec(v: float, digits: int, lang: str) -> str:
    s = f"{v:.{digits}f}"
    return s.replace(".", ",") if lang == "es" else s


def fmt(fact: Fact, lang: str) -> str:
    v, k = fact.value, fact.kind
    if k == "pct":
        return f"{round(float(v) * 100)}%"
    if k == "dec1":
        return _dec(float(v), 1, lang)
    if k == "dec2":
        return _dec(float(v), 2, lang)
    if k == "kmh":
        return f"{round(float(v))} km/h"
    if k == "m":
        return f"{round(float(v))} m"
    if k == "int":
        return str(int(v))
    return str(v)


def _fields(text: str) -> list[str]:
    return [f for _, f, _, _ in string.Formatter().parse(text) if f]


def _render(text: str, values: dict[str, str]) -> str | None:
    """Fill a template; None if it needs a fact we do not have."""
    if any(f not in values for f in _fields(text)):
        return None
    return text.format(**values)


# ---------- the validator (the trust mechanism) ----------

def allowed_tokens(facts: dict[str, Fact], lang: str) -> tuple[set[str], set[str], set[str]]:
    numbers, players, teams = set(), set(), set()
    for f in facts.values():
        shown = fmt(f, lang)
        numbers.update(NUM_RE.findall(shown))
        if f.kind == "player":
            players.add(str(f.value))
        if f.kind == "team":
            teams.add(str(f.value))
    return numbers, players, teams


# Wording that calls the result. At half-time the match is not over, so a brief that
# says "victory" or "ultimately" states something no fact can prove. Spanish "ganan"
# and Malay "mendahului" mean "lead" and stay allowed (the ht_lead headline uses them).
FINAL_RESULT_RE = {
    "en": re.compile(
        r"\b(?:victor(?:y|ies|ious)|won|winners?|defeated|triumph\w*|ultimately|in the end"
        r"|final (?:score|result|whistle)|full[- ]time|(?:match|game) (?:ended|finished|is over)"
        r"|(?:secured|sealed|clinched|claimed|earned|grabbed) (?:an? |the )?(?:[\w-]+ )?wins?)\b",
        re.IGNORECASE),
    "ms": re.compile(
        r"\b(?:kemenangan|memenangi|(?:telah|berjaya) menang|tewas|akhirnya|keputusan akhir"
        r"|skor akhir|wisel penamat|perlawanan (?:berakhir|tamat|selesai))\b",
        re.IGNORECASE),
    "es": re.compile(
        r"\b(?:victoria|ganó|ganaron|venció|vencieron|triunf\w*|derrot\w*|finalmente"
        r"|resultado final|marcador final|pitido final|al final del partido|se impus(?:o|ieron)"
        r"|el partido (?:terminó|acabó))\b",
        re.IGNORECASE),
}


def validate(text: str, facts: dict[str, Fact], lang: str,
             kind: str | None = None) -> list[str]:
    """Problems with `text`: numbers, players or teams the facts do not support,
    and, in a half-time brief (`kind="halftime"`), wording that calls the result."""
    numbers, players, teams = allowed_tokens(facts, lang)
    problems = [f"number {n!r} not in facts" for n in NUM_RE.findall(text) if n not in numbers]
    problems += [f"player {p!r} not in facts" for p in PLAYER_RE.findall(text)
                 if p not in players]
    problems += [f"team {t!r} not in facts" for t in TEAM_NAMES if t in text and t not in teams]
    if kind == "halftime":
        problems += [f"final-result wording {w!r} at half-time"
                     for w in FINAL_RESULT_RE[lang].findall(text)]
    return problems


# ---------- evidence descriptions ----------

_EV_TEXT = {
    "en": {"goal": "scores", "saved": "shot saved", "blocked": "shot blocked",
           "off_target": "shot wide", "pass": "pass", "pressure": "presses",
           "tackle": "tackle", "interception": "interception", "red": "red card",
           "yellow": "yellow card", "foul": "foul", "corner": "corner"},
    "ms": {"goal": "menjaringkan gol", "saved": "rembatan diselamatkan",
           "blocked": "rembatan disekat", "off_target": "rembatan tersasar", "pass": "hantaran",
           "pressure": "menekan", "tackle": "terjahan", "interception": "pintasan",
           "red": "kad merah", "yellow": "kad kuning", "foul": "kekasaran",
           "corner": "sepakan sudut"},
    "es": {"goal": "marca", "saved": "disparo parado", "blocked": "disparo bloqueado",
           "off_target": "disparo fuera", "pass": "pase", "pressure": "presiona",
           "tackle": "entrada", "interception": "intercepción", "red": "tarjeta roja",
           "yellow": "tarjeta amarilla", "foul": "falta", "corner": "córner"},
}


def describe_event(ev: pd.Series, short: dict[str, str], lang: str) -> str:
    words = _EV_TEXT[lang]
    if ev["type"] == "shot":
        what = words.get(str(ev["outcome"]), "shot")
        if pd.notna(ev.get("xg")):
            what += f" ({_dec(float(ev['xg']), 2, lang)} xG)"
    elif ev["type"] == "card":
        what = words.get(str(ev["outcome"]), "card")
    elif ev["type"] == "pass" and pd.notna(ev.get("length_m")):
        what = f"{words['pass']} {round(float(ev['length_m']))} m"
    else:
        what = words.get(str(ev["type"]), str(ev["type"]))
    return f"{ev['minute']}' {ev['player']} ({short[ev['side']]}) {what}"


def evidence_refs(ids: list[str], events_by_id: pd.DataFrame, short: dict[str, str],
                  lang: str) -> list[EvidenceRef]:
    refs = []
    for eid in ids:
        if eid in events_by_id.index:
            ev = events_by_id.loc[eid]
            refs.append(EvidenceRef(event_id=eid, minute=int(ev["minute"]),
                                    description=describe_event(ev, short, lang)))
    return refs


# ---------- card rendering ----------

def template_entry(type_: str, variant: str, lang: str) -> dict:
    by_type = T[type_]
    entry: dict = {}
    entry.update(by_type.get("_all", {}).get(lang, {}))
    entry.update(by_type.get(variant, by_type.get("*", {})).get(lang, {}))
    return entry


def tags_for(ins: Insight, profile: Profile) -> list[str]:
    tags = []
    if profile.team and ins.team_id:
        tags.append("your_team" if ins.team_id == profile.team else "against_your_team")
    if profile.player and profile.player in ins.players:
        tags.append("focus_player")
    return tags


def render_card(ins: Insight, profile: Profile, events_by_id: pd.DataFrame,
                short: dict[str, str]) -> LiveCard:
    lang, persona = profile.language, profile.persona
    facts = {**ins.facts, "minute": Fact(ins.minute, "int")}
    values = {k: fmt(f, lang) for k, f in facts.items()}
    entry = template_entry(ins.type, ins.variant, lang)

    headline = _render(entry["headline"], values) or ""
    main = entry.get(persona) or entry.get("casual") or entry.get("analyst") or ""
    body_parts = [_render(main, values) or ""]
    used_templates = [entry.get("headline", ""), main]
    for key, sentence in EXTRAS.get(ins.type, {}).get(lang, {}).items():
        if key in facts and (persona == "analyst" or key in CASUAL_EXTRAS):
            if key == "player" and "{player}" in main:
                continue
            text = _render(sentence, values)
            if text:
                body_parts.append(text)
                used_templates.append(sentence)
    body = " ".join(p for p in body_parts if p)

    if persona == "analyst":
        why_src = entry.get("why", [])
    else:
        why_src = [entry["why_casual"]] if entry.get("why_casual") else []
    why = [w for w in (_render(t, values) for t in why_src) if w]

    used_text = " ".join([*used_templates, *why_src])
    used = [k for k in facts if "{" + k + "}" in used_text]
    card = LiveCard(
        insight_id=ins.id, type=ins.type, variant=ins.variant, minute=ins.minute,
        second=ins.second, clock=ins.clock, priority=ins.priority, side=ins.side,
        team_id=ins.team_id, players=ins.players, headline=headline, body=body, why=why,
        facts_used=[FactUsed(key=k, label=FACT_LABELS.get(k, {}).get(lang, k), value=values[k])
                    for k in used],
        evidence=evidence_refs(ins.evidence, events_by_id, short, lang),
        tags=tags_for(ins, profile), language=lang, persona=persona, source="template",
    )
    problems = validate(" ".join([card.headline, card.body, *card.why]), facts, lang)
    if problems:  # a template bug, not an LLM one: log loudly, still show the card
        log.error("Template for %s/%s/%s failed validation: %s", ins.type, ins.variant, lang,
                  problems)
    return card


# ---------- optional LLM polish (Azure OpenAI) ----------

LANG_NAMES = {"en": "English", "ms": "Malay (Bahasa Melayu)", "es": "Spanish"}


def llm_enabled() -> bool:
    from model.story import llm_available

    return llm_available() and os.getenv("LIVE_LLM", "1") not in ("0", "false", "False")


def llm_rewrite(text: str, facts: dict[str, Fact], lang: str, persona: str,
                purpose: str, kind: str | None = None) -> str | None:
    """Ask Azure OpenAI to rewrite `text` for the persona and language, using only
    the facts. Returns None (keep the template) on any error or if the result
    fails validation (`kind` as in `validate()`)."""
    if not llm_enabled():
        return None
    try:
        from openai import AzureOpenAI

        client = AzureOpenAI(
            azure_endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
            api_key=os.environ["AZURE_OPENAI_API_KEY"],
            api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-10-21"),
            timeout=LLM_TIMEOUT_S,
            max_retries=1,
        )
        allowed = {k: fmt(f, lang) for k, f in facts.items()}
        system = (
            f"You are a football broadcast writer. Rewrite the draft as {purpose} for a "
            f"{persona} viewer, in {LANG_NAMES[lang]}. Use ONLY the facts given. Every number "
            "and name you write must appear exactly as in the facts. Do not add any statistic, "
            "minute, player or team that is not listed. Return JSON: {\"text\": \"...\"}."
        )
        if kind == "halftime":
            system += (" It is half-time and the match is not over: the score is the score at "
                       "the break. Never say who won or what the final result was.")
        kwargs = {
            "model": os.environ["AZURE_OPENAI_DEPLOYMENT"],
            "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": system},
                         {"role": "user", "content": json.dumps({"draft": text,
                                                                 "facts": allowed})}],
        }
        if os.getenv("AZURE_OPENAI_TEMPERATURE") is not None:
            kwargs["temperature"] = float(os.environ["AZURE_OPENAI_TEMPERATURE"])
        resp = client.chat.completions.create(**kwargs)
        out = json.loads(resp.choices[0].message.content).get("text", "").strip()
    except Exception:  # noqa: BLE001 - narration must never break the live feed
        log.exception("LLM rewrite failed; keeping template")
        return None
    if not out:
        return None
    problems = validate(out, facts, lang, kind)
    if problems:
        log.warning("LLM rewrite rejected: %s", problems)
        return None
    return out
