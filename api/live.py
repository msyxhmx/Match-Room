"""Match-Room Live endpoints (all under /api). See docs/api-contract.md.

Every endpoint that returns words takes the same profile query parameters:
  persona=casual|analyst  lang=en|ms|es  team=<team id>  player=<player name>
"""

from __future__ import annotations

import asyncio
import logging
from functools import lru_cache
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from pydantic import ValidationError

from contract import (
    CatchUp,
    Lineups,
    LiveCard,
    LiveSnapshot,
    MatchBrief,
    OverlayMessage,
    Profile,
    ScenarioInfo,
    SeasonReport,
    StreamBrief,
    Team,
)
from live.engine import HALF, MatchEngine
from live.metrics import FULL_TIME
from live.season import season_report
from sim.scenarios import SCENARIOS

log = logging.getLogger(__name__)
router = APIRouter(prefix="/api")


def profile_params(
    persona: Literal["casual", "analyst"] = Query("casual"),
    lang: Literal["en", "ms", "es"] = Query("en", description="en, ms (Malay) or es"),
    team: str | None = Query(None, description="Favourite team id, e.g. NGC"),
    player: str | None = Query(None, description="Focus player name, e.g. 'L. Quinn'"),
) -> Profile:
    return Profile(persona=persona, language=lang, team=team or None, player=player or None)


ViewerProfile = Annotated[Profile, Depends(profile_params)]


@lru_cache(maxsize=32)
def get_engine(match_id: str) -> MatchEngine:
    from api.main import get_match  # late import: main imports this router

    return MatchEngine(get_match(match_id))


def engine_or_404(match_id: str) -> MatchEngine:
    try:
        return get_engine(match_id)
    except HTTPException:
        raise
    except KeyError as exc:  # pragma: no cover - defensive
        raise HTTPException(status_code=404, detail=f"Unknown match {match_id}") from exc


@router.get("/scenarios", response_model=list[ScenarioInfo])
def scenarios() -> list[ScenarioInfo]:
    from sim.teams import TEAMS_BY_ID

    def team(tid: str) -> Team:
        t = TEAMS_BY_ID[tid]
        return Team(id=t.id, name=t.name, short_name=t.short_name)

    return [ScenarioInfo(key=s.key, match_id=f"SCN-{s.key}", title=s.title,
                         description=s.description, home=team(s.home_id), away=team(s.away_id))
            for s in SCENARIOS.values()]


@router.get("/matches/{match_id}/lineups", response_model=Lineups)
def lineups(match_id: str) -> Lineups:
    return engine_or_404(match_id).lineups()


@router.get("/matches/{match_id}/live", response_model=LiveSnapshot)
def live(match_id: str, profile: ViewerProfile,
         minute: int = Query(45, ge=0, le=FULL_TIME)) -> LiveSnapshot:
    return engine_or_404(match_id).snapshot(minute, profile)


@router.get("/matches/{match_id}/cards", response_model=list[LiveCard])
def cards(match_id: str, profile: ViewerProfile,
          until: int = Query(FULL_TIME, ge=0, le=FULL_TIME)) -> list[LiveCard]:
    return engine_or_404(match_id).cards(profile, until)


@router.get("/matches/{match_id}/overlays", response_model=list[OverlayMessage])
def overlays(match_id: str, profile: ViewerProfile,
             until: int = Query(FULL_TIME, ge=0, le=FULL_TIME)) -> list[OverlayMessage]:
    return engine_or_404(match_id).overlays(profile, until)


@router.get("/matches/{match_id}/brief/{kind}", response_model=MatchBrief)
def brief(match_id: str, kind: Literal["halftime", "fulltime"],
          profile: ViewerProfile) -> MatchBrief:
    return engine_or_404(match_id).brief(kind, profile)


@router.get("/matches/{match_id}/catchup", response_model=CatchUp)
def catchup(match_id: str, profile: ViewerProfile,
            minute: int = Query(..., ge=1, le=FULL_TIME)) -> CatchUp:
    return engine_or_404(match_id).catchup(minute, profile)


@router.get("/season", response_model=SeasonReport)
def season(profile: ViewerProfile) -> SeasonReport:
    return season_report(profile)


@router.websocket("/matches/{match_id}/stream")
async def stream(ws: WebSocket, match_id: str,
                 speed: float = Query(10.0, ge=1, le=6000,
                                      description="Times faster than real time. 60 = one match "
                                                  "minute per second."),
                 from_minute: int = Query(0, ge=0, le=FULL_TIME - 1),
                 persona: Literal["casual", "analyst"] = "casual",
                 lang: Literal["en", "ms", "es"] = "en",
                 team: str | None = None, player: str | None = None) -> None:
    """Plays the match minute by minute.

    Server -> client: StreamTick every minute, StreamBrief at 45' and 90', then
    {"type": "end"}. Client -> server (optional, any time):
    {"profile": {"language": "ms", "persona": "analyst", ...}} switches the
    viewer's profile from the next minute on.
    """
    await ws.accept()
    try:
        engine = get_engine(match_id)
    except HTTPException:
        await ws.send_json({"type": "error", "detail": f"Unknown match {match_id}"})
        await ws.close(code=4404)
        return
    profile = Profile(persona=persona, language=lang, team=team, player=player)
    delay = 60.0 / speed
    loop = asyncio.get_running_loop()
    try:
        for m in range(from_minute + 1, FULL_TIME + 1):
            tick = engine.tick(m, profile)
            await ws.send_text(tick.model_dump_json())
            if m in (HALF, FULL_TIME):
                kind = "halftime" if m == HALF else "fulltime"
                b = await run_in_threadpool(engine.brief, kind, profile)
                await ws.send_text(StreamBrief(type=kind, brief=b).model_dump_json())
            deadline = loop.time() + delay
            while (remaining := deadline - loop.time()) > 0:
                try:
                    msg = await asyncio.wait_for(ws.receive_json(), timeout=remaining)
                except TimeoutError:
                    break
                if isinstance(msg, dict) and isinstance(msg.get("profile"), dict):
                    try:
                        profile = Profile(**{**profile.model_dump(), **msg["profile"]})
                    except ValidationError as exc:
                        await ws.send_json({"type": "error", "detail": str(exc)})
        await ws.send_json({"type": "end"})
        await ws.close()
    except WebSocketDisconnect:
        log.info("Stream client left %s", match_id)
