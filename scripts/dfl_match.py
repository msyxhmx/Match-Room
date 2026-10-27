"""Real moves for the pitch's goal replays (web/src/pitch), from DFL tracking data.

    make real-replays   # data/dfl/ + the saved match -> web/src/pitch/real/replays.json

For each goal in the saved match (web/scripts/goal-moves.mjs: the scoring side's passes before
it, and the shot), finds the real move in the 7 DFL matches that plays it best, and writes it at
5 Hz for the replay to play as it was. A real move fits when:

- the same touches come in the same order, by the same pattern of players (who touches twice),
  each real touch within RHYTHM seconds of ours, counting back from the shot;
- every real touch lands within CAP metres of our event's spot, after turning the move so the
  scoring side attacks our way, mirroring it across if that fits better, and, when it takes no
  more than SQUEEZE, stretching the pitch so the real shot is on our shot's spot (the lines
  stay where they are);
- a keeper on the ball is our keeper, and only then; both sides have eleven on the pitch
  throughout, and nobody moves faster than SPRINT (a tracking glitch).

The move with the most of our touches wins (then the nearest). Its touchers are our touchers,
the keepers our keepers, and everyone else the slot whose place in a 4-3-3 is nearest his place
in his team's shape. A goal with no fitting move gets none: its replay stays the planner's.

The rule this follows (docs/architecture.md): a replay played by a real move may put a touch up
to CAP metres from its event's spot; the live pitch never does. Same anonymity as slice.json:
sides and slot numbers only. Data: DFL / Sportec open data (Bassek et al. 2025), CC BY 4.0.
"""

from __future__ import annotations

import argparse
import json
import math
from collections.abc import Callable
from dataclasses import dataclass
from pathlib import Path

import dfl_extract as d
import numpy as np
from scipy.optimize import linear_sum_assignment

CAP = 25.0  # metres: Ilham's call, 27 Oct 2026 (15 m fitted only the last 2-3 touches)
SQUEEZE = 0.15
RHYTHM = 2.5  # seconds
SPRINT = 9.0  # m/s between 5 Hz frames: faster is a tracking glitch
LEAD, TAIL = 2.5, 3.0  # the replay starts this before the first touch, ends this after the shot
MOVE_S = 26.0
HL, HW = d.LENGTH / 2, d.WIDTH / 2
MOVES = d.ROOT / "data" / "goal-moves.json"
# A 4-3-3's slots in a side's own frame (attacking +x; slot order right to left, so the right
# back is at -y), for matching the real players who don't touch the ball.
SHAPE = np.array([
    (-48, 0), (-30, -20), (-33, -7), (-33, 7), (-30, 20),
    (-12, -12), (-14, 0), (-12, 12), (5, -18), (8, 0), (5, 18),
], dtype=float)  # fmt: skip


@dataclass
class RealMove:
    m: d.Match
    h: d.Half
    shot: dict
    side: str  # the shooting side, as the DFL data has it
    touches: list[tuple[int, int]]  # (player column, frame), oldest first, the shot last


def frames_near(h: d.Half, t: float) -> range:
    """Frames from 2.4 s before t to 1.2 s after: event clocks run up to 2 s late."""
    k = int(np.searchsorted(h.t, t))
    return range(max(0, k - 12), min(len(h.t), k + 7))


def gap(h: d.Half, q: int, c: int) -> float:
    return math.hypot(h.px[q, c] - h.bx[q], h.py[q, c] - h.by[q])


def real_moves(matches: list[d.Match]) -> list[RealMove]:
    """Every open-play shot with its move: the side's passes back to the other side's last touch."""
    out = []
    for m in matches:
        col = {p: j for j, p in enumerate(m.pids)}
        for h in m.halves:
            for e in m.events:
                if e["kind"] != "shot" or not e.get("open") or e["by"] not in col:
                    continue
                if not h.t[0] + MOVE_S < e["t"] < h.t[-1] - TAIL - 1:
                    continue
                side = m.side[e["by"]]
                seq = [e]
                before = [x for x in m.events if e["t"] - MOVE_S < x["t"] < e["t"] - 0.3]
                for x in reversed(before):
                    if x.get("by") not in col:
                        continue
                    if x["kind"] == "pass" and m.side[x["by"]] == side:
                        seq.append(x)
                    elif x["kind"] in ("pass", "tackle", "shot"):
                        break
                touches = []
                for x in reversed(seq):
                    c = col[x["by"]]
                    q = min(frames_near(h, x["t"]), key=lambda q, c=c: gap(h, q, c))
                    touches.append((c, q))
                out.append(RealMove(m, h, e, side, touches))
    return out


def piecewise(v, real: float, ours: float, half: float):
    """-half and +half stay put, `real` goes to `ours`."""
    lo = -half + (v + half) * (ours + half) / (real + half)
    hi = ours + (v - real) * (half - ours) / (half - real)
    return np.where(v <= real, lo, hi)


@dataclass
class Fit:
    rm: RealMove
    n: int  # how many of our touches (the last n) it plays
    world: Callable  # real (x, y) -> our world (x, y)
    offs: list[float]
    how: str


def fit(goal: dict, rm: RealMove) -> Fit | None:
    """The best way this real move plays the goal's last touches (the most of them), or None."""
    ours = goal["touches"]
    h = rm.h
    toward = 1.0 if goal["side"] == "home" else -1.0  # the way our scoring side attacks
    turn = 1.0 if rm.side == "home" else -1.0  # the real side's way to attacking +x
    for n in range(min(len(ours), len(rm.touches)), 1, -1):
        o, r = ours[-n:], rm.touches[-n:]
        if any(
            (o[a]["player"] == o[b]["player"]) != (r[a][0] == r[b][0])
            for a in range(n)
            for b in range(n)
        ):
            continue
        # A keeper on the ball is our keeper, and only then.
        if any((o[k]["number"] == 1) != rm.m.keeper[rm.m.pids[c]] for k, (c, _) in enumerate(r)):
            continue
        t_shot = h.t[r[-1][1]]
        shot_t = ours[-1]["t"]
        if any(abs(h.t[q] - t_shot - (o[k]["t"] - shot_t)) > RHYTHM for k, (_, q) in enumerate(r)):
            continue
        i0 = int(np.searchsorted(h.t, h.t[r[0][1]] - LEAD))
        i1 = int(np.searchsorted(h.t, t_shot + TAIL))
        on = [c for c in range(len(rm.m.pids)) if not np.isnan(h.px[i0:i1, c]).any()]
        if len(on) != 22 or not h.alive[i0 : r[-1][1]].all():
            continue
        # No tracking glitch: nobody faster than a sprint between frames.
        v = np.hypot(np.diff(h.px[i0:i1, on], axis=0), np.diff(h.py[i0:i1, on], axis=0)) / d.DT
        if np.nanmax(v) > SPRINT:
            continue
        best = None
        for mirror in (1.0, -1.0):

            def own(x, y, mirror=mirror):
                """The scoring side's own frame: attacking +x."""
                return turn * np.asarray(x), mirror * turn * np.asarray(y)

            sx, sy = own(h.bx[r[-1][1]], h.by[r[-1][1]])
            ox, oy = toward * o[-1]["from"]["x"], toward * o[-1]["from"]["y"]
            sq = max(
                abs(1 - (HL - ox) / (HL - sx)) if HL - sx > 1 else 9,
                abs(1 - (ox + HL) / (sx + HL)),
                abs(1 - (HW - oy) / (HW - sy)) if HW - sy > 1 else 9,
                abs(1 - (oy + HW) / (sy + HW)) if sy + HW > 1 else 9,
            )
            stretch = sq <= SQUEEZE

            def world(x, y, own=own, sx=sx, sy=sy, ox=ox, oy=oy, stretch=stretch):
                ax, ay = own(x, y)
                if stretch:
                    ax, ay = piecewise(ax, sx, ox, HL), piecewise(ay, sy, oy, HW)
                return toward * ax, toward * ay

            offs = []
            for k, (_, q) in enumerate(r):
                wx, wy = world(h.bx[q], h.by[q])
                offs.append(
                    math.hypot(float(wx) - o[k]["from"]["x"], float(wy) - o[k]["from"]["y"])
                )
            if max(offs) > CAP:
                continue
            f = Fit(rm, n, world, offs, f"stretched {sq:.0%}" if stretch else "as played")
            if best is None or max(offs) < max(best.offs):
                best = f
        if best:
            return best
    return None


def write_move(goal: dict, f: Fit) -> dict:
    rm, h, n = f.rm, f.rm.h, f.n
    ours, r = goal["touches"][-n:], rm.touches[-n:]
    i0 = int(np.searchsorted(h.t, h.t[r[0][1]] - LEAD))
    i1 = int(np.searchsorted(h.t, h.t[r[-1][1]] + TAIL))
    other = "away" if rm.side == "home" else "home"
    scoring = goal["side"]
    conceding = "away" if scoring == "home" else "home"
    slots: dict[str, dict[int, int]] = {scoring: {}, conceding: {}}
    for o, (c, _) in zip(ours, r, strict=True):
        slots[scoring][o["number"]] = c
    for ours_side, real_side in ((scoring, rm.side), (conceding, other)):
        cols = [c for c in range(len(rm.m.pids)) if rm.m.side[rm.m.pids[c]] == real_side]
        cols = [c for c in cols if not np.isnan(h.px[i0:i1, c]).any()]
        keeper = next(c for c in cols if rm.m.keeper[rm.m.pids[c]])
        slots[ours_side][1] = keeper
        rest = [c for c in cols if c not in slots[ours_side].values()]
        free = [k for k in range(1, 12) if k not in slots[ours_side]]
        # Each player's place in his team's shape (own frame, attacking +x) against the 4-3-3's.
        toward = 1.0 if ours_side == "home" else -1.0
        mean = {}
        for c in cols:
            x, y = f.world(h.px[i0:i1, c], h.py[i0:i1, c])
            mean[c] = np.array([toward * float(np.mean(x)), toward * float(np.mean(y))])
        centre = np.mean([mean[c] for c in cols], axis=0)
        shape = SHAPE - SHAPE.mean(axis=0)
        cost = np.array(
            [[np.linalg.norm(mean[c] - centre - shape[k - 1]) for k in free] for c in rest]
        )
        for a, b in zip(*linear_sum_assignment(cost), strict=True):
            slots[ours_side][free[b]] = rest[a]

    def dm(a):
        return np.round(np.asarray(a) * 10).astype(int).tolist()

    # Real players overrun the lines by a stride or two; the pitch keeps everyone within 0.5 m.
    def inside(x, y):
        return np.clip(x, -HL - 0.5, HL + 0.5), np.clip(y, -HW - 0.5, HW + 0.5)

    players, xs, ys = [], [], []
    for side in ("home", "away"):
        for k in range(1, 12):
            x, y = inside(*f.world(h.px[i0:i1, slots[side][k]], h.py[i0:i1, slots[side][k]]))
            players.append({"side": side, "role": d.SLOT_ROLE[k - 1], "number": k})
            xs.append(dm(x))
            ys.append(dm(y))
    bx, by = f.world(h.bx[i0:i1], h.by[i0:i1])
    t0 = h.t[i0]
    touches = [
        {"id": o["id"], "t": round(float(h.t[q] - t0), 2), "offM": round(off, 1)}
        for o, (_, q), off in zip(ours, r, f.offs, strict=True)
    ]
    return {
        "goal": goal["goal"],
        "how": f.how,
        "touches": touches,
        "passage": {
            "kind": f"goal-{goal['minute']}",
            "hz": d.HZ // d.STEP,
            "players": players,
            "x": xs,
            "y": ys,
            "ball": {"x": dm(bx), "y": dm(by), "z": dm(h.bz[i0:i1])},
            "alive": "".join("1" if a else "0" for a in h.alive[i0:i1]),
            "poss": "",
            "events": [],
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--moves", type=Path, default=MOVES)
    parser.add_argument("--data", type=Path, default=d.DATA)
    args = parser.parse_args()
    moves = json.loads(args.moves.read_text())
    cache = d.ROOT / "data" / "dfl-cache"
    matches = [d.load_match(mid, args.data, cache) for mid in d.match_ids(args.data)]
    real = real_moves(matches)
    print(f"{len(real)} real moves with a shot")
    replays = []
    for goal in moves["goals"]:
        fits = [f for f in (fit(goal, rm) for rm in real) if f]
        if not fits:
            print(f"{goal['minute']}': no real move fits; the planner keeps it")
            continue
        f = min(fits, key=lambda f: (-f.n, max(f.offs)))
        offs = ", ".join(f"{o:.0f}" for o in f.offs)
        print(f"{goal['minute']}': {f.n} of {len(goal['touches'])} touches, {f.how}, {offs} m off")
        replays.append(write_move(goal, f))
    d.write("replays.json", {"match": moves["match"], "capM": CAP, "replays": replays})


if __name__ == "__main__":
    main()
