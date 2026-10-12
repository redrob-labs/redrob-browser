#!/usr/bin/env python3
"""Capture the browser's own window chrome and measure it against the design system.

    python3 scripts/capture_native.py --deb out/artifacts/redrob-browser_*.deb
    python3 scripts/capture_native.py --binary /path/to/chrome      # any Chromium, to test the tool itself

The extension's pages are measured from computed style (agent/scripts/ui-capture). The chrome has no
computed style: it is painted by C++ views through Chromium's colour pipeline, so the only honest reading
is the pixels. This launches the browser under Xvfb with `-fbdir`, which keeps the framebuffer in a file
in XWD format, reads it back with nothing but the standard library, and reports every colour that covers a
real share of the window and is not a design-system colour for the active theme.

Scenes are reached by command line alone -- a theme flag, a language, and the URLs to open -- because
this host has no xdotool to drive a menu open. What a scene cannot reach (an open app menu, a bubble) is
a gap in the coverage, listed in the report rather than implied.

Writes out/native-capture/<scene>.<theme>.<lang>.png and report.json.
"""

from __future__ import annotations

import argparse
import json
import os
import pathlib
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import time
import zlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
TOKENS = ROOT / "redrob" / "design_tokens.json"
OUT = ROOT / "out" / "native-capture"
WIDTH, HEIGHT = 1280, 800

# A page painted in the system's own ground, so the content area measures the chrome around it and not a
# web page's colours. Titles give the tab strip something to show.
def page(title: str) -> str:
    return ("data:text/html;charset=utf-8,<title>" + title + "</title>"
            # --surface-base in each theme, %23-encoded because a bare # ends a data: URL.
            "<style>:root{background:%23ffffff}@media(prefers-color-scheme:dark){:root{background:%230a0b0c}}</style>")


SCENES: dict[str, list[str]] = {
    "tabs": [page("Reading"), page("Shopping"), page("Mail"), page("Docs")],
    "settings": ["chrome://settings"],
    "history": ["chrome://history"],
    "downloads": ["chrome://downloads"],
    "extensions": ["chrome://extensions"],
}

NOT_REACHED = [
    "app menu, profile menu, tab context menu (need input injection; no xdotool on this host)",
    "omnibox popup, page info, permission and download bubbles (same)",
]


def palette(theme: str) -> list[tuple[int, int, int]]:
    data = json.loads(TOKENS.read_text(encoding="utf-8"))
    out = {(255, 255, 255), (0, 0, 0)}
    for token in data["tokens"]:
        if token["kind"] != "color":
            continue
        argb = int(token["argb"][theme], 16)
        if (argb >> 24) & 0xFF != 0xFF:
            continue  # a translucent token never paints as itself; only its composite shows
        out.add(((argb >> 16) & 0xFF, (argb >> 8) & 0xFF, argb & 0xFF))
    return sorted(out)


def read_xwd(path: pathlib.Path) -> tuple[int, int, bytes]:
    """XWD (X Window Dump) as Xvfb -fbdir writes it: a big-endian header, a colour map, then ZPixmap rows."""
    raw = path.read_bytes()
    header = struct.unpack(">25I", raw[:100])
    header_size, width, height = header[0], header[4], header[5]
    bits_per_pixel, bytes_per_line, ncolors = header[11], header[12], header[19]
    byte_order = header[7]  # 0 LSBFirst
    if bits_per_pixel != 32:
        sys.exit(f"capture_native: expected a 32-bit framebuffer, got {bits_per_pixel}")
    offset = header_size + ncolors * 12
    rgb = bytearray()
    for y in range(height):
        row = raw[offset + y * bytes_per_line: offset + y * bytes_per_line + width * 4]
        if byte_order == 0:  # B G R X
            for x in range(0, len(row), 4):
                rgb += bytes((row[x + 2], row[x + 1], row[x]))
        else:  # X R G B
            for x in range(0, len(row), 4):
                rgb += row[x + 1: x + 4]
    return width, height, bytes(rgb)


def write_png(path: pathlib.Path, width: int, height: int, rgb: bytes) -> None:
    def chunk(kind: bytes, body: bytes) -> bytes:
        return struct.pack(">I", len(body)) + kind + body + struct.pack(">I", zlib.crc32(kind + body) & 0xFFFFFFFF)
    rows = b"".join(b"\x00" + rgb[y * width * 3:(y + 1) * width * 3] for y in range(height))
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
           + chunk(b"IDAT", zlib.compress(rows, 6)) + chunk(b"IEND", b""))
    path.write_bytes(png)


def off_palette(rgb: bytes, colours: list[tuple[int, int, int]], share: float = 0.003) -> list[dict]:
    """Colours covering at least `share` of the window that are within 2 per channel of no token.

    Antialiasing and text produce thousands of one-off blends; a share floor keeps the report to the
    colours that are painted as a SURFACE -- a frame, a toolbar, a tab -- which is what a mixer decides.
    """
    counts: dict[tuple[int, int, int], int] = {}
    for i in range(0, len(rgb), 3):
        key = (rgb[i], rgb[i + 1], rgb[i + 2])
        counts[key] = counts.get(key, 0) + 1
    total = len(rgb) // 3
    found = []
    for colour, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        if n / total < share:
            break
        if any(all(abs(colour[c] - t[c]) <= 2 for c in range(3)) for t in colours):
            continue
        found.append({"colour": "#%02x%02x%02x" % colour, "share": round(n / total, 4)})
    return found


def extract_deb(deb: pathlib.Path, into: pathlib.Path) -> pathlib.Path:
    if shutil.which("dpkg-deb"):
        subprocess.run(["dpkg-deb", "-x", str(deb), str(into)], check=True)
    else:
        # A .deb is an ar archive holding data.tar.*; ar and tar are on every Linux host.
        subprocess.run(["ar", "x", str(deb.resolve())], cwd=into, check=True)
        data = next(into.glob("data.tar.*"))
        subprocess.run(["tar", "-xf", data.name], cwd=into, check=True)
    for candidate in into.glob("opt/**/redrob-browser"):
        if candidate.is_file() and os.access(candidate, os.X_OK):
            return candidate
    sys.exit(f"capture_native: no executable redrob-browser inside {deb.name}")


def capture(binary: pathlib.Path, scene: str, theme: str, lang: str, display: int, settle: float) -> dict:
    fbdir = pathlib.Path(tempfile.mkdtemp(prefix="fb-"))
    profile = pathlib.Path(tempfile.mkdtemp(prefix="profile-"))
    xvfb = subprocess.Popen(["Xvfb", f":{display}", "-screen", "0", f"{WIDTH}x{HEIGHT}x24", "-fbdir", str(fbdir),
                             "-nolisten", "tcp"], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.5)
    args = [str(binary), "--no-first-run", "--no-default-browser-check", "--test-type", "--disable-gpu",
            "--password-store=basic", f"--user-data-dir={profile}", f"--lang={lang}",
            f"--window-size={WIDTH},{HEIGHT}", "--window-position=0,0", "--start-maximized"]
    if os.geteuid() == 0:
        args.append("--no-sandbox")  # Chromium refuses to run as root otherwise; this host's builds run as root
    if theme == "dark":
        args.append("--force-dark-mode")
    env = {**os.environ, "DISPLAY": f":{display}", "LANGUAGE": lang, "LANG": "ko_KR.UTF-8" if lang == "ko" else "en_US.UTF-8"}
    log = profile / "browser.log"
    with log.open("w", encoding="utf-8") as handle:
        browser = subprocess.Popen(args + SCENES[scene], env=env, stdout=handle, stderr=subprocess.STDOUT,
                                   start_new_session=True)
        time.sleep(settle)
        width, height, rgb = read_xwd(fbdir / "Xvfb_screen0")
        os.killpg(browser.pid, signal.SIGTERM)
        browser.wait(timeout=20)
    xvfb.terminate()
    xvfb.wait(timeout=10)
    name = f"{scene}.{theme}.{lang}"
    write_png(OUT / f"{name}.png", width, height, rgb)
    errors = [line.strip() for line in log.read_text(encoding="utf-8", errors="replace").splitlines()
              if "FATAL" in line or "Check failed" in line]
    shutil.rmtree(fbdir, ignore_errors=True)
    shutil.rmtree(profile, ignore_errors=True)
    return {"capture": name, "screenshot": f"{name}.png", "offPalette": off_palette(rgb, palette(theme)),
            "errors": errors[:5]}


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument("--deb", type=pathlib.Path)
    source.add_argument("--binary", type=pathlib.Path)
    parser.add_argument("--only", help="capture only scenes whose name contains this")
    parser.add_argument("--settle", type=float, default=8.0, help="seconds to wait before reading the frame")
    args = parser.parse_args(argv)
    if not shutil.which("Xvfb"):
        sys.exit("capture_native: needs Xvfb (dnf install xorg-x11-server-Xvfb, apt install xvfb)")
    OUT.mkdir(parents=True, exist_ok=True)
    unpacked = None
    if args.deb:
        unpacked = pathlib.Path(tempfile.mkdtemp(prefix="deb-"))
        binary = extract_deb(args.deb, unpacked)
    else:
        binary = args.binary
    results = []
    display = 90
    for scene in SCENES:
        if args.only and args.only not in scene:
            continue
        for theme in ("light", "dark"):
            for lang in ("en", "ko"):
                result = capture(binary, scene, theme, lang, display, args.settle)
                results.append(result)
                print(f"{result['capture']:28} off-palette surfaces: {len(result['offPalette'])}"
                      + (f"  errors: {len(result['errors'])}" if result["errors"] else ""))
    (OUT / "report.json").write_text(json.dumps({"binary": str(binary), "notReached": NOT_REACHED,
                                                 "results": results}, indent=2) + "\n", encoding="utf-8")
    if unpacked:
        shutil.rmtree(unpacked, ignore_errors=True)
    print(f"\n{sum(len(r['offPalette']) for r in results)} off-palette surface colour(s) across "
          f"{len(results)} capture(s); report in {OUT.relative_to(ROOT)}/report.json")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
