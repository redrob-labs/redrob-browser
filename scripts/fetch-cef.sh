#!/usr/bin/env bash
# Fetch CEF's prebuilt binary distribution for this machine into <dir> (skipped when <dir> already
# holds it), with export-cef-dir of CEF_VERSION (the `cef` crate's version, 156.3.0+156.0.15 when
# unset). In a GitHub Actions job it also sets CEF_PATH=<dir> for the following steps; elsewhere
# export CEF_PATH=<dir> yourself.
#
#   bash scripts/fetch-cef.sh "$HOME/.local/share/cef"
set -euo pipefail

dir="${1:?usage: fetch-cef.sh <dir>}"
version="${CEF_VERSION:-156.3.0+156.0.15}"

if [ ! -f "$dir/archive.json" ]; then
  tool_root="${RUNNER_TEMP:-${TMPDIR:-/tmp}}/cef-tool"
  tool="$tool_root/bin/export-cef-dir"
  if [ ! -x "$tool" ]; then
    cargo install export-cef-dir --version "=$version" --locked --root "$tool_root"
  fi
  mkdir -p "$(dirname "$dir")"
  "$tool" --force "$dir"
fi
if [ ! -f "$dir/libcef.so" ] && [ ! -d "$dir/Chromium Embedded Framework.framework" ]; then
  echo "$dir holds no CEF runtime for this platform" >&2
  exit 1
fi
if [ -n "${GITHUB_ENV:-}" ]; then
  echo "CEF_PATH=$dir" >> "$GITHUB_ENV"
fi
echo "CEF at $dir"
