#!/usr/bin/env bash
# Bundle Redrob Browser.app from target/release, sign it with the Developer ID in
# APPLE_CODESIGN_CERT_P12_BASE64, notarize it with the App Store Connect API key, staple, and zip it
# to dist/release/redrob-browser-macos-arm64-<version>.zip.
#
#   bash scripts/package-macos.sh 0.1.0
#
# Without the signing secrets (a fork, a local run) the bundle is left unsigned and the zip is
# still written, so the build can be checked.
set -euo pipefail

version="$1"
app="dist/Redrob Browser.app"
rm -rf "$app"
mkdir -p "$app/Contents/MacOS" "$app/Contents/Resources" dist/release

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

zip_name="dist/release/redrob-browser-macos-arm64-${version}.zip"

if [ -z "${APPLE_CODESIGN_CERT_P12_BASE64:-}" ]; then
  echo "no signing secrets: leaving the bundle unsigned"
  ditto -c -k --keepParent "$app" "$zip_name"
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

# Inner programs first, then the bundle: a bundle signature covers what is inside it.
for bin in "$app/Contents/MacOS/redrob-browser" "$app/Contents/MacOS/redrob-browser-worker" "$app/Contents/MacOS/redrob-browser-protected" "$app/Contents/MacOS/Redrob Browser"; do
  codesign --force --timestamp --options runtime --sign "$identity" "$bin"
done
codesign --force --timestamp --options runtime --sign "$identity" "$app"
codesign --verify --deep --strict "$app"

echo "$APPLE_NOTARY_API_KEY_P8_BASE64" | base64 --decode > "$work/key.p8"
ditto -c -k --keepParent "$app" "$work/notarize.zip"
xcrun notarytool submit "$work/notarize.zip" --key "$work/key.p8" --key-id "$APPLE_NOTARY_API_KEY_ID" \
  --issuer "$APPLE_NOTARY_API_ISSUER_ID" --wait
xcrun stapler staple "$app"
spctl --assess --type execute --verbose "$app"

ditto -c -k --keepParent "$app" "$zip_name"
security delete-keychain "$keychain"
echo "wrote $zip_name"
