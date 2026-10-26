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
# DFL position codes to those slots. Most teams here play 4-2-3-1 (or 4-3-3 with two holding
# midfielders): the holding pair and the attacking midfielder make our three, the wide attackers
# and the striker our front three. A stretch where a team's codes don't fill every slot once (a
# back three, a 4-4-2, a change of system) is left out.
CODE_SLOT = {
    "TW": 0,
    "RV": 1, "IVR": 2, "IVL": 3, "LV": 4,
    "DMR": 5, "ZO": 6, "DML": 7,
    "ORM": 8, "RA": 8, "STZ": 9, "OLM": 10, "LA": 10,
}  # fmt: skip


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
    code: dict[str, str]  # pid -> DFL position code
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


def load_meta(path: Path):
    root = ET.parse(path).getroot()
    env = root.find(".//Environment")
    size = (float(env.get("PitchX", LENGTH)), float(env.get("PitchY", WIDTH)))
    side: dict[str, str] = {}
    keeper: dict[str, bool] = {}
    code: dict[str, str] = {}
    for team in root.iter("Team"):
        for p in team.iter("Player"):
            side[p.get("PersonId")] = "home" if team.get("Role") == "home" else "away"
            keeper[p.get("PersonId")] = p.get("PlayingPosition") == "TW"
            code[p.get("PersonId")] = p.get("PlayingPosition") or ""
    return side, keeper, code, size


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
    side, keeper, code, size = load_meta(find("matchinformation", match_id, data))
    m = Match(id=match_id, pids=sorted(side), side=side, keeper=keeper, code=code)
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


def side_slots(m: Match, h: Half, i0: int, i1: int, side: str) -> list[int] | None:
    """One side's eleven over frames i0..i1 as our 4-3-3 slots (column indices in slot order), or
    None unless the eleven on the pitch throughout fill every slot once (CODE_SLOT)."""
    order: list[int | None] = [None] * 11
    for j, p in enumerate(m.pids):
        if m.side[p] != side or np.isnan(h.px[i0:i1, j]).any():
            continue
        k = CODE_SLOT.get(m.code[p])
        if k is None or order[k] is not None:
            return None
        order[k] = j
    return order if None not in order else None


def slots_at(m: Match, h: Half, i0: int, i1: int) -> dict[str, list[int]] | None:
    """Both sides' slots (side_slots), or None unless both fit."""
    out = {side: side_slots(m, h, i0, i1, side) for side in ("home", "away")}
    return out if all(out.values()) else None


def windows(m: Match, h: Half, length: int):
    """Stretches of `length` frames, with the slots of each side whose eleven fits throughout."""
    for i0 in range(0, len(h.t) - length, length):
        s = {side: side_slots(m, h, i0, i0 + length, side) for side in ("home", "away")}
        s = {k: v for k, v in s.items() if v}
        if s:
            yield i0, s


# ---------------------------------------------------------------- the shape table

# Ball cells in the team's own frame: 7 along (15 m), 5 across (13.6 m).
NX, NY = 7, 5
SHAPE_WINDOW = int(60 / DT)  # slots are re-fitted every minute (substitutions)


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
        # The typical speed inside each band: the gaits.
        "gait": {k: q(v[(v >= lo) & (v < hi)], 0.5) for k, (lo, hi) in bands.items()},
        "accel": {f"p{p}": q(np.concatenate(acc), p / 100) for p in (50, 90, 99)},
        "brake": {f"p{p}": q(np.concatenate(dec), p / 100) for p in (50, 90, 99)},
        "together": {"median": q(together, 0.5), "p90": q(together, 0.9)},
    }


def pass_numbers(matches: list[Match]) -> dict:
    """Around a completed pass: who is near the passer at the touch, how the receiver comes to
    the ball, how fast and high it travels, and how long the receiver keeps it. The touch is the
    frame within a second of the event where the ball is nearest the passer; it lands when the
    receiver is first within 1.5 m of it (within 4 s)."""
    rows = []
    for m in matches:
        col = {p: j for j, p in enumerate(m.pids)}
        passes = [e for e in m.events if e["kind"] == "pass"]
        for h in m.halves:
            # Height is the ball's centre: a ball rolling along the ground reads about 0.1 m.
            ground = float(np.nanmedian(h.bz[h.alive]))
            for k, e in enumerate(passes):
                if not (e["ok"] and e["to"] in col and h.t[0] < e["t"] < h.t[-1] - 5):
                    continue
                a, r = col[e["by"]], col[e["to"]]
                c = int(np.searchsorted(h.t, e["t"]))
                win = range(max(0, c - int(1 / DT)), min(len(h.t) - 1, c + int(1 / DT)))
                d = [math.hypot(h.px[i, a] - h.bx[i], h.py[i, a] - h.by[i]) for i in win]
                if not d or np.isnan(d).all():
                    continue
                i0 = win[int(np.nanargmin(d))]
                if not h.alive[i0] or np.nanmin(d) > 2:
                    continue
                i1 = next(
                    (
                        i
                        for i in range(i0 + 2, min(len(h.t), i0 + int(4 / DT)))
                        if math.hypot(h.px[i, r] - h.bx[i], h.py[i, r] - h.by[i]) < 1.5
                    ),
                    None,
                )
                if i1 is None:
                    continue
                mates = [j for j, p in enumerate(m.pids) if m.side[p] == m.side[e["by"]] and j != a]
                opps = [j for j, p in enumerate(m.pids) if m.side[p] != m.side[e["by"]]]
                at = np.array([h.px[i0, a], h.py[i0, a]])
                near = lambda js, i=i0, at=at, h=h: np.nanmin(  # noqa: E731
                    np.hypot(h.px[i, js] - at[0], h.py[i, js] - at[1])
                )
                length = math.hypot(h.bx[i1] - h.bx[i0], h.by[i1] - h.by[i0])
                flight = (i1 - i0) * DT
                back = max(i0, i1 - int(1 / DT))
                rv = np.hypot(np.diff(h.px[back : i1 + 1, r]), np.diff(h.py[back : i1 + 1, r])) / DT
                # Toward the ball's start: the receiver comes to meet it (+) or waits / drifts away.
                to_ball = np.array([h.bx[i0] - h.px[i1, r], h.by[i0] - h.py[i1, r]])
                step = np.array([h.px[i1, r] - h.px[back, r], h.py[i1, r] - h.py[back, r]])
                meets = float(step @ to_ball / max(1e-6, np.linalg.norm(to_ball))) / (
                    (i1 - back) * DT
                )
                nxt = next((x for x in passes[k + 1 :] if x["by"] == e["to"]), None)
                held = nxt["t"] - h.t[i1] if nxt and 0 < nxt["t"] - h.t[i1] < 15 else np.nan
                rows.append(
                    [
                        near(opps),
                        near(mates),
                        length,
                        length / flight,
                        max(0.0, float(np.nanmax(h.bz[i0 : i1 + 1])) - ground),
                        float(np.nanmean(rv)),
                        meets,
                        held,
                    ]
                )
    x = np.array(rows)
    pct = lambda v: {f"p{p}": round(q(v[~np.isnan(v)], p / 100), 2) for p in (10, 25, 50, 75, 90)}  # noqa: E731
    cols = [
        "presser",
        "support",
        "length",
        "speed",
        "height",
        "receiverSpeed",
        "receiverMeets",
        "held",
    ]
    out = {"passes": len(x), **{c: pct(x[:, i]) for i, c in enumerate(cols)}}
    # Ball speed and peak height by pass length (m).
    out["byLength"] = []
    for lo, hi in ((0, 10), (10, 20), (20, 30), (30, 45), (45, 120)):
        sel = (x[:, 2] >= lo) & (x[:, 2] < hi)
        out["byLength"].append(
            {
                "from": lo,
                "to": hi,
                "n": int(sel.sum()),
                "speed": pct(x[sel, 3]),
                # Lofted: peaks over 1 m above the ground.
                "lofted": round(float((x[sel, 4] > 1).mean()), 3),
                "height": pct(x[sel, 4]),
            }
        )
    return out


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
    s["pass"] = pass_numbers(matches)
    print(json.dumps(s["pass"], indent=1))
    write("stats.json", {"matches": len(matches), **s})
    write("shape.json", shape_table(matches))
    write("slice.json", {"passages": [passage(*p) for p in pick_passages(matches)]})


if __name__ == "__main__":
    main()
