"""Crests for the eight fictional clubs in sim/teams.py, written to web/src/assets/crests/<ID>.svg.

Round 2 (25 Oct): a league set rather than one template. Each club differs on four axes:
container, colour use, type and emblem style (see SET below and DESIGN §9.11). What they share,
so they still read as one league: one typeface (Hanken Grotesk), flat fills, at most the club
primary plus white (plus the club's darker text colour), a 6-unit minimum stroke in a 96-unit
box (1.75 px at 28 px), and similar optical weight.

Letters are outlined from Hanken Grotesk (SIL OFL 1.1,
https://github.com/google/fonts/tree/main/ofl/hankengrotesk), so the SVGs need no font. The font
file isn't committed; pass its path to re-run:

    python web/assets-src/crests.py path/to/HankenGrotesk[wght].ttf

Needs fonttools and uharfbuzz. Also writes the sketch round to web/assets-src/sketches/.
Nothing here may resemble a real club or league mark (DESIGN §10).
"""

import math
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

HERE = Path(__file__).resolve().parent
OUT = HERE.parent / "src" / "assets" / "crests"
SKETCHES = HERE / "sketches"
W = "#FFFFFF"

# Keep equal to clubColours.ts: (primary, text).
COLOURS = {
    "NGC": ("#1D4ED8", "#1D4ED8"),
    "KST": ("#8B1E3F", "#8B1E3F"),
    "RIV": ("#0F766E", "#0F766E"),
    "HAR": ("#A16207", "#854D0E"),
    "ELM": ("#166534", "#166534"),
    "MIL": ("#1C1917", "#1C1917"),
    "ASH": ("#A21CAF", "#A21CAF"),
    "QNB": ("#4D7C0F", "#3F6212"),
}
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
# The design matrix, shown in the mockup: container, colour use, type, emblem style, story.
SET = {
    "NGC": (
        "heater shield",
        "solid field",
        "none",
        "geometric",
        "The north gate of the city: a gatehouse under a north star, its roof pointing north.",
    ),
    "KST": (
        "lettered roundel",
        "white field, claret ring",
        "full name on the ring",
        "pictorial",
        "A badge you could stitch: the vale between two hills, with the river running through.",
    ),
    "RIV": (
        "none (monogram)",
        "solid letter",
        "monogram",
        "geometric",
        "Just the R, with the river cut clean through it. Rovers don't need a frame.",
    ),
    "HAR": (
        "round-bottom shield",
        "split field (wavy)",
        "name on a scroll",
        "heraldic",
        "Old-school heraldry: the Quayside lighthouse above a wavy sea, and the name on a scroll.",
    ),
    "ELM": (
        "rounded square",
        "counterchanged diagonal",
        "none",
        "heraldic",
        "An elm leaf, counterchanged across a diagonal split: a heraldic trick, drawn flat.",
    ),
    "MIL": (
        "octagon",
        "solid field",
        "name in a band",
        "pictorial",
        "The mill wheel turning in the brook, with the town name set beneath like a sign.",
    ),
    "ASH": (
        "lozenge",
        "white field, magenta keyline",
        "none",
        "pictorial",
        "White for Albion, the old name for Britain's white cliffs; an ash sprig for Ashford.",
    ),
    "QNB": (
        "bridge silhouette",
        "solid with cut arches",
        "initials on the deck",
        "geometric",
        "The crest is the bridge: three arches at Bridge End, with QBFC carried on the deck.",
    ),
}


class Type:
    """Hanken Grotesk at one weight, shaped with HarfBuzz, drawn as SVG path data."""

    def __init__(self, path, weight=800):
        self.tt = instantiateVariableFont(TTFont(path), {"wght": weight})
        self.glyphs = self.tt.getGlyphSet()
        self.order = self.tt.getGlyphOrder()
        self.upem = self.tt["head"].unitsPerEm
        self.cap = self.tt["OS/2"].sCapHeight
        self.font = hb.Font(hb.Face(hb.Blob.from_file_path(path)))
        self.font.set_variations({"wght": weight})

    def _shape(self, text):
        buf = hb.Buffer()
        buf.add_str(text)
        buf.guess_segment_properties()
        hb.shape(self.font, buf, {"kern": True})
        return [
            (self.order[i.codepoint], p.x_advance)
            for i, p in zip(buf.glyph_infos, buf.glyph_positions, strict=True)
        ]

    def _pen(self):
        return SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))

    def line(self, text, cx, baseline, cap_h, tracking=0.0):
        """A centred line of capitals."""
        s = cap_h / self.cap
        glyphs = self._shape(text)
        total = sum(a for _, a in glyphs) + tracking * self.upem * (len(glyphs) - 1)
        x = cx / s - total / 2
        pen = self._pen()
        for name, adv in glyphs:
            self.glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x * s, baseline)))
            x += adv + tracking * self.upem
        return pen.getCommands()

    def arc(self, text, cx, cy, r, cap_h, top=True, tracking=0.1):
        """Capitals set round a circle. Top text reads clockwise with its baseline at radius r;
        bottom text reads left to right with its baseline at radius r and tops pointing in."""
        s = cap_h / self.cap
        glyphs = self._shape(text)
        advs = [a * s + tracking * cap_h / 0.7 for _, a in glyphs]
        total = sum(advs) - tracking * cap_h / 0.7
        pen = self._pen()
        pos = -total / 2
        for (name, a), adv in zip(glyphs, advs, strict=True):
            mid = pos + a * s / 2
            if top:
                phi = mid / r  # radians clockwise from the top
                rot = phi
            else:
                phi = math.pi - mid / r
                rot = phi - math.pi
            px, py = cx + r * math.sin(phi), cy - r * math.cos(phi)
            c, sn = math.cos(rot), math.sin(rot)
            # glyph space: x right, y up, origin at the glyph's baseline centre
            ox = -a / 2
            m = (s * c, s * sn, s * sn, -s * c, 0, 0)
            tx = px + m[0] * ox
            ty = py + m[1] * ox
            self.glyphs[name].draw(TransformPen(pen, (m[0], m[1], m[2], m[3], tx, ty)))
            pos += adv
        return pen.getCommands()


def p(d, fill, extra=""):
    return f'<path d="{d}" fill="{fill}"{extra}/>'


def st(d, colour, w=6, cap="round", join="round", extra=""):
    return (
        f'<path d="{d}" fill="none" stroke="{colour}" stroke-width="{w}" '
        f'stroke-linecap="{cap}" stroke-linejoin="{join}"{extra}/>'
    )


def star4(cx, cy, r, inner=0.32):
    pts = []
    for k in range(8):
        a = k * math.pi / 4
        rr = r if k % 2 == 0 else r * inner
        pts.append(f"{cx + rr * math.sin(a):.2f} {cy - rr * math.cos(a):.2f}")
    return "M" + "L".join(pts) + "Z"


def circle(cx, cy, r):
    return f"M{cx - r} {cy}a{r} {r} 0 1 0 {2 * r} 0a{r} {r} 0 1 0 {-2 * r} 0Z"


def wave(x0, x1, y, amp, n):
    """A smooth wave of n half-periods from x0 to x1."""
    step = (x1 - x0) / n
    d = f"M{x0} {y}"
    for i in range(n):
        sgn = -1 if i % 2 == 0 else 1
        d += f"q{step / 2:.2f} {sgn * amp * 2:.2f} {step:.2f} 0"
    return d


def turn(cx, cy, x, y, a):
    """Point (x, y) rotated by `a` radians about the origin, then moved to (cx, cy)."""
    return (
        f"{cx + x * math.cos(a) - y * math.sin(a):.2f} {cy + x * math.sin(a) + y * math.cos(a):.2f}"
    )


def elm_leaf(cx, cy, length, width, angle):
    """A serrated elm leaf with the lopsided base elms have, pointing at `angle` degrees."""
    pts_l, pts_r = [], []
    n = 22
    for i in range(n + 1):
        t = i / n
        y = length / 2 - length * t
        base = math.sin(math.pi * min(1, t**0.85)) ** 0.9
        tooth = 1.6 if (i % 2 == 0 and 0.12 < t < 0.92) else 0
        wl = (width / 2) * base + tooth
        wr = (width / 2) * (math.sin(math.pi * min(1, max(0, t - 0.08) / 0.92**1) ** 0.85) ** 0.9)
        wr = wr + tooth if t > 0.18 else wr
        pts_l.append((-wl, y))
        pts_r.append((wr, y))
    pts = [(0, length / 2 + 7)] + pts_l + pts_r[::-1][1:]
    a = math.radians(angle)
    out = []
    for x, y in pts:
        out.append(turn(cx, cy, x, y, a))
    return "M" + "L".join(out) + "Z"


def leaflet(x, y, angle, length, width):
    """A pointed lens leaflet from (x, y), pointing `angle` degrees from straight up."""
    a = math.radians(angle)

    def pt(u, v):
        return turn(x, y, u, -v, a)

    h = width / 2
    return (
        f"M{pt(0, 0)}C{pt(-h * 1.3, length * 0.3)} {pt(-h, length * 0.75)} {pt(0, length)}"
        f"C{pt(h, length * 0.75)} {pt(h * 1.3, length * 0.3)} {pt(0, 0)}Z"
    )


# ---------------------------------------------------------------- final crests


def ngc(t, c):
    blue = c[0]
    shield = "M10 6H86V42C86 66 70 82 48 92C26 82 10 66 10 42Z"
    # Gatehouse: two towers, a central gate with a pediment pointing north, an arched opening.
    gate = "M22 38H36V48L48 37L60 48V38H74V76H22ZM41 76V62A7 7 0 0 1 55 62V76Z"
    return p(shield, blue) + p(gate, W, ' fill-rule="evenodd"') + p(star4(48, 19, 9), W)


def kst(t, c):
    claret = c[0]
    ring = p(circle(48, 48, 46), claret)
    field = p(circle(48, 48, 32), W)
    clip = '<clipPath id="kst-in"><circle cx="48" cy="48" r="32"/></clipPath>'
    hills = "M10 42C28 44 38 56 48 58C58 56 68 44 86 42V90H10Z"
    river = wave(16, 80, 70, 2.4, 6)
    inner = f'<g clip-path="url(#kst-in)">{p(hills, claret)}{st(river, W, 6)}</g>'
    top = p(t.arc("KINGSTON VALE", 48, 48, 35.5, 7.6, top=True), W)
    bot = p(t.arc("VALE ROAD", 48, 48, 43, 7.6, top=False), W)
    dots = p(circle(9.5, 48, 2.2), W) + p(circle(86.5, 48, 2.2), W)
    return f"<defs>{clip}</defs>{ring}{field}{inner}{top}{bot}{dots}"


def riv(t, c):
    teal = c[0]
    r = t.line("R", 49, 89, 82)
    cut = wave(-4, 100, 54, 3.5, 5)
    mask = (
        '<mask id="riv-river" maskUnits="userSpaceOnUse" x="0" y="0" width="96" height="96">'
        '<rect width="96" height="96" fill="#fff"/>'
        f'<path d="{cut}" fill="none" stroke="#000" stroke-width="8"/></mask>'
    )
    return f'<defs>{mask}</defs><g mask="url(#riv-river)">{p(r, teal)}</g>'


def har(t, c):
    gold, dark = c
    shield = "M12 4H84V46C84 66 68 80 48 80C28 80 12 66 12 46Z"
    clip = f'<clipPath id="har-s"><path d="{shield}"/></clipPath>'
    sea_top = 50
    sea = f"{wave(4, 92, sea_top, 2.4, 6)}V96H4Z"
    bars = st(wave(4, 92, 61, 2.4, 6), gold, 6, "butt") + st(
        wave(4, 92, 72, 2.4, 6), gold, 6, "butt"
    )
    tower = "M42.5 50L44 27H52L53.5 50Z"
    lantern = "M42 17H54V25H42Z M41 17L48 11L55 17Z"
    beams = "M38 19L22 14V26Z M58 19L74 14V26Z"
    body = (
        f'<g clip-path="url(#har-s)"><path d="M0 0H96V96H0Z" fill="{gold}"/>'
        f"{p(sea, W)}{bars}</g>"
        f"{p(tower + lantern, W)}{p(beams, W)}"
        f'<path d="{shield}" fill="none" stroke="{gold}" stroke-width="5"/>'
    )
    scroll = "M4 80L12 76V92L4 88L8 84Z M92 80L84 76V92L92 88L88 84Z"  # tails
    band = "M11 74H85V93H11Z"
    name = t.line("HARBOUR", 48, 87.4, 8.6, tracking=0.08)
    return f"<defs>{clip}</defs>{body}{p(scroll, dark)}{p(band, dark)}{p(name, W)}"


def elm(t, c):
    green = c[0]
    box = "M26 5H70C82 5 91 14 91 26V70C91 82 82 91 70 91H26C14 91 5 82 5 70V26C5 14 14 5 26 5Z"
    upper = '<clipPath id="elm-a"><path d="M0 0H96V96Z"/></clipPath>'
    lower = '<clipPath id="elm-b"><path d="M0 0V96H96Z"/></clipPath>'
    leaf = elm_leaf(48, 48, 70, 42, 45)
    rib = "M26 70L66 30"
    return (
        f"<defs>{upper}{lower}</defs>"
        f"{p(box, W)}"
        f'<g clip-path="url(#elm-a)">{p(box, green)}{p(leaf, W)}{st(rib, green, 4.5, "butt")}</g>'
        f'<g clip-path="url(#elm-b)">{p(leaf, green)}{st(rib, W, 4.5, "butt")}</g>'
        f'<path d="{box}" fill="none" stroke="{green}" stroke-width="7"/>'
    )


def mil(t, c):
    ink = c[0]
    oct_pts = []
    for k in range(8):
        a = math.radians(22.5 + 45 * k)
        oct_pts.append(f"{48 + 47 * math.sin(a):.2f} {48 - 47 * math.cos(a):.2f}")
    octagon = "M" + "L".join(oct_pts) + "Z"
    cx, cy = 48, 50
    paddles = "".join(
        f'<rect x="{cx - 3.5}" y="{cy - 31}" width="7" height="13" fill="{W}" '
        f'transform="rotate({a} {cx} {cy})"/>'
        for a in (-72, -36, 0, 36, 72)
    )
    wheel = st(f"M{cx - 19} {cy}A19 19 0 0 1 {cx + 19} {cy}", W, 6, "butt") + p(
        circle(cx, cy, 6), W
    )
    water = st(wave(18, 78, 58, 2.2, 6), W, 6, "butt")
    name = t.line("MILLBROOK", 48, 80, 7.6, tracking=0.03)
    return p(octagon, ink) + paddles + wheel + water + p(name, W)


def ash(t, c):
    mag = c[0]
    lozenge = "M48 3L93 48L48 93L3 48Z"
    # An ash sprig: one stem, three pairs of narrow leaflets and a tip leaflet.
    keys = st("M48 80V26", mag, 5, "butt")
    for y in (40, 54, 68):
        for side in (-1, 1):
            keys += p(leaflet(48, y, side * 58, 23, 9), mag)
    keys += p(leaflet(48, 30, 0, 22, 9), mag)
    return (
        p(lozenge, W)
        + st(lozenge, mag, 8)
        + keys
    )


def qnb(t, c):
    olive = c[0]
    # Deck and parapet on top, three arches cut out underneath.
    outline = "M3 26H93V34H89V80H3V34H7Z"  # body; corners nudged so it reads as a structure
    body = "M3 24H93V82H3Z"
    arches = (
        "M33 82V66A15 15 0 0 1 63 66V82ZM10 82V68A9 9 0 0 1 28 68V82ZM68 82V68A9 9 0 0 1 86 68V82Z"
    )
    parapet = "".join(
        f'<rect x="{x}" y="14" width="7" height="10" fill="{olive}"/>' for x in (3, 86)
    )
    name = t.line("QBFC", 48, 44, 12, tracking=0.16)
    del outline
    del parapet
    return p(body + arches, olive, ' fill-rule="evenodd"') + p(name, W)


FINAL = {
    "NGC": ngc,
    "KST": kst,
    "RIV": riv,
    "HAR": har,
    "ELM": elm,
    "MIL": mil,
    "ASH": ash,
    "QNB": qnb,
}


# ---------------------------------------------------------------- sketch round (grey, low-fi)

G, G2 = "#8E8E93", "#D1D1D6"
SKETCH_NOTES = {
    "NGC-a": (
        "Gatehouse shield",
        "Picked. The gate and north star read as a building at 28 px; no other club uses it.",
    ),
    "NGC-b": (
        "N monogram with a north arrow",
        "Too close to RIV's monogram once both are letters.",
    ),
    "NGC-c": ("Compass roundel", "Dropped: a blue roundel drifts towards a real club's crest."),
    "KST-a": (
        "Lettered roundel, the vale inside",
        "Picked. The only white-field roundel; the hills still read at 28 px.",
    ),
    "KST-b": (
        "Shield with a wavy bend",
        "Claret plus a shield and stripes is too close to real clubs.",
    ),
    "KST-c": ("KV monogram", "Two letters blur at 28 px into one claret blob."),
}


def sketch_ngc_b(t):
    return p(t.line("N", 48, 84, 70), G) + p("M48 4L60 20H36Z", G)


def sketch_ngc_c(t):
    return p(circle(48, 48, 44), G) + p(star4(48, 48, 32, 0.25), W)


def sketch_kst_b(t):
    shield = "M12 6H84V44C84 66 68 82 48 90C28 82 12 66 12 44Z"
    return p(shield, G) + st("M14 30L82 70", W, 10, "butt") + p(t.line("K", 34, 70, 22), W)


def sketch_kst_c(t):
    return p(t.line("KV", 48, 70, 46, tracking=-0.06), G)


def grey(svg_inner):
    """Turn a final crest into a grey sketch by swapping every club colour for grey."""
    for prim, txt in COLOURS.values():
        svg_inner = svg_inner.replace(prim, G).replace(txt, G)
    return svg_inner


def svg(inner, title):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" '
        f'aria-label="{title}"><title>{title}</title>{inner}</svg>\n'
    )


def main():
    t = Type(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    SKETCHES.mkdir(parents=True, exist_ok=True)
    for cid, fn in FINAL.items():
        (OUT / f"{cid}.svg").write_text(svg(fn(t, COLOURS[cid]), f"{NAMES[cid]} crest"))
    sketches = {
        "NGC-a": grey(ngc(t, COLOURS["NGC"])),
        "NGC-b": sketch_ngc_b(t),
        "NGC-c": sketch_ngc_c(t),
        "KST-a": grey(kst(t, COLOURS["KST"]))
        .replace('id="kst-in"', 'id="kst-in-s"')
        .replace("url(#kst-in)", "url(#kst-in-s)"),
        "KST-b": sketch_kst_b(t),
        "KST-c": sketch_kst_c(t),
    }
    for sid, inner in sketches.items():
        (SKETCHES / f"{sid}.svg").write_text(svg(inner, SKETCH_NOTES[sid][0]))
    print("wrote", len(FINAL), "crests and", len(sketches), "sketches")


if __name__ == "__main__":
    main()
