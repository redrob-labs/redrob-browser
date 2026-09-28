#!/usr/bin/env python3
"""Assemble a rule file from patch_to_rules output plus a header and per-hunk descriptions.

The mechanical half -- byte-exact pattern and replacement text -- comes from patch_to_rules. This supplies
the half that has to be written: why the file is touched at all, and why each hunk exists. Descriptions are
deliberately SHORT here, because the reasoning that matters is already an inline comment in the code the
rule inserts, and restating it in the rule would give two copies to drift apart.

    build_rule.py <upstream path> <descriptions file> [patch file]

The descriptions file is one block per hunk, separated by a line containing only `---`, in hunk order.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    if len(sys.argv) not in (3, 4):
        print(__doc__)
        return 2
    relative, desc_file = sys.argv[1], pathlib.Path(sys.argv[2])
    # An explicit patch path, because patches/ is what `plaster generate` overwrites -- see the warning in
    # patch_to_rules.py. Iterating on a rule without this re-derives from the previous attempt's output.
    extra = [sys.argv[3]] if len(sys.argv) == 4 else []
    blocks = [b.strip("\n") for b in desc_file.read_text(encoding="utf-8").split("\n---\n")]
    header, descriptions = blocks[0], blocks[1:]

    generated = subprocess.run(
        [sys.executable, str(ROOT / "scripts" / "patch_to_rules.py"), relative, *extra],
        capture_output=True, text=True, check=True,
    ).stdout
    todo = "      TODO say why this change exists."
    if generated.count(todo) != len(descriptions):
        print(f"{generated.count(todo)} hunk(s) but {len(descriptions)} description(s) given",
              file=sys.stderr)
        return 1
    for text in descriptions:
        indented = "\n".join("      " + line if line.strip() else "" for line in text.splitlines())
        generated = generated.replace(todo, indented, 1)

    out = ROOT / "rewrite" / f"{relative}.yaml"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text("\n".join("# " + line if line.strip() else "#" for line in header.splitlines())
                   + "\n\n" + generated, encoding="utf-8")
    print(f"wrote rewrite/{relative}.yaml")
    return 0


if __name__ == "__main__":
    sys.exit(main())
