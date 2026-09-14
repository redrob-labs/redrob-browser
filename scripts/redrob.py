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
    # No space, as ChromeOS strings spell it. Without this the substitution invents a "RedrobOS", which
    # is not a product that exists -- the OS is upstream's, and naming it after us would be a false claim
    # rather than branding.
    "ChromiumOS",
    "Chromium Projects",
    "chromium.org",
    "chromium.googlesource.com",
)

# Strings where the name has to become GOOGLE, not us and not upstream.
#
# Protection is not enough for these. A protected "Sign in to Chromium?" would keep saying Chromium, which
# is wrong for a different reason: the button signs the user into a GOOGLE ACCOUNT, for Google's own sync
# service. Upstream's own wording is imprecise there and our substitution made it a false claim -- there is
# no Redrob account to sign in to, so the string was offering a product that does not exist.
#
# Applied as an exact-phrase rewrite before the product-name substitution runs, so the phrase never reaches
# it. Kept to whole user-visible phrases rather than a general "Chromium near sign-in" rule: this is a claim
# about what a specific control does, and that is a judgement per string, not a pattern.
GOOGLE_OWNED_REWRITES = (
    ("Sign in to Chromium?", "Sign in to Google?"),
    ("Sign In to Chromium?", "Sign In to Google?"),
)

# Every strings file that carries the unbranded product name.
#
# There is not one. Upstream deliberately collects Chromium-branded literals into files named for that
# branding -- chromium_strings, components_chromium_strings, settings_chromium_strings -- and builds the
# Google Chrome variant from parallel files. So a fork does not have hardcoding bugs to fix; it has a SET
# of files to substitute, and substituting only the top-level one leaves the rest untouched. That is why
# Settings said "About Chromium" and the restore bubble said "Chromium didn't shut down correctly" long
# after chromium_strings.grd was clean: the first lives in an included .grdp, the second in the separate
# components bundle.
#
# Ordered most-visible first so the log reads usefully. A file upstream has moved or renamed is reported
# rather than skipped -- silently branding fewer files is exactly the failure this list exists to end.
# The shared strings files -- the ones BOTH branding variants use -- hardcode the short name "Chrome" in
# user-visible text. That is an upstream defect rather than a branding hook: an actual Chromium build also
# says "Chrome just blocked a dangerous file", even though its product is called Chromium. For us it is
# worse than the Chromium leaks were, because it names a different company's product.
#
# Substituting the SHORT name is far more dangerous than substituting "Chromium", so it gets its own
# protected list, and every entry below is a name that is genuinely NOT us:
#
#   * chrome:// URLs, which are the browser's own scheme and cannot be renamed by editing prose.
#   * Google's products and platforms -- Google Chrome, ChromeOS, Chromebook, Chromecast, the Web Store,
#     Chrome Enterprise, Chrome Remote Desktop, release channels.
#   * Chrome Apps, a deprecated upstream platform we do not ship.
#   * Chrome Updater and the Chrome Root Store/Program, components that are upstream's and are named in
#     enterprise policy and PKI text where renaming them would make the text false.
#
# The UA string is untouched by this because it is assembled in C++, not in a strings file -- and it must
# stay, since Korean banking and government sites sniff for the Chrome token.
SHARED_STRINGS_FILES = (
    "chrome/app/generated_resources.grd",
    "chrome/app/settings_strings.grdp",
)
UPSTREAM_SHORT_NAME = "Chrome"
SHORT_NAME_PROTECTED_PHRASES = (
    "chrome://",
    "Google Chrome",
    "ChromeOS",
    "Chrome OS",
    "Chromebook",
    "Chromecast",
    "Chrome Web Store",
    "Chrome Web",
    "Chrome Apps",
    "Chrome App",
    "Chrome Enterprise",
    "Chrome Remote Desktop",
    "Chrome Updater",
    "Chrome Root Store",
    "Chrome Root Program",
    "Chrome Beta",
    "Chrome Dev",
    "Chrome Canary",
    "Chrome Frame",
    "Chrome Cleanup",
    "chrome.google.com",
    "Chrome/",
    # Hyphenated, as the ChromeOS section comments spell it.
    "Chrome-OS",
    # Google's own legal text and its mobile app. Substituting these does not rebrand a string, it makes
    # a false statement: our terms of service did not change on a date Google chose, and there is no
    # Redrob for iOS to download. A string that sends the user to fetch a product we do not publish is
    # worse than one that names someone else's.
    "Chrome's Terms of Service",
    "Chrome for iOS",
    "Chrome for Android",
    "Download Chrome",
    "download Chrome",
    "Get Chrome",
    "get Chrome on",
)

STRINGS_FILES = (
    "chrome/app/chromium_strings.grd",
    "chrome/app/settings_chromium_strings.grdp",
    "components/components_chromium_strings.grd",
    "extensions/strings/extensions_chromium_strings.grdp",
    "chrome/app/password_manager_ui_strings.grdp",
    "components/password_manager_strings.grdp",
    "components/search_engine_choice_strings.grdp",
    "components/page_info_strings.grdp",
    "components/autofill_strings.grdp",
    "components/autofill_payments_strings.grdp",
    "components/security_interstitials_strings.grdp",
    "components/ssl_errors_strings.grdp",
    "components/management_strings.grdp",
    "components/privacy_sandbox_strings.grd",
    "components/new_or_sad_tab_strings.grdp",
    "components/reset_password_strings.grdp",
)
USER_AGENT_CC = "components/embedder_support/user_agent_utils.cc"


# Which gn args file each build flavour uses. `dev` is the one to use for a first build: an official
# build turns on LTO and PGO and roughly doubles a wall-clock that is already hours long.
FLAVOURS = {
    "dev": "build/args/dev.gn",
    "release": "build/args/release.gn",
    "mac": "build/args/mac.gn",
    "windows": "build/args/windows.gn",
}

# Which flavours are for which host. A flavour is not a cross-compile: `mac` and `windows` name the gn
# args a build ON that platform uses, and running them anywhere else fails inside the toolchain rather
# than here -- so the mapping is stated once and checked, instead of being discovered from a link error.
FLAVOUR_PLATFORM = {"dev": "linux", "release": "linux", "mac": "darwin", "windows": "win32"}


def version() -> str:
    return (ROOT / "CHROMIUM_VERSION").read_text().strip()


def product_version() -> str:
    """Redrob's OWN version, which is not Chromium's.

    Two versions exist and they answer different questions. `CHROMIUM_VERSION` is the upstream tag this fork
    is cut from -- it is a security statement, and it moves every four weeks whether we do anything or not.
    `REDROB_VERSION` is what WE released, and it moves when our own work does.

    It is deliberately NOT in the user agent. The UA's `Redrob/` token carries PRODUCT_VERSION, Chromium's
    own, because the whole point of that token is to sit beside an untouched `Chrome/` token for sites that
    sniff it -- see append_user_agent_token. A fork version there would tell a bank something it has no way
    to interpret.
    """
    return (ROOT / "REDROB_VERSION").read_text().strip()


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


def ensure_pgo_profiles_checkout() -> None:
    """Set checkout_pgo_profiles in the .gclient's custom_vars, if it is not already there.

    Returns quietly when the file is missing -- `fetch chromium` has not run yet, and cmd_sync calls this
    before and after that step for exactly that reason.
    """
    gclient_file = CHROMIUM / ".gclient"
    if not gclient_file.exists():
        return
    text = gclient_file.read_text()
    if "checkout_pgo_profiles" in text:
        return
    if '"custom_vars": {},' not in text:
        print("WARNING: .gclient custom_vars is not the shape this expects; set "
              "checkout_pgo_profiles=True by hand or the release build cannot be generated")
        return
    gclient_file.write_text(
        text.replace('"custom_vars": {},', '"custom_vars": {"checkout_pgo_profiles": True},', 1))
    print("set checkout_pgo_profiles=True in .gclient (needed by the release build)")


def cmd_version(_: argparse.Namespace) -> None:
    print(f"redrob   {product_version()}")
    print(f"chromium {version()}")


def cmd_strings(_: argparse.Namespace) -> None:
    """Regenerate the grd, the translations and the WebUI table from l10n/*.tsv. See scripts/gen_strings.py."""
    run([sys.executable, str(ROOT / "scripts" / "gen_strings.py")], ROOT)


def cmd_check(_: argparse.Namespace) -> None:
    """Repo integrity, with no Chromium checkout needed. See scripts/check_repo.py for what and why."""
    run([sys.executable, str(ROOT / "scripts" / "check_repo.py")], ROOT)


def cmd_package(args: argparse.Namespace) -> None:
    """Build the Linux installer packages and collect them under out/artifacts.

    `chrome/installer/linux:stable_deb` is upstream's own packaging target and produces the .deb. Using it rather
    than assembling an archive by hand is the difference between a package that installs, registers a .desktop
    entry and a sandbox helper with the right mode, and a tarball that happens to contain a binary.

    The DEB target specifically, not `:stable`, which builds the .rpm too and fails on a host without rpm
    tooling: `FileNotFoundError: /usr/lib/rpm/find-requires`. That is not a host to fix -- installing no system
    packages is a stated constraint of this build (docs/BUILD.md), so an rpm needs a container that ships
    rpm-build, and asking for one here would make packaging impossible on the machine that does the building.

    Refuses the dev flavour by default. A dev build has no LTO and no PGO -- docs/BUILD.md is explicit that it
    must not even be benchmarked against Chrome -- so packaging one produces an artifact that looks shippable
    and is not. `--allow-dev` exists for testing the packaging path itself, which is a different job from
    producing a release.
    """
    if not SRC.exists():
        sys.exit("no checkout: run sync first")
    if FLAVOUR_PLATFORM[args.flavour] == "win32":
        package_windows(args)
        return
    if args.flavour == "dev" and not args.allow_dev:
        sys.exit("refusing to package a dev build: no LTO, no PGO. Use --flavour release, "
                 "or --allow-dev if you are testing the packaging path itself")
    out = SRC / "out" / args.flavour
    if not (out / "chrome").exists():
        sys.exit(f"nothing built in out/{args.flavour}: run build first")

    # Pre-flight the HOST tools, because upstream's packaging scripts do not. Without this the failure is a
    # FileNotFoundError raised from inside a ninja action, forty seconds into a build, naming one binary and
    # explaining nothing -- which is exactly how it was first hit here.
    missing = [tool for tool in ("debchange", "dpkg-deb", "fakeroot") if shutil.which(tool) is None]
    if missing:
        sys.exit(
            "cannot package: this host is missing " + ", ".join(missing) + ".\n"
            "debchange ships in devscripts. This build installs NO system packages by design "
            "(docs/BUILD.md), so the packaging step belongs on a machine or container image that already "
            "has them -- see .github/workflows/release.yml, which is why that job is self-hosted.")

    run(["autoninja", "-C", f"out/{args.flavour}", "chrome/installer/linux:stable_deb"], SRC)

    artifacts = ROOT / "out" / "artifacts"
    cdn = ROOT / "out" / "cdn"
    artifacts.mkdir(parents=True, exist_ok=True)
    cdn.mkdir(parents=True, exist_ok=True)
    found = []
    # ONLY this version's package. The installer target writes into the output directory and leaves what it wrote
    # there, so after a version bump the previous release's .deb is still sitting beside the new one -- and a glob
    # collected both, which is how a download page ends up offering a version nobody meant to ship. Matching on
    # the version is also a check: if the expected name is absent, something upstream changed the naming and the
    # error says so rather than shipping whatever happened to match.
    expected = f"_{product_version()}+"
    stale = [p.name for p in sorted(out.glob("*.deb")) if expected not in p.name]
    if stale:
        print(f"ignoring {len(stale)} stale package(s) from an earlier version: {', '.join(stale)}")
    for built in sorted(p for p in out.glob("*.deb") if expected in p.name):
        # TWO names, because two consumers want different things and neither is wrong.
        #
        # out/artifacts keeps the Debian name exactly as built. That name is the convention inside a repository's
        # pool/ and it is what `redrob.py repo` copies, so it must not be prettified.
        #
        # Earlier this directory got a `redrob-browser_<ours>_` prefix bolted on, from when the built name carried
        # CHROMIUM's version and ours appeared nowhere. Now that the installer stamps our version into the package
        # itself, that prefix only produced
        # redrob-browser_0.1.0_redrob-browser-stable_0.1.0+153.0.8010.36-1_amd64.deb -- the version twice and the
        # product name twice. Removed.
        target = artifacts / built.name
        shutil.copy2(built, target)
        found.append(target)

        # out/cdn is for .github/scripts/cdn-publish.sh, which derives the version-free `latest/` alias by
        # deleting a `-<version>` segment from the filename. A Debian name separates fields with underscores, so
        # that segment does not exist in it and the script correctly refuses the file. This is the same shape the
        # other products publish under -- redrob-design-x64-<version>-setup.exe aliasing to
        # redrob-design-x64-setup.exe -- so a download page links a name that does not go stale.
        arch = built.stem.rsplit("_", 1)[-1]
        shutil.copy2(built, cdn / f"redrob-browser-{arch}-{product_version()}.deb")

    if not found:
        sys.exit(f"the installer target produced no .deb in out/{args.flavour}")
    for path in found + sorted(cdn.glob("*.deb")):
        print(f"{path.relative_to(ROOT)}  {path.stat().st_size // (1024 * 1024)} MB")


def package_windows(args: argparse.Namespace) -> None:
    """Build the Windows installer and stage it the way the CDN script expects.

    `chrome/installer/mini_installer` is upstream's own packaging target, the same choice as
    chrome/installer/linux:stable_deb on Linux and for the same reason: it produces the self-extracting
    setup.exe that registers the browser, rather than a zip that happens to contain a binary.

    There is no --allow-dev gate here, unlike the Linux path. That gate exists because a Linux dev build has no
    LTO and no PGO and would be mistaken for shippable; on Windows nothing has been built AT ALL yet, so the
    only useful thing to package is exactly the dev flavour this produces. When a Windows release flavour
    exists the gate belongs here too -- see docs/WINDOWS.md.
    """
    out = SRC / "out" / args.flavour
    if not (out / "chrome.exe").exists():
        sys.exit(f"nothing built in out/{args.flavour}: run build first")

    run(["autoninja", "-C", f"out/{args.flavour}", "chrome/installer/mini_installer"], SRC)

    built = out / "mini_installer.exe"
    if not built.exists():
        sys.exit(f"the installer target produced no mini_installer.exe in out/{args.flavour}")

    artifacts = ROOT / "out" / "artifacts"
    cdn = ROOT / "out" / "cdn"
    artifacts.mkdir(parents=True, exist_ok=True)
    cdn.mkdir(parents=True, exist_ok=True)

    # The name the sibling repos already publish under: redrob-design-x64-<version>-setup.exe, which
    # cdn-publish.sh aliases to redrob-design-x64-setup.exe by deleting the -<version> segment. Copying that
    # convention rather than inventing one is the whole reason the alias works without touching the script.
    name = f"redrob-browser-x64-{product_version()}-setup.exe"
    for target in (artifacts / name, cdn / name):
        shutil.copy2(built, target)
        print(f"{target.relative_to(ROOT)}  {target.stat().st_size // (1024 * 1024)} MB")


def cmd_repo(args: argparse.Namespace) -> None:
    """Build a signed apt repository from out/artifacts. See scripts/build_repo.py for the key handling."""
    cmd = [sys.executable, str(ROOT / "scripts" / "build_repo.py")]
    if args.unsigned:
        cmd.append("--unsigned")
    run(cmd, ROOT)


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

    # PGO profiles are opt-in and the release build cannot be generated without them.
    #
    # `fetch chromium` writes a .gclient with an EMPTY custom_vars, and with checkout_pgo_profiles unset the
    # profile is never downloaded. Nothing notices until `gn gen` on an is_official_build=true directory dies
    # inside update_pgo_profiles.py -- so a repo can look perfectly healthy, build and run for months on dev
    # flavours, and only discover at release time that it cannot produce a shippable binary at all. That is
    # exactly what happened here, on the day of the first tag.
    #
    # Written idempotently into the existing file rather than by regenerating it, because gclient owns that
    # file and a fresh one would drop anything else it has recorded.
    ensure_pgo_profiles_checkout()

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



def overlay_targets() -> set[str]:
    """Every checkout path branding/manifest replaces wholesale, regardless of kind."""
    return {target for _, target, _ in read_manifest()}


def substitute_short_name(text: str) -> tuple[str, int]:
    """`Chrome` -> `Redrob`, leaving every phrase where "Chrome" names something that is not us.

    Same masking trick as the long name, with its own phrase list. Ordered longest-first when masking so
    that "Chrome Web Store" is protected before the shorter "Chrome Web" can claim part of it.
    """
    masks = {}
    for index, phrase in enumerate(sorted(SHORT_NAME_PROTECTED_PHRASES, key=len, reverse=True)):
        token = f"\x00SHORT{index}\x00"
        if phrase in text:
            masks[token] = phrase
            text = text.replace(phrase, token)
    replaced = text.count(UPSTREAM_SHORT_NAME)
    text = text.replace(UPSTREAM_SHORT_NAME, PRODUCT_NAME)
    for token, phrase in masks.items():
        text = text.replace(token, phrase)
    return text, replaced


def substitute_product_name(text: str) -> tuple[str, int]:
    """`Chromium` -> `Redrob`, except inside the phrases that are about upstream, not about us.

    Done by masking the protected phrases out, substituting, then restoring them. Regex lookarounds
    would need one alternative per phrase and would still miss overlaps; masking cannot.
    """
    masks = {}
    # Google's, before anything else looks at the text: these phrases must not reach the substitution at
    # all, because the right answer for them is neither our name nor upstream's.
    for phrase, replacement in GOOGLE_OWNED_REWRITES:
        text = text.replace(phrase, replacement)
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
    """Overlay the files this fork substitutes wholesale: the BRANDING file and the icons.

    Overlay only. It used to also run the string substitution and the user-agent edit, which made two
    sources of truth for one change: `brand` wrote them into the checkout and `export` had already
    stored them in patches/, so a clean reproduce ran both and `git apply` refused with
    `does not match index`. The fork was not reproducible from its own repository, which is the one
    property the patch model exists to give.

    So the split is now by mechanism, and each file has exactly one owner:

      branding/manifest   files replaced wholesale. Reviewing them means reading branding/, not a diff.
      patches/            surgical edits to files that stay Chromium's.

    `derive` is the generator that produces the surgical branding edits when the pin moves. It is not
    part of getting a build: sync -> apply -> brand -> build needs nothing regenerated.
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


def cmd_derive(_: argparse.Namespace) -> None:
    """Regenerate the surgical branding edits in the checkout, for `export` to turn into patches.

    Run this when CHROMIUM_VERSION moves and the stored patches no longer apply -- rather than fixing a
    768-hunk conflict by hand, re-derive it against the new tree and export. Both steps fail loudly if
    upstream has moved the file, which is the signal to look rather than a reason to force the patch.

    Not part of a normal build. `apply` already carries what this produces.
    """
    if not SRC.exists():
        sys.exit("no checkout: run sync first")

    missing = [name for name in STRINGS_FILES if not (SRC / name).exists()]
    if missing:
        # Loud, not tolerant. A renamed strings file means the next build ships a half-branded browser,
        # and that is far harder to notice than a failure here.
        sys.exit("strings file(s) not found; upstream moved them:\n  " + "\n  ".join(missing))

    total = 0
    for name in STRINGS_FILES:
        path = SRC / name
        text, replaced = substitute_product_name(path.read_text())
        if replaced:
            path.write_text(text)
        total += replaced
        print(f"strings   {name}: {replaced}")
    print(f"strings   {total} occurrence(s) of {UPSTREAM_NAME} -> {PRODUCT_NAME} "
          f"across {len(STRINGS_FILES)} file(s)")

    missing_shared = [name for name in SHARED_STRINGS_FILES if not (SRC / name).exists()]
    if missing_shared:
        sys.exit("shared strings file(s) not found; upstream moved them:\n  " + "\n  ".join(missing_shared))
    shared_total = 0
    for name in SHARED_STRINGS_FILES:
        path = SRC / name
        text, replaced = substitute_short_name(path.read_text())
        if replaced:
            path.write_text(text)
        shared_total += replaced
        print(f"shortname {name}: {replaced}")
    print(f"shortname {shared_total} occurrence(s) of {UPSTREAM_SHORT_NAME} -> {PRODUCT_NAME} "
          f"across {len(SHARED_STRINGS_FILES)} file(s)")

    ua = SRC / USER_AGENT_CC
    if not ua.exists():
        sys.exit(f"user agent file not found: {USER_AGENT_CC}; upstream moved it")
    text, changed = append_user_agent_token(ua.read_text())
    if changed:
        ua.write_text(text)
    print(f"useragent {USER_AGENT_CC}: {'token appended' if changed else 'already branded'}")
    print("\nNow run: ./scripts/redrob.py export")


def cmd_export(_: argparse.Namespace) -> None:
    """Rewrite patches/ from whatever the checkout currently differs by."""
    if not SRC.exists():
        sys.exit("no checkout: run sync first")
    # `git diff HEAD` rather than `git diff`: `apply --3way` stages what it resolves, so an
    # unstaged-only diff silently drops every patch that was applied that way. That is how an export
    # can look like it succeeded while producing three patches out of nine.
    changed = subprocess.run(
        ["git", "diff", "HEAD", "--name-only", "--diff-filter=M"],
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

    # Every file branding/manifest owns is skipped, text as well as binary. It is replaced wholesale, so
    # the file in branding/ IS the review surface, and exporting a patch for it too would recreate the
    # two-sources-of-truth bug that made a clean reproduce fail on `git apply`.
    skipped = overlay_targets()

    if PATCHES.exists():
        # Clear only the generated output. Deleting the directory takes README.md with it -- which is
        # documentation, not output, and is exactly what happened the first time this ran.
        for stale in PATCHES.glob("*.patch"):
            stale.unlink()
    PATCHES.mkdir(parents=True, exist_ok=True)

    exported = 0
    for relative in changed:
        if relative in skipped:
            print(f"skipped {relative} (overlay, owned by branding/manifest)")
            continue
        diff = subprocess.run(
            ["git", "diff", "HEAD", "--src-prefix=a/", "--dst-prefix=b/", "--", relative],
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
    want = FLAVOUR_PLATFORM[args.flavour]
    if sys.platform != want and not args.force_platform:
        sys.exit(f"flavour {args.flavour!r} is for {want}, and this host is {sys.platform}. Chromium's own\n"
                 f"cross-compile support does not cover this pair without a toolchain that is not in the\n"
                 f"checkout, so the build would fail deep inside it. Use --force-platform if you have one.")
    out = SRC / "out" / args.flavour
    args_gn = (ROOT / FLAVOURS[args.flavour]).read_text()
    out.mkdir(parents=True, exist_ok=True)
    (out / "args.gn").write_text(args_gn)
    run(["gn", "gen", f"out/{args.flavour}"], SRC)
    run(["autoninja", "-C", f"out/{args.flavour}", args.target], SRC)


def built_binary(flavour: str) -> pathlib.Path:
    """The launchable thing a build produces, which is a different path on each platform.

    Linux leaves `chrome` in the output directory. Windows leaves `chrome.exe` beside it. macOS produces an
    .app bundle whose executable is several directories inside it and carries the BRANDED name, so it does not
    even share a stem with the other two.
    """
    out = SRC / "out" / flavour
    if sys.platform == "win32":
        return out / "chrome.exe"
    if sys.platform == "darwin":
        return out / "Redrob Browser.app" / "Contents" / "MacOS" / "Redrob Browser"
    return out / "chrome"


def cmd_run(args: argparse.Namespace) -> None:
    binary = built_binary(args.flavour)
    if not binary.exists():
        sys.exit(f"not built: {binary}")
    profile = ROOT / "out" / "profile"
    profile.mkdir(parents=True, exist_ok=True)
    run([str(binary), f"--user-data-dir={profile}", *args.extra], SRC)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)

    sub.add_parser("bootstrap", help="clone depot_tools into this directory").set_defaults(func=cmd_bootstrap)

    # Both versions, because a release note that quotes one of them and calls it "the version" is how a
    # security question ("which Chromium are we on?") gets answered with a product number.
    sub.add_parser("version", help="print Redrob's version and the Chromium tag it is cut from").set_defaults(
        func=cmd_version)

    sub.add_parser("strings", help="regenerate the strings grd and translations from l10n/*.tsv"
                   ).set_defaults(func=cmd_strings)

    sub.add_parser("check", help="repo integrity: manifest, patch names, versions (no checkout needed)"
                   ).set_defaults(func=cmd_check)

    package = sub.add_parser("package", help="build the Linux installer packages into out/artifacts")
    package.add_argument("--flavour", choices=sorted(FLAVOURS), default="release")
    package.add_argument("--allow-dev", action="store_true",
                         help="package a dev build anyway, for testing the packaging path itself")
    package.set_defaults(func=cmd_package)

    repo = sub.add_parser("repo", help="build a signed apt repository from out/artifacts")
    repo.add_argument("--unsigned", action="store_true",
                      help="build it without signing. An unsigned repository means every future update is "
                           "whatever the network hands the user, so it has to be asked for")
    repo.set_defaults(func=cmd_repo)

    sync = sub.add_parser("sync", help="fetch Chromium at CHROMIUM_VERSION")
    sync.add_argument("--no-hooks", action="store_true", help="skip gclient sync/runhooks")
    sync.set_defaults(func=cmd_sync)

    sub.add_parser("brand", help="overlay branding/ files onto the checkout").set_defaults(
        func=cmd_brand
    )

    sub.add_parser(
        "derive", help="regenerate the surgical branding edits (run when the pin moves, then export)"
    ).set_defaults(func=cmd_derive)

    apply_ = sub.add_parser("apply", help="apply patches/ onto the checkout")
    apply_.add_argument("--keep-going", action="store_true", help="report failures instead of stopping")
    apply_.set_defaults(func=cmd_apply)

    sub.add_parser("export", help="regenerate patches/ from the checkout").set_defaults(func=cmd_export)

    build = sub.add_parser("build", help="gn gen + ninja")
    build.add_argument("--flavour", choices=sorted(FLAVOURS), default="dev")
    build.add_argument("--target", default="chrome")
    build.add_argument("--force-platform", action="store_true",
                       help="build a flavour whose platform is not this host's, if you have a cross toolchain")
    build.set_defaults(func=cmd_build)

    run_ = sub.add_parser("run", help="launch the build with a scratch profile")
    run_.add_argument("--flavour", choices=sorted(FLAVOURS), default="dev")
    run_.add_argument("extra", nargs="*", help="extra arguments passed to the binary")
    run_.set_defaults(func=cmd_run)

    parsed = parser.parse_args()
    parsed.func(parsed)


if __name__ == "__main__":
    main()
