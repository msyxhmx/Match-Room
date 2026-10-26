"""Explain stage: detect the moments that matter and record why.

The detector walks the match minute by minute, using only what is known at
that minute, and fires typed insights. Each insight carries:

  * facts:    every number or name a sentence about it may use (the narration
              layer may not invent anything else; the validator enforces it)
  * evidence: the event IDs that prove it
  * variant:  which story it tells (e.g. a goal "against the run of play")

Cooldowns stop the same story repeating every minute.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np
import pandas as pd

from live import metrics as M
from live.metrics import SIDES, Timeline

try:  # change-point detection for momentum flips; without it, the threshold rule is used
    import ruptures
except ImportError:  # pragma: no cover - exercised by test_momentum_fallback
    ruptures = None

OTHER = {"home": "away", "away": "home"}

PRIORITY = {
    "goal": 1, "red_card": 1,
    "momentum_flip": 2, "control_shift": 2, "chaos_phase": 2, "pressure_spike": 2,
    "big_chance": 2,
    "win_prob_swing": 3, "tempo_shift": 3, "pass_of_the_moment": 3, "shot_speed": 3,
    "player_milestone": 3,
}
COOLDOWN = {"momentum_flip": 8, "control_shift": 10, "chaos_phase": 12, "pressure_spike": 12,
            "win_prob_swing": 10, "tempo_shift": 15, "shot_speed": 20}
TTL_S = {1: 20, 2: 14, 3: 10}  # how long an overlay for this priority stays on screen

# thresholds (published in docs/live-engine.md)
BIG_CHANCE_XG = 0.30
SHOT_SPEED_KMH = 115
MOMENTUM_LEAD = 0.35  # fallback rule only (no ruptures)
# Momentum flips by change-point detection (PELT, l2 cost) on the per-minute threat difference,
# re-run every minute on minutes 1..m only. A flip needs a new segment of CP_MIN_SEG+ minutes in
# which one side has CP_SHARE+ of the threat. Tuned in scripts/card_value.py on held-out seeds.
CP_PENALTY = 0.08
CP_MIN_SEG = 4
CP_SHARE = 0.65
PASS_DIFFICULTY = 0.50
PASS_XT = 0.04
PPDA_INTENSE = 4.8
PPDA_DROP = 0.65  # now <= 65% of the previous window
WIN_SWING = 0.15
TEMPO_CHANGE = 0.25
MILESTONE_PASSES = 40
MILESTONE_BALL_WINS = 8


@dataclass
class Fact:
    value: float | int | str
    kind: str  # int | dec1 | dec2 | pct | kmh | m | team | player | score | text

    def __post_init__(self) -> None:  # numpy scalars -> plain Python for JSON
        if isinstance(self.value, np.generic):
            self.value = self.value.item()


@dataclass
class Insight:
    id: str
    type: str
    variant: str
    minute: int
    second: int
    priority: int
    side: str | None
    team_id: str | None
    players: list[str]
    facts: dict[str, Fact]
    evidence: list[str] = field(default_factory=list)

    @property
    def clock(self) -> str:
        return f"{self.minute}:{self.second:02d}"


class _Detector:
    def __init__(self, tl: Timeline) -> None:
        self.tl = tl
        self.m = tl.match
        self.names = {"home": tl.match.home.name, "away": tl.match.away.name}
        self.ids = {"home": tl.match.home.id, "away": tl.match.away.id}
        self.out: list[Insight] = []
        self.last: dict[str, int] = {}
        self.ev = tl.events.reset_index(drop=True)

    # ----- helpers -----
    def team(self, side: str) -> Fact:
        return Fact(self.names[side], "team")

    def ready(self, key: str, minute: int) -> bool:
        return minute - self.last.get(key, -999) >= COOLDOWN.get(key.split(":")[0], 0)

    def emit(self, type_: str, variant: str, minute: int, second: int, side: str | None,
             facts: dict[str, Fact], evidence: list[str], players: list[str] | None = None,
             cooldown_key: str | None = None) -> None:
        n = len(self.out)
        self.out.append(Insight(
            id=f"{self.m.match_id}-{minute:02d}{second:02d}-{type_}-{n}",
            type=type_, variant=variant, minute=minute, second=second,
            priority=PRIORITY[type_], side=side, team_id=self.ids[side] if side else None,
            players=players or [], facts=facts, evidence=evidence,
        ))
        self.last[cooldown_key or type_] = minute

    def win(self, side: str, minute: int) -> float:
        p = self.tl.projection[minute]
        return p["home_win"] if side == "home" else p["away_win"]

    def top_threat(self, side: str, lo: int, hi: int, k: int = 3) -> pd.DataFrame:
        e = self.ev[(self.ev["side"] == side) & (self.ev["minute"] >= lo)
                    & (self.ev["minute"] <= hi) & (self.ev["threat"] > 0)]
        return e.sort_values("threat", ascending=False).head(k).sort_values(["minute", "second"])

    def top_player(self, side: str, lo: int, hi: int) -> str | None:
        e = self.ev[(self.ev["side"] == side) & (self.ev["minute"] >= lo)
                    & (self.ev["minute"] <= hi)]
        if e.empty or e["threat"].sum() <= 0:
            return None
        return str(e.groupby("player")["threat"].sum().idxmax())

    def side_share(self, side: str, home_value: float) -> float:
        return home_value if side == "home" else 1 - home_value

    # ----- event-driven insights -----
    def on_events(self, minute: int) -> None:
        ev = self.ev
        rows = ev[ev["minute"] == minute]
        for idx, row in rows.iterrows():
            side, player = row["side"], row["player"]
            if row["is_goal"]:
                self.goal(idx, row, minute)
            elif row["type"] == "shot":
                if row["xg"] >= BIG_CHANCE_XG:
                    self.emit("big_chance", str(row["outcome"]), minute, int(row["second"]), side,
                              {"player": Fact(player, "player"), "team": self.team(side),
                               "xg": Fact(round(float(row["xg"]), 2), "dec2"),
                               "chance_pct": Fact(round(float(row["xg"]), 2), "pct")},
                              [row["event_id"]], [player])
                if (row["speed_kmh"] >= SHOT_SPEED_KMH and self.ready("shot_speed", minute)):
                    dist = float(np.hypot((100 - row["x"]) * 1.05, (row["y"] - 50) * 0.68))
                    self.emit("shot_speed", str(row["outcome"]), minute, int(row["second"]), side,
                              {"player": Fact(player, "player"), "team": self.team(side),
                               "speed": Fact(round(float(row["speed_kmh"])), "kmh"),
                               "distance": Fact(round(dist), "m")},
                              [row["event_id"]], [player])
            elif row["type"] == "card" and row["outcome"] == "red":
                before, after = self.win(side, minute - 1), self.win(side, minute)
                self.emit("red_card", "red", minute, int(row["second"]), side,
                          {"player": Fact(player, "player"), "team": self.team(side),
                           "win_before": Fact(before, "pct"), "win_after": Fact(after, "pct"),
                           "score": Fact(self.score_text(minute), "score")},
                          [row["event_id"]], [player])
            elif (row["type"] == "pass" and row["outcome"] == "complete"
                  and row["difficulty"] >= PASS_DIFFICULTY and row["xt_added"] >= PASS_XT):
                key = f"pass_of_the_moment:{(minute - 1) // 15}"
                if key in self.last:
                    continue
                self.emit("pass_of_the_moment", "pass", minute, int(row["second"]), side,
                          {"player": Fact(player, "player"), "team": self.team(side),
                           "length": Fact(round(float(row["length_m"])), "m"),
                           "speed": Fact(round(float(row["speed_kmh"])), "kmh"),
                           "difficulty": Fact(round(float(row["difficulty"]), 2), "pct"),
                           "xt": Fact(round(float(row["xt_added"]), 2), "dec2")},
                          [row["event_id"]], [player], cooldown_key=key)

    def score_text(self, minute: int, upto_index: int | None = None) -> str:
        if upto_index is None:
            h, a = self.tl.score(minute)
        else:
            g = self.ev.loc[:upto_index]
            g = g[g["is_goal"]]
            h, a = int((g["side"] == "home").sum()), int((g["side"] == "away").sum())
        return f"{h}-{a}"

    def goal(self, idx: int, row: pd.Series, minute: int) -> None:
        tl, side, player = self.tl, row["side"], row["player"]
        prev = max(minute - 1, 0)
        mom_for = tl.momentum[prev] if side == "home" else -tl.momentum[prev]
        opp_control = tl.phase[prev] == f"{OTHER[side]}_control"
        xg_for = tl.cum(side, "xg", minute)
        xg_against = tl.cum(OTHER[side], "xg", minute)
        g = self.ev.loc[:idx]
        g = g[g["is_goal"]]
        lead = int((g["side"] == side).sum()) - int((g["side"] == OTHER[side]).sum())
        if mom_for <= -0.2 or opp_control:
            variant = "against_run"
        elif lead == 0:
            variant = "equaliser"
        elif lead == 1:
            variant = "late_go_ahead" if minute >= 80 else "go_ahead"
        elif xg_for - xg_against >= 0.5 or tl.phase[prev] == f"{side}_control":
            variant = "deserved"
        else:
            variant = "neutral"
        before = self.ev.loc[:idx - 1]
        assist = before[(before["side"] == side) & (before["type"] == "pass")
                        & (before["outcome"] == "complete") & (before["minute"] >= minute - 1)]
        player_goals = int(self.ev.loc[:idx][(self.ev.loc[:idx]["player"] == player)
                                              & self.ev.loc[:idx]["is_goal"]].shape[0])
        facts = {
            "player": Fact(player, "player"), "team": self.team(side),
            "score": Fact(self.score_text(minute, idx), "score"),
            "xg": Fact(round(float(row["xg"]), 2), "dec2"),
            "chance_pct": Fact(round(float(row["xg"]), 2), "pct"),
            "speed": Fact(round(float(row["speed_kmh"])), "kmh"),
            "win_before": Fact(self.win(side, prev), "pct"),
            "win_after": Fact(self.win(side, minute), "pct"),
            "team_xg": Fact(round(xg_for, 2), "dec2"),
            "opp_xg": Fact(round(xg_against, 2), "dec2"),
            "opponent": self.team(OTHER[side]),
        }
        if player_goals >= 2:
            facts["player_goals"] = Fact(player_goals, "int")
        evidence = [row["event_id"]]
        players = [player]
        if len(assist):
            a = assist.iloc[-1]
            if a["player"] != player:
                facts["assist"] = Fact(a["player"], "player")
                players.append(a["player"])
            evidence.insert(0, a["event_id"])
        self.emit("goal", variant, minute, int(row["second"]), side, facts, evidence, players)

    # ----- state-driven insights -----
    def on_state(self, minute: int) -> None:
        if minute < 6:
            return
        self.momentum(minute)
        self.control(minute)
        self.chaos(minute)
        self.pressing(minute)
        self.win_swing(minute)
        self.tempo(minute)
        self.milestones(minute)

    def momentum(self, m: int) -> None:
        if ruptures is None:
            return self.momentum_threshold(m)
        if m < 10 or not hasattr(self, "_threat_diff"):
            if not hasattr(self, "_threat_diff"):
                pm = self.tl.per_min
                self._threat_diff = pm["home"]["threat"] - pm["away"]["threat"]
            if m < 10:
                return
        d = self._threat_diff[1: m + 1].reshape(-1, 1)
        bkps = ruptures.Pelt(model="l2", min_size=CP_MIN_SEG, jump=1).fit(d).predict(
            pen=CP_PENALTY)
        start = (bkps[-2] if len(bkps) > 1 else 0) + 1  # first minute of the current segment
        if m - start + 1 < CP_MIN_SEG:
            return
        t = {s: self.tl.per_min[s]["threat"][start: m + 1].sum() for s in SIDES}
        total = t["home"] + t["away"]
        if total <= 0:
            return
        share_home = t["home"] / total
        cur = "home" if share_home >= CP_SHARE else "away" if share_home <= 1 - CP_SHARE else None
        prev_leader = getattr(self, "_mom_leader", None)
        if cur is None or cur == prev_leader or not self.ready("momentum_flip", m):
            return
        window = m - start + 1
        facts = {"team": self.team(cur),
                 "share": Fact(round(share_home if cur == "home" else 1 - share_home, 2), "pct"),
                 "team_threat": Fact(round(t[cur], 2), "dec2"),
                 "opp_threat": Fact(round(t[OTHER[cur]], 2), "dec2"),
                 "window": Fact(window, "int")}
        top = self.top_player(cur, start, m)
        if top:
            facts["player"] = Fact(top, "player")
        ev = self.top_threat(cur, start, m)
        self.emit("momentum_flip", "flip" if prev_leader else "first", m, 59, cur, facts,
                  list(ev["event_id"]), [top] if top else [])
        self._mom_leader = cur

    def momentum_threshold(self, m: int) -> None:
        """The original rule: momentum passes +-MOMENTUM_LEAD for a new side for 2 minutes."""
        mom = self.tl.momentum

        def leader(i: int) -> str | None:
            return "home" if mom[i] >= MOMENTUM_LEAD else "away" if mom[i] <= -MOMENTUM_LEAD \
                else None

        cur = leader(m)
        if cur is None or leader(m - 1) != cur:
            return
        prev_leader = getattr(self, "_mom_leader", None)
        if cur == prev_leader:
            return
        if not self.ready("momentum_flip", m) or m < 10:
            self._mom_leader = cur
            return
        share = (1 + mom[m]) / 2 if cur == "home" else (1 - mom[m]) / 2
        lo = max(1, m - 4)
        facts = {"team": self.team(cur), "share": Fact(round(share, 2), "pct"),
                 "team_threat": Fact(round(self.tl.window(cur, "threat", m, 5), 2), "dec2"),
                 "opp_threat": Fact(round(self.tl.window(OTHER[cur], "threat", m, 5), 2), "dec2"),
                 "window": Fact(5, "int")}
        top = self.top_player(cur, lo, m)
        if top:
            facts["player"] = Fact(top, "player")
        ev = self.top_threat(cur, lo, m)
        self.emit("momentum_flip", "flip" if prev_leader else "first", m, 59, cur, facts,
                  list(ev["event_id"]), [top] if top else [])
        self._mom_leader = cur

    def control(self, m: int) -> None:
        ph = self.tl.phase
        cur = ph[m]
        if cur not in ("home_control", "away_control") or not (ph[m - 1] == ph[m - 2] == cur):
            return
        if cur == getattr(self, "_last_control", None) or not self.ready("control_shift", m):
            return
        side = cur.split("_")[0]
        w = {s: {k: self.tl.window(s, k, m) for k in ("passes", "final_third")} for s in SIDES}
        poss = M._share(w[side]["passes"], w[OTHER[side]]["passes"])
        tilt = M._share(w[side]["final_third"], w[OTHER[side]]["final_third"])
        lo = max(1, m - M.WINDOW + 1)
        ev = self.top_threat(side, lo, m)
        self.emit("control_shift", "control", m, 59, side,
                  {"team": self.team(side),
                   "control": Fact(round(self.side_share(side, self.tl.control_home[m]), 2), "pct"),
                   "possession": Fact(round(poss, 2), "pct"),
                   "tilt": Fact(round(tilt, 2), "pct"),
                   "window": Fact(M.WINDOW, "int")},
                  list(ev["event_id"]))
        self._last_control = cur

    def chaos(self, m: int) -> None:
        ph = self.tl.phase
        if ph[m] != "chaos" or ph[m - 1] == "chaos" or m < 10 or not self.ready("chaos_phase", m):
            return
        turnovers = int(sum(self.tl.window(s, "turnovers", m) for s in SIDES))
        shots = int(sum(self.tl.window(s, "shots", m) for s in SIDES))
        lo = max(1, m - M.WINDOW + 1)
        e = self.ev[(self.ev["minute"] >= lo) & (self.ev["minute"] <= m)]
        proof = e[e["type"] == "shot"].tail(3)
        if len(proof) < 3:
            proof = pd.concat([proof, e[e["type"].isin(["tackle", "interception"])]
                               .tail(3 - len(proof))]).sort_values(["minute", "second"])
        self.emit("chaos_phase", "chaos", m, 59, None,
                  {"chaos": Fact(round(float(self.tl.chaos[m]), 2), "pct"),
                   "turnovers": Fact(turnovers, "int"), "shots": Fact(shots, "int"),
                   "window": Fact(M.WINDOW, "int"),
                   "home": self.team("home"), "away": self.team("away")},
                  list(proof["event_id"]))

    def pressing(self, m: int) -> None:
        if m < 2 * M.WINDOW:
            return
        for side in SIDES:
            key = f"pressure_spike:{side}"
            now = M.window_ppda(self.tl, side, m)
            before = M.window_ppda(self.tl, side, m - M.WINDOW)
            if now is None or now > PPDA_INTENSE or not self.ready(key, m):
                continue
            if self.tl.window(side, "press_high", m) < 4:
                continue
            if before is not None and now > PPDA_DROP * before:
                continue
            lo = max(1, m - M.WINDOW + 1)
            e = self.ev[(self.ev["side"] == side) & (self.ev["minute"] >= lo)
                        & (self.ev["minute"] <= m)]
            wins = e[e["press_high"]]
            forced = int(((e["type"] == "pressure") & (e["outcome"] == "forced_error")).sum())
            facts = {"team": self.team(side), "ppda": Fact(round(now, 1), "dec1"),
                     "ball_wins": Fact(int(len(wins)), "int"),
                     "forced_errors": Fact(forced, "int"), "window": Fact(M.WINDOW, "int")}
            if before is not None:
                facts["ppda_before"] = Fact(round(before, 1), "dec1")
            self.emit("pressure_spike", "press", m, 59, side, facts,
                      list(wins.tail(3)["event_id"]), cooldown_key=key)

    def win_swing(self, m: int) -> None:
        if m < 10 or not self.ready("win_prob_swing", m):
            return
        lo = m - 5
        recent = self.ev[(self.ev["minute"] > lo) & (self.ev["minute"] <= m)]
        if recent["is_goal"].any() or ((recent["type"] == "card")
                                       & (recent["outcome"] == "red")).any():
            return
        deltas = {s: self.win(s, m) - self.win(s, lo) for s in SIDES}
        side = max(deltas, key=lambda s: abs(deltas[s]))
        if abs(deltas[side]) < WIN_SWING:
            return
        rate = self.tl.projection[m][f"{side}_live_rate90"]
        self.emit("win_prob_swing", "up" if deltas[side] > 0 else "down", m, 59, side,
                  {"team": self.team(side), "win_before": Fact(self.win(side, lo), "pct"),
                   "win_after": Fact(self.win(side, m), "pct"), "window": Fact(5, "int"),
                   "xg_rate": Fact(round(rate, 2), "dec2"),
                   "minutes_left": Fact(int(self.tl.projection[m]["minutes_left"]), "int"),
                   "score": Fact(self.score_text(m), "score")},
                  [])

    def tempo(self, m: int) -> None:
        if m < 2 * M.WINDOW or not self.ready("tempo_shift", m):
            return
        now, before = self.tl.tempo[m], self.tl.tempo[m - M.WINDOW]
        if before <= 0 or abs(now - before) / before < TEMPO_CHANGE:
            return
        self.emit("tempo_shift", "up" if now > before else "down", m, 59, None,
                  {"tempo": Fact(round(float(now), 1), "dec1"),
                   "tempo_before": Fact(round(float(before), 1), "dec1"),
                   "window": Fact(M.WINDOW, "int"),
                   "home": self.team("home"), "away": self.team("away")},
                  [])

    def milestone_plan(self) -> dict[int, list[tuple]]:
        """When (minute) the first player reaches each milestone (one per kind)."""
        plan: dict[int, list[tuple]] = {}
        ev = self.ev
        kinds = {
            "passes": (ev[(ev["type"] == "pass") & (ev["outcome"] == "complete")],
                       MILESTONE_PASSES),
            "ball_wins": (ev[ev["type"].isin(["tackle", "interception"])], MILESTONE_BALL_WINS),
        }
        for kind, (rows, n) in kinds.items():
            hits = []
            for (player, side), g in rows.groupby(["player", "side"]):
                if len(g) >= n:
                    nth = g.iloc[n - 1]
                    hits.append((int(nth["minute"]), player, side, list(g.iloc[max(0, n - 3):n]
                                                                       ["event_id"])))
            for minute, player, side, proof in sorted(hits)[:1]:
                plan.setdefault(minute, []).append((kind, player, side, n, proof))
        return plan

    def milestones(self, m: int) -> None:
        if not hasattr(self, "_plan"):
            self._plan = self.milestone_plan()
        for kind, player, side, n, proof in self._plan.get(m, []):
            self.emit("player_milestone", kind, m, 59, side,
                      {"player": Fact(player, "player"), "team": self.team(side),
                       "count": Fact(n, "int")}, proof, [player])


def detect(tl: Timeline) -> list[Insight]:
    d = _Detector(tl)
    for minute in range(1, M.FULL_TIME + 1):
        d.on_events(minute)
        d.on_state(minute)
    return sorted(d.out, key=lambda i: (i.minute, i.second, i.priority))
