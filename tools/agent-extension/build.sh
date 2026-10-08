#!/usr/bin/env bash
# Put Redrob's agent extension into this browser's first-run bundle.
#
# The bundle (chrome/browser/browseros/bundled_extensions/<id>.crx + bundled_extensions.json) is
# what a first run installs before any network fetch; rewrite/.../bundled_extensions/BUILD.gn.yaml
# names exactly that CRX. The extension is built and signed by the agent's own script under
# agent/, so this file only checks the id the browser expects. The agent lives in this repository,
# so the commit being built is the agent commit -- there is no separate pin to drift.
#
# Inputs
#   REDROB_AGENT_EXTENSION_KEY or REDROB_AGENT_EXTENSION_KEY_FILE  the signing key
#   SRC        Chromium checkout (default: ../../chromium/src)
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
repo="$(cd "$here/../.." && pwd)"
agent="$repo/agent"
src="${SRC:-$repo/chromium/src}"

[ "$(cat "$here/EXTENSION_ID")" = "$(cat "$agent/scripts/redrob-extension/EXTENSION_ID")" ] || {
  echo "EXTENSION_ID differs from the agent repository's; the browser would ask for the wrong id" >&2
  exit 1
}

OUT="${OUT:-$repo/out/agent-extension}" BUNDLE_DIR="$src/chrome/browser/browseros/bundled_extensions" \
  bash "$agent/scripts/redrob-extension/build.sh"
