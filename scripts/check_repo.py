#!/usr/bin/env python3
"""Repo integrity checks that need NO Chromium checkout.

This exists so CI has something honest to run. A Chromium build needs 40-60 GB of disk and hours of CPU, which
a GitHub-hosted runner does not have, so a workflow that claimed to build the browser on one would be a
decoration. What CAN be checked in seconds is whether this repository is internally consistent -- and that is
where a fork actually rots: a source file nobody copies, a patch named after a path that moved, a version the
changelog has never heard of. Every one of those looks fine locally and breaks the next person's clean build.

Run it directly, or as `redrob.py check`. Exits non-zero with one line per problem.
"""
from __future__ import annotations

import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The manifest's own format: `src<TAB>dst`, one line per destination, comments and blanks allowed. Duplicated
# here rather than imported from redrob.py because this file must stay runnable on a machine with nothing set
# up, and importing the CLI drags in its whole environment contract.
def manifest_pairs(path: pathlib.Path) -> list[tuple[str, str, int]]:
    pairs = []
    for n, line in enumerate(path.read_text().splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        pairs.append((parts[0], parts[1], n))
    return pairs


def check_sources(problems: list[str]) -> None:
    manifest = ROOT / "sources" / "manifest"
    if not manifest.exists():
        problems.append("sources/manifest is missing")
        return
    pairs = manifest_pairs(manifest)
    declared = set()
    for src, dst, n in pairs:
        declared.add(src)
        if not (ROOT / src).exists():
            problems.append(f"sources/manifest:{n} names a source that does not exist: {src}")

    # Orphans matter more than they look. A file under sources/ that the manifest does not copy is never in the
    # build, so it can be edited for weeks with no effect -- the failure mode is a change that "did nothing"
    # rather than an error anyone sees.
    for path in sorted((ROOT / "sources").rglob("*")):
        if not path.is_file() or path.name == "manifest":
            continue
        rel = path.relative_to(ROOT).as_posix()
        if rel not in declared:
            problems.append(f"orphan: {rel} is under sources/ but no manifest line copies it")


def check_branding(problems: list[str]) -> None:
    manifest = ROOT / "branding" / "manifest"
    if not manifest.exists():
        return
    for src, dst, n in manifest_pairs(manifest):
        if not (ROOT / src).exists():
            problems.append(f"branding/manifest:{n} names a source that does not exist: {src}")


def check_patch_names(problems: list[str]) -> None:
    """A patch's filename IS its path, with slashes turned into hyphens.

    That is the convention `ls patches/` relies on to answer "what does this fork change". A patch whose name no
    longer matches the path inside it still applies, so nothing breaks -- it just stops being findable, which is
    the whole point of the naming.
    """
    patches = ROOT / "patches"
    if not patches.exists():
        return
    for patch in sorted(patches.glob("*.patch")):
        text = patch.read_text(errors="replace")
        match = re.search(r"^\+\+\+ b/(.+)$", text, re.MULTILINE)
        if not match:
            problems.append(f"{patch.name} has no +++ b/ header; it is not a usable patch")
            continue
        expected = match.group(1).strip().replace("/", "-") + ".patch"
        if patch.name != expected:
            problems.append(f"{patch.name} should be named {expected} (it patches {match.group(1).strip()})")


def check_versions(problems: list[str]) -> None:
    version_file = ROOT / "REDROB_VERSION"
    if not version_file.exists():
        problems.append("REDROB_VERSION is missing")
        return
    version = version_file.read_text().strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        problems.append(f"REDROB_VERSION is not x.y.z: {version!r}")
    chromium = ROOT / "CHROMIUM_VERSION"
    if not chromium.exists():
        problems.append("CHROMIUM_VERSION is missing")
    elif not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", chromium.read_text().strip()):
        problems.append(f"CHROMIUM_VERSION is not a Chromium tag: {chromium.read_text().strip()!r}")

    # A release whose changelog does not mention it is a release nobody can read.
    changelog = ROOT / "CHANGELOG.md"
    if not changelog.exists():
        problems.append("CHANGELOG.md is missing")
    elif f"## {version}" not in changelog.read_text():
        problems.append(f"CHANGELOG.md has no '## {version}' section for the current REDROB_VERSION")

    # The installer reads the same version from a file inside the Chromium checkout, because that checkout has
    # to be buildable without reaching outside itself. That makes this the one duplicated constant in the repo,
    # so it gets a check: a mismatch would ship a .deb whose version is not the version we tagged, GN and
    # installer.py would still agree with each other, and nothing else would notice.
    info = ROOT / "sources" / "chrome" / "installer" / "linux" / "common" / "redrob-version.txt"
    if not info.exists():
        problems.append("sources/chrome/installer/linux/common/redrob-version.txt is missing; the .deb's "
                        "version would fall back to Chromium's")
    elif info.read_text().strip() != version:
        problems.append(f"redrob-version.txt says {info.read_text().strip()!r} but REDROB_VERSION says "
                        f"{version!r} -- the .deb would be versioned differently from the tag")


def main() -> int:
    problems: list[str] = []
    check_sources(problems)
    check_branding(problems)
    check_patch_names(problems)
    check_versions(problems)
    if problems:
        for problem in problems:
            print(f"FAIL {problem}")
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("ok: sources, branding, patch names and versions are consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
