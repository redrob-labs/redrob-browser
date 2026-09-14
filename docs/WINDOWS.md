# Windows

Nothing in this fork has ever been compiled on Windows. This document says what the Windows path consists of,
what is known to be missing, and how to run it — so the first person to try it is reading a map rather than
guessing.

## What exists

| Piece | State |
|---|---|
| `build/args/windows.gn` | written, never used |
| `redrob.py build --flavour windows` | wired, refuses to run on a non-Windows host |
| `redrob.py package --flavour windows` | wired — builds `chrome/installer/mini_installer` |
| UI font registration (`AddFontResourceExW`, `FR_PRIVATE`) | written, never compiled |
| `.github/workflows/windows.yml` | manual dispatch, never run |
| Authenticode signing | **absent** |
| Update channel (Omaha / an equivalent) | **absent** |
| App icon (`.ico` in the installer's resources) | **absent** — the build carries Chromium's |

## The machine

**Measured on a hosted `windows-2022` runner, 2026-09-14** — and it contradicts what this document predicted
before anyone ran it:

| | measured | this document had claimed |
|---|---|---|
| RAM | **8,187 MB** | 16 GB |
| disk | **185 GiB free** — `C:` 81.6 of 255 GiB, `D:` 104 of 110 GiB | ~60 GB free |
| OS | Windows Server 2022 Datacenter, build 20348 | — |

So **disk is not the constraint**. A Chromium checkout (~50 GB) plus a dev build (~40 GB) fits on a hosted
runner with room to spare, and the `D:` drive — where the workspace lives — is nearly empty.

**RAM is.** 8 GB against a dev build whose peak RSS measured **7.1 GB** on Linux leaves no margin for the OS,
and the release flavour's **19.9 GB** LTO link is out of reach by a factor of two. A hosted runner can plausibly
*sync* and will struggle to *link*.

The lesson worth keeping is not the numbers, it is that both of them were guessed wrong in the same document,
in opposite directions. `windows.yml` takes a `runner` input so the hosted path stays runnable and cheap to
re-measure when GitHub changes the image.

A self-hosted Windows runner needs:

- **≥ 200 GB free disk.** Checkout plus one build directory, with room for a second.
- **≥ 32 GB RAM** for a release-flavour build. The Linux release build measured a **19.9 GB peak RSS** across
  the LTO link, so 16 GB is not enough for a shipped build. This is the requirement a hosted runner's 8 GB
  cannot meet, and it is why a self-hosted machine is needed — disk turned out not to be.
- **Visual Studio 2022** with *Desktop development with C++*, the **Windows 11 SDK** including the *Debugging
  Tools for Windows*, and ATL/MFC. Chromium's `//docs/windows_build_instructions.md` is authoritative and moves;
  read it at the pinned tag rather than trusting this list.
- **`DEPOT_TOOLS_WIN_TOOLCHAIN=0`** in the environment. The hermetic toolchain Google publishes is reachable only
  from inside Google; without this variable `gclient` tries to download it and the error names a storage bucket
  rather than a missing dependency.
- Labels `self-hosted, windows, x64, chromium-build`, matching what `windows.yml` selects.
- **Long paths enabled** (`git config --system core.longpaths true`, and the registry's `LongPathsEnabled`).
  Chromium has paths past 260 characters and the failure without this is a checkout that half-completes.

## Running it

```powershell
python scripts\redrob.py bootstrap
python scripts\redrob.py sync
python scripts\redrob.py apply
python scripts\redrob.py brand
python scripts\redrob.py build --flavour windows
python scripts\redrob.py run   --flavour windows
python scripts\redrob.py package --flavour windows
```

`package` writes `out/artifacts/redrob-browser-x64-<version>-setup.exe` and the same name into `out/cdn/`. That
name is the convention the sibling repos already publish under — `redrob-design-x64-<version>-setup.exe` aliasing
to `redrob-design-x64-setup.exe` — so `.github/scripts/cdn-publish.sh` derives the version-free `latest/` link by
deleting the `-<version>` segment with no change to the script.

## What to expect the first time

The font registration is the one piece written blind. `AddFontResourceExW` takes a UTF-16 path, which
`base::FilePath::value()` already is on Windows, so that call should compile as written; the `WM_FONTCHANGE`
broadcast after it is the part most likely to be unnecessary or insufficient. Skia's DirectWrite backend builds
its own font collection and does not watch the GDI private font set, so if the window comes up in the platform
default face rather than Pretendard, the fix is a DirectWrite custom font collection rather than another GDI
call — and `windows.yml` greps the launch log for the `Redrob UI font` line precisely so the log says which of
those happened.

`treat_warnings_as_errors = false` is set in `build/args/windows.gn` for the same reason as on macOS: a fork does
not get to treat upstream's warnings as its own errors, and a first build on a new platform will have plenty.

## Not done, and why it is listed rather than attempted

**Signing.** An unsigned `setup.exe` triggers SmartScreen and reaches users as a warning. That needs an EV or
Authenticode certificate, which is a purchase and a key-custody decision before it is a build step — the same
shape as the apt signing key in `docs/RELEASE.md`.

**Updates.** The Linux side updates through the apt repository `scripts/build_repo.py` produces. Windows has no
equivalent here. Chromium's own answer is Omaha, which is a second service to run; until one exists a Windows
build is a manual download and should be described that way rather than implying an update channel.

**The icon.** `chrome/app/chrome_exe.rc` and the installer's resources point at Chromium's icon set. `branding/`
covers the Linux installer's seven PNG sizes and the `.ico` is a separate artefact; `check_repo.py` asserts the
Linux set and does not yet know about Windows, which is honest — there is nothing to assert.
