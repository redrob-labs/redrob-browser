# Redrob Browser (Chromium base)

An AI-native browser built as a **patch-based fork of Chromium**. This branch starts from nothing on
purpose: the previous base was a Zen/Firefox fork, and Korean banking and public-sector sites depend on
Chrome extensions and native messaging rather than on rendering, which is a dependency only a real
Chromium browser satisfies.

## What is ours

```
CHROMIUM_VERSION    the release we build, and the only place it is written down
patches/            surgical edits to files that stay Chromium's, one patch per file
branding/           files we replace wholesale: the BRANDING file and every icon
sources/            code we own outright, mirrored at its destination path
build/args/         gn args per build flavour
scripts/redrob.py   the whole fork workflow: bootstrap, sync, brand, apply, build, run, export, derive
```

The Chromium checkout is **fetched, never committed**. That is the lesson from the last fork: a tree with
258 patches buried in it could not answer "what do we own" without counting files. Here `ls patches/`
plus `branding/manifest` is the answer, and each file has exactly one owner -- a change that lives in
both is what made the first clean reproduce fail with `git apply: does not match index`.

## Getting to a build

```sh
./scripts/redrob.py bootstrap     # depot_tools into ./depot_tools (once)
./scripts/redrob.py sync          # fetch Chromium at CHROMIUM_VERSION, run its hooks
./scripts/redrob.py apply         # our own sources, then patches/
./scripts/redrob.py brand         # overlay branding/: BRANDING and the icons
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

## Moving to a new Chromium

```sh
# edit CHROMIUM_VERSION, then
./scripts/redrob.py sync
./scripts/redrob.py apply          # conflicts here name the files to look at
./scripts/redrob.py derive         # re-generate the branding edits against the new tree
./scripts/redrob.py export         # store them as patches again
```

`derive` exists so that a 768-substitution strings patch is never conflict-resolved by hand: it is
generated from the new tree instead, and it fails loudly if upstream moved the file rather than
producing a stale patch. `brand` is not part of this -- overlay files do not conflict, they just land.

## Where the product lives

`docs/UI.md` maps the designed interface onto the three layers this fork has -- a WebUI page, the C++
browser UI, and a local sidecar process -- and says which of them each piece belongs in. The short
version: the AI surfaces are web technology and should stay that way; only the tab strip and the agent
tab plumbing need C++.
