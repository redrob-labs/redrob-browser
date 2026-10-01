#!/usr/bin/env python3
# Copyright 2026 Redrob. Portions copyright The Chromium Authors.
# Use of this source code is governed by a BSD-style license that can be
# found in the LICENSE file.

"""Vendor the built `redrob-extension` into this tree as a COMPONENT EXTENSION, and fail when it drifts.

WHY VENDOR AT ALL. `redrobPrivate` and `settingsPrivate` are gated on `location: component`
(rewrite/chrome/common/extensions/api/_permission_features.json.yaml). An extension loaded at runtime --
unpacked, sideloaded, or from a store -- is NOT a component extension and is refused those APIs, so every
surface the extension renders (settings, onboarding, the side panel, the new tab) shows its honest "cannot
reach the browser" banner and nothing works. The only path Chromium grants the permission on is a
component extension whose files live in the resource bundle. That means the built extension has to be IN
this tree before the build starts, exactly like the design system's tokens.

WHAT IS VENDORED. The extension's `dist/` with two prunings: source maps, which are a debugging artifact
no shipped build serves, and `debug-chrome.js`, which exists to drive a dev browser. Everything else is
copied byte for byte. The script never edits a shipped file, with ONE exception recorded in the manifest
below: it injects `key` into `manifest.json`, because the extension id Chromium derives from that key is
what the component-extension allowlist names, and the dev-loaded copy must not share the shipped id.

WHAT IS GENERATED. `resources.grd` -- one `<include>` per vendored file -- and `VENDOR.json`, which pins
the extension's version, the commit it was built from, and a sha256 per file. The grd is generated rather
than hand-written because the file list changes with every extension build (hashed chunk names), and a
hand-written list fails the only way that matters: silently, by shipping an extension missing one chunk.

WHAT THE GATE PROVES (scripts/check_repo.py). That the grd and the tree agree in both directions, that no
two files collide onto one resource name, and that the id in extensions/common/constants.cc is the id
Chromium will actually derive from the vendored manifest's key. A mismatch there loads an extension that
is not on the allowlist, which fails as a silently permission-less extension rather than as an error.

USAGE
  python3 scripts/vendor_extension.py                       # check; exits 1 on drift. What CI runs.
  python3 scripts/vendor_extension.py --update --from DIR   # re-vendor from a built extension checkout
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "sources/chrome/browser/resources/redrob_extension"
GRD = VENDOR / "resources.grd"
PIN = VENDOR / "VENDOR.json"

# Resource paths are served under this prefix, and ComponentLoader::AddRedrobExtension passes the same
# string as the extension's root directory. The two have to match or every file 404s inside the extension.
RESOURCE_PREFIX = "redrob_extension"
IDR_PREFIX = "IDR_REDROB_EXTENSION_"

# Dropped from the shipped copy. Source maps are debugging artifacts; debug-chrome.js drives a dev browser.
SKIP_SUFFIXES = (".map",)
SKIP_NAMES = ("debug-chrome.js",)

# This repository's own files, which live in the vendored directory because grit resolves `file=` relative
# to the grd and GN resolves a target relative to its BUILD.gn. They are never shipped INSIDE the
# extension, so they are excluded from the resource list -- and from the pin, which is what the gate
# compares the tree against.
BOOKKEEPING = frozenset({"resources.grd", "VENDOR.json", "BUILD.gn"})

# The public half of the component extension's keypair. The private half is NOT in this repository and is
# not needed to build: a component extension is loaded from the resource bundle, never signed into a .crx.
# It exists only so the id is stable, and so the dev-loaded extension (no key, id derived from its path)
# cannot be mistaken for the shipped one. Regenerate both halves only to rotate the id, which also means
# editing the constant in extensions/common/constants.cc -- the gate refuses the pair out of step.
MANIFEST_KEY = (
    "MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA1rtRpUSRS4wTWLBK+j1CR+3vkTpcOlaerFG/4BN+Akx4uY+SX5KW"
    "ddMZYBUb4XvNCbsRqQpxpu8zgW25i/y3+RljhXFnwLlpgFTuEje1Kq4C2eLBosyI91wSWtdt4jFWeFJFQSVpWzaSSChmnZop"
    "sIHOFkxttG7PNwfVVsth777yxekQsli2wiV1CKrGXipxdSE2M1PzXfDGJW1mXXpQ2RRfowCdOjWf8TTIyTqE9S+VR2qQtx0Q"
    "U7B5+V46eTRKsWozQ8/pKyuc9XVrRtin0Lsk+OwwGP8l0uQLL9DHWL6QaDt39llkC5W+9ck3+qStzZb4Di9e2fl6qKGqE20Z"
    "1wIDAQAB"
)


def derive_extension_id(manifest_key: str) -> str:
    """The id Chromium computes for this key: sha256(DER)[:16], hex nibbles mapped 0-f -> a-p.

    Mirrors crx_file::id_util::GenerateId. Kept here so the allowlist constant has one source.
    """
    der = base64.b64decode(manifest_key)
    digest = hashlib.sha256(der).hexdigest()[:32]
    return "".join(chr(ord("a") + int(c, 16)) for c in digest)


def resource_name(relative: str) -> str:
    """IDR name for a vendored path. Collisions are an error, not a rename -- see check()."""
    sanitized = "".join(c if c.isalnum() else "_" for c in relative.upper())
    return IDR_PREFIX + sanitized


def shipped(relative: Path) -> bool:
    if relative.as_posix() in BOOKKEEPING:
        return False
    if relative.name in SKIP_NAMES:
        return False
    return not relative.name.endswith(SKIP_SUFFIXES)


def walk(root: Path) -> list[Path]:
    """Every shipped file under root, relative and sorted, so the grd is byte-stable across machines."""
    found = [p.relative_to(root) for p in root.rglob("*") if p.is_file()]
    return sorted((p for p in found if shipped(p)), key=lambda p: p.as_posix())


def sha256_of(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def render_grd(files: list[Path]) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<!-- GENERATED by scripts/vendor_extension.py. Do not edit: re-vendor instead. -->",
        '<grit latest_public_release="0" current_release="1">',
        "  <outputs>",
        '    <output filename="grit/redrob_extension_resources.h" type="rc_header">',
        "      <emit emit_type='prepend'></emit>",
        "    </output>",
        '    <output filename="grit/redrob_extension_resources_map.cc" type="resource_file_map_source" />',
        '    <output filename="grit/redrob_extension_resources_map.h" type="resource_map_header" />',
        '    <output filename="redrob_extension_resources.pak" type="data_package" />',
        "  </outputs>",
        '  <release seq="1">',
        "    <includes>",
    ]
    for relative in files:
        posix = relative.as_posix()
        lines.append(
            f'      <include name="{resource_name(posix)}" file="{posix}"'
            f' resource_path="{RESOURCE_PREFIX}/{posix}" type="BINDATA" />'
        )
    lines += ["    </includes>", "  </release>", "</grit>", ""]
    return "\n".join(lines)


def git_sha(repo: Path) -> str:
    try:
        out = subprocess.run(
            ["git", "-C", str(repo), "rev-parse", "HEAD"],
            check=True,
            capture_output=True,
            text=True,
        )
        return out.stdout.strip()
    except (subprocess.CalledProcessError, FileNotFoundError):
        return "unknown"


def update(source_repo: Path) -> int:
    dist = source_repo / "dist"
    manifest_path = dist / "manifest.json"
    if not manifest_path.is_file():
        sys.exit(f"no built extension at {dist} (run `npm run build` in {source_repo})")

    # Clear the previous vendoring so a file the extension stopped shipping disappears here too, but keep
    # this repository's own files in place -- BUILD.gn is checked in, not vendored.
    if VENDOR.exists():
        for child in sorted(VENDOR.iterdir()):
            if child.name in BOOKKEEPING and child.is_file():
                continue
            shutil.rmtree(child) if child.is_dir() else child.unlink()
    VENDOR.mkdir(parents=True, exist_ok=True)

    files = walk(dist)
    if not files:
        sys.exit(f"{dist} has no shippable files")

    for relative in files:
        target = VENDOR / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(dist / relative, target)

    manifest = json.loads((VENDOR / "manifest.json").read_text(encoding="utf-8"))
    manifest["key"] = MANIFEST_KEY
    # `storage.managed_schema` names a file the policy code OPENS FROM DISK -- it is not read through the
    # resource bundle. A component extension has no directory, so the key makes the browser log
    # "File does not exist: .../resources/redrob_extension/managed_schema.json" on every single launch and
    # still provide no managed storage. Shipping the loose file would mean a copy target plus an installer
    # entry per platform, for a feature a component extension does not need: policy for a browser-owned
    # extension is set by the browser's own policy, not by an extension schema. So the key is dropped from
    # the SHIPPED copy only; the dev-loaded extension, which does have a directory, keeps it.
    dropped_managed_schema = "managed_schema" in manifest.get("storage", {})
    if dropped_managed_schema:
        storage = {k: v for k, v in manifest["storage"].items() if k != "managed_schema"}
        if storage:
            manifest["storage"] = storage
        else:
            del manifest["storage"]
    # Sorted keys and a trailing newline so re-vendoring the same build is a no-op diff.
    (VENDOR / "manifest.json").write_text(
        json.dumps(manifest, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )

    GRD.write_text(render_grd(files), encoding="utf-8")
    PIN.write_text(
        json.dumps(
            {
                "extension_version": manifest.get("version", "unknown"),
                "extension_commit": git_sha(source_repo),
                "extension_id": derive_extension_id(MANIFEST_KEY),
                "file_count": len(files),
                "total_bytes": sum((VENDOR / f).stat().st_size for f in files),
                "files": {f.as_posix(): sha256_of(VENDOR / f) for f in files},
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"vendored {len(files)} files from {dist}")
    print(f"extension id {derive_extension_id(MANIFEST_KEY)}")
    return 0


def check() -> int:
    problems: list[str] = []
    if not PIN.is_file() or not GRD.is_file():
        print(f"redrob_extension: not vendored ({PIN} missing)", file=sys.stderr)
        return 1

    pin = json.loads(PIN.read_text(encoding="utf-8"))
    on_disk = walk(VENDOR)

    recorded = set(pin.get("files", {}))
    actual = {p.as_posix() for p in on_disk}
    for extra in sorted(actual - recorded):
        problems.append(f"vendored but not pinned: {extra}")
    for missing in sorted(recorded - actual):
        problems.append(f"pinned but not vendored: {missing}")
    for name in sorted(actual & recorded):
        digest = sha256_of(VENDOR / name)
        if digest != pin["files"][name]:
            problems.append(f"content drifted from the pin: {name}")

    expected_grd = render_grd(on_disk)
    if GRD.read_text(encoding="utf-8") != expected_grd:
        problems.append("resources.grd does not match the vendored tree; re-vendor")

    seen: dict[str, str] = {}
    for p in on_disk:
        name = resource_name(p.as_posix())
        if name in seen:
            problems.append(f"resource name collision {name}: {seen[name]} and {p.as_posix()}")
        seen[name] = p.as_posix()

    manifest_file = VENDOR / "manifest.json"
    if manifest_file.is_file():
        manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
        if manifest.get("key") != MANIFEST_KEY:
            problems.append("vendored manifest.json does not carry the component extension key")
        for permission in ("redrobPrivate", "settingsPrivate"):
            if permission not in manifest.get("permissions", []):
                problems.append(f"vendored manifest.json does not request {permission}")
        # See update(): this key names a file the policy code opens from disk, which a component extension
        # has none of. Its presence is one logged error per launch and no managed storage either way.
        if "managed_schema" in manifest.get("storage", {}):
            problems.append(
                "vendored manifest.json still declares storage.managed_schema, which cannot be served "
                "from the resource bundle -- re-vendor so it is dropped from the shipped copy"
            )
    else:
        problems.append("vendored manifest.json missing")

    derived = derive_extension_id(MANIFEST_KEY)
    if pin.get("extension_id") != derived:
        problems.append(f"VENDOR.json id {pin.get('extension_id')} is not the id this key derives ({derived})")

    for problem in problems:
        print(f"redrob_extension: {problem}", file=sys.stderr)
    if problems:
        print("fix with: python3 scripts/vendor_extension.py --update --from <redrob-extension>", file=sys.stderr)
        return 1
    print(f"redrob_extension: {len(on_disk)} files vendored, grd and pin agree, id {derived}")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--update", action="store_true", help="re-vendor from a built extension checkout")
    parser.add_argument("--from", dest="source", help="path to a redrob-extension checkout with dist/ built")
    args = parser.parse_args()
    if args.update:
        if not args.source:
            sys.exit("--update needs --from <path to a redrob-extension checkout>")
        return update(Path(args.source).resolve())
    return check()


if __name__ == "__main__":
    sys.exit(main())
