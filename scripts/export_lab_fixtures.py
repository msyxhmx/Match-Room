"""Write the real engine output the component lab renders (web/src/lab/fixtures/*.json),
and the saved match the website plays when the API is down (web/src/live/saved/).

    python scripts/export_lab_fixtures.py

The lab (web/lab.html, dev only) shows every component in every state. Its fixtures come
from the live engine for the comeback scenario, so the text on every screenshot is text the
demo will really show. The mocks in web/src/mock/live/ stay as they are: they belong to
`make schema`. Run this again after a change to live/templates.py.
"""

import json
from pathlib import Path

from contract import Profile
from live.engine import MatchEngine, to_events
from sim.simulator import simulate_scenario

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "web" / "src" / "lab" / "fixtures"
# The saved match the website falls back to when the API is down: the stream, recorded.
SAVED = ROOT / "web" / "src" / "live" / "saved"

# The demo profile (STORYBOARD §3), and the switches S7 shows.
PROFILES = {
    "en": Profile(persona="casual", language="en", team="NGC", player="L. Quinn"),
    "ms": Profile(persona="casual", language="ms", team="NGC", player="L. Quinn"),
    "es": Profile(persona="casual", language="es", team="NGC", player="L. Quinn"),
    "en-analyst": Profile(persona="analyst", language="en", team="NGC", player="L. Quinn"),
    "ms-analyst": Profile(persona="analyst", language="ms", team="NGC", player="L. Quinn"),
}
# Minutes the video stops on: kick-off, the first goal, half-time, the equaliser, full time.
MINUTES = (0, 15, 45, 75, 90)


def write(name: str, obj, out: Path = OUT, exclude: set[str] | None = None) -> None:
    data = ([o.model_dump(mode="json", exclude=exclude) for o in obj] if isinstance(obj, list)
            else obj.model_dump(mode="json", exclude=exclude))
    path = out / name
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {path.relative_to(ROOT)}")


EVENT_KEYS = ("event_id", "minute", "second", "side", "player", "type", "x", "y", "outcome",
              "xg", "end_x", "end_y", "speed_kmh")


def slim_events(engine: MatchEngine) -> list[dict]:
    """Every event, minutes 0-90, in the keys the pitch needs: floats to 1 dp, nulls left out."""
    ev = engine.match.events
    out = []
    for e in to_events(ev[ev["minute"] <= 90]):
        d = e.model_dump(mode="json")
        row = {}
        for k in EVENT_KEYS:
            v = d.get(k)
            if v is None:
                continue
            row[k] = round(v, 1) if isinstance(v, float) else v
        out.append(row)
    return out


def main() -> None:
    engine = MatchEngine(simulate_scenario("comeback"))
    en = PROFILES["en"]
    for minute in MINUTES:
        write(f"snapshot.{minute}.en.json", engine.snapshot(minute, en))
    for key, profile in PROFILES.items():
        if key != "en":
            write(f"snapshot.75.{key}.json", engine.snapshot(75, profile))
        write(f"overlays.{key}.json", engine.overlays(profile))
    write("brief.halftime.en.json", engine.brief("halftime", en))
    write("brief.fulltime.en.json", engine.brief("fulltime", en))
    write("brief.fulltime.ms-analyst.json", engine.brief("fulltime", PROFILES["ms-analyst"]))
    write("brief.halftime.ms-analyst.json", engine.brief("halftime", PROFILES["ms-analyst"]))

    # The saved match: kick-off, every tick the stream sends (without the raw events and
    # metrics, which the screens don't draw), and the two briefs. Demo profile, English.
    write("snapshot.0.json", engine.snapshot(0, en), SAVED)
    write("ticks.json", [engine.tick(m, en) for m in range(1, 91)], SAVED,
          exclude={"new_events", "metrics"})
    write("brief.halftime.json", engine.brief("halftime", en), SAVED)
    write("brief.fulltime.json", engine.brief("fulltime", en), SAVED)

    # Preview mode: the same four files for every other language and persona, so L and P
    # work with no API. en-casual is the top-level set above.
    for lang in ("en", "ms", "es"):
        for persona in ("casual", "analyst"):
            if (lang, persona) == ("en", "casual"):
                continue
            p = Profile(persona=persona, language=lang, team="NGC", player="L. Quinn")
            d = SAVED / "profiles" / f"{lang}-{persona}"
            write("snapshot.0.json", engine.snapshot(0, p), d)
            write("ticks.json", [engine.tick(m, p) for m in range(1, 91)], d,
                  exclude={"new_events", "metrics"})
            write("brief.halftime.json", engine.brief("halftime", p), d)
            write("brief.fulltime.json", engine.brief("fulltime", p), d)

    # The pitch simulation's inputs: every event, and the squads (what GET .../lineups returns).
    events = slim_events(engine)
    path = SAVED / "events.json"
    path.write_text(json.dumps(events, separators=(",", ":"), ensure_ascii=False) + "\n")
    kb = path.stat().st_size / 1024
    print(f"wrote {path.relative_to(ROOT)} ({len(events)} events, {kb:.1f} KB)")
    write("lineups.json", engine.lineups(), SAVED)


if __name__ == "__main__":
    main()
