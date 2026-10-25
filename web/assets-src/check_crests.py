"""Measure the crests instead of eyeballing them (round 3: full crests and 28 px badges).

Prints a table, writes renders/crest-check.json and renders/crest-downscale.png.

1. Contrast (WCAG 1.4.11 for graphics, 1.4.3 for lettering):
   - the club colour against white and the grey ground: >= 3:1 (it forms each crest's edge)
   - white on the club colour (symbols, ring lettering): >= 3:1
   - lettering on ribbons, ink on gold or white on ink: >= 4.5:1
   - crest gold against white is reported but not gated: it's an accent on ribbons and
     keylines, and the club colour carries the edge.
2. Greyscale: badges rendered at 28 px and full crests at 96 px, turned to grey. For every pair
   we count the pixels whose grey differs by more than a quarter of the range, as a share of the
   area either covers. Under 15% means they'd be told apart mainly by colour: a fail.
3. YouTube downscale: each full crest at its 96 px video size is shrunk to what a 480p stream
   keeps (x0.444, so about 43 px), saved as a JPEG at quality 30, and blown back up. The
   greyscale test is repeated on those, and a strip is saved for the mockup.

    python web/assets-src/check_crests.py      (needs Pillow and the Chrome that render.sh uses)
"""

import io
import itertools
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from PIL import Image

HERE = Path(__file__).resolve().parent
CRESTS = HERE.parent / "src" / "assets" / "crests"
RENDERS = HERE / "renders"
GROUND, GOLD, INK, WHITE = "#F2F2F7", "#C9A13B", "#1D1D1F", "#FFFFFF"
IDS = ["NGC", "KST", "RIV", "HAR", "ELM", "MIL", "ASH", "QNB"]
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


def lum(hex_):
    c = [int(hex_[i : i + 2], 16) / 255 for i in (1, 3, 5)]
    c = [v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4 for v in c]
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]


def ratio(a, b):
    la, lb = sorted((lum(a), lum(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def chrome():
    if os.environ.get("CHROME"):
        return os.environ["CHROME"]
    base = Path.home() / "Library/Caches/ms-playwright"
    hits = sorted(
        base.glob(
            "chromium-*/chrome-mac*/Google Chrome for Testing.app"
            "/Contents/MacOS/Google Chrome for Testing"
        )
    )
    return str(hits[-1])


def render(files, size):
    """Render each SVG at `size` px on a transparent sheet in one Chrome run; return tiles."""
    gap = 8
    width = len(files) * (size + gap)
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "c.html"
        cells = "".join(
            f'<img src="file://{f}" width="{size}" height="{size}" '
            f'style="position:absolute;left:{i * (size + gap)}px;top:0">'
            for i, f in enumerate(files)
        )
        html.write_text(f'<body style="margin:0;background:transparent">{cells}')
        png = Path(tmp) / "c.png"
        subprocess.run(
            [
                chrome(),
                "--headless",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--default-background-color=00000000",
                "--allow-file-access-from-files",
                f"--window-size={max(width, 500)},{max(size, 100)}",
                f"--screenshot={png}",
                f"file://{html}",
            ],
            capture_output=True,
            check=False,
        )
        sheet = Image.open(png).convert("RGBA")
        step = size + gap
        return [sheet.crop((i * step, 0, i * step + size, size)) for i in range(len(files))]


def grey_and_shape(tile):
    white = Image.new("RGBA", tile.size, WHITE)
    grey = list(Image.alpha_composite(white, tile).convert("L").getdata())
    shape = {i for i, v in enumerate(tile.getchannel("A").getdata()) if v > 127}
    return grey, shape


def pairs(tiles):
    data = {cid: grey_and_shape(t) for cid, t in tiles.items()}
    out = []
    for a, b in itertools.combinations(IDS, 2):
        union = data[a][1] | data[b][1]
        diff = sum(1 for i in union if abs(data[a][0][i] - data[b][0][i]) > 64) / len(union)
        out.append({"a": a, "b": b, "grey_differs": round(diff, 3)})
    return sorted(out, key=lambda p: p["grey_differs"])


def youtube(tile):
    """96 px crest -> 480p size -> JPEG q30 -> back to 96 px. Returns (restored, small)."""
    white = Image.new("RGBA", tile.size, WHITE)
    rgb = Image.alpha_composite(white, tile).convert("RGB")
    small = rgb.resize((43, 43), Image.LANCZOS)
    buf = io.BytesIO()
    small.save(buf, "JPEG", quality=30)
    small = Image.open(buf).convert("RGB")
    back = small.resize(tile.size, Image.BICUBIC).convert("RGBA")
    back.putalpha(tile.getchannel("A"))
    return back, small


def contrast_row(c, used):
    prim = PRIMARY[c]
    row = {
        "id": c,
        "primary": prim,
        "colours": sorted(used),
        "primary_on_white": round(ratio(prim, WHITE), 2),
        "primary_on_ground": round(ratio(prim, GROUND), 2),
        "white_on_primary": round(ratio(WHITE, prim), 2),
    }
    if GOLD in used:
        row["ink_on_gold"] = round(ratio(INK, GOLD), 2)
        row["gold_on_white_accent"] = round(ratio(GOLD, WHITE), 2)
    if INK in used:
        row["white_on_ink"] = round(ratio(WHITE, INK), 2)
    row["pass"] = (
        min(row["primary_on_white"], row["primary_on_ground"], row["white_on_primary"]) >= 3
        and row.get("ink_on_gold", 9) >= 4.5
        and row.get("white_on_ink", 9) >= 4.5
    )
    return row


def main():
    full = {c: CRESTS / f"{c}.svg" for c in IDS}
    badge = {c: CRESTS / f"{c}-badge.svg" for c in IDS}
    rows = []
    for c in IDS:
        used = set()
        for f in (full[c], badge[c]):
            found = re.findall(r'(?:fill|stroke)="(#[0-9A-Fa-f]{6})"', f.read_text())
            used |= {x.upper() for x in found}
        rows.append(contrast_row(c, used))

    badges28 = dict(zip(IDS, render([badge[c] for c in IDS], 28), strict=True))
    full96 = dict(zip(IDS, render([full[c] for c in IDS], 96), strict=True))
    yt = {c: youtube(full96[c]) for c in IDS}
    p28, p96 = pairs(badges28), pairs(full96)
    pyt = pairs({c: yt[c][0] for c in IDS})

    # Strip for the mockup: per crest, the 96 px original, then its 480p+JPEG pixels at 96 px.
    RENDERS.mkdir(exist_ok=True)
    strip = Image.new("RGB", (len(IDS) * 208, 104), WHITE)
    for i, c in enumerate(IDS):
        w = Image.new("RGBA", (96, 96), WHITE)
        strip.paste(Image.alpha_composite(w, full96[c]).convert("RGB"), (i * 208 + 4, 4))
        strip.paste(yt[c][1].resize((96, 96), Image.NEAREST), (i * 208 + 106, 4))
    strip.save(RENDERS / "crest-downscale.png")

    ok_contrast = all(r["pass"] for r in rows)
    lowest = min(p28[0]["grey_differs"], p96[0]["grey_differs"], pyt[0]["grey_differs"])
    ok_grey = lowest >= 0.15
    for r in rows:
        keys = ("ink_on_gold", "white_on_ink", "gold_on_white_accent")
        extra = "".join(f"  {k}={r[k]}" for k in keys if k in r)
        print(
            f"{r['id']}  on white {r['primary_on_white']}  on ground {r['primary_on_ground']}"
            f"  white on it {r['white_on_primary']}{extra}"
        )
    for label, ps in (("badges 28px", p28), ("full 96px", p96), ("after 480p+JPEG", pyt)):
        top = ", ".join(f"{p['a']}/{p['b']} {p['grey_differs']:.0%}" for p in ps[:3])
        print(f"closest in greyscale, {label}: {top}")
    print(
        "contrast", "PASS" if ok_contrast else "FAIL", "| greyscale", "PASS" if ok_grey else "FAIL"
    )
    result = {
        "contrast": rows,
        "grey_badges_28": p28,
        "grey_full_96": p96,
        "grey_after_youtube": pyt,
        "pass": ok_contrast and ok_grey,
    }
    (RENDERS / "crest-check.json").write_text(json.dumps(result, indent=2) + "\n")
    raise SystemExit(0 if ok_contrast and ok_grey else 1)


if __name__ == "__main__":
    main()
