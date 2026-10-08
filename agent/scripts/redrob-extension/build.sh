#!/usr/bin/env bash
# Build Redrob's agent extension, sign it, and stage what ships:
#
#   $OUT/extensions/  ->  https://cdn.redrob.ai/browser/extensions/
#       <id>-<version>.crx, update-manifest.xml, extensions.json
#   $BUNDLE_DIR/      (optional) the browser's first-run bundle:
#       <id>.crx, bundled_extensions.json
#
# Signed with Redrob's key, so the id is EXTENSION_ID and nothing here involves the upstream
# project's CDN or keys. redrob-browser's tools/agent-extension/build.sh calls this to fill its
# bundle; .github/workflows/redrob-extension.yml calls it to publish the channel.
#
# Inputs
#   REDROB_AGENT_EXTENSION_KEY       PEM private key (the secret), or
#   REDROB_AGENT_EXTENSION_KEY_FILE  a path to one
#   OUT                              staging dir (default: out/redrob-extension)
#   BUNDLE_DIR                       optional; chromium/src/chrome/browser/browseros/bundled_extensions
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
root="$(cd "$here/../.." && pwd)"
out="${OUT:-$root/out/redrob-extension}"
host="https://cdn.redrob.ai/browser/extensions"

key_file="${REDROB_AGENT_EXTENSION_KEY_FILE:-}"
if [ -z "$key_file" ]; then
  [ -n "${REDROB_AGENT_EXTENSION_KEY:-}" ] || { echo "no signing key: set REDROB_AGENT_EXTENSION_KEY" >&2; exit 1; }
  key_file="$(mktemp)"
  trap 'rm -f "$key_file"' EXIT
  printf '%s\n' "$REDROB_AGENT_EXTENSION_KEY" > "$key_file"
fi

(cd "$root" && bun install --frozen-lockfile && cd apps/app && bun run build)
dist="$root/apps/app/dist/chrome-mv3"
version="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["version"])' "$dist/manifest.json")"

mkdir -p "$out/extensions"
id="$(python3 "$here/pack_crx3.py" "$dist" "$key_file" "$out/extensions/agent.crx")"
expected="$(cat "$here/EXTENSION_ID")"
[ "$id" = "$expected" ] || { echo "signed id $id is not EXTENSION_ID $expected: wrong key" >&2; exit 1; }
versioned="$id-$version.crx"
mv "$out/extensions/agent.crx" "$out/extensions/$versioned"
python3 "$here/channel.py" "$out/extensions" "$id" "$version" "$host/$versioned" "$host/update-manifest.xml"
echo "channel staged in $out/extensions ($id $version)"

if [ -n "${BUNDLE_DIR:-}" ]; then
  cp "$out/extensions/$versioned" "$BUNDLE_DIR/$id.crx"
  python3 "$here/channel.py" --bundle "$BUNDLE_DIR" "$id" "$version"
  echo "bundled $id $version into $BUNDLE_DIR"
fi
