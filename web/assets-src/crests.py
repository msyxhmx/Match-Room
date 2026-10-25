"""Crests for the eight fictional clubs in sim/teams.py, written to web/src/assets/crests/<ID>.svg.

Each crest is one flat silhouette in the club's primary colour (clubColours.ts), one white
symbol tied to the name, and one white initial. The silhouettes all differ, so the crests tell
apart in greyscale. Letters are outlined from Hanken Grotesk (SIL OFL 1.1,
https://github.com/google/fonts/tree/main/ofl/hankengrotesk), so the SVGs need no font.
The font file isn't committed; pass its path to re-run:

    python web/assets-src/crests.py path/to/HankenGrotesk[wght].ttf

Needs fonttools. Rules: 96-unit viewBox, no gradients, strokes >= 6 units (1.75 px at 28 px).
Nothing here may resemble a real club or league mark.
"""

import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

OUT = Path(__file__).resolve().parent.parent / "src" / "assets" / "crests"
W = "#FFFFFF"

PRIMARY = {  # keep equal to clubColours.ts
    "NGC": "#1D4ED8",
    "KST": "#8B1E3F",
    "RIV": "#0F766E",
    "HAR": "#A16207",
    "ELM": "#166534",
    "MIL": "#1C1917",
    "ASH": "#A21CAF",
    "QNB": "#4D7C0F",
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


class Letters:
    def __init__(self, path, weight=800):
        self.font = instantiateVariableFont(TTFont(path), {"wght": weight})
        self.glyphs = self.font.getGlyphSet()
        self.cmap = self.font.getBestCmap()
        self.cap = self.font["OS/2"].sCapHeight

    def path(self, ch, cx, baseline, cap_h):
        """SVG path for one capital, centred on cx, sitting on baseline, cap_h tall."""
        name = self.cmap[ord(ch)]
        g = self.glyphs[name]
        s = cap_h / self.cap
        bounds_pen = _Bounds()
        g.draw(bounds_pen)
        x0, x1 = bounds_pen.xmin, bounds_pen.xmax
        dx = cx - (x0 + x1) / 2 * s
        pen = SVGPathPen(self.glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
        g.draw(TransformPen(pen, (s, 0, 0, -s, dx, baseline)))
        return pen.getCommands()


class _Bounds:
    def __init__(self):
        self.xmin, self.xmax = 1e9, -1e9

    def _pt(self, *pts):
        for x, _ in pts:
            self.xmin, self.xmax = min(self.xmin, x), max(self.xmax, x)

    def moveTo(self, p):
        self._pt(p)

    def lineTo(self, p):
        self._pt(p)

    def curveTo(self, *p):
        self._pt(*p)

    def qCurveTo(self, *p):
        self._pt(*[q for q in p if q is not None])

    def closePath(self):
        pass

    def endPath(self):
        pass

    def addComponent(self, *a):
        pass


def stroke(d, w=7, cap="round", join="round"):
    return (
        f'<path d="{d}" fill="none" stroke="{W}" stroke-width="{w}" '
        f'stroke-linecap="{cap}" stroke-linejoin="{join}"/>'
    )


def fill(d):
    return f'<path d="{d}" fill="{W}"/>'


def wheel(cx, cy, r=13):
    """A mill wheel: rim, four spokes and a hub."""
    spokes = f"M{cx - r} {cy}H{cx + r}M{cx} {cy - r}V{cy + r}"
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="none" stroke="{W}" stroke-width="6"/>'
        + stroke(spokes, 5, "butt")
        + f'<circle cx="{cx}" cy="{cy}" r="5" fill="{W}"/>'
    )


def crests(L):
    c = {}
    # Northgate City: a heater shield; a north-pointing chevron (the gate's arch, facing north).
    c["NGC"] = (
        "M12 8H84V44C84 67 69 82 48 91C27 82 12 67 12 44Z",
        stroke("M29 39L48 21L67 39", 9, "butt", "miter") + fill(L.path("N", 48, 74, 24)),
    )
    # Kingston Vale: a roundel; a river running through the vale.
    c["KST"] = (
        "M48 3A45 45 0 1 1 47.99 3Z",
        fill(L.path("K", 48, 46, 25)) + stroke("M17 62q7.75 -8 15.5 0t15.5 0t15.5 0t15.5 0", 7),
    )
    # Riverside Rovers: a rounded square; a four-point compass star for the rovers.
    c["RIV"] = (
        "M30 7H66C79 7 89 17 89 30V66C89 79 79 89 66 89H30C17 89 7 79 7 66V30C7 17 17 7 30 7Z",
        fill("M48 13L53 29L69 34L53 39L48 55L43 39L27 34L43 29Z") + fill(L.path("R", 48, 80, 21)),
    )
    # Harbour Athletic: a flat-sided hexagon; an anchor.
    c["HAR"] = (
        "M27 8H69L91 48L69 88H27L5 48Z",
        stroke("M48 25V55M39 32H57", 6, "round")
        + stroke("M48 14.5a5 5 0 1 1 -0.01 0", 5)
        + stroke("M33 46Q35 58 48 58Q61 58 63 46", 6)
        + fill(L.path("H", 48, 80, 17)),
    )
    # Elmstead United: the silhouette is an elm leaf; a branching vein as the symbol.
    c["ELM"] = (
        "M48 3C78 18 90 40 86 62C82 79 66 90 48 93C30 90 14 79 10 62C6 40 18 18 48 3Z",
        stroke("M48 11V33M48 27L38 18M48 27L58 18", 6) + fill(L.path("E", 48, 72, 28)),
    )
    # Millbrook Town: a swallowtail banner; the mill wheel on the brook.
    c["MIL"] = ("M14 6H82V90L48 74L14 90Z", wheel(48, 28) + fill(L.path("M", 48, 68, 22)))
    # Ashford Albion: a diamond; three stepping stones across the ford.
    c["ASH"] = (
        "M48 1L95 48L48 95L1 48Z",
        fill(L.path("A", 48, 56, 28))
        + "".join(f'<circle cx="{x}" cy="68" r="4.5" fill="{W}"/>' for x in (36, 48, 60)),
    )
    # Queensbridge FC: an arched gateway; a bridge (deck and arch).
    c["QNB"] = (
        "M10 92V46A38 38 0 0 1 86 46V92Z",
        fill("M20 62H76V84H63A15 15 0 0 0 33 84H20Z") + fill(L.path("Q", 48, 52, 24)),
    )
    return c


def main():
    L = Letters(sys.argv[1])
    OUT.mkdir(parents=True, exist_ok=True)
    for cid, (shape, inner) in crests(L).items():
        svg = (
            f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" '
            f'aria-label="{NAMES[cid]} crest"><title>{NAMES[cid]}</title>'
            f'<path d="{shape}" fill="{PRIMARY[cid]}"/>{inner}</svg>\n'
        )
        (OUT / f"{cid}.svg").write_text(svg)
        print("wrote", cid)


if __name__ == "__main__":
    main()
