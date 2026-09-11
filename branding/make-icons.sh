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

echo "== Linux / shared product logos"
for sz in 16 24 32 48 64 128 256; do render "$MARK" "${sz}x${sz}" "icons/product_logo_${sz}.png"; done
render "$MARK" 32x32 icons/product_logo_16@2x.png
render "$MARK" 64x64 icons/product_logo_32@2x.png
render "$MARK" 32x32 icons/product_logo_32.xpm
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

echo "== Windows .ico (16/32/48/256 in one file, matching upstream's set)"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
for sz in 16 32 48 256; do render "$MARK" "${sz}x${sz}" "$tmp/ico_${sz}.png"; done
magick "$tmp/ico_16.png" "$tmp/ico_32.png" "$tmp/ico_48.png" "$tmp/ico_256.png" icons/win/redrob.ico
# Document and PDF association icons. Upstream draws a page behind the glyph; until we have that art
# these are the plain mark, which is honest rather than wrong -- the association still shows Redrob.
cp icons/win/redrob.ico icons/win/redrob_doc.ico
cp icons/win/redrob.ico icons/win/redrob_pdf.ico
render "$MARK" 600x600 icons/win/tiles/Logo.png
render "$MARK" 176x176 icons/win/tiles/SmallLogo.png

echo "== macOS icon set"
for sz in 16 32 64 128 256 512 1024; do render "$MARK" "${sz}x${sz}" "icons/mac/appiconset/appicon_${sz}.png"; done
cp icons/mac/appiconset/appicon_256.png icons/mac/iconset/icon_256x256.png
cp icons/mac/appiconset/appicon_512.png icons/mac/iconset/icon_256x256@2x.png

# ImageMagick writes only the first image when asked for a multi-resolution .icns, so the container is
# assembled directly. The format is a 'icns' magic, a big-endian total length, then one typed chunk per
# resolution; the ic**/icp* types all take a PNG payload verbatim.
python3 - <<'PY'
import struct, pathlib
src = pathlib.Path("icons/mac/appiconset")
# type -> pixel size. ic11..ic14 are the @2x members of the 16/32/128/256 slots.
members = [(b"icp4", 16), (b"icp5", 32), (b"ic11", 32), (b"ic12", 64),
           (b"ic07", 128), (b"ic13", 256), (b"ic08", 256), (b"ic14", 512),
           (b"ic09", 512), (b"ic10", 1024)]
chunks = b""
for kind, size in members:
    png = (src / f"appicon_{size}.png").read_bytes()
    chunks += kind + struct.pack(">I", len(png) + 8) + png
out = b"icns" + struct.pack(">I", len(chunks) + 8) + chunks
pathlib.Path("icons/mac/app.icns").write_bytes(out)
print(f"   app.icns: {len(members)} members, {len(out)} bytes")
PY

echo
echo "Assets.car and AppIcon.icon are NOT generated here."
echo "  Assets.car is a compiled asset catalogue and AppIcon.icon is the layered Icon Composer format;"
echo "  both are produced by Apple's actool and cannot be built on Linux. A macOS build must regenerate"
echo "  them from icons/mac/appiconset, and until it does a mac package keeps upstream's art in those"
echo "  two files. This is a real gap, not a rounding error: it is the Dock icon on recent macOS."
