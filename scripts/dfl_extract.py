"""Real football movement for the live pitch (web/src/pitch), from DFL open tracking data.

    make motion-data            # reads data/dfl/, writes web/src/pitch/real/

The data: Bassek et al. 2025, "An integrated dataset of spatiotemporal and event data in elite
soccer", Scientific Data (doi 10.1038/s41597-025-04505-y), figshare article 28196177, CC BY 4.0.
Seven Bundesliga / 2. Bundesliga matches, 25 Hz positions of all 22 players and the ball, with
events. It is 2.6 GB and stays out of git: download the 21 XML files from
https://springernature.figshare.com/articles/dataset/28196177 into data/dfl/ (the figshare
download page needs a browser).

Everything is normalised to the pitch's world frame (web/src/pitch/geometry.ts): 105 x 68 m,
origin at the centre spot, the home team attacking +x in both halves. Writes:

    real/slice.json   a few anonymised real passages at 5 Hz (the lab, film:pitch, test:pitch)
    real/shape.json   where each 4-3-3 slot stands for a ball position, with and without the ball
    real/stats.json   the real numbers behind the planner's constants and the motion checks

No names leave this script: players become a side, a role and a slot number.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import sys
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "dfl"
OUT = ROOT / "web" / "src" / "pitch" / "real"

LENGTH, WIDTH = 105.0, 68.0
HZ = 25
STEP = 5  # keep every 5th frame: 5 Hz, the planner's 0.2 s step
DT = STEP / HZ
SOURCE = (
    "DFL / Sportec Solutions open data (Bassek et al. 2025, Scientific Data, "
    "doi 10.1038/s41597-025-04505-y), CC BY 4.0"
)

# Our 4-3-3 slots, in order: the keeper, then each line by its own-frame y (right to left,
# facing the attack). Shirt numbers follow the slot (1, 2-5, 6-8, 9-11): no real numbers.
LINES = [("GK", 1), ("DF", 4), ("MF", 3), ("FW", 3)]
SLOT_ROLE = [r for r, n in LINES for _ in range(n)]


# ---------------------------------------------------------------- loading


@dataclass
class Half:
    """One half at 5 Hz. Arrays are frames x players (NaN when a player isn't on the pitch)."""

    t: np.ndarray  # absolute seconds of each frame
    bx: np.ndarray
    by: np.ndarray
    bz: np.ndarray
    poss: np.ndarray  # 1 home, 2 away
    alive: np.ndarray  # ball in play
    px: np.ndarray
    py: np.ndarray


@dataclass
class Match:
    id: str
    pids: list[str]
    side: dict[str, str]  # pid -> home / away
    keeper: dict[str, bool]
    halves: list[Half] = field(default_factory=list)
    events: list[dict] = field(default_factory=list)


def _time(s: str) -> float:
    return datetime.fromisoformat(s).timestamp()


def find(kind: str, match_id: str, data: Path) -> Path:
    hits = sorted(data.glob(f"DFL_*_{kind}_*{match_id}.xml"))
    if not hits:
        sys.exit(f"missing {kind} for {match_id} in {data}: see this script's docstring")
    return hits[0]


def match_ids(data: Path) -> list[str]:
    return sorted(
        {re.sub(r".*_(DFL-MAT-\w+)\.xml$", r"\1", p.name) for p in data.glob("DFL_04_*.xml")}
    )


def load_meta(path: Path) -> tuple[dict[str, str], dict[str, bool], tuple[float, float]]:
    root = ET.parse(path).getroot()
    env = root.find(".//Environment")
    size = (float(env.get("PitchX", LENGTH)), float(env.get("PitchY", WIDTH)))
    side: dict[str, str] = {}
    keeper: dict[str, bool] = {}
    for team in root.iter("Team"):
        for p in team.iter("Player"):
            side[p.get("PersonId")] = "home" if team.get("Role") == "home" else "away"
            keeper[p.get("PersonId")] = p.get("PlayingPosition") == "TW"
    return side, keeper, size


def load_positions(path: Path, side: dict[str, str]) -> list[Half]:
    """Stream the 400 MB XML once, keeping every STEP-th frame."""
    sections: dict[str, dict] = {}
    cur = None
    for ev, el in ET.iterparse(path, events=("start", "end")):
        if ev == "start" and el.tag == "FrameSet":
            sec = sections.setdefault(el.get("GameSection"), {"ball": None, "players": {}})
            cur = (sec, el.get("TeamId"), el.get("PersonId"), [])
        elif ev == "end" and el.tag == "Frame":
            n = int(el.get("N"))
            if n % STEP == 0:
                row = [n, float(el.get("X")), float(el.get("Y"))]
                if cur[1] == "BALL":
                    row += [
                        float(el.get("Z", 0)),
                        int(el.get("BallPossession", 0)),
                        int(el.get("BallStatus", 0)),
                        _time(el.get("T")),
                    ]
                cur[3].append(row)
            el.clear()
        elif ev == "end" and el.tag == "FrameSet":
            sec, team, pid, rows = cur
            if team == "BALL":
                sec["ball"] = np.array(rows)
            elif pid in side:
                sec["players"][pid] = np.array(rows)
            el.clear()
    halves = []
    pids = sorted(side)
    for name in ("firstHalf", "secondHalf"):
        sec = sections.get(name)
        if not sec or sec["ball"] is None:
            continue
        ball = sec["ball"]
        frames = ball[:, 0].astype(int)
        at = {n: i for i, n in enumerate(frames)}
        px = np.full((len(frames), len(pids)), np.nan)
        py = np.full_like(px, np.nan)
        for j, pid in enumerate(pids):
            rows = sec["players"].get(pid)
            if rows is None:
                continue
            idx = [at.get(int(n), -1) for n in rows[:, 0]]
            ok = np.array(idx) >= 0
            px[np.array(idx)[ok], j] = rows[ok, 1]
            py[np.array(idx)[ok], j] = rows[ok, 2]
        halves.append(
            Half(
                t=ball[:, 6],
                bx=ball[:, 1],
                by=ball[:, 2],
                bz=ball[:, 3],
                poss=ball[:, 4].astype(int),
                alive=ball[:, 5] == 1,
                px=px,
                py=py,
            )
        )
    return halves


def load_events(path: Path) -> list[dict]:
    """The events the pitch cares about: passes (with recipient), shots, tackles, corners."""
    out = []
    for ev in ET.parse(path).getroot().iter("Event"):
        t = _time(ev.get("CalculatedTimestamp") or ev.get("EventTime"))
        for el in ev.iter():
            if el.tag == "Play" and el.get("Player"):
                out.append(
                    {
                        "t": t,
                        "kind": "pass",
                        "by": el.get("Player"),
                        "to": el.get("Recipient"),
                        "ok": el.get("Evaluation") in ("successfullyCompleted", "successful"),
                        "long": el.get("Distance") == "long",
                        "set": ev.find("CornerKick") is not None,
                    }
                )
            elif el.tag == "ShotAtGoal":
                out.append(
                    {
                        "t": t,
                        "kind": "shot",
                        "by": el.get("Player"),
                        "open": el.get("AfterFreeKick") != "true",
                    }
                )
            elif el.tag == "TacklingGame" and el.get("Winner"):
                out.append(
                    {
                        "t": t,
                        "kind": "tackle",
                        "by": el.get("Winner"),
                        "to": el.get("Loser"),
                        "won": el.get("PossessionChange") == "true",
                    }
                )
            elif el.tag == "CornerKick":
                out.append({"t": t, "kind": "corner", "by": el.get("Team")})
    return sorted(out, key=lambda e: e["t"])


def normalise(m: Match, size: tuple[float, float]) -> None:
    """To 105 x 68 m, home attacking +x in both halves (the data has teams swap ends)."""
    sx, sy = LENGTH / size[0], WIDTH / size[1]
    home_keepers = [j for j, p in enumerate(m.pids) if m.keeper[p] and m.side[p] == "home"]
    for h in m.halves:
        flip = np.nanmean(h.px[:, home_keepers]) > 0 if home_keepers else False
        k = -1.0 if flip else 1.0
        for a, s in ((h.bx, sx), (h.px, sx)):
            a *= k * s
        for a, s in ((h.by, sy), (h.py, sy)):
            a *= k * s


def load_match(match_id: str, data: Path, cache: Path) -> Match:
    side, keeper, size = load_meta(find("matchinformation", match_id, data))
    m = Match(id=match_id, pids=sorted(side), side=side, keeper=keeper)
    npz = cache / f"{match_id}.npz"
    if npz.exists():
        z = np.load(npz)
        for i in range(int(z["n"])):
            m.halves.append(Half(*(z[f"{i}_{k}"] for k in Half.__dataclass_fields__)))
    else:
        m.halves = load_positions(find("positions_raw_observed", match_id, data), side)
        normalise(m, size)
        cache.mkdir(parents=True, exist_ok=True)
        arrays = {
            f"{i}_{k}": getattr(h, k)
            for i, h in enumerate(m.halves)
            for k in Half.__dataclass_fields__
        }
        np.savez_compressed(npz, n=len(m.halves), **arrays)
    m.events = load_events(find("events_raw", match_id, data))
    return m


# ---------------------------------------------------------------- slots


def slots_at(m: Match, h: Half, i0: int, i1: int) -> dict[str, list[int]] | None:
    """Each side's eleven over frames i0..i1 as our 4-3-3 slots (column indices, slot order), or
    None unless both sides have a keeper and ten outfield players on throughout. Lines by mean
    depth (deepest four, the next three, the top three); within a line by mean y, right to left
    facing the attack."""
    out = {}
    for side in ("home", "away"):
        k = 1.0 if side == "home" else -1.0  # own frame: attacking +x
        cols = [
            j
            for j, p in enumerate(m.pids)
            if m.side[p] == side and not np.isnan(h.px[i0:i1, j]).any()
        ]
        keepers = [j for j in cols if m.keeper[m.pids[j]]]
        field_ = [j for j in cols if not m.keeper[m.pids[j]]]
        if len(keepers) != 1 or len(field_) != 10:
            return None
        mx = {j: k * np.mean(h.px[i0:i1, j]) for j in field_}
        my = {j: k * np.mean(h.py[i0:i1, j]) for j in field_}
        by_depth = sorted(field_, key=lambda j: mx[j])
        order, at = list(keepers), 0
        for _, n in LINES[1:]:
            order += sorted(by_depth[at : at + n], key=lambda j: my[j])
            at += n
        out[side] = order
    return out


def windows(m: Match, h: Half, length: int):
    """Stretches of `length` frames with one fixed eleven a side, and their slots."""
    for i0 in range(0, len(h.t) - length, length):
        s = slots_at(m, h, i0, i0 + length)
        if s:
            yield i0, s


# ---------------------------------------------------------------- the shape table

# Ball cells in the team's own frame: 7 along (15 m), 5 across (13.6 m).
NX, NY = 7, 5
SHAPE_WINDOW = int(300 / DT)  # slots are re-fitted every five minutes (substitutions)


def shape_table(matches: list[Match]) -> dict:
    """Mean own-frame spot of each slot per ball cell, with and without the ball. Only frames
    with the ball in play and a team in possession."""
    acc = {k: np.zeros((NX, NY, 11, 2)) for k in ("with", "without")}
    cnt = {k: np.zeros((NX, NY)) for k in ("with", "without")}
    for m in matches:
        for h in m.halves:
            for i0, slots in windows(m, h, SHAPE_WINDOW):
                sl = slice(i0, i0 + SHAPE_WINDOW)
                ok = h.alive[sl] & np.isin(h.poss[sl], (1, 2))
                for side, cols in slots.items():
                    k = 1.0 if side == "home" else -1.0
                    bx, by = k * h.bx[sl][ok], k * h.by[sl][ok]
                    cx = np.clip(((bx + LENGTH / 2) / LENGTH * NX).astype(int), 0, NX - 1)
                    cy = np.clip(((by + WIDTH / 2) / WIDTH * NY).astype(int), 0, NY - 1)
                    mine = h.poss[sl][ok] == (1 if side == "home" else 2)
                    xs = k * h.px[sl][ok][:, cols]
                    ys = k * h.py[sl][ok][:, cols]
                    for key, sel in (("with", mine), ("without", ~mine)):
                        np.add.at(acc[key], (cx[sel], cy[sel], slice(None), 0), xs[sel])
                        np.add.at(acc[key], (cx[sel], cy[sel], slice(None), 1), ys[sel])
                        np.add.at(cnt[key], (cx[sel], cy[sel]), 1)
    out = {"cells": [NX, NY], "roles": SLOT_ROLE}
    for key in ("with", "without"):
        mean = acc[key] / np.maximum(cnt[key], 1)[..., None, None]
        out[key] = np.round(mean, 1).tolist()
        out[f"{key}Frames"] = cnt[key].astype(int).tolist()
    return out


# ---------------------------------------------------------------- the numbers


def q(xs, p: float) -> float:
    return float(np.quantile(xs, p)) if len(xs) else float("nan")


def stats(matches: list[Match]) -> dict:
    """Speeds, speeding up and braking, how a team moves together, and the ball: outfield
    players with the ball in play, 5 Hz (the planner's step)."""
    speeds, acc, dec, together = [], [], [], []
    for m in matches:
        for h in m.halves:
            alive = h.alive[1:-1] & h.alive[2:] & h.alive[:-2]
            for side in ("home", "away"):
                cols = [j for j, p in enumerate(m.pids) if m.side[p] == side and not m.keeper[p]]
                vx = np.diff(h.px[:, cols], axis=0) / DT
                vy = np.diff(h.py[:, cols], axis=0) / DT
                v = np.hypot(vx, vy)
                a = np.diff(v, axis=0) / DT
                v1 = v[1:][alive]
                speeds.append(v1[~np.isnan(v1)])
                a1 = a[alive]
                acc.append(a1[a1 > 0.05])
                dec.append(-a1[a1 < -0.05])
                ang = np.arctan2(vy[1:], vx[1:])[alive]
                moving = v[1:][alive] >= 0.5
                for row, mv in zip(ang, moving, strict=True):
                    ms = row[mv & ~np.isnan(row)]
                    if len(ms) < 3:
                        continue
                    d = np.abs(np.angle(np.exp(1j * (ms[:, None] - ms[None, :]))))
                    together.append((d <= math.radians(25)).sum(axis=1).max() / len(ms))
    v = np.concatenate(speeds)
    bands = {
        "standing": (0, 0.5),
        "walk": (0.5, 2),
        "jog": (2, 4),
        "run": (4, 6),
        "sprint": (6, 99),
    }
    return {
        "frames": int(len(v)),
        "speed": {
            "median": q(v, 0.5),
            "p90": q(v, 0.9),
            "p99": q(v, 0.99),
            "p999": q(v, 0.999),
            **{k: float(((v >= lo) & (v < hi)).mean()) for k, (lo, hi) in bands.items()},
        },
        "accel": {"p50": q(np.concatenate(acc), 0.5), "p90": q(np.concatenate(acc), 0.9)},
        "brake": {"p50": q(np.concatenate(dec), 0.5), "p90": q(np.concatenate(dec), 0.9)},
        "together": {"median": q(together, 0.5), "p90": q(together, 0.9)},
    }


# ---------------------------------------------------------------- the slice

SLICE_S = 40
SLICE_KINDS = ("buildup", "turnover", "switch", "shot", "corner", "counter")


def pick_passages(matches: list[Match]) -> list[tuple[Match, Half, int, str]]:
    """One passage per kind, each from a different match where it can be: deterministic."""
    n = int(SLICE_S / DT)
    found: dict[str, list] = {k: [] for k in SLICE_KINDS}
    for m in matches:
        for h in m.halves:
            t0, t1 = h.t[0], h.t[-1]

            def at(t, h=h):
                return int(np.searchsorted(h.t, t))

            evs = [e for e in m.events if t0 + 15 < e["t"] < t1 - SLICE_S]
            for e in evs:
                kind = None
                if e["kind"] == "corner":
                    kind = "corner"
                elif e["kind"] == "shot" and e.get("open"):
                    won = [
                        x
                        for x in evs
                        if x["kind"] == "tackle" and x["won"] and 0 < e["t"] - x["t"] < 12
                    ]
                    kind = "counter" if won else "shot"
                elif e["kind"] == "tackle" and e["won"]:
                    kind = "turnover"
                elif e["kind"] == "pass" and e["long"] and e["ok"]:
                    kind = "switch"
                elif e["kind"] == "pass" and e["ok"]:
                    run = [
                        x
                        for x in evs
                        if x["kind"] == "pass" and x["ok"] and 0 <= x["t"] - e["t"] < 25
                    ]
                    if len(run) >= 8:
                        kind = "buildup"
                if not kind:
                    continue
                lead = {"corner": 8, "shot": 25, "counter": 25, "turnover": 15}.get(kind, 10)
                i0 = at(e["t"] - lead)
                if i0 + n >= len(h.t) or not h.alive[i0 : i0 + n].mean() > 0.7:
                    continue
                if slots_at(m, h, i0, i0 + n):
                    found[kind].append((m, h, i0))
    out, used = [], set()
    for kind in SLICE_KINDS:
        if not found[kind]:
            continue
        # The middle candidate from a match not used yet, else the middle one.
        fresh = [c for c in found[kind] if c[0].id not in used] or found[kind]
        m, h, i0 = fresh[len(fresh) // 2]
        used.add(m.id)
        out.append((m, h, i0, kind))
    return out


def passage(m: Match, h: Half, i0: int, kind: str) -> dict:
    n = int(SLICE_S / DT)
    sl = slice(i0, i0 + n)
    slots = slots_at(m, h, i0, i0 + n)
    cols = slots["home"] + slots["away"]
    pid_ix = {m.pids[j]: k for k, j in enumerate(cols)}
    dm = lambda a: np.round(a * 10).astype(int).tolist()  # noqa: E731 - decimetres
    t0 = h.t[i0]
    events = []
    for e in m.events:
        if t0 <= e["t"] < h.t[i0 + n - 1] and e.get("by") in pid_ix:
            events.append(
                {
                    "t": round(e["t"] - t0, 2),
                    "kind": e["kind"],
                    "by": pid_ix[e["by"]],
                    "to": pid_ix.get(e.get("to")),
                    "ok": e.get("ok", e.get("won")),
                }
            )
    return {
        "kind": kind,
        "hz": HZ // STEP,
        "players": [
            {"side": s, "role": SLOT_ROLE[k], "number": k + 1}
            for s in ("home", "away")
            for k in range(11)
        ],
        "x": [dm(h.px[sl, j]) for j in cols],
        "y": [dm(h.py[sl, j]) for j in cols],
        "ball": {"x": dm(h.bx[sl]), "y": dm(h.by[sl]), "z": dm(h.bz[sl])},
        "alive": "".join("1" if a else "0" for a in h.alive[sl]),
        "poss": "".join({1: "h", 2: "a"}.get(int(p), "-") for p in h.poss[sl]),
        "events": events,
    }


# ---------------------------------------------------------------- main


def write(name: str, obj) -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    path = OUT / name
    path.write_text(json.dumps({"source": SOURCE, **obj}, separators=(",", ":")) + "\n")
    print(f"wrote {path.relative_to(ROOT)}: {path.stat().st_size / 1024:.0f} KB")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--data", type=Path, default=DATA)
    parser.add_argument("--only", help="comma-separated match ids (default: every match found)")
    args = parser.parse_args()
    ids = args.only.split(",") if args.only else match_ids(args.data)
    if not ids:
        sys.exit(f"no DFL files in {args.data}: see this script's docstring")
    matches = []
    for mid in ids:
        print(f"loading {mid}", flush=True)
        matches.append(load_match(mid, args.data, ROOT / "data" / "dfl-cache"))
    s = stats(matches)
    print(json.dumps(s, indent=1))
    write("stats.json", {"matches": len(matches), **s})
    write("shape.json", shape_table(matches))
    write("slice.json", {"passages": [passage(*p) for p in pick_passages(matches)]})


if __name__ == "__main__":
    main()
