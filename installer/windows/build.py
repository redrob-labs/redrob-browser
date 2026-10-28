#!/usr/bin/env python3
# SPDX-License-Identifier: MIT OR Apache-2.0
"""Build the Redrob Browser Windows setup (and its uninstaller).

Python standard library plus fontTools. It:
  1. locates Visual Studio (vswhere) and runs rc.exe / cl.exe under its developer environment for the
     requested --arch (x64 is the one Redrob Browser ships);
  2. compiles redrob_browser_setup.rc + redrob_browser_setup.cpp twice:
       uninstall/Uninstall Redrob Browser.exe    no payload; this IS the uninstaller (--uninstall)
       <name>                                    embeds the release zip and the uninstaller above

Usage:
  build.py --out <dir> --arch x64 --payload <redrob-browser-windows-x64-X.zip> --version 0.1.2 [--name <exe>]
  build.py --out <dir> --version 0.1.2          # demo-only build (REDROB_NO_PAYLOAD): --demo flags only

The payload is the release's own zip (.github/workflows/release.yml: the programs, the GStreamer runtime
and the Visual C++ runtime at the top level), already Authenticode-signed inside, so the setup must be
built after signing and then signed itself.

The art is drawn by the window itself (the brand panel's gradient) around the design system's white symbol,
res/symbol-white-192.png, embedded as is; the icon is assets/redrob-browser.ico. The window embeds
deterministic subsets of committed fonts: Pretendard (fonts/) for Latin and Wanted Sans
(crates/redrob-shell/assets/fonts) for Hangul. Production builds fail when fontTools, a source font, a
requested glyph, or a resource is missing; `--allow-system-fonts` is an explicit developer-only escape hatch.

Ported from redrob-labs/redrob-launcher installer/windows/build.py (our own code).
"""
from __future__ import annotations

import argparse
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPO = HERE.parent.parent
ICON = REPO / "assets" / "redrob-browser.ico"
# The brand panel's mark: the design system's white symbol, verbatim (res/README.md).
SYMBOL_PNG = HERE / "res" / "symbol-white-192.png"


def find_vswhere() -> Path:
    pf = os.environ.get("ProgramFiles(x86)", r"C:\Program Files (x86)")
    vswhere = Path(pf) / "Microsoft Visual Studio" / "Installer" / "vswhere.exe"
    if vswhere.exists():
        return vswhere
    found = shutil.which("vswhere")
    if found:
        return Path(found)
    sys.exit("vswhere.exe not found; install Visual Studio with the C++ x64 toolset.")


# vcvarsall.bat's name for each target, hosted on an x64 machine.
VCVARS_ARCH = {"x64": "x64", "x86": "x64_x86", "arm64": "x64_arm64"}


def vs_dev_env(arch: str) -> dict:
    """The environment of a developer command prompt for `arch` (x64, x86 or arm64; x64 host)."""
    vsinstall = subprocess.run(
        [str(find_vswhere()), "-latest", "-products", "*",
         "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64",
         "-property", "installationPath"],
        capture_output=True, text=True, check=True).stdout.strip()
    if not vsinstall:
        sys.exit("No Visual Studio install with the C++ x64 toolset found.")
    vcvars = Path(vsinstall) / "VC" / "Auxiliary" / "Build" / "vcvarsall.bat"
    if not vcvars.exists():
        sys.exit(f"vcvarsall.bat missing under {vsinstall}")
    # vcvars can leave a non-zero errorlevel on success, so key off a marker and a sane env instead.
    # A real batch file carries vcvars' variables into `set`; an inline `cmd /c "call ... & set"` does not.
    marker = "__REDROB_ENV__"
    bat = Path(tempfile.gettempdir()) / "_redrob_browser_vcvars.bat"
    bat.write_text(f'@echo off\r\ncall "{vcvars}" {VCVARS_ARCH[arch]}\r\necho {marker}\r\nset\r\n', encoding="ascii")
    try:
        out = subprocess.run(["cmd", "/c", str(bat)], capture_output=True, text=True, errors="replace").stdout
    finally:
        bat.unlink(missing_ok=True)
    env, seen = {}, False
    for line in out.splitlines():
        if line.strip() == marker:
            seen = True
        elif seen and "=" in line:
            k, v = line.split("=", 1)
            env[k] = v
    keys = {k.upper() for k in env}
    if "PATH" not in keys or "INCLUDE" not in keys:
        sys.exit("vcvarsall did not produce a developer environment (no INCLUDE/PATH).")
    env.setdefault("SystemRoot", os.environ.get("SystemRoot", r"C:\Windows"))
    return env


# Committed Pretendard and Wanted Sans sources (SIL Open Font License, beside each); subsets are build
# artifacts.
FONTS = HERE / "fonts"
HANGUL_FONT = REPO / "crates" / "redrob-shell" / "assets" / "fonts" / "WantedSans-Regular.ttf"
FONTTOOLS_VERSION = "4.67.0"
SOURCE = HERE / "redrob_browser_setup.cpp"


def ui_literal_characters() -> set[str]:
    """Extract wide-string contents so comments cannot perturb deterministic subsets."""
    literals = re.findall(r'L"((?:\\.|[^"\\])*)"', SOURCE.read_text(encoding="utf-8"))
    characters: set[str] = set()
    for literal in literals:
        i = 0
        while i < len(literal):
            if literal[i] != "\\":
                characters.add(literal[i]); i += 1
            elif i + 5 < len(literal) and literal[i + 1] == "u":
                characters.add(chr(int(literal[i + 2:i + 6], 16))); i += 6
            elif i + 1 < len(literal):
                characters.add({"n": "\n", "r": "\r", "t": "\t"}.get(literal[i + 1], literal[i + 1])); i += 2
            else:
                i += 1
    return characters


def is_hangul(character: str) -> bool:
    codepoint = ord(character)
    return 0x1100 <= codepoint <= 0x11FF or 0x3130 <= codepoint <= 0x318F or 0xAC00 <= codepoint <= 0xD7A3


def require_fonttools_version() -> None:
    """Require the pinned release because fontTools changes can alter otherwise deterministic output."""
    try:
        import fontTools  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"fontTools {FONTTOOLS_VERSION} is required for bundled installer fonts") from exc
    installed = getattr(fontTools, "__version__", None)
    if installed != FONTTOOLS_VERSION:
        raise RuntimeError(f"fontTools {FONTTOOLS_VERSION} is required, found {installed or 'unknown'}")


def subset_font(source: Path, out_ttf: Path, characters: set[str]) -> None:
    """Create one deterministic subset and fail if any visible requested glyph was lost."""
    try:
        from fontTools import subset  # type: ignore
        from fontTools.ttLib import TTFont  # type: ignore
    except ImportError as exc:
        raise RuntimeError("fontTools is required for bundled installer fonts") from exc
    if not source.is_file():
        raise RuntimeError(f"missing committed font {source}")
    options = subset.Options()
    options.flavor = None
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    options.recalc_timestamp = False
    options.canonical_order = True
    font = subset.load_font(str(source), options)
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(sorted(characters)))
    subsetter.subset(font)
    subset.save_font(font, str(out_ttf), options)
    # Cmap validation prevents a malformed subset from becoming a silent system-font fallback.
    check = TTFont(str(out_ttf), recalcTimestamp=False)
    cmap = check.getBestCmap() or {}
    missing = sorted(ord(char) for char in characters if char >= " " and ord(char) not in cmap)
    check.close()
    if missing:
        out_ttf.unlink(missing_ok=True)
        raise RuntimeError(f"{source.name} is missing " + ", ".join(f"U+{value:04X}" for value in missing[:12]))


def prepare_fonts(out: Path) -> tuple[Path, Path, Path]:
    """Build required Pretendard Latin and Wanted Sans Hangul resources from committed assets."""
    require_fonttools_version()
    ui = ui_literal_characters()
    latin = {chr(codepoint) for codepoint in range(0x20, 0x7F)} | {char for char in ui if char >= " " and not is_hangul(char)}
    hangul = {char for char in ui if is_hangul(char)}
    if not hangul:
        raise RuntimeError("no Hangul UI characters found")
    outputs = (out / "Pretendard-SemiBold.subset.ttf", out / "Pretendard-Regular.subset.ttf",
               out / "WantedSans-Regular.subset.ttf")
    subset_font(FONTS / "Pretendard-SemiBold.ttf", outputs[0], latin)
    subset_font(FONTS / "Pretendard-Regular.ttf", outputs[1], latin)
    subset_font(HANGUL_FONT, outputs[2], hangul)
    return outputs


def run_in_env(cmd: list, env: dict, cwd: str) -> None:
    """CreateProcess resolves the program on the PARENT's PATH, so resolve it on the dev env's first."""
    path = next((v for k, v in env.items() if k.upper() == "PATH"), None)
    resolved = shutil.which(cmd[0], path=path)
    if resolved:
        cmd = [resolved, *cmd[1:]]
    print("$", " ".join(cmd), flush=True)
    subprocess.run(cmd, env=env, check=True, cwd=cwd)


def compile_app(env, out: Path, exe_name: str, font, ver: str, payload, uninstaller, machine: str = "X64") -> Path:
    """rc + cl + link into out/exe_name. Paths reach RC through a generated header with forward slashes:
    RC's preprocessor reads backslashes in string macros as escapes."""
    def fwd(p) -> str:
        return str(p).replace("\\", "/")

    out.mkdir(parents=True, exist_ok=True)
    parts = (ver.split(".") + ["0", "0", "0", "0"])[:4]
    lines = [
        "// generated by build.py -- do not edit",
        f'#define REDROB_SYMBOL_PATH "{fwd(SYMBOL_PNG)}"',
        f'#define REDROB_ICON_PATH "{fwd(ICON)}"',
        f"#define REDROB_VER_FILE {','.join(parts)}",
        f'#define REDROB_VER_STR "{ver}"',
        f'#define REDROB_VER_WSTR L"{ver}"',
        f'#define REDROB_SETUP_KIND "{"Uninstaller" if payload is None else "Setup"}"',
    ]
    if font:
        lines.extend([
            f'#define REDROB_FONT_SEMIBOLD_PATH "{fwd(font[0])}"',
            f'#define REDROB_FONT_REGULAR_PATH "{fwd(font[1])}"',
            f'#define REDROB_FONT_HANGUL_PATH "{fwd(font[2])}"',
            "#define REDROB_REQUIRE_BUNDLED_FONTS 1",
        ])
    else:
        # Only an explicit developer build may compile the documented system-font fallback.
        lines.append("#define REDROB_ALLOW_SYSTEM_FONTS 1")
    if payload:
        lines.append(f'#define REDROB_PAYLOAD_PATH "{fwd(payload)}"')
    else:
        lines.append("#define REDROB_NO_PAYLOAD 1")
    if uninstaller:
        lines.append(f'#define REDROB_UNINSTALLER_PATH "{fwd(uninstaller)}"')
    (out / "build_defs.h").write_text("\n".join(lines) + "\n", encoding="ascii")

    res = out / "redrob_browser_setup.res"
    run_in_env(["rc.exe", "/nologo", f"/I{out}", f"/I{HERE}", f"/fo{res}", str(HERE / "redrob_browser_setup.rc")],
               env, str(HERE))
    exe = out / exe_name
    obj = out / "redrob_browser_setup.obj"
    run_in_env(["cl.exe", "/nologo", "/EHsc", "/O2", "/W3", "/WX", "/MT", "/std:c++17", "/utf-8",
                "/DUNICODE", "/D_UNICODE", f"/I{out}", f"/Fo{obj}", str(HERE / "redrob_browser_setup.cpp"),
                "/link", "/SUBSYSTEM:WINDOWS", "/MANIFEST:NO", f"/MACHINE:{machine}", str(res), f"/OUT:{exe}"],
               env, str(out))
    if not exe.exists():
        sys.exit(f"link produced no {exe_name}")
    return exe


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", required=True)
    ap.add_argument("--payload", help="the release's Windows zip (omit for a demo-only build)")
    ap.add_argument("--version", required=True, help="e.g. 0.4.0")
    ap.add_argument("--arch", default="x64", choices=sorted(VCVARS_ARCH), help="target architecture (default x64)")
    ap.add_argument("--name", default="Redrob Browser Setup.exe", help="output file name of the setup")
    ap.add_argument("--allow-system-fonts", action="store_true",
                    help="developer-only escape hatch; production builds must embed the committed fonts")
    ap.add_argument("--uninstaller-only", action="store_true",
                    help="build only <out>/uninstall/Uninstall Redrob Browser.exe, so it can be signed first")
    ap.add_argument("--uninstaller", help="an already built (and signed) uninstaller to embed, instead of "
                                          "building one")
    args = ap.parse_args()

    if not re.fullmatch(r"\d+\.\d+\.\d+", args.version):
        sys.exit(f"--version must be X.Y.Z, got {args.version!r}")
    for f in (SYMBOL_PNG, ICON):
        if not f.exists():
            sys.exit(f"missing committed asset {f}")

    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    env = vs_dev_env(args.arch)
    machine = {"x64": "X64", "x86": "X86", "arm64": "ARM64"}[args.arch]
    try:
        font = None if args.allow_system_fonts else prepare_fonts(out)
    except RuntimeError as exc:
        sys.exit(f"font preparation failed: {exc}")

    if args.uninstaller_only:
        exe = compile_app(env, out / "uninstall", "Uninstall Redrob Browser.exe", font, args.version,
                          payload=None, uninstaller=None, machine=machine)
    elif args.payload:
        payload = Path(args.payload).resolve()
        if not payload.is_file():
            sys.exit(f"payload not found: {payload}")
        if args.uninstaller:
            uninstaller = Path(args.uninstaller).resolve()
            if not uninstaller.is_file():
                sys.exit(f"uninstaller not found: {uninstaller}")
        else:
            uninstaller = compile_app(env, out / "uninstall", "Uninstall Redrob Browser.exe", font, args.version,
                                      payload=None, uninstaller=None, machine=machine)
        exe = compile_app(env, out, args.name, font, args.version, payload=payload, uninstaller=uninstaller, machine=machine)
    else:
        exe = compile_app(env, out, args.name, font, args.version, payload=None, uninstaller=None, machine=machine)
    print(f"\nbuilt {exe}  {exe.stat().st_size // 1024} KB  (payload: {'yes' if args.payload else 'none'})", flush=True)


if __name__ == "__main__":
    main()
