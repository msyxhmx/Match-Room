"""Match-Room Live engine: one match, any minute, any viewer.

    engine = MatchEngine(match)
    engine.snapshot(67, Profile(persona="casual", language="ms", team="NGC"))

Builds the timeline and insight log once per match (Interpret + Explain), then
renders (Render) and personalises (Personalise) on request. Half-time,
full-time and catch-up are roll-ups of the same insight log, so the in-play
cards, the briefs and the season view never disagree.
"""

from __future__ import annotations

import logging

import pandas as pd

from contract import (
    BriefPoint,
    CatchUp,
    ControlProfile,
    ControlState,
    Driver,
    Event,
    FactUsed,
    Lineups,
    LiveCard,
    LiveSnapshot,
    MatchBrief,
    MatchMeta,
    MetricLine,
    OverlayMessage,
    PlayerLine,
    PlayerRef,
    Profile,
    Score,
    Series,
    StreamTick,
    Team,
    TurningPoint,
    WinProjection,
)
from live import metrics as M
from live.insights import OTHER, TTL_S, Fact, Insight, detect
from live.narrate import evidence_refs, fmt, llm_rewrite, render_card, validate
from live.templates import (
    BRIEF,
    DRIVER_LABELS,
    FACT_LABELS,
    METRIC_I18N,
    PHASE_LABELS,
    PROJECTION_NOTE,
)
from sim.scenarios import SCENARIOS
from sim.simulator import EVENT_COLUMNS, SimulatedMatch

log = logging.getLogger(__name__)

HALF, FULL = 45, M.FULL_TIME
FOCUS_MINUTES = (15, 30, 45, 60, 75, 90)
MOMENTUM_BAR_EVERY = 5
MIN_TURN_SWING = 0.05  # a turning point must move someone's win chance by 5+ points
HT_MOMENTUM_LEAD = 0.3  # "finished the half on top" if |momentum| at 45' is at least this
TURNING_TYPES = {"goal", "red_card", "momentum_flip", "win_prob_swing", "control_shift"}
OVERLAY_GRAPHIC = {
    "goal": "alert", "red_card": "alert",
    "big_chance": "player_tag", "shot_speed": "player_tag", "pass_of_the_moment": "player_tag",
    "player_milestone": "player_tag", "player_focus": "player_tag",
    "win_prob_swing": "stat_bug",
}
PLAYER_TAG_STAT = {"big_chance": "xg", "shot_speed": "speed", "pass_of_the_moment": "difficulty",
                   "player_milestone": "count", "player_focus": "touches"}


def period(minute: int) -> str:
    if minute <= 0:
        return "pre"
    if minute < HALF:
        return "1H"
    if minute == HALF:
        return "HT"
    return "2H" if minute < FULL else "FT"


def to_events(df: pd.DataFrame) -> list[Event]:
    out = df[EVENT_COLUMNS].astype(object).where(df[EVENT_COLUMNS].notna(), None)
    rows = out.to_dict(orient="records")
    for r in rows:
        if r["under_pressure"] is not None:
            r["under_pressure"] = bool(r["under_pressure"])
    return [Event(**r) for r in rows]


def _facts_used(facts: dict[str, Fact], template: str, lang: str) -> list[FactUsed]:
    return [FactUsed(key=k, label=FACT_LABELS.get(k, {}).get(lang, k), value=fmt(f, lang))
            for k, f in facts.items() if "{" + k + "}" in template]


def say(key: str, lang: str, facts: dict[str, Fact]) -> tuple[str, list[FactUsed]]:
    """Render a roll-up template and prove it against its facts."""
    template = BRIEF[key][lang]
    text = template.format(**{k: fmt(f, lang) for k, f in facts.items()})
    problems = validate(text, facts, lang)
    if problems:
        log.error("Roll-up template %s/%s failed validation: %s", key, lang, problems)
    return text, _facts_used(facts, template, lang)


class MatchEngine:
    def __init__(self, match: SimulatedMatch) -> None:
        self.match = match
        self.tl = M.build_timeline(match)
        self.insights: list[Insight] = detect(self.tl)
        self.events_by_id = self.tl.events.set_index("event_id")
        self.short = {"home": match.home.short_name, "away": match.away.short_name}
        self.names = {"home": match.home.name, "away": match.away.name}
        self.team = {s: Team(id=t.id, name=t.name, short_name=t.short_name)
                     for s, t in (("home", match.home), ("away", match.away))}
        sc = SCENARIOS.get(match.scenario) if match.scenario else None
        self.meta = MatchMeta(**match.meta, scenario=match.scenario,
                              scenario_title=sc.title if sc else None)
        self._cards: dict[tuple, list[LiveCard]] = {}
        self._overlays: dict[tuple, list[OverlayMessage]] = {}
        self._briefs: dict[tuple, MatchBrief] = {}
        self._players = {p.name: ("home", p) for p in match.home.players}
        self._players.update({p.name: ("away", p) for p in match.away.players})

    # ---------- personalisation ----------
    @staticmethod
    def key(profile: Profile) -> tuple:
        return profile.persona, profile.language, profile.team, profile.player

    def has_player(self, name: str | None) -> bool:
        return name is not None and name in self._players

    def _focus_insights(self, player: str) -> list[Insight]:
        side, _ = self._players[player]
        out = []
        for m in FOCUS_MINUTES:
            line = self.player_line(player, m)
            if line is None or line.touches == 0:
                continue
            recent = self.tl.until(m)
            recent = recent[recent["player"] == player].tail(3)
            out.append(Insight(
                id=f"{self.match.match_id}-{m:02d}00-player_focus-{player}", type="player_focus",
                variant="focus", minute=m, second=0, priority=2, side=side,
                team_id=self.team[side].id, players=[player],
                facts={"player": Fact(player, "player"),
                       "team": Fact(self.names[side], "team"),
                       "touches": Fact(line.touches, "int"),
                       "passes_completed": Fact(line.passes_completed, "int"),
                       "pass_accuracy": Fact(line.pass_accuracy / 100, "pct"),
                       "xt": Fact(round(line.xt_added, 2), "dec2"),
                       "shots": Fact(line.shots, "int"),
                       "ball_wins": Fact(line.ball_wins, "int")},
                evidence=list(recent["event_id"]),
            ))
        return out

    @staticmethod
    def keep(card: LiveCard, profile: Profile) -> bool:
        if profile.persona == "analyst" or card.priority == 1:
            return True
        if "focus_player" in card.tags or "your_team" in card.tags:
            return True
        return card.priority == 2 and card.type != "pressure_spike"

    def all_cards(self, profile: Profile) -> list[LiveCard]:
        k = self.key(profile)
        if k not in self._cards:
            insights = list(self.insights)
            if self.has_player(profile.player):
                insights += self._focus_insights(profile.player)
            insights.sort(key=lambda i: (i.minute, i.second, i.priority))
            cards = [render_card(i, profile, self.events_by_id, self.short) for i in insights]
            self._cards[k] = [c for c in cards if self.keep(c, profile)]
        return self._cards[k]

    def cards(self, profile: Profile, until: int = FULL) -> list[LiveCard]:
        return [c for c in self.all_cards(profile) if c.minute <= until]

    # ---------- render: overlays ----------
    def all_overlays(self, profile: Profile) -> list[OverlayMessage]:
        k = self.key(profile)
        if k in self._overlays:
            return self._overlays[k]
        lang = profile.language
        items: list[tuple] = []
        for c in self.all_cards(profile):
            graphic = OVERLAY_GRAPHIC.get(c.type, "lower_third")
            fields = {"headline": c.headline, "body": c.body, "clock": c.clock,
                      "minute": str(c.minute), "type": c.type,
                      "team": self.names[c.side] if c.side else "",
                      "team_id": c.team_id or "",
                      "home": self.short["home"], "away": self.short["away"],
                      "score": "{}-{}".format(*self.tl.score(c.minute))}
            if c.players:
                side, p = self._players.get(c.players[0], (None, None))
                fields["player"] = c.players[0]
                fields["number"] = str(p.number) if p else ""
            stat_key = PLAYER_TAG_STAT.get(c.type)
            stat = next((f for f in c.facts_used if f.key == stat_key), None)
            if stat:
                fields["stat_label"], fields["stat_value"] = stat.label, stat.value
            if c.type == "win_prob_swing":
                before = next((f.value for f in c.facts_used if f.key == "win_before"), "")
                after = next((f.value for f in c.facts_used if f.key == "win_after"), "")
                fields.update(stat_label=FACT_LABELS["win_after"][lang], value_before=before,
                              value_after=after)
            items.append((c.minute, c.second, graphic, c.priority, c.insight_id, fields))
        for m in range(MOMENTUM_BAR_EVERY, FULL + 1, MOMENTUM_BAR_EVERY):
            ctrl = self.control(m, lang)
            items.append((m, 59, "momentum_bar", 3, None, {
                "clock": f"{m}:59", "minute": str(m), "home": self.short["home"],
                "away": self.short["away"], "score": "{}-{}".format(*self.tl.score(m)),
                "momentum": f"{ctrl.momentum:.2f}", "control_home": f"{ctrl.home_share:.2f}",
                "chaos": f"{ctrl.chaos:.2f}", "phase": ctrl.phase, "phase_label": ctrl.label,
            }))
        items.sort(key=lambda t: (t[0], t[1], t[3]))
        overlays = [OverlayMessage(seq=i + 1, match_id=self.match.match_id, minute=m, second=s,
                                   clock=f"{m}:{s:02d}", graphic=g, priority=p,
                                   ttl_s=TTL_S[p], insight_id=iid, language=lang, fields=f)
                    for i, (m, s, g, p, iid, f) in enumerate(items)]
        self._overlays[k] = overlays
        return overlays

    def overlays(self, profile: Profile, until: int = FULL) -> list[OverlayMessage]:
        return [o for o in self.all_overlays(profile) if o.minute <= until]

    # ---------- interpret: state at a minute ----------
    def control(self, m: int, lang: str) -> ControlState:
        ph = self.tl.phase[m]
        if ph.endswith("_control"):
            label = PHASE_LABELS["control"][lang].format(team=self.names[ph.split("_")[0]])
        else:
            label = PHASE_LABELS[ph][lang]
        return ControlState(home_share=round(float(self.tl.control_home[m]), 3),
                            chaos=round(float(self.tl.chaos[m]), 3),
                            tempo=round(float(self.tl.tempo[m]), 1),
                            momentum=round(float(self.tl.momentum[m]), 3), phase=ph, label=label)

    def projection(self, m: int, lang: str) -> WinProjection:
        p = self.tl.projection[m]
        h, a = self.tl.score(m)

        def lab(key: str, side: str | None = None) -> str:
            text = DRIVER_LABELS[key][lang]
            return text.format(team=self.names[side]) if side else text

        drivers = [
            Driver(key="score", label=lab("score"), value=f"{h}-{a}"),
            Driver(key="minutes_left", label=lab("minutes_left"), value=str(p["minutes_left"])),
            Driver(key="home_rate", label=lab("home_rate", "home"),
                   value=f"{p['home_rate90']:.2f}"),
            Driver(key="away_rate", label=lab("away_rate", "away"),
                   value=f"{p['away_rate90']:.2f}"),
            Driver(key="live_weight", label=lab("live_weight"),
                   value=f"{round(100 * p['live_weight'])}%"),
        ]
        if p["home_reds"] or p["away_reds"]:
            drivers.append(Driver(key="reds", label=lab("reds"),
                                  value=f"{int(p['home_reds'])}-{int(p['away_reds'])}"))
        return WinProjection(home_win=round(p["home_win"], 3), draw=round(p["draw"], 3),
                             away_win=round(p["away_win"], 3), drivers=drivers,
                             note=PROJECTION_NOTE[lang])

    def metrics(self, m: int, lang: str) -> list[MetricLine]:
        vals = M.side_metrics(self.tl, m)
        lines = []
        for key, label, unit, definition in M.METRIC_DEFS:
            if lang != "en" and key in METRIC_I18N:
                label, definition = METRIC_I18N[key][lang]
            lines.append(MetricLine(key=key, label=label, home=vals["home"][key],
                                    away=vals["away"][key], unit=unit, definition=definition))
        return lines

    def series(self, m: int) -> Series:
        proj = self.tl.projection[: m + 1]
        r = lambda xs: [round(float(x), 3) for x in xs]  # noqa: E731
        return Series(minute=list(range(m + 1)), momentum=r(self.tl.momentum[: m + 1]),
                      control_home=r(self.tl.control_home[: m + 1]),
                      chaos=r(self.tl.chaos[: m + 1]),
                      home_win=r(p["home_win"] for p in proj), draw=r(p["draw"] for p in proj),
                      away_win=r(p["away_win"] for p in proj))

    def player_line(self, name: str | None, m: int) -> PlayerLine | None:
        if not self.has_player(name):
            return None
        line = M.player_lines(self.tl, m, only=name)[0]
        return PlayerLine(**line)

    def score(self, m: int) -> Score:
        h, a = self.tl.score(m)
        return Score(home=h, away=a)

    def recent_events(self, m: int) -> list[Event]:
        e = self.match.events
        e = e[(e["minute"] > m - 10) & (e["minute"] <= m) & e["type"].isin(["shot", "card"])]
        return to_events(e)

    # ---------- render: whole screens ----------
    def snapshot(self, m: int, profile: Profile) -> LiveSnapshot:
        m = max(0, min(m, FULL))
        lang = profile.language
        cards = self.cards(profile, m)
        return LiveSnapshot(
            match_id=self.match.match_id, minute=m, clock=f"{m:02d}:00", period=period(m),
            home=self.team["home"], away=self.team["away"], score=self.score(m), meta=self.meta,
            profile=profile, metrics=self.metrics(m, lang), control=self.control(m, lang),
            projection=self.projection(m, lang), series=self.series(m),
            cards=list(reversed(cards)),
            overlays=[o for o in self.overlays(profile, m) if m - 1 < o.minute <= m],
            focus_player=self.player_line(profile.player, m),
            recent_events=self.recent_events(m),
        )

    def tick(self, m: int, profile: Profile) -> StreamTick:
        lang = profile.language
        e = self.match.events
        return StreamTick(
            minute=m, clock=f"{m:02d}:00", period=period(m), score=self.score(m),
            control=self.control(m, lang), projection=self.projection(m, lang),
            metrics=self.metrics(m, lang), new_events=to_events(e[e["minute"] == m]),
            new_cards=[c for c in self.all_cards(profile) if c.minute == m],
            new_overlays=[o for o in self.all_overlays(profile) if o.minute == m],
        )

    def lineups(self) -> Lineups:
        players = [PlayerRef(name=p.name, number=p.number, position=p.position,
                             team_id=self.team[side].id, side=side)
                   for name, (side, p) in self._players.items()]
        return Lineups(match_id=self.match.match_id, home=self.team["home"],
                       away=self.team["away"], meta=self.meta, players=players)

    def catchup(self, m: int, profile: Profile) -> CatchUp:
        m = max(1, min(m, FULL))
        lang = profile.language
        cards = self.cards(profile, m)
        ranked = sorted(cards, key=lambda c: (c.priority, -c.minute))[:5]
        ranked.sort(key=lambda c: (c.minute, c.second))
        ctrl = self.control(m, lang)
        h, a = self.tl.score(m)
        facts = {"minute": Fact(m, "int"), "home": Fact(self.names["home"], "team"),
                 "away": Fact(self.names["away"], "team"), "score": Fact(f"{h}-{a}", "score"),
                 "phase": Fact(ctrl.label, "text")}
        headline, _ = say("catchup", lang, facts)
        return CatchUp(match_id=self.match.match_id, minute=m, clock=f"{m:02d}:00",
                       home=self.team["home"], away=self.team["away"], score=self.score(m),
                       profile=profile, headline=headline, cards=ranked, control=ctrl,
                       projection=self.projection(m, lang))

    # ---------- roll-ups ----------
    def _insight(self, insight_id: str) -> Insight:
        return next(i for i in self.insights if i.id == insight_id)

    def control_profile(self, m: int) -> ControlProfile:
        phases = self.tl.phase[1: m + 1]
        return ControlProfile(home_control=phases.count("home_control"),
                              away_control=phases.count("away_control"),
                              chaos=phases.count("chaos"), balanced=phases.count("balanced"))

    def turning_points(self, m: int, lang: str) -> list[TurningPoint]:
        tps = []
        for ins in self.insights:
            if ins.minute > m or ins.type not in TURNING_TYPES:
                continue
            side = ins.side or "home"
            key = "home_win" if side == "home" else "away_win"
            before = self.tl.projection[max(ins.minute - 1, 0)][key]
            after = self.tl.projection[ins.minute][key]
            if ins.type == "momentum_flip" or ins.type == "control_shift":
                before = self.tl.projection[max(ins.minute - 5, 0)][key]
            card = render_card(ins, Profile(persona="casual", language=lang),
                               self.events_by_id, self.short)
            tps.append((abs(after - before), TurningPoint(
                insight_id=ins.id, minute=ins.minute, clock=ins.clock, title=card.headline,
                side=ins.side, win_before=round(before, 3), win_after=round(after, 3))))
        top = sorted([t for t in tps if t[0] >= MIN_TURN_SWING], key=lambda t: t[0],
                     reverse=True)[:4]
        return [tp for _, tp in sorted(top, key=lambda t: (t[1].minute, t[1].clock))]

    def _winner_story(self, m: int) -> str:
        h, a = self.tl.score(m)
        if h == a:
            return "ft_draw"
        winner = "home" if h > a else "away"
        trailed = any((self.tl.score(i)[0] - self.tl.score(i)[1]) * (1 if winner == "home" else -1)
                      < 0 for i in range(1, m + 1))
        if trailed:
            return "ft_comeback"
        cp = self.control_profile(m)
        mine = cp.home_control if winner == "home" else cp.away_control
        theirs = cp.away_control if winner == "home" else cp.home_control
        return "ft_against_run" if theirs - mine >= 10 else "ft_win"

    def brief(self, kind: str, profile: Profile) -> MatchBrief:
        k = (kind, *self.key(profile))
        if k in self._briefs:
            return self._briefs[k]
        m = HALF if kind == "halftime" else FULL
        lang = profile.language
        h, a = self.tl.score(m)
        score = Fact(f"{h}-{a}", "score")
        team_fact = {s: Fact(self.names[s], "team") for s in ("home", "away")}

        # headline
        if kind == "halftime":
            if h == a:
                headline, _ = say("ht_level", lang, {"score": score})
            else:
                lead = "home" if h > a else "away"
                headline, _ = say("ht_lead", lang, {"leader": team_fact[lead], "score": score})
        else:
            story = self._winner_story(m)
            facts = {"score": score}
            if story != "ft_draw":
                facts["winner"] = team_fact["home" if h > a else "away"]
            headline, _ = say(story, lang, facts)

        # why
        cp = self.control_profile(m)
        why: list[BriefPoint] = []
        facts = {"home": team_fact["home"], "away": team_fact["away"],
                 "home_minutes": Fact(cp.home_control, "int"),
                 "away_minutes": Fact(cp.away_control, "int"),
                 "chaos_minutes": Fact(cp.chaos, "int")}
        body, used = say("why_control", lang, facts)
        why.append(BriefPoint(title=BRIEF["why_control_title"][lang], body=body, facts_used=used))

        xg = {s: round(self.tl.cum(s, "xg", m), 2) for s in ("home", "away")}
        if abs(xg["home"] - xg["away"]) < 0.4:
            body, used = say("why_chances_even", lang, {"home_xg": Fact(xg["home"], "dec2"),
                                                         "away_xg": Fact(xg["away"], "dec2")})
        else:
            top = "home" if xg["home"] > xg["away"] else "away"
            lead_ok = (h - a) * (1 if top == "home" else -1) > 0
            body, used = say("why_chances_fair" if lead_ok else "why_chances_unfair", lang,
                             {"team": team_fact[top], "team_xg": Fact(xg[top], "dec2"),
                              "opp_xg": Fact(xg[OTHER[top]], "dec2")})
        shots = self.tl.until(m)
        shots = shots[shots["type"] == "shot"].sort_values("xg", ascending=False).head(3)
        why.append(BriefPoint(title=BRIEF["why_chances_title"][lang], body=body, facts_used=used,
                              evidence=evidence_refs(list(shots["event_id"]), self.events_by_id,
                                                     self.short, lang)))

        vals = M.side_metrics(self.tl, m)
        ppda = {s: vals[s]["ppda"] for s in ("home", "away")}
        if all(ppda.values()) and abs(ppda["home"] - ppda["away"]) >= 1.5:
            presser = min(ppda, key=ppda.get)
            body, used = say("why_press", lang, {"team": team_fact[presser],
                                                  "ppda": Fact(ppda[presser], "dec1"),
                                                  "opp_ppda": Fact(ppda[OTHER[presser]], "dec1")})
            why.append(BriefPoint(title=BRIEF["why_press_title"][lang], body=body,
                                  facts_used=used))

        # what to watch (half-time only)
        watch: list[BriefPoint] = []
        projection = None
        if kind == "halftime":
            projection = self.projection(m, lang)
            body, used = say("watch_projection", lang, {
                "home": team_fact["home"], "away": team_fact["away"],
                "home_p": Fact(projection.home_win, "pct"), "draw_p": Fact(projection.draw, "pct"),
                "away_p": Fact(projection.away_win, "pct")})
            watch.append(BriefPoint(title=BRIEF["watch_projection_title"][lang],
                                    body=f"{body} {projection.note}", facts_used=used))
            mom = float(self.tl.momentum[m])
            if abs(mom) >= HT_MOMENTUM_LEAD:
                side = "home" if mom > 0 else "away"
                share = (1 + mom) / 2 if side == "home" else (1 - mom) / 2
                body, used = say("watch_momentum", lang, {"team": team_fact[side],
                                                          "share": Fact(round(share, 2), "pct")})
            else:
                body, used = say("watch_momentum_even", lang, {})
            watch.append(BriefPoint(title=BRIEF["watch_momentum_title"][lang], body=body,
                                    facts_used=used))
            cards_ev = self.tl.until(m)
            cards_ev = cards_ev[cards_ev["type"] == "card"]
            reds = cards_ev[cards_ev["outcome"] == "red"]
            if len(reds):
                body, used = say("watch_reds", lang, {"team": team_fact[reds.iloc[0]["side"]]})
            elif len(cards_ev) >= 3:
                body, used = say("watch_yellows", lang, {"yellows": Fact(len(cards_ev), "int")})
            else:
                body = None
            if body:
                watch.append(BriefPoint(title=BRIEF["watch_cards_title"][lang], body=body,
                                        facts_used=used))
            focus = self.player_line(profile.player, m)
            if focus:
                body, used = say("watch_player", lang, {"touches": Fact(focus.touches, "int"),
                                                        "xt": Fact(round(focus.xt_added, 2),
                                                                   "dec2")})
                watch.append(BriefPoint(title=focus.name, body=body, facts_used=used))

        # summary: control + the biggest turning point
        tps = self.turning_points(m, lang)
        summary_facts: dict[str, Fact] = {}
        if abs(cp.home_control - cp.away_control) >= 5:
            top = "home" if cp.home_control > cp.away_control else "away"
            summary_facts = {"team": team_fact[top],
                             "team_minutes": Fact(max(cp.home_control, cp.away_control), "int"),
                             "opp_minutes": Fact(min(cp.home_control, cp.away_control), "int")}
            first, _ = say("summary_control", lang, summary_facts)
        else:
            summary_facts = {"chaos_minutes": Fact(cp.chaos, "int")}
            first, _ = say("summary_even", lang, summary_facts)
        parts = [first]
        if tps:
            big = max(tps, key=lambda t: abs(t.win_after - t.win_before))
            turn = {"turn_minute": Fact(big.minute, "int"),
                    "turn_headline": Fact(big.title, "text"), **team_fact}
            turn.update({f"player_{i}": Fact(n, "player")
                         for i, n in enumerate(self._insight(big.insight_id).players)})
            second, _ = say("summary_turn", lang, turn)
            parts.append(second)
            summary_facts.update(turn)
        summary = " ".join(parts)
        summary_source = "template"
        summary_facts.update({"score": score, "home": team_fact["home"],
                              "away": team_fact["away"]})
        rewritten = llm_rewrite(summary, summary_facts, lang, profile.persona,
                                "a two-sentence match summary")
        if rewritten:
            summary, summary_source = rewritten, "llm"

        limit = 5 if kind == "halftime" else 6
        picked = sorted(self.cards(profile, m), key=lambda c: (c.priority, c.minute))[:limit]
        picked.sort(key=lambda c: (c.minute, c.second))

        potm = None
        if kind == "fulltime":
            best = max(M.player_lines(self.tl, m), key=M.impact_score)
            potm = PlayerLine(**best)

        brief = MatchBrief(
            match_id=self.match.match_id, kind=kind, minute=m, home=self.team["home"],
            away=self.team["away"], score=self.score(m), meta=self.meta, profile=profile,
            headline=headline, summary=summary, summary_source=summary_source,
            what_happened=picked, why=why, what_to_watch=watch, turning_points=tps,
            control_profile=cp, metrics=self.metrics(m, lang), projection=projection,
            player_of_the_match=potm, focus_player=self.player_line(profile.player, m),
        )
        self._briefs[k] = brief
        return brief
