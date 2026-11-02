#!/usr/bin/env bash
# Derive the desktop app icons from the pinned design-system source and nothing else.
# Needs a Chromium (headless shell is enough; set CHROME), ImageMagick 7 (`magick`) and python3.
# The outputs are committed, so builds and packaging never need these tools.
#
#   CHROME=/path/to/chrome-headless-shell bash scripts/brand-icons.sh
#
# Source: crates/redrob-shell/assets/redrob-ui/redrob-browser-icon-web.svg, @redrob-labs/ui 1.8.0,
# the superellipse-masked variant (transparent corners). Windows, Linux and macOS show the
# desktop icon unmasked, so the square `-icon` variant would draw a square tile there.
#
#   crates/redrob-shell/assets/redrob-browser-256.png   window and taskbar icon
#   assets/redrob-browser.ico                           16, 24, 32, 48, 64, 256
#   assets/redrob-browser.icns                          16, 32, 64, 128, 256, 512, 1024
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SVG="$ROOT/crates/redrob-shell/assets/redrob-ui/redrob-browser-icon-web.svg"
CHROME="${CHROME:-$HOME/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
command -v magick >/dev/null || { echo "error: magick (ImageMagick 7) not found" >&2; exit 1; }
[ -x "$CHROME" ] || { echo "error: Chromium not found; set CHROME" >&2; exit 1; }

# ImageMagick's SVG reader drops the gradients, so Chromium renders the master.
cp "$SVG" "$TMP/icon.svg"
printf '%s\n' '<!DOCTYPE html><html><head><style>html,body{margin:0;background:transparent}img{display:block;width:1024px;height:1024px}</style></head><body><img src="icon.svg"></body></html>' > "$TMP/icon.html"
"$CHROME" --headless --no-sandbox --hide-scrollbars --default-background-color=00000000 \
  --window-size=1024,1024 --screenshot="$TMP/1024.png" "file://$TMP/icon.html" >/dev/null 2>&1
magick "$TMP/1024.png" PNG32:"$TMP/1024.png"

for s in 16 24 32 48 64 128 256 512; do
  magick "$TMP/1024.png" -filter Lanczos -resize "${s}x${s}" "PNG32:$TMP/$s.png"
done
cp "$TMP/256.png" "$ROOT/crates/redrob-shell/assets/redrob-browser-256.png"
magick "$TMP/16.png" "$TMP/24.png" "$TMP/32.png" "$TMP/48.png" "$TMP/64.png" "$TMP/256.png" \
  "$ROOT/assets/redrob-browser.ico"
python3 "$ROOT/scripts/make-icns.py" "$ROOT/assets/redrob-browser.icns" \
  16="$TMP/16.png" 32="$TMP/32.png" 64="$TMP/64.png" 128="$TMP/128.png" \
  256="$TMP/256.png" 512="$TMP/512.png" 1024="$TMP/1024.png"
echo "app icons written"
