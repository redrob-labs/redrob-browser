# Releasing

Version: `[workspace.package] version` in `Cargo.toml` (0.1.0 for the first release of this
browser; every earlier Redrob Browser release was removed with the Chromium tree).

1. Merge `develop` into `main` through a release pull request.
2. Tag `v<version>` on `main`. `.github/workflows/release.yml` checks the tag against
   `Cargo.toml`, then builds, signs and publishes.

| Job | Output | Signing |
|---|---|---|
| Linux x64 | `redrob-browser-linux-x64-<v>.tar.gz`, built with video (GStreamer) | none |
| macOS arm64 | `redrob-browser-macos-arm64-<v>.zip` with `Redrob Browser.app` | Developer ID, notarized and stapled (`scripts/package-macos.sh`) |
| Windows x64 | `redrob-browser-windows-x64-<v>.zip` | Authenticode through Azure Artifact Signing (org action) |
| publish | GitHub release, checksums, launcher manifest | org `release-publish.yml` |

## Secrets

- **macOS:** `APPLE_CODESIGN_CERT_P12_BASE64`, `APPLE_CODESIGN_CERT_PASSWORD`,
  `APPLE_NOTARY_API_KEY_P8_BASE64`, `APPLE_NOTARY_API_KEY_ID`, `APPLE_NOTARY_API_ISSUER_ID`.
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

## Not in 0.1.0

- Video on macOS and Windows: those packages build without the `media` feature until the
  GStreamer runtime is bundled.
- Installers (`.dmg`, `.msi`), Linux arm64.
