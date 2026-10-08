#!/usr/bin/env python3
"""Run the browser's copy_resources step for THIS host, without pulling in bos_build.

The browser's build expects a set of generated/vendored files inside the Chromium
checkout (BROWSEROS_VERSION, the product icons, the agent/claw/onboarding resource
dirs). Upstream's bos_build does this from config/copy_resources.yaml; redrob.py
apply never ran it, which is why ninja died on a missing chrome/BROWSEROS_VERSION.

This reads that same yaml and performs the copies that apply to THIS os/arch
(linux x64), honouring the `product`, `os`, `arch`, `renames` and `clear_destination`
fields -- so it is their config that decides what lands, not a hand-maintained list
here. The product is `browseros` (the browser's buildflag default), so browserclaw
rows and other-OS rows are skipped.
"""

from __future__ import annotations

import glob
import os
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
VENDOR = REPO / "vendor/browseros"
SRC = REPO / "chromium/src"
YAML = VENDOR / "bos_build/config/copy_resources.yaml"

OS = "linux"
ARCH = "x64"
PRODUCT = "browseros"


def load_ops() -> list[dict]:
    try:
        import yaml  # noqa: PLC0415
        return yaml.safe_load(YAML.read_text())["copy_operations"]
    except ImportError:
        pass
    # Minimal parser for this file's flat list-of-maps shape.
    ops, cur = [], None
    for raw in YAML.read_text().splitlines():
        s = raw.strip()
        if s.startswith("- name:"):
            if cur:
                ops.append(cur)
            cur = {"name": s.split(":", 1)[1].strip().strip('"')}
        elif cur is not None and ":" in s and not s.startswith("#") and not s.startswith("-"):
            k, v = s.split(":", 1)
            v = v.strip()
            if v.startswith("[") and v.endswith("]"):
                v = [x.strip().strip('"') for x in v[1:-1].split(",") if x.strip()]
            elif v in ("true", "True"):
                v = True
            elif v in ("false", "False"):
                v = False
            else:
                v = v.strip('"')
            cur[k.strip()] = v
        elif cur is not None and s.startswith("- from:"):
            cur.setdefault("renames", []).append({"from": s.split(":", 1)[1].strip().strip('"')})
        elif cur is not None and s.startswith("to:") and cur.get("renames"):
            cur["renames"][-1]["to"] = s.split(":", 1)[1].strip().strip('"')
    if cur:
        ops.append(cur)
    return ops


def applies(op: dict) -> bool:
    # The browser is built with browseros_package_all_server_resources=true, so
    # the server/claw/onboarding resource dirs are required for BOTH products,
    # not just the selected one. Those ops are the ones under resources/binaries/;
    # for them the product filter is ignored. Everything else (icons, version)
    # still honours product.
    source = str(op.get("source", ""))
    # Product icons are OURS: branding/manifest (redrob.py brand) owns every file
    # under chrome/app/theme/. Their icon ops copy the BrowserOS mark over it, which
    # is how the 155 build shipped an orange logo. Never run them.
    if source.startswith(("resources/browseros/icons", "resources/browserclaw/icons")):
        return False
    is_server_resource = source.startswith("resources/binaries/")
    if op.get("product") and op["product"] != PRODUCT and not is_server_resource:
        return False
    oses = op.get("os")
    if oses and OS not in (oses if isinstance(oses, list) else [oses]):
        return False
    arches = op.get("arch")
    if arches and ARCH not in (arches if isinstance(arches, list) else [arches]):
        return False
    return True


def main() -> int:
    ops = load_ops()
    done = skipped = 0
    missing: list[str] = []
    for op in ops:
        if not applies(op):
            skipped += 1
            continue
        src = VENDOR / op["source"]
        dst = SRC / op["destination"]
        typ = op.get("type", "file")

        if typ == "file":
            if not src.is_file():
                missing.append(op["name"] + f"  ({op['source']})")
                continue
            dst.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(src, dst)
            done += 1
        elif typ == "files":  # glob
            hits = glob.glob(str(src))
            if not hits:
                # icon globs with no match are not fatal: the dir copies cover them
                skipped += 1
                continue
            dst.mkdir(parents=True, exist_ok=True)
            for h in hits:
                shutil.copy2(h, dst / Path(h).name)
            done += 1
        elif typ == "directory":
            if not src.is_dir():
                missing.append(op["name"] + f"  ({op['source']})")
                continue
            if op.get("clear_destination") and dst.exists():
                shutil.rmtree(dst)
            dst.mkdir(parents=True, exist_ok=True)
            shutil.copytree(src, dst, dirs_exist_ok=True)
            for r in op.get("renames", []):
                frm, to = dst / r["from"], dst / r.get("to", r["from"])
                if frm.exists():
                    frm.rename(to)
                elif not r.get("optional"):
                    missing.append(f"{op['name']} rename {r['from']}")
            done += 1

    print(f"copied {done}, skipped {skipped} (other product/os/arch or empty glob)")
    if missing:
        print("MISSING sources (build will fail on these):")
        for m in missing:
            print(f"  {m}")
        return 1
    # The one the build died on, verified explicitly.
    v = SRC / "chrome/BROWSEROS_VERSION"
    print(f"chrome/BROWSEROS_VERSION present: {v.is_file()}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
