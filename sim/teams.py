"""Fictional teams for the synthetic league. No real clubs or players: the brief
requires synthetic data only."""

from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

FIRST = ["A.", "B.", "C.", "D.", "E.", "F.", "G.", "H.", "J.", "K.", "L.", "M.", "N.", "O.", "R."]
LAST = [
    "Adeyemi", "Barros", "Carter", "Dahl", "Ekwueme", "Ferreira", "Gallo", "Hart", "Ibrahim",
    "Jensen", "Kovac", "Lindqvist", "Mensah", "Novak", "Okafor", "Price", "Quinn", "Rahman",
    "Silva", "Tanaka", "Ueda", "Vidal", "Walsh", "Yilmaz", "Zielinski", "Abdullah", "Moreau",
]
POSITIONS = ["GK", "DF", "DF", "DF", "DF", "MF", "MF", "MF", "FW", "FW", "FW"]


@dataclass(frozen=True)
class Player:
    name: str
    position: str
    number: int = 0


@dataclass(frozen=True)
class TeamProfile:
    id: str
    name: str
    short_name: str
    attack: float  # ~0.7 (weak) to ~1.3 (strong)
    defence: float  # higher = harder to score against
    press: float  # 0-1, how hard they press; raises tilt and fouls
    players: tuple[Player, ...] = field(default_factory=tuple)


_TEAM_SPECS = [
    ("RIV", "Riverside Rovers", 1.25, 1.15, 0.75),
    ("NGC", "Northgate City", 1.20, 1.10, 0.60),
    ("HAR", "Harbour Athletic", 1.05, 1.00, 0.55),
    ("ELM", "Elmstead United", 1.00, 1.05, 0.40),
    ("KST", "Kingston Vale", 0.95, 0.95, 0.65),
    ("MIL", "Millbrook Town", 0.90, 0.90, 0.35),
    ("ASH", "Ashford Albion", 0.85, 0.95, 0.50),
    ("QNB", "Queensbridge FC", 0.80, 0.85, 0.30),
]


# Match metadata (all fictional).
VENUES = {
    "RIV": "Riverside Park", "NGC": "Northgate Stadium", "HAR": "The Quayside",
    "ELM": "Elmstead Lane", "KST": "Vale Road", "MIL": "Millbrook Meadow",
    "ASH": "Albion Ground", "QNB": "Bridge End",
}
REFEREES = ["P. Okonjo", "S. Marlow", "T. Haddad", "R. Lindgren", "M. Castell", "J. Wren"]


def _squad(rng: np.random.Generator) -> tuple[Player, ...]:
    names = set()
    while len(names) < len(POSITIONS):
        names.add(f"{rng.choice(FIRST)} {rng.choice(LAST)}")
    return tuple(Player(n, p, number=i + 1)
                 for i, (n, p) in enumerate(zip(sorted(names), POSITIONS, strict=True)))


def build_league(seed: int = 7) -> list[TeamProfile]:
    rng = np.random.default_rng(seed)
    return [
        TeamProfile(id=code, name=name, short_name=code, attack=a, defence=d, press=p,
                    players=_squad(rng))
        for code, name, a, d, p in _TEAM_SPECS
    ]


LEAGUE = build_league()
TEAMS_BY_ID = {t.id: t for t in LEAGUE}
