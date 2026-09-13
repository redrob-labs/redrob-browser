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

## Steps

1. `redrob.py version` — confirm both numbers are what you mean to ship.
2. Update `CHANGELOG.md`: move the version's section out of "unreleased" and date it.
3. Run gate (2) into a fresh output directory, and gate (3).
4. Launch the release binary once and drive it. A binary that links is not a binary that starts.
5. Tag annotated, `v<REDROB_VERSION>`, with the Chromium tag in the message.
6. Push the tag only after (3) has passed. Moving a published tag is worse than tagging late.

## What this repo cannot do yet

- **No packaging.** `redrob.py` builds and runs; nothing produces a `.deb`, a tarball, or an installer. A
  release today is a source tag plus a binary someone built, not an artifact a user can install.
- **Linux only.** macOS needs `Assets.car` and `AppIcon.icon`, which need `actool` on a mac host; the Windows
  and macOS font registration paths are stubs that log their own absence by name.
- **No signing or update channel**, which follow from having no packaging.
