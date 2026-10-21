#!/usr/bin/env python3
"""Repack a built Redrob Browser .deb as the per-user Linux tarball Redrob Launcher installs.

Redrob Launcher installs a `.deb` only through apt, so on Fedora, Redrob OS and every other non-Debian
distro a release that carries only the `.deb` cannot be installed. What the launcher installs there without
root is the release tarball (redrob-launcher crates/native/src/install.rs, `install_tree`): it unpacks
`redrob-browser-<version>-linux-<arch>.tar.gz` into `~/.local/share/redrob-launcher/apps/redrob-browser`,
runs `bin/redrob-browser` inside it, and writes the menu entry and icon itself.

This builds that tarball from the .deb's own files, no second build:

    redrob-browser-<version>-linux-<arch>/
      bin/redrob-browser            -> ../lib/redrob-browser/redrob-browser (Chromium's wrapper, which finds
                                       its directory with readlink -f, so the symlink is enough)
      lib/redrob-browser/           /opt/redrob/redrob-browser from the .deb, minus the apt cron job
      share/applications/*.desktop  the .deb's entries, Exec pointed at bin/redrob-browser
      share/icons/hicolor/<n>x<n>/apps/redrob-browser.png

chrome-sandbox loses its setuid bit: a per-user unpack cannot make it root-owned, and Chromium then uses the
user-namespace sandbox, which Fedora enables by default. Owners are written as 0/0 so the archive does not
carry the build host's user.

    deb_to_tarball.py out/artifacts/redrob-browser-0.6.0-linux-x86_64.deb [--out DIR]

Python standard library only, plus `dpkg-deb` to unpack the .deb.
"""

from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
from pathlib import Path

APP = "redrob-browser"
OPT = Path("opt/redrob/redrob-browser")
DEB_NAME = re.compile(rf"^{APP}-(?P<version>\d[^/]*)-(?P<token>linux-[a-z0-9_]+)\.deb$")
# The apt-source cron job: a per-user copy has no apt list to keep configured.
SKIP = {"cron"}
ICON_SIZES = (16, 24, 32, 48, 64, 128, 256)


def _normalise(info: tarfile.TarInfo) -> tarfile.TarInfo:
    info.uid = info.gid = 0
    info.uname = info.gname = ""
    info.mode &= ~0o6000  # no setuid/setgid in a per-user tree
    return info


def repack(deb: Path, out_dir: Path) -> Path:
    m = DEB_NAME.match(deb.name)
    if not m:
        raise SystemExit(f"{deb.name}: not a launcher-named .deb ({APP}-<version>-linux-<arch>.deb)")
    top = f"{APP}-{m['version']}-{m['token']}"
    out_dir.mkdir(parents=True, exist_ok=True)
    out = out_dir / f"{top}.tar.gz"
    with tempfile.TemporaryDirectory() as tmp:
        root = Path(tmp) / "deb"
        subprocess.run(["dpkg-deb", "-x", str(deb), str(root)], check=True)
        src = root / OPT
        if not (src / "chrome").is_file() or not (src / APP).is_file():
            raise SystemExit(f"{deb.name}: no {OPT}/chrome and {OPT}/{APP} inside")

        tree = Path(tmp) / top
        lib = tree / "lib" / APP
        shutil.copytree(src, lib, symlinks=True, ignore=lambda d, names: SKIP if Path(d) == src else set())
        sandbox = lib / "chrome-sandbox"
        if sandbox.is_file():
            sandbox.chmod(0o755)

        (tree / "bin").mkdir()
        os.symlink(f"../lib/{APP}/{APP}", tree / "bin" / APP)

        apps = tree / "share" / "applications"
        apps.mkdir(parents=True)
        for desktop in sorted((root / "usr/share/applications").glob("*.desktop")):
            text = desktop.read_text(encoding="utf-8")
            text = re.sub(r"^Exec=\S+", f"Exec={APP}", text, flags=re.MULTILINE)
            (apps / desktop.name).write_text(text, encoding="utf-8")
        if not any(apps.iterdir()):
            raise SystemExit(f"{deb.name}: no .desktop file under usr/share/applications")

        for size in ICON_SIZES:
            png = src / f"product_logo_{size}.png"
            if png.is_file():
                dest = tree / "share" / "icons" / "hicolor" / f"{size}x{size}" / "apps" / f"{APP}.png"
                dest.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(png, dest)

        partial = out.with_name(out.name + ".partial")
        with tarfile.open(partial, "w:gz", compresslevel=6) as tar:
            tar.add(tree, arcname=top, filter=_normalise)
        partial.replace(out)
    return out


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("debs", nargs="+", type=Path)
    ap.add_argument("--out", type=Path, help="directory for the tarballs (default: beside each .deb)")
    args = ap.parse_args()
    for deb in args.debs:
        out = repack(deb, args.out or deb.parent)
        print(f"{out}  {out.stat().st_size} bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())
