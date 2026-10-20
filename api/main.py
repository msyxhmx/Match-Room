"""FastAPI backend (Render stage). Run: uvicorn api.main:app --reload

Endpoints (all JSON, all under /api):
  GET /api/health                         liveness + which model/story source is active
  GET /api/matches                        demo matches available for replay
  GET /api/matches/{id}/events?until=45   events for the replay timeline
  GET /api/matches/{id}/halftime          the HalftimeReport (see contract/models.py)
"""

from __future__ import annotations

import os
from functools import lru_cache

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware

from contract import Event, HalftimeReport, MatchSummary, Team
from model.halftime import build_report
from model.predict import load_predictor
from model.story import llm_available
from sim.simulator import SimulatedMatch, simulate_season

load_dotenv()

DEMO_SEED = int(os.getenv("DEMO_SEED", "2026"))
DEMO_MATCHES = int(os.getenv("DEMO_MATCHES", "6"))
CORS_ORIGINS = os.getenv("CORS_ORIGINS", "http://localhost:5173").split(",")

app = FastAPI(title="Halftime Insights API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=CORS_ORIGINS, allow_methods=["GET"],
                   allow_headers=["*"])


@lru_cache
def predictor():
    return load_predictor()


@lru_cache
def demo_matches() -> dict[str, SimulatedMatch]:
    return {m.match_id: m for m in simulate_season(DEMO_MATCHES, seed=DEMO_SEED)}


def get_match(match_id: str) -> SimulatedMatch:
    match = demo_matches().get(match_id)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Unknown match {match_id}")
    return match


def _team(t) -> Team:
    return Team(id=t.id, name=t.name, short_name=t.short_name)


@app.get("/api/health")
def health() -> dict:
    return {"status": "ok", "model_version": predictor().version,
            "story_source": "llm" if llm_available() else "template"}


@app.get("/api/matches", response_model=list[MatchSummary])
def list_matches() -> list[MatchSummary]:
    return [MatchSummary(match_id=m.match_id, home=_team(m.home), away=_team(m.away))
            for m in demo_matches().values()]


@app.get("/api/matches/{match_id}/events", response_model=list[Event])
def match_events(match_id: str, until: int = Query(45, ge=1, le=90)) -> list[Event]:
    ev = get_match(match_id).events
    ev = ev[ev["minute"] <= until].astype(object).where(ev.notna(), None)
    return [Event(**row) for row in ev.to_dict(orient="records")]


@lru_cache(maxsize=64)
def _cached_report(match_id: str) -> HalftimeReport:
    return build_report(get_match(match_id), predictor())


@app.get("/api/matches/{match_id}/halftime", response_model=HalftimeReport)
def halftime(match_id: str) -> HalftimeReport:
    return _cached_report(match_id)
