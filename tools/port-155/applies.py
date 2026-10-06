#!/usr/bin/env python3
"""Stage 2 -- does a patch set still apply on a different Chromium base?

Measured per file, without a second 80 GB working tree: for each patch the
target blob is read straight out of the named git tag and `patch --dry-run` is
run against that one file. That is the same text `git apply` would see, so a
clean result here means the hunks still match at that revision.

A patch whose target file no longer exists at the tag is reported as GONE, which
is a harder failure than a conflict -- the file was deleted or moved upstream.
"""
import re
import subprocess
import sys
from pathlib import Path

PLUS = re.compile(r"^\+\+\+ b/(.+?)\s*$", re.M)
MINUS = re.compile(r"^--- a/(.+?)\s*$", re.M)
NEWFILE = re.compile(r"^--- /dev/null\s*$", re.M)


def target(text: str) -> str | None:
    m = PLUS.search(text) or MINUS.search(text)
    return m.group(1) if m else None


def main() -> int:
    src, tag, patch_root, pattern = sys.argv[1], sys.argv[2], Path(sys.argv[3]), sys.argv[4]
    skip = {".features.yaml", ".store.yaml"}

    clean = conflict = gone = newfile = unreadable = 0
    failures: list[tuple[str, str]] = []

    patches = [p for p in sorted(patch_root.glob(pattern)) if p.is_file() and p.name not in skip]
    for p in patches:
        text = p.read_text(errors="replace")
        rel = str(p.relative_to(patch_root))
        if NEWFILE.search(text):
            newfile += 1
            continue
        t = target(text)
        if not t:
            unreadable += 1
            failures.append((rel, "no diff header"))
            continue
        blob = subprocess.run(
            ["git", "-C", src, "show", f"{tag}:{t}"],
            capture_output=True,
        )
        if blob.returncode != 0:
            gone += 1
            failures.append((rel, f"target missing at {tag}: {t}"))
            continue
        # patch reads the file in place; give it a private copy of just this file.
        work = Path(subprocess.run(["mktemp", "-d"], capture_output=True, text=True).stdout.strip())
        f = work / "f"
        f.write_bytes(blob.stdout)
        res = subprocess.run(
            ["patch", "--dry-run", "-p1", "-s", "-f", "-F", "0", str(f)],
            input=text, capture_output=True, text=True,
        )
        subprocess.run(["rm", "-rf", str(work)])
        if res.returncode == 0:
            clean += 1
        else:
            conflict += 1
            first = (res.stdout + res.stderr).strip().splitlines()
            failures.append((rel, first[0] if first else f"rc={res.returncode}"))

    total = len(patches)
    print(f"base: {tag}   patches: {total}")
    print(f"  clean       {clean}")
    print(f"  conflict    {conflict}")
    print(f"  target gone {gone}")
    print(f"  new file    {newfile}  (nothing to match against)")
    print(f"  unreadable  {unreadable}")
    if failures:
        print("\n--- failures ---")
        for name, why in failures:
            print(f"  {name}\n      {why}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
