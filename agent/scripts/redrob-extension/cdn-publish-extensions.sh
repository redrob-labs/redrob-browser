#!/usr/bin/env bash
#
# Publish the agent extension channel to https://cdn.redrob.ai/browser/extensions/.
#
# A different shape from cdn-publish.sh on purpose: the browser reads FIXED URLs here
# (extensions.json, update-manifest.xml, baked into browseros_constants.h), so there is no
# versioned/latest split to move. Order still follows that script's rule -- a pointer must
# never resolve before the bytes behind it do:
#
#   1. <id>-<version>.crx  immutable, written once, read back through CloudFront and compared
#   2. update-manifest.xml and extensions.json, short cache, only after (1) verified
#
# The bucket and the credentials are the switch, as in cdn-publish.sh: absent means a notice
# and exit 0, never a red build.
#
# Usage: cdn-publish-extensions.sh <staging-dir/extensions>
# Environment: REDROB_CDN_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, CDN_PUBLIC_HOST
set -euo pipefail

staging="${1:?a staging directory is required}"
host="${CDN_PUBLIC_HOST:?CDN_PUBLIC_HOST is required}"
prefix="browser/extensions"

if [ -z "${REDROB_CDN_BUCKET:-}" ]; then
  echo "::notice::REDROB_CDN_BUCKET is not set, so nothing was uploaded."
  exit 0
fi
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "::notice::CDN credentials are not configured, so nothing was uploaded."
  exit 0
fi

put() {
  aws s3 cp "$1" "s3://${REDROB_CDN_BUCKET}/${prefix}/$2" --content-type "$3" --cache-control "$4" --no-progress
}

shopt -s nullglob
crxs=("$staging"/*.crx)
[ "${#crxs[@]}" -eq 1 ] || { echo "expected exactly one .crx in $staging, found ${#crxs[@]}" >&2; exit 1; }
crx="${crxs[0]}"
name="$(basename "$crx")"
local_sum="$(sha256sum "$crx" | awk '{print $1}')"
tmp="${RUNNER_TEMP:-$(mktemp -d)}"

# A missing object is 403 from this CloudFront, so read the status instead of --fail.
code="$(curl --location --silent --output "$tmp/published.crx" --write-out '%{http_code}' \
  "https://${host}/${prefix}/${name}" || true)"
case "$code" in
200)
  published_sum="$(sha256sum "$tmp/published.crx" | awk '{print $1}')"
  if [ "$published_sum" != "$local_sum" ]; then
    # Same rule as cdn-publish.sh: a published version is authoritative. Changing what a
    # version means requires bumping the extension version.
    echo "::error::${prefix}/${name} is already published with different bytes. Bump the extension version." >&2
    exit 1
  fi
  echo "Already published, unchanged: https://${host}/${prefix}/${name}"
  ;;
403 | 404)
  put "$crx" "$name" "application/x-chrome-extension" "public, max-age=31536000, immutable"
  curl --fail --location --silent --show-error --retry 10 --retry-delay 6 --retry-all-errors \
    -o "$tmp/verify.crx" "https://${host}/${prefix}/${name}"
  remote_sum="$(sha256sum "$tmp/verify.crx" | awk '{print $1}')"
  [ "$remote_sum" = "$local_sum" ] || { echo "Checksum mismatch for $name: local=$local_sum remote=$remote_sum" >&2; exit 1; }
  echo "OK https://${host}/${prefix}/${name} ($remote_sum)"
  ;;
*)
  echo "Could not check ${prefix}/${name}: HTTP ${code}" >&2
  exit 1
  ;;
esac

put "$staging/update-manifest.xml" "update-manifest.xml" "application/xml" "public, max-age=300"
put "$staging/extensions.json" "extensions.json" "application/json" "public, max-age=300"
for f in update-manifest.xml extensions.json; do
  curl --fail --location --silent --show-error --retry 10 --retry-delay 6 --retry-all-errors \
    -o "$tmp/$f" "https://${host}/${prefix}/${f}"
  cmp -s "$tmp/$f" "$staging/$f" || echo "::warning::$f read back differs (a cached older copy expires within 5 minutes)."
done
echo "Channel live: https://${host}/${prefix}/extensions.json"
