#!/usr/bin/env python3
"""Turn a hand patch's hunks into rule SUBSTITUTIONS with byte-exact pattern and replacement text.

Why a tool and not a careful person: the text being moved is C++ with meaningful leading whitespace, and
YAML block scalars strip the common indent. A multi-line pattern therefore has to carry the file's REAL
indentation on its continuation lines, and one whose first line is indented deeper than a later one cannot
be written as a block at all. Two conversions already failed silently that way -- the rule matched nothing,
or matched and inserted a blank line -- so the text is emitted as double-quoted scalars built from the
patch itself rather than retyped.

Each hunk becomes one substitution, minimally anchored:

  replacement hunk (has `-` lines)  ->  pattern = the removed lines, replace = the added lines
  insertion hunk (no `-` lines)     ->  pattern = the following context line,
                                        replace = the added lines + that same line

The second shape keeps the anchor line INSIDE the replacement on purpose. Emitting a zero-width insertion
instead means the added block ends the replacement, and a trailing blank line in it is then chomped -- which
is exactly how one conversion came out two lines short.

    patch_to_rules.py <upstream path>        # prints the substitutions to stdout

Descriptions are left as TODO markers: they are the part that has to be written by someone who knows why
the change exists, and a generated one would be a rule with no reason, which check_repo rejects anyway.

    patch_to_rules.py <upstream path> [patch file]

READ THE SECOND ARGUMENT'S WARNING. By default this reads patches/<path>.patch -- which is the file
`plaster generate` OVERWRITES. So the moment a first attempt at a rule generates anything, the patch
being derived from is that attempt's output, and re-deriving reads your own mistake back as if it were
    the original. That happened: a wrong rule reordered a hunk, generated, and the next derivation saw the
reordered version and reported one change run where there were two. Pass a saved copy explicitly when
iterating on a rule.
"""
from __future__ import annotations

import json
import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def quoted(text: str) -> str:
    """A YAML double-quoted scalar. json.dumps gives \\n and \\" escapes, which plaster understands.

    ensure_ascii=False so non-ASCII comment text stays literal UTF-8 rather than becoming \\uXXXX, which
    plaster's built-in parser deliberately does not decode.
    """
    return json.dumps(text, ensure_ascii=False)


def hunks(patch: pathlib.Path) -> list[list[str]]:
    out: list[list[str]] = []
    current: list[str] | None = None
    for line in patch.read_text(encoding="utf-8").splitlines():
        if line.startswith("@@"):
            current = []
            out.append(current)
            continue
        if current is None or line.startswith(("---", "+++", "diff ", "index ")):
            continue
        current.append(line)
    return out


def pristine(relative: str) -> str | None:
    """The upstream file at HEAD, so anchor uniqueness can be CHECKED rather than assumed."""
    result = subprocess.run(
        ["git", "show", f"HEAD:{relative}"],
        cwd=ROOT / "chromium" / "src", capture_output=True, text=True,
    )
    return result.stdout if result.returncode == 0 else None


def runs(hunk: list[str]) -> list[tuple[list[str], list[str], str | None, str | None, list[str]]]:
    """Split a hunk into CONTIGUOUS change runs, each with the context line before and after it.

    A hunk is not one edit. It is every edit close enough together for git to share context between them,
    so a hunk that inserts a comment block, keeps a line, then replaces three lines is three groups and two
    of them are separate changes. Joining all of a hunk's `-` lines into one pattern and all its `+` lines
    into one replacement -- which this did first -- produces a rule that either matches nothing or, worse,
    matches and reassembles the file in the wrong order: one conversion moved an `if` statement above the
    comment block that explained it, and still applied cleanly.
    """
    out = []
    index = 0
    while index < len(hunk):
        if hunk[index].startswith((" ", "\\")):
            index += 1
            continue
        start = index
        while index < len(hunk) and hunk[index].startswith(("-", "+")):
            index += 1
        block = hunk[start:index]
        before = next((line[1:] for line in reversed(hunk[:start]) if line.startswith(" ")), None)
        after = next((line[1:] for line in hunk[index:] if line.startswith(" ")), None)
        # Every context line before this run, NEAREST FIRST, so a pattern can be extended upward one
        # line at a time until it is unique.
        preceding = [line[1:] for line in reversed(hunk[:start]) if line.startswith(" ")]
        out.append((
            [line[1:] for line in block if line.startswith("-")],
            [line[1:] for line in block if line.startswith("+")],
            before,
            after,
            preceding,
        ))
    return out


def main() -> int:
    if len(sys.argv) not in (2, 3):
        print(__doc__)
        return 2
    relative = sys.argv[1]
    patch = (pathlib.Path(sys.argv[2]) if len(sys.argv) == 3
             else ROOT / "patches" / (relative.replace("/", "-") + ".patch"))
    if not patch.exists():
        print(f"no patch at {patch}", file=sys.stderr)
        return 2
    original = pristine(relative)

    def occurrences(line: str) -> int:
        """How many times a candidate anchor appears. -1 when the file could not be read."""
        if original is None:
            return -1
        return original.count(line)

    print("substitutions:")
    number = 0
    for hunk_index, hunk in enumerate(hunks(patch)):
        for removed, added, before, after, preceding in runs(hunk):
            if not added and not removed:
                continue
            number += 1
            print(f"  # ---- hunk {hunk_index} run {number}: {len(removed)} removed, {len(added)} added")
            print("  - description: |")
            print("      TODO say why this change exists.")
            print("    regex:")
            if removed:
                # A removed block is not necessarily unique. Chromium is full of branches that differ only
                # in how they obtain a value and then do the identical thing with it -- two `if/else` arms
                # building the same object, a layout repeated per button. So extend the pattern UPWARD with
                # preceding context until it matches exactly once. That is what a human would do, and doing
                # it here means the rule is unique by construction rather than after a count has failed.
                #
                # Extending upward and not downward on purpose: the lines above a change are what SELECT it
                # (which branch, which button), while the lines below are usually shared between the
                # candidates and would not disambiguate anything.
                context_before = preceding
                pattern_lines = list(removed)
                replace_lines = list(added)
                extended = 0
                while occurrences(chr(10).join(pattern_lines)) > 1 and extended < len(context_before):
                    pattern_lines.insert(0, context_before[extended])
                    replace_lines.insert(0, context_before[extended])
                    extended += 1
                found = occurrences(chr(10).join(pattern_lines))
                if extended:
                    print(f"      # pattern extended upward by {extended} context line(s) to be unique "
                          f"(the removed block alone appears more than once)")
                if found != 1:
                    print(f"      # STILL NOT UNIQUE after {extended} line(s): appears {found} time(s). "
                          f"Anchor this one by hand.")
                print(f"      pattern: {quoted(chr(10).join(pattern_lines))}")
                print(f"      replace: {quoted(chr(10).join(replace_lines))}")
                print("      count: 1")
                continue

            # A pure insertion needs a neighbouring line to hang from, and it must be UNIQUE. The line
            # after is preferred: with the anchor at the END of the replacement, a payload ending in blank
            # lines has those blanks interior, where a block scalar cannot chomp them. Falling back to the
            # line before when the following one is not unique -- a bare `}` matched 51 times in one file.
            #
            # The two forms are NOT symmetrical, and getting that wrong costs a line either way. Anchoring
            # AFTER, the added lines are each terminated and the anchor closes the replacement. Anchoring
            # BEFORE, the anchor's own newline has to be part of the PATTERN -- otherwise the file's newline
            # follows the replacement and the inserted block lands a line early, swallowing the blank that
            # separated it. Both were hit here before the asymmetry was written down.
            terminated = "".join(line + "\n" for line in added)
            if after and after.strip() and occurrences(after) == 1:
                print(f"      pattern: {quoted(after)}")
                print(f"      replace: {quoted(terminated + after)}")
            elif before and before.strip() and occurrences(before + "\n") == 1:
                print(f"      pattern: {quoted(before + chr(10))}")
                print(f"      replace: {quoted(before + chr(10) + terminated)}")
            else:
                print(f"      # NEITHER neighbour is unique (after={occurrences(after or '')}, "
                      f"before={occurrences((before or '') + chr(10))}). Anchor this one by hand.")
                print(f"      pattern: {quoted(after or before or '')}   # <-- NOT UNIQUE, REPLACE ME")
                print(f"      replace: {quoted(terminated)}")
            print("      count: 1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
