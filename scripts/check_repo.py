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
    pairs = manifest_pairs(manifest)
    for src, dst, n in pairs:
        if not (ROOT / src).exists():
            problems.append(f"branding/manifest:{n} names a source that does not exist: {src}")

    # Every icon the LINUX INSTALLER ships must be one we own.
    #
    # This list is mirrored from chrome/installer/linux/BUILD.gn's theme_files target, and a Chromium roll can
    # change it -- re-read that target when the pin moves. It is hardcoded anyway because the failure it catches
    # is invisible from every other angle: product_logo_32.png under default_100_percent/chromium/linux/ was
    # missing while a 32px icon and a linux/32 icon both existed at other paths, so the set looked complete and
    # the .deb shipped Chromium's blue globe at the size a Linux launcher actually shows.
    installer_icons = {
        "chrome/app/theme/chromium/linux/product_logo_24.png",
        "chrome/app/theme/chromium/linux/product_logo_48.png",
        "chrome/app/theme/chromium/linux/product_logo_64.png",
        "chrome/app/theme/chromium/linux/product_logo_128.png",
        "chrome/app/theme/chromium/linux/product_logo_256.png",
        "chrome/app/theme/default_100_percent/chromium/linux/product_logo_16.png",
        "chrome/app/theme/default_100_percent/chromium/linux/product_logo_32.png",
    }
    covered = {dst for _, dst, _ in pairs}
    for icon in sorted(installer_icons - covered):
        problems.append(f"the Linux installer ships {icon} and branding/manifest does not overwrite it, so the "
                        f"package would carry Chromium's icon")


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


def check_strings(problems: list[str]) -> None:
    """The generated grd/xtb/header must match l10n/*.tsv, and every $i18n{} key must exist.

    Both failures are SILENT by construction, which is why they are checked rather than trusted. A stale .grd
    still compiles and still ships -- with the previous release's strings. A $i18n{key} nothing defines is
    served to the page as literal text, so the user sees `$i18n{obContinue}` on a button and the build is green.
    """
    if not (ROOT / "l10n").exists():
        return
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        import gen_strings  # noqa: PLC0415
    except Exception as exc:  # pragma: no cover
        problems.append(f"scripts/gen_strings.py is not importable: {exc}")
        return
    try:
        files, rows = gen_strings.generate()
    except SystemExit as exc:
        problems.append(f"l10n/*.tsv is not valid: {exc}")
        return
    for path, text in files.items():
        rel = path.relative_to(ROOT).as_posix()
        if not path.exists():
            problems.append(f"{rel} is missing; run scripts/gen_strings.py")
        elif path.read_text(encoding="utf-8") != text:
            problems.append(f"{rel} is stale against l10n/*.tsv; run scripts/gen_strings.py")

    keys = {key for key, *_ in rows}
    # Supplied by webui::SetLoadTimeDataDefaults rather than by our own table.
    keys |= {"language", "textdirection", "fontfamily", "fontfamilyMd", "fontsize",
             "roundedIconsAttribute", "webuiRoundedIconsEnabled", "webuiRoundedIconsAttribute"}
    resources = ROOT / "sources" / "chrome" / "browser" / "resources"
    for path in sorted(list(resources.rglob("*.html")) + list(resources.rglob("*.ts"))):
        text = path.read_text(encoding="utf-8")
        # (?:Raw)? and not Raw?: the second form makes the "Ra" mandatory, so it matches $i18nRaw{} and
        # NOTHING else -- the check passed on every file while seeing none of the ordinary $i18n{} keys.
        used = set(re.findall(r"\$i18n(?:Raw)?\{([^}]+)\}", text))
        used |= set(re.findall(r"loadTimeData\.getStringF?\('([^']+)'", text))
        for key in sorted(used - keys):
            problems.append(f"{path.relative_to(ROOT).as_posix()} uses the string {key!r}, which no "
                            f"l10n/*.tsv row defines")


def check_sources_match_checkout(problems: list[str]) -> None:
    """When a checkout is present, every manifest source must equal what is in it.

    `apply` copies sources/ INTO the checkout, so an edit made in the checkout to a file this repo owns is
    silently discarded by the next apply -- and `export` does not catch it, because a sources/-owned file is
    deliberately excluded from its untracked-file report. That is not hypothetical: the macOS
    ui_font_bundle_data target lived only in the checkout for a whole release, while chrome/BUILD.gn's patch
    depended on it, so the first macOS build would have failed at gn gen on a target that no longer existed.

    Skipped entirely with no checkout, which is the normal case in CI -- this is a local-work check.
    """
    src_root = ROOT / "chromium" / "src"
    if not src_root.exists():
        return
    manifest = ROOT / "sources" / "manifest"
    if not manifest.exists():
        return
    for src, dst, n in manifest_pairs(manifest):
        ours, theirs = ROOT / src, src_root / dst
        if not ours.exists() or not theirs.exists():
            continue
        if ours.read_bytes() != theirs.read_bytes():
            problems.append(f"{src} differs from the checkout's {dst}. sources/ is authoritative and apply "
                            f"overwrites the checkout, so if the checkout has the newer edit, copy it back "
                            f"before the next apply throws it away")


def main() -> int:
    problems: list[str] = []
    check_sources(problems)
    check_branding(problems)
    check_patch_names(problems)
    check_versions(problems)
    check_strings(problems)
    check_sources_match_checkout(problems)
    if problems:
        for problem in problems:
            print(f"FAIL {problem}")
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("ok: sources, branding, patch names, versions and strings are consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
