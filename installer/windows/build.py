#!/usr/bin/env python3
"""Build redrob_setup.exe -- the branded Redrob Browser Windows setup.

Standard library only, like scripts/redrob.py. It:
  1. locates VS 2026 (vswhere) and the Windows SDK, and runs under its env;
  2. renders res/background.html to a PNG with headless Chromium (the technique
     scripts/render_app_icons.py uses), and prepares the lockup PNG + font;
  3. compiles redrob_setup.rc (rc.exe) and redrob_setup.cpp (cl.exe), and links.

Usage:
  build.py --out <dir> [--payload <mini_installer.exe>] [--chrome <chrome.exe>]
           [--design-system <dir>] [--version 1.2.3.4]

--payload is OPTIONAL: a demo-only build (no embedded installer) omits it and
defines REDROB_NO_PAYLOAD. The resulting exe still runs --demo / --demo-error.

With --payload the build makes two exes. First the payload-less one, written as
<out>/uninstall/redrob_uninstall.exe: that IS the uninstaller (--uninstall). Then
redrob_setup.exe, which embeds both the payload and that uninstaller, and installs
the uninstaller after a successful install.
"""
from __future__ import annotations

import argparse
import os
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
RES = HERE / "res"
# redrob-browser repo root (installer/windows/ -> repo root)
REPO = HERE.parent.parent
DEFAULT_DS = REPO.parent / "redrob-design-system"
ICON = REPO / "branding" / "icons" / "win" / "redrob.ico"


def find_vswhere() -> Path:
    pf = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    vswhere = Path(pf) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
    if vswhere.exists():
        return vswhere
    found = shutil.which("vswhere")
    if found:
        return Path(found)
    sys.exit("vswhere.exe not found; install Visual Studio 2022/2026.")


def vs_dev_env() -> dict:
    """Return the environment of a VS developer command prompt (x64)."""
    vswhere = find_vswhere()
    vsinstall = subprocess.run(
        [str(vswhere), "-latest", "-products", "*",
         "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
         "-property", "installationPath"],
        capture_output=True, text=True, check=True).stdout.strip()
    if not vsinstall:
        sys.exit("No VS install with the C++ x64 toolset found.")
    vcvars = Path(vsinstall) / "VC" / "Auxiliary" / "Build" / "vcvars64.bat"
    if not vcvars.exists():
        sys.exit(f"vcvars64.bat missing under {vsinstall}")
    # Run vcvars64 then dump the environment after a marker, and parse KEY=VALUE
    # lines that follow it. vcvars prints a banner and can leave a non-zero
    # errorlevel from one of its sub-scripts even on success, so we key off the
    # marker + the presence of a sane env, not the batch exit code. Decode with
    # errors="replace" because `set` can carry non-UTF-8 bytes.
    marker = "__REDROB_ENV__"
    # Invoke vcvars from a temp .bat rather than an inline `cmd /c "call ... & set"`:
    # the inline form runs under this host's cmd but does not reliably carry the
    # vars vcvars sets into the `set` dump, whereas a real batch file does.
    import tempfile
    bat = Path(tempfile.gettempdir()) / "_redrob_vcvars_probe.bat"
    bat.write_text(
        "@echo off\r\n"
        f'call "{vcvars}"\r\n'
        f"echo {marker}\r\n"
        "set\r\n", encoding="ascii")
    try:
        proc = subprocess.run(["cmd", "/c", str(bat)],
                              capture_output=True, text=True, errors="replace")
        out = proc.stdout
    finally:
        try:
            bat.unlink()
        except OSError:
            pass
    env = {}
    seen_marker = False
    for line in out.splitlines():
        if line.strip() == marker:
            seen_marker = True
            continue
        if seen_marker and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    if "PATH" not in {k.upper() for k in env} or "INCLUDE" not in {k.upper() for k in env}:
        sys.exit("vcvars64 did not produce a developer environment (no INCLUDE/PATH). "
                 "Open 'x64 Native Tools Command Prompt' once to confirm the install.")
    env.setdefault("SystemRoot", os.environ.get("SystemRoot", r"C:\Windows"))
    return env


def find_chrome(explicit):
    if explicit:
        return explicit
    for c in (r"C:\Program Files\Google\Chrome\Application\chrome.exe",
              r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"):
        if Path(c).exists():
            return c
    return shutil.which("chrome") or shutil.which("chrome.exe")


def render_background(chrome, out_png: Path, force: bool = False) -> None:
    """Rasterise res/background.html at 1320x800 (2x of 660x400).

    The art is static, so an existing PNG is reused unless --force-render is
    passed; this also avoids re-invoking headless Chromium, which can hang on a
    contended profile. If headless Chromium is unavailable or fails, fall back to
    an equivalent Pillow renderer (same deep ground + brand-gradient foot glow),
    so the build never depends on a working browser screenshot."""
    if out_png.exists() and not force:
        print(f"reusing existing background art: {out_png}")
        return
    if out_png.exists():
        out_png.unlink()  # force: start clean so a renderer must actually produce it
    src = RES / "background.html"
    if chrome:
        import tempfile
        work = Path(tempfile.mkdtemp(prefix="rbs_render_"))
        try:
            subprocess.run(
                [chrome, "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars",
                 f"--user-data-dir={work / 'profile'}", "--default-background-color=00000000",
                 "--force-device-scale-factor=2", "--window-size=660,400",
                 f"--screenshot={out_png}", f"file://{src}"],
                check=True, capture_output=True, timeout=60)
        except Exception as e:
            print(f"note: headless Chromium render failed ({type(e).__name__}); "
                  f"falling back to the Pillow renderer.")
        finally:
            shutil.rmtree(work, ignore_errors=True)
    if out_png.exists():
        return
    render_background_pillow(out_png)
    if not out_png.exists():
        sys.exit("background render produced no PNG (neither Chromium nor Pillow)")


def render_background_pillow(out_png: Path) -> None:
    """Draw the deep-ground background + brand-gradient foot glow with Pillow.

    Mirrors res/background.html: Redrob Black field (#0A0B0C) with an additive
    foot glow built from the brand gradient's two stops only -- blue-6 #2B52FF
    (broad bed) and accent-teal-3 #6FF4F0 (core at the seam) -- rising from the
    bottom and spent before mid-window, plus 6% grain. Brand colors only; never
    into black above the seam; no third hue."""
    try:
        from PIL import Image, ImageFilter
        import numpy as np
    except Exception:
        sys.exit("Pillow + numpy are required for the background fallback; install them "
                 "or provide a working --chrome for the headless render.")
    W, H = 1320, 800
    black = np.array([10, 11, 12], dtype=np.float32)
    img = np.tile(black, (H, W, 1))

    yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
    # radial glow rising from a point just below the foot-center, normalised,
    # anisotropic (wider than tall). The falloff exponent keeps it concentrated
    # near the seam and spent before mid-window.
    def glow(color, cx_frac, origin_y, half_w, half_h, peak, falloff):
        c = cx_frac * W
        dx = (xx - c) / half_w
        dy = (yy - origin_y) / half_h
        d = np.sqrt(dx * dx + dy * dy)
        a = np.clip(1.0 - d, 0.0, 1.0) ** falloff * peak
        return a[..., None] * np.array(color, dtype=np.float32)

    # Brand gradient's two stops only. Origins sit just BELOW the foot (y>H) so
    # the brightest part of each glow lands on the bottom edge, not off-screen.
    light = np.zeros((H, W, 3), dtype=np.float32)
    light += glow((43, 82, 255),  0.50, H + 40, W * 0.55, 300.0, 1.5, 1.5)   # blue-6 bed
    light += glow((111, 244, 240),0.50, H + 10, W * 0.28, 170.0, 1.05, 1.7)  # accent-teal-3 core
    light += glow((43, 82, 255),  0.32, H + 10, W * 0.42, 260.0, 0.7, 1.6)   # blue rake sheen (left bias)

    # additive compositing (screen-like): never darkens the black ground
    out = 255.0 - (255.0 - img) * (255.0 - np.clip(light, 0, 255)) / 255.0
    out = np.clip(out, 0, 255)

    im = Image.fromarray(out.astype(np.uint8), "RGB").filter(ImageFilter.GaussianBlur(18))

    # 6% grain on dark
    rng = np.random.default_rng(7)
    noise = rng.integers(0, 256, size=(H, W, 1)).astype(np.float32)
    arr = np.asarray(im, dtype=np.float32)
    grain = 0.06
    arr = 255.0 - (255.0 - arr) * (255.0 - noise * grain) / 255.0
    Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGB").save(out_png)
    print(f"rendered background with Pillow fallback: {out_png}")


def prepare_lockup(design_system: Path, out_png: Path) -> None:
    """Use the shipped Solid-Mono-White lockup (all white) -- correct on a deep
    ground where the gradient symbol would fight the dark field (10-logo.md /
    assets/Products/README.md)."""
    src = design_system / "assets" / "Products" / "redrob-browser-lockup-solid-mono-white.png"
    if not src.exists():
        sys.exit(f"lockup not found: {src}")
    shutil.copyfile(src, out_png)


def prepare_font(design_system: Path, out_ttf: Path) -> bool:
    """Pretendard SemiBold. The design system ships woff2; the Win32 loader
    (AddFontMemResourceEx) needs a TTF/OTF, so convert if a converter exists,
    else skip and let the app fall back to Segoe UI Variable."""
    woff2 = design_system / "fonts" / "Pretendard-SemiBold.woff2"
    if not woff2.exists():
        return False
    try:
        from fontTools.ttLib import TTFont  # type: ignore
        f = TTFont(str(woff2))
        f.flavor = None
        f.save(str(out_ttf))
        return out_ttf.exists()
    except Exception:
        print("note: fontTools not available; embedding no font, app uses Segoe UI Variable.")
        return False


def run_in_env(cmd: list, env: dict, cwd: str) -> None:
    """Run cmd under the VS dev env, resolving cmd[0] against env['PATH'].

    Windows' CreateProcess looks the executable up on the PARENT process PATH,
    not on the PATH we pass in env, so rc.exe / cl.exe would be 'not found'
    unless we resolve them ourselves first (the same thing scripts/redrob.py's
    run() does)."""
    path = None
    for k, v in env.items():
        if k.upper() == "PATH":
            path = v
            break
    resolved = shutil.which(cmd[0], path=path)
    if resolved:
        cmd = [resolved, *cmd[1:]]
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, env=env, check=True, cwd=cwd)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--payload", help="mini_installer.exe to embed (optional for demo builds)")
    ap.add_argument("--chrome", help="chrome.exe for headless rendering")
    ap.add_argument("--design-system", default=str(DEFAULT_DS))
    ap.add_argument("--version", default="0.0.0.0")
    ap.add_argument("--force-render", action="store_true",
                    help="re-render background.png even if one already exists")
    ap.add_argument("--no-browser-render", action="store_true",
                    help="skip headless Chromium and render the background with Pillow directly")
    args = ap.parse_args()

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    ds = Path(args.design_system).resolve()

    env = vs_dev_env()

    # ---- assets ----
    bg = out / "background.png"
    lockup = out / "lockup.png"
    font = out / "Pretendard-SemiBold.ttf"
    chrome = None if args.no_browser_render else find_chrome(args.chrome)
    render_background(chrome, bg, force=args.force_render)
    prepare_lockup(ds, lockup)
    have_font = prepare_font(ds, font)

    # ---- version macros ----
    ver = args.version.strip()
    parts = (ver.split(".") + ["0", "0", "0", "0"])[:4]
    ver_file = ",".join(parts)

    if args.payload:
        # The uninstaller first: the same app without a payload, embedded in the setup below.
        uninstall_dir = out / "uninstall"
        uninstall_dir.mkdir(exist_ok=True)
        uninstaller = compile_app(env, uninstall_dir, "redrob_uninstall.exe", bg, lockup, font if have_font else None,
                                  ver, ver_file, payload=None, uninstaller=None)
        exe = compile_app(env, out, "redrob_setup.exe", bg, lockup, font if have_font else None,
                          ver, ver_file, payload=Path(args.payload).resolve(), uninstaller=uninstaller)
    else:
        exe = compile_app(env, out, "redrob_setup.exe", bg, lockup, font if have_font else None,
                          ver, ver_file, payload=None, uninstaller=None)
    print(f"\nbuilt {exe}  {exe.stat().st_size // 1024} KB"
          f"  (payload: {'yes' if args.payload else 'none'})")


def compile_app(env, out: Path, exe_name: str, bg: Path, lockup: Path, font, ver: str, ver_file: str,
                payload, uninstaller) -> Path:
    """Compile redrob_setup.rc + redrob_setup.cpp into out/exe_name with the given embedded resources.

    Rather than pass fragile /D macros (RC's preprocessor treats backslashes in string macros as escapes,
    mangling Windows paths), generate a header the .rc includes. Paths use forward slashes, which RC accepts
    and which never escape.
    """
    def fwd(p) -> str:
        return str(p).replace("\\", "/")

    rc = HERE / "redrob_setup.rc"
    res = out / "redrob_setup.res"
    defs = out / "build_defs.h"
    lines = [
        "// generated by build.py -- do not edit",
        f'#define REDROB_BACKGROUND_PATH "{fwd(bg)}"',
        f'#define REDROB_LOCKUP_PATH "{fwd(lockup)}"',
        f"#define REDROB_VER_FILE {ver_file}",
        f'#define REDROB_VER_STR "{ver}"',
    ]
    if ICON.exists():
        lines.append(f'#define REDROB_ICON_PATH "{fwd(ICON)}"')
    if font:
        lines.append(f'#define REDROB_FONT_PATH "{fwd(font)}"')
    if payload:
        lines.append(f'#define REDROB_PAYLOAD_PATH "{fwd(payload)}"')
    else:
        lines.append("#define REDROB_NO_PAYLOAD 1")
    if uninstaller:
        lines.append(f'#define REDROB_UNINSTALLER_PATH "{fwd(uninstaller)}"')
    defs.write_text("\n".join(lines) + "\n", encoding="ascii")

    rc_cmd = ["rc.exe", "/nologo", f"/I{out}", f"/I{HERE}", f"/fo{res}", str(rc)]
    run_in_env(rc_cmd, env, str(HERE))

    # ---- compile + link the .cpp ----
    exe = out / exe_name
    obj = out / "redrob_setup.obj"
    cl_cmd = ["cl.exe", "/nologo", "/EHsc", "/O2", "/W3", "/MT", "/std:c++17",
              "/DUNICODE", "/D_UNICODE",
              f"/Fo{obj}",
              str(HERE / "redrob_setup.cpp"),
              "/link", "/SUBSYSTEM:WINDOWS", "/MANIFEST:NO",
              str(res), f"/OUT:{exe}"]
    run_in_env(cl_cmd, env, str(out))

    if not exe.exists():
        sys.exit(f"link produced no {exe_name}")
    return exe


if __name__ == "__main__":
    main()
