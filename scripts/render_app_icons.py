#!/usr/bin/env python3
"""Render the Redrob Browser product icon into every app-icon slot under branding/icons.

The artwork is the design system's shipped file, never redrawn: assets/Products/redrob-browser-icon.svg
(48px and up), -32.svg (24-32px) and -16.svg (16px), per assets/Products/README.md ("drawn per size, not
scaled"). Each PNG is rasterised by headless Chromium at its exact pixel size, because ImageMagick's built-in
SVG renderer drops the clip-path that draws the globe.

Usage: render_app_icons.py <design-system-root> <chrome-binary>
"""
import shutil
import struct
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
ICONS = ROOT / "branding" / "icons"


def source_for(px: int, products: Path) -> Path:
    if px <= 16:
        return products / "redrob-browser-icon-16.svg"
    if px < 48:
        return products / "redrob-browser-icon-32.svg"
    return products / "redrob-browser-icon.svg"


def render(svg: Path, px: int, out: Path, chrome: str, work: Path) -> None:
    page = work / f"r{px}.html"
    page.write_text(
        f'<html><body style="margin:0;background:transparent"><img src="file://{svg}" '
        f'style="width:{px}px;height:{px}px;display:block"></body></html>',
        encoding="utf-8",
    )
    shot = work / f"s{px}.png"
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
    products = Path(sys.argv[1]) / "assets" / "Products"
    chrome = sys.argv[2]
    work = Path(tempfile.mkdtemp())
    try:
        cache: dict[int, Path] = {}

        def png(px: int) -> Path:
            if px not in cache:
                cache[px] = work / f"icon_{px}.png"
                render(source_for(px, products), px, cache[px], chrome, work)
            return cache[px]

        slots = {
            "product_logo_16.png": 16, "product_logo_16@2x.png": 32, "product_logo_24.png": 24,
            "product_logo_32.png": 32, "product_logo_32@2x.png": 64, "product_logo_48.png": 48,
            "product_logo_64.png": 64, "product_logo_128.png": 128, "product_logo_256.png": 256,
            "mac/iconset/icon_256x256.png": 256, "mac/iconset/icon_256x256@2x.png": 512,
            "win/tiles/Logo.png": 600, "win/tiles/SmallLogo.png": 176,
        }
        for size in (16, 32, 64, 128, 256, 512, 1024):
            slots[f"mac/appiconset/appicon_{size}.png"] = size
        for rel, px in slots.items():
            shutil.copyfile(png(px), ICONS / rel)

        # ic11..ic14 are the @2x members of the 16/32/128/256 slots.
        write_icns([(b"icp4", png(16)), (b"icp5", png(32)), (b"ic11", png(32)), (b"ic12", png(64)),
                    (b"ic07", png(128)), (b"ic13", png(256)), (b"ic08", png(256)), (b"ic14", png(512)),
                    (b"ic09", png(512)), (b"ic10", png(1024))],
                   ICONS / "mac" / "app.icns")

        subprocess.run(["magick", *[str(png(p)) for p in (16, 24, 32, 48, 64, 256)],
                        str(ICONS / "win" / "redrob.ico")], check=True)
        subprocess.run(["magick", str(png(32)), str(ICONS / "product_logo_32.xpm")], check=True)
        print(f"rendered {len(slots)} PNG slots, app.icns, win/redrob.ico and product_logo_32.xpm")
    finally:
        shutil.rmtree(work, ignore_errors=True)


if __name__ == "__main__":
    main()
