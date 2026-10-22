"""The API contract: the JSON the data side hands to the web side.

This file is the single source of truth. If you change a field here:
  1. run `make schema` to regenerate contract/halftime.schema.json and the sample JSON
  2. update web/src/types/halftime.ts to match
  3. mention the change in your PR description so the other person sees it
"""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

Side = Literal["home", "away"]


class Team(BaseModel):
    id: str
    name: str
    short_name: str


class Score(BaseModel):
    home: int
    away: int


EventType = Literal["pass", "shot", "foul", "card", "corner", "pressure", "tackle",
                    "interception"]


class Event(BaseModel):
    """One synthetic match event. Coordinates are 0-100, from the acting team's
    point of view (x = 100 is the opponent's goal line).

    Pass rows also carry end_x/end_y, speed_kmh and under_pressure; shot rows
    carry speed_kmh. `pressure` rows are a defender closing down the ball
    carrier (outcome "applied" or "forced_error"); `tackle`/`interception` rows
    win the ball back after a failed pass (outcome "won")."""

    event_id: str
    match_id: str
    minute: int
    second: int
    side: Side
    team_id: str
    player: str
    type: EventType
    x: float
    y: float
    outcome: str
    xg: float | None = None
    end_x: float | None = None
    end_y: float | None = None
    speed_kmh: float | None = None
    under_pressure: bool | None = None


class StatLine(BaseModel):
    key: str
    label: str
    home: float
    away: float


class MomentumBlock(BaseModel):
    """Who was on top in each 15-minute block, as home share 0-1 of field tilt."""

    start_minute: int
    end_minute: int
    home_share: float


class EvidenceRef(BaseModel):
    event_id: str
    minute: int
    description: str


class InsightCard(BaseModel):
    id: str
    title: str
    body: str
    evidence: list[EvidenceRef] = Field(default_factory=list)


class ResultProbs(BaseModel):
    home_win: float
    draw: float
    away_win: float


class NextGoalProbs(BaseModel):
    home: float
    away: float
    none: float


class Factor(BaseModel):
    feature: str
    label: str
    value: float
    impact: float = Field(description="Signed contribution toward a home win (SHAP or heuristic).")
    favours: Side


class Prediction(BaseModel):
    result: ResultProbs
    next_goal: NextGoalProbs
    factors: list[Factor]


class WatchItem(BaseModel):
    id: str
    title: str
    detail: str


class ReportMeta(BaseModel):
    model_version: str
    story_source: Literal["llm", "template"]
    synthetic: bool = True


class HalftimeReport(BaseModel):
    match_id: str
    generated_at: datetime
    home: Team
    away: Team
    score: Score
    stats: list[StatLine]
    momentum: list[MomentumBlock]
    story: list[InsightCard]
    prediction: Prediction
    what_to_watch: list[WatchItem]
    meta: ReportMeta


class MatchSummary(BaseModel):
    match_id: str
    home: Team
    away: Team
    scenario: str | None = Field(
        default=None, description="Scripted storyline key (see /api/scenarios); null = organic.")
    title: str | None = None
