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

import ast
import json
import pathlib
import re
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent

# The manifest's own format: `src<TAB>dst`, one line per destination, comments and blanks allowed. Duplicated
# here rather than imported from redrob.py because this file must stay runnable on a machine with nothing set
# up, and importing the CLI drags in its whole environment contract.
def manifest_pairs(path: pathlib.Path) -> list[tuple[str, str, int]]:
    """Manifest rows as (source, target, line). A row ending in `/` is EXPANDED to one pair per file.

    The trailing-slash form names a vendored tree whose file list belongs to its own build
    (sources/chrome/browser/resources/redrob_extension/, the built extension). Expanding here rather than
    special-casing each caller keeps the orphan check and the checkout-match check true of every vendored
    file, which is the reason they exist: a file under sources/ that nothing copies is never built.
    """
    pairs = []
    for n, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        src, dst = parts[0], parts[1]
        if src.endswith("/"):
            root = ROOT / src.rstrip("/")
            prefix = dst.rstrip("/")
            if not root.is_dir():
                pairs.append((src, dst, n))
                continue
            for found in sorted(p for p in root.rglob("*") if p.is_file()):
                relative = found.relative_to(root).as_posix()
                pairs.append((f"{src.rstrip('/')}/{relative}", f"{prefix}/{relative}", n))
            continue
        pairs.append((src, dst, n))
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
        text = patch.read_text(encoding="utf-8", errors="replace")
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
    version = version_file.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        problems.append(f"REDROB_VERSION is not x.y.z: {version!r}")
    chromium = ROOT / "CHROMIUM_VERSION"
    if not chromium.exists():
        problems.append("CHROMIUM_VERSION is missing")
    elif not re.fullmatch(r"\d+\.\d+\.\d+\.\d+", chromium.read_text(encoding="utf-8").strip()):
        problems.append(f"CHROMIUM_VERSION is not a Chromium tag: {chromium.read_text(encoding="utf-8").strip()!r}")

    # A release whose changelog does not mention it is a release nobody can read.
    changelog = ROOT / "CHANGELOG.md"
    if not changelog.exists():
        problems.append("CHANGELOG.md is missing")
    elif f"## {version}" not in changelog.read_text(encoding="utf-8"):
        problems.append(f"CHANGELOG.md has no '## {version}' section for the current REDROB_VERSION")

    # The installer reads the same version from a file inside the Chromium checkout, because that checkout has
    # to be buildable without reaching outside itself. That makes this the one duplicated constant in the repo,
    # so it gets a check: a mismatch would ship a .deb whose version is not the version we tagged, GN and
    # installer.py would still agree with each other, and nothing else would notice.
    info = ROOT / "sources" / "chrome" / "installer" / "linux" / "common" / "redrob-version.txt"
    if not info.exists():
        problems.append("sources/chrome/installer/linux/common/redrob-version.txt is missing; the .deb's "
                        "version would fall back to Chromium's")
    elif info.read_text(encoding="utf-8").strip() != version:
        problems.append(f"redrob-version.txt says {info.read_text(encoding="utf-8").strip()!r} but REDROB_VERSION says "
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


def check_script_encodings(problems: list[str]) -> None:
    """Every file read and write in scripts/ must name its encoding.

    Python's default is locale-dependent, and on Windows that locale is cp1252 -- so a bare
    `path.read_text()` works on Linux and raises UnicodeDecodeError on Windows the moment any file it
    touches contains a non-Latin-1 byte. That is not hypothetical: the first Windows CI run died three
    steps in, reading a CHANGELOG.md that had just gained Korean, with

        UnicodeDecodeError: 'charmap' codec can't decode byte 0x90 in position 542

    Checked with ast rather than a grep, so a call split across lines is judged by its keywords rather
    than by which line the method name happens to sit on.
    """
    scripts = ROOT / "scripts"
    if not scripts.exists():
        return
    for path in sorted(scripts.glob("*.py")):
        try:
            tree = ast.parse(path.read_text(encoding="utf-8"))
        except SyntaxError as exc:
            problems.append(f"scripts/{path.name} does not parse: {exc}")
            continue
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call) or not isinstance(node.func, ast.Attribute):
                continue
            if node.func.attr not in ("read_text", "write_text"):
                continue
            if not any(kw.arg == "encoding" for kw in node.keywords):
                problems.append(f"scripts/{path.name}:{node.lineno} calls {node.func.attr}() with no "
                                f"encoding=; that is cp1252 on Windows and breaks on any non-Latin-1 byte")


def check_rewrites(problems: list[str]) -> None:
    """Every rule-generated patch must still be what its rules produce.

    Two failures this catches, both of which are silent otherwise. One: a rule whose anchor moved at a
    Chromium uprev, or now matches a different NUMBER of places than it declared -- that is the whole
    reason the rules carry a count, and a count that is wrong changes the wrong amount of code without
    anything going red. Two: somebody edited a GENERATED patch by hand, which works exactly once and is
    then silently discarded by the next regeneration.

    Needs a checkout, because a rule is only meaningful against the upstream file it rewrites. Without
    one this is reported as skipped rather than passed -- a check that cannot run has not passed.
    """
    rewrites = ROOT / "rewrite"
    if not rewrites.exists():
        return
    rules = sorted(rewrites.rglob("*.yaml"))
    if not rules:
        return

    # The half that needs no checkout, so it runs in CI, where there is none. A rule is only MEANINGFUL
    # against the upstream file it rewrites, but it can still be malformed, and a malformed rule is a
    # patch that silently stops being regenerable.
    sys.path.insert(0, str(ROOT / "scripts"))
    try:
        import plaster  # noqa: PLC0415 -- deliberately late, it is a sibling script not a package.
    except ImportError as error:
        problems.append(f"cannot import scripts/plaster.py to validate rewrite rules: {error}")
        return
    for rule in rules:
        relative = str(rule.relative_to(rewrites))[: -len(".yaml")]
        patch = ROOT / "patches" / plaster.patch_name(relative)
        if not patch.exists():
            problems.append(
                f"rewrite/{relative}.yaml has no patch at patches/{patch.name}; "
                f"run plaster.py generate"
            )
        try:
            subs = plaster.load_rules(rule)
        except plaster.RuleError as error:
            problems.append(str(error))
            continue
        for index, sub in enumerate(subs, start=1):
            label = f"rewrite/{relative}.yaml substitution {index}"
            if not (sub.get("description") or "").strip():
                problems.append(f"{label} has no description saying why the rewrite exists")
            kinds = [key for key in sub if key != "description"]
            if len(kinds) != 1:
                problems.append(f"{label} must carry exactly one rewriter, has {kinds}")
                continue
            if kinds[0] not in plaster.REWRITERS:
                problems.append(
                    f"{label} uses unknown rewriter {kinds[0]!r}; have {sorted(plaster.REWRITERS)}"
                )
                continue
            body = sub[kinds[0]]
            if kinds[0] == "regex" and isinstance(body, dict) and body.get("re_pattern"):
                try:
                    re.compile(body["re_pattern"])
                except re.error as error:
                    problems.append(f"{label} re_pattern does not compile: {error}")
            # A rename's protected-phrase list is shared, so a typo'd or deleted preset silently
            # unprotects every phrase in it across every strings file at once -- the widest-blast-radius
            # mistake in the rule set, and one that needs no checkout to catch.
            if kinds[0] == "rename" and isinstance(body, dict):
                try:
                    plaster.load_preset(label, body.get("preset") or "")
                except plaster.RuleError as error:
                    problems.append(str(error))

    # Do the two rule parsers agree? Needs no checkout, so this runs in CI. It is deliberately a
    # separate process rather than an inline call: the point is to compare plaster's two reading paths,
    # and check_repo has already imported one of them into this interpreter.
    parsers = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "plaster.py"), "parsers"],
        capture_output=True,
        text=True,
    )
    if parsers.returncode != 0:
        problems.append(
            "the PyYAML and built-in rule parsers disagree, so the generated patch depends on which "
            "host ran plaster:\n" + (parsers.stderr or parsers.stdout).strip()
        )

    # The half that needs the upstream files: does each rule still MATCH, the declared number of times, and
    # is its patch still what the rule produces. Reported as skipped rather than passed without a checkout --
    # a check that cannot run has not passed.
    if not (ROOT / "chromium" / "src").exists():
        print(f"skip: {len(rules)} rewrite rule(s) not matched against upstream -- no checkout "
              f"(run redrob.py sync, then plaster.py check)")
        return
    result = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "plaster.py"), "check"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        output = result.stderr + result.stdout
        found = False
        for line in output.splitlines():
            if line.startswith("FAIL"):
                problems.append(line[len("FAIL "):].strip())
                found = True
        if not found:
            problems.append(f"plaster.py check failed with no FAIL line: {result.stderr.strip()[:300]}")


def check_update_channel(problems: list[str]) -> None:
    """The package's repository URL and the workflow's publish path must be the same place.

    Linux auto-update is two halves written in two files that never reference each other. The package
    says where to look -- REDROB_REPO_BASE, baked into the .sources file apt reads -- and
    sign-and-publish.yml decides where the repository is uploaded. If those drift, NOTHING FAILS: the
    release publishes a valid signed repository, the package installs a valid apt source, and every
    machine polls a 404 forever. The user sees a browser that simply never updates, and there is no error
    anywhere to find, because both halves did exactly what they were told.

    Checked by string rather than by running anything, because that is all the coupling is: a hostname and
    a prefix that have to match.
    """
    installer = ROOT / "patches" / "chrome-installer-linux-common-installer.py.patch"
    workflow = ROOT / ".github" / "workflows" / "sign-and-publish.yml"
    if not installer.exists() or not workflow.exists():
        return
    text = installer.read_text(encoding="utf-8")
    match = re.search(r'REDROB_REPO_BASE\s*=\s*"([^"]+)"', text)
    if not match:
        problems.append(
            "cannot find REDROB_REPO_BASE in the installer patch, so the update channel's URL cannot be "
            "checked against where sign-and-publish.yml uploads the repository"
        )
        return
    # "cdn.redrob.ai/browser/apt stable main" -> host + path, dropping the suite and component.
    base = match.group(1).split()[0]
    flow = workflow.read_text(encoding="utf-8")
    host = re.search(r"CDN_PUBLIC_HOST:\s*(\S+)", flow)
    prefix = re.search(r"CDN_PREFIX:\s*(\S+)", flow)
    if not host or not prefix:
        problems.append("sign-and-publish.yml no longer declares CDN_PUBLIC_HOST and CDN_PREFIX")
        return
    expected = f"{host.group(1)}/{prefix.group(1)}/apt"
    if base != expected:
        problems.append(
            f"the update channel is split: the package points apt at {base!r} but sign-and-publish.yml "
            f"publishes the repository to {expected!r}. Nothing would fail -- every installed copy would "
            f"poll a URL that does not exist and never update."
        )
    # Require an S3 DESTINATION carrying the apt path, not merely the path appearing somewhere. The first
    # version of this check looked for the bare string and passed a workflow whose upload had been replaced
    # with a different destination, because the path still occurred in the read-back loop below it. A gate
    # that matches its own verification output is not checking the thing it names.
    uploads = re.search(
        r"s3://[^\s\"']*(?:\$\{CDN_PREFIX\}|" + re.escape(prefix.group(1)) + r")/apt/", flow
    )
    if not uploads:
        problems.append(
            f"no s3 destination in sign-and-publish.yml targets {prefix.group(1)}/apt/, so the repository "
            f"the package points at is never published"
        )


def check_overlay(problems: list[str]) -> None:
    """The chromium_src overlay has to be reachable and has to wrap rather than copy.

    An override that does not include the file it overrides is not an override -- it REPLACES the upstream
    translation unit wholesale, and then upstream's fixes to that file stop arriving with no conflict to
    say so. That is the one mistake this mechanism makes easy, so it is the one thing checked.
    """
    overlay = ROOT / "redrob" / "chromium_src"
    if not overlay.exists():
        return
    for path in sorted(overlay.rglob("*")):
        if not path.is_file() or path.suffix not in (".cc", ".mm", ".h"):
            continue
        relative = path.relative_to(overlay).as_posix()
        text = path.read_text(encoding="utf-8")
        # The angle form is what reaches the original; the quoted form would find this file again.
        if f"#include <{relative}>" not in text:
            problems.append(
                f"redrob/chromium_src/{relative} never includes <{relative}>, so it replaces the upstream "
                f"file instead of wrapping it -- upstream changes to that file would stop arriving silently"
            )
        if f'#include "{relative}"' in text:
            problems.append(
                f"redrob/chromium_src/{relative} includes itself with quotes; use "
                f"#include <{relative}> so -iquote resolves to the ORIGINAL"
            )


def check_ui_ownership(problems: list[str]) -> None:
    """Once the UI migration has begun, a NEW native WebUI file in a moved surface is a regression.

    Dormant until `sources/.ui-migration-began` exists: before that, the resource directories still hold the
    WebUI we have not moved yet, and failing on them would block every other item. The sentinel is committed by
    the first phase-3 item (O-2) and lists, one per line, the resource directories already migrated to the
    extension (e.g. `redrob_settings`). After that point a new `.ts`/`.css`/`.html` under a listed directory
    fails; editing an existing file does not, because a migration lands its deletions in its own later item.

    See docs/OWNERSHIP.md. This is the cheap-mistake floor -- a new native UI file that compiles and looks
    normal -- not the whole boundary, which the reviewer still enforces.
    """
    sentinel = ROOT / "sources" / ".ui-migration-began"
    if not sentinel.exists():
        return
    migrated = [
        line.strip()
        for line in sentinel.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    ]
    if not migrated:
        return
    res_root = ROOT / "sources" / "chrome" / "browser" / "resources"
    # "New" means not yet tracked by git: a migration edits/deletes existing tracked files in its own item, but
    # a brand-new native UI file under a migrated surface is the regression this catches.
    try:
        tracked = set(
            subprocess.run(
                ["git", "ls-files", "sources/chrome/browser/resources"],
                cwd=ROOT, capture_output=True, text=True, check=True,
            ).stdout.splitlines()
        )
    except (subprocess.CalledProcessError, FileNotFoundError):
        problems.append("check_ui_ownership: could not list tracked files via git; cannot enforce the boundary")
        return
    for surface in migrated:
        surface_dir = res_root / surface
        if not surface_dir.is_dir():
            continue
        for path in surface_dir.rglob("*"):
            if path.suffix not in (".ts", ".css", ".html"):
                continue
            rel = path.relative_to(ROOT).as_posix()
            if rel not in tracked:
                problems.append(
                    f"ownership: {rel} is a new WebUI file under migrated surface '{surface}'. That surface "
                    f"moved to the extension (see sources/.ui-migration-began); native UI for it is a "
                    f"regression. Build it in the extension, not here (docs/OWNERSHIP.md)."
                )


def check_idl_interfaces(problems: list[str]) -> None:
    """One `interface Functions`, one `interface Events`, and events only in Events.

    The extension idl parser reads whatever structure it is given and reports nothing:
    merging ten branches that each appended to the same anchor left this file with
    `interface Functions` closed early and 32 FUNCTIONS declared inside a second
    `interface Events` block. The parser returned 6 functions out of 38, the generated
    header had no types for the rest, and the only thing that objected was the C++
    compiler -- a build away. This check is a second.
    """
    for idl in sorted((ROOT / "sources/chrome/common/extensions/api").glob("*.idl")):
        label = idl.relative_to(ROOT)
        lines = idl.read_text(encoding="utf-8").split("\n")
        blocks = [(n, m.group(1)) for n, line in enumerate(lines, 1)
                  if (m := re.match(r"\s*interface (Functions|Events)\s*\{", line))]
        for kind in ("Functions", "Events"):
            count = sum(1 for _, name in blocks if name == kind)
            if count > 1:
                problems.append(
                    f"{label} declares `interface {kind}` {count} times; the parser reads "
                    f"only one and silently drops the rest"
                )
        # Which block each declaration sits in, by walking the interface boundaries.
        current = None
        for number, line in enumerate(lines, 1):
            match = re.match(r"\s*interface (Functions|Events)\s*\{", line)
            if match:
                current = match.group(1)
                continue
            declaration = re.search(r"static \w+ (\w+)\(", line)
            if not declaration or current is None:
                continue
            name = declaration.group(1)
            is_event = name.startswith("on")
            if is_event and current != "Events":
                problems.append(f"{label}:{number} declares event {name} inside interface {current}")
            if not is_event and current != "Functions":
                problems.append(f"{label}:{number} declares function {name} inside interface {current}")


def check_function_enum_coverage(problems: list[str]) -> None:
    """Every DECLARE_EXTENSION_FUNCTION's enum name must exist in the enum rule.

    A declared name that is not in the enum does not compile -- `no member named
    REDROBPRIVATE_STARTIMPORT in namespace extensions::functions` -- and that is
    exactly how it shipped: the function was added on one branch and its enum value
    was never added to the rule, which no rule check noticed because nothing compared
    the two. The compiler found it 40 minutes into a build.

    Only the mapping is checked, not the reverse: an enum value with no function yet is
    a reserved ordinal, which is legitimate.
    """
    sources = ROOT / "sources/chrome/browser/extensions/api/redrob_private"
    if not sources.is_dir():
        return
    declared: dict[str, str] = {}
    for header in sorted(sources.glob("*.h")):
        for name in re.findall(r"\b(REDROBPRIVATE_[A-Z0-9_]+)\b", header.read_text(encoding="utf-8")):
            declared.setdefault(name, header.name)
    rule = ROOT / "rewrite/extensions/browser/extension_function_histogram_value.h.yaml"
    if not rule.is_file():
        problems.append(f"{declared and 'functions are declared but'} the function enum rule is missing")
        return
    in_rule = set(re.findall(r"\b(REDROBPRIVATE_[A-Z0-9_]+)\s*=\s*\d+,", rule.read_text(encoding="utf-8")))
    for name, header in sorted(declared.items()):
        if name not in in_rule:
            problems.append(
                f"{header} declares {name} but {rule.relative_to(ROOT)} does not give it a value; "
                f"the generated registration will not compile"
            )


def check_enum_rules(problems: list[str]) -> None:
    """Refuse a rewrite rule that declares the same enumerator, or the same ordinal, twice.

    A C++ enum rejects both, but only at compile time -- and the rule set is checked
    far more often than the browser is built. This is not hypothetical: the
    redrobPrivate function enum arrived on six stacked branches that all appended to
    one anchor, and merging them re-emitted the values already on develop, so some
    enumerators were declared six times with six different numbers. Every rule check
    passed; the compiler was the only thing that objected, after a 40-minute build.
    """
    entry = re.compile(r"^\s*([A-Z][A-Z0-9_]*)\s*=\s*(\d+),\s*$")
    for rule in sorted((ROOT / "rewrite").rglob("*.yaml")):
        names: dict[str, int] = {}
        values: dict[int, str] = {}
        label = rule.relative_to(ROOT)
        for line in rule.read_text(encoding="utf-8").split("\n"):
            match = entry.match(line)
            if not match:
                continue
            name, value = match.group(1), int(match.group(2))
            if name in names:
                problems.append(
                    f"{label} declares enumerator {name} twice ({names[name]} and {value}); "
                    f"a C++ enum rejects the redefinition"
                )
            elif value in values:
                problems.append(
                    f"{label} gives {value} to both {values[value]} and {name}; "
                    f"two enumerators cannot share an ordinal"
                )
            names[name] = value
            values[value] = name


def check_vendored_extension(problems: list[str]) -> None:
    """The vendored extension agrees with its pin, its grd, and the id the allowlist names.

    Three ways this fails silently without a gate, all of them shipping a browser whose agent surfaces do
    not work while the build is green. A grd out of step with the tree drops a chunk, so one page 404s a
    module it imports. A resource-name collision makes two files one resource, so the second never ships.
    And an extension id that is not the one the vendored manifest's key derives is not on the component
    allowlist, which loads the extension WITHOUT redrobPrivate rather than refusing to load it -- the same
    picture as an unpacked dev load, which is the thing this whole item exists to stop being the shipped
    state. scripts/vendor_extension.py owns the checks; this runs it so one gate reports everything.
    """
    script = ROOT / "scripts" / "vendor_extension.py"
    if not script.is_file():
        problems.append("scripts/vendor_extension.py is missing")
        return
    result = subprocess.run(
        [sys.executable, str(script)], capture_output=True, text=True, cwd=ROOT
    )
    if result.returncode != 0:
        for line in (result.stderr or result.stdout).strip().splitlines():
            problems.append(line.strip())
        return

    # The id in the allowlist rule and in the constants rule must be the id the vendored key derives.
    # Asserted here rather than inside the vendor script because it is a fact about the REWRITE RULES.
    pin_path = ROOT / "sources/chrome/browser/resources/redrob_extension/VENDOR.json"
    try:
        expected_id = json.loads(pin_path.read_text(encoding="utf-8"))["extension_id"]
    except (OSError, ValueError, KeyError):
        problems.append("cannot read the vendored extension's id from VENDOR.json")
        return
    constants_rule = ROOT / "rewrite/extensions/common/constants.h.yaml"
    if not constants_rule.is_file():
        problems.append("rewrite/extensions/common/constants.h.yaml does not declare kRedrobExtensionId")
        return
    text = constants_rule.read_text(encoding="utf-8")
    if "kRedrobExtensionId" not in text:
        problems.append("rewrite/extensions/common/constants.h.yaml does not declare kRedrobExtensionId")
    elif f'"{expected_id}"' not in text:
        problems.append(
            f"kRedrobExtensionId is not {expected_id}, the id the vendored manifest's key derives -- "
            f"the extension would load off the component allowlist, without redrobPrivate"
        )
    allowlist_rule = ROOT / "rewrite/chrome/browser/extensions/component_extensions_allowlist/allowlist.cc.yaml"
    if allowlist_rule.is_file():
        allowlist_text = allowlist_rule.read_text(encoding="utf-8")
        # TWO allowlists, and the browser needs both. ComponentLoader::Add checks the one keyed by manifest
        # RESOURCE id, and a miss there is a NOTREACHED during profile creation -- the browser aborts before
        # it draws a window. The extension-id list is what the rest of the browser asks. Asserting only the
        # id entry is what shipped a build that linked cleanly and crashed on startup.
        if "kRedrobExtensionId" not in allowlist_text:
            problems.append("the component extension allowlist rule does not name kRedrobExtensionId")
        if "case IDR_REDROB_EXTENSION_MANIFEST_JSON:" not in allowlist_text:
            problems.append(
                "the component extension allowlist rule does not add a `case "
                "IDR_REDROB_EXTENSION_MANIFEST_JSON:` -- ComponentLoader::Add checks the RESOURCE-id "
                "allowlist, and a miss there aborts the browser during profile creation"
            )
    else:
        problems.append("the component extension allowlist rule is missing")
    loader_rule = ROOT / "rewrite/chrome/browser/extensions/component_loader.cc.yaml"
    if loader_rule.is_file():
        loader_text = loader_rule.read_text(encoding="utf-8")
        for needed in ("AddRedrobExtension();", "IDR_REDROB_EXTENSION_MANIFEST_JSON"):
            if needed not in loader_text:
                problems.append(f"component_loader.cc rule is missing {needed}")
    else:
        problems.append("rewrite/chrome/browser/extensions/component_loader.cc.yaml is missing")


def main() -> int:
    problems: list[str] = []
    check_sources(problems)
    check_branding(problems)
    check_patch_names(problems)
    check_versions(problems)
    check_strings(problems)
    check_script_encodings(problems)
    check_sources_match_checkout(problems)
    check_overlay(problems)
    check_update_channel(problems)
    check_ui_ownership(problems)
    check_rewrites(problems)
    check_enum_rules(problems)
    check_function_enum_coverage(problems)
    check_idl_interfaces(problems)
    check_vendored_extension(problems)
    if problems:
        for problem in problems:
            print(f"FAIL {problem}")
        print(f"\n{len(problems)} problem(s)")
        return 1
    print("ok: sources, branding, patch names, versions, strings, script encodings, the chromium_src "
          "overlay and every rewrite rule are consistent")
    return 0


if __name__ == "__main__":
    sys.exit(main())
