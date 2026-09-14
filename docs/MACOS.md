# macOS

No macOS build of this fork has ever existed. This is what stands between here and one, in the order the blockers
actually bite — written from an audit of our own patches on a Linux host, so everything below is either a fact
about the code or a number measured on Linux, and nothing is a guess about how a mac will behave.

## Measured: the first hosted run, and disk was the wall

Run 34809642148 on `macos-15`, 2026-09-14. It failed in `sync` after **35 minutes**, cloning `chromium/src`:

```
fatal: write error: No space left on device
fatal: fetch-pack: invalid index-pack output
```

The runner:

| | |
|---|---|
| macOS | 15.7.9, Xcode 16.4 |
| RAM | **7.0 GB** |
| disk available | **37 GiB** (`df -h /`: 320Gi size, 10Gi used) |

A Chromium checkout is around 50 GB before a single object is compiled, so 37 GiB cannot hold it. This is the
one prediction in this repository's docs that turned out **right** — `docs/WINDOWS.md` guessed the same thing
about the Windows runner and was wrong there, where 185 GiB is free and RAM is the constraint instead. The two
platforms fail for opposite reasons, which is why both now carry measurements rather than expectations.

What the run does establish, because these steps passed before the disk ran out:

- the **Apple credential check passes** — all five secrets reach this repository and the `AuthKey.p8` is written
- `depot_tools` **bootstraps on macOS**
- `check_repo.py` runs clean on macOS, so the encoding fixes made for Windows hold here too

Everything from `build` onward is still unanswered, including whether the CoreText registration compiles and
whether `sign_chrome.py` accepts the arguments the workflow passes it. A self-hosted mac with ≥200 GB free is
what answers those.

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

## 4. Signing and notarization — WIRED, never run

Not needed to answer "does it launch", needed before anyone else can run it: unsigned and unnotarized, Gatekeeper
refuses a downloaded `.app` outright.

The organisation already does this elsewhere. `redrob-design` uses `APPLE_CODESIGN_CERT_P12_BASE64` and
`APPLE_CODESIGN_CERT_PASSWORD`; the browser repo's own Firefox-era workflow uses
`macOS_CERTIFICATES_P12_For_App_BASE64`, `macOS_CERTIFICATES_P12_PASSWORD` and `macOS_PROVISIONING_PROFILE`. Pick
one set rather than inventing a third — the CDN publish script was copied verbatim for exactly this reason.

**As of 2026-09-14 `macos.yml` does this.** `.github/workflows/preflight.yml` confirmed all five names reach this
repository, so the remaining work was wiring, not procurement. The workflow:

1. Checks the five secrets **first**, before the hours-long build, so a missing credential costs ten seconds
   rather than four hours. That loop is copied from `redrob-design`'s own step of the same name.
2. Imports the `.p12` into a throwaway keychain and adds it to the user keychain **search list**. The search list
   is the part that matters: `sign_chrome.py` has no `--keychain` flag (its whole accepted set is `--channel`,
   `--development`, `--disable-packaging`, `--embed-development-provisioning-profile`, `--identity`, `--input`,
   `--installer-identity`, `--notarize`, `--output`, `--skip-brand`), so `codesign` finds the identity only
   through that list. `security set-key-partition-list` is the other easily-omitted step — without it `codesign`
   prompts for keychain access, and on a runner with no UI a prompt is a hang rather than an error.
3. Signs with **upstream's own `chrome/installer/mac/sign_chrome.py`**, not a hand-rolled `codesign`. Chromium's
   bundle has to be signed inside-out — helpers, then the framework's versioned directory, then the app — with
   per-part entitlements, and the signing module already encodes that order. Getting the order wrong produces a
   bundle `codesign` accepts and Gatekeeper rejects. Same reasoning as using
   `chrome/installer/linux:stable_deb` for the `.deb`.
4. Notarizes and staples via `--notarize staple`, passing the API key through repeated `--notary-arg` flags, which
   the driver hands straight to `xcrun notarytool`.
5. Verifies with **three** checks, the same three `redrob-design` runs: `codesign --verify --deep --strict` says
   the bundle is signed, `xcrun stapler validate` says the ticket is actually attached, and `spctl --assess` says
   the machine would run it. A signing step that silently no-ops passes the first and fails the third.
6. Deletes the keychain and the key file in an `always()` step.

`--disable-packaging` is deliberate: a DMG additionally needs `pkg-dmg` and `universalizer`, and the question this
run answers is whether the fork can be signed and notarized at all. The DMG is the next question.

The signing steps are gated on a `sign` input, defaulting true, so the build can still be exercised alone when
the interesting failure is the compile.

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
