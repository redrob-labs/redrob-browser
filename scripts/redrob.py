#!/usr/bin/env python3
"""Redrob Browser: the whole fork, driven from one file.

The model is patch-based and deliberately so. Chromium is fetched, never vendored: `CHROMIUM_VERSION`
says which release we build and `patches/` is the only thing in this repository that is ours. The
previous fork learned this the expensive way -- a Firefox tree with 258 patches buried inside it, where
nobody could answer "what do we actually own" without counting files.

    ./scripts/redrob.py bootstrap    # depot_tools, once
    ./scripts/redrob.py sync         # fetch Chromium at CHROMIUM_VERSION and run its hooks
    ./scripts/redrob.py brand        # re-derive the branding delta onto the checkout
    ./scripts/redrob.py apply        # apply patches/ onto the checkout
    ./scripts/redrob.py build        # gn gen + ninja
    ./scripts/redrob.py run          # launch what was built
    ./scripts/redrob.py export       # regenerate patches/ from the checkout's own diff

`export` is the half that keeps the fork honest: you edit the Chromium tree like a normal tree, then
export, and the patch set is whatever you actually changed. Nothing is hand-maintained.

`brand` is the other half of that idea applied to the one delta that is too mechanical to hand-maintain:
Chromium's product name appears 683 times in one strings file, so after a version bump the branding
patch is re-derived from the new checkout rather than conflict-resolved. The sequence on a bump is
sync -> brand -> apply -> export, and `brand` must run before `apply` so hand-written patches land on
top of it.

Standard library only, and nothing is installed outside this directory: depot_tools brings its own
clang, gn and ninja, and Chromium's own sysroot supplies the C libraries, so no system packages are
touched. That is a hard constraint on this host, not a preference.
"""

from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CHROMIUM = ROOT / "chromium"
SRC = CHROMIUM / "src"
DEPOT_TOOLS = ROOT / "depot_tools"
PATCHES = ROOT / "patches"
BRANDING = ROOT / "branding"
SOURCES = ROOT / "sources"
DEPOT_TOOLS_URL = "https://chromium.googlesource.com/chromium/tools/depot_tools.git"

# What the product is called, and what upstream calls it. The substitution runs over Chromium's own
# strings file, so it has to leave alone the places where "Chromium" is a fact about upstream rather
# than a name for our product -- the BSD notice above all, which we are required to retain.
UPSTREAM_NAME = "Chromium"
PRODUCT_NAME = "Redrob"
PROTECTED_PHRASES = (
    "The Chromium Authors",
    "Chromium OS",
    "Chromium Projects",
    "chromium.org",
    "chromium.googlesource.com",
)

# The one strings file that carries the unbranded product name, and the UA assembly point.
STRINGS_GRD = "chrome/app/chromium_strings.grd"
USER_AGENT_CC = "components/embedder_support/user_agent_utils.cc"


# Which gn args file each build flavour uses. `dev` is the one to use for a first build: an official
# build turns on LTO and PGO and roughly doubles a wall-clock that is already hours long.
FLAVOURS = {"dev": "build/args/dev.gn", "release": "build/args/release.gn"}


def version() -> str:
    return (ROOT / "CHROMIUM_VERSION").read_text().strip()


def env(allow_update: bool = False) -> dict[str, str]:
    """depot_tools on PATH, and its own bundled tools preferred over anything on the host.

    `DEPOT_TOOLS_UPDATE=0` normally: depot_tools would otherwise update itself mid-command, which turns
    a build into a moving target. The exception is its own first run, which is when it fetches the
    python and cipd binaries it needs -- with updates disabled that never happens and every later
    command fails on `python3_bin_reldir.txt not found`, which reads like a broken checkout rather than
    an uninitialised tool.
    """
    merged = dict(os.environ)
    merged["PATH"] = f"{DEPOT_TOOLS}{os.pathsep}{merged.get('PATH', '')}"
    if not allow_update:
        merged["DEPOT_TOOLS_UPDATE"] = "0"
    return merged


def run(cmd: list[str], cwd: Path, check: bool = True, allow_update: bool = False) -> int:
    print(f"\n$ {' '.join(cmd)}\n  in {cwd}", flush=True)
    result = subprocess.run(cmd, cwd=cwd, env=env(allow_update))
    if check and result.returncode != 0:
        sys.exit(f"failed ({result.returncode}): {' '.join(cmd)}")
    return result.returncode


def patch_name(relative: str) -> str:
    """`chrome/browser/ui/x.cc` -> `chrome-browser-ui-x.cc.patch`, which is Brave's convention.

    A flat directory of per-file patches, named after the file they touch. It reads as an inventory:
    `ls patches/` is the answer to what this fork changes, and a conflict names one file rather than a
    numbered blob touching thirty.
    """
    return relative.replace("/", "-") + ".patch"


def cmd_bootstrap(_: argparse.Namespace) -> None:
    if not DEPOT_TOOLS.exists():
        run(["git", "clone", "--depth", "1", DEPOT_TOOLS_URL, str(DEPOT_TOOLS)], ROOT)
    # Its own first run, with updates allowed, is what fetches the python and cipd binaries every later
    # command needs. Cloning alone leaves a depot_tools that cannot run anything.
    run([str(DEPOT_TOOLS / "ensure_bootstrap")], DEPOT_TOOLS, allow_update=True)
    run(["gclient", "--version"], ROOT, allow_update=True)


def cmd_sync(args: argparse.Namespace) -> None:
    """Fetch Chromium and put it on the pinned release.

    Full history rather than `--no-history`: the pinned tag has to be checkoutable, and a shallow
    fetch that cannot reach it turns into a second full fetch. Disk is cheaper than that.
    """
    if not DEPOT_TOOLS.exists():
        sys.exit("run bootstrap first")
    tag = version()
    CHROMIUM.mkdir(exist_ok=True)

    if not SRC.exists():
        run(["fetch", "--nohooks", "chromium"], CHROMIUM)

    run(["git", "fetch", "--tags", "origin"], SRC)
    branch = f"redrob-{tag}"
    existing = subprocess.run(
        ["git", "rev-parse", "--verify", "--quiet", branch], cwd=SRC, env=env(), capture_output=True
    )
    if existing.returncode == 0:
        run(["git", "checkout", branch], SRC)
    else:
        run(["git", "checkout", "-b", branch, f"tags/{tag}"], SRC)

    if not args.no_hooks:
        # Pulls the sysroot, the bundled clang and the rest of the toolchain into the checkout.
        run(["gclient", "sync", "-D", "--with_branch_heads", "--with_tags"], SRC)
        run(["gclient", "runhooks"], SRC)


def cmd_apply(args: argparse.Namespace) -> None:
    if not SRC.exists():
        sys.exit("no checkout: run sync first")
    # Our own files first: a registration patch that references chrome/browser/ui/webui/redrob would
    # otherwise apply against a directory that does not exist yet.
    copied = copy_sources()
    patches = sorted(PATCHES.glob("*.patch"))
    if not patches:
        print(f"{copied} source file(s) copied; no patches yet, which is a valid state for the scaffold")
        return
    for patch in patches:
        # --3way so a patch that has drifted against a new Chromium reports a real conflict instead of
        # refusing wholesale, which is the difference between a rebase you can finish and one you redo.
        run(["git", "apply", "--3way", "--whitespace=nowarn", str(patch)], SRC, check=not args.keep_going)


def read_manifest() -> list[tuple[str, str, str]]:
    """branding/manifest as (source, target, kind) rows, comments and blanks dropped."""
    path = BRANDING / "manifest"
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 3:
            sys.exit(f"malformed manifest row (want SOURCE TARGET KIND): {line}")
        rows.append((parts[0], parts[1], parts[2]))
    return rows


def read_sources_manifest() -> list[tuple[str, str]]:
    """sources/manifest as (source, target) rows: code we own, not a delta against Chromium."""
    path = SOURCES / "manifest"
    if not path.exists():
        return []
    rows = []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split()
        if len(parts) != 2:
            sys.exit(f"malformed sources row (want SOURCE TARGET): {line}")
        rows.append((parts[0], parts[1]))
    return rows


def copy_sources() -> int:
    """Put the files we own into the checkout. Directories are created as needed."""
    count = 0
    for source, target in read_sources_manifest():
        source_path = ROOT / source
        target_path = SRC / target
        if not source_path.exists():
            sys.exit(f"missing source: {source}")
        target_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(source_path, target_path)
        print(f"source   {target}")
        count += 1
    return count



def overlay_binary_targets() -> set[str]:
    return {target for _, target, kind in read_manifest() if kind == "binary"}


def substitute_product_name(text: str) -> tuple[str, int]:
    """`Chromium` -> `Redrob`, except inside the phrases that are about upstream, not about us.

    Done by masking the protected phrases out, substituting, then restoring them. Regex lookarounds
    would need one alternative per phrase and would still miss overlaps; masking cannot.
    """
    masks = {}
    for index, phrase in enumerate(PROTECTED_PHRASES):
        token = f"\x00PROTECTED{index}\x00"
        if phrase in text:
            masks[token] = phrase
            text = text.replace(phrase, token)
    replaced = text.count(UPSTREAM_NAME)
    text = text.replace(UPSTREAM_NAME, PRODUCT_NAME)
    for token, phrase in masks.items():
        text = text.replace(token, phrase)
    return text, replaced


def append_user_agent_token(text: str) -> tuple[str, bool]:
    """Add a `Redrob/<version>` token AFTER the Safari token, leaving `Chrome/<version>` intact.

    This is deliberately additive. The whole reason for moving off Firefox was that Korean banking and
    government sites sniff the UA and refuse anything that does not look like Chrome, so replacing the
    Chrome token would reintroduce the exact defect the base swap was meant to fix. Edge and Brave
    append their own token in the same position for the same reason.
    """
    old = '"%s Safari/537.36",'
    new = '"%s Safari/537.36 Redrob/" PRODUCT_VERSION,'
    if new in text:
        return text, False
    if old not in text:
        sys.exit(f"UA assembly point not found in {USER_AGENT_CC}; upstream moved it")
    return text.replace(old, new, 1), True


def cmd_brand(_: argparse.Namespace) -> None:
    """Re-derive the branding delta onto the checkout: assets, product name, user agent.

    Idempotent, so running it twice is a no-op rather than a doubled UA token. It writes into
    chromium/src and nothing else; `export` is what turns the text half into patches/.
    """
    if not SRC.exists():
        sys.exit("no checkout: run sync first")

    for source, target, kind in read_manifest():
        source_path = ROOT / source
        target_path = SRC / target
        if not source_path.exists():
            sys.exit(f"missing branding source: {source}")
        if not target_path.parent.exists():
            sys.exit(f"target directory gone, upstream moved it: {target}")
        shutil.copyfile(source_path, target_path)
        print(f"overlay [{kind}] {target}")

    grd = SRC / STRINGS_GRD
    if not grd.exists():
        sys.exit(f"strings file not found: {STRINGS_GRD}; upstream moved it")
    text, replaced = substitute_product_name(grd.read_text())
    grd.write_text(text)
    print(f"strings   {STRINGS_GRD}: {replaced} occurrence(s) of {UPSTREAM_NAME} -> {PRODUCT_NAME}")

    ua = SRC / USER_AGENT_CC
    if not ua.exists():
        sys.exit(f"user agent file not found: {USER_AGENT_CC}; upstream moved it")
    text, changed = append_user_agent_token(ua.read_text())
    if changed:
        ua.write_text(text)
    print(f"useragent {USER_AGENT_CC}: {'token appended' if changed else 'already branded'}")


def cmd_export(_: argparse.Namespace) -> None:
    """Rewrite patches/ from whatever the checkout currently differs by."""
    if not SRC.exists():
        sys.exit("no checkout: run sync first")
    changed = subprocess.run(
        ["git", "diff", "--name-only", "--diff-filter=M"],
        cwd=SRC,
        env=env(),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()
    added = subprocess.run(
        ["git", "ls-files", "--others", "--exclude-standard"],
        cwd=SRC,
        env=env(),
        capture_output=True,
        text=True,
        check=True,
    ).stdout.split()

    # Binary overlays are declared in branding/manifest and deliberately never become patches: a
    # binary diff cannot be reviewed, and patches/ is supposed to read as an inventory.
    skipped = overlay_binary_targets()

    if PATCHES.exists():
        # Clear only the generated output. Deleting the directory takes README.md with it -- which is
        # documentation, not output, and is exactly what happened the first time this ran.
        for stale in PATCHES.glob("*.patch"):
            stale.unlink()
    PATCHES.mkdir(parents=True, exist_ok=True)

    exported = 0
    for relative in changed:
        if relative in skipped:
            print(f"skipped {relative} (binary overlay, see branding/manifest)")
            continue
        diff = subprocess.run(
            ["git", "diff", "--src-prefix=a/", "--dst-prefix=b/", "--", relative],
            cwd=SRC,
            env=env(),
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        (PATCHES / patch_name(relative)).write_text(diff)
        exported += 1
        print(f"exported {relative}")

    # Only the files that could plausibly be ours. A synced checkout carries tens of thousands of
    # untracked third_party and node_modules files, and listing them buries the line that matters.
    # Files we deliberately copied in are already in this repository, so they are not news either.
    copied_in = {target for _, target in read_sources_manifest()}
    ours = [
        relative
        for relative in added
        if not relative.startswith("third_party/")
        and "/node_modules/" not in relative
        and relative not in copied_in
    ]
    if ours:
        # New files are ours outright rather than a delta, so they belong in the repository as files.
        # Naming them here rather than silently patching them in is the point: a fork should be able to
        # say which files are Chromium's and which are its own.
        print("\nUntracked files in the checkout, which are not patches. Move them into this repo:")
        for relative in ours:
            print(f"  {relative}")
    hidden = len(added) - len(ours)
    if hidden:
        print(f"\n({hidden} untracked third_party/node_modules files not listed -- upstream's, not ours.)")

    print(f"\n{exported} patch(es) in {PATCHES}")



def cmd_build(args: argparse.Namespace) -> None:
    if not SRC.exists():
        sys.exit("no checkout: run sync first")
    out = SRC / "out" / args.flavour
    args_gn = (ROOT / FLAVOURS[args.flavour]).read_text()
    out.mkdir(parents=True, exist_ok=True)
    (out / "args.gn").write_text(args_gn)
    run(["gn", "gen", f"out/{args.flavour}"], SRC)
    run(["autoninja", "-C", f"out/{args.flavour}", args.target], SRC)


def cmd_run(args: argparse.Namespace) -> None:
    binary = SRC / "out" / args.flavour / "chrome"
    if not binary.exists():
        sys.exit(f"not built: {binary}")
    profile = ROOT / "out" / "profile"
    profile.mkdir(parents=True, exist_ok=True)
    run([str(binary), f"--user-data-dir={profile}", *args.extra], SRC)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("bootstrap", help="clone depot_tools into this directory").set_defaults(func=cmd_bootstrap)

    sync = sub.add_parser("sync", help="fetch Chromium at CHROMIUM_VERSION")
    sync.add_argument("--no-hooks", action="store_true", help="skip gclient sync/runhooks")
    sync.set_defaults(func=cmd_sync)

    sub.add_parser("brand", help="re-derive the branding delta onto the checkout").set_defaults(func=cmd_brand)

    apply_ = sub.add_parser("apply", help="apply patches/ onto the checkout")
    apply_.add_argument("--keep-going", action="store_true", help="report failures instead of stopping")
    apply_.set_defaults(func=cmd_apply)

    sub.add_parser("export", help="regenerate patches/ from the checkout").set_defaults(func=cmd_export)

    build = sub.add_parser("build", help="gn gen + ninja")
    build.add_argument("--flavour", choices=sorted(FLAVOURS), default="dev")
    build.add_argument("--target", default="chrome")
    build.set_defaults(func=cmd_build)

    run_ = sub.add_parser("run", help="launch the build with a scratch profile")
    run_.add_argument("--flavour", choices=sorted(FLAVOURS), default="dev")
    run_.add_argument("extra", nargs="*", help="extra arguments passed to the binary")
    run_.set_defaults(func=cmd_run)

    parsed = parser.parse_args()
    parsed.func(parsed)


if __name__ == "__main__":
    main()
