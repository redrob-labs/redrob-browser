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
| Windows x64 | `redrob-browser-windows-x64-<v>.zip` and `.msi` | Authenticode through Azure Artifact Signing (org action): the programs before packaging, the MSI after |
| publish | GitHub release, checksums, launcher manifest | org `release-publish.yml` |

Every package plays video (the `media` feature, `docs/MEDIA.md`).

## GStreamer in the packages

- **Linux:** built against the distribution's GStreamer (`libgstreamer1.0-dev`); the person
  installs the runtime and plugins from their distribution.
- **macOS:** the job installs the official GStreamer framework (`GSTREAMER_VERSION` in
  `release.yml`, both `.pkg` files pinned by SHA-256). `package-macos.sh` copies its runtime to
  `Redrob Browser.app/Contents/Frameworks/GStreamer.framework` (no headers, static libraries or
  x86_64 halves), rewrites every load path and rpath that pointed at
  `/Library/Frameworks/GStreamer.framework` with `install_name_tool`, and stops if one is left.
  Every binary inside is signed before the framework, the framework before the programs, the
  programs before the app. The window and the plugin scanner carry the JIT entitlements that
  GStreamer's ORC needs under the hardened runtime.
- **Windows:** the job installs the official MSVC runtime and development MSIs (`ADDLOCAL=ALL`,
  pinned by SHA-256). The package folder holds the programs with GStreamer's DLLs beside them,
  the plugins in `lib\gstreamer-1.0`, GIO's TLS module in `lib\gio\modules` and the plugin
  scanner in `libexec\gstreamer-1.0`.
- At run time the window points GStreamer at a bundled runtime when the package carries one
  (`use_bundled_runtime` in `crates/redrob-shell/src/media.rs`); variables already set in the
  environment win.

To move to a newer GStreamer, change `GSTREAMER_VERSION` and the four SHA-256 values in
`release.yml` (each file has a `.sha256sum` beside it on gstreamer.freedesktop.org).

## Windows installer

`installer/windows/redrob-browser.wxs` (WiX v4, `wix` 4.0.6 installed as a dotnet tool in the job)
is a per-user MSI: it needs no administrator rights, installs to
`%LOCALAPPDATA%\Programs\Redrob Browser`, and adds a **Redrob Browser** Start menu shortcut to
`redrob-browser-window.exe`. `installer/windows/payload.ps1` lists the package folder into the
`Payload` component group, one component per folder, with ids and GUIDs derived from the path.
The `UpgradeCode` (`3E1D3581-4920-4530-BD81-BA7B0926E403`) never changes, so a newer MSI replaces
the installed one. MSI versions are numbers only: a `-rc.1` suffix is dropped from the MSI's own
version but kept in the file name.

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

**Update** installs it in place (`crates/redrob-shell/src/self_update.rs`):

1. The window downloads `SHA256SUMS.txt`, which the org `release-publish.yml` writes over every
   asset (`sha256sum` lines, `<hex>  <file name>`), then streams the package into
   `<profile>/updates/`, hashing it on the way. A hash that differs from the release's line for
   that file name stops the update.
2. It installs next to the running copy:
   - **Linux** (`.tar.gz`): unpacks into a hidden folder beside the binaries and renames
     `redrob-browser`, `redrob-browser-worker` and `redrob-browser-window` over the old ones. Each
     old file stays as `<name>.old`.
   - **macOS** (`.zip`): unpacks `Redrob Browser.app` with `ditto` beside the running bundle, checks
     it with `codesign --verify --deep --strict`, then swaps the bundles. The old one stays as
     `Redrob Browser.app.old`.
   - **Windows** (`.zip`): unpacks with the system `tar.exe`, renames the running `.exe` files to
     `.exe.old` and moves the new ones in.

   A failed rename puts back the files already replaced.
3. **Restart to update** saves the open tabs, closes the window, waits for the engine to stop and
   starts the new window binary, which reopens the tabs.

Progress and errors show in the notice line under the toolbar. When the release has no checksums,
there is no profile, or the install folder cannot be written (a system package, a read-only
volume), the bar offers **Download** instead, which opens the package in a tab. There is no
separate update key: the checksum ties the download to the release, and the packages are signed
for the OS.

## Not yet

- Video on Linux without the distribution's GStreamer plugins installed.
