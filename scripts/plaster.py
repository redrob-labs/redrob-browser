#!/usr/bin/env python3
"""Generate upstream patches from rewrite rules, and fail loudly when a rule stops matching.

A hand-written patch records WHAT the file looked like. A rewrite rule records WHAT WE MEANT -- "make this
method virtual", "route this one call through ours" -- and the patch is regenerated from it. The
difference shows up at the next Chromium uprev. A hand patch whose context moved conflicts, and resolving
it is re-deciding the change with a merge tool. A rule whose anchor moved still matches, because the rule
names the anchor rather than the three lines above it.

The part that earns its keep is `count`. Every substitution declares how many matches it expects, default
one. A rule that was meant to change a single call and now matches twice, or none, STOPS THE BUILD instead
of quietly changing the wrong amount of code. That is the failure a hand patch cannot report: a patch that
applies is a patch that applied, whether or not the premise it was written under still holds.

Layout:

    rewrite/<upstream path>.yaml   ->   patches/<upstream path with slashes as dashes>.patch

Usage:

    scripts/plaster.py generate          regenerate every patch from its rules
    scripts/plaster.py generate <path>   just one, by upstream path
    scripts/plaster.py check             regenerate in memory and diff against patches/ (CI gate)
    scripts/plaster.py list              what is rule-generated and what each rule does
"""

from __future__ import annotations

import argparse
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "chromium" / "src"
PATCHES = ROOT / "patches"
REWRITES = ROOT / "rewrite"
PRESETS = ROOT / "presets"
DEPOT_TOOLS = ROOT / "depot_tools"

RE_FLAGS = {
    "DOTALL": re.DOTALL,
    "MULTILINE": re.MULTILINE,
    "IGNORECASE": re.IGNORECASE,
    "VERBOSE": re.VERBOSE,
}


class RuleError(Exception):
    """A rule whose premise no longer holds. Carries the path so the message can name the file."""


def patch_name(relative: str) -> str:
    """Same naming as redrob.py, so a rule-generated patch lands on the hand patch it replaces."""
    return relative.replace("/", "-") + ".patch"


def rewrite_files(only: str | None = None) -> list[tuple[str, Path]]:
    """Every rule file as (upstream relative path, yaml path)."""
    if not REWRITES.exists():
        return []
    rows = []
    for yaml_path in sorted(REWRITES.rglob("*.yaml")):
        relative = str(yaml_path.relative_to(REWRITES))[: -len(".yaml")]
        if only and relative != only:
            continue
        rows.append((relative, yaml_path))
    return rows


def load_rules(yaml_path: Path) -> list[dict]:
    """Read a rule file.

    PyYAML is not in the checkout's python, and pulling a dependency in for this would make the build
    depend on a package install. The subset used here -- a `substitutions` list of single-key mappings
    with string scalars and block scalars -- is small enough to read directly, and refusing anything it
    does not understand keeps a silently-misread rule from becoming a silently-wrong patch.
    """
    text = yaml_path.read_text(encoding="utf-8")
    try:
        import yaml  # noqa: PLC0415  -- optional, and preferred when present.

        data = yaml.safe_load(text)
    except ImportError:
        data = _parse_minimal_yaml(text, yaml_path)
    if not isinstance(data, dict) or "substitutions" not in data:
        raise RuleError(f"{yaml_path}: needs a top-level `substitutions:` list")
    subs = data["substitutions"]
    if not isinstance(subs, list) or not subs:
        raise RuleError(f"{yaml_path}: `substitutions:` must be a non-empty list")
    return subs


def _parse_minimal_yaml(text: str, yaml_path: Path) -> dict:
    """The subset described in load_rules. Anything else is an error, never a guess."""
    lines = text.splitlines()
    subs: list[dict] = []
    current: dict | None = None
    section: str | None = None       # the rewriter key a nested block belongs to
    block_key: str | None = None     # a `key: |` block being collected
    block_chomp = "clip"             # how the block's trailing newlines are treated
    block_indent = 0
    block_lines: list[str] = []
    saw_header = False

    def close_block(target: dict) -> None:
        """Finish a block scalar with YAML's own chomping rules, not a convenient approximation.

        This used to `.rstrip("\\n")` every block, which is `|-` semantics applied to `|` as well. That is
        not a cosmetic difference: PyYAML keeps the final newline for `|`, so the SAME rule file produced
        two different replacements depending on whether PyYAML happened to be importable, and therefore
        two different patches. A patch that depends on a host's installed packages is not a reproducible
        patch, which is the one property this whole mechanism exists to provide.
        """
        nonlocal block_key, block_lines
        if block_key is None:
            return
        body = "\n".join(block_lines).rstrip("\n")
        # clip (`|`): exactly one trailing newline, if the block had any content at all.
        # strip (`|-`): none.
        target[block_key] = body + "\n" if (block_chomp == "clip" and body) else body
        block_key = None
        block_lines = []

    for number, raw in enumerate(lines, start=1):
        if block_key is not None:
            if raw.strip() and not raw.startswith(" " * block_indent):
                close_block(current[section] if section else current)  # type: ignore[index]
            else:
                block_lines.append(raw[block_indent:] if len(raw) >= block_indent else "")
                continue
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped == "substitutions:":
            saw_header = True
            continue
        if not saw_header:
            raise RuleError(f"{yaml_path}:{number}: expected `substitutions:` first")

        indent = len(raw) - len(raw.lstrip(" "))
        if stripped.startswith("- "):
            if current is not None:
                close_block(current[section] if section else current)  # type: ignore[index]
                subs.append(current)
            current = {}
            section = None
            stripped = stripped[2:].strip()
            indent += 2
        if current is None:
            raise RuleError(f"{yaml_path}:{number}: content outside a list item")

        if ":" not in stripped:
            raise RuleError(f"{yaml_path}:{number}: not a `key: value` line: {stripped!r}")
        key, _, value = stripped.partition(":")
        key, value = key.strip(), value.strip()

        # A nested rewriter block (`regex:`, `make_virtual:`) opens a section; its own keys are indented.
        target = current
        if section is not None and indent > current.get("__indent__", 0):  # type: ignore[union-attr]
            target = current[section]

        if value in ("|", "|-"):
            close_block(target)
            block_key = key
            block_chomp = "strip" if value == "|-" else "clip"
            block_indent = indent + 2
            block_lines = []
            continue
        # Folded scalars are REFUSED rather than approximated. Folding joins lines with spaces except
        # across blank lines and more-indented lines, and getting that subtly wrong would silently change
        # a replacement's text. Every rewrite here wants literal lines anyway, which is `|`.
        if value in (">", ">-"):
            raise RuleError(
                f"{yaml_path}:{number}: folded scalars ({value}) are not supported; use | or |- so the "
                f"replacement text is literal"
            )
        if value == "":
            current[key] = {}
            current["__indent__"] = indent
            section = key
            continue

        target[key] = _scalar(value)

    if current is not None:
        close_block(current[section] if section else current)
        subs.append(current)
    for sub in subs:
        sub.pop("__indent__", None)
    return {"substitutions": subs}


def _scalar(value: str):
    """Quoted string, bracket list, int, or bare string -- in that order.

    A DOUBLE-quoted scalar has its escapes interpreted, as YAML defines and as PyYAML does; a
    single-quoted one is literal apart from `''` meaning one apostrophe. Stripping the quotes and
    stopping there -- which is what this did -- turned `"a\\nb"` into a backslash followed by an `n`, so a
    rule written that way did not insert a newline, it inserted two visible characters into a shell
    include. With PyYAML present the same rule inserted a real newline, so the two paths produced
    different files from identical input.
    """
    if len(value) >= 2 and value[0] == value[-1] and value[0] == '"':
        return _unescape(value[1:-1])
    if len(value) >= 2 and value[0] == value[-1] and value[0] == "'":
        return value[1:-1].replace("''", "'")
    if value.startswith("[") and value.endswith("]"):
        return [item.strip().strip("'\"") for item in value[1:-1].split(",") if item.strip()]
    try:
        return int(value)
    except ValueError:
        return value


# The escapes a replacement plausibly needs. Anything else is refused rather than passed through as
# itself: silently emitting a backslash is how `\n` became two characters in a generated patch.
_ESCAPES = {"n": "\n", "t": "\t", "r": "\r", "0": "\0", "\\": "\\", '"': '"', "/": "/", " ": " "}


def _unescape(text: str) -> str:
    out: list[str] = []
    index = 0
    while index < len(text):
        char = text[index]
        if char != "\\":
            out.append(char)
            index += 1
            continue
        if index + 1 >= len(text):
            raise RuleError("double-quoted scalar ends with a trailing backslash")
        nxt = text[index + 1]
        if nxt not in _ESCAPES:
            raise RuleError(
                rf"unsupported escape \{nxt} in a double-quoted scalar; supported: "
                rf"{sorted(_ESCAPES)}. Use a | block for literal text."
            )
        out.append(_ESCAPES[nxt])
        index += 2
    return "".join(out)


def apply_substitutions(relative: str, text: str, subs: list[dict]) -> str:
    """Run every substitution in order, enforcing each one's expected match count."""
    for index, sub in enumerate(subs, start=1):
        label = f"{relative} substitution {index}"
        description = sub.get("description", "").strip().splitlines()
        if not description:
            raise RuleError(f"{label}: needs a `description` saying why the rewrite exists")
        rewriters = [key for key in sub if key not in ("description",)]
        if len(rewriters) != 1:
            raise RuleError(f"{label}: exactly one rewriter per substitution, got {rewriters}")
        kind = rewriters[0]
        body = sub[kind]
        handler = REWRITERS.get(kind)
        if handler is None:
            raise RuleError(f"{label}: unknown rewriter {kind!r}; have {sorted(REWRITERS)}")
        text = handler(label, text, body)
    return text


def _substitute(label: str, text: str, pattern: str, replace: str, count: int, flags: int) -> str:
    """The one place a match count is enforced, so every rewriter inherits the same guarantee."""
    compiled = re.compile(pattern, flags)
    found = len(compiled.findall(text))
    # count 0 means "every occurrence, and there must be at least one" -- for a rename that is meant to
    # sweep a file. It still fails on zero, because a sweep that matches nothing is a rule that has died.
    if count == 0:
        if found == 0:
            raise RuleError(f"{label}: matched nothing (count: 0 means at least one)")
        return compiled.sub(replace, text)
    if found != count:
        raise RuleError(
            f"{label}: expected {count} match(es), found {found}. The premise moved -- re-read the "
            f"upstream file and update the rule rather than the count, unless the new number is right."
        )
    return compiled.sub(replace, text, count=count)


def rewrite_regex(label: str, text: str, body: dict) -> str:
    if not isinstance(body, dict):
        raise RuleError(f"{label}: `regex` takes a mapping")
    literal, expression = body.get("pattern"), body.get("re_pattern")
    if (literal is None) == (expression is None):
        raise RuleError(f"{label}: give exactly one of `pattern` (literal) or `re_pattern` (regex)")
    if "replace" not in body:
        raise RuleError(f"{label}: `regex` needs `replace`")
    flags = 0
    for name in body.get("re_flags", []) or []:
        if name not in RE_FLAGS:
            raise RuleError(f"{label}: unknown re_flag {name!r}; have {sorted(RE_FLAGS)}")
        flags |= RE_FLAGS[name]
    # A literal `pattern` is escaped for the caller, and its replacement too: the point of choosing the
    # literal form is that there is no regex syntax to get wrong, and an unescaped backslash in the
    # replacement would reintroduce exactly that.
    pattern = re.escape(literal) if literal is not None else expression
    replace = body["replace"].replace("\\", "\\\\") if literal is not None else body["replace"]
    return _substitute(label, text, pattern, replace, int(body.get("count", 1)), flags)


def rewrite_make_virtual(label: str, text: str, body: dict) -> str:
    """Add `virtual` to one method declaration, so our subclass can override it.

    This is the case a `#define` must not be used for. `#define Foo virtual Foo` rewrites EVERY `Foo` in
    the translation unit, including ones dragged in by later includes -- a rename nobody asked for, in
    files nobody looked at. Here the class and the method are named, the declaration is found, and the
    count check fails if it is not there any more.
    """
    for field in ("class_name", "method_name"):
        if not body.get(field):
            raise RuleError(f"{label}: `make_virtual` needs {field}")
    class_name, method = body["class_name"], body["method_name"]
    # Anchored inside the named class so a same-named method on another class in the file is not touched.
    # `.*?` with DOTALL walks forward from the class head to the first matching declaration.
    pattern = (
        rf"(\b(?:class|struct)\s+(?:\w+\s+)*{re.escape(class_name)}\b.*?"
        rf"\n(\s*))((?:[\w:<>,&*\[\]\s]+?\s)?{re.escape(method)}\s*\()"
    )
    return _substitute(label, text, pattern, r"\1virtual \3", int(body.get("count", 1)), re.DOTALL)


def rewrite_add_friend(label: str, text: str, body: dict) -> str:
    """Grant one of our classes access to a private member, without widening it for everyone."""
    for field in ("class_name", "friend"):
        if not body.get(field):
            raise RuleError(f"{label}: `add_friend` needs {field}")
    class_name, friend = body["class_name"], body["friend"]
    pattern = rf"(\b(?:class|struct)\s+(?:\w+\s+)*{re.escape(class_name)}\b[^{{;]*\{{\n)"
    return _substitute(
        label, text, pattern, rf"\1  friend class {friend};\n", int(body.get("count", 1)), 0
    )


def rewrite_drop_final(label: str, text: str, body: dict) -> str:
    """Remove `final` from one class declaration so it can be subclassed.

    Not `#define final` -- redefining a keyword is undefined behaviour and spreads to every file the
    translation unit pulls in afterwards. This edits the one declaration and nothing else.
    """
    if not body.get("class_name"):
        raise RuleError(f"{label}: `drop_final` needs class_name")
    class_name = body["class_name"]
    pattern = rf"(\b(?:class|struct)\s+(?:\w+\s+)*{re.escape(class_name)}\s+)final\b"
    return _substitute(label, text, pattern, r"\1", int(body.get("count", 1)), 0)


def load_preset(label: str, name: str) -> dict:
    """Read presets/<name>.yaml: the shared `from`/`to`/`protect` a rename is parameterised by.

    A preset exists because twenty-odd strings files take the SAME rename, and the protected-phrase list
    is the part that must not be copied. A per-file copy drifts, and the way it drifts is silent: one
    file keeps substituting a phrase the others learned to leave alone, so the product contradicts
    itself in one screen and nothing fails.
    """
    path = PRESETS / f"{name}.yaml"
    if not path.exists():
        available = sorted(p.stem for p in PRESETS.glob("*.yaml")) if PRESETS.exists() else []
        raise RuleError(f"{label}: no preset {name!r} at presets/{name}.yaml; have {available}")
    text = path.read_text(encoding="utf-8")
    try:
        import yaml  # noqa: PLC0415  -- optional, and preferred when present.

        data = yaml.safe_load(text)
    except ImportError:
        data = _parse_preset(text, path)
    if not isinstance(data, dict):
        raise RuleError(f"presets/{name}.yaml: must be a mapping")
    for field in ("from", "to"):
        if not isinstance(data.get(field), str) or not data[field]:
            raise RuleError(f"presets/{name}.yaml: needs a non-empty `{field}`")
    protect = data.get("protect", []) or []
    if not isinstance(protect, list) or any(not isinstance(p, str) for p in protect):
        raise RuleError(f"presets/{name}.yaml: `protect` must be a list of strings")
    return {"from": data["from"], "to": data["to"], "protect": protect}


def _parse_preset(text: str, path: Path) -> dict:
    """Scalars and one list of scalars. The same no-dependency subset load_rules accepts, and no more.

    Anything outside that subset is an error rather than a guess, because a silently misread preset is a
    silently unprotected phrase -- which is the one failure this file exists to prevent.
    """
    data: dict = {}
    list_key: str | None = None
    for number, raw in enumerate(text.splitlines(), start=1):
        stripped = raw.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("- "):
            if list_key is None:
                raise RuleError(f"{path}:{number}: list item outside any key")
            data[list_key].append(_preset_scalar(stripped[2:].strip()))
            continue
        if ":" not in stripped:
            raise RuleError(f"{path}:{number}: expected `key: value` or `- item`")
        key, _, value = stripped.partition(":")
        key, value = key.strip(), value.strip()
        if not value:
            list_key = key
            data[key] = []
        else:
            list_key = None
            data[key] = _preset_scalar(value)
    return data


def _preset_scalar(value: str) -> str:
    """A protected phrase, with its quotes removed and its escapes interpreted.

    Deliberately NOT the rules parser's `_scalar`: a preset value is always a string, and borrowing a
    coercing helper would turn a phrase that happens to look numeric into an int. It was briefly named
    `_scalar` too, which at module scope simply REPLACED the rules one -- so the rules parser silently
    lost its list and escape handling on exactly the hosts where it is the parser that runs.
    """
    if len(value) >= 2 and value[0] == value[-1] and value[0] == '"':
        return _unescape(value[1:-1])
    if len(value) >= 2 and value[0] == value[-1] and value[0] == "'":
        return value[1:-1].replace("''", "'")
    return value


def rewrite_rename(label: str, text: str, body: dict) -> str:
    """Rename a product name everywhere EXCEPT inside the phrases where it names something else.

    Done by masking each protected phrase out, substituting, then restoring it. Not by lookarounds: that
    needs one alternative per phrase and still gets overlapping phrases wrong, because whichever
    alternative matches first consumes the text the longer one needed. Masking cannot -- the longest
    phrase is taken out of the string before the shorter one is looked for.

    `count` defaults to 0, meaning "every occurrence, and there must be at least one". An exact count is
    the wrong instrument for a sweep: upstream adds and removes its own name constantly, so an exact
    number fails on every uprev for no reason, and a rule that cries wolf every time gets its number
    bumped without being read. Zero still catches the failure that matters -- a file that stopped
    containing the name at all, which means the sweep is now renaming nothing.
    """
    if not isinstance(body, dict):
        raise RuleError(f"{label}: `rename` takes a mapping")
    if not body.get("preset"):
        raise RuleError(f"{label}: `rename` needs a `preset` naming a file under presets/")
    unknown = set(body) - {"preset", "count"}
    if unknown:
        raise RuleError(f"{label}: `rename` does not take {sorted(unknown)}")
    preset = load_preset(label, body["preset"])
    upstream, ours, protect = preset["from"], preset["to"], preset["protect"]

    # Longest first, so a phrase that contains a shorter protected phrase is masked before the shorter
    # one can claim part of it. \x00 cannot occur in a source file, so a mask token cannot collide with
    # the text it is standing in for.
    masks: dict[str, str] = {}
    for index, phrase in enumerate(sorted(protect, key=len, reverse=True)):
        if phrase in text:
            token = f"\x00P{index}\x00"
            masks[token] = phrase
            text = text.replace(phrase, token)

    count = int(body.get("count", 0))
    text = _substitute(label, text, re.escape(upstream), ours.replace("\\", "\\\\"), count, 0)

    for token, phrase in masks.items():
        text = text.replace(token, phrase)
    return text


def rewrite_insert_after(label: str, text: str, body: dict) -> str:
    """Insert lines after the line containing `anchor`, at that line's own indentation.

    Most of this fork's remaining edits are additive: a block of our code after some upstream line. A
    `regex` can express that, but only by quoting the surrounding upstream lines into the rule as both
    pattern and replacement -- so the rule restates code it does not change, which is the thing the rule
    was supposed to stop doing, and it makes the rule sensitive to indentation it never meant to assert.
    Worse, a YAML block scalar strips the common leading whitespace, so an anchor whose first line is
    indented DEEPER than a later one cannot be written at all without an explicit indentation indicator.
    That cost two silent non-matches while converting the packaging rules.

    Here the anchor is a single line matched by substring, the inserted lines carry their own relative
    indentation, and the anchor line's leading whitespace is measured and reapplied -- so the rule says
    "after this, add that" and nothing about the code around it.
    """
    if not isinstance(body, dict):
        raise RuleError(f"{label}: `insert_after` takes a mapping")
    for field in ("anchor", "lines"):
        if not body.get(field):
            raise RuleError(f"{label}: `insert_after` needs {field}")
    unknown = set(body) - {"anchor", "lines", "count", "indent"}
    if unknown:
        raise RuleError(f"{label}: `insert_after` does not take {sorted(unknown)}")
    anchor = body["anchor"]
    if "\n" in anchor:
        raise RuleError(f"{label}: `anchor` must be a single line; use `regex` for a multi-line anchor")

    want = int(body.get("count", 1))
    lines = text.split("\n")
    hits = [index for index, line in enumerate(lines) if anchor in line]
    if len(hits) != want:
        raise RuleError(
            f"{label}: anchor {anchor!r} matched {len(hits)} line(s), expected {want}. The premise moved "
            f"-- re-read the upstream file and update the anchor rather than the count, unless the new "
            f"number is right."
        )

    # The anchor's own indentation, unless the rule overrides it. Taken from the anchor rather than
    # assumed, because the same insertion is correct at whatever depth upstream has moved the line to.
    payload = body["lines"].rstrip("\n").split("\n")
    for index in reversed(hits):
        base = body["indent"] * " " if "indent" in body else (
            lines[index][: len(lines[index]) - len(lines[index].lstrip(" "))]
        )
        lines[index + 1 : index + 1] = [base + line if line.strip() else "" for line in payload]
    return "\n".join(lines)


REWRITERS = {
    "regex": rewrite_regex,
    "make_virtual": rewrite_make_virtual,
    "add_friend": rewrite_add_friend,
    "drop_final": rewrite_drop_final,
    "rename": rewrite_rename,
    "insert_after": rewrite_insert_after,
}


def git(args: list[str], capture: bool = True) -> str:
    result = subprocess.run(
        ["git", *args], cwd=SRC, capture_output=capture, text=True, check=True
    )
    return result.stdout if capture else ""


def pristine(relative: str) -> str:
    """The upstream file as the synced tag has it -- never the working tree, which has patches applied."""
    try:
        return git(["show", f"HEAD:{relative}"])
    except subprocess.CalledProcessError:
        raise RuleError(f"{relative}: not in the checkout at HEAD. Did the upstream path move?") from None


def generate_one(relative: str, yaml_path: Path) -> str:
    """Rewrite the pristine file per its rules, leave the result in the checkout, return the patch."""
    subs = load_rules(yaml_path)
    original = pristine(relative)
    rewritten = apply_substitutions(relative, original, subs)
    if rewritten == original:
        raise RuleError(f"{relative}: rules produced no change, which cannot be intended")
    target = SRC / relative
    target.write_text(rewritten, encoding="utf-8")
    diff = git(["diff", "HEAD", "--src-prefix=a/", "--dst-prefix=b/", "--", relative])
    if not diff:
        raise RuleError(f"{relative}: git reported no diff after rewriting. Is the path tracked?")
    return diff


def cmd_generate(args: argparse.Namespace) -> int:
    rows = rewrite_files(args.path)
    if not rows:
        print("no rule files" + (f" matching {args.path}" if args.path else f" in {REWRITES}"))
        return 0
    failures = 0
    for relative, yaml_path in rows:
        try:
            diff = generate_one(relative, yaml_path)
        except RuleError as error:
            print(f"FAIL {error}", file=sys.stderr)
            failures += 1
            continue
        out = PATCHES / patch_name(relative)
        out.write_text(diff, encoding="utf-8")
        changed = sum(1 for line in diff.splitlines() if re.match(r"^[+-][^+-]", line))
        print(f"generated {out.name} ({changed} changed line(s)) from {yaml_path.name}")
    return 1 if failures else 0


def cmd_check(args: argparse.Namespace) -> int:
    """Fail when a rule no longer matches, or when its patch was edited by hand instead of its rule."""
    rows = rewrite_files(args.path)
    failures = 0
    for relative, yaml_path in rows:
        out = PATCHES / patch_name(relative)
        try:
            diff = generate_one(relative, yaml_path)
        except RuleError as error:
            print(f"FAIL {error}", file=sys.stderr)
            failures += 1
            continue
        if not out.exists():
            print(f"FAIL {out.name} is missing; run plaster.py generate", file=sys.stderr)
            failures += 1
        elif out.read_text(encoding="utf-8") != diff:
            print(
                f"FAIL {out.name} does not match its rules. It is GENERATED -- edit "
                f"{yaml_path.relative_to(ROOT)} and regenerate, do not edit the patch.",
                file=sys.stderr,
            )
            failures += 1
        else:
            print(f"ok {out.name}")
    if not rows:
        print("no rule files to check")
    return 1 if failures else 0


def cmd_parsers(_: argparse.Namespace) -> int:
    """Assert the two YAML paths read every rule and preset IDENTICALLY.

    plaster reads its rules with PyYAML when it is importable and with a built-in subset parser when it is
    not. That is a convenience with a sharp edge: the generated patch must not depend on which one ran,
    and twice already it did. `|` was chomped like `|-`, so every block replacement lost its final
    newline without PyYAML; and a double-quoted `\\n` was passed through as a backslash and an `n`, so a
    rule inserted two visible characters into a shell include instead of a line break.

    Neither showed up in `check`, because `check` runs one parser -- whichever is installed -- and
    compares its output to a patch generated by that same parser. A checker that shares the component it
    is checking cannot see that component's own faults. This compares the two against each other, needs
    no Chromium checkout, and is therefore the half that can run in CI.
    """
    rows = rewrite_files()
    problems = 0
    checked = 0
    # Without PyYAML there is only ONE parser, so "they agree" would be the builtin parser agreeing with
    # itself: a vacuous pass, and the most dangerous kind, because it is indistinguishable in the log from
    # a real one. A check that cannot run has not passed, so say so and fail.
    try:
        import yaml as _yaml  # noqa: PLC0415,F401
    except ImportError:
        print(
            "cannot compare: PyYAML is not installed, so there is only one parser to read the rules with. "
            "This check is only meaningful where both exist -- install PyYAML (pip install pyyaml) or run "
            "it on a host that has it.",
            file=sys.stderr,
        )
        return 1
    for relative, yaml_path in rows:
        try:
            with_yaml = load_rules(yaml_path)
            without = _parse_minimal_yaml(yaml_path.read_text(encoding="utf-8"), yaml_path)["substitutions"]
        except RuleError as error:
            print(f"FAIL {error}", file=sys.stderr)
            problems += 1
            continue
        checked += 1
        if with_yaml != without:
            problems += 1
            print(f"FAIL rewrite/{relative}.yaml reads differently with and without PyYAML:", file=sys.stderr)
            for index, (a, b) in enumerate(zip(with_yaml, without), start=1):
                if a != b:
                    print(f"     substitution {index}:", file=sys.stderr)
                    print(f"       pyyaml : {a}", file=sys.stderr)
                    print(f"       builtin: {b}", file=sys.stderr)
            if len(with_yaml) != len(without):
                print(
                    f"     different substitution COUNT: {len(with_yaml)} vs {len(without)}",
                    file=sys.stderr,
                )
    for preset in sorted(PRESETS.glob("*.yaml")) if PRESETS.exists() else []:
        text = preset.read_text(encoding="utf-8")
        try:
            import yaml  # noqa: PLC0415

            a = yaml.safe_load(text)
        except ImportError:
            print(f"skip presets/{preset.name}: PyYAML is not installed, so there is nothing to compare")
            continue
        b = _parse_preset(text, preset)
        checked += 1
        # Only the fields a preset actually contributes; PyYAML also returns comments' absence etc.
        for field in ("from", "to", "protect"):
            if a.get(field) != b.get(field):
                problems += 1
                print(
                    f"FAIL presets/{preset.name} `{field}` differs: pyyaml={a.get(field)!r} "
                    f"builtin={b.get(field)!r}",
                    file=sys.stderr,
                )
    print(f"{checked} file(s) read identically by both parsers" if not problems else f"{problems} disagreement(s)")
    return 1 if problems else 0


def cmd_list(_: argparse.Namespace) -> int:
    rows = rewrite_files()
    for relative, yaml_path in rows:
        print(f"{relative}  ->  patches/{patch_name(relative)}")
        try:
            for index, sub in enumerate(load_rules(yaml_path), start=1):
                kind = next((k for k in sub if k != "description"), "?")
                first = (sub.get("description") or "").strip().splitlines()
                print(f"  {index}. [{kind}] {first[0] if first else ''}")
        except RuleError as error:
            print(f"  FAIL {error}", file=sys.stderr)
    print(f"\n{len(rows)} rule-generated patch(es)")
    return 0


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    generate = sub.add_parser("generate", help="regenerate patches from rules")
    generate.add_argument("path", nargs="?", help="one upstream path, e.g. chrome/browser/foo.cc")
    generate.set_defaults(func=cmd_generate)
    check = sub.add_parser("check", help="verify rules still match and patches are not hand-edited")
    check.add_argument("path", nargs="?")
    check.set_defaults(func=cmd_check)
    sub.add_parser(
        "parsers",
        help="assert the PyYAML and built-in rule parsers read every rule identically (no checkout needed)",
    ).set_defaults(func=cmd_parsers)

    listing = sub.add_parser("list", help="show what each rule does")
    listing.set_defaults(func=cmd_list)
    args = parser.parse_args()
    # `generate` and `check` rewrite the pristine upstream file, so they need one. `parsers` and `list`
    # read only this repository's own rules, and gating them on a checkout would make the ONE gate that
    # can run in CI the one that cannot: CI has no 148 GB Chromium tree, which is exactly why the
    # parser-agreement check was written to need nothing but rewrite/ and presets/.
    if args.func in (cmd_generate, cmd_check) and not SRC.exists():
        sys.exit("no checkout: run redrob.py sync first")
    sys.exit(args.func(args))


if __name__ == "__main__":
    main()
