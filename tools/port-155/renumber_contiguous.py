#!/usr/bin/env python3
"""Renumber our three id lists to be CONTIGUOUS after upstream's last value.

Stage 4 moved them into high reserved bands (1000+/2000+/5000+). That was wrong
for these enums, and the build proved it:

  * APIPermissionID is recorded with UmaHistogramEnumeration, a LINEAR histogram
    whose bucket count is capped at 1001. kMaxValue=1011 fails a static_assert
    in base/metrics/histogram_functions.h ("1012 < 1002").
  * events::HistogramValue is recorded the same way with ENUM_BOUNDARY as the
    boundary, and its unittest asserts ENUM_BOUNDARY == the enums.xml entry count,
    i.e. the list must be dense.
  * functions::HistogramValue has the same density assertion in its unittest.

So these ids cannot sit in a band; they must follow the last value upstream (and
the other fork) already uses. The collision the band was meant to prevent is
caught instead by tools/port-155/verify_structure.py's duplicate-id check, which
is what found the original collision in the first place.
"""

import re
from pathlib import Path

REWRITES = Path.home() / "workplace/redrob-browser/rewrite"

# first free value after the last one Chromium 155 + the vendored stack declare
PLAN = {
    "extensions/common/mojom/api_permission_id.mojom.yaml": 276,    # after kBrowserOS = 275
    "extensions/browser/extension_event_histogram_value.h.yaml": 581,  # after ... = 580
    "extensions/browser/extension_function_histogram_value.h.yaml": 2016,  # after ... = 2015
}
ENTRY = re.compile(r"^(\s+)([A-Za-z_][A-Za-z0-9_]*) = (\d+),\s*$")

for rel, start in PLAN.items():
    p = REWRITES / rel
    lines = p.read_text().split("\n")
    n, first, last = start, None, None
    for i, line in enumerate(lines):
        m = ENTRY.match(line)
        if not m:
            continue
        lines[i] = f"{m.group(1)}{m.group(2)} = {n},"
        first = first if first is not None else n
        last = n
        n += 1
    p.write_text("\n".join(lines))
    print(f"{rel}: {first}-{last}")
