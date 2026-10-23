"""Regenerate the contract files the web side builds against.

    python scripts/export_contract.py

Writes:
  contract/halftime.schema.json            JSON Schema of HalftimeReport
  contract/live.schema.json                JSON Schema of every Match-Room Live response
  contract/examples/halftime.sample.json   a real report from a demo match
  contract/examples/live/*.json            real Live responses (comeback scenario)
  web/src/mock/halftime.json               same half-time sample, used when the API is down
  web/src/mock/live/*.json                 same Live samples, for building the UI offline
"""

import json
from pathlib import Path

from pydantic.json_schema import models_json_schema

from contract import (
    CatchUp,
    HalftimeReport,
    Lineups,
    LiveCard,
    LiveSnapshot,
    MatchBrief,
    OverlayMessage,
    Profile,
    ScenarioInfo,
    SeasonReport,
    StreamBrief,
    StreamTick,
)
from live.engine import MatchEngine
from live.season import season_report
from model.halftime import build_report
from model.predict import load_predictor
from sim.simulator import simulate_scenario, simulate_season

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_MATCH = 1  # index into the demo season; pick one with a good story
LIVE_SAMPLE = "comeback"
LIVE_MODELS = [LiveSnapshot, LiveCard, OverlayMessage, MatchBrief, CatchUp, Lineups,
               SeasonReport, ScenarioInfo, StreamTick, StreamBrief]


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text)
    print(f"wrote {path.relative_to(ROOT)}")


def dump(obj) -> str:
    if isinstance(obj, list):
        return json.dumps([o.model_dump(mode="json") for o in obj], indent=2,
                          ensure_ascii=False) + "\n"
    return json.dumps(obj.model_dump(mode="json"), indent=2, ensure_ascii=False) + "\n"


def main() -> None:
    write(ROOT / "contract" / "halftime.schema.json",
          json.dumps(HalftimeReport.model_json_schema(), indent=2) + "\n")
    _, live_schema = models_json_schema([(m, "serialization") for m in LIVE_MODELS],
                                        title="Match-Room Live contract")
    write(ROOT / "contract" / "live.schema.json", json.dumps(live_schema, indent=2) + "\n")

    match = simulate_season(SAMPLE_MATCH + 1, seed=2026)[SAMPLE_MATCH]
    sample = build_report(match, load_predictor()).model_dump_json(indent=2) + "\n"
    for out in (ROOT / "contract" / "examples" / "halftime.sample.json",
                ROOT / "web" / "src" / "mock" / "halftime.json"):
        write(out, sample)

    engine = MatchEngine(simulate_scenario(LIVE_SAMPLE))
    casual = Profile(persona="casual", language="en", team="NGC", player="L. Quinn")
    analyst_ms = Profile(persona="analyst", language="ms", team="NGC")
    samples = {
        "snapshot.json": dump(engine.snapshot(67, casual)),
        "snapshot.analyst.ms.json": dump(engine.snapshot(67, analyst_ms)),
        "cards.json": dump(engine.cards(casual)),
        "overlays.json": dump(engine.overlays(casual)),
        "brief.halftime.json": dump(engine.brief("halftime", casual)),
        "brief.fulltime.json": dump(engine.brief("fulltime", casual)),
        "catchup.json": dump(engine.catchup(70, casual)),
        "lineups.json": dump(engine.lineups()),
        "tick.json": dump(engine.tick(61, casual)),
        "season.json": dump(season_report(Profile(team="NGC"))),
    }
    bases = (ROOT / "contract" / "examples" / "live", ROOT / "web" / "src" / "mock" / "live")
    for name, text in samples.items():
        for base in bases:
            write(base / name, text)


if __name__ == "__main__":
    main()
