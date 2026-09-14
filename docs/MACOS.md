# macOS

No macOS build of this fork has ever existed. This is what stands between here and one, in the order the blockers
actually bite — written from an audit of our own patches on a Linux host, so everything below is either a fact
about the code or a number measured on Linux, and nothing is a guess about how a mac will behave.

## 1. A machine, and which kind

The Linux **release** build measured a **19.9 GB peak RSS** across the LTO link. A GitHub-hosted macOS runner has
14 GB. So a release-flavour mac build is killed by the linker, not by anything worth debugging.

The Linux **dev** build peaked at **7.1 GB** and fits comfortably. That is why `build/args/mac.gn` is the dev
shape: it makes the first question — does this compile and launch — answerable on hardware that exists today.

Disk is the open risk. The checkout is ~50 GB before a build and `out/` was 12 GB on Linux for the dev flavour.
`.github/workflows/macos.yml` prints `df -h` and the RAM before it does anything, so a run that dies on space says
so instead of looking like a compile failure.

A shipped mac build needs a self-hosted mac, for the same reason the Linux release build needs a self-hosted
Linux box. See `docs/RUNNER.md`.

## 2. Two font blockers, and only one of them is the obvious one

**The registration** was a stub that logged its own absence. It is now written —
`CTFontManagerRegisterFontsForURL` at `kCTFontManagerScopeProcess`, so the face is available to us and not to
every other application the user is running until they log out — and it **has never been compiled**. The first CI
run on a mac is its first compile. Treat a failure there as expected work.

**The file would not have been found even so**, which is the blocker the registration alone does not fix.
`copy("ui_font")` puts the TTF in `$root_out_dir/fonts/`, and on macOS `DIR_MODULE` for the browser process is the
versioned framework directory inside the `.app` — a file in the build root is outside the bundle the running
binary can see, and it does not get shipped either. It now travels as `bundle_data` into the framework's
`Resources/fonts`, and `UiFontPath()` resolves there on macOS.

A `bundle_data` that no bundle depends on **builds green and copies nothing**, so the framework's `bundle_deps`
carries it explicitly and the workflow asserts the file is in the `.app` before it launches anything. That check
exists because the failure it catches looks exactly like success.

## 3. The app icon needs a mac to produce

`Assets.car` and `AppIcon.icon` are compiled by `actool`, which ships with Xcode and has no Linux equivalent. The
artwork exists — `branding/icons/mac/` — and turning it into the bundle's icon has to happen on the machine that
builds. Until it does, the `.app` carries Chromium's icon, which is the same class of defect as the 32px Linux
logo that shipped in 0.1.0: cosmetic to describe, and it is the first thing anyone sees.

## 4. Signing and notarization are org secrets, and the names already exist

Not needed to answer "does it launch", needed before anyone else can run it: unsigned and unnotarized, Gatekeeper
refuses a downloaded `.app` outright.

The organisation already does this elsewhere. `redrob-design` uses `APPLE_CODESIGN_CERT_P12_BASE64` and
`APPLE_CODESIGN_CERT_PASSWORD`; the browser repo's own Firefox-era workflow uses
`macOS_CERTIFICATES_P12_For_App_BASE64`, `macOS_CERTIFICATES_P12_PASSWORD` and `macOS_PROVISIONING_PROFILE`. Pick
one set rather than inventing a third — the CDN publish script was copied verbatim for exactly this reason.

## What does not transfer from the existing macOS CI

The browser repo already has `macos-release-build.yml`, and it runs on **ubuntu**. That is a Firefox
cross-compile, which Firefox supports and **Chromium does not**: there is no cross-compiling a mac Chromium from
Linux. Only `macos-universal-release-build.yml`, which runs on a real `macos-26`, describes a shape this fork can
follow — and the universal part of it is a `lipo` of two complete builds, so it doubles a wall clock that has not
been measured once yet.

## The order to do this in

1. Run `.github/workflows/macos.yml` manually and read the failures. Everything above item 2 is theory until then.
2. Fix what the first compile finds. The font code is the likely candidate; it is 20 lines and has never been
   through a compiler.
3. `actool` the icon, on the runner, once a build exists to put it in.
4. Signing and notarization, with whichever secret names the org settles on.
5. Only then a release flavour, and only on a self-hosted mac.
