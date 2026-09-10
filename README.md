# Redrob Browser (Chromium base)

An AI-native browser built as a **patch-based fork of Chromium**. This branch starts from nothing on
purpose: the previous base was a Zen/Firefox fork, and Korean banking and public-sector sites depend on
Chrome extensions and native messaging rather than on rendering, which is a dependency only a real
Chromium browser satisfies.

## What is ours

```
CHROMIUM_VERSION    the release we build, and the only place it is written down
patches/            our delta against that release, one patch per file it touches
build/args/         gn args per build flavour
scripts/redrob.py   the whole fork workflow: bootstrap, sync, apply, build, run, export
```

The Chromium checkout is **fetched, never committed**. That is the lesson from the last fork: a tree with
258 patches buried in it could not answer "what do we own" without counting files. Here `ls patches/`
is the answer.

## Getting to a build

```sh
./scripts/redrob.py bootstrap     # depot_tools into ./depot_tools (once)
./scripts/redrob.py sync          # fetch Chromium at CHROMIUM_VERSION, run its hooks
./scripts/redrob.py apply         # apply patches/ (a no-op while the set is empty)
./scripts/redrob.py build         # gn gen + autoninja, dev flavour
./scripts/redrob.py run           # launch it with a scratch profile
```

Expect tens of gigabytes and hours, not minutes. `docs/BUILD.md` has the real numbers and the host
constraints.

## Changing Chromium

Edit the checkout in `chromium/src` like a normal tree, then:

```sh
./scripts/redrob.py export
```

`patches/` is rewritten from what you actually changed. Patches are never hand-maintained, and a new
file you added is reported rather than patched in -- files that are ours belong in this repository as
files, not as a diff against Chromium.

## Where the product lives

`docs/UI.md` maps the designed interface onto the three layers this fork has -- a WebUI page, the C++
browser UI, and a local sidecar process -- and says which of them each piece belongs in. The short
version: the AI surfaces are web technology and should stay that way; only the tab strip and the agent
tab plumbing need C++.
