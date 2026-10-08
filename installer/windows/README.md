# Redrob Browser — branded Windows setup

`redrob_setup.exe` is a native Win32 setup window for Redrob Browser. It shows a
small, branded install experience and then runs Chromium's `mini_installer.exe`
(embedded as a resource), which does the actual per-user install and launches
the browser.

Today's shipped installer is `mini_installer.exe` itself: ~244 MB, no UI, it
unpacks silently, installs to `%LOCALAPPDATA%\Redrob\Application`, and launches
the browser. `redrob_setup.exe` wraps that with a branded window; it does not
change how the install works.

## What it looks like

Follows the Redrob design system (`redrob-design-system`):

- **Ground: `deep`** — Redrob Black `#0A0B0C`. An installer is a transient
  launch moment over a busy desktop; the design system sanctions a dark ground
  via the `deep` product ground (`20-color.md`). Text is `gray-1` / `ink-muted`;
  the call to action is a white pill with black type.
- **Progress bar fill: `action-primary`** — Redrob Blue `#2B52FF`. "Blue acts"
  (`20-color.md`).
- **Product mark** — the Redrob Browser mark `#F14AA8` appears only in the
  lockup artwork, never as text ("product color is where you are, never what you
  read", `20-color.md`).
- **Foot light: `wash-edge`** cut from the brand gradient
  (`blue-6 → accent-teal-3`), pre-rendered into the background PNG. This is the
  in-system substitute for a multi-color-into-black glow, which the system
  forbids ("two product colors in one gradient"; gradients "never into black").
- **Type: Pretendard** (the design-system system face, `30-typography.md`),
  embedded in-memory (OFL). Falls back to Segoe UI Variable.
- Borderless, rounded, DWM-shadowed window, per-monitor-v2 DPI aware. Draggable
  by its caption strip; minimize and close glyphs top-right. Esc / Alt+F4 close,
  with a confirm while installing.

States: **Preparing → Installing → Opening Redrob Browser**, plus an **error**
state with a readable message and **Retry** / **Close**.

The payload reports no progress, so the bar is a time-based eased ramp capped at
~90 % until `mini_installer.exe` exits (exit 0 = success). `mini_installer`
launches the browser only on a first install (`FIRST_INSTALL_SUCCESS` in
`chrome/installer/setup/setup_main.cc`); a repair or update launches nothing. So
after a success the app waits up to 4 s for the installer's own launch and opens
the browser itself only if none appeared — never a second window.

## Build

Requires Visual Studio 2022/2026 with the C++ x64 toolset (found via `vswhere`),
the Windows SDK, Python 3, and `chrome.exe` for rendering the background art.

```
python installer\windows\build.py --out <dir> ^
    --payload <path to mini_installer.exe> ^
    --chrome "C:\Program Files\Google\Chrome\Application\chrome.exe" ^
    --design-system <path to redrob-design-system> ^
    --version 1.2.3.4
```

- `--payload` is **optional**. Omit it for a demo-only build (defines
  `REDROB_NO_PAYLOAD`); the exe still runs the demo flags below.
- The app icon comes from `branding/icons/win/redrob.ico`; `VERSIONINFO` carries
  CompanyName *Redrob*, ProductName *Redrob Browser*.

Pretendard ships as woff2 in the design system; `build.py` converts it to TTF
with `fontTools` if available, else embeds no font and the app falls back to
Segoe UI Variable.

## Demo flags

- `redrob_setup.exe --demo` — runs the whole UI sequence on a timer with **no
  payload** and no download, after you press Install on the first screen
  (Preparing → [Installing Redrob Code] → Installing → Opening → close). Safe to
  run anywhere.
- `redrob_setup.exe --demo-error` — shows the error state immediately.
- `redrob_setup.exe --demo-code-error --with-redrob-code` — the demo, ending on
  the "Redrob Code was not installed" screen.
- `redrob_setup.exe --demo-uninstall` — the uninstall window (confirm, removing,
  removed) on a timer after you press Uninstall. Removes nothing.
- `--with-redrob-code` — start with the Redrob Code box ticked. Still a choice.

## Redrob Code (opt-in)

The first screen asks before anything is installed. "Also install Redrob Code"
is **off** by default. When ticked, Redrob Code goes in first, so the browser
opens already able to find it:

1. Download `SHA256SUMS` and `redrob-code-x64-setup.exe` from the latest
   [redrob-code release](https://github.com/redrob-labs/redrob-code/releases/latest).
2. Refuse the installer unless its SHA-256 matches the line for it in `SHA256SUMS`.
3. Run it silently for this user: `/VERYSILENT /SUPPRESSMSGBOXES /NORESTART /SP- /CURRENTUSER /TASKS=addtopath`.
   It installs to `%LOCALAPPDATA%\Redrob\bin`, which the browser's engine lookup
   reads directly.

A Redrob Code failure never fails the browser install; the last screen says why
and waits for Close. When Redrob Code is already installed (that folder,
`%USERPROFILE%\.redrob\bin`, or `PATH`), the first screen says so instead.

The checksum proves the file is the one the release lists. It does not prove who
published the release; that needs Redrob Code's installer to be signed.

## Uninstall

The same app, built without a payload, is the uninstaller. With `--payload`,
`build.py` builds it first (`<out>/uninstall/redrob_uninstall.exe`) and embeds it
in `redrob_setup.exe`. After a successful install the setup writes it to
`%LOCALAPPDATA%\Redrob\Uninstall\` and points the Settings > Apps entry
(`HKCU\...\Uninstall\Redrob`, `UninstallString`) at
`redrob_uninstall.exe --uninstall`. Chromium's own command is kept in
`RedrobChromiumUninstallString` on the same key.

The uninstall window asks first, with an "Also delete your browsing data"
checkbox, then runs Chromium's `setup.exe --uninstall --force-uninstall`
(plus `--delete-profile` when ticked). `--force-uninstall` skips Chromium's own
dialog and closes running browser windows. When it is done, a hidden PowerShell
waits for the window to exit and deletes `redrob_uninstall.exe`, then the
folder only if it is empty. The folder is shared: Redrob Code's own uninstaller
lives in `Redrob\uninstall`, the same folder on Windows, so deleting the whole
folder would leave Redrob Code impossible to uninstall.

Limit: an install or update that bypasses this setup (running `mini_installer.exe`
directly) rewrites `UninstallString` with Chromium's command, and the entry falls
back to Chromium's plain dialog until the next install through this setup.

## Packaging hook

`scripts/redrob.py package --flavour windows` builds `mini_installer.exe` and, as
an optional last step, wraps it into `redrob_setup.exe` beside it when
`--with-setup` is passed and this toolchain is present. The `mini_installer.exe`
output is left unchanged.

## Files

- `redrob_setup.cpp` — the app (Direct2D / DirectWrite / WIC).
- `redrob_setup.rc`, `resource.h`, `redrob_setup.manifest` — resources + DPI
  manifest.
- `res/background.html` — background-art source, rasterised to a PNG at build
  time.
- `build.py` — the build script.
