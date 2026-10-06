#!/usr/bin/env python3
"""Stage 4 -- run plaster's OWN rule/patch comparison, but with the base at 155.

`scripts/check_repo.py` compares every patch against what its rule produces from
the CHECKOUT's HEAD, which is still 153. The rules and the stack are now 155, so
it reports all 107 as mismatched. That complaint is correct from where it stands,
and it is the stage boundary rather than a defect: syncing the 148 GB checkout to
155 is Stage 5's first action.

What CAN be proved now is that the mismatch is only the base. This re-derives
every patch from its rule with the base at 155 -- their own patch applied first
where both forks edit a file, taken from the import commit rather than from the
file now on disk, which already contains ours -- and compares the result to what
is on disk. If they are equal, the gate goes green the moment the checkout moves
and nothing else is outstanding.
"""

from __future__ import annotations

import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from port import THEIRS, emit_patch, start_text  # noqa: E402
from replaster import plaster, rule_targets  # noqa: E402

def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="check155-", dir=Path(__file__).parent))
    same = merged = 0
    differ: list[tuple[str, str]] = []
    try:
        for rel, yaml_path in rule_targets():
            on_disk = THEIRS / rel
            if not on_disk.is_file():
                differ.append((rel, "no patch on disk for this rule"))
                continue

            base155, text, err, overlap = start_text(rel, work)
            if text is None:
                differ.append((rel, err if not overlap else f"their original patch does not apply at 155: {err}"))
                continue
            if overlap:
                merged += 1

            try:
                rewritten = plaster.apply_substitutions(rel, text, plaster.load_rules(yaml_path))
            except Exception as exc:
                differ.append((rel, f"rule failed: {exc}"))
                continue

            if emit_patch(base155, rewritten, rel, work) == on_disk.read_text():
                same += 1
            else:
                differ.append((rel, "the patch on disk is not what the rules produce at 155"))

        total = len(rule_targets())
        print(f"rules re-derived at 155        : {total}")
        print(f"  of which carry theirs too    : {merged}")
        print(f"patch equals what its rule says : {same}")
        print(f"mismatched                      : {len(differ)}")
        if differ:
            print("\n=== mismatched ===")
            for rel, why in differ:
                print(f"  {rel}\n      {why}")
            return 1
        print("\nEvery patch on disk is exactly what its rule produces at 155.")
        print("check_repo.py's complaints about these are its 153 base, nothing else.")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
