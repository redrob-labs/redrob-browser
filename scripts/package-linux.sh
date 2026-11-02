#!/usr/bin/env bash
# Lay out the Linux bundle from target/release and the CEF runtime, check it, and write
#   dist/release/redrob-browser-<platform>-<version>.tar.gz
#
#   bash scripts/package-linux.sh 0.1.0                 # what the release job runs after cargo build
#   bash scripts/package-linux.sh --build 0.1.0         # the same, building first (a local release test)
#
# CEF_PATH is the CEF binary distribution the build linked against (export-cef-dir output, the folder
# with libcef.so and archive.json). PLATFORM defaults to this machine's (linux-x64 or linux-arm64).
# WINDOW_BIN replaces target/release/redrob-browser-window (used to check the layout with the cef
# crate's cefsimple example before the window links CEF).
#
# The bundle is one folder: the programs, libcef.so and the rest of CEF's runtime beside them,
# locales/ with English and Korean only, LICENSE, NOTICE, CREDITS.html (Chromium's and CEF's
# licences) and bundle-manifest.txt (every file of the bundle; the updater replaces exactly those).
# Programs that link libcef.so get the run path $ORIGIN, so nothing outside the folder is needed
# beyond the system libraries Chromium itself expects (glib, nss, X11/Wayland, ...). The script
# stops when any ELF file in the bundle has a library ldd cannot find.
set -euo pipefail

build=0
if [ "${1:-}" = --build ]; then
  build=1
  shift
fi
version="${1:?usage: package-linux.sh [--build] <version>}"
case "$(uname -m)" in
  aarch64 | arm64) default_platform=linux-arm64 ;;
  *) default_platform=linux-x64 ;;
esac
platform="${PLATFORM:-$default_platform}"
cef="${CEF_PATH:?set CEF_PATH to the CEF binary distribution (export-cef-dir output)}"
patchelf="${PATCHELF:-patchelf}"

if [ ! -f "$cef/libcef.so" ] || [ ! -f "$cef/archive.json" ]; then
  echo "$cef is not a CEF binary distribution (no libcef.so or archive.json)" >&2
  exit 1
fi
command -v "$patchelf" >/dev/null || { echo "patchelf is needed (apt-get install patchelf, or PATCHELF=)" >&2; exit 1; }

if [ "$build" = 1 ]; then
  # Exactly the release job's build.
  cargo build --release -p obscura-cli -p redrob-shell --features obscura-cli/render
fi

target="$(cargo metadata --no-deps --format-version 1 | python3 -c 'import json,sys; print(json.load(sys.stdin)["target_directory"])')/release"
name="redrob-browser-$platform-$version"
out="dist/$name"
rm -rf "$out"
mkdir -p "$out/locales" dist/release

cp "$target/redrob-browser" "$target/redrob-browser-worker" "$out/"
cp "${WINDOW_BIN:-$target/redrob-browser-window}" "$out/redrob-browser-window"
cp LICENSE NOTICE "$out/"
python3 scripts/cef-credits.py "$cef" "$out/CREDITS.html"

# CEF's runtime: every top-level file of the distribution except its build files. libcef.so ships
# with debug info (about 1.4 GB); stripping leaves the code.
for f in "$cef"/*; do
  n="$(basename "$f")"
  [ -f "$f" ] || continue
  case "$n" in
    CMakeLists.txt | archive.json | CREDITS.html | *.a | *.h) continue ;;
  esac
  cp "$f" "$out/$n"
done
strip --strip-unneeded "$out/libcef.so" "$out"/libvk_swiftshader.so 2>/dev/null || strip --strip-unneeded "$out/libcef.so"
chmod 0755 "$out/chrome-sandbox"

# English and Korean, the window's two languages (Chromium's gendered variants included).
for f in "$cef"/locales/en-US*.pak "$cef"/locales/ko*.pak; do
  cp "$f" "$out/locales/"
done
[ -f "$out/locales/en-US.pak" ] && [ -f "$out/locales/ko.pak" ] || { echo "CEF has no en-US or ko locale" >&2; exit 1; }

# The window's X11 keyboard support opens libxkbcommon-x11 at run time (so ldd does not list it),
# and not every system has it; the copy in the bundle is found through the run path below.
xkb="${XKBCOMMON_X11:-$(ldconfig -p | awk '/libxkbcommon-x11\.so\.0 /{print $NF; exit}')}"
[ -f "$xkb" ] || { echo "libxkbcommon-x11.so.0 not found (apt-get install libxkbcommon-x11-0, or XKBCOMMON_X11=<file>)" >&2; exit 1; }
cp -L "$xkb" "$out/libxkbcommon-x11.so.0"

# Programs that link libcef.so find it (and the libraries above) beside themselves.
for p in "$out"/redrob-browser "$out"/redrob-browser-worker "$out"/redrob-browser-window; do
  if "$patchelf" --print-needed "$p" | grep -qx 'libcef.so'; then
    "$patchelf" --set-rpath '$ORIGIN' "$p"
  fi
done

# Every ELF file resolves its libraries from the bundle or the system, with nothing preset.
missing=0
while IFS= read -r -d '' f; do
  if [ "$(head -c4 "$f" | od -An -c | tr -d ' ')" = '177ELF' ] && [ "$(basename "$f")" != chrome-sandbox ]; then
    if env -u LD_LIBRARY_PATH ldd "$f" 2>&1 | grep 'not found'; then
      echo "  ^ in ${f#"$out"/}" >&2
      missing=1
    fi
  fi
done < <(find "$out" -type f -print0)
[ "$missing" = 0 ] || { echo "the bundle has unresolved libraries" >&2; exit 1; }

for need in redrob-browser-window libcef.so icudtl.dat resources.pak v8_context_snapshot.bin chrome-sandbox CREDITS.html NOTICE; do
  [ -f "$out/$need" ] || { echo "missing from the bundle: $need" >&2; exit 1; }
done

(cd "$out" && find . -type f ! -name bundle-manifest.txt | sed 's|^\./||' | LC_ALL=C sort && echo bundle-manifest.txt) > "dist/$name.manifest"
mv "dist/$name.manifest" "$out/bundle-manifest.txt"

tar -C dist -czf "dist/release/$name.tar.gz" "$name"
echo "bundle $(du -sh "$out" | cut -f1), archive $(du -h "dist/release/$name.tar.gz" | cut -f1): dist/release/$name.tar.gz"
