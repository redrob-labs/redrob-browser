#!/usr/bin/env python3
"""Write and sign the update manifest the browser checks once a day.

    write_update_manifest.py --version 0.1.0 --dir dist --out dist/latest.json

Writes latest.json ({"version", "files": {platform: {"url", "sha256"}}}) and latest.json.sig, the
base64 Ed25519 signature over latest.json's exact bytes. The key is SPARKLE_ED_PRIVATE_KEY: base64 of
the 32-byte seed, the same key the Chromium-based browser signed its Sparkle feed with. The script
refuses a key whose public half is not the one built into the browser (updater.rs), because a
manifest signed with any other key is one no installed browser accepts.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import pathlib
import sys

from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from cryptography.hazmat.primitives.serialization import Encoding, PublicFormat

PUBLIC_KEY = "5lWrkUbHu7MqrCIW4bmFzx1KUoIqx8ugydJSAcAZXlQ="
CDN = "https://cdn.redrob.ai/browser"
PLATFORMS = {
    "linux-x64": "redrob-browser-linux-x64-{v}.tar.gz",
    "macos-arm64": "redrob-browser-macos-arm64-{v}.zip",
    "windows-x64": "redrob-browser-windows-x64-{v}.zip",
}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--version", required=True)
    ap.add_argument("--dir", required=True, type=pathlib.Path)
    ap.add_argument("--out", required=True, type=pathlib.Path)
    a = ap.parse_args()

    seed = base64.b64decode(os.environ["SPARKLE_ED_PRIVATE_KEY"])
    key = Ed25519PrivateKey.from_private_bytes(seed)
    public = base64.b64encode(key.public_key().public_bytes(Encoding.Raw, PublicFormat.Raw)).decode()
    if public != PUBLIC_KEY:
        print("refusing: SPARKLE_ED_PRIVATE_KEY does not match the browser's update key", file=sys.stderr)
        return 1

    files = {}
    for platform, pattern in PLATFORMS.items():
        name = pattern.format(v=a.version)
        path = a.dir / name
        if not path.exists():
            print(f"missing {path}", file=sys.stderr)
            return 1
        files[platform] = {
            "url": f"{CDN}/{a.version}/{name}",
            "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
        }

    body = json.dumps({"version": a.version, "files": files}, indent=2, sort_keys=True).encode() + b"\n"
    a.out.write_bytes(body)
    sig = base64.b64encode(key.sign(body)).decode()
    a.out.with_name(a.out.name + ".sig").write_text(sig + "\n")
    print(f"wrote {a.out} for {a.version}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
