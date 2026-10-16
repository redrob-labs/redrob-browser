# Releasing

Two versions, and they are not interchangeable. `REDROB_VERSION` is what we shipped; `CHROMIUM_VERSION` is the
upstream release we are cut from, which is a security statement and moves on upstream's cadence whether we do
anything or not. `scripts/redrob.py version` prints both, deliberately, so a release note cannot quote one of
them and call it "the version".

## The gate

A tag is a claim that this tree can ship. Three things have to be true, and only the first two are cheap.

**1. The patch set applies to a clean checkout.** `redrob.py sync && redrob.py apply && redrob.py brand`.

**2. A cold full build passes.** Not an incremental one. Every build during a working session is incremental
against an existing `out/` directory, and siso keeps all of its state inside that directory, so a new output
directory is what makes a build genuinely cold. An incremental build passing says nothing about whether the
patch set compiles from nothing.

**3. The OFFICIAL build passes.** `redrob.py build --flavour release` — `is_official_build=true`, LTO and PGO.
This is not the same question as (2) and it is the one that gates shipping: `docs/BUILD.md` is explicit that a
dev build must not be benchmarked against Chrome, so a dev binary is not a release candidate no matter how
green it is.

## The PGO trap

`gn gen` on a release directory fails outright unless the PGO profile has been downloaded, and the profile is
opt-in:

    ERROR at //build/config/compiler/pgo/BUILD.gn:145:23: Script returned non-zero exit code.
    RuntimeError: requested profile "...profdata" doesn't exist, please make sure
    "checkout_pgo_profiles" is set to True in the "custom_vars" section of your .gclient file

`fetch chromium` writes a `.gclient` with an empty `custom_vars`, so this is the default state of every fresh
checkout. Nothing notices: dev builds work, the browser runs, tests pass, and the repo looks healthy for as long
as nobody asks for a shippable binary. `cmd_sync` now sets the flag itself, so a checkout made from scratch is
release-capable; an EXISTING checkout needs the flag added and `gclient runhooks` run once, which fetches about
86 MB compressed and lands a 327 MB profile.

This was found on the day of the first tag, by trying. It is the reason (3) is on this list as its own gate
rather than folded into (2).

## Turning the update channel on

The package configures apt for itself on install — that is how a browser gets automatic updates on Linux — and
two values have to exist before it will. Until both do, the guard in `apt.include` adds **no** source and says so,
which is the only safe default: no auto-update is a documented gap, whereas pointing a machine at a repository we
cannot verify is a defect.

**As of 2026-09-14 exactly one of the two is missing, and it is the key.** `.github/workflows/preflight.yml`
reports which org credentials this repository can see, and the answer is that the CDN triple is already there
while `REDROB_SIGNING_KEY` is not. Run that workflow rather than reasoning about it: org secrets are inherited
by name and `gh secret list --org` returns 403 without org-admin, so from outside the repository an inherited
secret and an absent one look identical — which is how this document came to describe a configured bucket as
missing.

**1. The public signing key**, which the package embeds and installs to `/usr/share/keyrings/redrob-browser.gpg`:

```
./scripts/update_signing_key.py branding/redrob-signing-key.asc
./scripts/redrob.py export
```

The PUBLIC half only, and the script refuses a private key rather than trusting the filename. It must be the key
that signs the repository — `build_repo.py` signs with `REDROB_SIGNING_KEY`, so they are two halves of one pair,
and a mismatch shows up as apt rejecting the repository for a bad signature.

**2. The bucket**, so `cdn.redrob.ai/browser/apt` answers: `REDROB_CDN_BUCKET` plus the two credential secrets.
**Already configured** — `vars.REDROB_CDN_BUCKET`, `secrets.REDROB_CDN_ACCESS_KEY_ID` and
`secrets.REDROB_CDN_SECRET_ACCESS_KEY` are org values that `redrob-design/cdn.yml` and
`redrob-office/release-office-cdn.yml` already consume, `release.yml` here consumes the same three names, and
preflight confirms all three reach this repository. Nothing to do for this half.

The URL is already wired. Both `REPOCONFIG` and the deb822 `URIs:` field come from one string,
`InstallerConfig.REDROB_REPO_BASE` — they were two independent hardcodings of Chrome's URL, and fixing only the
one named `REPOCONFIG` left the `.sources` file apt actually reads still pointing at `dl.google.com`.

## The signing key

`redrob.py repo` builds a signed apt repository from `out/artifacts`, and the key is the one thing this
repository must never contain. A signing key in a git repo is not a signing key, it is a published secret — the
entire value of the signature is that only the publisher can produce it.

The key reaches the tooling at run time, two ways:

- `REDROB_SIGNING_KEY` — the ASCII-armoured private key. It is imported through stdin into a **throwaway
  GNUPGHOME** under a temporary directory, never written to a file and never passed as an argument (a key on the
  command line is in the process table for every other user on the machine). The temporary keyring dies with the
  run, so a CI job does not leave a private key behind for the next job on that runner.
- `REDROB_SIGNING_KEY_ID` — a key already in the host's keyring, named by id. For a machine where the key lives
  in an HSM or an agent and never exists as a file at all.

In CI it is `secrets.REDROB_SIGNING_KEY`, and the repository step is skipped when that secret is absent. It does
**not** fall back to an unsigned repository: that would publish an update channel where every future update is
whatever the network hands the user, and the workflow would look green while doing it. `--unsigned` exists for
local testing and says so loudly.

What is printed is the fingerprint, never the key. The fingerprint is public by definition — it is what a user
pins in `/etc/apt/keyrings` — and it is the one thing about the key that belongs in a log.

Verified end to end with a throwaway key and a synthetic package, not by inspection: both `InRelease` and
`Release.gpg` produce a good signature, every index file's SHA256 and size match what `Release` claims, and the
`Filename` in `Packages` is repository-relative and resolves into `pool/`.

## What a release's assets are called

Every asset on the GitHub release carries ONE name shape, Redrob Launcher's:
`redrob-browser-<version>-<os>-<arch><suffix>` (redrob-launcher `crates/core/src/platform.rs`,
`parse_asset_name`). The other names the pipeline needs live off the release — the Debian name in `out/deb` and
the apt `pool/`, the CDN's own spelling in `out/cdn` and on cdn.redrob.ai:

| asset | GitHub release | elsewhere | who reads it |
| --- | --- | --- | --- |
| Linux package | `redrob-browser-<ver>-linux-x86_64.deb` | `redrob-browser-stable_<ver>+<chromium>-1_amd64.deb` in `out/deb` and apt `pool/`; `redrob-browser-amd64-<ver>.deb` on the CDN | **Redrob Launcher**; `build_repo.py`; `cdn-publish.sh` |
| macOS app (unsigned, draft only) | `redrob-browser-<ver>-macos-arm64.app.zip`, `redrob-browser-<ver>-macos-arm64-packaging.zip` | — | `sign-and-publish.yml` |
| macOS app (signed) | `redrob-browser-<ver>-macos-arm64.zip` | `redrob-browser-macos-arm64-<ver>.zip` on the CDN | Sparkle appcast, `cdn-publish.sh` |
| macOS app (signed) | `redrob-browser-<ver>-macos-arm64.dmg` | — | **Redrob Launcher** |
| Windows installer | `redrob-browser-<ver>-windows-x64-setup.exe` | `redrob-browser-x64-<ver>-setup.exe` on the CDN | the signed installer, `cdn-publish.sh` |
| Windows portable | `redrob-browser-<ver>-windows-x64-portable.zip` | — | **Redrob Launcher** |

Releases up to 0.1.8 were published under the packager's names (`redrob-browser-x64-0.1.8-setup.exe`,
`redrob-browser-macos-arm64-0.1.8.zip`, the Debian name); 0.1.8's assets were renamed in place to the shape
above, and the CDN keeps its names so no `latest/` link moved.

Redrob Launcher installs an asset only when its name reads `<stem>-<version>-<os>-<arch>[-portable].<ext>` with its
own tokens — `linux-x86_64`, `macos-arm64`, `windows-x64`, never `amd64`, `x64` on Linux, or a Chromium suffix on
the version —
and only in a format it opens: `.deb` on Linux, `.dmg` on macOS, `.msi` or `-portable.zip` on Windows. A
`-setup.exe` is not one of them, which is why the portable zip exists: `redrob.py package --flavour win_cross`
re-containers the installer's own `chrome.7z` (the unpacked application, `chrome.exe` at the top) and adds a
`redrob-browser.exe` copy of the stub the launcher looks for. The `.dmg` is made in `sign-and-publish.yml` from the
signed, notarized app, because only the mac runner has `hdiutil`.

`scripts/check_asset_names.py` is the parser transliterated from `redrob-launcher/crates/core/src/platform.rs`,
and it runs three times: as a self-test in `checks.yml`, over `out/artifacts` at the end of every `package`, and
over the exact file set about to be published in `sign-and-publish.yml`'s `cdn` job, before anything is public. A
platform that ships without a launcher-readable name fails the release there. `redrob-launcher.json` (the one-line
manifest `{ "schema": 1, "sharedAccount": true }`, see redrob-launcher's `docs/release-manifest.md`) and
`SHA256SUMS.txt` are written by the organisation's shared publish job (`redrob-labs/.github` `release-publish.yml`,
called with `launcher_manifest: true`) beside the assets, so Redrob Launcher learns on its own that the release
reads the launcher's shared account file.

## Steps

The build happens on a workstation, and only the artefacts travel. That is not a workaround — no runner carrying
`self-hosted, linux, x64, chromium-build` is registered, and all four release runs to date queued unclaimed and
were cancelled by GitHub at 24h, while every published `.deb` was built locally and uploaded by hand. So
`release.yml` no longer fires on a tag (it is dispatch-only, for the day such a machine exists) and these steps
are the live path.

1. `redrob.py version` — confirm both numbers are what you mean to ship.
2. Update `CHANGELOG.md`: move the version's section out of "unreleased" and date it.
3. Run gate (2) into a fresh output directory, and gate (3).
4. Launch the release binary once and drive it. A binary that links is not a binary that starts.
5. `redrob.py package --flavour release` — collects the `.deb` under `out/artifacts` (as
   `redrob-browser-<ver>-linux-x86_64.deb`, the release name), `out/deb` (Debian name) and `out/cdn` (CDN name).
   This is the step that needs `devscripts` on the host, for `debchange`.
6. Tag annotated, `v<REDROB_VERSION>`, with the Chromium tag in the message.
7. Push the tag only after (3) has passed. Moving a published tag is worse than tagging late.
8. `gh release create "v$(cat REDROB_VERSION)" out/artifacts/* --draft --title "Redrob Browser $(cat
   REDROB_VERSION)"` — a DRAFT, because nothing unsigned should be visible to a user.
9. Dispatch `sign-and-publish.yml` with `tag=v<version>`. It signs what the draft carries, verifies every
   signature, publishes to the CDN, then hands the signed set to the shared `release-publish.yml`, which
   replaces the draft's assets with it (the unsigned `.app.zip`, the mac packaging kit and the unsigned
   installer leave the release), adds `SHA256SUMS.txt` and `redrob-launcher.json`, and publishes the release
   as latest — the tag stays on the commit the draft was created against. On a Linux-only release there is
   nothing to sign and the job says so — the `.deb`'s integrity is the apt repository's signature, which is a
   separate key and a separate decision. `dry_run=true` stops after signing: the signed files are kept as
   workflow artifacts (`release-macos`, `release-windows`) and neither the release nor the CDN changes, which
   is how the signing jobs are exercised against a draft without publishing it. Because the publish job
   replaces the draft's assets, a second run against the same tag needs the unsigned inputs uploaded again.

## What this repo cannot do yet

- **The CDN is not provisioned from here.** `publish-cdn` uploads to `cdn.redrob.ai/browser/` using the same
  `REDROB_CDN_BUCKET` variable and `REDROB_CDN_ACCESS_KEY_ID` / `REDROB_CDN_SECRET_ACCESS_KEY` secrets as every
  other product in the organisation, and both publish scripts exit 0 with a notice when they are absent — an
  unprovisioned CDN must not redden a release. Setting them is an org decision, not code.
- **No `.rpm`.** Upstream's combined `:stable` target needs rpm tooling on the host, which this build
  deliberately does not install; `package` targets `:stable_deb` alone.
- **Linux only.** macOS needs `Assets.car` and `AppIcon.icon`, which need `actool` on a mac host; the Windows
  and macOS font registration paths are stubs that log their own absence by name. The other platforms therefore
  have no download and no update channel.

## Publishing

Two things go to `cdn.redrob.ai/browser/`, and they are published by different scripts because they are different
shapes.

**The download** goes through `.github/scripts/cdn-publish.sh`, copied verbatim from redrob-design. Same host,
same variables, same versioned-then-aliased ordering: the immutable copy at
`browser/<version>/redrob-browser-amd64-<version>.deb` is read back through CloudFront and checksum-compared
before the alias at `browser/latest/redrob-browser-amd64.deb` moves. A page links the alias.

This is why `redrob.py package` writes the same package under three names. `out/deb` keeps the Debian name,
because that is the convention inside a repository's `pool/` (`build_repo.py` reads it there); `out/cdn` holds
`redrob-browser-amd64-<version>.deb`, because the publish script derives the alias by deleting a `-<version>`
segment and a Debian filename separates its fields with underscores, so it has none and the script correctly
refuses it; `out/artifacts` holds `redrob-browser-<version>-linux-x86_64.deb`, the release's name. When the
`.deb` arrives from the release instead (`sign-and-publish.yml`), the Debian name is read back out of the
package's control file with `dpkg-deb -f` for the pool.

**The apt repository** goes through `.github/scripts/cdn-publish-apt.sh`, which cannot use the same model: a
user's `sources.list` names one URL forever, so the tree lands at the fixed `browser/apt/` prefix. `pool/` is
immutable — a Debian filename carries its version, so those bytes never change — and `dists/` is short-cached,
because every release rewrites `Packages`, `Release`, `InRelease` and `Release.gpg`, and a client that cached
those for a year would never see another update. `pool/` is uploaded first: `Release` promises checksums for an
index that promises checksums for the packages, so publishing the indexes first would leave a window where apt
reports a hash mismatch rather than a missing file.

A user adds the channel with:

```
curl -fsSL https://cdn.redrob.ai/browser/apt/redrob-signing-key.asc \
  | sudo tee /etc/apt/keyrings/redrob.asc >/dev/null
echo "deb [signed-by=/etc/apt/keyrings/redrob.asc] https://cdn.redrob.ai/browser/apt stable main" \
  | sudo tee /etc/apt/sources.list.d/redrob.list
```
