# Releasing

Version: `[workspace.package] version` in `Cargo.toml` (0.1.0 for the first release of this
browser; every earlier Redrob Browser release was removed with the Chromium tree).

1. Merge `develop` into `main` through a release pull request.
2. Tag `v<version>` on `main`. `.github/workflows/release.yml` checks the tag against
   `Cargo.toml`, then builds, signs and publishes.

A `workflow_dispatch` run with a version builds and signs everything and publishes nothing (a dry
run). There are no other triggers.

| Job | Output | Signing |
|---|---|---|
| Linux x64 (`ubuntu-22.04`) | `redrob-browser-linux-x64-<v>.tar.gz` | none |
| Linux arm64 (`ubuntu-22.04-arm`) | `redrob-browser-linux-arm64-<v>.tar.gz` | none |
| macOS arm64 | `redrob-browser-macos-arm64-<v>.zip` and `.dmg`, each holding `Redrob Browser.app` | Developer ID, notarized and stapled, the app and the dmg (`scripts/package-macos.sh`) |
| Windows x64 | `redrob-browser-windows-x64-<v>.zip` and `redrob-browser-windows-x64-<v>-setup.exe` | Authenticode through Azure Artifact Signing (org action): every unsigned `.exe` and `.dll`, CEF's included, before packaging, then the setup's uninstaller, then the setup |
| publish | GitHub release, checksums, launcher manifest | org `release-publish.yml` |

Every package carries the Chromium runtime the window's tabs run on (CEF, `docs/CEF.md`), which
also plays video; nothing else has to be installed.

## CEF in the packages

Each job fetches CEF's prebuilt binary distribution for its platform with `export-cef-dir` of the
`cef` crate's version (`CEF_VERSION` in `release.yml`, `156.3.0+156.0.15` = Chromium 156;
`scripts/fetch-cef.sh` on Linux and macOS), caches it by version, and builds against it
(`CEF_PATH`). Moving to a newer Chromium is a `cef` crate bump plus the same bump of `CEF_VERSION`.

| Platform | Archive | Unpacked | Layout |
|---|---|---|---|
| Linux x64 | 237 MB `.tar.gz` | 571 MB | one folder (`scripts/package-linux.sh`) |
| Linux arm64 | about the same | about the same | the same script on the arm64 runner |
| macOS arm64 | measured on the first release run | | `Redrob Browser.app` (`scripts/package-macos.sh`) |
| Windows x64 | measured on the first release run | | one folder, zip and setup (`release.yml`) |

(Linux x64 measured with this host's build of the engine programs, 2026-11-02.)

- **Linux:** the folder holds the programs, `libcef.so` (stripped of its 1.2 GB of debug
  information), `libvk_swiftshader.so`, `libvulkan.so.1`, `vk_swiftshader_icd.json`,
  `chrome-sandbox`, `chrome_100_percent.pak`, `chrome_200_percent.pak`, `resources.pak`,
  `icudtl.dat`, `v8_context_snapshot.bin`, `locales/` with `en-US*` and `ko*` only, `LICENSE`,
  `NOTICE`, `CREDITS.html` and `bundle-manifest.txt`. The window gets the run path `$ORIGIN`
  (patchelf), so it finds `libcef.so` beside itself; the script stops when `ldd` reports a missing
  library for any file of the bundle. What the bundle does not carry is what every desktop that
  runs Chrome has: glib, NSS, ATK, CUPS, X11 or Wayland libraries, GBM, ALSA.
- **Linux sandbox:** Chromium sandboxes its renderers with user namespaces, or with
  `chrome-sandbox` when that file is owned by root with mode 4755. A tar file cannot make it so, and
  Ubuntu 23.10 and later deny user namespaces to programs without an AppArmor profile, so on those
  systems the window starts CEF without the sandbox (`no_sandbox`, decided at start in
  `crates/redrob-shell/src/cef/mod.rs`) instead of not starting. To get the sandbox back:
  `sudo chown root:root chrome-sandbox && sudo chmod 4755 chrome-sandbox` in the install folder.
  An update keeps a set-up `chrome-sandbox` when the new one is the same file.
- **macOS:** `Redrob Browser.app/Contents/Frameworks` holds `Chromium Embedded Framework.framework`
  (only its `en` and `ko` translations) and the helper apps CEF starts its processes from:
  `Redrob Browser Helper.app`, `Helper (GPU)`, `Helper (Renderer)`, `Helper (Plugin)` and
  `Helper (Alerts)`, each running the window binary (or `target/release/redrob-browser-helper`
  when the build has one) with its own `Info.plist` (`LSUIElement`) and entitlements: JIT for the
  plain, GPU and renderer helpers, JIT, unsigned executable memory and library validation off for
  the plugin helper, none for the alerts helper; the window has JIT, camera and microphone. The
  framework's libraries, the framework, every helper, the programs and the app are signed in that
  order with the hardened runtime, then the app and the dmg are notarized and stapled.
  `CREDITS.html` is in `Contents/Resources`.
- **Windows:** `libcef.dll` and every DLL, `.pak`, `.dat`, `.bin` and `.json` of the distribution
  sit beside the programs, with `locales\` (`en-US*`, `ko*`), `CREDITS.html` and
  `bundle-manifest.txt`. When the window is built as CEF's sandbox DLL
  (`target/release/redrob_browser_window.dll`), CEF's `bootstrap.exe` ships as
  `redrob-browser-window.exe` and loads it. The programs embed CEF's application manifest
  (`installer/windows/redrob-browser.exe.manifest`; Chromium needs Windows 10 declared). Every
  `.exe` and `.dll` without a valid signature, CEF's included, is signed before packaging; files
  that carry their vendor's signature (the Visual C++ runtime) keep it. The Visual C++ runtime DLLs
  are in the folder (our programs link them; a Windows without the redistributable has none). The
  job stops when any program or top-level DLL imports a DLL that is neither in the folder nor part
  of Windows, and when the window is not a GUI program (PE subsystem 2).
- **Licences:** `CREDITS.html` is Chromium's credits page from the distribution (every component,
  with its licence) plus entries for CEF, whose licence is copied from the distribution's own
  headers, and the `cef` crate (`scripts/cef-credits.py`). The About page opens it from
  `crate::bundle::credits_file()`: `<bundle>/CREDITS.html`, on macOS
  `Redrob Browser.app/Contents/Resources/CREDITS.html`. `NOTICE` names CEF and Chromium.

### Test the Linux package on this host

```
bash scripts/fetch-cef.sh "$HOME/.local/share/cef"
CEF_PATH="$HOME/.local/share/cef" bash scripts/package-linux.sh --build 0.1.0
```

`--build` runs the release job's `cargo build`; without it the script packages what is in
`target/release`. It needs `patchelf` (`PATCHELF=<path>` when it is not on `PATH`). Unpack the
archive into an empty folder and run `redrob-browser-window` from there with `LD_LIBRARY_PATH` and
`CEF_PATH` unset.

## Windows setup

`redrob-browser-windows-x64-<v>-setup.exe` is the branded per-user setup every Redrob app ships
(`installer/windows/`, ported from Redrob Launcher's), holding the whole folder above: a language page (English or 한국어), then
install with an optional desktop shortcut; no administrator rights. It installs to
`%LOCALAPPDATA%\Programs\Redrob Browser`, adds the Start menu shortcut to
`redrob-browser-window.exe`, a Settings > Apps entry and an uninstaller, and opens the browser. Over
a 0.1.x install it first removes that version's MSI. The browser starts in the language the setup
asked until the person picks another (`HKCU\Software\Redrob\Redrob Browser\Language`,
`crates/redrob-shell/src/i18n.rs`). Details: `installer/windows/README.md`.

The window is a GUI program, so it has no console. On Windows its standard error, its panics and
the engine's standard error go to `%LOCALAPPDATA%\redrob-browser\logs\window.log`, and when it
cannot start it says why in a message box (`crates/redrob-shell/src/startup.rs`).

## Secrets

- **macOS:** `APPLE_CODESIGN_CERT_P12_BASE64`, `APPLE_CODESIGN_CERT_PASSWORD`,
  `APPLE_NOTARY_API_KEY_P8_BASE64`, `APPLE_NOTARY_API_KEY_ID`, `APPLE_NOTARY_API_ISSUER_ID`.
  Without them (a fork) the app is signed ad hoc and the zip and dmg are still written.
- **Windows:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `ARTIFACT_SIGNING_ENDPOINT`, `ARTIFACT_SIGNING_ACCOUNT`, `ARTIFACT_SIGNING_CERT_PROFILE`.

## How a browser updates

Once a day the window asks GitHub for the latest release of this repository. When it is newer and
not a pre-release, the window shows a bar with the new version and the asset named for its
platform (`redrob-browser-<platform>-<version>...`), taken only from this repository's release
downloads (`crates/redrob-shell/src/updater.rs`).

**Update** fetches it and stages it (`crates/redrob-shell/src/self_update.rs`):

1. The window downloads `SHA256SUMS.txt`, which the org `release-publish.yml` writes over every
   asset (`sha256sum` lines, `<hex>  <file name>`), then streams the package into
   `<profile>/updates/`, hashing it on the way. A hash that differs from the release's line for
   that file name stops the update.
2. It unpacks the package beside the running copy and checks it, changing nothing yet:
   - **Linux** (`.tar.gz`) and **Windows** (`.zip`, the system `tar.exe`): into `.redrob-update`
     in the install folder; every file the package's `bundle-manifest.txt` lists must be there.
   - **macOS** (`.zip`, `ditto`): `Redrob Browser.app` next to the running bundle, checked with
     `codesign --verify --deep --strict`, which covers every file of the app, the framework and
     the helpers.
3. **Restart to update** saves the open tabs and closes the window. Once CEF has shut down and the
   engine stopped, the window swaps the bundles and starts the new window, which reopens the tabs.
   Swapping earlier would let the running browser start renderer or GPU processes from the new
   bundle, and on Windows its open `.pak` files cannot be moved.
   - **Linux and Windows:** every top-level entry of the new bundle, and every one the old bundle's
     manifest names, moves from the install folder into `.redrob-previous`, and the new entry
     moves into its place (`crates/redrob-shell/src/bundle.rs`). A folder that cannot move as a
     whole (on Windows, one holding a loaded DLL) is replaced file by file. Files that belong to
     neither bundle stay. When any move fails, every move already made is undone, so the folder
     holds the whole old bundle or the whole new one, and the old window starts again.
   - **macOS:** the running app becomes `Redrob Browser.app.old` and the new one takes its place;
     when the second rename fails the old app is put back.

Progress and errors show in the notice line under the toolbar. When the release has no checksums,
there is no profile, or the install folder cannot be written (a system package, a read-only
volume), the bar offers **Download** instead, which opens the package in a tab. There is no
separate update key: the checksum ties the download to the release, and the packages are signed
for the OS.

## Not yet

- macOS and Windows sizes, signing and notarization of the CEF bundle have not run yet: they need
  the release runners and the signing secrets (a `workflow_dispatch` dry run).
- H.264 and AAC: CEF's prebuilt binaries leave them out (`docs/CEF.md`).
