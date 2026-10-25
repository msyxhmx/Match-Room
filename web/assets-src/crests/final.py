# ruff: noqa: E501  (SVG path strings)
"""Crest round 3, final art for Ilham's picks (25 Oct): NGC-2, KST-1, RIV-2, HAR-1, ELM-3, MIL-1,
ASH-1, QNB-3. Stories: IDENTITY.md.

Two files per club, both in a 120-unit box:
- web/src/assets/crests/<ID>.svg: the full crest, with every layer (name, year, motto). For the
  video, the end card and the thumbnail: 96 px and up.
- web/src/assets/crests/<ID>-badge.svg: a simple badge for 28 px (the phone, the score bug).
  Same container and emblem, no lettering, nothing thinner than 7.5 units (1.75 px at 28 px).

Lettering is Oswald (SIL OFL 1.1), outlined, so no font is needed. The font file isn't
committed; pass its path:

    python web/assets-src/crests/final.py path/to/Oswald[wght].ttf

Drawing helpers come from sketch.py, the round that Ilham picked from.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
import sketch  # noqa: E402
from crests import Type, circle, elm_leaf, star4, wave  # noqa: E402
from sketch import (  # noqa: E402
    GOLD,
    HEATER,
    IBERIAN,
    INK,
    W,
    anchor,
    arc_text,
    ash_sprig,
    cliffs,
    crown,
    g,
    gatehouse,
    heron,
    kingfisher,
    lighthouse,
    p,
    ribbon,
    ring,
    st,
    stones,
    text,
    valley,
    waterwheel,
)

OUT = Path(__file__).resolve().parents[2] / "src" / "assets" / "crests"
C = sketch.C
NAMES = {
    "NGC": "Northgate City",
    "KST": "Kingston Vale",
    "RIV": "Riverside Rovers",
    "HAR": "Harbour Athletic",
    "ELM": "Elmstead United",
    "MIL": "Millbrook Town",
    "ASH": "Ashford Albion",
    "QNB": "Queensbridge FC",
}
# Shield outlines. Four of the eight picks are shields, so each gets its own top edge.
ARCHED = "M14 16Q60 2 106 16V56C106 85 86 104 60 114C34 104 14 85 14 56Z"  # KST
FLAT = HEATER  # NGC, ASH
SHOULDER = "M14 8H44L60 2L76 8H106V54C106 84 86 104 60 114C34 104 14 84 14 54Z"  # QNB


def inset(d, colour, w, s=0.9):
    """A keyline: the same outline, scaled in about the centre."""
    return (
        f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{w}" '
        f'transform="translate(60 58) scale({s}) translate(-60 -58)"/>'
    )


def span(fill):
    """A slim three-arch stone bridge in a 100-wide box: deck rail, parapet, big arches."""
    d = (
        "M0 40H100V74H0Z"
        "M8 74V66A10 10 0 0 1 28 66V74Z"
        "M34 74V62A16 16 0 0 1 66 62V74Z"
        "M72 74V66A10 10 0 0 1 92 66V74Z"
    )
    return p(d, fill, ' fill-rule="evenodd"') + p("M0 32H100V36H0Z", fill)


def windows(colour):
    return p("M20.5 41H25.5V50H20.5Z M74.5 41H79.5V50H74.5Z", colour)


# ---------------------------------------------------------------- NGC-2 · classic shield


def ngc_full():
    b = C["NGC"]
    gate = gatehouse(W) + windows(b) + p("M41 90V67A9 9 0 0 1 59 67V90Z", GOLD)
    return (
        p(FLAT, b)
        + inset(FLAT, GOLD, 3, 0.9)
        + p("M21 14H99V35H21Z", W)
        + text("NORTHGATE", 60, 30.5, 11, b, 0.08)
        + p(star4(60, 46, 7.5), GOLD)
        + text("18", 31, 50, 7, GOLD, 0)
        + text("79", 89, 50, 7, GOLD, 0)
        + g(gate, 31, 44, 0.58)
        + ribbon(60, 108, 46, 15, GOLD, "PORTA PATENS", INK, cap=7.5, sag=150)
    )


def ngc_badge():
    b = C["NGC"]
    return (
        p(FLAT, b)
        + p("M14 8H106V30H14Z", W)
        + p(star4(60, 19, 8, 0.4), b)
        + g(gatehouse(W), 22, 26, 0.76)
    )


# ---------------------------------------------------------------- KST-1 · classic shield


def kst_full():
    k = C["KST"]
    clip = f'<clipPath id="kf"><path d="{ARCHED}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(ARCHED, k)
        + '<g clip-path="url(#kf)">'
        + g(valley(W), 14, 36, 0.92)
        + st(wave(14, 106, 94, 2.2, 8), k, 4, "butt")
        + st(wave(24, 96, 103, 2, 6), k, 3.5, "butt")
        + "</g>"
        + g(heron(W), 32, 20, 0.6)
        + inset(ARCHED, GOLD, 3.5, 0.92)
        + text("KINGSTON VALE", 60, 24, 8.6, W, 0.08)
        + ribbon(60, 112, 30, 13, GOLD, "EST 1894", INK, cap=7, sag=120)
    )


def kst_badge():
    k = C["KST"]
    clip = f'<clipPath id="kb"><path d="{ARCHED}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(ARCHED, k)
        + f'<g clip-path="url(#kb)">{g(valley(W), 14, 44, 0.92)}</g>'
        + g(heron(W), 22, 10, 0.78)
    )


# ---------------------------------------------------------------- RIV-2 · roundel


def riv_full():
    t = C["RIV"]
    return (
        p(circle(60, 60, 58), t)
        + p(circle(60, 60, 40), W)
        + ring(60, 60, 42.5, GOLD, 2.4)
        + arc_text("RIVERSIDE ROVERS", 60, 60, 46, 8.6, W, top=True)
        + arc_text("RIVERSIDE PARK", 60, 60, 54.5, 7.5, W, top=False)
        + text("18", 9.5, 64, 7, GOLD, 0)
        + text("86", 110.5, 64, 7, GOLD, 0)
        + g(kingfisher(t), 26, 20, 0.66)
        + st(wave(30, 90, 86, 2, 6), GOLD, 3.5, "butt")
    )


def riv_badge():
    t = C["RIV"]
    return p(circle(60, 60, 58), t) + g(kingfisher(W, t), 10, 6, 0.98)


# ---------------------------------------------------------------- HAR-1 · modern heraldic


def har_full():
    gold = C["HAR"]
    clip = f'<clipPath id="hf"><path d="{IBERIAN}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + text("HARBOUR ATHLETIC", 60, 10, 8.5, INK, 0.1)
        + '<g transform="translate(10.8 14) scale(0.82)">'
        + p(IBERIAN, gold)
        + f'<g clip-path="url(#hf)">{p(wave(0, 120, 72, 2.4, 8) + "V130H0Z", W)}'
        + st(wave(0, 120, 86, 2.4, 8), gold, 4.5, "butt")
        + st(wave(0, 120, 98, 2.4, 8), gold, 4.5, "butt")
        + "</g>"
        + g(lighthouse(W, gold), 26, 10, 0.68)
        + g(anchor(INK, 7), 46, 76, 0.28)
        + f'<path d="{IBERIAN}" fill="none" stroke="{INK}" stroke-width="3"/>'
        + "</g>"
        + ribbon(60, 112, 50, 13, INK, "LUX IN TEMPESTATE", W, cap=6.5, sag=170)
    )


def har_badge():
    gold = C["HAR"]
    clip = f'<clipPath id="hb"><path d="{IBERIAN}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(IBERIAN, gold)
        + f'<g clip-path="url(#hb)">{p(wave(0, 120, 80, 3, 6) + "V130H0Z", W)}</g>'
        + p("M50 82L54 30H66L70 82Z M51 14H69V28H51Z M49 14L60 4L71 14Z", W)
        + f'<path d="{IBERIAN}" fill="none" stroke="{INK}" stroke-width="4"/>'
    )


# ---------------------------------------------------------------- ELM-3 · roundel


def elm_full():
    """Inverted against RIV's roundel (white ring, green centre), so the two differ in grey."""
    e = C["ELM"]
    leaf = elm_leaf(60, 62, 58, 34, 35)
    return (
        p(circle(60, 60, 58), W)
        + ring(60, 60, 56, e, 4)
        + p(circle(60, 60, 40), e)
        + ring(60, 60, 36.5, GOLD, 2.4)
        + arc_text("ELMSTEAD UNITED", 60, 60, 44.5, 9, e, top=True)
        + arc_text("ELMSTEAD LANE", 60, 60, 53, 7.5, e, top=False)
        + p(leaf, W)
        + st("M45 84L75 42", e, 3, "butt")
        + st("M53 73L45 66M59 64L50 56M65 56L58 49M57 72L66 74M63 63L72 65", e, 2.2, "butt")
        + text("19", 11, 64, 7, e, 0)
        + text("02", 109, 64, 7, e, 0)
    )


def elm_badge():
    e = C["ELM"]
    return (
        p(circle(60, 60, 58), W)
        + ring(60, 60, 52, e, 12)
        + p(elm_leaf(60, 63, 66, 40, 35), e)
        + st("M44 88L77 40", W, 5, "butt")
    )


# ---------------------------------------------------------------- MIL-1 · wordmark-led


def mil_full():
    m = C["MIL"]
    return (
        arc_text("MILLBROOK", 60, 74, 50, 15, m, top=True, track=0.06)
        + g(waterwheel(m), 34, 44, 0.52)
        + st(wave(14, 106, 92, 2.2, 8), m, 4.5, "butt")
        + p("M24 100H96V116H24Z", m)
        + text("TOWN · 1888", 60, 112, 9, GOLD, 0.16)
    )


def mil_badge():
    m = C["MIL"]
    wheel = (
        ring(60, 50, 26, W, 8)
        + p(circle(60, 50, 8), W)
        + st("M60 24V76M34 50H86M42 32L78 68M78 32L42 68", W, 5, "butt")
    )
    return (
        p(
            "M20 6H100C108 6 114 12 114 20V100C114 108 108 114 100 114H20C12 114 6 108 6 100V20C6 12 12 6 20 6Z",
            m,
        )
        + wheel
        + st(wave(14, 106, 92, 3, 6), W, 8, "butt")
    )


# ---------------------------------------------------------------- ASH-1 · quartered shield


def ash_full():
    a = C["ASH"]
    clip = f'<clipPath id="af"><path d="{FLAT}"/></clipPath>'
    q = (
        p("M0 0H60V58H0Z", W)
        + p("M60 0H120V58H60Z", a)
        + p("M0 58H60V120H0Z", a)
        + p("M60 58H120V120H60Z", W)
    )
    return (
        f"<defs>{clip}</defs>"
        + f'<g clip-path="url(#af)">{q}'
        + g(ash_sprig(a), 20, 12, 0.42)
        + g(cliffs(W), 66, 14, 0.44)
        + g(stones(W), 18, 50, 0.4)
        + text("1890", 82, 86, 10, a, 0.04)
        + "</g>"
        + f'<path d="{FLAT}" fill="none" stroke="{a}" stroke-width="4"/>'
        + st("M60 8V112M14 58H106", INK, 2.5, "butt")
        + ribbon(60, 112, 46, 13, INK, "ASHFORD ALBION", W, cap=7, sag=150)
    )


def ash_badge():
    a = C["ASH"]
    clip = f'<clipPath id="ab"><path d="{FLAT}"/></clipPath>'
    q = (
        p("M0 0H60V58H0Z", W)
        + p("M60 0H120V58H60Z", a)
        + p("M0 58H60V120H0Z", a)
        + p("M60 58H120V120H60Z", W)
    )
    return (
        f"<defs>{clip}</defs>"
        + f'<g clip-path="url(#ab)">{q}</g>'
        + p(sketch.leaflet(37, 52, 0, 40, 16), a)
        + p("M64 50L74 22L86 32L96 14L106 26V50Z", W)
        + f'<path d="{FLAT}" fill="none" stroke="{a}" stroke-width="8"/>'
    )


# ---------------------------------------------------------------- QNB-3 · classic shield


def qnb_full():
    q = C["QNB"]
    clip = f'<clipPath id="qf"><path d="{SHOULDER}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(SHOULDER, q)
        + f'<g clip-path="url(#qf)">{p("M0 0H120V36H0Z", GOLD)}</g>'
        + g(crown(q), 42, 11, 0.36)
        + g(span(W), 22, 30, 0.76)
        + st(wave(26, 94, 92, 2, 6), W, 4, "butt")
        + ribbon(60, 112, 44, 13, GOLD, "OVER AND ONWARD", INK, cap=6.5, sag=150)
    )


def qnb_badge():
    q = C["QNB"]
    clip = f'<clipPath id="qb"><path d="{SHOULDER}"/></clipPath>'
    span = p("M18 46H102V90H18Z M42 90V76A18 18 0 0 1 78 76V90Z", W, ' fill-rule="evenodd"')
    return (
        f"<defs>{clip}</defs>"
        + p(SHOULDER, q)
        + f'<g clip-path="url(#qb)">{p("M0 0H120V34H0Z", GOLD)}</g>'
        + span
    )


FINAL = {
    "NGC": (ngc_full, ngc_badge),
    "KST": (kst_full, kst_badge),
    "RIV": (riv_full, riv_badge),
    "HAR": (har_full, har_badge),
    "ELM": (elm_full, elm_badge),
    "MIL": (mil_full, mil_badge),
    "ASH": (ash_full, ash_badge),
    "QNB": (qnb_full, qnb_badge),
}


def svg(inner, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" '
        f'aria-label="{title}"><title>{title}</title>{inner}</svg>\n'
    )


def main():
    sketch.T = Type(sys.argv[1], weight=600)
    OUT.mkdir(parents=True, exist_ok=True)
    only = sys.argv[2:] or list(FINAL)
    for cid in only:
        full, badge = FINAL[cid]
        (OUT / f"{cid}.svg").write_text(svg(full(), f"{NAMES[cid]} crest"))
        (OUT / f"{cid}-badge.svg").write_text(svg(badge(), f"{NAMES[cid]} badge"))
    print("wrote", ", ".join(only))


if __name__ == "__main__":
    main()
