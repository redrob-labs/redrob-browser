# The self-hosted build runner

`.github/workflows/release.yml` asks for `[self-hosted, linux, x64, chromium-build]`. This is what a machine has
to be before that label is honest.

It is self-hosted for two independent reasons, and either alone would be enough. The official build measured
**13 GB of output and 3.5+ hours** on 16 cores for the cold dev flavour, and the release flavour adds LTO and PGO
on top of that — against a GitHub-hosted runner's 14 GB of disk and 6-hour job ceiling. And the packaging step
needs `debchange`, which is not on a hosted image and cannot be installed by a workflow step, because *this build
installs no system packages by design* (`docs/BUILD.md`).

## Hardware

| | Minimum | Comfortable | Why |
|---|---|---|---|
| Disk | 200 GB free | 400 GB | The checkout is ~50 GB before any build. `out/release` measured 13 GB, and a second output directory for a cold-build gate doubles that. `git gc` on the Chromium checkout needs headroom of its own. |
| RAM | 16 GB | 32 GB+ | The cold build's peak RSS measured **7.1 GB** with 27 concurrent clang processes. Linking is the spike, not compiling. |
| Cores | 8 | 16+ | The 3h33m figure is on 16 cores at 1588% CPU. Halve the cores and expect to roughly double the wall clock. |
| Network | — | — | The sync pulls tens of GB, and `checkout_pgo_profiles` adds an 86 MB download that unpacks to 327 MB. |

## Host packages

Two groups, and they are not the same kind of dependency.

**depot_tools and the build** need only what upstream's own script installs. Run Chromium's
`build/install-build-deps.sh` once, from the checkout, and let it decide — hand-picking the list is how a build
breaks three Chromium rolls later. Everything else the build needs comes from the checkout's own sysroot, which
is why `use_sysroot = true` is set and why this repo installs nothing else.

**Packaging** needs three host binaries that the build does not:

```
devscripts     # provides debchange -- the one that fails the packaging step by its absence
dpkg-dev       # provides dpkg-deb
fakeroot
```

`redrob.py package` pre-flights all three and names the missing one, so a runner that is wrong fails in the
first second of that step rather than forty seconds into a ninja action.

RPM is deliberately not supported. `chrome/installer/linux:stable` builds both packages and dies on
`/usr/lib/rpm/find-requires`; `redrob.py package` targets `:stable_deb` alone. Adding rpm means `rpm-build` on
the runner and re-testing the whole path, and nobody has asked for one.

## Runner setup

```bash
# As a normal user, not root. The build refuses to run as root and it is right to.
mkdir -p ~/actions-runner && cd ~/actions-runner
curl -o actions-runner-linux-x64.tar.gz -L \
  https://github.com/actions/runner/releases/latest/download/actions-runner-linux-x64.tar.gz
tar xzf actions-runner-linux-x64.tar.gz

# The token comes from the repo's Settings -> Actions -> Runners -> New self-hosted runner. It is
# short-lived; do not put it in a script or a file.
./config.sh --url https://github.com/redrob-labs/redrob-browser \
            --labels self-hosted,linux,x64,chromium-build

sudo ./svc.sh install "$USER"
sudo ./svc.sh start
```

The `chromium-build` label is what makes the pairing explicit. `self-hosted,linux,x64` would also match a small
utility runner someone adds later for something else, and that runner would accept an eight-hour Chromium build
and fill its disk.

## Xvfb

The release workflow launches the built binary once, because a binary that links is not a binary that starts.
That needs an X server on a headless host:

```
xvfb        # provides Xvfb
```

The workflow starts and kills its own `Xvfb :99`. If the runner is a container, it also needs
`--enable-unsafe-swiftshader` to survive with no GPU — which the workflow already passes.

## What this runner must NOT be

- **Not shared with anything latency-sensitive.** A release build saturates every core for hours.
- **Not a container without a persistent volume for the checkout.** A fresh 50 GB sync per run turns an
  eight-hour job into a longer one for no benefit.
- **Not reachable by untrusted pull requests.** A self-hosted runner executes the workflow's code, so a fork's PR
  running on it would be arbitrary code execution on your build machine. `release.yml` triggers on tag pushes and
  manual dispatch only, never on `pull_request`, and that is a security boundary rather than a convenience —
  leave it that way. `checks.yml` is the one that runs on PRs, and it runs on hosted runners for the same reason.
