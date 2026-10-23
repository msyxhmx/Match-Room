"""Assemble the full HalftimeReport (the API contract) for one match.

This is the one function the API calls: simulated match in, contract out.
"""

from __future__ import annotations

from datetime import UTC, datetime

from contract import HalftimeReport, MomentumBlock, ReportMeta, Score, StatLine, Team
from model.features import BLOCKS, match_features, side_stats, tilt_by_block
from model.predict import Predictor
from model.story import build_story, what_to_watch
from sim.simulator import SimulatedMatch

STAT_ROWS = [
    ("goals", "Goals"),
    ("xg", "Expected goals (xG)"),
    ("shots", "Shots"),
    ("sot", "Shots on target"),
    ("possession", "Possession %"),
    ("pass_acc", "Pass accuracy %"),
    ("corners", "Corners"),
    ("fouls", "Fouls"),
    ("yellow", "Yellow cards"),
    ("red", "Red cards"),
]


def _team(t) -> Team:
    return Team(id=t.id, name=t.name, short_name=t.short_name)


def _stat_lines(stats: dict) -> list[StatLine]:
    h, a = dict(stats["home"]), dict(stats["away"])
    total = h["passes"] + a["passes"] or 1
    h["possession"], a["possession"] = 100 * h["passes"] / total, 100 * a["passes"] / total
    h["pass_acc"], a["pass_acc"] = 100 * h["pass_acc"], 100 * a["pass_acc"]
    lines = []
    for key, label in STAT_ROWS:
        digits = 2 if key == "xg" else 0
        lines.append(StatLine(key=key, label=label, home=round(h[key], digits),
                              away=round(a[key], digits)))
    return lines


def build_report(match: SimulatedMatch, predictor: Predictor) -> HalftimeReport:
    fh = match.first_half()
    stats = {"home": side_stats(fh, "home"), "away": side_stats(fh, "away")}
    features = match_features(match)
    prediction = predictor.predict(features)
    story, source, trace = build_story(match, features, stats, prediction)
    tilt = tilt_by_block(fh)

    return HalftimeReport(
        match_id=match.match_id,
        generated_at=datetime.now(UTC),
        home=_team(match.home),
        away=_team(match.away),
        score=Score(home=int(stats["home"]["goals"]), away=int(stats["away"]["goals"])),
        stats=_stat_lines(stats),
        momentum=[MomentumBlock(start_minute=s, end_minute=e, home_share=round(t, 3))
                  for (s, e), t in zip(BLOCKS, tilt, strict=True)],
        story=story,
        prediction=prediction,
        what_to_watch=what_to_watch(match, features, prediction),
        meta=ReportMeta(model_version=predictor.version, story_source=source,
                        agent_trace=trace),
    )
