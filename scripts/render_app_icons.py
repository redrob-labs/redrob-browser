#!/usr/bin/env python3
"""Render the Redrob Browser app icon into every app-icon slot this repository ships.

The artwork is the design system's shipped file, never redrawn: `@redrob-labs/ui` 1.8.0,
dist/brand/app-icons/redrob-browser/ (the 2026 "Doorway light" set). Every bitmap slot uses
`-icon-web`, the tile already masked to the superellipse with transparent corners: Windows, Linux and
macOS before 26 do not mask an app icon, so the unmasked `-icon` square would show as a hard square.
macOS 26 masks its own, so AppIcon.icon carries the white `-symbol` as its one layer over the tile fill.

Each PNG is rasterised by headless Chromium at its exact pixel size, because ImageMagick's built-in SVG
renderer drops the gradient and the mask. The source files are checked against the sha256 the package's
manifest.json records before anything is written.

Usage: render_app_icons.py <package>/dist/brand/app-icons <chrome-binary>
"""
import hashlib
import json
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "branding" / "icons"
KEY = "redrob-browser"

# macOS before 26 draws the icon as given, on Apple's 1024 grid: an 824 px body centred, 100 px clear.
MAC_BODY = 824 / 1024


def sources(app_icons: Path) -> dict[str, Path]:
    manifest = json.loads((app_icons / "manifest.json").read_text(encoding="utf-8"))
    entry = next(i for i in manifest["icons"] if i["files"]["icon"]["path"].startswith(f"{KEY}/"))
    out = {}
    for variant in ("icon-web", "symbol"):
        rec = entry["files"][variant]
        path = app_icons / rec["path"]
        digest = hashlib.sha256(path.read_bytes()).hexdigest()
        if digest != rec["sha256"]:
            sys.exit(f"{path}: sha256 {digest} does not match manifest {rec['sha256']}")
        out[variant] = path
    return out


def render(svg: Path, px: int, out: Path, chrome: str, work: Path, body: float = 1.0) -> None:
    size = round(px * body)
    pad = (px - size) // 2
    page = work / f"r{px}-{size}.html"
    page.write_text(
        f'<html><body style="margin:0;background:transparent"><img src="file://{svg}" '
        f'style="position:absolute;left:{pad}px;top:{pad}px;width:{size}px;height:{size}px;display:block">'
        f"</body></html>",
        encoding="utf-8",
    )
    shot = work / f"s{px}-{size}.png"
    # Headless Chromium has a minimum window width; render on a larger canvas and crop the top-left square.
    canvas = max(px, 200)
    subprocess.run(
        [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
         f"--user-data-dir={work / 'profile'}", "--default-background-color=00000000",
         "--force-device-scale-factor=1", f"--window-size={canvas},{canvas}",
         f"--screenshot={shot}", f"file://{page}"],
        check=True, capture_output=True, timeout=120,
    )
    subprocess.run(["magick", str(shot), "-crop", f"{px}x{px}+0+0", "+repage", "-strip",
                    f"PNG32:{out}"], check=True)


def write_icns(entries: list[tuple[bytes, Path]], out: Path) -> None:
    """icns container of PNG payloads (types ic07..ic14, icp4..icp6)."""
    body = b""
    for kind, png in entries:
        data = png.read_bytes()
        body += kind + struct.pack(">I", len(data) + 8) + data
    out.write_bytes(b"icns" + struct.pack(">I", len(body) + 8) + body)


def main() -> None:
    src = sources(Path(sys.argv[1]))
    chrome = sys.argv[2]
    work = Path(tempfile.mkdtemp())
    try:
        cache: dict[tuple[int, float], Path] = {}

        def png(px: int, body: float = 1.0) -> Path:
            if (px, body) not in cache:
                cache[(px, body)] = work / f"icon_{px}_{body:.3f}.png"
                render(src["icon-web"], px, cache[(px, body)], chrome, work, body)
            return cache[(px, body)]

        def mac(px: int) -> Path:
            return png(px, MAC_BODY)

        slots = {
            "product_logo_16.png": 16, "product_logo_16@2x.png": 32, "product_logo_24.png": 24,
            "product_logo_32.png": 32, "product_logo_32@2x.png": 64, "product_logo_48.png": 48,
            "product_logo_64.png": 64, "product_logo_128.png": 128, "product_logo_256.png": 256,
            "favicon_product.png": 16, "favicon_product@2x.png": 32,
            "win/tiles/Logo.png": 600, "win/tiles/SmallLogo.png": 176,
            # The release asset Redrob Launcher shows (sign-and-publish.yml), full bleed like every
            # other app's launcher icon.
            "launcher_icon_512.png": 512,
        }
        for rel, px in slots.items():
            shutil.copyfile(png(px), ICONS / rel)
        # The agent extension's own icon is the app icon.
        for px in (16, 32, 48, 96, 128):
            shutil.copyfile(png(px), ROOT / "agent" / "apps" / "app" / "public" / "icon" / f"{px}.png")

        mac_slots = {"mac/iconset/icon_256x256.png": 256, "mac/iconset/icon_256x256@2x.png": 512}
        for size in (16, 32, 64, 128, 256, 512, 1024):
            mac_slots[f"mac/appiconset/appicon_{size}.png"] = size
        for rel, px in mac_slots.items():
            shutil.copyfile(mac(px), ICONS / rel)

        # ic11..ic14 are the @2x members of the 16/32/128/256 slots.
        write_icns([(b"icp4", mac(16)), (b"icp5", mac(32)), (b"ic11", mac(32)), (b"ic12", mac(64)),
                    (b"ic07", mac(128)), (b"ic13", mac(256)), (b"ic08", mac(256)), (b"ic14", mac(512)),
                    (b"ic09", mac(512)), (b"ic10", mac(1024))],
                   ICONS / "mac" / "app.icns")

        # macOS 26: the white symbol is the one layer, byte for byte; icon.json supplies the tile fill.
        shutil.copyfile(src["symbol"], ICONS / "mac" / "AppIcon.icon" / "Assets" / "browser.svg")

        subprocess.run(["magick", *[str(png(p)) for p in (16, 24, 32, 48, 64, 256)],
                        str(ICONS / "win" / "redrob.ico")], check=True)
        subprocess.run(["magick", str(png(32)), str(ICONS / "product_logo_32.xpm")], check=True)
        print(f"rendered {len(slots) + 5 + len(mac_slots)} PNG slots, app.icns, AppIcon.icon layer, "
              "win/redrob.ico and product_logo_32.xpm")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
