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

## Steps

1. `redrob.py version` — confirm both numbers are what you mean to ship.
2. Update `CHANGELOG.md`: move the version's section out of "unreleased" and date it.
3. Run gate (2) into a fresh output directory, and gate (3).
4. Launch the release binary once and drive it. A binary that links is not a binary that starts.
5. Tag annotated, `v<REDROB_VERSION>`, with the Chromium tag in the message.
6. Push the tag only after (3) has passed. Moving a published tag is worse than tagging late.

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

This is why `redrob.py package` writes the same package under two names. `out/artifacts` keeps the Debian name,
because that is the convention inside a repository's `pool/`; `out/cdn` holds
`redrob-browser-amd64-<version>.deb`, because the publish script derives the alias by deleting a `-<version>`
segment and a Debian filename separates its fields with underscores, so it has none and the script correctly
refuses it.

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
