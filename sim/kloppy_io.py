"""Ingest adapter: convert between our events and kloppy's standard event model.

kloppy (PySport, BSD-3) reads event data from many providers (Opta, StatsBomb, Wyscout,
Sportec, Metrica...) into one model. With this adapter:

- `to_kloppy(match)` turns a simulated match into a kloppy `EventDataset`, so it can go
  anywhere kloppy goes (exports, other tools).
- `from_kloppy(dataset)` turns any kloppy `EventDataset` back into our event table, and
  `match_from_kloppy(dataset)` wraps it as a `SimulatedMatch` the live engine can run on.
  That is the path for a real feed: provider -> kloppy -> this adapter -> live engine.

Both sides use kloppy's "action executing team" orientation (x = 1 is the goal the acting
team attacks), which is our own convention, scaled 0-1 instead of 0-100.

Needs the optional extra: pip install -e ".[adapters]". The brief allows synthetic data
only, so the tests use a round trip on simulated matches; no real data is in this repo.
"""

from __future__ import annotations

from datetime import timedelta

import pandas as pd
from kloppy.domain import (
    CardEvent,
    CardType,
    DatasetFlag,
    DuelEvent,
    DuelQualifier,
    DuelResult,
    DuelType,
    EventDataset,
    FoulCommittedEvent,
    GenericEvent,
    Ground,
    InterceptionEvent,
    InterceptionResult,
    KloppyCoordinateSystem,
    Metadata,
    Orientation,
    PassEvent,
    PassResult,
    Period,
    Player,
    Point,
    PressureEvent,
    Provider,
    Score,
    ShotEvent,
    ShotResult,
    Team,
    create_event,
)
from kloppy.domain import (
    ExpectedGoals as XGStat,
)

from sim.chain import shot_xg
from sim.simulator import EVENT_COLUMNS, SimulatedMatch
from sim.teams import Player as SimPlayer
from sim.teams import TeamProfile

HALF_MIN = 45
SHOT_RESULTS = {"goal": ShotResult.GOAL, "saved": ShotResult.SAVED,
                "blocked": ShotResult.BLOCKED, "off_target": ShotResult.OFF_TARGET}
SHOT_BACK = {ShotResult.GOAL: "goal", ShotResult.SAVED: "saved", ShotResult.BLOCKED: "blocked",
             ShotResult.OFF_TARGET: "off_target", ShotResult.POST: "off_target",
             ShotResult.OWN_GOAL: "off_target"}
POSITIONS = ("GK", "DF", "MF", "FW")


def _point(x: float, y: float) -> Point:
    return Point(x=round(float(x) / 100, 4), y=round(float(y) / 100, 4))


def _metadata(match: SimulatedMatch) -> tuple[Metadata, dict, dict]:
    teams, players = {}, {}
    sides = (("home", match.home, Ground.HOME), ("away", match.away, Ground.AWAY))
    for side, prof, ground in sides:
        team = Team(team_id=prof.id, name=prof.name, ground=ground)
        for p in prof.players:
            kp = Player(player_id=f"{prof.id}-{p.number}", team=team, jersey_no=p.number,
                        name=p.name, starting=True, attributes={"position": p.position})
            team.players.append(kp)
            players[(side, p.name)] = kp
        teams[side] = team
    periods = [Period(id=1, start_timestamp=timedelta(0), end_timestamp=timedelta(minutes=45)),
               Period(id=2, start_timestamp=timedelta(minutes=45),
                      end_timestamp=timedelta(minutes=90))]
    h, a = match.final_score()
    meta = Metadata(periods=periods, teams=[teams["home"], teams["away"]],
                    coordinate_system=KloppyCoordinateSystem(pitch_length=105, pitch_width=68),
                    pitch_dimensions=KloppyCoordinateSystem(105, 68).pitch_dimensions,
                    orientation=Orientation.ACTION_EXECUTING_TEAM, flags=DatasetFlag(0),
                    provider=Provider.OTHER, score=Score(home=h, away=a), game_id=match.match_id)
    return meta, teams, players


def to_kloppy(match: SimulatedMatch) -> EventDataset:
    """A simulated match as a kloppy EventDataset (one kloppy event per row)."""
    meta, teams, players = _metadata(match)
    periods = {1: meta.periods[0], 2: meta.periods[1]}
    records = []
    for row in match.events.itertuples(index=False):
        period = periods[1 if row.minute <= HALF_MIN else 2]
        start = 0 if period.id == 1 else HALF_MIN
        base = {"event_id": row.event_id, "period": period,
                "timestamp": timedelta(minutes=row.minute - 1 - start, seconds=row.second),
                "team": teams[row.side], "player": players.get((row.side, row.player)),
                "coordinates": _point(row.x, row.y), "ball_owning_team": None,
                "ball_state": None, "raw_event": None,
                "statistics": [], "qualifiers": None, "result": None}
        kind = row.type
        if kind == "pass":
            ev = create_event(PassEvent, **{**base, "result": PassResult.COMPLETE
                                            if row.outcome == "complete" else PassResult.INCOMPLETE,
                                            "receiver_coordinates": _point(row.end_x, row.end_y),
                                            "qualifiers": []})
        elif kind == "shot":
            ev = create_event(ShotEvent, **{**base, "result": SHOT_RESULTS[row.outcome],
                                            "statistics": [XGStat(value=float(row.xg))],
                                            "qualifiers": []})
        elif kind == "interception":
            ev = create_event(InterceptionEvent, **{**base, "result": InterceptionResult.SUCCESS,
                                                    "qualifiers": []})
        elif kind == "tackle":
            ev = create_event(DuelEvent, **{**base, "result": DuelResult.WON,
                                            "qualifiers": [DuelQualifier(value=DuelType.TACKLE)]})
        elif kind == "foul":
            ev = create_event(FoulCommittedEvent, **{**base, "qualifiers": []})
        elif kind == "card":
            ev = create_event(CardEvent, **{**base, "card_type": CardType.RED
                                            if row.outcome == "red" else CardType.FIRST_YELLOW})
        elif kind == "pressure":
            ev = create_event(PressureEvent, **{**base, "qualifiers": []})
        else:  # corner awarded: no kloppy type of its own
            ev = create_event(GenericEvent, **{**base, "event_name": kind, "qualifiers": []})
        ev.raw_event = {"speed_kmh": None if pd.isna(row.speed_kmh) else float(row.speed_kmh),
                        "under_pressure": row.under_pressure, "outcome": row.outcome}
        records.append(ev)
    return EventDataset(records=records, metadata=meta)


def _minute(ev) -> tuple[int, int]:
    secs = ev.timestamp.total_seconds()
    minute = int(secs // 60) + 1 + (HALF_MIN if ev.period.id == 2 else 0)
    cap = HALF_MIN if ev.period.id == 1 else 2 * HALF_MIN  # stoppage time folds into 45' / 90'
    return min(minute, cap), int(secs % 60)


def from_kloppy(dataset: EventDataset, match_id: str | None = None) -> pd.DataFrame:
    """Any kloppy EventDataset as our event table (contract.Event columns).

    Event types we do not model are skipped. Without a provider xG, a shot's xG comes from
    our location model; ball speeds are left empty when the provider has none."""
    ds = dataset.transform(to_orientation=Orientation.ACTION_EXECUTING_TEAM,
                           to_coordinate_system=KloppyCoordinateSystem(105, 68))
    teams = ds.metadata.teams
    side_of = {teams[0].team_id: "home", teams[1].team_id: "away"}
    match_id = match_id or ds.metadata.game_id or "KLOPPY"
    rows = []
    for ev in ds.records:
        if ev.team is None or ev.coordinates is None or ev.period.id not in (1, 2):
            continue
        minute, second = _minute(ev)
        raw = ev.raw_event if isinstance(ev.raw_event, dict) else {}
        x, y = ev.coordinates.x * 100, ev.coordinates.y * 100
        row = {"event_id": ev.event_id, "match_id": match_id, "minute": minute, "second": second,
               "side": side_of[ev.team.team_id], "team_id": ev.team.team_id,
               "player": ev.player.name if ev.player else None, "x": round(x, 1),
               "y": round(y, 1), "xg": None, "end_x": None, "end_y": None,
               "speed_kmh": raw.get("speed_kmh"), "under_pressure": None}
        if isinstance(ev, PassEvent):
            end = ev.receiver_coordinates or ev.coordinates
            row.update(type="pass", outcome="complete" if ev.result == PassResult.COMPLETE
                       else "incomplete", end_x=round(end.x * 100, 1), end_y=round(end.y * 100, 1),
                       under_pressure=bool(raw.get("under_pressure", False)))
        elif isinstance(ev, ShotEvent):
            xg = next((s.value for s in ev.statistics if isinstance(s, XGStat)), None)
            row.update(type="shot", outcome=SHOT_BACK.get(ev.result, "off_target"),
                       xg=round(float(xg if xg is not None else shot_xg(x, y)), 3))
        elif isinstance(ev, InterceptionEvent):
            row.update(type="interception", outcome="won")
        elif isinstance(ev, DuelEvent) and ev.result == DuelResult.WON:
            row.update(type="tackle", outcome="won")
        elif isinstance(ev, FoulCommittedEvent):
            row.update(type="foul", outcome="committed")
        elif isinstance(ev, CardEvent):
            row.update(type="card", outcome="red" if ev.card_type in (CardType.RED,
                                                                      CardType.SECOND_YELLOW)
                       else "yellow")
        elif isinstance(ev, PressureEvent):
            row.update(type="pressure", outcome=raw.get("outcome", "applied"))
        elif isinstance(ev, GenericEvent) and getattr(ev, "event_name", None) == "corner":
            row.update(type="corner", outcome="awarded")
        else:
            continue
        rows.append(row)
    out = pd.DataFrame(rows, columns=EVENT_COLUMNS)
    if out["event_id"].isna().any() or not out["event_id"].is_unique:
        out["event_id"] = [f"{match_id}-{i:04d}" for i in range(len(out))]
    return out


def _profile(team: Team) -> TeamProfile:
    """Neutral strengths (1.0) for a real team: the engine's projection uses live data."""
    players = tuple(SimPlayer(p.name or p.player_id,
                              p.attributes.get("position") if p.attributes.get("position")
                              in POSITIONS else "MF", p.jersey_no or 0)
                    for p in team.players)
    return TeamProfile(id=team.team_id, name=team.name, short_name=team.team_id[:3].upper(),
                       attack=1.0, defence=1.0, press=0.5, players=players)


def match_from_kloppy(dataset: EventDataset, match_id: str | None = None) -> SimulatedMatch:
    """Wrap a kloppy dataset so the live engine (live.engine.MatchEngine) can run on it."""
    events = from_kloppy(dataset, match_id)
    home, away = (_profile(t) for t in dataset.metadata.teams)
    meta = {"venue": "Unknown", "referee": "Unknown", "attendance": 0, "weather": "Unknown"}
    return SimulatedMatch(events["match_id"].iloc[0] if len(events) else (match_id or "KLOPPY"),
                          home, away, events, meta=meta)

