"""Possession-chain simulator (v2): the ball moves, and every event starts where the last ended.

The match is played on a clock, one action at a time. The team on the ball either shoots
or passes; a completed pass moves the ball to where it ends, a failed one hands it to the
other side at that spot. So shots come from where the ball is, and xG comes from the shot's
location (distance and angle to goal), not the other way round as in v1.

What decides each action (all in logit units, so effects add up):

- Strength: log(attack) of the side on the ball against log(defence) of the other, with
  home advantage on the home attack.
- Form on the day: a hidden per-team draw for this match. Nobody sees it, but it shows in
  how the team plays, which is why first-half play can predict the second half.
- Momentum: a slow random walk between the teams (AR(1) per minute), so spells of pressure
  last a while instead of resetting every minute. Scenario swings add to it.
- Game state: a trailing side plays more forward and shoots more; a leading side sits deeper.
- Red cards cut that side's attack and defence for the rest of the match.

Coordinates are in the acting team's frame (x = 100 is the goal they attack), as in v1.
Output rows follow contract.Event; `sim.simulator.simulate_match` assigns the event IDs.
"""

from __future__ import annotations

import math

import numpy as np
import pandas as pd

from sim.scenarios import Scenario
from sim.teams import TeamProfile

HALF_S = 45 * 60
HOME_ADVANTAGE = 1.08
FORM_SD = 0.22  # hidden form on the day, per team per match
MOMENTUM_AR, MOMENTUM_SD = 0.93, 0.07  # per minute; persists for ~15 minutes
SWING_GAIN = 3.0  # scenario swing (share of play) -> momentum, logit units
CHASE = 0.12  # per goal behind (clipped at 2)
RED_ATTACK, RED_DEFENCE = 0.72, 0.85

PASS_TIME = (1.7, 2.2, 1.6)  # seconds: fixed + gamma(shape, scale)
COMPLETION = {"base": 3.0, "per_metre": -0.045, "final_third": -0.065, "pressure": -0.55,
              "press": -0.6, "edge": 1.0}
SPREAD = {"deep": 1.2, "mid": 1.6, "final": 1.9}  # sd of pass direction (radians, 0 = forward)
SHOT_PROPENSITY, SHOT_EXPONENT = 0.55, 0.42  # chance to shoot = K * xG(spot) ** exponent
CORNER_FROM = {"saved": 0.25, "blocked": 0.35, "cleared": 0.12}
FOUL_P = 0.022  # per attacking action, scaled by the defender's press
YELLOW_GIVEN_FOUL, RED_GIVEN_FOUL = 0.15, 0.012
PITCH_L, PITCH_W = 105.0, 68.0

_ZONE_WEIGHTS = {  # who plays the pass, by where the ball is
    "deep": {"GK": 0.6, "DF": 2.2, "MF": 1.0, "FW": 0.2},
    "mid": {"GK": 0.0, "DF": 1.0, "MF": 2.0, "FW": 0.8},
    "final": {"GK": 0.0, "DF": 0.4, "MF": 1.6, "FW": 1.8},
    "shot": {"GK": 0.0, "DF": 0.4, "MF": 1.0, "FW": 2.6},
    "foul": {"GK": 0.1, "DF": 1.6, "MF": 1.3, "FW": 0.6},
    "gk": {"GK": 1.0, "DF": 0.0, "MF": 0.0, "FW": 0.0},
}
_cache: dict[tuple[str, str], np.ndarray] = {}


def _sigmoid(z: float) -> float:
    return 1.0 / (1.0 + math.exp(-z))


def shot_xg(x: float, y: float) -> float:
    """xG from location: distance and the angle the goal mouth makes from the shot."""
    dx, dy = (100 - x) * PITCH_L / 100, (y - 50) * PITCH_W / 100
    dist = max(math.hypot(dx, dy), 0.5)
    half_goal = 3.66
    angle = abs(math.atan2(half_goal * 2 * dx, dx * dx + dy * dy - half_goal ** 2))
    return _sigmoid(-0.4 - 0.13 * dist + 1.0 * angle)


class _Match:
    def __init__(self, home: TeamProfile, away: TeamProfile, rng: np.random.Generator,
                 match_id: str, scenario: Scenario | None):
        self.rng, self.match_id = rng, match_id
        self.teams = {"home": home, "away": away}
        self.attack = {"home": home.attack * HOME_ADVANTAGE, "away": away.attack}
        self.defence = {"home": home.defence, "away": away.defence}
        self.form = {s: float(rng.normal(0, FORM_SD)) for s in ("home", "away")}
        self.goals = {"home": 0, "away": 0}
        self.momentum = 0.0  # + favours home
        self.minute_seen = 0
        self.swing = dict(scenario.swing) if scenario else {}
        self.shot_mult = scenario.shot_rate_mult if scenario else 1.0
        self.forced_goals = sorted(scenario.forced_goals) if scenario else []
        self.forced_reds = sorted(scenario.forced_reds) if scenario else []
        self.scorers = dict(scenario.scorers) if scenario else {}
        self.rows: list[dict] = []
        self.t = 0.0
        self.last_minute = 45  # events stay inside their half
        self.corner_next = False

    # ---------- helpers ----------
    @staticmethod
    def other(side: str) -> str:
        return "away" if side == "home" else "home"

    def player(self, side: str, kind: str) -> str:
        team = self.teams[side]
        key = (team.id, kind)
        if key not in _cache:
            w = np.array([_ZONE_WEIGHTS[kind][p.position] for p in team.players])
            _cache[key] = w / w.sum()
        return team.players[int(self.rng.choice(len(team.players), p=_cache[key]))].name

    def minute(self) -> int:
        return min(int(self.t // 60) + 1, self.last_minute)

    def emit(self, side: str, kind: str, x: float, y: float, outcome: str, player: str,
             **extra) -> dict:
        row = {"match_id": self.match_id, "minute": self.minute(), "second": int(self.t % 60),
               "side": side, "team_id": self.teams[side].id, "player": player, "type": kind,
               "x": round(float(np.clip(x, 0, 100)), 1), "y": round(float(np.clip(y, 0, 100)), 1),
               "outcome": outcome, "xg": None, "end_x": None, "end_y": None, "speed_kmh": None,
               "under_pressure": None, **extra}
        self.rows.append(row)
        return row

    def edge(self, side: str) -> float:
        """How much the side on the ball is on top right now, in logit units."""
        opp = self.other(side)
        mom = self.momentum if side == "home" else -self.momentum
        behind = float(np.clip(self.goals[opp] - self.goals[side], -2, 2))
        return (math.log(self.attack[side]) - math.log(self.defence[opp])
                + self.form[side] - self.form[opp] + mom + CHASE * behind)

    def tick_clock(self, dt: float) -> None:
        self.t += dt
        while self.minute_seen < int(self.t // 60):
            self.minute_seen += 1
            block = min(self.minute_seen // 15, 5)
            target = SWING_GAIN * self.swing.get(block, 0.0)
            self.momentum = (MOMENTUM_AR * self.momentum + (1 - MOMENTUM_AR) * target
                             + float(self.rng.normal(0, MOMENTUM_SD)))

    # ---------- actions ----------
    def red_card(self, side: str) -> None:
        self.attack[side] *= RED_ATTACK
        self.defence[side] *= RED_DEFENCE

    def foul(self, fouler: str, x: float, y: float, forced_red: bool = False) -> None:
        player = self.player(fouler, "foul")
        self.emit(fouler, "foul", x, y, "committed", player)
        r = 0.0 if forced_red else float(self.rng.random())
        if r < RED_GIVEN_FOUL:
            self.emit(fouler, "card", x, y, "red", player)
            self.red_card(fouler)
        elif r < RED_GIVEN_FOUL + YELLOW_GIVEN_FOUL:
            self.emit(fouler, "card", x, y, "yellow", player)

    def shoot(self, side: str, x: float, y: float, header: bool = False,
              force_goal: bool = False, xg: float | None = None,
              scorer: str | None = None) -> tuple[str, float, float]:
        """Take a shot. Returns (next side on the ball, x, y) in that side's frame."""
        opp = self.other(side)
        if xg is None:
            base = shot_xg(x, y) * (0.7 if header else 1.0)
            quality = 0.25 * (math.log(self.attack[side]) - math.log(self.defence[opp]))
            odds = base / (1 - base) * math.exp(quality)
            xg = float(np.clip(odds / (1 + odds), 0.01, 0.9))
        r = float(self.rng.random())
        if force_goal or r < xg:
            outcome = "goal"
        elif r < xg + 0.33:
            outcome = "saved"
        elif r < xg + 0.58:
            outcome = "blocked"
        else:
            outcome = "off_target"
        dist = math.hypot((100 - x) * PITCH_L / 100, (y - 50) * PITCH_W / 100)
        speed = float(np.clip(self.rng.normal(74 + 0.9 * dist, 13), 35, 132))
        shooter = self.player(side, "shot")  # drawn even when scripted: same random stream
        self.emit(side, "shot", x, y, outcome, scorer or shooter, xg=round(xg, 3),
                  speed_kmh=round(speed, 1))
        u = float(self.rng.random())
        if outcome == "goal":
            self.goals[side] += 1
            self.tick_clock(55 + 20 * u)
            return opp, 50.0, 50.0
        if outcome == "saved":
            if u < CORNER_FROM["saved"]:
                return self.corner(side)
            self.tick_clock(6)
            return opp, 6.0, 50.0
        if outcome == "blocked":
            if u < CORNER_FROM["blocked"]:
                return self.corner(side)
            if u < CORNER_FROM["blocked"] + 0.3:
                return side, max(x - 8, 55), y
            return opp, 100 - x, 100 - y
        self.tick_clock(18 + 8 * u)  # goal kick
        return opp, 6.0, 50.0

    def corner(self, side: str) -> tuple[str, float, float]:
        self.tick_clock(20 + 10 * float(self.rng.random()))
        cy = float(self.rng.choice([0.0, 100.0]))
        self.emit(side, "corner", 100, cy, "awarded", self.player(side, "final"))
        self.corner_next = True
        return side, 99.5, 0.5 if cy == 0 else 99.5

    def pass_(self, side: str, x: float, y: float, corner_kick: bool = False,
              forced: tuple[float, float] | None = None,
              fail: bool = False) -> tuple[str, float, float, bool]:
        """Play one pass. Returns (side on the ball, x, y, completed)."""
        rng, opp = self.rng, self.other(side)
        edge = self.edge(side)
        behind = float(np.clip(self.goals[opp] - self.goals[side], -2, 2))
        if forced is not None:
            ex, ey = forced
        elif corner_kick:
            ex, ey = rng.normal(91, 3), rng.normal(50, 11)
        else:
            spread = SPREAD["deep" if x < 25 else "final" if x > 75 else "mid"]
            spread = max(spread - 0.12 * behind - 0.08 * edge, 0.6)
            angle = rng.normal(0.0, spread)
            length = 4 + rng.gamma(2.0, 7.5) + (rng.gamma(2.0, 10.0) if x < 20 else 0.0)
            ex = x + length * math.cos(angle) / PITCH_L * 100
            ey = y + length * math.sin(angle) / PITCH_W * 100
        ex, ey = float(np.clip(ex, 1, 99)), float(np.clip(ey, 1, 99))
        length_m = math.hypot((ex - x) * PITCH_L / 100, (ey - y) * PITCH_W / 100)

        opp_press = self.teams[opp].press
        pressured = bool(rng.random() < 0.10 + 0.30 * opp_press + 0.15 * (x > 50))
        c = COMPLETION
        z = (c["base"] + c["per_metre"] * length_m + c["final_third"] * max(ex - 66, 0)
             + c["pressure"] * pressured + c["press"] * opp_press + c["edge"] * edge)
        if corner_kick:
            z = -0.6 + 0.3 * edge
        done = bool(rng.random() < _sigmoid(z))
        if forced is not None or fail:
            done = not fail

        zone = "deep" if x < 33 else "final" if x > 66 else "mid"
        passer = self.player(side, "gk" if (x <= 8 and not corner_kick) else zone)
        if pressured:
            self.emit(opp, "pressure", 100 - x, 100 - y, "applied" if done else "forced_error",
                      self.player(opp, "foul"))
        speed = float(np.clip(28 + 1.05 * length_m + rng.normal(0, 6), 15, 110))
        self.emit(side, "pass", x, y, "complete" if done else "incomplete", passer,
                  end_x=round(ex, 1), end_y=round(ey, 1), speed_kmh=round(speed, 1),
                  under_pressure=pressured)
        if done:
            carry = max(rng.normal(1.2, 2.0), 0.0)
            return side, min(ex + carry, 99.0), ey, True
        kind = "interception" if rng.random() < 0.6 else "tackle"
        self.emit(opp, kind, 100 - ex, 100 - ey, "won", self.player(opp, "foul"))
        return opp, 100 - ex, 100 - ey, False

    def forced_goal(self, side: str, x: float, y: float, on_ball: str) -> tuple[str, float, float]:
        """Scripted storyline goal: win the ball, work it into the box, score."""
        rng = self.rng
        self.corner_next = False
        if on_ball != side:  # the other side gives the ball away where it is
            self.tick_clock(2)
            on_ball, x, y, _ = self.pass_(on_ball, x, y, fail=True)
        targets = [(min(max(x, 40) + 18, 80), rng.normal(50, 15)),
                   (rng.normal(88, 3), rng.normal(50, 8))]
        for tx, ty in targets:
            self.tick_clock(3)
            _, x, y, _ = self.pass_(side, x, y, forced=(tx, ty))
        self.tick_clock(2)
        xg = float(rng.uniform(0.18, 0.55))
        return self.shoot(side, x, y, force_goal=True, xg=xg,
                          scorer=self.scorers.get(self.minute()))

    # ---------- the match ----------
    def play_half(self, start: float, kick_off: str) -> None:
        self.t = start
        end = start + HALF_S
        self.last_minute = 45 if start < HALF_S else 90
        self.corner_next = False
        side, x, y = kick_off, 50.0, 50.0
        rng = self.rng
        while self.t < end - 1:
            minute = self.minute()
            if self.forced_reds and self.forced_reds[0][0] <= minute:
                _, red_side = self.forced_reds.pop(0)
                fx = 100 - x if red_side != side else x
                self.foul(red_side, fx, 100 - y if red_side != side else y, forced_red=True)
                self.tick_clock(25)
                side = self.other(red_side)
                x, y = (100 - fx, 50.0)
                continue
            if self.forced_goals and self.forced_goals[0][0] <= minute:
                _, goal_side = self.forced_goals.pop(0)
                side, x, y = self.forced_goal(goal_side, x, y, side)
                continue

            if self.corner_next:
                self.corner_next = False
                side, x, y, done = self.pass_(side, x, y, corner_kick=True)
                self.tick_clock(2)
                if done and rng.random() < 0.6:
                    side, x, y = self.shoot(side, x, y, header=True)
                continue

            opp = self.other(side)
            in_box = x > 83 and abs(y - 50) < 22
            foul_p = FOUL_P * (0.8 + 0.4 * self.teams[opp].press) * (0.35 if in_box else 1.0)
            if rng.random() < foul_p:
                if in_box:
                    self.foul(opp, 100 - x, 100 - y)
                    self.tick_clock(60)
                    side, x, y = self.shoot(side, 89.5, 50.0, xg=0.76)
                else:
                    self.foul(opp, 100 - x, 100 - y)
                    self.tick_clock(18 + 10 * float(rng.random()))
                continue

            if x > 70:
                behind = float(np.clip(self.goals[opp] - self.goals[side], -2, 2))
                p_shot = (SHOT_PROPENSITY * shot_xg(x, y) ** SHOT_EXPONENT * self.shot_mult
                          * math.exp(0.15 * self.edge(side) + 0.1 * behind))
                if rng.random() < min(p_shot, 0.9):
                    self.tick_clock(2)
                    side, x, y = self.shoot(side, x, y)
                    continue

            dt = PASS_TIME[0] + float(rng.gamma(PASS_TIME[1], PASS_TIME[2]))
            self.tick_clock(dt)
            if self.t >= end - 1:
                break
            was, ex_before = side, x
            side, x, y, done = self.pass_(side, x, y)
            if not done and side != was and (100 - x) > 85 and ex_before > 60 \
                    and rng.random() < CORNER_FROM["cleared"]:  # cleared for a corner
                side, x, y = self.corner(was)


def play(home: TeamProfile, away: TeamProfile, rng: np.random.Generator, match_id: str,
         scenario: Scenario | None = None) -> pd.DataFrame:
    """Simulate one match and return its events (event_id left empty)."""
    m = _Match(home, away, rng, match_id, scenario)
    first = "home" if rng.random() < 0.5 else "away"
    m.play_half(0.0, first)
    m.momentum *= 0.5  # the break takes some of the heat out
    m.play_half(float(HALF_S), m.other(first))
    ev = pd.DataFrame(m.rows)
    ev.insert(0, "event_id", None)
    return ev
