"""Regenerate the contract files the web side builds against.

    python scripts/export_contract.py

Writes:
  contract/halftime.schema.json        JSON Schema of HalftimeReport
  contract/examples/halftime.sample.json  a real report from a demo match
  web/src/mock/halftime.json           same sample, used by the page when the API is down
"""

import json
from pathlib import Path

from contract import HalftimeReport
from model.halftime import build_report
from model.predict import load_predictor
from sim.simulator import simulate_season

ROOT = Path(__file__).resolve().parents[1]
SAMPLE_MATCH = 1  # index into the demo season; pick one with a good story


def main() -> None:
    schema = ROOT / "contract" / "halftime.schema.json"
    schema.write_text(json.dumps(HalftimeReport.model_json_schema(), indent=2) + "\n")

    match = simulate_season(SAMPLE_MATCH + 1, seed=2026)[SAMPLE_MATCH]
    sample = build_report(match, load_predictor()).model_dump_json(indent=2) + "\n"
    for out in (ROOT / "contract" / "examples" / "halftime.sample.json",
                ROOT / "web" / "src" / "mock" / "halftime.json"):
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(sample)
        print(f"wrote {out.relative_to(ROOT)}")
    print(f"wrote {schema.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
