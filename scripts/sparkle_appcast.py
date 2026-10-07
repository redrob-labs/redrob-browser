#!/usr/bin/env python3
"""Write a Sparkle appcast for one signed macOS archive, EdDSA-signed with Redrob's update key.

    sparkle_appcast.py --archive redrob-browser-macos-arm64-0.1.6.zip \
        --url https://cdn.redrob.ai/browser/0.1.6/redrob-browser-macos-arm64-0.1.6.zip \
        --out appcast.xml

The private key is read from the SPARKLE_ED_PRIVATE_KEY environment variable: base64 of the 32-byte
Ed25519 seed, the same format Sparkle's own `generate_keys -x` exports, so `sign_update --ed-key-file`
accepts it too. The public half is SUPublicEDKey in rewrite/chrome/app/app-Info.plist.yaml; the script
refuses to sign with a key whose public half is not that one, because an appcast signed with any other
key is an update no installed browser will accept.

sparkle:version and sparkle:shortVersionString are read from the Info.plist INSIDE the archive. Sparkle
compares sparkle:version against the installed app's CFBundleVersion, so taking it from the bytes being
published is what keeps the two in lockstep.

The appcast lists only the newest release: Sparkle needs nothing more to offer it, and a feed that
accumulates items is a second history to keep consistent with the CDN.
"""
from __future__ import annotations

import argparse
import base64
import email.utils
import os
import plistlib
import re
import sys
import zipfile
from pathlib import Path
from xml.sax.saxutils import escape, quoteattr

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey

ROOT = Path(__file__).resolve().parent.parent
PLIST_RULE = ROOT / "rewrite" / "chrome" / "app" / "app-Info.plist.yaml"
SPARKLE_NS = "http://www.andymatuschak.org/xml-namespaces/sparkle"


def shipped_public_key() -> str:
    match = re.search(r"<key>SUPublicEDKey</key>\\n\s*<string>([A-Za-z0-9+/=]+)</string>",
                      PLIST_RULE.read_text(encoding="utf-8"))
    if not match:
        sys.exit(f"no SUPublicEDKey in {PLIST_RULE.relative_to(ROOT)}")
    return match.group(1)


def load_key() -> Ed25519PrivateKey:
    encoded = os.environ.get("SPARKLE_ED_PRIVATE_KEY", "").strip()
    if not encoded:
        sys.exit("SPARKLE_ED_PRIVATE_KEY is not set")
    raw = base64.b64decode(encoded)
    # Sparkle exports the 32-byte seed; older tooling wrote seed + public key (64 bytes).
    if len(raw) not in (32, 64):
        sys.exit(f"SPARKLE_ED_PRIVATE_KEY decodes to {len(raw)} bytes, not an Ed25519 seed")
    key = Ed25519PrivateKey.from_private_bytes(raw[:32])
    public = base64.b64encode(key.public_key().public_bytes(
        serialization.Encoding.Raw, serialization.PublicFormat.Raw)).decode()
    if public != shipped_public_key():
        sys.exit("SPARKLE_ED_PRIVATE_KEY does not match the SUPublicEDKey the browser ships; "
                 "installed browsers would reject this update")
    return key


def app_versions(archive: Path) -> tuple[str, str, str]:
    """(CFBundleVersion, CFBundleShortVersionString, LSMinimumSystemVersion) of the archived app."""
    with zipfile.ZipFile(archive) as zf:
        names = [n for n in zf.namelist() if re.fullmatch(r"[^/]+\.app/Contents/Info\.plist", n)]
        if len(names) != 1:
            sys.exit(f"{archive.name}: expected one top-level .app Info.plist, found {names}")
        info = plistlib.loads(zf.read(names[0]))
    try:
        return info["CFBundleVersion"], info["CFBundleShortVersionString"], info.get(
            "LSMinimumSystemVersion", "13.0")
    except KeyError as missing:
        sys.exit(f"{archive.name}: Info.plist has no {missing}")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--url", required=True, help="where the archive is published")
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()

    key = load_key()
    data = args.archive.read_bytes()
    signature = base64.b64encode(key.sign(data)).decode()
    bundle_version, short_version, minimum = app_versions(args.archive)

    item = (
        f"    <item>\n"
        f"      <title>{escape('Redrob Browser ' + short_version)}</title>\n"
        f"      <pubDate>{email.utils.formatdate(usegmt=True)}</pubDate>\n"
        f"      <sparkle:version>{escape(bundle_version)}</sparkle:version>\n"
        f"      <sparkle:shortVersionString>{escape(short_version)}</sparkle:shortVersionString>\n"
        f"      <sparkle:minimumSystemVersion>{escape(minimum)}</sparkle:minimumSystemVersion>\n"
        f"      <enclosure url={quoteattr(args.url)} length=\"{len(data)}\" type=\"application/octet-stream\"\n"
        f"                 sparkle:edSignature={quoteattr(signature)} />\n"
        f"    </item>\n"
    )
    feed = (
        '<?xml version="1.0" encoding="utf-8"?>\n'
        f'<rss version="2.0" xmlns:sparkle="{SPARKLE_NS}">\n'
        "  <channel>\n"
        "    <title>Redrob Browser</title>\n"
        f"{item}"
        "  </channel>\n"
        "</rss>\n"
    )
    args.out.write_text(feed, encoding="utf-8")
    print(f"{args.out}: {short_version} (CFBundleVersion {bundle_version}), {len(data)} bytes, signed")


if __name__ == "__main__":
    main()
