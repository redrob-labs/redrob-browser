#!/usr/bin/env python3
"""Write the agent extension's channel files.

CDN mode:    channel.py <dir> <id> <version> <crx-url> <update-manifest-url>
  extensions.json      what the browser's maintainer reads (browseros_extension_maintainer.cc):
                       {"extensions": {<id>: {"external_update_url": <https url>}}}. Only ids the
                       browser knows are honoured, and only https update URLs.
  update-manifest.xml  the standard Chromium gupdate response the extension updater follows.

Bundle mode: channel.py --bundle <dir> <id> <version>
  bundled_extensions.json  what browseros_extension_installer.cc reads at first run:
                           {<id>: {"external_crx": "<id>.crx", "external_version": <version>}}
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from xml.sax.saxutils import quoteattr


def main() -> int:
    args = sys.argv[1:]
    if args[:1] == ["--bundle"]:
        _, d, ext_id, version = args
        body = {ext_id: {"external_crx": f"{ext_id}.crx", "external_version": version}}
        (Path(d) / "bundled_extensions.json").write_text(json.dumps(body, indent=2) + "\n")
        return 0
    d, ext_id, version, crx_url, manifest_url = args
    out = Path(d)
    (out / "extensions.json").write_text(
        json.dumps({"extensions": {ext_id: {"external_update_url": manifest_url}}}, indent=2) + "\n"
    )
    (out / "update-manifest.xml").write_text(
        "<?xml version='1.0' encoding='UTF-8'?>\n"
        "<gupdate xmlns='http://www.google.com/update2/response' protocol='2.0'>\n"
        f"  <app appid={quoteattr(ext_id)}>\n"
        f"    <updatecheck codebase={quoteattr(crx_url)} version={quoteattr(version)} />\n"
        "  </app>\n"
        "</gupdate>\n"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
