"""FastAPI backend (Render stage). Run: uvicorn api.main:app --reload

Endpoints (all JSON, all under /api):
  GET /api/health                         liveness + which model/story source is active
  GET /api/matches                        demo matches available for replay
  GET /api/matches/{id}/events?until=45   events for the replay timeline
  GET /api/matches/{id}/halftime          the HalftimeReport (see contract/models.py)

Match-Room Live endpoints (live engine, see api/live.py and contract/live.py):
  GET /api/scenarios                      scripted demo storylines
  GET /api/matches/{id}/lineups           squads + match metadata
  GET /api/matches/{id}/live?minute=67    LiveSnapshot: metrics, control/chaos, cards, overlays
  GET /api/matches/{id}/cards?until=90    personalised insight cards
  GET /api/matches/{id}/overlays          timed, machine-readable broadcast graphics
  GET /api/matches/{id}/brief/halftime    half-time brief (also /brief/fulltime)
  GET /api/matches/{id}/catchup?minute=67 "I just joined" recap
  GET /api/season                         synthetic season table + storylines
  WS  /api/matches/{id}/stream?speed=60   minute-by-minute live stream
"""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from api.live import router as live_router
from contract import Event, HalftimeReport, MatchSummary, Prediction, Team
from model.features import match_features
from model.halftime import build_report
from model.predict import load_predictor
from model.story import llm_available
from sim.scenarios import SCENARIOS
from sim.simulator import SimulatedMatch, simulate_scenario, simulate_season

load_dotenv()

DEMO_SEED = int(os.getenv("DEMO_SEED", "2026"))
DEMO_MATCHES = int(os.getenv("DEMO_MATCHES", "6"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(title="Match-Room Live API", version="0.2.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"],
                   allow_headers=["*"])
app.include_router(live_router)


@lru_cache
def predictor():
    return load_predictor()


@lru_cache
def demo_matches() -> dict[str, SimulatedMatch]:
    """Organic demo matches plus one match per scripted scenario (SCN-<key>)."""
    matches = {m.match_id: m for m in simulate_season(DEMO_MATCHES, seed=DEMO_SEED)}
    for key in SCENARIOS:
        m = simulate_scenario(key)
        matches[m.match_id] = m
    return matches


def get_match(match_id: str) -> SimulatedMatch:
    match = demo_matches().get(match_id)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Unknown match {match_id}")
    return match


def _team(t) -> Team:
    return Team(id=t.id, name=t.name, short_name=t.short_name)


@app.get("/api/health")
def health() -> dict:
    from live.narrate import llm_enabled

    return {"status": "ok", "model_version": predictor().version,
            "story_source": "llm" if llm_available() else "template",
            "live_engine": True, "live_llm": llm_enabled(),
            "languages": ["en", "ms", "es"], "personas": ["casual", "analyst"]}


@app.get("/api/matches", response_model=list[MatchSummary])
def list_matches() -> list[MatchSummary]:
    summaries = [MatchSummary(match_id=m.match_id, home=_team(m.home), away=_team(m.away),
                              scenario=m.scenario,
                              title=SCENARIOS[m.scenario].title if m.scenario else None)
                 for m in demo_matches().values()]

    # Prediction only: building the full report would run the story agents for every match.
    def top_result_prob(summary: MatchSummary) -> float:
        result = _cached_prediction(summary.match_id).result
        return max(result.home_win, result.draw, result.away_win)

    summaries.sort(key=lambda s: (top_result_prob(s), s.match_id))
    return summaries


@app.get("/api/matches/{match_id}/events", response_model=list[Event])
def match_events(match_id: str, until: int = Query(45, ge=1, le=90)) -> list[Event]:
    from live.engine import to_events

    ev = get_match(match_id).events
    return to_events(ev[ev["minute"] <= until])


@lru_cache(maxsize=64)
def _cached_prediction(match_id: str) -> Prediction:
    """The same prediction the half-time report carries, without the story."""
    return predictor().predict(match_features(get_match(match_id)))


@lru_cache(maxsize=64)
def _cached_report(match_id: str) -> HalftimeReport:
    return build_report(get_match(match_id), predictor())


@app.get("/api/matches/{match_id}/halftime", response_model=HalftimeReport)
def halftime(match_id: str) -> HalftimeReport:
    return _cached_report(match_id)
