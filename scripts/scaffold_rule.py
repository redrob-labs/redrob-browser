#!/usr/bin/env python3
"""Scaffold a rewrite rule whose payload is a block of added lines lifted from the existing patch.

Retyping 30+ lines of C++ into YAML by hand is how a conversion introduces a difference it then cannot
explain. This reads the hunk's `+` lines straight out of the patch, so the payload is byte-exact by
construction and the only thing being authored is the anchor and the reasoning.

    scaffold_rule.py <upstream path> <hunk index> <out yaml> <<'EOF'
    <the description>
    EOF
"""
from __future__ import annotations

import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def added_lines(patch: pathlib.Path, hunk_index: int) -> list[str]:
    """The `+` lines of one hunk, with the leading + removed and nothing else changed."""
    hunks: list[list[str]] = []
    current: list[str] | None = None
    for line in patch.read_text(encoding="utf-8").splitlines():
        if line.startswith("@@"):
            current = []
            hunks.append(current)
            continue
        if current is None or line.startswith(("---", "+++")):
            continue
        current.append(line)
    if hunk_index >= len(hunks):
        raise SystemExit(f"{patch.name} has {len(hunks)} hunk(s), asked for index {hunk_index}")
    return [line[1:] for line in hunks[hunk_index] if line.startswith("+")]


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__)
        return 2
    relative, hunk, out = sys.argv[1], int(sys.argv[2]), pathlib.Path(sys.argv[3])
    patch = ROOT / "patches" / (relative.replace("/", "-") + ".patch")
    payload = added_lines(patch, hunk)
    print(f"{len(payload)} added line(s) from hunk {hunk} of {patch.name}")
    out.write_text("".join(line + "\n" for line in payload), encoding="utf-8")
    print(f"written to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
