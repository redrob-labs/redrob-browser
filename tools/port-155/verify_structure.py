#!/usr/bin/env python3
"""Stage 4 -- structural checks on the ported stack that no rule engine can make.

A rule's `count` assertion proves its anchor still matched. It cannot prove the
result is well-formed, and the two failures that actually ship from a port like
this are both invisible to it:

  * DUPLICATE ENUM IDS. Where both forks append to one numbered list, each side
    allocated from the same next-free value against its own base. Re-running the
    rules happily writes both, so the merged file declares two members with the
    same number -- and these particular lists are IPC and metrics identities, so
    the result is messages decoded as the wrong call rather than a build error.
  * A REPLACEMENT THAT NAMES A SYMBOL 155 DELETED. The anchor can match on new
    text while the code the rule inserts still calls the old constant.

Plus the cheap ones worth having: brace balance, and parse checks for every
XML/JSON/grd file we touch.

Everything is measured on the RECONSTRUCTED final text -- 155 upstream, then
their patch, then our rules -- which is what the build compiles, not on the
diffs.
"""

from __future__ import annotations

import json
import re
import shutil
import sys
import tempfile
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from port import BASE_155, apply_to, show, upstream_patch  # noqa: E402
from replaster import REPO, plaster, rule_targets  # noqa: E402

# Constants Chromium 155 removed. Our inserted code must not name them.
REMOVED_AT_155 = [
    "kGroupHeaderCornerRadius",
    "kGroupHeaderHorizontalInset",
    "BASE_FEATURE(kVerticalTabs,",
]

ENUM_LINE = re.compile(r"^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(\d+)\s*,")

# Numbered identity lists: a duplicate number here is a wrong-call decode, not a
# build error, so they are checked by value and not merely by name.
NUMBERED = [
    "extensions/common/mojom/api_permission_id.mojom",
    "extensions/browser/extension_event_histogram_value.h",
    "extensions/browser/extension_function_histogram_value.h",
    # Both forks added a "import from another Chromium browser" path independently
    # and took the same next value in each of these. A duplicate here is a
    # duplicate `case` at best and a wrong history source written to disk at worst.
    "components/user_data_importer/common/importer_type.h",
    "components/user_data_importer/common/importer_data_types.h",
    "components/history/core/browser/history_types.h",
]


def final_text(rel: str, yaml_path: Path, work: Path) -> tuple[str | None, str]:
    base155 = show(BASE_155, rel)
    if base155 is None:
        return None, "absent at 155"
    text = base155
    theirs = upstream_patch(rel, work)
    if theirs is not None:
        text, err = apply_to(base155, theirs, work, rel)
        if text is None:
            return None, f"their patch does not apply: {err}"
    try:
        text = plaster.apply_substitutions(rel, text, plaster.load_rules(yaml_path))
    except Exception as exc:
        return None, f"rule failed: {exc}"
    return text, ""


def check_enums(rel: str, text: str) -> list[str]:
    out = []
    by_value: dict[int, list[str]] = defaultdict(list)
    by_name: dict[str, int] = {}
    for line in text.splitlines():
        m = ENUM_LINE.match(line)
        if not m:
            continue
        name, value = m.group(1), int(m.group(2))
        by_value[value].append(name)
        if name in by_name:
            out.append(f"duplicate member name {name!r}")
        by_name[name] = value
    for value, names in sorted(by_value.items()):
        if len(names) > 1:
            out.append(f"id {value} claimed by {len(names)}: {', '.join(names)}")
    return out


def check_braces(rel: str, text: str) -> list[str]:
    if not rel.endswith((".cc", ".h", ".mm", ".gn", ".gni", ".star")):
        return []
    depth = 0
    in_block = in_line = False
    quote = ""
    raw_end = ""
    i = 0
    while i < len(text):
        c = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if raw_end:
            # A C++ raw string: everything until the matching )delim" is literal text,
            # braces included. Their patch embeds a JSON manifest this way, and counting
            # those braces is what made a valid file look unbalanced.
            if text.startswith(raw_end, i):
                i += len(raw_end) - 1
                raw_end = ""
        elif in_line:
            if c == "\n":
                in_line = False
        elif in_block:
            if c == "*" and nxt == "/":
                in_block = False
                i += 1
        elif quote:
            if c == "\\":
                i += 1
            elif c == quote:
                quote = ""
        elif c == "R" and nxt == '"' and not rel.endswith((".gn", ".gni", ".star")):
            close = text.find("(", i + 2)
            if close != -1 and "\n" not in text[i + 2 : close]:
                raw_end = f'){text[i + 2 : close]}"'
                i = close
            else:
                quote = '"'
                i += 1
        elif c == "/" and nxt == "/":
            in_line = True
            i += 1
        elif c == "/" and nxt == "*":
            in_block = True
            i += 1
        elif c == "#" and rel.endswith((".gn", ".gni", ".star")):
            in_line = True
        elif c in "\"'":
            quote = c
        elif c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth < 0:
                return ["a closing brace with nothing open"]
        i += 1
    return [] if depth == 0 else [f"brace depth ends at {depth}, not 0"]


def check_parses(rel: str, text: str) -> list[str]:
    try:
        if rel.endswith((".grd", ".xml")):
            ET.fromstring(text)
        elif rel.endswith(".grdp"):
            # A .grdp is a fragment with its own XML declaration, so the declaration has to come
            # off before it can be wrapped in a synthetic root.
            body = re.sub(r"^\s*<\?xml[^>]*\?>", "", text, count=1)
            ET.fromstring(f"<root>{body}</root>")
    except Exception as exc:
        return [f"does not parse: {type(exc).__name__}: {exc}"]
    return []


def check_brackets(rel: str, text: str) -> list[str]:
    """Balance of {} and [] for the JSON-with-comments files Chromium ships.

    Not json.loads: these carry `//` comments, and stripping them with a regex is
    how a URL or a regex literal inside a string eats the rest of the file. The
    scanner below tracks string state, so the count is honest even though it is
    weaker than a parse.
    """
    if not rel.endswith(".json"):
        return []
    depth = {"{": 0, "[": 0}
    pair = {"}": "{", "]": "["}
    in_line = False
    quote = False
    i = 0
    while i < len(text):
        c = text[i]
        nxt = text[i + 1] if i + 1 < len(text) else ""
        if in_line:
            if c == "\n":
                in_line = False
        elif quote:
            if c == "\\":
                i += 1
            elif c == '"':
                quote = False
        elif c == "/" and nxt == "/":
            in_line = True
            i += 1
        elif c == '"':
            quote = True
        elif c in depth:
            depth[c] += 1
        elif c in pair:
            depth[pair[c]] -= 1
        i += 1
    return [f"{k} unbalanced by {v}" for k, v in depth.items() if v != 0]


def check_removed_symbols(rel: str, text: str) -> list[str]:
    return [f"names {sym!r}, which 155 removed" for sym in REMOVED_AT_155 if sym in text]


def problems_for(rel: str, text: str) -> list[str]:
    out = check_braces(rel, text) + check_parses(rel, text) + check_brackets(rel, text)
    if rel in NUMBERED:
        out += check_enums(rel, text)
    return out


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="verify-", dir=Path(__file__).parent))
    regressions: list[tuple[str, str]] = []
    inherited = 0
    checked = 0
    hard: list[tuple[str, str]] = []
    try:
        for rel, yaml_path in rule_targets():
            base155 = show(BASE_155, rel)
            if base155 is None:
                hard.append((rel, "absent at 155"))
                continue
            text, err = final_text(rel, yaml_path, work)
            if text is None:
                hard.append((rel, err))
                continue
            checked += 1

            # The control: the same checks on untouched 155. A complaint the baseline
            # also raises is this checker's limit, not something the port introduced.
            before = set(problems_for(rel, base155))
            after = problems_for(rel, text)
            for p in after:
                if p in before:
                    inherited += 1
                else:
                    regressions.append((rel, p))
            # Symbols 155 removed are only meaningful on our own output.
            for p in check_removed_symbols(rel, text):
                regressions.append((rel, p))

        print(f"files reconstructed and checked : {checked}/{len(rule_targets())}")
        print(f"complaints the 155 baseline also raises (this checker's limit) : {inherited}")
        print(f"regressions introduced by the port : {len(regressions)}")
        print(f"files that could not be built      : {len(hard)}")

        if hard:
            print("\n=== could not reconstruct ===")
            for rel, msg in hard:
                print(f"  {rel}\n      {msg}")
        if regressions:
            print("\n=== regressions ===")
            for rel, msg in regressions:
                print(f"  {rel}\n      {msg}")
        if regressions or hard:
            return 1
        print("\nclean: nothing the port introduced. No duplicate ids in the numbered")
        print("lists, no new brace or bracket imbalance, no XML that stopped parsing,")
        print("and no inserted code naming a symbol 155 removed.")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
