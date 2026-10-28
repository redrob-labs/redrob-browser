#!/usr/bin/env bash
# Bundle Redrob Browser.app from target/release, carry the GStreamer runtime inside it, sign it with
# the Developer ID in APPLE_CODESIGN_CERT_P12_BASE64, notarize it with the App Store Connect API
# key, staple, and write
#   dist/release/redrob-browser-macos-arm64-<version>.zip
#   dist/release/redrob-browser-macos-arm64-<version>.dmg
#
#   bash scripts/package-macos.sh 0.1.0
#
# When the window was built with the `media` feature it links GStreamer from the official
# framework (/Library/Frameworks/GStreamer.framework, or GSTREAMER_FRAMEWORK). The script copies
# that runtime to Contents/Frameworks/GStreamer.framework, rewrites every load path and rpath that
# points at the system framework to a path inside the bundle (install_name_tool), and fails if one
# is left, so the app runs on a Mac without GStreamer installed. The window finds the bundled
# plugins at run time (crates/redrob-shell/src/media.rs, use_bundled_runtime).
#
# Without the signing secrets (a fork, a local run) everything is signed ad hoc, so it still runs
# on Apple Silicon, and the zip and dmg are still written.
set -euo pipefail

version="$1"
app="dist/Redrob Browser.app"
gst_framework="${GSTREAMER_FRAMEWORK:-/Library/Frameworks/GStreamer.framework}"
zip_name="dist/release/redrob-browser-macos-arm64-${version}.zip"
dmg_name="dist/release/redrob-browser-macos-arm64-${version}.dmg"
macho_list="dist/gstreamer-macho.txt"
entitlements="dist/entitlements.plist"

rm -rf "$app" dist/dmg "$macho_list"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" dist/release
: > "$macho_list"

cp target/release/redrob-browser-window "$app/Contents/MacOS/Redrob Browser"
cp target/release/redrob-browser target/release/redrob-browser-worker target/release/redrob-browser-protected "$app/Contents/MacOS/"
cp LICENSE NOTICE "$app/Contents/Resources/"
if [ -f assets/redrob-browser.icns ]; then
  cp assets/redrob-browser.icns "$app/Contents/Resources/AppIcon.icns"
fi

cat > "$app/Contents/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>Redrob Browser</string>
  <key>CFBundleDisplayName</key><string>Redrob Browser</string>
  <key>CFBundleIdentifier</key><string>ai.redrob.browser</string>
  <key>CFBundleExecutable</key><string>Redrob Browser</string>
  <key>CFBundleIconFile</key><string>AppIcon</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>NSHighResolutionCapable</key><true/>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleLocalizations</key><array><string>en</string><string>ko</string></array>
</dict>
</plist>
PLIST

# GStreamer's ORC compiles small kernels at run time, which the hardened runtime allows only with
# these entitlements. The window and the plugin scanner load GStreamer; the engine does not.
cat > "$entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
</dict>
</plist>
PLIST

# ---- GStreamer runtime -------------------------------------------------------------------------

if otool -L "$app/Contents/MacOS/Redrob Browser" | grep -q 'libgstreamer-1\.0'; then
  if [ ! -d "$gst_framework/Versions/1.0" ]; then
    echo "the window links GStreamer but $gst_framework is missing" >&2
    exit 1
  fi
  echo "bundling GStreamer from $gst_framework"
  python3 - "$app" "$gst_framework" "$macho_list" <<'PY'
import os, shutil, subprocess, sys

app, framework, macho_list = sys.argv[1], sys.argv[2], sys.argv[3]
src = os.path.realpath(os.path.join(framework, "Versions", "1.0"))
fw = os.path.join(app, "Contents", "Frameworks", "GStreamer.framework")
dst = os.path.join(fw, "Versions", "1.0")
macos_dir = os.path.join(app, "Contents", "MacOS")

# Build-time and unused parts of the framework stay behind.
SKIP_DIRS = {"pkgconfig", "cmake", "include", "girepository-1.0", "gir-1.0", "gtk-doc", "aclocal"}

def ignore(directory, names):
    out = []
    for n in names:
        p = os.path.join(directory, n)
        if os.path.isdir(p) and not os.path.islink(p) and (n in SKIP_DIRS or n.startswith("python")):
            out.append(n)
        elif n.endswith((".a", ".la")) or n.startswith("libgstpython"):
            out.append(n)
    return out

os.makedirs(dst, exist_ok=True)
for part in ("lib", "libexec", "etc"):
    if os.path.isdir(os.path.join(src, part)):
        shutil.copytree(os.path.join(src, part), os.path.join(dst, part), symlinks=True, ignore=ignore)

# A symlink that leaves the bundle (or dangles) becomes a copy of what it points at.
for root, dirs, files in os.walk(dst):
    for n in dirs + files:
        p = os.path.join(root, n)
        if not os.path.islink(p):
            continue
        target = os.readlink(p)
        resolved = os.path.normpath(target if os.path.isabs(target) else os.path.join(root, target))
        if resolved.startswith(dst + os.sep) and os.path.exists(resolved):
            continue
        real = os.path.realpath(os.path.join(src, os.path.relpath(p, dst)))
        os.unlink(p)
        if os.path.isdir(real):
            shutil.copytree(real, p, symlinks=False, ignore=ignore)
        elif os.path.exists(real):
            shutil.copy2(real, p)
        else:
            print(f"dropping dangling link {p}")

# The framework's own layout: its main binary, Resources/Info.plist, and the Current links.
main = os.path.realpath(os.path.join(src, "GStreamer"))
if os.path.isfile(main):
    shutil.copy2(main, os.path.join(dst, "GStreamer"))
res_src = os.path.join(src, "Resources")
res_dst = os.path.join(dst, "Resources")
if os.path.isdir(res_src):
    shutil.copytree(os.path.realpath(res_src), res_dst, symlinks=False)
os.makedirs(res_dst, exist_ok=True)
if not os.path.isfile(os.path.join(res_dst, "Info.plist")):
    with open(os.path.join(res_dst, "Info.plist"), "w") as f:
        f.write("""<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key><string>GStreamer</string>
  <key>CFBundleIdentifier</key><string>org.freedesktop.gstreamer</string>
  <key>CFBundleName</key><string>GStreamer</string>
  <key>CFBundlePackageType</key><string>FMWK</string>
  <key>CFBundleVersion</key><string>1.0</string>
</dict>
</plist>
""")
os.symlink("1.0", os.path.join(fw, "Versions", "Current"))
if os.path.isfile(os.path.join(dst, "GStreamer")):
    os.symlink("Versions/Current/GStreamer", os.path.join(fw, "GStreamer"))
os.symlink("Versions/Current/Resources", os.path.join(fw, "Resources"))

MAGICS = {b"\xcf\xfa\xed\xfe", b"\xce\xfa\xed\xfe", b"\xfe\xed\xfa\xcf", b"\xfe\xed\xfa\xce", b"\xca\xfe\xba\xbe"}

def is_macho(p):
    if os.path.islink(p) or not os.path.isfile(p):
        return False
    with open(p, "rb") as f:
        return f.read(4) in MAGICS

def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True).stdout

machos = [os.path.join(r, n) for r, _, fs in os.walk(dst) for n in fs if is_macho(os.path.join(r, n))]

# Universal binaries carry an x86_64 half this arm64 app never loads.
for p in machos:
    try:
        if "fat file" in run("lipo", "-info", p):
            run("lipo", p, "-thin", "arm64", "-output", p + ".thin")
            os.replace(p + ".thin", p)
    except subprocess.CalledProcessError:
        if os.path.exists(p + ".thin"):
            os.unlink(p + ".thin")

PREFIXES = sorted({
    src + "/",
    os.path.join(framework, "Versions", "1.0") + "/",
    os.path.join(framework, "Versions", "Current") + "/",
    "/Library/Frameworks/GStreamer.framework/Versions/1.0/",
    "/Library/Frameworks/GStreamer.framework/Versions/Current/",
}, key=len, reverse=True)
FRAMEWORK_MAIN = {os.path.join(framework, "GStreamer"), "/Library/Frameworks/GStreamer.framework/GStreamer"}

def mapped(path):
    """The bundled file a system-framework path names, or None."""
    if path in FRAMEWORK_MAIN:
        return os.path.join(dst, "GStreamer")
    for pre in PREFIXES:
        if path.startswith(pre):
            return os.path.join(dst, path[len(pre):])
        if path == pre.rstrip("/"):
            return dst
    return None

def deps(p):
    lines = run("otool", "-L", p).splitlines()[1:]
    return [l.strip().split(" (compatibility")[0] for l in lines if l.strip()]

def dylib_id(p):
    lines = run("otool", "-D", p).splitlines()[1:]
    return lines[0].strip() if lines else None

def rpaths(p):
    out, lines = [], run("otool", "-l", p).splitlines()
    for i, l in enumerate(lines):
        if l.strip() == "cmd LC_RPATH":
            for k in lines[i + 1:i + 4]:
                k = k.strip()
                if k.startswith("path "):
                    out.append(k[5:].rsplit(" (offset", 1)[0])
    return out

BUNDLE_RPATHS = [
    "@executable_path/../Frameworks/GStreamer.framework/Versions/1.0/lib",
    "@executable_path/../Frameworks/GStreamer.framework/Versions/1.0",
]

def relink(p, in_macos):
    args, own = [], dylib_id(p)
    links_gst = False
    for d in deps(p):
        if d == own:
            continue
        m = mapped(d)
        if m:
            links_gst = True
            new = "@rpath/" + os.path.relpath(m, dst) if in_macos else "@loader_path/" + os.path.relpath(m, os.path.dirname(p))
            args += ["-change", d, new]
        elif d.startswith("@rpath/") and ("gst" in d or "glib" in d or "gobject" in d):
            links_gst = True
    if own and mapped(own):
        args += ["-id", "@rpath/" + os.path.relpath(mapped(own), dst)]
    present = rpaths(p)
    wanted = []
    for r in present:
        m = mapped(r)
        if m:
            links_gst = True
            args += ["-delete_rpath", r]
            if not in_macos:
                wanted.append("@loader_path/" + os.path.relpath(m, os.path.dirname(p)))
    if in_macos and links_gst:
        wanted += BUNDLE_RPATHS
    kept = [r for r in present if not mapped(r)]
    for r in dict.fromkeys(wanted):
        if r not in kept:
            args += ["-add_rpath", r]
            kept.append(r)
    if args:
        run("install_name_tool", *args, p)

for p in machos:
    relink(p, False)
for n in sorted(os.listdir(macos_dir)):
    relink(os.path.join(macos_dir, n), True)

# Nothing may still point at the system framework.
left = []
for p in machos + [os.path.join(macos_dir, n) for n in os.listdir(macos_dir)]:
    for d in deps(p) + rpaths(p):
        if mapped(d):
            left.append(f"{p}: {d}")
if left:
    print("load paths still outside the bundle:\n  " + "\n  ".join(left), file=sys.stderr)
    sys.exit(1)

# Deepest first, so a directory's contents are signed before anything that seals them.
machos.sort(key=lambda p: (-p.count(os.sep), p))
with open(macho_list, "w") as f:
    f.write("".join(p + "\n" for p in machos))
print(f"bundled {len(machos)} GStreamer binaries")
PY
fi

fw="$app/Contents/Frameworks/GStreamer.framework"

# sign <identity> <timestamp flag...>: framework contents, the framework, the programs, the app.
sign_all() {
  local identity="$1"; shift
  local f
  while IFS= read -r f; do
    if [ -x "$f" ] && [[ "$f" == */libexec/* ]]; then
      codesign --force "$@" --options runtime --entitlements "$entitlements" --sign "$identity" "$f"
    else
      codesign --force "$@" --options runtime --sign "$identity" "$f"
    fi
  done < "$macho_list"
  if [ -d "$fw" ]; then
    codesign --force "$@" --options runtime --sign "$identity" "$fw"
  fi
  codesign --force "$@" --options runtime --sign "$identity" "$app/Contents/MacOS/redrob-browser"
  codesign --force "$@" --options runtime --sign "$identity" "$app/Contents/MacOS/redrob-browser-worker"
  codesign --force "$@" --options runtime --sign "$identity" "$app/Contents/MacOS/redrob-browser-protected"
  codesign --force "$@" --options runtime --entitlements "$entitlements" --sign "$identity" "$app/Contents/MacOS/Redrob Browser"
  codesign --force "$@" --options runtime --entitlements "$entitlements" --sign "$identity" "$app"
  codesign --verify --deep --strict "$app"
}

make_dmg() {
  rm -rf dist/dmg "$dmg_name"
  mkdir -p dist/dmg
  ditto "$app" "dist/dmg/Redrob Browser.app"
  ln -s /Applications dist/dmg/Applications
  hdiutil create -volname "Redrob Browser" -srcfolder dist/dmg -ov -format UDZO "$dmg_name"
  rm -rf dist/dmg
}

if [ -z "${APPLE_CODESIGN_CERT_P12_BASE64:-}" ]; then
  echo "no signing secrets: signing ad hoc"
  sign_all -
  ditto -c -k --keepParent "$app" "$zip_name"
  make_dmg
  echo "wrote $zip_name and $dmg_name (unsigned)"
  exit 0
fi

work="$(mktemp -d)"
keychain="$work/signing.keychain-db"
password="$(uuidgen)"
echo "$APPLE_CODESIGN_CERT_P12_BASE64" | base64 --decode > "$work/cert.p12"
security create-keychain -p "$password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$password" "$keychain"
security import "$work/cert.p12" -k "$keychain" -P "$APPLE_CODESIGN_CERT_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$password" "$keychain" >/dev/null
security list-keychains -d user -s "$keychain" $(security list-keychains -d user | tr -d '"')
identity="$(security find-identity -v -p codesigning "$keychain" | awk -F'"' '/Developer ID Application/ {print $2; exit}')"
if [ -z "$identity" ]; then
  echo "no Developer ID Application identity in the certificate" >&2
  exit 1
fi

sign_all "$identity" --timestamp

echo "$APPLE_NOTARY_API_KEY_P8_BASE64" | base64 --decode > "$work/key.p8"
notarize() {
  xcrun notarytool submit "$1" --key "$work/key.p8" --key-id "$APPLE_NOTARY_API_KEY_ID" \
    --issuer "$APPLE_NOTARY_API_ISSUER_ID" --wait
}

ditto -c -k --keepParent "$app" "$work/notarize.zip"
notarize "$work/notarize.zip"
xcrun stapler staple "$app"
spctl --assess --type execute --verbose "$app"
ditto -c -k --keepParent "$app" "$zip_name"

# The dmg holds the stapled app; the image itself is signed, notarized and stapled too.
make_dmg
codesign --force --timestamp --sign "$identity" "$dmg_name"
notarize "$dmg_name"
xcrun stapler staple "$dmg_name"
spctl --assess --type open --context context:primary-signature --verbose "$dmg_name"

security delete-keychain "$keychain"
echo "wrote $zip_name and $dmg_name"
