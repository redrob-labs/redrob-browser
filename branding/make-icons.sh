#!/usr/bin/env bash
# Regenerate every branding asset from the two canonical SVGs.
#
# The icons are binaries, and a binary nobody can reproduce is a binary nobody can change. This script
# is the source of truth for how each one was made; `branding/manifest` is the record of where each one
# goes. Re-run it whenever the mark changes, then `./scripts/redrob.py brand`.
#
# Requires ImageMagick and python3, both already needed elsewhere on this host. Nothing is installed.
set -euo pipefail

cd "$(dirname "$0")"
MARK=redrob-mark.svg          # the glyph alone, for icons
WORDMARK=redrob-wordmark.svg  # the horizontal lockup, for the about pages
: "${MARK:?}" "${WORDMARK:?}"

# -density 1200 before -resize: rasterise the vector large and downsample, rather than letting the
# renderer draw at 16px, which loses the mark's internal cut entirely.
render() { magick -background none -density 1200 "$1" -resize "$2" "$3"; }
white()  { magick -background none -density 1200 "$1" -resize "$2" -channel RGB -evaluate set 100% +channel "$3"; }

mkdir -p icons/win/tiles icons/mac/appiconset icons/mac/iconset

echo "== App icons: the design system's Redrob Browser product icon"
# Every slot where the OS shows the app as an icon -- dock, taskbar, launcher, Start tile -- is the shipped
# product icon (pink tile, white symbol, globe in the doorway), rendered per size by render_app_icons.py.
# The design system forbids redrawing it, so it is NOT derived from redrob-mark.svg here.
: "${REDROB_DESIGN_SYSTEM:?set REDROB_DESIGN_SYSTEM to a redrob-design-system checkout}"
: "${REDROB_CHROME:?set REDROB_CHROME to a Chromium binary able to run --headless}"
python3 ../scripts/render_app_icons.py "$REDROB_DESIGN_SYSTEM" "$REDROB_CHROME"

echo "== Linux tray icon"
# The 22px monochrome variant is the system-tray icon; greyscale, alpha retained.
magick -background none -density 1200 "$MARK" -resize 22x22 -colorspace Gray -alpha on icons/product_logo_22_mono.png

echo "== About-page wordmark (height-constrained, aspect preserved)"
render "$WORDMARK" x22 icons/product_logo_name_22.png
render "$WORDMARK" x44 icons/product_logo_name_22@2x.png
white  "$WORDMARK" x22 icons/product_logo_name_22_white.png
white  "$WORDMARK" x44 icons/product_logo_name_22_white@2x.png
render "$WORDMARK" x32 icons/about_product_logo.png
render "$WORDMARK" x64 icons/about_product_logo@2x.png
white  "$WORDMARK" x32 icons/about_product_logo_white.png
white  "$WORDMARK" x64 icons/about_product_logo_white@2x.png
render "$MARK" 16x16 icons/favicon_product.png
render "$MARK" 32x32 icons/favicon_product@2x.png

echo "== Windows document/PDF association icons"
# Upstream draws a page behind the glyph; until we have that art these are the app icon, which is honest
# rather than wrong -- the association still shows Redrob.
cp icons/win/redrob.ico icons/win/redrob_doc.ico
cp icons/win/redrob.ico icons/win/redrob_pdf.ico

echo
echo "Assets.car is NOT generated here: it is actool output and needs a Mac with Xcode 26."
echo "  Sources: icons/mac/AppIcon.icon (macOS 26 icon: the product tile color as fill, the shipped white"
echo "  symbol and globe as its one layer) and icons/mac/appiconset (bitmaps for macOS < 26). On a Mac, lay"
echo "  them out as theme/Assets.xcassets + theme/AppIcon.icon beside Chromium's tools/mac/icons/compile_car.py"
echo "  and build/config/mac/mac_sdk.gni, run"
echo "    DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer python3 tools/mac/icons/compile_car.py theme/Assets.xcassets"
echo "  and copy theme/Assets.car to icons/mac/Assets.car. Redo it whenever the app icon changes."
