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

echo "== App icons: the design system's Redrob Browser app icon"
# Every slot where the OS shows the app as an icon -- dock, taskbar, launcher, Start tile -- is the shipped
# 2026 app icon (Redrob Blue tile, white doorway symbol), rendered per size by render_app_icons.py from
# @redrob-labs/ui's dist/brand/app-icons (`npm pack @redrob-labs/ui@1.8.0`, then point REDROB_APP_ICONS at
# package/dist/brand/app-icons). The design system forbids redrawing it, so it is NOT derived from
# redrob-mark.svg here.
: "${REDROB_DESIGN_SYSTEM:?set REDROB_DESIGN_SYSTEM to a redrob-design-system checkout}"
: "${REDROB_APP_ICONS:?set REDROB_APP_ICONS to @redrob-labs/ui package/dist/brand/app-icons}"
: "${REDROB_CHROME:?set REDROB_CHROME to a Chromium binary able to run --headless}"
python3 ../scripts/render_app_icons.py "$REDROB_APP_ICONS" "$REDROB_CHROME"

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
# favicon_product is the app icon (render_app_icons.py), not the bare mark.

echo "== WebUI marks that upstream ships as Chrome-logo SVG files"
# WebUI pages load these by file name, not through the product logo. The symbol is the design system's
# shipped PNG, wrapped unmodified in an SVG so the file name and type stay what WebUI expects.
#   chrome_logo_dark.svg  cr-toolbar / cr-drawer header in dark mode: Solid White, for dark grounds.
#   chrome_product_cr23   omnibox action icon, drawn as a CSS mask: only its alpha is used.
wrap() {
  printf '<svg xmlns="http://www.w3.org/2000/svg" width="%s" height="%s" viewBox="0 0 %s %s"><image width="%s" height="%s" href="data:image/png;base64,%s"/></svg>\n' \
    "$2" "$2" "$2" "$2" "$2" "$2" "$(base64 -w0 "$1")" > "$3"
}
mkdir -p webui
wrap "$REDROB_DESIGN_SYSTEM/assets/Symbol/redrob-symbol-solid-white.png" 24 webui/chrome_logo_dark.svg
wrap "$REDROB_DESIGN_SYSTEM/assets/Symbol/redrob-symbol-solid.png" 16 webui/chrome_product_cr23.svg

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
