#!/usr/bin/env bash
# Put Redrob's agent extension into this browser's first-run bundle.
#
# The bundle (chrome/browser/browseros/bundled_extensions/<id>.crx + bundled_extensions.json) is
# what a first run installs before any network fetch; rewrite/.../bundled_extensions/BUILD.gn.yaml
# names exactly that CRX. The extension is built and signed by the agent repository's own script,
# so this file only pins WHICH agent commit and checks the id the browser expects.
#
# Inputs
#   AGENT_DIR  checkout of redrob-labs/redrob-browser-agent at ./AGENT_REF
#   REDROB_AGENT_EXTENSION_KEY or REDROB_AGENT_EXTENSION_KEY_FILE  the signing key
#   SRC        Chromium checkout (default: ../../chromium/src)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
agent="${AGENT_DIR:?AGENT_DIR is required}"
src="${SRC:-$repo/chromium/src}"

want="$(cat "$here/AGENT_REF")"
have="$(git -C "$agent" rev-parse HEAD)"
[ "$want" = "$have" ] || { echo "agent checkout is $have, AGENT_REF pins $want" >&2; exit 1; }
[ "$(cat "$here/EXTENSION_ID")" = "$(cat "$agent/scripts/redrob-extension/EXTENSION_ID")" ] || {
  echo "EXTENSION_ID differs from the agent repository's; the browser would ask for the wrong id" >&2
  exit 1
}

OUT="${OUT:-$repo/out/agent-extension}" BUNDLE_DIR="$src/chrome/browser/browseros/bundled_extensions" \
  bash "$agent/scripts/redrob-extension/build.sh"
