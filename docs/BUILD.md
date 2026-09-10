# Building

## What the host needs

Only `git`, `python3` and disk. Everything else is fetched into this directory: `depot_tools` brings its
own clang, gn and ninja, and `gclient runhooks` installs Chromium's own Debian sysroot, which is what
supplies the C libraries. **No system packages are installed** -- that is a hard constraint on the build
host, and it is why `use_sysroot = true` is in every args file rather than being a choice.

Upstream's `build/install-build-deps.sh` is the usual instruction and is deliberately not used. If a
build fails on a missing host library, extract the official package into a user-home sysroot and wire it
in with `PKG_CONFIG_PATH` / include / lib paths, the same way the previous fork's X11 dependencies were
handled. Do not reach for the system package manager.

## Measured on this host (16 cores, 61 GB RAM)

| Step | Disk | Wall clock |
|---|---|---|
| `sync` (fetch + history + hooks) | ~40-60 GB | 40-80 min |
| `build --flavour dev` | +30-50 GB | 2-4 h |
| `build --flavour release` | +40-60 GB | 4-8 h (LTO, PGO) |

Budget ~150 GB free before starting. A `sync` that runs out of disk halfway leaves a checkout that has
to be thrown away rather than resumed.

## Flavours

`dev` for the first build and for iteration; `release` is the official build with LTO and PGO and is
what a shipped binary must be built with. Do not benchmark a `dev` build against Chrome -- the gap is
the build flags, not the fork.

## Two licensing questions the build flags imply

Both are decisions before they are flags, and both matter for the banking and public-sector story:

- **Widevine.** `enable_widevine` is not enough: the CDM is licensed per distributor. Without a
  Widevine agreement the fork plays no DRM video, which is a visible product gap rather than a build
  failure.
- **Proprietary codecs.** `proprietary_codecs = true` with `ffmpeg_branding = "Chrome"` is what makes
  H.264 and AAC work, and it carries patent obligations that Google's own builds cover for Chrome and
  not for us. Ship it knowingly.

## Security cadence, which replaces the rebase treadmill

Chromium ships a stable release roughly every four weeks and security fixes between them. A fork that
does not follow that cadence is shipping known vulnerabilities: the pin in `CHROMIUM_VERSION` is a
maintenance commitment, not a snapshot. The mitigation is the same as before -- keep the delta small and
out of files upstream churns, so moving the pin is a mechanical `sync` + `apply` rather than a project.
