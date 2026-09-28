#!/usr/bin/env python3
"""Prove a rule-generated patch and the hand patch it replaces produce the SAME FILE.

Comparing the two PATCH TEXTS is the obvious check and it is the wrong one. git chooses hunk boundaries and
context for itself, so a rule that reproduces a file exactly can still emit a patch that differs in framing
-- `@@ -79,6 +79,44 @@` against `@@ -79,8 +79,47 @@` with two extra context lines. Treating that as a
failure sends you looking for a difference that is not there; treating it as a pass because the patch
"looks close" is worse.

So this compares the RESULT: apply the old patch to the pristine upstream file in a scratch tree, and diff
that against what the rule wrote into the checkout.

    verify_rule.py <upstream path> <saved copy of the old patch>

Exits 0 and prints IDENTICAL, or prints the diff and exits 1.
"""
from __future__ import annotations

import pathlib
import shutil
import subprocess
import sys
import tempfile

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / "chromium" / "src"


def run(cmd: list[str], cwd: pathlib.Path) -> subprocess.CompletedProcess:
    return subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__)
        return 2
    relative, old_patch = sys.argv[1], pathlib.Path(sys.argv[2])
    if not old_patch.exists():
        print(f"no saved patch at {old_patch}", file=sys.stderr)
        return 2

    # REGENERATE FIRST, and fail if that fails. Without this the comparison reads whatever is currently in
    # the checkout, which after a failed `generate` is the PREVIOUS run's output -- so a rule that stopped
    # matching reported IDENTICAL, off a file its own rule had not written. The check has to own the step
    # that produces the thing it checks.
    generated = run([sys.executable, str(ROOT / "scripts" / "plaster.py"), "generate", relative], ROOT)
    if generated.returncode != 0:
        sys.stderr.write(generated.stdout + generated.stderr)
        print(f"NOT VERIFIED  {relative}: the rule did not generate, so there is nothing to compare",
              file=sys.stderr)
        return 1

    rule_result = SRC / relative
    if not rule_result.exists():
        print(f"{relative} is not in the checkout", file=sys.stderr)
        return 2

    pristine = run(["git", "show", f"HEAD:{relative}"], SRC)
    if pristine.returncode != 0:
        print(f"{relative} is not at HEAD in the checkout", file=sys.stderr)
        return 2

    with tempfile.TemporaryDirectory(prefix="verify-rule-") as tmp:
        tree = pathlib.Path(tmp)
        target = tree / relative
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(pristine.stdout, encoding="utf-8")
        # A throwaway repo, because `git apply --3way` needs an index to fall back on.
        for cmd in (["git", "init", "-q", "."], ["git", "add", "-A"],
                    ["git", "-c", "user.email=a@b", "-c", "user.name=c", "commit", "-qm", "base"]):
            if run(cmd, tree).returncode != 0:
                print(f"could not prepare the scratch tree: {' '.join(cmd)}", file=sys.stderr)
                return 2
        applied = run(["git", "apply", "--3way", "--whitespace=nowarn", str(old_patch.resolve())], tree)
        if applied.returncode != 0:
            print(f"the OLD patch does not apply to pristine {relative}:\n{applied.stderr}", file=sys.stderr)
            return 1
        expected = target.read_text(encoding="utf-8")

    actual = rule_result.read_text(encoding="utf-8")
    if expected == actual:
        print(f"IDENTICAL  {relative}")
        return 0
    import difflib

    print(f"DIFFERS  {relative}", file=sys.stderr)
    for line in difflib.unified_diff(
        expected.splitlines(keepends=True), actual.splitlines(keepends=True),
        fromfile="from the old hand patch", tofile="from the rule", n=2,
    ):
        sys.stderr.write(line)
    return 1


if __name__ == "__main__":
    sys.exit(main())
