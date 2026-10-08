#!/usr/bin/env python3
"""Re-verify EVERY rule that replaced a hand patch, against saved copies of those patches.

One rule at a time is not enough during a conversion, because the tooling itself keeps changing: each fix
to how anchors or payloads are built silently alters the output of every rule already written. Twice here a
tool change was correct for the rule in front of me and wrong for an earlier one. So the sweep is the gate,
not the individual check.

    verify_all_rules.py <directory of saved pre-conversion patches>

Prints one line per rule and a tally. Exit 1 if any rule does not reproduce its patch's file.
"""
from __future__ import annotations

import pathlib
import subprocess
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent


def main() -> int:
    if len(sys.argv) != 2:
        print(__doc__)
        return 2
    saved = pathlib.Path(sys.argv[1])
    if not saved.is_dir():
        print(f"not a directory: {saved}", file=sys.stderr)
        return 2

    rules = sorted((ROOT / "rewrite").rglob("*.yaml"))
    checked, ok, skipped, bad = 0, 0, 0, []
    for rule in rules:
        relative = str(rule.relative_to(ROOT / "rewrite"))[: -len(".yaml")]
        patch = saved / (relative.replace("/", "-") + ".patch")
        if not patch.exists():
            skipped += 1
            continue
        checked += 1
        result = subprocess.run(
            [sys.executable, str(ROOT / "scripts" / "verify_rule.py"), relative, str(patch)],
            capture_output=True, text=True, cwd=ROOT,
        )
        if result.returncode == 0:
            ok += 1
            print(f"ok       {relative}")
        else:
            bad.append(relative)
            print(f"FAILED   {relative}", file=sys.stderr)
            sys.stderr.write(result.stdout + result.stderr)

    print(f"\n{ok}/{checked} rule(s) reproduce their original file; {skipped} had no saved patch to "
          f"compare against (they were rules from the start)")
    if bad:
        print("failed: " + ", ".join(bad), file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
