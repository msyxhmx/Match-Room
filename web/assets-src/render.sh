#!/bin/sh
# Render the brand PNGs from their HTML/SVG sources with headless Chrome (Playwright's build).
# Usage: sh web/assets-src/render.sh   (from the repo root). Set CHROME to use another binary.
set -e
cd "$(dirname "$0")"
CHROME="${CHROME:-$(ls -d "$HOME"/Library/Caches/ms-playwright/chromium-*/chrome-mac*/Google\ Chrome\ for\ Testing.app/Contents/MacOS/Google\ Chrome\ for\ Testing | tail -1)}"
shot() { "$CHROME" --headless --hide-scrollbars --force-device-scale-factor=1 --allow-file-access-from-files \
  --window-size="$2" --screenshot="$3" "file://$PWD/$1" >/dev/null 2>&1; echo "wrote $3"; }
mkdir -p renders
shot endcard.html 1920,1080 renders/endcard.png
shot thumbnail.html 1280,720 renders/thumbnail.png
shot icon-180.html 180,180 ../public/apple-touch-icon.png
shot icon-32.html 32,32 ../public/favicon-32.png
