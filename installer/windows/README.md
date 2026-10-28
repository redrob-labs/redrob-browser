# Redrob Browser: Windows setup

`redrob_browser_setup.cpp` is the branded Windows setup and its uninstaller, in one small native Win32 app
(Direct2D, DirectWrite, WIC; nothing beyond the Windows SDK). It is the Redrob Launcher setup
(`redrob-labs/redrob-launcher`, `installer/windows/`, our own code) with Redrob Browser's names, payload and
data folders, so every Redrob app installs through the same window. It replaced the WiX MSI of 0.1.0 and
0.1.1: an `.exe` carries the Redrob icon (an `.msi` always shows Windows Installer's), and the setup asks
the language.

## What it does

- **Language first.** The first screen is bilingual and offers English / 한국어; every screen after it, the
  window title included, follows the choice. It is preselected from a previous install's answer, else
  Korean on a Korean Windows, else English (`--lang en|ko` overrides). The answer goes to
  `HKCU\Software\Redrob\Redrob Browser\Language`; the browser starts in it until the person picks another
  language in its menu (`crates/redrob-shell/src/i18n.rs`).
- **Install**, per user, no administrator rights, into `%LOCALAPPDATA%\Programs\Redrob Browser` (the MSI's
  folder). The payload is the release's own signed zip (the programs, the GStreamer runtime and the
  Visual C++ runtime), unpacked with System32's `tar.exe` beside the old install and swapped in, so a
  failed update never leaves a half-updated folder. A running browser is never closed for the person: the
  setup asks them to close it, then Retry.
- **The 0.1.x MSI**: found by its UpgradeCode (`3E1D3581-4920-4530-BD81-BA7B0926E403`) and removed with
  `msiexec /x` before the new files go in, so Settings > Apps lists one Redrob Browser.
- **Shortcuts**: Start menu always, desktop when the welcome screen's box is ticked (the choice is
  remembered for the next update). Both open `redrob-browser-window.exe` and carry the AppUserModelID
  `ai.redrob.browser`.
- **Registry**: `InstallDir`, `Language`, `DesktopShortcutChoice` under `HKCU\Software\Redrob\Redrob Browser`,
  and the **Settings > Apps** entry (`...\Uninstall\RedrobBrowser`: name, version, publisher, icon, size,
  `UninstallString`).
- **Uninstall**: the same app built without a payload, written into the install folder as
  `Uninstall Redrob Browser.exe`. It asks first, with "Also delete bookmarks, history and settings" off by
  default, then removes the shortcuts, the entries and the folder. With the box: `%LOCALAPPDATA%\redrob-browser`
  (the profile and the logs) and the registry key. Downloads stay.

## Flags

| Flag | Does |
| --- | --- |
| (none) | the setup window; the uninstaller build opens its confirm screen |
| `--lang en` / `--lang ko` | preselect the language |
| `--uninstall` | the uninstall window (what Settings > Apps runs) |
| `--silent` | the same work with no window; the exit code is the result (0 = success, `0xE0000001` = the browser is running). Never opens the browser afterwards |
| `--delete-data` | with `--uninstall --silent`: also delete the profile |
| `--demo`, `--demo-error`, `--demo-uninstall` | the window's states on a timer, touching nothing |
| `--render-stages <dir>` | draw every screen (both languages) to PNGs in `<dir>`, no window |
| `--theme light` / `--theme dark` | draw in that theme instead of Windows' own |

## Build

Visual Studio with the C++ x64 toolset (found with `vswhere`), Python 3 and fontTools 4.67.0
(`py -3 -m pip install fonttools==4.67.0`):

```
py -3 installer\windows\build.py --out <dir> --arch x64 --payload redrob-browser-windows-x64-X.Y.Z.zip --version X.Y.Z
```

The release workflow builds it in two stages so every binary is signed before it is embedded:
`--uninstaller-only`, sign that, then `--payload … --uninstaller <signed exe> --name …-setup.exe`, sign that
(`.github/workflows/release.yml`, Windows job).

## Files

- `fonts/`: Pretendard SemiBold and Regular (SIL Open Font License, `OFL-Pretendard.txt`), subset at build
  time for Latin; Hangul comes from `crates/redrob-shell/assets/fonts/WantedSans-Regular.ttf`.
- `res/symbol-white-192.png`: the design system's white Redrob symbol, verbatim (`res/README.md`).
- `generated_tokens.h`: the design system's colour roles, as redrob-launcher's `cargo xtask tokens` writes
  them; copy it again from there when the design system changes.
- The setup's icon is `assets/redrob-browser.ico`, the one the programs carry.

## Verify

On a Windows machine: install from the setup in both languages, check the Start menu shortcut, the
Settings > Apps entry and the signed exe; run the setup again over the install (an update); install over
0.1.1's MSI (one Settings > Apps entry afterwards); try it while the browser runs (refused with Retry);
uninstall.
