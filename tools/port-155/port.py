#!/usr/bin/env python3
"""Shared plumbing for porting our rule-generated stack onto a vendored patch layout.

Two problems are solved in one pass, per file, with no second Chromium working
tree (the checkout is 148 GB; a worktree for a second milestone is not free):

  1. REBASE. Our patches are cut against 153.0.8010.36, theirs against
     155.0.8059.26. For each target file the 153 text is the common ancestor,
     our patched 153 text is one side, and the 155 text is the other, so
     `git merge-file` performs exactly the rebase a checkout would -- and says
     CONFLICT instead of guessing when the two edits touch the same lines.

  2. MERGE. Their layout holds ONE patch per Chromium file, so where both forks
     edit a file the result must carry both changes. That is the same three-way
     call with their patch applied to the 155 text first, which makes their
     change part of the "other side" rather than something ours must re-state.

The emitted patch is `diff(155 text -> merged text)`, which is what the build
applies, so a clean run here means the stack applies at 155 by construction
rather than by assertion.

Nothing is written unless every file resolves: a half-ported patch set is worse
than none, because `doctor` would then report a stack that cannot be rebuilt.
"""

from __future__ import annotations

import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

# Everything is derived from this file's own location and from the repository's own
# recorded revisions, so the tooling carries no absolute path and no second copy of
# a fact the repo already states.
REPO = Path(__file__).resolve().parents[2]
SRC = REPO / "chromium/src"
THEIRS = REPO / "vendor/browseros/chromium_patches"

PLUS = re.compile(r"^\+\+\+ b/(.+?)\s*$", re.M)

# The revision the stack is cut against. Read, not restated: a hardcoded copy is a
# second place to forget. `CHROMIUM_VERSION` at the root now names the same release,
# and `BASE_COMMIT` is upstream's record of the exact commit behind it.
BASE_155 = (REPO / "vendor/browseros/BASE_COMMIT").read_text().strip()

# The vendored patch tree AS UPSTREAM SHIPPED IT. Needed because a patch at a path both
# forks edit is the COMBINED one, so the file on disk no longer says which part was
# theirs -- reading "theirs" from the working tree feeds our own output back in and the
# rules then apply twice. The import commit is the one place that still holds their side
# alone, which is why the repository records it rather than leaving it to a script.
IMPORT_COMMIT = (REPO / "vendor/browseros/IMPORT_COMMIT").read_text().strip()


def upstream_patch(rel: str, work: Path) -> Path | None:
    """Their original patch for one path, or None if only we patch that file."""
    r = subprocess.run(
        ["git", "show", f"{IMPORT_COMMIT}:vendor/browseros/chromium_patches/{rel}"],
        cwd=REPO,
        capture_output=True,
        text=True,
    )
    if r.returncode != 0:
        return None
    p = work / "upstream.patch"
    p.write_text(r.stdout)
    return p


def git(args: list[str], cwd: Path = SRC, **kw) -> subprocess.CompletedProcess:
    return subprocess.run(["git", *args], cwd=cwd, capture_output=True, text=True, **kw)


def show(rev: str, path: str) -> str | None:
    r = git(["show", f"{rev}:{path}"])
    return r.stdout if r.returncode == 0 else None


def apply_to(text: str, patch: Path, work: Path, path: str) -> tuple[str | None, str]:
    """Apply one unified diff to one file's text in isolation. Returns (text, err)."""
    f = work / "f"
    f.write_text(text)
    r = subprocess.run(
        ["patch", "--no-backup-if-mismatch", "-s", "-p1", "-l", "-F", "3", str(f)],
        input=patch.read_text(errors="replace"),
        capture_output=True,
        text=True,
        cwd=work,
    )
    if r.returncode != 0:
        return None, (r.stdout + r.stderr).strip().replace("\n", " | ")[:300]
    return f.read_text(), ""


def diff_text(old: str, new: str, path: str, work: Path) -> str:
    o, n = work / "old", work / "new"
    o.write_text(old)
    n.write_text(new)
    r = subprocess.run(
        ["git", "diff", "--no-index", "--no-color", "-U3", str(o), str(n)],
        capture_output=True,
        text=True,
        cwd=work,
    )
    out = []
    for line in r.stdout.splitlines(keepends=True):
        if line.startswith("diff --git "):
            out.append(f"diff --git a/{path} b/{path}\n")
        elif line.startswith("--- "):
            out.append(f"--- a/{path}\n")
        elif line.startswith("+++ "):
            out.append(f"+++ b/{path}\n")
        elif line.startswith("index "):
            continue  # blob hashes of temp files mean nothing; git apply does not need them
        else:
            out.append(line)
    return "".join(out)
