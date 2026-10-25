"""Match-Room Live wordmark and app mark, written as outlined SVG (no font needed).

- web/src/assets/brand/mark.svg: the "match clock". A ring, a kick-off tick at the top, the
  match so far in Northgate Blue, and a pin at 74' like the timeline's moment pins.
- web/src/assets/brand/wordmark.svg: the mark plus "Match-Room Live".
- web/public/favicon.svg: the mark.

Letters come from Hanken Grotesk (SIL OFL 1.1, https://github.com/google/fonts/tree/main/ofl/hankengrotesk),
shaped with HarfBuzz so kerning is right. The font file isn't committed; pass its path:

    python web/assets-src/brand.py path/to/HankenGrotesk[wght].ttf

Needs fonttools and uharfbuzz. PNGs (favicon, end card, thumbnail) come from render.sh.
"""

import math
import sys
from pathlib import Path

import uharfbuzz as hb
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont
from fontTools.varLib.instancer import instantiateVariableFont

WEB = Path(__file__).resolve().parent.parent
BRAND = WEB / "src" / "assets" / "brand"

INK = "#1D1D1F"
BLUE = "#1D4ED8"
TRACK = "#D1D1D6"
MINUTE = 74


def mark(cx=32, cy=32, r=27, w=6):
    """The match clock in a 64-unit box: an ink ring, a kick-off tick at the top, the match so
    far as a blue sector, and a pin on the ring at 74'. Returns SVG elements."""
    a = math.radians(MINUTE / 90 * 360)  # clockwise from the top
    large = 1 if MINUTE > 45 else 0
    ri = r - w / 2 - 3.5  # sector radius, leaving a white gap inside the ring
    sx, sy = cx + ri * math.sin(a), cy - ri * math.cos(a)
    px, py = cx + r * math.sin(a), cy - r * math.cos(a)
    return (
        f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="#FFFFFF" stroke="{INK}" stroke-width="{w}"/>'
        f'<path d="M{cx} {cy}V{cy - ri}A{ri} {ri} 0 {large} 1 {sx:.2f} {sy:.2f}Z" fill="{BLUE}"/>'
        f'<rect x="{cx - 2.5}" y="{cy - r - w / 2}" width="5" height="{r * 0.42:.1f}" '
        f'fill="{INK}"/>'
        f'<circle cx="{px:.2f}" cy="{py:.2f}" r="6.5" fill="{BLUE}" '
        f'stroke="#FFFFFF" stroke-width="3"/>'
    )


def shaped_path(font_path, text, weight, size, x0, baseline, tracking=0.0):
    """Outline `text` with HarfBuzz shaping. Returns (svg path d, advance width)."""
    tt = instantiateVariableFont(TTFont(font_path), {"wght": weight})
    glyphs = tt.getGlyphSet()
    order = tt.getGlyphOrder()
    blob = hb.Blob.from_file_path(font_path)
    face = hb.Face(blob)
    font = hb.Font(face)
    font.set_variations({"wght": weight})
    buf = hb.Buffer()
    buf.add_str(text)
    buf.guess_segment_properties()
    hb.shape(font, buf, {"kern": True, "liga": True})
    upem = tt["head"].unitsPerEm
    s = size / upem
    pen = SVGPathPen(glyphs, ntos=lambda v: f"{v:.2f}".rstrip("0").rstrip("."))
    x = 0.0
    for info, pos in zip(buf.glyph_infos, buf.glyph_positions, strict=True):
        name = order[info.codepoint]
        glyphs[name].draw(TransformPen(pen, (s, 0, 0, -s, x0 + (x + pos.x_offset) * s, baseline)))
        x += pos.x_advance + tracking * upem
    return pen.getCommands(), x * s


def main():
    font = sys.argv[1]
    BRAND.mkdir(parents=True, exist_ok=True)
    m = mark()
    mark_svg = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" '
        f'aria-label="Match-Room Live"><title>Match-Room Live</title>{m}</svg>\n'
    )
    (BRAND / "mark.svg").write_text(mark_svg)
    (WEB / "public" / "favicon.svg").write_text(mark_svg)

    # Wordmark: the mark a little taller than the capitals (Hanken's cap height is 0.7 em).
    size, base, tx = 100, 86, 108
    d1, w1 = shaped_path(font, "Match-Room", 700, size, tx, base, tracking=-0.012)
    d2, w2 = shaped_path(font, "Live", 700, size, tx + w1 + 24, base, tracking=-0.012)
    width = math.ceil(tx + w1 + 24 + w2 + 2)
    word = (
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width} 112" role="img" '
        f'aria-label="Match-Room Live"><title>Match-Room Live</title>'
        f'<g transform="translate(1 9) scale(1.42)">{m}</g>'
        f'<path d="{d1}" fill="{INK}"/><path d="{d2}" fill="{BLUE}"/></svg>\n'
    )
    (BRAND / "wordmark.svg").write_text(word)
    print("wrote mark, wordmark, favicon; wordmark width", width)


if __name__ == "__main__":
    main()
