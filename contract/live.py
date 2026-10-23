"""The live contract: what Match-Room Live hands to the web side.

Same rule as contract/models.py: change a field here, then run `make schema`,
update web/src/types/live.ts, and say so in the PR.

Every number a viewer sees in a card is listed in that card's `facts_used`,
and every claim links to `evidence` event IDs. That is the trust trail.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field

from contract.models import Event, EvidenceRef, Score, Side, Team

Persona = Literal["casual", "analyst"]
Language = Literal["en", "ms", "es"]
Period = Literal["pre", "1H", "HT", "2H", "FT"]
Phase = Literal["home_control", "away_control", "chaos", "balanced"]
InsightType = Literal[
    "goal", "red_card", "big_chance", "shot_speed", "pass_of_the_moment", "momentum_flip",
    "control_shift", "chaos_phase", "pressure_spike", "win_prob_swing", "tempo_shift",
    "player_milestone", "player_focus",
]
Graphic = Literal["lower_third", "alert", "stat_bug", "momentum_bar", "player_tag"]


class Profile(BaseModel):
    """Who the output is for. Same match, different experience."""

    persona: Persona = "casual"
    language: Language = "en"
    team: str | None = Field(default=None, description="Favourite team id, e.g. 'NGC'.")
    player: str | None = Field(default=None, description="Focus player name, e.g. 'L. Quinn'.")


class MatchMeta(BaseModel):
    venue: str
    referee: str
    attendance: int
    weather: str
    scenario: str | None = None
    scenario_title: str | None = None
    synthetic: bool = True


class PlayerRef(BaseModel):
    name: str
    number: int
    position: str
    team_id: str
    side: Side


class Lineups(BaseModel):
    match_id: str
    home: Team
    away: Team
    meta: MatchMeta
    players: list[PlayerRef]


class MetricLine(BaseModel):
    key: str
    label: str
    home: float
    away: float
    unit: str | None = None
    definition: str = Field(description="Plain-language definition, shown on tap/hover.")


class ControlState(BaseModel):
    """Our own 'control vs chaos' composite over the last 10 minutes."""

    home_share: float = Field(description="0-1. Above 0.57 = home in control, below 0.43 = away.")
    chaos: float = Field(description="0-1. Above 0.80 = chaotic phase.")
    tempo: float = Field(description="Passes per minute, both teams, last 10 minutes.")
    momentum: float = Field(description="-1 (away on top) to +1 (home on top), recency-weighted "
                                        "share of threat.")
    phase: Phase
    label: str = Field(description="Localised phrase for the phase, e.g. 'Northgate in control'.")


class Driver(BaseModel):
    key: str
    label: str
    value: str


class WinProjection(BaseModel):
    """An explained projection, not betting odds."""

    home_win: float
    draw: float
    away_win: float
    drivers: list[Driver]
    note: str


class Series(BaseModel):
    """Per-minute series from kick-off to the current minute (index 0 = 0')."""

    minute: list[int]
    momentum: list[float]
    control_home: list[float]
    chaos: list[float]
    home_win: list[float]
    draw: list[float]
    away_win: list[float]


class FactUsed(BaseModel):
    key: str
    label: str
    value: str = Field(description="Exactly as it appears in the text.")


class LiveCard(BaseModel):
    """One narrated insight, personalised to a Profile."""

    insight_id: str
    type: InsightType
    variant: str
    minute: int
    second: int
    clock: str
    priority: int = Field(description="1 = headline, 2 = notable, 3 = detail.")
    side: Side | None
    team_id: str | None
    players: list[str]
    headline: str
    body: str
    why: list[str] = Field(default_factory=list,
                           description="Reasons it matters; analyst persona gets more.")
    facts_used: list[FactUsed]
    evidence: list[EvidenceRef]
    tags: list[str] = Field(default_factory=list,
                            description="e.g. 'your_team', 'focus_player', 'against_your_team'.")
    language: Language
    persona: Persona
    source: Literal["template", "llm"] = "template"


class OverlayMessage(BaseModel):
    """Timed, machine-readable graphic for a broadcast or stream overlay.

    `fields` is a flat string map, so it binds directly to graphics templates
    (e.g. Vizrt-style ${headline}) or to the HTML overlay."""

    seq: int
    match_id: str
    minute: int
    second: int
    clock: str
    graphic: Graphic
    priority: int
    ttl_s: int = Field(description="Seconds the graphic stays on screen at real speed.")
    insight_id: str | None = None
    language: Language
    fields: dict[str, str]


class PlayerLine(BaseModel):
    name: str
    number: int
    position: str
    team_id: str
    side: Side
    touches: int
    passes: int
    passes_completed: int
    pass_accuracy: int
    xt_added: float
    shots: int
    goals: int
    xg: float
    ball_wins: int
    pressures: int
    top_shot_speed_kmh: float | None = None
    involvement: list[int] = Field(description="Touches per 15-minute block.")
    cards: list[str] = Field(default_factory=list)


class LiveSnapshot(BaseModel):
    """Everything a screen needs at one minute of the match."""

    match_id: str
    minute: int
    clock: str
    period: Period
    home: Team
    away: Team
    score: Score
    meta: MatchMeta
    profile: Profile
    metrics: list[MetricLine]
    control: ControlState
    projection: WinProjection
    series: Series
    cards: list[LiveCard] = Field(description="Personalised cards so far, newest first.")
    overlays: list[OverlayMessage] = Field(description="Graphics on screen at this minute.")
    focus_player: PlayerLine | None = None
    recent_events: list[Event] = Field(description="Shots, cards and goals in the last 10'.")


class BriefPoint(BaseModel):
    title: str
    body: str
    facts_used: list[FactUsed] = Field(default_factory=list)
    evidence: list[EvidenceRef] = Field(default_factory=list)


class TurningPoint(BaseModel):
    insight_id: str
    minute: int
    clock: str
    title: str
    side: Side | None
    win_before: float = Field(description="Win chance of `side` (or home) just before.")
    win_after: float


class ControlProfile(BaseModel):
    """Minutes spent in each phase."""

    home_control: int
    away_control: int
    chaos: int
    balanced: int


class MatchBrief(BaseModel):
    """Half-time or full-time roll-up of the insight log."""

    match_id: str
    kind: Literal["halftime", "fulltime"]
    minute: int
    home: Team
    away: Team
    score: Score
    meta: MatchMeta
    profile: Profile
    headline: str
    summary: str
    summary_source: Literal["template", "llm"] = "template"
    what_happened: list[LiveCard]
    why: list[BriefPoint]
    what_to_watch: list[BriefPoint]
    turning_points: list[TurningPoint]
    control_profile: ControlProfile
    metrics: list[MetricLine]
    projection: WinProjection | None = None
    player_of_the_match: PlayerLine | None = None
    focus_player: PlayerLine | None = None


class CatchUp(BaseModel):
    """'I just joined': the story so far in a few cards."""

    match_id: str
    minute: int
    clock: str
    home: Team
    away: Team
    score: Score
    profile: Profile
    headline: str
    cards: list[LiveCard]
    control: ControlState
    projection: WinProjection


class ScenarioInfo(BaseModel):
    key: str
    match_id: str
    title: str
    description: str
    home: Team
    away: Team


class SeasonRow(BaseModel):
    team: Team
    played: int
    won: int
    drawn: int
    lost: int
    goals_for: int
    goals_against: int
    points: int
    xg_for: float
    xg_against: float
    control_share: float = Field(description="Share of match minutes this team was in control.")
    chaos_share: float = Field(description="Share of their match minutes that were chaotic.")
    wins_against_run: int = Field(description="Wins where they had less of the control.")


class SeasonStoryline(BaseModel):
    id: str
    title: str
    body: str
    team_id: str | None = None
    facts_used: list[FactUsed] = Field(default_factory=list)


class SeasonReport(BaseModel):
    matches: int
    profile: Profile
    table: list[SeasonRow]
    storylines: list[SeasonStoryline]


class StreamTick(BaseModel):
    """Websocket message, once per match minute."""

    type: Literal["tick"] = "tick"
    minute: int
    clock: str
    period: Period
    score: Score
    control: ControlState
    projection: WinProjection
    metrics: list[MetricLine]
    new_events: list[Event]
    new_cards: list[LiveCard]
    new_overlays: list[OverlayMessage]


class StreamBrief(BaseModel):
    """Websocket message at half-time and full-time."""

    type: Literal["halftime", "fulltime"]
    brief: MatchBrief
