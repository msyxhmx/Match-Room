# ruff: noqa: E501  (long option notes and SVG strings; this is a throwaway sketch round)
"""Crest round 3, sketch round: three rough options per club, labelled <ID>-1 to <ID>-3.

Rough on purpose: right structure, layers and emblem, not final drawing. Ilham picks one per
club, then the pick gets final art (a full crest and a 28 px badge). Stories: IDENTITY.md.

    python web/assets-src/crests/sketch.py path/to/Oswald[wght].ttf

Writes web/assets-src/crests/sketches/<ID>-<n>.svg in a 120-unit box. Needs fonttools and
uharfbuzz; reuses the Type helper from ../crests.py.
"""

import math
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from crests import Type, circle, elm_leaf, leaflet, star4, wave  # noqa: E402

OUT = Path(__file__).resolve().parent / "sketches"
W, GOLD, INK = "#FFFFFF", "#C9A13B", "#1D1D1F"
C = {
    "NGC": "#1D4ED8",
    "KST": "#8B1E3F",
    "RIV": "#0F766E",
    "HAR": "#A16207",
    "ELM": "#166534",
    "MIL": "#1C1917",
    "ASH": "#A21CAF",
    "QNB": "#4D7C0F",
}
T = None  # Type, set in main


def p(d, fill, extra=""):
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def st(d, colour, w, cap="round", extra=""):
    return (
        f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{w}" '
        f'stroke-linecap="{cap}" stroke-linejoin="round"{extra}/>'
    )


def g(inner, x, y, s=1.0, rot=0):
    return f'<g transform="translate({x} {y}) rotate({rot}) scale({s})">{inner}</g>'


def ring(cx, cy, r, colour, w):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{colour}" stroke-width="{w}"/>'


def text(s, cx, base, cap, fill, track=0.05):
    return p(T.line(s, cx, base, cap, tracking=track), fill)


def arc_text(s, cx, cy, r, cap, fill, top=True, track=0.12):
    return p(T.arc(s, cx, cy, r, cap, top=top, tracking=track), fill)


# ---------------------------------------------------------------- containers

HEATER = "M14 8H106V54C106 84 86 104 60 114C34 104 14 84 14 54Z"
IBERIAN = "M16 8H104V62A44 44 0 0 1 16 62Z"


def octagon(cx, cy, r):
    pts = [
        f"{cx + r * math.sin(math.radians(22.5 + 45 * k)):.2f} "
        f"{cy - r * math.cos(math.radians(22.5 + 45 * k)):.2f}"
        for k in range(8)
    ]
    return "M" + "L".join(pts) + "Z"


def ribbon(cx, y, half, h, fill, label, ink, cap=None, sag=180):
    """A scroll that sags in the middle, with folded tails, and its label set along it."""
    big_r = sag
    ccy = y - big_r
    th = half / big_r

    def pt(r, a):
        return f"{cx + r * math.sin(a):.2f} {ccy - r * math.cos(a):.2f}"

    ro, ri = big_r + h / 2, big_r - h / 2
    a0, a1 = math.pi + th, math.pi - th
    band = f"M{pt(ri, a0)}A{ri} {ri} 0 0 0 {pt(ri, a1)}L{pt(ro, a1)}A{ro} {ro} 0 0 1 {pt(ro, a0)}Z"
    # tails: a notched flag behind each end, a little lower
    tails = ""
    for side in (-1, 1):
        a = math.pi - side * th
        ex, ey = cx + big_r * math.sin(a), ccy - big_r * math.cos(a)
        dx = side * 12
        tails += p(
            f"M{ex - side * 2:.2f} {ey - h / 2 + 4:.2f}L{ex + dx:.2f} {ey - h / 2 + 4:.2f}"
            f"L{ex + dx - side * 5:.2f} {ey + 4:.2f}L{ex + dx:.2f} {ey + h / 2 + 4:.2f}"
            f"L{ex - side * 2:.2f} {ey + h / 2 + 4:.2f}Z",
            fill,
            ' opacity="0.78"',
        )
    cap = cap or h * 0.5
    lbl = arc_text(label, cx, ccy, big_r + cap / 2, cap, ink, top=False, track=0.1)
    return tails + p(band, fill) + lbl


# ---------------------------------------------------------------- emblems (local 0..100 box)


def gatehouse(fill, hole=None):
    d = "M14 30H32V44L50 28L68 44V30H86V90H14Z M40 90V66A10 10 0 0 1 60 66V90Z"
    return p(d, fill, ' fill-rule="evenodd"')


def heron(fill):
    body = (
        "M22 64C30 48 46 40 58 44C64 40 58 32 60 26C61 20 66 16 72 18L94 24L72 25"
        "C68 26 66 30 66 34C66 40 72 46 66 54C62 62 50 66 40 64Z"
    )
    legs = st("M44 62L43 94M51 62L53 94", fill, 3.4)
    return p(body, fill) + legs + p(circle(70, 21, 1.4), W if fill != W else INK)


def kingfisher(fill, eye=W):
    """A perched kingfisher: big head, dagger bill, plump body, short tail, on a reed."""
    head = circle(64, 30, 13)
    bill = "M74 25L102 32L74 37Z"
    body = "M52 34C68 40 71 62 59 76C51 85 40 85 36 79C30 66 38 44 52 34Z"
    tail = "M38 76L26 97L34 99L45 80Z"
    reed = st("M14 88L96 80", fill, 4)
    wing = st("M51 47C59 57 57 69 46 79", eye, 3)
    return p(head + bill + body + tail, fill) + wing + reed + p(circle(68, 27, 2.6), eye)


def anchor(fill, w=6):
    return (
        st("M50 21V82M34 31H66", fill, w, "butt")
        + ring(50, 14, 7, fill, w * 0.8)
        + st("M22 62Q26 86 50 86Q74 86 78 62", fill, w, "butt")
        + p("M14 66L22 54L30 66Z M70 66L78 54L86 66Z", fill)
    )


def lighthouse(fill, band):
    return (
        p("M38 92L43 34H57L62 92Z", fill)
        + p("M40.3 62H59.7L60.4 70H39.6Z M41.8 44H58.2L58.8 51H41.2Z", band)
        + p("M41 20H59V34H41Z", fill)
        + p("M38 20L50 9L62 20Z", fill)
        + p("M35 26L6 18V34Z M65 26L94 18V34Z", fill, ' opacity="0.55"')
    )


def waterwheel(fill, w=6):
    out = ring(50, 50, 32, fill, w) + p(circle(50, 50, 8), fill)
    for k in range(8):
        a = math.radians(k * 45)
        out += st(
            f"M{50 + 8 * math.sin(a):.1f} {50 - 8 * math.cos(a):.1f}"
            f"L{50 + 32 * math.sin(a):.1f} {50 - 32 * math.cos(a):.1f}",
            fill,
            3.5,
        )
    for k in range(16):
        out += (
            f'<rect x="47" y="4" width="6" height="13" fill="{fill}" '
            f'transform="rotate({k * 22.5} 50 50)"/>'
        )
    return out


def ash_sprig(fill):
    out = st("M50 94V22", fill, 4.5, "butt")
    for y in (40, 56, 72):
        for side in (-1, 1):
            out += p(leaflet(50, y, side * 58, 24, 9), fill)
    return out + p(leaflet(50, 26, 0, 22, 9), fill)


def cliffs(fill):
    return p("M0 74L14 40L30 46L46 26L64 36L80 30L100 44V74Z", fill)


def stones(fill):
    return "".join(
        f'<rect x="{x}" y="{44 + (i % 2) * 6}" width="16" height="10" rx="5" fill="{fill}"/>'
        for i, x in enumerate((8, 30, 54, 76))
    )


def bridge(fill):
    d = (
        "M0 38H100V86H0Z"
        "M38 86V70A12 12 0 0 1 62 70V86Z"
        "M8 86V74A9 9 0 0 1 26 74V86Z"
        "M74 86V74A9 9 0 0 1 92 74V86Z"
    )
    return p(d, fill, ' fill-rule="evenodd"') + p("M0 30H100V36H0Z", fill)


def crown(fill, jewel=None):
    d = "M10 44L6 12L28 28L50 4L72 28L94 12L90 44Z"
    out = p(d, fill) + p("M10 46H90V56H10Z", fill)
    for x, y in ((6, 10), (50, 2), (94, 10)):
        out += p(circle(x, y, 5), fill)
    if jewel:
        out += p(circle(50, 51, 3), jewel)
    return out


def valley(fill):
    return p("M0 40C20 44 38 60 50 62C62 60 80 44 100 40V100H0Z", fill)


# ---------------------------------------------------------------- the 24 sketches


def ngc_1():
    b = C["NGC"]
    return (
        p(circle(60, 60, 58), b)
        + p(circle(60, 60, 41), W)
        + ring(60, 60, 43.5, GOLD, 2.6)
        + arc_text("NORTHGATE CITY", 60, 60, 46.5, 9, W, top=True)
        + arc_text("FOOTBALL CLUB", 60, 60, 55, 8, W, top=False)
        + text("18", 9.5, 64, 7, GOLD, 0)
        + text("79", 110.5, 64, 7, GOLD, 0)
        + g(gatehouse(b), 30, 38, 0.6)
        + p(star4(60, 31, 8), GOLD)
    )


def ngc_2():
    b = C["NGC"]
    return (
        p(HEATER, b)
        + f'<path d="{HEATER}" fill="none" stroke="{GOLD}" stroke-width="3" transform="translate(60 60) scale(0.9) translate(-60 -60)"/>'
        + p("M21 15H99V35H21Z", W)
        + text("NORTHGATE", 60, 30.5, 11, b, 0.06)
        + p(star4(60, 47, 7), GOLD)
        + g(gatehouse(W), 33, 45, 0.54)
        + ribbon(60, 108, 46, 15, GOLD, "PORTA PATENS", INK, cap=7.5, sag=150)
    )


def ngc_3():
    b = C["NGC"]
    arch = "M16 112V52A44 44 0 0 1 104 52V112Z"
    return (
        p(arch, b)
        + f'<path d="M23 105V53A37 37 0 0 1 97 53V105Z" fill="none" stroke="{GOLD}" stroke-width="3"/>'
        + p(star4(60, 26, 10), GOLD)
        + text("NGC", 60, 66, 22, W, 0.12)
        + p("M30 76H90V80H30Z", W)
        + text("EST 1879", 60, 96, 9, W, 0.2)
    )


def kst_1():
    k = C["KST"]
    clip = f'<clipPath id="k1"><path d="{HEATER}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(HEATER, k)
        + f'<g clip-path="url(#k1)">{g(valley(W), 14, 34, 0.92)}'
        + st(wave(14, 106, 96, 2.2, 8), k, 4, "butt")
        + "</g>"
        + g(heron(W), 34, 18, 0.56)
        + f'<path d="{HEATER}" fill="none" stroke="{GOLD}" stroke-width="3.5"/>'
        + text("KINGSTON VALE", 60, 20, 9, W, 0.08)
        + ribbon(60, 112, 30, 13, GOLD, "EST 1894", INK, cap=7, sag=120)
    )


def kst_2():
    k = C["KST"]
    clip = '<clipPath id="k2"><circle cx="60" cy="60" r="40"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(circle(60, 60, 58), k)
        + p(circle(60, 60, 40), W)
        + arc_text("KINGSTON VALE", 60, 60, 46, 9, W, top=True)
        + arc_text("VALE ROAD", 60, 60, 54.5, 8, W, top=False)
        + text("18", 9, 64, 7, GOLD, 0)
        + text("94", 111, 64, 7, GOLD, 0)
        + f'<g clip-path="url(#k2)">{st(wave(18, 102, 88, 2, 8), k, 4, "butt")}'
        + st(wave(18, 102, 96, 2, 8), k, 4, "butt")
        + "</g>"
        + g(heron(k), 32, 24, 0.58)
    )


def kst_3():
    k = C["KST"]
    shield = IBERIAN
    clip = f'<clipPath id="k3"><path d="{shield}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(shield, W)
        + '<g clip-path="url(#k3)">'
        + p("M0 0H120V58C96 58 76 70 60 86C44 70 24 58 0 58Z", k)
        + st(wave(10, 110, 94, 2.2, 8), k, 4.5, "butt")
        + "</g>"
        + f'<path d="{shield}" fill="none" stroke="{k}" stroke-width="4"/>'
        + g(heron(W), 36, 22, 0.5)
        + ribbon(60, 14, 50, 13, GOLD, "KINGSTON VALE", INK, cap=7.5, sag=-160)
        + ribbon(60, 112, 50, 13, k, "PATIENCE AND PURPOSE", W, cap=6.5, sag=160)
    )


def riv_1():
    t = C["RIV"]
    return (
        g(kingfisher(t), 14, 2, 0.86)
        + st(wave(14, 106, 76, 2.4, 8), t, 4.5, "butt")
        + st(wave(24, 96, 84, 2.2, 6), GOLD, 3.5, "butt")
        + text("RIVERSIDE", 60, 103, 13, t, 0.06)
        + text("ROVERS · 1886", 60, 116, 7.5, INK, 0.16)
    )


def riv_2():
    t = C["RIV"]
    return (
        p(circle(60, 60, 58), t)
        + p(circle(60, 60, 40), W)
        + ring(60, 60, 42.5, GOLD, 2.4)
        + arc_text("RIVERSIDE ROVERS", 60, 60, 46, 8.6, W, top=True)
        + arc_text("RIVERSIDE PARK", 60, 60, 54.5, 7.5, W, top=False)
        + g(kingfisher(t), 26, 20, 0.66)
        + st(wave(30, 90, 84, 2, 6), t, 3.5, "butt")
    )


def riv_3():
    t = C["RIV"]
    r = p(T.line("R", 58, 112, 88), t)
    mask = (
        '<mask id="r3" maskUnits="userSpaceOnUse" x="0" y="0" width="120" height="120">'
        '<rect width="120" height="120" fill="#fff"/>'
        f'<path d="{wave(-4, 124, 74, 3.5, 6)}" fill="none" stroke="#000" stroke-width="9"/></mask>'
    )
    return (
        f"<defs>{mask}</defs>"
        + f'<g mask="url(#r3)">{r}</g>'
        + st(wave(-4, 124, 74, 3.5, 6), GOLD, 3, "butt")
        + g(kingfisher(INK), 58, -4, 0.44)
    )


def har_1():
    gold = C["HAR"]
    clip = f'<clipPath id="h1"><path d="{IBERIAN}"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + text("HARBOUR ATHLETIC", 60, 10, 8.5, INK, 0.1)
        + '<g transform="translate(10.8 14) scale(0.82)">'
        + p(IBERIAN, gold)
        + f'<g clip-path="url(#h1)">{p(wave(0, 120, 72, 2.4, 8) + "V130H0Z", W)}'
        + st(wave(0, 120, 86, 2.4, 8), gold, 4.5, "butt")
        + st(wave(0, 120, 98, 2.4, 8), gold, 4.5, "butt")
        + "</g>"
        + g(lighthouse(W, gold), 26, 10, 0.68)
        + g(anchor(INK, 7), 46, 76, 0.28)
        + f'<path d="{IBERIAN}" fill="none" stroke="{INK}" stroke-width="3"/>'
        + "</g>"
        + ribbon(60, 112, 50, 13, INK, "LUX IN TEMPESTATE", W, cap=6.5, sag=170)
    )


def har_2():
    gold = C["HAR"]
    return (
        p(circle(60, 60, 58), gold)
        + p(circle(60, 60, 41), W)
        + ring(60, 60, 43.5, INK, 2.4)
        + arc_text("HARBOUR ATHLETIC", 60, 60, 46.5, 8.6, W, top=True)
        + arc_text("THE QUAYSIDE", 60, 60, 54.5, 7.5, W, top=False)
        + g(anchor(gold, 7), 32, 30, 0.56)
        + g(lighthouse(INK, W), 46, 26, 0.3)
    )


def har_3():
    gold = C["HAR"]
    return (
        p("M10 10H110V30H10Z", INK)
        + text("HARBOUR", 60, 27, 13, W, 0.1)
        + p("M10 34H110V84L60 114L10 84Z", gold)
        + g(lighthouse(W, gold), 30, 34, 0.6)
        + text("1883", 60, 104, 8, INK, 0.2)
    )


def elm_1():
    e = C["ELM"]
    o = octagon(60, 60, 58)
    up = '<clipPath id="e1a"><path d="M0 0H120V120Z"/></clipPath>'
    lo = '<clipPath id="e1b"><path d="M0 0V120H120Z"/></clipPath>'
    leaf = elm_leaf(60, 64, 60, 36, 45)
    return (
        f"<defs>{up}{lo}</defs>"
        + p(o, e)
        + f'<path d="{octagon(60, 60, 50)}" fill="none" stroke="{GOLD}" stroke-width="3"/>'
        + text("ELMSTEAD", 60, 34, 11, W, 0.1)
        + f'<g clip-path="url(#e1a)">{p(leaf, W)}</g>'
        + f'<g clip-path="url(#e1b)">{p(leaf, GOLD)}</g>'
        + text("UNITED 1902", 60, 104, 7.5, W, 0.16)
    )


def elm_2():
    e = C["ELM"]
    return (
        p(HEATER, e)
        + p("M14 8H106V30H14Z", W)
        + text("ELMSTEAD UTD", 60, 25, 10, e, 0.06)
        + p(elm_leaf(60, 64, 58, 34, 0), W)
        + st("M60 92V40", e, 3, "butt")
        + ribbon(60, 112, 40, 13, GOLD, "TWO FIELDS ONE CLUB", INK, cap=6, sag=150)
    )


def elm_3():
    e = C["ELM"]
    return (
        p(circle(60, 60, 58), e)
        + p(circle(60, 60, 40), W)
        + arc_text("ELMSTEAD UNITED", 60, 60, 46, 9, W, top=True)
        + arc_text("ELMSTEAD LANE", 60, 60, 54.5, 7.5, W, top=False)
        + p(elm_leaf(60, 60, 56, 32, 35), e)
        + text("19", 10, 64, 7, GOLD, 0)
        + text("02", 110, 64, 7, GOLD, 0)
    )


def mil_1():
    m = C["MIL"]
    return (
        arc_text("MILLBROOK", 60, 74, 50, 15, m, top=True, track=0.06)
        + g(waterwheel(m), 34, 44, 0.52)
        + st(wave(14, 106, 92, 2.2, 8), m, 4.5, "butt")
        + p("M24 100H96V116H24Z", m)
        + text("TOWN · 1888", 60, 112, 9, GOLD, 0.16)
    )


def mil_2():
    m = C["MIL"]
    return (
        p(octagon(60, 60, 58), m)
        + f'<path d="{octagon(60, 60, 51)}" fill="none" stroke="{GOLD}" stroke-width="3"/>'
        + text("MILLBROOK", 60, 30, 10, W, 0.1)
        + g(waterwheel(W), 37, 37, 0.46)
        + st(wave(22, 98, 90, 2, 6), W, 4, "butt")
        + text("TOWN FC", 60, 106, 7.5, GOLD, 0.2)
    )


def mil_3():
    m = C["MIL"]
    return (
        p(HEATER, m)
        + g(waterwheel(W), 28, 18, 0.64)
        + p("M14 70H106V84H14Z", m)
        + st(wave(16, 104, 77, 2.2, 8), GOLD, 4, "butt")
        + ribbon(60, 110, 44, 13, GOLD, "TURN AND TURN AGAIN", INK, cap=6, sag=150)
    )


def ash_1():
    a = C["ASH"]
    sh = HEATER
    clip = f'<clipPath id="a1"><path d="{sh}"/></clipPath>'
    q = (
        p("M0 0H60V58H0Z", W)
        + p("M60 0H120V58H60Z", a)
        + p("M0 58H60V120H0Z", a)
        + p("M60 58H120V120H60Z", W)
    )
    return (
        f"<defs>{clip}</defs>"
        + f'<g clip-path="url(#a1)">{q}'
        + g(ash_sprig(a), 20, 12, 0.42)
        + g(cliffs(W), 66, 14, 0.44)
        + g(stones(W), 18, 50, 0.4)
        + text("1890", 82, 86, 10, a, 0.04)
        + "</g>"
        + f'<path d="{sh}" fill="none" stroke="{a}" stroke-width="4"/>'
        + st("M60 8V112M14 58H106", INK, 2.5, "butt")
        + ribbon(60, 112, 46, 13, INK, "ASHFORD ALBION", W, cap=7, sag=150)
    )


def ash_2():
    a = C["ASH"]
    loz = "M60 4L116 60L60 116L4 60Z"
    return (
        p(loz, W)
        + f'<path d="{loz}" fill="none" stroke="{a}" stroke-width="8" stroke-linejoin="round"/>'
        + g(ash_sprig(a), 36, 20, 0.48)
        + ribbon(60, 88, 40, 13, a, "ALBION", W, cap=7, sag=150)
    )


def ash_3():
    a = C["ASH"]
    clip = '<clipPath id="a3"><circle cx="60" cy="60" r="40"/></clipPath>'
    return (
        f"<defs>{clip}</defs>"
        + p(circle(60, 60, 58), a)
        + p(circle(60, 60, 40), W)
        + arc_text("ASHFORD ALBION", 60, 60, 46, 9, W, top=True)
        + arc_text("EST 1890", 60, 60, 54.5, 7.5, W, top=False)
        + f'<g clip-path="url(#a3)">{g(cliffs(a), 20, 58, 0.8)}</g>'
        + g(ash_sprig(a), 44, 18, 0.32)
    )


def qnb_1():
    q = C["QNB"]
    return (
        p(circle(60, 66, 52), q)
        + p(circle(60, 66, 36), W)
        + arc_text("QUEENSBRIDGE", 60, 66, 49, 8.2, W, top=False)
        + text("18", 15, 70, 7, GOLD, 0)
        + text("97", 105, 70, 7, GOLD, 0)
        + g(bridge(q), 32, 50, 0.56)
        + st(wave(30, 90, 84, 1.6, 6), q, 3, "butt")
        + g(crown(GOLD), 36, 0, 0.48)
    )


def qnb_2():
    q = C["QNB"]
    return (
        g(crown(GOLD), 34, 2, 0.52)
        + g(bridge(q), 12, 26, 0.96)
        + text("QBFC", 60, 74, 11, W, 0.16)
        + text("EST 1897", 60, 119, 7.5, q, 0.2)
    )


def qnb_3():
    q = C["QNB"]
    return (
        p(HEATER, q)
        + p("M14 8H106V36H14Z", GOLD)
        + g(crown(q), 42, 11, 0.36)
        + g(bridge(W), 24, 34, 0.72)
        + st(wave(24, 96, 98, 2, 6), W, 4, "butt")
        + ribbon(60, 112, 44, 13, GOLD, "OVER AND ONWARD", INK, cap=6.5, sag=150)
    )


SKETCHES = {
    "NGC": [
        (
            ngc_1,
            "Modern roundel",
            "Name round the ring, gold keyline, gatehouse and north star inside. Closest to a blue city roundel, so the gatehouse has to carry it.",
        ),
        (
            ngc_2,
            "Classic shield",
            "NORTHGATE in a white chief, white gatehouse, motto scroll. The most traditional option.",
        ),
        (
            ngc_3,
            "Gate-shaped badge",
            "The crest outline is the gate's own arch: star at the keystone, NGC across it. The most modern option.",
        ),
    ],
    "KST": [
        (
            kst_1,
            "Classic shield",
            "The heron stands in the vale, the river runs at the bottom, and a gold year scroll sits underneath. Watch: claret shields are common in the real league, so the heron has to stay big.",
        ),
        (
            kst_2,
            "Roundel",
            "Claret ring with the name and Vale Road; heron and river on white inside.",
        ),
        (
            kst_3,
            "Ornate heraldic",
            "Name ribbon above, heron on a claret field cut into a valley, motto scroll below.",
        ),
    ],
    "RIV": [
        (
            riv_1,
            "Freeform emblem",
            "A kingfisher on a reed over the river, with the name set below it. No frame. Watch: bird-over-wordmark is a familiar real structure, so the reed and river must stay.",
        ),
        (riv_2, "Roundel", "The kingfisher inside a lettered ring."),
        (riv_3, "Monogram", "Round 2's river-cut R, with a kingfisher perched on it."),
    ],
    "HAR": [
        (
            har_1,
            "Modern heraldic",
            "Name arched above; lighthouse over a wavy sea, anchor in the water, motto scroll below.",
        ),
        (
            har_2,
            "Roundel",
            "Gold ring with the name and The Quayside; anchor and lighthouse inside.",
        ),
        (
            har_3,
            "Wordmark-led",
            "HARBOUR in an ink bar over a gold pennant shield with the lighthouse.",
        ),
    ],
    "ELM": [
        (
            elm_1,
            "Geometric octagon",
            "Gold keyline, the elm leaf split in two colours for the two villages, name and year.",
        ),
        (elm_2, "Classic shield", "White chief with the name, one white leaf, motto scroll."),
        (elm_3, "Roundel", "Name ring, single green leaf on white."),
    ],
    "MIL": [
        (
            mil_1,
            "Wordmark-led",
            "MILLBROOK arched over the waterwheel and brook, TOWN · 1888 in a bar like a mill sign.",
        ),
        (
            mil_2,
            "Geometric octagon",
            "Waterwheel and brook inside a black octagon with a gold keyline.",
        ),
        (mil_3, "Classic shield", "Waterwheel over a gold brook, motto scroll."),
    ],
    "ASH": [
        (
            ash_1,
            "Quartered shield",
            "Four quarters from the town arms: ash sprig, white cliffs, the ford's stones, the year.",
        ),
        (ash_2, "Lozenge", "Round 2's white lozenge and ash sprig, with an ALBION ribbon."),
        (ash_3, "Roundel", "White cliffs and an ash sprig inside a lettered ring."),
    ],
    "QNB": [
        (
            qnb_1,
            "Crowned roundel",
            "Lettered ring with the bridge inside, and a gold crown breaking the top of the circle.",
        ),
        (qnb_2, "Freeform bridge", "The bridge itself with QBFC on the deck, under a gold crown."),
        (qnb_3, "Classic shield", "Gold chief with a crown, white bridge over the river."),
    ],
}


def main():
    global T
    T = Type(sys.argv[1], weight=600)
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, opts in SKETCHES.items():
        for n, (fn, name, _) in enumerate(opts, 1):
            svg = (
                f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120" role="img" '
                f'aria-label="{cid}-{n} {name}"><title>{cid}-{n}: {name}</title>{fn()}</svg>\n'
            )
            (OUT / f"{cid}-{n}.svg").write_text(svg)
    print("wrote", sum(len(v) for v in SKETCHES.values()), "sketches")


if __name__ == "__main__":
    main()
