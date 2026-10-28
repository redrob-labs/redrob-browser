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
| updates | `latest.json` and `latest.json.sig` on `https://cdn.redrob.ai/browser/` | Ed25519 |

## Keys, reused

- **Update key:** the Ed25519 key the Chromium-based browser signed its Sparkle feed with.
  Private half: repository secret `SPARKLE_ED_PRIVATE_KEY` (base64 of the 32-byte seed). Public
  half: `5lWrkUbHu7MqrCIW4bmFzx1KUoIqx8ugydJSAcAZXlQ=`, built into `updater.rs`.
  `scripts/write_update_manifest.py` refuses any other key.
- **macOS:** `APPLE_CODESIGN_CERT_P12_BASE64`, `APPLE_CODESIGN_CERT_PASSWORD`,
  `APPLE_NOTARY_API_KEY_P8_BASE64`, `APPLE_NOTARY_API_KEY_ID`, `APPLE_NOTARY_API_ISSUER_ID`.
- **Windows:** `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`,
  `ARTIFACT_SIGNING_ENDPOINT`, `ARTIFACT_SIGNING_ACCOUNT`, `ARTIFACT_SIGNING_CERT_PROFILE`.
- **CDN:** `REDROB_CDN_ACCESS_KEY_ID`, `REDROB_CDN_SECRET_ACCESS_KEY`, variables
  `REDROB_CDN_BUCKET`, `REDROB_CDN_DISTRIBUTION_ID`.

## How a browser updates

Once a day the window reads `latest.json` and its signature, verifies it against the built-in
public key, and when the version is newer offers the download for its platform. It does not yet
replace itself; the person installs the downloaded package.

## Not in 0.1.0

- Video on macOS and Windows: those packages build without the `media` feature until the
  GStreamer runtime is bundled.
- Installers (`.dmg`, `.msi`), Linux arm64, in-place self-update.
