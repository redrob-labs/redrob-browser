#!/usr/bin/env python3
"""Redrob Browser: the whole fork, driven from one file.

The model is patch-based and deliberately so. Chromium is fetched, never vendored: `CHROMIUM_VERSION`
says which release we build and `patches/` is the only thing in this repository that is ours. The
previous fork learned this the expensive way -- a Firefox tree with 258 patches buried inside it, where
nobody could answer "what do we actually own" without counting files.

    ./scripts/redrob.py bootstrap    # depot_tools, once
    ./scripts/redrob.py sync         # fetch Chromium at CHROMIUM_VERSION and run its hooks
    ./scripts/redrob.py apply        # apply patches/ onto the checkout
    ./scripts/redrob.py build        # gn gen + ninja
    ./scripts/redrob.py run          # launch what was built
    ./scripts/redrob.py export       # regenerate patches/ from the checkout's own diff

`export` is the half that keeps the fork honest: you edit the Chromium tree like a normal tree, then
export, and the patch set is whatever you actually changed. Nothing is hand-maintained.

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
DEPOT_TOOLS_URL = "https://chromium.googlesource.com/chromium/tools/depot_tools.git"

# Which gn args file each build flavour uses. `dev` is the one to use for a first build: an official
# build turns on LTO and PGO and roughly doubles a wall-clock that is already hours long.
FLAVOURS = {"dev": "build/args/dev.gn", "release": "build/args/release.gn"}


def version() -> str:
    return (ROOT / "CHROMIUM_VERSION").read_text().strip()


def env() -> dict[str, str]:
    """depot_tools on PATH, and its own bundled tools preferred over anything on the host."""
    merged = dict(os.environ)
    merged["PATH"] = f"{DEPOT_TOOLS}{os.pathsep}{merged.get('PATH', '')}"
    # depot_tools would otherwise try to update itself mid-command, which turns a build into a moving
    # target and has broken a checkout for us before.
    merged["DEPOT_TOOLS_UPDATE"] = "0"
    return merged


def run(cmd: list[str], cwd: Path, check: bool = True) -> int:
    print(f"\n$ {' '.join(cmd)}\n  in {cwd}", flush=True)
    result = subprocess.run(cmd, cwd=cwd, env=env())
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
    if DEPOT_TOOLS.exists():
        print(f"depot_tools already at {DEPOT_TOOLS}")
        return
    run(["git", "clone", "--depth", "1", DEPOT_TOOLS_URL, str(DEPOT_TOOLS)], ROOT)


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
    patches = sorted(PATCHES.glob("*.patch"))
    if not patches:
        print("no patches yet, which is a valid state for the scaffold")
        return
    for patch in patches:
        # --3way so a patch that has drifted against a new Chromium reports a real conflict instead of
        # refusing wholesale, which is the difference between a rebase you can finish and one you redo.
        run(["git", "apply", "--3way", "--whitespace=nowarn", str(patch)], SRC, check=not args.keep_going)


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

    if PATCHES.exists():
        shutil.rmtree(PATCHES)
    PATCHES.mkdir(parents=True)

    for relative in changed:
        diff = subprocess.run(
            ["git", "diff", "--src-prefix=a/", "--dst-prefix=b/", "--", relative],
            cwd=SRC,
            env=env(),
            capture_output=True,
            text=True,
            check=True,
        ).stdout
        (PATCHES / patch_name(relative)).write_text(diff)
        print(f"exported {relative}")

    if added:
        # New files are ours outright rather than a delta, so they belong in the repository as files.
        # Naming them here rather than silently patching them in is the point: a fork should be able to
        # say which files are Chromium's and which are its own.
        print("\nUntracked files in the checkout, which are not patches. Move them into this repo:")
        for relative in added:
            print(f"  {relative}")

    print(f"\n{len(changed)} patch(es) in {PATCHES}")


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
