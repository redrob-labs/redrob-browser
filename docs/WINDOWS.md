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
- **Visual Studio 2026**, version 18.0.0 or later. **Not 2022** — the pinned tree's own
  `chromium/src/docs/windows_build_instructions.md` requires 2026, and that file is authoritative and moves with
  the pin, so re-read it when `CHROMIUM_VERSION` changes rather than trusting this list. Community Edition is
  fine if its licence suits. Installed non-interactively with exactly the arguments that document gives:

  ```
  PATH_TO_INSTALLER.EXE --add Microsoft.VisualStudio.Workload.NativeDesktop ^
                        --add Microsoft.VisualStudio.Component.VC.ATLMFC ^
                        --includeRecommended
  ```

- **Windows 11 SDK 10.0.28000.2270**, from the Visual Studio installer or on its own.
- **SDK Debugging Tools 10.0.26100.3323 or higher**, which the SDK does *not* install by default: Control Panel
  → Programs and Features → Windows Software Development Kit → Change → *Debugging Tools for Windows*. Chrome's
  PDBs exceed 4 GiB and are built as large-page PDBs, which older debugging tools cannot read, so this is a
  build requirement rather than a debugging convenience.
- **`DEPOT_TOOLS_WIN_TOOLCHAIN=0`** in the environment. The hermetic toolchain Google publishes is reachable only
  from inside Google; without this variable `gclient` tries to download it and the error names a storage bucket
  rather than a missing dependency.
- Labels `self-hosted, windows, x64, chromium-build`, matching what `windows.yml` selects.
- **Long paths enabled** (`git config --system core.longpaths true`, and the registry's `LongPathsEnabled`).
  Chromium has paths past 260 characters and the failure without this is a checkout that half-completes.

## Running it, step by step

Nothing here has ever run. Work through it in order and stop at the first failure — a later step cannot be
diagnosed from a state an earlier one did not reach.

### 0. Check the machine before starting anything

```powershell
# Free space on the drive the checkout will live on. Needs 200 GB; the git clone ALONE is 64.75 GiB.
Get-PSDrive C | Select-Object Used,Free
# Needs 32 GB for a release build, 16 GB for this dev flavour.
(Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB
python --version
git --version
# Must print 18.x -- Visual Studio 2026. An EMPTY line means no Visual Studio is installed, which is the
# usual answer on a fresh machine and is a prerequisite rather than a failure.
& "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe" -latest -property catalog_productDisplayVersion
# The Debugging Tools, which the SDK does not install by default. Must list a 10.0.26100.3323+ directory.
Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\Debuggers" -ErrorAction SilentlyContinue
```

### 1. Two git settings, in an ADMINISTRATOR PowerShell

Both are required and both fail confusingly if skipped.

```powershell
git config --system core.longpaths true
git config --global core.autocrlf false
```

`core.longpaths` — Chromium has paths past 260 characters. Without it the checkout half-completes and the error
names whichever file happened to be too long rather than the limit.

`core.autocrlf false` — Git for Windows converts line endings on checkout by default. Every patch in `patches/`
was generated on Linux with LF, so with conversion on, `git apply` finds no matching context and step 4 fails on
patches that are perfectly correct.

### 2. One environment variable, in the shell you will build from

```powershell
$env:DEPOT_TOOLS_WIN_TOOLCHAIN = "0"
```

The hermetic toolchain Google publishes is reachable only from inside Google. This selects the Visual Studio and
Windows SDK on the machine instead. Without it `gclient` tries to download a toolchain it has no access to and
the error names a storage bucket rather than a missing dependency.

### 3. Clone this repository

Private, so this needs credentials — `gh auth login` first, or an SSH key already on the account.

```powershell
gh repo clone redrob-labs/redrob-browser
cd redrob-browser
git checkout chromium
```

`chromium` is the default branch and an orphan branch; there is no `main` to switch from.

### 4. Fetch Chromium — the long one

```powershell
python scripts\redrob.py bootstrap
python scripts\redrob.py sync
```

`sync` downloads **64.75 GiB** of git history and then the toolchain hooks on top. Expect one to three hours on a
fast connection, and expect the progress bar to sit at 100% for a long while afterwards while git builds the pack
index — that is not a hang.

### 5. Put this fork on top of it

```powershell
python scripts\redrob.py apply
python scripts\redrob.py brand
```

`apply` copies the files this repo owns and then applies `patches/` with `--3way`. A conflict here means a patch
has drifted against the pinned Chromium, which is a real finding and not a local problem.

### 6. Build — the part nobody has done

```powershell
python scripts\redrob.py build --flavour windows
```

Hours. `treat_warnings_as_errors = false` is already set in `build/args/windows.gn`, so upstream's own warnings
will not stop it. If it fails, the last 30 lines of output are what identify the cause; the most likely one is
the `AddFontResourceExW` branch in `redrob_fonts.cc`, which has never been compiled.

### 7. Prove it exists and starts

```powershell
# The UI font has to be BESIDE chrome.exe -- that is where DIR_MODULE points on Windows.
Test-Path chromium\src\out\windows\fonts\PretendardVariable.ttf
cd chromium\src\out\windows
.\chrome.exe --no-first-run --no-default-browser-check --user-data-dir="$env:TEMP\redrob-probe" "chrome://redrob"
```

The window should come up with the sidebar in it. Two things to look at: whether the interface is in Korean
(it follows the system language), and whether the type is Pretendard rather than the system face — the second is
what says the font registration worked. `--enable-logging=stderr --v=1` prints the `Redrob UI font` line that
settles it either way.

### 8. Package it

```powershell
cd ..\..\..\
python scripts\redrob.py package --flavour windows
```

This writes `out/artifacts/redrob-browser-x64-<version>-setup.exe` and the same name into `out/cdn/`. That name is
the convention the sibling repos already publish under — `redrob-design-x64-<version>-setup.exe` aliasing to
`redrob-design-x64-setup.exe` — so `.github/scripts/cdn-publish.sh` derives the version-free `latest/` link by
deleting the `-<version>` segment with no change to the script.

### 9. Hand it to CI to sign

The installer is unsigned at this point. `.github/workflows/sign-and-publish.yml` signs it on a hosted runner
with the organisation's Authenticode certificate — which works precisely because signing needs no Chromium
checkout, so the disk wall that stops a CI build does not apply.

```powershell
gh release create v0.1.4 --draft --title "Redrob Browser 0.1.4" --notes "..." out\artifacts\redrob-browser-x64-0.1.4-setup.exe
gh workflow run sign-and-publish.yml -f tag=v0.1.4
```

A DRAFT release, so no user sees the unsigned file. The workflow replaces the asset with the signed one,
publishes to the CDN, and undrafts last. The tag must match `REDROB_VERSION` or the publish job refuses — bump
`REDROB_VERSION` and `sources/chrome/installer/linux/common/redrob-version.txt` together, and add the
`CHANGELOG.md` section, before building for a release.

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

**Signing — the certificate already exists, so this is wiring, not procurement.** An unsigned `setup.exe`
triggers SmartScreen and reaches users as a warning. This document previously called that a purchase; it is not.
`redrob-design/cdn.yml` signs its own Windows installer with `secrets.WIN_CSC_LINK` and
`secrets.WIN_CSC_KEY_PASSWORD`, and `.github/workflows/preflight.yml` confirms both are visible to **this**
repository. What is missing is the import-certificate and verify-Authenticode steps in `windows.yml`, which
should be copied from `redrob-design` rather than written fresh — including its habit of verifying the signature
after producing it, because a signing step that silently no-ops produces an unsigned binary and a green run.

The org also carries the full Apple set (`APPLE_CODESIGN_CERT_P12_BASE64`, `APPLE_CODESIGN_CERT_PASSWORD`,
`APPLE_NOTARY_API_KEY_ID`, `APPLE_NOTARY_API_ISSUER_ID`, `APPLE_NOTARY_API_KEY_P8_BASE64`), all confirmed
present — see `docs/MACOS.md`, which had this right before this document did.

**Updates.** The Linux side updates through the apt repository `scripts/build_repo.py` produces. Windows has no
equivalent here. Chromium's own answer is Omaha, which is a second service to run; until one exists a Windows
build is a manual download and should be described that way rather than implying an update channel.

**The icon.** `chrome/app/chrome_exe.rc` and the installer's resources point at Chromium's icon set. `branding/`
covers the Linux installer's seven PNG sizes and the `.ico` is a separate artefact; `check_repo.py` asserts the
Linux set and does not yet know about Windows, which is honest — there is nothing to assert.
