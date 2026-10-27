"""The library of real play the live pitch (web/src/pitch) cuts its clips from.

    make reel-data    # reads data/dfl/ + data/dfl-cache/, writes web/public/pitch/reel.json

Where scripts/dfl_extract.py writes a few passages, this writes every stretch of the seven DFL
matches around a goal, shot, corner, card, kick-off or foul (15 s before to 25 s after, merged
where they overlap) that both sides' elevens fit our 4-3-3 slots throughout, with no gaps and no
tracking glitch (a player 9 m/s faster than any sprint between 5 Hz frames). Per reel: 23 entities
per frame (home slots 1-11, away slots 1-11, the ball) in decimetres as little-endian Int16, ball
height, in-play and possession strings, and the events inside it with entity indices. No names
leave this script. Data: Bassek et al. 2025 (see dfl_extract.py), CC BY 4.0.

Over budget, the order of what is kept: goals, other shots, kick-offs, cards, corners, fouls.
"""

from __future__ import annotations

import argparse
import base64
import json
import sys
import xml.etree.ElementTree as ET
from collections import Counter
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import dfl_extract as dx  # noqa: E402
import dfl_match as dm_  # noqa: E402
from scipy.optimize import linear_sum_assignment  # noqa: E402

ROOT = dx.ROOT
OUT = ROOT / "web" / "public" / "pitch" / "reel.json"
HZ = 5
BEFORE, AFTER, MIN_S = 15, 25, 20
MAX_SPEED = 9.0  # m/s between frames: faster is a tracking glitch
BUDGET = 5_000_000  # bytes
SNAP_S = 1  # event clocks run up to ~1 s off the tracking

OUTCOME = {
    "SuccessfulShot": "goal",
    "SavedShot": "saved",
    "ShotWide": "wide",
    "BlockedShot": "blocked",
    "ShotWoodWork": "post",
}
SET_PIECES = {
    "KickOff": "kickoff",
    "FreeKick": "freekick",
    "GoalKick": "goalkick",
    "ThrowIn": "throwin",
    "CornerKick": "corner",
}
NOT_OPEN = ("freeKick", "corner", "penalty")  # a shot's TakerSetup that isn't open play
PRIORITY = ["goal", "shot", "kickoff", "card", "corner", "foul"]  # best first


def ev_time(ev: ET.Element) -> float:
    return dx._time(ev.get("CalculatedTimestamp") or ev.get("EventTime"))


def load_reel_events(path: Path) -> list[dict]:
    """Every event the reels carry. Players are DFL ids here; entity indices come later."""
    out = []
    for ev in ET.parse(path).getroot().iter("Event"):
        t = ev_time(ev)
        for el in ev:
            tag = el.tag
            if tag == "Play" and el.get("Player"):
                out.append(
                    {
                        "t": t,
                        "kind": "pass",
                        "by": el.get("Player"),
                        "to": el.get("Recipient"),
                        "ok": el.get("Evaluation") in ("successfullyCompleted", "successful"),
                    }
                )
            elif tag == "TacklingGame" and el.get("Winner"):
                out.append(
                    {
                        "t": t,
                        "kind": "tackle",
                        "by": el.get("Winner"),
                        "to": el.get("Loser"),
                        "ok": el.get("PossessionChange") == "true",
                    }
                )
            elif tag in SET_PIECES:
                play = el.find("Play")
                if play is None:
                    play = ET.Element("Play")
                out.append(
                    {
                        "t": t,
                        "kind": SET_PIECES[tag],
                        "by": play.get("Player"),
                        "to": play.get("Recipient"),
                        "ok": (play.get("Evaluation") in ("successfullyCompleted", "successful"))
                        if play.get("Evaluation")
                        else None,
                    }
                )
            elif tag == "ShotAtGoal":
                res = next((OUTCOME[c.tag] for c in el if c.tag in OUTCOME), None)
                out.append(
                    {
                        "t": t,
                        "kind": "shot",
                        "by": el.get("Player"),
                        "to": None,
                        "ok": res == "goal",
                        "out": res,
                        "open": el.get("AfterFreeKick") != "true"
                        and el.get("TakerSetup") not in NOT_OPEN,
                    }
                )
            elif tag == "Foul" and el.get("Fouler"):
                out.append(
                    {
                        "t": t,
                        "kind": "foul",
                        "by": el.get("Fouler"),
                        "to": el.get("Fouled"),
                        "ok": None,
                    }
                )
            elif tag == "Caution" and el.get("Player"):
                color = el.get("CardColor")
                out.append(
                    {
                        "t": t,
                        "kind": "card",
                        "by": el.get("Player"),
                        "to": None,
                        "ok": None,
                        "card": color if color in ("yellow", "red") else None,
                    }
                )
    return sorted(out, key=lambda e: e["t"])


def fit_slots(m: dx.Match, h: dx.Half, a: int, b: int) -> dict[str, list[int]] | None:
    """Both sides' elevens as our 4-3-3 slots over frames a..b, for any formation: the keeper is
    slot 1, the ten outfield players take slots 2-11 by their mean own-frame spot against
    dfl_match.SHAPE (as dfl_match maps the players who don't touch the ball). None unless each
    side has exactly eleven on the pitch throughout, one of them the keeper."""
    out = {}
    shape = dm_.SHAPE - dm_.SHAPE.mean(axis=0)
    for side in ("home", "away"):
        cols = [
            j
            for j, p in enumerate(m.pids)
            if m.side[p] == side and not np.isnan(h.px[a:b, j]).any()
        ]
        keepers = [j for j in cols if m.keeper[m.pids[j]]]
        if len(cols) != 11 or len(keepers) != 1:
            return None
        toward = 1.0 if side == "home" else -1.0
        mean = {j: toward * np.array([h.px[a:b, j].mean(), h.py[a:b, j].mean()]) for j in cols}
        centre = np.mean(list(mean.values()), axis=0)
        rest = [j for j in cols if j != keepers[0]]
        cost = np.array(
            [[np.linalg.norm(mean[j] - centre - shape[k]) for k in range(1, 11)] for j in rest]
        )
        order = [keepers[0], *([0] * 10)]
        for i, k in zip(*linear_sum_assignment(cost), strict=True):
            order[k + 1] = rest[i]
        out[side] = order
    return out


def runs(m: dx.Match, h: dx.Half) -> list[tuple[int, int, dict]]:
    """Maximal stretches [a, b) with no NaN, no glitch and the same eleven on the pitch, whose
    both sides fit the slots; with those slots."""
    n = len(h.t)
    on = ~np.isnan(h.px)  # frames x players
    good = ~np.isnan(h.bx) & ~np.isnan(h.by) & ~np.isnan(h.bz)
    cut = np.zeros(n, bool)  # a break between frame i-1 and i
    cut[1:] |= (on[1:] != on[:-1]).any(axis=1)
    sp = np.hypot(np.diff(h.px, axis=0), np.diff(h.py, axis=0)) / dx.DT
    cut[1:] |= (np.nan_to_num(sp, nan=0.0) > MAX_SPEED).any(axis=1)
    out, a = [], None
    for i in range(n + 1):
        if a is not None and (i == n or cut[i] or not good[i]):
            if i - a >= MIN_S * HZ:
                s = fit_slots(m, h, a, i)
                if s:
                    out.append((a, i, s))
            a = None
        if i < n and a is None and good[i]:
            a = i
    return out


def reel_from(m, h, a, b, slots, evs, hi) -> dict:
    cols = slots["home"] + slots["away"]
    ent = {m.pids[j]: k for k, j in enumerate(cols)}
    dm = lambda v: np.round(v * 10).astype(np.int16)  # noqa: E731
    pos = np.zeros((b - a, 23, 2), "<i2")
    pos[:, :22, 0] = dm(h.px[a:b][:, cols])
    pos[:, :22, 1] = dm(h.py[a:b][:, cols])
    pos[:, 22, 0] = dm(h.bx[a:b])
    pos[:, 22, 1] = dm(h.by[a:b])
    events = []
    for e in evs:
        if not h.t[0] <= e["t"] <= h.t[-1]:
            continue
        f = int(np.searchsorted(h.t, e["t"]))
        by = ent.get(e["by"])
        if not (a <= f < b):
            continue
        if by is not None and e["kind"] in ("pass", "shot", *SET_PIECES.values()):
            # Snap to where the ball is nearest the player, within a second.
            lo, hi = max(a, f - SNAP_S * HZ), min(b - 1, f + SNAP_S * HZ)
            c = cols[by]
            d = np.hypot(
                h.px[lo : hi + 1, c] - h.bx[lo : hi + 1], h.py[lo : hi + 1, c] - h.by[lo : hi + 1]
            )
            f = lo + int(np.argmin(d))
        item = {
            "f": f - a,
            "kind": e["kind"],
            "by": by,
            "to": ent.get(e.get("to")),
            "ok": e.get("ok"),
        }
        if e["kind"] == "shot":
            item["out"] = e["out"]
            item["open"] = e["open"]
        if e["kind"] == "card":
            item["card"] = e["card"]
        events.append(item)
    events.sort(key=lambda x: x["f"])
    return {
        "id": f"{m.id.split('-')[-1]}-{hi + 1}-{a}",
        "n": b - a,
        "pos": base64.b64encode(pos.tobytes()).decode(),
        "z": base64.b64encode(dm(h.bz[a:b]).astype("<i2").tobytes()).decode(),
        "alive": "".join("1" if x else "0" for x in h.alive[a:b]),
        "poss": "".join({1: "h", 2: "a"}.get(int(p), "-") for p in h.poss[a:b]),
        "events": events,
    }


def rank(e: dict) -> int:
    if e["kind"] == "shot":
        return 0 if e["out"] == "goal" else 1
    return {"kickoff": 2, "card": 3, "corner": 4, "foul": 5}[e["kind"]]


def build(ids: list[str], data: Path) -> tuple[list[dict], dict]:
    cache = ROOT / "data" / "dfl-cache"
    cands = []  # (rank, match, half index, run index, lo, hi, event)
    loaded = {}
    stats = {
        k: [0, 0] for k in ("goal", "shot", "kickoff", "card", "corner", "foul")
    }  # exist, covered-able
    skipped = Counter()
    for mid in ids:
        print(f"loading {mid}", flush=True)
        m = dx.load_match(mid, data, cache)
        evs = load_reel_events(dx.find("events_raw", mid, data))
        loaded[mid] = (m, evs)
        for hi, h in enumerate(m.halves):
            rr = runs(m, h)
            for e in evs:
                if e["kind"] not in ("shot", "kickoff", "card", "corner", "foul"):
                    continue
                if not (h.t[0] <= e["t"] <= h.t[-1]):
                    continue
                key = "goal" if e["kind"] == "shot" and e["out"] == "goal" else e["kind"]
                stats[key][0] += 1
                f = int(np.searchsorted(h.t, e["t"]))
                run = next((r for r in rr if r[0] <= f < r[1]), None)
                if run is None:
                    skipped[f"{key}: not in a fitting stretch"] += 1
                    continue
                a, b, _ = run
                lo, hi_ = max(a, f - BEFORE * HZ), min(b, f + AFTER * HZ)
                need = MIN_S * HZ
                if hi_ - lo < need:  # extend inside the stretch
                    lo = max(a, hi_ - need)
                    hi_ = min(b, lo + need)
                cands.append((rank(e), mid, hi, a, lo, hi_, key))
    cands.sort(key=lambda c: c[0])
    taken: dict[tuple, np.ndarray] = {}
    spent = 0
    per_frame = (92 + 2) * 4 / 3 + 2  # base64 of positions and height, plus two string chars
    for _r, mid, hi, a, lo, hi_, key in cands:
        m = loaded[mid][0]
        mask = taken.setdefault((mid, hi, a), np.zeros(len(m.halves[hi].t), bool))
        add = int((~mask[lo:hi_]).sum())
        if (spent + add) * per_frame > BUDGET * 0.97:
            skipped[f"{key}: over budget"] += 1
            continue
        mask[lo:hi_] = True
        spent += add
        stats[key][1] += 1
    reels = []
    for (mid, hi, a), mask in sorted(taken.items()):
        m, evs = loaded[mid]
        h = m.halves[hi]
        run = next(r for r in runs(m, h) if r[0] == a)
        i = 0
        while i < len(mask):
            if not mask[i]:
                i += 1
                continue
            j = i
            while j < len(mask) and mask[j]:
                j += 1
            reels.append(reel_from(m, h, i, j, run[2], evs, hi))
            i = j
    return reels, {"stats": stats, "skipped": skipped}


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    p.add_argument("--data", type=Path, default=dx.DATA)
    p.add_argument("--only", help="comma-separated match ids (default: every match found)")
    p.add_argument("--out", type=Path, default=OUT)
    args = p.parse_args()
    ids = args.only.split(",") if args.only else dx.match_ids(args.data)
    if not ids:
        sys.exit(f"no DFL files in {args.data}: see dfl_extract.py's docstring")
    reels, info = build(ids, args.data)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(
        json.dumps({"source": dx.SOURCE, "hz": HZ, "reels": reels}, separators=(",", ":")) + "\n"
    )
    frames = sum(r["n"] for r in reels)
    print(
        f"wrote {args.out.relative_to(ROOT)}: {args.out.stat().st_size / 1e6:.2f} MB, "
        f"{len(reels)} reels, {frames} frames = {frames / HZ / 60:.1f} min"
    )
    kinds = Counter(e["kind"] for r in reels for e in r["events"])
    print("events:", dict(kinds))
    shots = Counter(
        (e["out"], "open" if e["open"] else "set")
        for r in reels
        for e in r["events"]
        if e["kind"] == "shot"
    )
    print("shots:", dict(shots))
    print("exist/covered:", info["stats"])
    print("skipped:", dict(info["skipped"]))


if __name__ == "__main__":
    main()
