#!/usr/bin/env python3
"""Do the release assets carry a name Redrob Launcher can install?

Redrob Launcher installs an asset only when its name reads

    <stem>-<version>-<os>-<arch>[-portable].<ext>

with stem `redrob-browser`, a bare version (no `v`), one of the launcher's os-arch tokens (linux-x86_64,
macos-aarch64, windows-x64, ...) and an extension it knows how to install: .deb/.rpm/.AppImage/.tar.gz on
Linux, .dmg on macOS, .msi or -portable.zip on Windows. The parser below is a transliteration of
redrob-launcher's crates/core/src/platform.rs (parse_asset_name + Platform::tokens); keep them in step.

The packager's own names stay beside the launcher's, because other consumers depend on them exactly:
the Debian name is the apt pool/ convention, `redrob-browser-macos-<arch>-<version>.zip` is what the Sparkle
appcast and cdn-publish.sh key on, and the `-setup.exe` is the signed Windows installer. Those are passed
through; this script only insists that every platform a release ships ALSO has a launcher-readable asset, and
that the release carries `redrob-launcher.json` (schema 1, sharedAccount true -- redrob-launcher's
docs/release-manifest.md), which sign-and-publish.yml writes beside the renamed assets.

    check_asset_names.py --dir out/artifacts        # what `redrob.py package` wrote
    check_asset_names.py --release v0.1.9           # what is on a GitHub release (needs gh)
    check_asset_names.py --names a.deb b.zip ...    # any list
    check_asset_names.py --manifest launcher/redrob-launcher.json   # the launcher manifest's content alone
    check_asset_names.py --self-test                # the parser against known-good and known-bad names
"""
from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import tempfile
from pathlib import Path

STEM = "redrob-browser"

# The one more asset every release carries beside its installers: redrob-launcher/docs/release-manifest.md.
# Redrob Launcher reads it from the release's own download URL to learn that this version reads the launcher's
# shared account file, so a release without it is a release the launcher has to guess about.
MANIFEST = "redrob-launcher.json"
MANIFEST_TEXT = '{ "schema": 1, "sharedAccount": true }\n'

# Suffix order matters: `-portable.zip` and `.tar.gz` must win over a shorter match. Same list as the
# launcher's KINDS.
KINDS: list[tuple[str, str]] = [
    ("portable-zip", "-portable.zip"),
    ("tar.gz", ".tar.gz"),
    ("msi", ".msi"),
    ("dmg", ".dmg"),
    ("AppImage", ".AppImage"),
    ("deb", ".deb"),
    ("rpm", ".rpm"),
]

# Every token Platform::tokens can look for, and which kinds install on that OS.
TOKENS: dict[str, set[str]] = {
    "windows-x64": {"msi", "portable-zip"},
    "windows-x86": {"msi", "portable-zip"},
    "windows-arm64": {"msi", "portable-zip"},
    "macos-universal": {"dmg"},
    "macos-aarch64": {"dmg"},
    "macos-arm64": {"dmg"},
    "macos-x86_64": {"dmg"},
    "linux-x86_64": {"AppImage", "deb", "rpm", "tar.gz"},
    "linux-aarch64": {"AppImage", "deb", "rpm", "tar.gz"},
    "linux-riscv64": {"AppImage", "deb", "rpm", "tar.gz"},
}

# What the launcher's version parser accepts: digits-first semver with an optional pre-release.
VERSION = re.compile(r"^\d+\.\d+\.\d+(-[0-9A-Za-z.]+)?$")


def parse(name: str) -> dict[str, str] | None:
    """`{stem, version, token, kind}` when the launcher would read this name, else None."""
    for kind, suffix in KINDS:
        if name.endswith(suffix):
            base = name[: -len(suffix)]
            break
    else:
        return None
    if not base.startswith(STEM + "-"):
        return None
    rest = base[len(STEM) + 1:]
    # rest = <version>-<os>-<arch>; os and arch never contain '-', versions may.
    parts = rest.rsplit("-", 2)
    if len(parts) != 3:
        return None
    version, os_, arch = parts
    if not VERSION.match(version):
        return None
    token = f"{os_}-{arch}"
    if token not in TOKENS or kind not in TOKENS[token]:
        return None
    return {"stem": STEM, "version": version, "token": token, "kind": kind}


def launcher_name(version: str, token: str, kind: str) -> str:
    """The one name the launcher reads for this version, platform token and package kind."""
    suffix = dict(KINDS)[kind]
    return f"{STEM}-{version}-{token}{suffix}"


# Which packager output means "this release ships platform X", and what the launcher then needs to see.
# Each entry: a regex over the packager's own names, the launcher token, and the kinds that satisfy it.
PLATFORMS: list[tuple[str, re.Pattern[str], str, set[str]]] = [
    ("Linux x86_64", re.compile(r"_amd64\.deb$"), "linux-x86_64", {"deb"}),
    ("Linux aarch64", re.compile(r"_arm64\.deb$"), "linux-aarch64", {"deb"}),
    ("Windows x64", re.compile(r"-x64-.*-setup\.exe$"), "windows-x64", {"msi", "portable-zip"}),
    ("macOS arm64", re.compile(r"-macos-arm64-.*\.app\.zip$|-macos-arm64-[0-9].*\.zip$"), "macos-aarch64", {"dmg"}),
    ("macOS x86_64", re.compile(r"-macos-x86_64-.*\.app\.zip$|-macos-x86_64-[0-9].*\.zip$"), "macos-x86_64", {"dmg"}),
    ("macOS universal", re.compile(r"-macos-universal-.*\.zip$"), "macos-universal", {"dmg"}),
]


def check_manifest(text: str) -> list[str]:
    """Problems with the content of redrob-launcher.json; empty means the launcher reads it as intended."""
    try:
        data = json.loads(text)
    except ValueError as e:
        return [f"{MANIFEST}: not JSON ({e})"]
    problems: list[str] = []
    if not isinstance(data, dict):
        return [f"{MANIFEST}: must be a JSON object, got {type(data).__name__}"]
    if data.get("schema") != 1:
        problems.append(f"{MANIFEST}: schema must be 1, got {data.get('schema')!r}")
    if data.get("sharedAccount") is not True:
        problems.append(f"{MANIFEST}: sharedAccount must be true, got {data.get('sharedAccount')!r}")
    return problems


def check(names: list[str], version: str | None, require_platforms: bool = True, stage: str = "release") -> list[str]:
    """Problems with this asset list; empty means the launcher can install every platform it ships.

    `stage="build"` is what `redrob.py package` writes on the build host, where the macOS .dmg does not exist
    yet: it is made from the SIGNED, notarized app on the mac runner (sign-and-publish.yml), so at build time a
    mac .app.zip without a .dmg is correct, not a gap. `stage="release"` asks for everything -- including the
    launcher manifest, which sign-and-publish.yml writes beside the renamed assets rather than the packager.
    """
    problems: list[str] = []
    parsed = {n: parse(n) for n in names}
    launcher = {n: p for n, p in parsed.items() if p}
    if version:
        for n, p in launcher.items():
            if p["version"] != version:
                problems.append(f"{n}: launcher-named but carries version {p['version']}, not {version}")
    # A name that LOOKS like a launcher name but does not parse is the regression this exists to catch:
    # `redrob-browser-0.1.9-linux-amd64.deb` or `redrob-browser-0.1.9-mac-arm64.dmg` would ship silently.
    for n in names:
        if parsed[n] or n.endswith(".sha256"):
            continue
        for _, suffix in KINDS:
            if n.endswith(suffix) and re.match(rf"^{STEM}-\d", n):
                problems.append(f"{n}: looks launcher-shaped but the launcher cannot read it "
                                f"(token must be one of {', '.join(sorted(TOKENS))})")
    if require_platforms:
        for label, pattern, token, kinds in PLATFORMS:
            if stage == "build" and token.startswith("macos-"):
                continue
            shipped = [n for n in names if pattern.search(n) and not n.endswith(".sha256")]
            if not shipped:
                continue
            have = [n for n, p in launcher.items() if p["token"] == token and p["kind"] in kinds]
            if not have:
                want = " or ".join(launcher_name(version or "<version>", token, k) for k in sorted(kinds))
                problems.append(f"{label} ships ({', '.join(shipped)}) but no launcher-installable asset: want {want}")
        if stage == "release" and MANIFEST not in names:
            problems.append(f"{MANIFEST} is missing: every release carries it so Redrob Launcher learns this "
                            f"version reads the shared account file (redrob-launcher docs/release-manifest.md)")
    return problems


def self_test() -> None:
    good = {
        "redrob-browser-0.1.9-linux-x86_64.deb": ("0.1.9", "linux-x86_64", "deb"),
        "redrob-browser-0.1.9-macos-aarch64.dmg": ("0.1.9", "macos-aarch64", "dmg"),
        "redrob-browser-0.1.9-windows-x64-portable.zip": ("0.1.9", "windows-x64", "portable-zip"),
        "redrob-browser-0.2.0-rc.1-windows-x64.msi": ("0.2.0-rc.1", "windows-x64", "msi"),
        "redrob-browser-1.0.0-linux-aarch64.tar.gz": ("1.0.0", "linux-aarch64", "tar.gz"),
    }
    for name, (version, token, kind) in good.items():
        got = parse(name)
        assert got == {"stem": STEM, "version": version, "token": token, "kind": kind}, (name, got)
        assert launcher_name(version, token, kind) == name
    bad = [
        "redrob-browser-stable_0.1.9+155.0.8059.26-1_amd64.deb",  # Debian name: no -<version> segment
        "redrob-browser-macos-arm64-0.1.9.zip",  # packager's mac name: version last, plain .zip
        "redrob-browser-x64-0.1.9-setup.exe",  # exe installer: not a kind the launcher installs
        "redrob-browser-0.1.9-linux-amd64.deb",  # amd64 is not a launcher token
        "redrob-browser-0.1.9-linux-x64.deb",  # x64 is Windows-only
        "redrob-browser-0.1.9-macos-aarch64.zip",  # plain zip does not install on macOS
        "redrob-browser-0.1.9-mac-arm64.dmg",  # mac is not an os token
        "redrob-browser-v0.1.9-linux-x86_64.deb",  # leading v
        "redrob-browser-0.1.9-linux-x86_64.deb.sha256",
        "redrob-canvas-0.1.9-linux-x86_64.deb",  # wrong stem
    ]
    for name in bad:
        assert parse(name) is None, name
    # A 0.1.8-shaped release fails on every platform; the 0.1.9 shape passes.
    old = ["redrob-browser-macos-arm64-0.1.8.app.zip", "redrob-browser-macos-arm64-0.1.8.zip",
           "redrob-browser-stable_0.1.8+155.0.8059.26-1_amd64.deb", "redrob-browser-x64-0.1.8-setup.exe",
           "redrob-browser-x64-0.1.8-setup.exe.sha256", MANIFEST]
    problems = check(old, "0.1.8")
    assert len(problems) == 3, problems
    assert all("no launcher-installable asset" in p for p in problems), problems
    new = old + ["redrob-browser-0.1.8-linux-x86_64.deb", "redrob-browser-0.1.8-macos-aarch64.dmg",
                 "redrob-browser-0.1.8-windows-x64-portable.zip"]
    assert check(new, "0.1.8") == [], check(new, "0.1.8")
    assert check(new, "0.1.9") == [f"{n}: launcher-named but carries version 0.1.8, not 0.1.9" for n in new[-3:]]
    assert check(old + ["redrob-browser-0.1.8-linux-amd64.deb"], "0.1.8")[0].startswith(
        "redrob-browser-0.1.8-linux-amd64.deb: looks launcher-shaped")
    # A release without the launcher manifest fails, and only at release stage: the build host does not write it.
    without = [n for n in new if n != MANIFEST]
    assert check(without, "0.1.8") == [f"{MANIFEST} is missing: every release carries it so Redrob Launcher "
                                       f"learns this version reads the shared account file "
                                       f"(redrob-launcher docs/release-manifest.md)"], check(without, "0.1.8")
    assert check(without, "0.1.8", require_platforms=False) == []
    # On the build host the mac .dmg is not made yet, so only Linux and Windows are required there.
    build = [n for n in new if not n.endswith(".dmg") and n != MANIFEST]
    assert check(build, "0.1.8", stage="build") == [], check(build, "0.1.8", stage="build")
    assert len(check(build, "0.1.8")) == 2
    # The manifest's content: exactly what redrob-launcher/docs/release-manifest.md reads.
    assert json.loads(MANIFEST_TEXT) == {"schema": 1, "sharedAccount": True}
    assert MANIFEST_TEXT.endswith("\n")
    assert check_manifest(MANIFEST_TEXT) == []
    assert check_manifest('{"schema":1,"sharedAccount":true,"later":"ignored"}') == []
    assert check_manifest("not json")[0].startswith(f"{MANIFEST}: not JSON")
    assert check_manifest("[1]") == [f"{MANIFEST}: must be a JSON object, got list"]
    assert check_manifest('{"schema": 2, "sharedAccount": true}') == [f"{MANIFEST}: schema must be 1, got 2"]
    assert check_manifest('{"schema": 1, "sharedAccount": false}') == [f"{MANIFEST}: sharedAccount must be true, got False"]
    assert check_manifest('{"schema": 1, "sharedAccount": "true"}') == [f"{MANIFEST}: sharedAccount must be true, got 'true'"]
    assert check_manifest("{}") == [f"{MANIFEST}: schema must be 1, got None",
                                    f"{MANIFEST}: sharedAccount must be true, got None"]
    print("check_asset_names: self-test ok")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--dir", help="directory whose file names are the assets (e.g. out/artifacts)")
    src.add_argument("--release", help="GitHub release tag to read the asset names from, via gh")
    src.add_argument("--names", nargs="+", help="asset names given directly")
    src.add_argument("--manifest", help=f"only check the content of this {MANIFEST} file")
    src.add_argument("--self-test", action="store_true")
    ap.add_argument("--version", help="the version every launcher-named asset must carry "
                                      "(default: REDROB_VERSION beside this script's repository)")
    ap.add_argument("--stage", choices=("build", "release"), default=None,
                    help="build: the packager's output on the build host, where the macOS .dmg is not made yet "
                         "(default with --dir); release: everything must be there (default otherwise)")
    ap.add_argument("--no-platforms", action="store_true",
                    help="only validate the names that are there; do not require one per shipped platform")
    args = ap.parse_args()
    if args.self_test:
        self_test()
        return 0
    if args.manifest:
        problems = check_manifest(Path(args.manifest).read_text(encoding="utf-8"))
        for p in problems:
            print(f"PROBLEM: {p}", file=sys.stderr)
        if problems:
            return 1
        print(f"ok: {args.manifest} is a schema-1 manifest with sharedAccount true")
        return 0

    stage = args.stage or ("build" if args.dir else "release")
    manifest_text: str | None = None
    if args.dir:
        names = sorted(p.name for p in Path(args.dir).iterdir() if p.is_file())
        if MANIFEST in names:
            manifest_text = (Path(args.dir) / MANIFEST).read_text(encoding="utf-8")
    elif args.release:
        out = subprocess.run(["gh", "release", "view", args.release, "--json", "assets"],
                             check=True, capture_output=True, text=True).stdout
        names = sorted(a["name"] for a in json.loads(out)["assets"])
        if MANIFEST in names:
            # What the launcher will read is the uploaded asset, so read that back rather than any local copy.
            with tempfile.TemporaryDirectory() as tmp:
                subprocess.run(["gh", "release", "download", args.release, "-p", MANIFEST, "-D", tmp,
                                "--clobber"], check=True)
                manifest_text = (Path(tmp) / MANIFEST).read_text(encoding="utf-8")
    else:
        names = [Path(n).name for n in args.names]

    version = args.version
    if version is None:
        version_file = Path(__file__).resolve().parent.parent / "REDROB_VERSION"
        version = version_file.read_text(encoding="utf-8").strip() if version_file.exists() else None

    if args.dir and version:
        # The packager leaves earlier versions' files in the directory; only this version's are the release.
        # The manifest carries no version in its name and belongs to every release.
        names = [n for n in names if version in n or n == MANIFEST]

    print(f"{len(names)} asset name(s), version {version or '(unchecked)'}, stage {stage}:")
    for n in names:
        p = parse(n)
        label = "launcher " + p["token"] + " " + p["kind"] if p else ("launcher manifest" if n == MANIFEST else "-")
        print(f"  {label:40} {n}")
    problems = check(names, version, require_platforms=not args.no_platforms, stage=stage)
    if manifest_text is not None:
        problems += check_manifest(manifest_text)
    for p in problems:
        print(f"PROBLEM: {p}", file=sys.stderr)
    if problems:
        return 1
    print("ok: every shipped platform has a name Redrob Launcher installs"
          + (f", and {MANIFEST} reads schema 1 / sharedAccount true" if manifest_text is not None else ""))
    return 0


if __name__ == "__main__":
    sys.exit(main())
