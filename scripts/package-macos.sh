#!/usr/bin/env bash
# Bundle Redrob Browser.app from target/release with the CEF runtime inside it (Chromium Embedded
# Framework.framework and the five "Redrob Browser Helper*.app" process bundles, from CEF_PATH), sign
# it with the Developer ID in APPLE_CODESIGN_CERT_P12_BASE64, notarize it with the App Store Connect
# API key, staple, and write
#   dist/release/redrob-browser-macos-arm64-<version>.zip
#   dist/release/redrob-browser-macos-arm64-<version>.dmg
#
#   CEF_PATH=<cef dir> bash scripts/package-macos.sh 0.1.0
#
# Signing goes from the inside out: the framework's libraries, the framework, each helper app with
# its entitlements, the programs, the app. Without the signing secrets (a fork, a local run)
# everything is signed ad hoc, so it still runs on Apple Silicon, and the zip and dmg are still
# written.
set -euo pipefail

version="$1"
cef="${CEF_PATH:?set CEF_PATH to the CEF binary distribution (export-cef-dir output)}"
cef_framework="Chromium Embedded Framework.framework"
# CEF runs its renderer, GPU and utility processes from helper apps inside the bundle. Their program
# is redrob-browser-helper when the build has one, else the window binary, which starts as a CEF
# subprocess when it runs from a helper app.
helper_bin="${HELPER_BIN:-target/release/redrob-browser-helper}"
[ -f "$helper_bin" ] || helper_bin=target/release/redrob-browser-window
app="dist/Redrob Browser.app"
zip_name="dist/release/redrob-browser-macos-arm64-${version}.zip"
dmg_name="dist/release/redrob-browser-macos-arm64-${version}.dmg"
entitlements="dist/entitlements.plist"

rm -rf "$app" dist/dmg
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" dist/release

cp target/release/redrob-browser-window "$app/Contents/MacOS/Redrob Browser"
cp target/release/redrob-browser target/release/redrob-browser-worker "$app/Contents/MacOS/"
cp LICENSE NOTICE "$app/Contents/Resources/"
# Chromium's and CEF's licences; the About page links this path (crates/redrob-shell/src/bundle.rs).
python3 scripts/cef-credits.py "$cef" "$app/Contents/Resources/CREDITS.html"
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
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
  <key>CFBundleDevelopmentRegion</key><string>en</string>
  <key>CFBundleLocalizations</key><array><string>en</string><string>ko</string></array>
  <key>LSEnvironment</key><dict><key>MallocNanoZone</key><string>0</string></dict>
  <key>NSCameraUsageDescription</key><string>A web page asks to use the camera.</string>
  <key>NSMicrophoneUsageDescription</key><string>A web page asks to use the microphone.</string>
  <key>NSBluetoothAlwaysUsageDescription</key><string>A web page asks to use a Bluetooth device.</string>
  <key>NSWebBrowserPublicKeyCredentialUsageDescription</key><string>A web page asks to use a passkey.</string>
</dict>
</plist>
PLIST

# ---- CEF ---------------------------------------------------------------------------------------

# The framework, with English and Korean only of Chromium's translations.
mkdir -p "$app/Contents/Frameworks"
ditto "$cef/$cef_framework" "$app/Contents/Frameworks/$cef_framework"
find "$app/Contents/Frameworks/$cef_framework/Resources" -maxdepth 1 -name '*.lproj' \
  ! -name en.lproj ! -name ko.lproj ! -name Base.lproj -exec rm -rf {} +
[ -d "$app/Contents/Frameworks/$cef_framework/Resources/en.lproj" ] || { echo "CEF has no en.lproj" >&2; exit 1; }

# One helper app per CEF process kind, named after the main program as CEF looks them up:
# "Redrob Browser Helper (GPU).app/Contents/MacOS/Redrob Browser Helper (GPU)".
helpers=("Helper" "Helper (GPU)" "Helper (Renderer)" "Helper (Plugin)" "Helper (Alerts)")
helper_id() {
  case "$1" in
    "Helper") echo ai.redrob.browser.helper ;;
    *) echo "ai.redrob.browser.helper.$(echo "$1" | sed 's/Helper (\(.*\))/\1/' | tr '[:upper:]' '[:lower:]')" ;;
  esac
}
for h in "${helpers[@]}"; do
  name="Redrob Browser $h"
  dir="$app/Contents/Frameworks/$name.app/Contents"
  mkdir -p "$dir/MacOS"
  cp "$helper_bin" "$dir/MacOS/$name"
  cat > "$dir/Info.plist" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>${name}</string>
  <key>CFBundleDisplayName</key><string>${name}</string>
  <key>CFBundleIdentifier</key><string>$(helper_id "$h")</string>
  <key>CFBundleExecutable</key><string>${name}</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleShortVersionString</key><string>${version}</string>
  <key>CFBundleVersion</key><string>${version}</string>
  <key>LSMinimumSystemVersion</key><string>12.0</string>
  <key>LSUIElement</key><string>1</string>
  <key>LSEnvironment</key><dict><key>MallocNanoZone</key><string>0</string></dict>
  <key>NSSupportsAutomaticGraphicsSwitching</key><true/>
</dict>
</plist>
PLIST
done

# Entitlements under the hardened runtime, as Chromium's own helpers carry them: V8 and SwiftShader
# compile code at run time (JIT); the plugin helper loads code Chromium did not sign.
entitlements_dir="dist/entitlements"
rm -rf "$entitlements_dir"
mkdir -p "$entitlements_dir"
write_entitlements() {
  local file="$1"; shift
  {
    echo '<?xml version="1.0" encoding="UTF-8"?>'
    echo '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">'
    echo '<plist version="1.0"><dict>'
    for k in "$@"; do echo "  <key>$k</key><true/>"; done
    echo '</dict></plist>'
  } > "$file"
}
write_entitlements "$entitlements_dir/Helper.plist" com.apple.security.cs.allow-jit
write_entitlements "$entitlements_dir/Helper (GPU).plist" com.apple.security.cs.allow-jit
write_entitlements "$entitlements_dir/Helper (Renderer).plist" com.apple.security.cs.allow-jit
write_entitlements "$entitlements_dir/Helper (Plugin).plist" com.apple.security.cs.allow-jit \
  com.apple.security.cs.allow-unsigned-executable-memory com.apple.security.cs.disable-library-validation
write_entitlements "$entitlements_dir/Helper (Alerts).plist"

# The window is CEF's browser process: V8 compiles code at run time, and web pages may ask for the
# camera and the microphone.
cat > "$entitlements" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key><true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key><true/>
  <key>com.apple.security.device.audio-input</key><true/>
  <key>com.apple.security.device.camera</key><true/>
</dict>
</plist>
PLIST


# sign <identity> <timestamp flag...>: the CEF framework's libraries, the framework, each helper app
# with its entitlements, the programs, the app.
sign_all() {
  local identity="$1"; shift
  local f
  local cfw="$app/Contents/Frameworks/$cef_framework"
  [ ! -d "$cfw/Libraries" ] || find "$cfw/Libraries" -type f -name '*.dylib' -print0 | while IFS= read -r -d '' f; do
    codesign --force "$@" --options runtime --sign "$identity" "$f"
  done
  codesign --force "$@" --options runtime --sign "$identity" "$cfw"
  local h
  for h in "${helpers[@]}"; do
    codesign --force "$@" --options runtime --entitlements "$entitlements_dir/$h.plist" --sign "$identity" \
      "$app/Contents/Frameworks/Redrob Browser $h.app"
  done
  codesign --force "$@" --options runtime --sign "$identity" "$app/Contents/MacOS/redrob-browser"
  codesign --force "$@" --options runtime --sign "$identity" "$app/Contents/MacOS/redrob-browser-worker"
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
