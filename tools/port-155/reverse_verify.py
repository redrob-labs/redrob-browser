#!/usr/bin/env python3
"""Stage 4 -- reverse-verify the structural checker by restoring each defect.

A green checker is only evidence if it can go red. The brace scanner in
particular is the kind of helper that fails silently in the safe direction: teach
it to treat too much as a raw string and every file balances, which makes the
whole check decorative. So each defect this checker exists to catch is injected
into real reconstructed text and the checker must report it.

Run it after any change to verify_structure.py.
"""

from __future__ import annotations

import shutil
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import verify_structure as V  # noqa: E402
from port import BASE_155, apply_to, show, upstream_patch  # noqa: E402
from replaster import plaster, rule_targets  # noqa: E402

RULES = dict((rel, p) for rel, p in rule_targets())


def reconstruct(rel: str, work: Path) -> str:
    text = show(BASE_155, rel)
    theirs = upstream_patch(rel, work)
    if theirs is not None:
        text, _ = apply_to(text, theirs, work, rel)
    return plaster.apply_substitutions(rel, text, plaster.load_rules(RULES[rel]))


CASES = [
    # (label, file, how to break it, which check must fire)
    (
        "duplicate enum id",
        "extensions/common/mojom/api_permission_id.mojom",
        lambda t: t.replace("kRedrobPrivateTasks = 277,", "kRedrobPrivateTasks = 276,"),
        "id 276 claimed by 2",
    ),
    (
        "duplicate enum member name",
        "extensions/browser/extension_event_histogram_value.h",
        lambda t: t.replace(
            "REDROBPRIVATE_ON_TASK_CHANGED = 582,",
            "REDROBPRIVATE_ON_IMPORT_STATE_CHANGED = 582,",
        ),
        "duplicate member name",
    ),
    (
        "an unclosed brace",
        "chrome/common/chrome_paths_linux.cc",
        lambda t: t.replace("std::string data_dir_basename = \"redrob\";",
                            "std::string data_dir_basename = \"redrob\"; {"),
        "brace depth ends at 1",
    ),
    (
        "a stray closing brace",
        "chrome/common/chrome_paths_linux.cc",
        lambda t: "}\n" + t,
        "closing brace with nothing open",
    ),
    (
        "a symbol 155 removed",
        "chrome/browser/ui/views/tabs/common/tab_group_header_view.cc",
        lambda t: t.replace("GetCornerRadius()", "kGroupHeaderCornerRadius", 1),
        "which 155 removed",
    ),
    (
        "broken XML in a string fragment",
        "components/omnibox_strings.grdp",
        lambda t: t.replace("</message>", "</mesage>", 1),
        "does not parse",
    ),
    (
        "unbalanced JSON braces",
        "chrome/common/extensions/api/_api_features.json",
        lambda t: t + "\n{\n",
        "unbalanced",
    ),
    (
        "a raw string that must NOT hide real braces",
        "chrome/browser/chrome_browser_main.cc",
        lambda t: t.replace("int ChromeBrowserMainParts::PreMainMessageLoopRun() {",
                            "int ChromeBrowserMainParts::PreMainMessageLoopRun() { {", 1),
        "brace depth ends at 1",
    ),
]


def main() -> int:
    work = Path(tempfile.mkdtemp(prefix="reverse-", dir=Path(__file__).parent))
    missed, caught = [], 0
    try:
        for label, rel, break_it, expect in CASES:
            if rel not in RULES:
                missed.append((label, rel, "no rule for that path"))
                continue
            good = reconstruct(rel, work)
            bad = break_it(good)
            if bad == good:
                missed.append((label, rel, "the injection changed nothing -- the case is stale"))
                continue

            before = set(V.problems_for(rel, good)) | set(V.check_removed_symbols(rel, good))
            after = V.problems_for(rel, bad) + V.check_removed_symbols(rel, bad)
            fired = [p for p in after if p not in before and expect in p]
            if fired:
                caught += 1
                print(f"  caught   {label}  ({rel})\n             -> {fired[0]}")
            else:
                missed.append((label, rel, f"expected a finding containing {expect!r}, got {after or 'nothing'}"))

        print(f"\ndefects injected : {len(CASES)}")
        print(f"caught           : {caught}")
        print(f"MISSED           : {len(missed)}")
        if missed:
            print("\n=== the checker did not catch these ===")
            for label, rel, why in missed:
                print(f"  {label}  ({rel})\n      {why}")
            return 1
        print("\nevery defect the checker claims to catch was restored and caught.")
        return 0
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    raise SystemExit(main())
