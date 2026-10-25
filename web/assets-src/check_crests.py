"""Measure the crests instead of eyeballing them.

Prints a table and writes renders/crest-check.json.

1. Contrast: every colour a crest uses (other than white) is measured against white and against
   the grey ground. Inside a crest, detail is always colour on white or white on colour, and
   every crest's outer edge is coloured, so both pairs need >= 3:1 (WCAG 1.4.11, graphics).
2. Greyscale: each crest is rendered at 96 px on white and turned to grey. For every pair we
   count the pixels whose grey differs by more than a quarter of the range, as a share of the
   area either crest covers. Under 15% means they'd be told apart mainly by colour: a fail.
   Silhouette overlap (IoU) is reported too, for information.

    python web/assets-src/check_crests.py      (needs Pillow and the Chrome that render.sh uses)
"""

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
GROUND = "#F2F2F7"


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


def mask(svg):
    with tempfile.TemporaryDirectory() as tmp:
        html = Path(tmp) / "c.html"
        html.write_text(f'<body style="margin:0"><img src="file://{svg}" width="96" height="96">')
        png = Path(tmp) / "c.png"
        subprocess.run(
            [
                chrome(),
                "--headless",
                "--hide-scrollbars",
                "--force-device-scale-factor=1",
                "--default-background-color=00000000",
                "--allow-file-access-from-files",
                "--window-size=96,96",
                f"--screenshot={png}",
                f"file://{html}",
            ],
            capture_output=True,
            check=False,
        )
        im = Image.open(png).convert("RGBA")
        white = Image.new("RGBA", im.size, "#FFFFFF")
        grey = list(Image.alpha_composite(white, im).convert("L").getdata())
        alpha = list(im.getchannel("A").getdata())
        return {"shape": {i for i, v in enumerate(alpha) if v > 127}, "grey": grey}


def main():
    rows, masks = [], {}
    for svg in sorted(CRESTS.glob("*.svg")):
        cid = svg.stem
        text = svg.read_text()
        used = sorted({c.upper() for c in re.findall(r'(?:fill|stroke)="(#[0-9A-Fa-f]{6})"', text)})
        colours = [c for c in used if c != "#FFFFFF"]
        primary = max(colours, key=lum)  # the field colour; darker ones are text
        worst = min(colours, key=lambda c: ratio(c, GROUND))
        rows.append(
            {
                "id": cid,
                "primary": primary,
                "colours": colours,
                "grey_luminance": round(lum(primary), 3),
                "symbol_on_primary": round(min(ratio("#FFFFFF", c) for c in colours), 2),
                "edge_on_white": round(min(ratio(c, "#FFFFFF") for c in colours), 2),
                "edge_on_ground": round(ratio(worst, GROUND), 2),
            }
        )
        masks[cid] = mask(svg)
    pairs = []
    for a, b in itertools.combinations(masks, 2):
        union = masks[a]["shape"] | masks[b]["shape"]
        iou = len(masks[a]["shape"] & masks[b]["shape"]) / len(union)
        ga, gb = masks[a]["grey"], masks[b]["grey"]
        diff = sum(1 for i in union if abs(ga[i] - gb[i]) > 64) / len(union)
        pairs.append(
            {"a": a, "b": b, "grey_differs": round(diff, 3), "silhouette_iou": round(iou, 3)}
        )
    pairs.sort(key=lambda p: p["grey_differs"])
    ok = all(
        min(r["symbol_on_primary"], r["edge_on_white"], r["edge_on_ground"]) >= 3 for r in rows
    )
    ok_shape = pairs[0]["grey_differs"] >= 0.15
    print(f"{'club':5}{'primary':9}{'grey L':>8}{'white/prim':>11}{'on white':>9}{'on ground':>10}")
    for r in rows:
        print(
            f"{r['id']:5}{r['primary']:9}{r['grey_luminance']:>8}{r['symbol_on_primary']:>11}"
            f"{r['edge_on_white']:>9}{r['edge_on_ground']:>10}"
        )
    print(
        "closest pairs in greyscale (share of pixels that differ):",
        ", ".join(f"{p['a']}/{p['b']} {p['grey_differs']:.0%}" for p in pairs[:3]),
    )
    print(
        "contrast", "PASS" if ok else "FAIL", "| greyscale shapes", "PASS" if ok_shape else "FAIL"
    )
    out = HERE / "renders" / "crest-check.json"
    out.parent.mkdir(exist_ok=True)
    out.write_text(
        json.dumps({"contrast": rows, "greyscale_pairs": pairs, "pass": ok and ok_shape}, indent=2)
        + "\n"
    )
    raise SystemExit(0 if ok and ok_shape else 1)


if __name__ == "__main__":
    main()
