#!/usr/bin/env python3
"""Stage 4 -- regenerate our 108 patches onto BrowserOS's 155 patch layout.

Every one of our patches is generated from a rule in `rewrite/**.yaml`, not
hand-written, which changes what porting means. A hand patch is rebased by
resolving a merge; a RULE is rebased by re-running it against the new text,
and its `count:` assertion then says out loud when the premise it was written
under stopped holding. So this driver re-runs the rules rather than merging
diffs -- resolving a merge here would be re-deciding each change with a merge
tool, which is the exact failure the rule model exists to avoid.

Two bases are involved and the order matters:

    155 upstream text
      + their patch, when both forks edit that file   (so OUR rule anchors on
                                                        the text they produced)
      + our rules
      = the file the build wants

and the emitted patch is `diff(155 upstream -> that)`, which is a single patch
per file carrying both forks' changes -- the shape their layout and their
`doctor` require.

Plaster's own rule engine is reused verbatim; only its I/O is replaced, because
`generate_one` reads `HEAD:` and writes into the 148 GB checkout, and this must
run against a revision that is not checked out.
"""

from __future__ import annotations

import importlib.util
import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from port import THEIRS, emit_patch, start_text  # noqa: E402
from port import REPO  # noqa: E402

REWRITES = REPO / "rewrite"

# Load our generator for its rule engine. It is a script, not a package.
_spec = importlib.util.spec_from_file_location("plaster", REPO / "scripts/plaster.py")
plaster = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(plaster)


def rule_targets() -> list[tuple[str, Path]]:
    """(upstream path, rule file) for every rule.

    The rule tree mirrors the upstream tree, so a file upstream MOVED between 153
    and 155 is handled by moving its rule, not by a translation table here -- the
    repository then states the new path itself instead of this driver knowing a
    fact nothing else can see.
    """
    out = []
    for yaml_path in sorted(REWRITES.rglob("*.yaml")):
        rel = str(yaml_path.relative_to(REWRITES)).removesuffix(".yaml")
        out.append((rel, yaml_path))
    return out


def main() -> int:
    write = "--write" in sys.argv

    work = Path(tempfile.mkdtemp(prefix="replaster-", dir=Path(__file__).parent))
    results: dict[str, str] = {}
    problems: list[tuple[str, str, str]] = []
    stats = {"ours_only": 0, "merged": 0}

    try:
        for rel, yaml_path in rule_targets():
            # A rule may also target a file the vendored stack CREATES (no 155 base);
            # then their new-file body is the text the rule runs on.
            base155, text, err, overlap = start_text(rel, work)
            if text is None:
                kind = "gone-155" if not overlap and "absent" in err else "theirs-no-apply"
                problems.append((rel, kind, err))
                continue

            try:
                subs = plaster.load_rules(yaml_path)
                rewritten = plaster.apply_substitutions(rel, text, subs)
            except plaster.RuleError as exc:
                problems.append((rel, "rule-stale", str(exc)))
                continue
            except Exception as exc:  # a rule engine crash is a finding, not a traceback
                problems.append((rel, "rule-error", f"{type(exc).__name__}: {exc}"))
                continue

            if rewritten == text:
                problems.append((rel, "noop", "rules changed nothing; already true at 155"))
                continue

            out = emit_patch(base155, rewritten, rel, work)
            if not out.strip():
                problems.append((rel, "empty-diff", "rewrite produced no textual change"))
                continue

            results[rel] = out
            stats["merged" if overlap else "ours_only"] += 1

        total = len(rule_targets())
        print(f"our rules            : {total}")
        print(f"regenerated (ours)   : {stats['ours_only']}")
        print(f"regenerated (merged) : {stats['merged']}")
        print(f"rules needing a fix  : {len(problems)}")
        print(f"resolved             : {len(results)}/{total}")

        if problems:
            print("\n=== rules that no longer hold at 155 ===")
            for rel, kind, msg in problems:
                print(f"  [{kind}] {rel}\n      {msg}")

        if write:
            if problems:
                print("\nREFUSING to write: every rule must hold, or the stack cannot be rebuilt.")
                return 1
            for rel, text in results.items():
                dest = THEIRS / rel
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_text(text)
            print(f"\nwrote {len(results)} patch files into {THEIRS}")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
