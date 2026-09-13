#!/usr/bin/env bash
#
# Publish the signed apt repository to https://cdn.redrob.ai/<prefix>/apt/.
#
# WHY THIS IS NOT cdn-publish.sh. That script publishes a flat file under <version>/ and then moves a
# version-free alias under latest/, which is exactly right for a download a page links. An apt repository cannot
# work that way: a user's sources.list names ONE URL forever, and apt fetches dists/stable/InRelease from it on
# every update. So the tree goes to a fixed prefix, and the two halves of it get opposite cache policies.
#
#   pool/    immutable. A given .deb filename carries its version, so those bytes never change.
#   dists/   short cache. Packages, Release, InRelease and Release.gpg are rewritten by every release, and a
#            client that caches them for a year would never see another update.
#
# The ORDER matters for the same reason it matters in cdn-publish.sh, but the pairing is different: pool first,
# then dists. Release lists checksums for the index, and the index lists the checksum of every .deb -- so if
# dists went up first there would be a window where apt reads an index promising a package the CDN cannot yet
# serve, and reports a hash mismatch rather than a missing file.
#
# The bucket and the credentials are the switch, identically to cdn-publish.sh: without them this says which
# variable is missing and exits 0, because a CDN nobody has provisioned must not redden a release.
#
# Usage: cdn-publish-apt.sh <repo-dir>
# Environment: CDN_PREFIX, CDN_PUBLIC_HOST, REDROB_CDN_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
set -euo pipefail

repo="${1:?a repository directory is required}"
prefix="${CDN_PREFIX:?CDN_PREFIX is required}"
host="${CDN_PUBLIC_HOST:?CDN_PUBLIC_HOST is required}"

if [ -z "${REDROB_CDN_BUCKET:-}" ]; then
  echo "::notice::REDROB_CDN_BUCKET is not set, so the apt repository was not uploaded."
  exit 0
fi
if [ -z "${AWS_ACCESS_KEY_ID:-}" ] || [ -z "${AWS_SECRET_ACCESS_KEY:-}" ]; then
  echo "::notice::CDN credentials are not configured, so the apt repository was not uploaded."
  exit 0
fi

if [ ! -f "$repo/dists/stable/InRelease" ]; then
  echo "$repo has no dists/stable/InRelease: refusing to publish an unsigned or incomplete repository." >&2
  exit 1
fi

content_type() {
  case "$1" in
  *.deb) echo "application/vnd.debian.binary-package" ;;
  *.gz) echo "application/gzip" ;;
  # Release, InRelease and Release.gpg are text apt parses. Serving them as octet-stream works but makes them
  # undebuggable in a browser, which is where anyone diagnosing a broken update channel starts.
  *) echo "text/plain" ;;
  esac
}

put() {
  aws s3 cp "$1" "s3://${REDROB_CDN_BUCKET}/${prefix}/apt/$2" \
    --content-type "$(content_type "$2")" \
    --cache-control "$3" \
    --no-progress
}

# Phase 1: the packages. Immutable, because the filename carries the version.
while IFS= read -r file; do
  rel="${file#"$repo"/}"
  put "$file" "$rel" "public, max-age=31536000, immutable"
done < <(find "$repo/pool" -type f | sort)

# Phase 2: the indexes, only now that every package they name is retrievable.
while IFS= read -r file; do
  rel="${file#"$repo"/}"
  put "$file" "$rel" "public, max-age=300"
done < <(find "$repo/dists" -type f | sort)

# The public signing key, which apt needs in /etc/apt/keyrings before it will accept anything above. Short cache
# like the indexes: rotating a signing key must not be blocked for a year by a CDN edge.
if [ -f "$repo/redrob-signing-key.asc" ]; then
  put "$repo/redrob-signing-key.asc" "redrob-signing-key.asc" "public, max-age=300"
else
  echo "no redrob-signing-key.asc in $repo: users would have nothing to verify the repository with." >&2
  exit 1
fi

# Read InRelease back through CloudFront and compare it. This is the one file whose staleness silently breaks
# every client, and it is the last thing written, so verifying it verifies the ordering as well as the upload.
#
# A missing object is 403 from this CloudFront rather than 404, and the negative response is cached, so the read
# has to outlast that TTL rather than fail on the first attempt -- the same retry shape cdn-publish.sh uses.
local_sum="$(sha256sum "$repo/dists/stable/InRelease" | awk '{print $1}')"
remote="${RUNNER_TEMP:-/tmp}/verify-InRelease"
curl --fail --location --silent --show-error --retry 10 --retry-delay 6 --retry-all-errors \
  -o "$remote" "https://${host}/${prefix}/apt/dists/stable/InRelease"
remote_sum="$(sha256sum "$remote" | awk '{print $1}')"
if [ "$local_sum" != "$remote_sum" ]; then
  echo "Checksum mismatch for InRelease: local=$local_sum remote=$remote_sum" >&2
  exit 1
fi

echo "OK https://${host}/${prefix}/apt/dists/stable/InRelease ($remote_sum)"
echo
echo "A user adds this repository with:"
echo "  curl -fsSL https://${host}/${prefix}/apt/redrob-signing-key.asc \\"
echo "    | sudo tee /etc/apt/keyrings/redrob.asc >/dev/null"
echo "  echo \"deb [signed-by=/etc/apt/keyrings/redrob.asc] https://${host}/${prefix}/apt stable main\" \\"
echo "    | sudo tee /etc/apt/sources.list.d/redrob.list"
