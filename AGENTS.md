# AGENTS.md

## What this repository is

Redrob Browser is an AI-native browser built as a patch-based fork of Chromium, pinned to the release
named in `CHROMIUM_VERSION` (currently `153.0.8010.36`) with its own version in `REDROB_VERSION`
(currently `0.1.3`). The Chromium checkout is fetched, never committed: `/chromium/`, `/depot_tools/`
and `/out/` are all in `.gitignore`, so everything tracked here is the delta, and 84 files in
`patches/` plus 87 files under `sources/` are the entire thing this repository owns. The repository is
private on GitHub as `redrob-labs/redrob-browser`.

## Branching, and it changed recently

`develop` is the default branch and the base of every pull request. `main` is released state and moves
only by merging `develop` into it. Release tags are cut from `main`, and `release.yml` refuses a tag
whose name does not equal `REDROB_VERSION`.

A hotfix branches from `main`, merges into `main`, releases, and then `main` is merged back into
`develop`. That last step is the one that gets skipped, and skipping it is not cosmetic: the sibling
repository redrob-code spent a month with a lockfile that its own default branch could not install
from, because a fix landed on `main` and never came back down.

Both branches are protected the same way: pull requests only, force pushes and deletions blocked, 0
required reviews, admin enforcement off. The required status check is `repo integrity`, which is the
job name inside `checks.yml`.

Working branches are `<type>/<short-slug>` and the allowed types are `feat`, `fix`, `docs`, `chore`,
`test`, `refactor`, `perf`, `hotfix`, `release` and `sync`. `gitflow.yml` now enforces that list on
every pull request, so a prefix outside it fails the check instead of merging: the `kiro/` branches
already in this repository are what the rule exists to catch, because a branch name states what the
change is and not which tool produced it. Nothing in the tracked tree declared a type list before
this, so this set is the shared default rather than a list copied from a document here.

Two things to know before you trust what you read in the tree. `CONTRIBUTING.md` still describes the
older model, one long-lived `main` with no `develop`, and says in as many words that this repository
does not run Git Flow: that text is now stale and `develop` wins. And pull request #5 from another
workstream still targets `main`, so when it merges `main` will be ahead of `develop` and needs a
back-merge before the two agree again.

## Layout

`patches/` holds surgical edits to files that stay Chromium's, one patch per Chromium file, named
after the path it patches with `/` replaced by `-`. `sources/` holds code this fork owns outright,
mirrored at its destination path and copied into the checkout, with `sources/manifest` mapping source
to destination as tab or space separated pairs. `branding/` holds files substituted wholesale, the
`BRANDING` file and the icons, driven by `branding/manifest`. `build/args/` has one gn args file per
flavour: `dev.gn`, `release.gn`, `mac.gn`, `windows.gn`. `l10n/*.tsv` is the source of every string
this fork adds, one row per key with English and Korean. `scripts/` is the tooling, and `docs/` has
eleven documents where the real numbers live, notably `docs/BUILD.md` for host cost and
`docs/TESTING.md` for the manual acceptance pass.

## Commands, and which ones work off a build host

There is no package manager and nothing to install: no `package.json`, no `Cargo.toml`, no `Makefile`
and no `justfile` are tracked. `scripts/` is Python 3 standard library only, and `depot_tools` brings
its own clang, gn and ninja, which is why `docs/BUILD.md` states that no system packages are ever
installed.

These four run in seconds anywhere and were all run on this checkout, each exiting 0:

```sh
python3 scripts/check_repo.py      # the whole repo-integrity gate
python3 -m compileall -q scripts/  # a syntax error in redrob.py is a broken release pipeline
python3 scripts/redrob.py version  # prints both versions
python3 scripts/redrob.py check    # wraps check_repo.py
```

`python3 scripts/gen_strings.py` also exits 0 and is idempotent: it reported 250 strings and left the
working tree clean, which is what you want to confirm after editing `l10n/`.

Everything that touches Chromium cannot run without a build host and was not run here. `redrob.py
bootstrap`, `sync`, `brand`, `apply`, `derive`, `export`, `build`, `run`, `package` and `repo` all
need the checkout: `docs/BUILD.md` measures `sync` at 40 to 60 GB and 40 to 80 minutes, a dev build at
2 to 4 hours on top, a release build at 4 to 8 hours with LTO and PGO, and says to have about 150 GB
free before starting. There is no unit test suite in this repository; verification of the product is
the manual pass in `docs/TESTING.md` against an installed `.deb`.

## What CI actually runs

`checks.yml` triggers on `push` to every branch and on `pull_request`, and its single job is named
`repo integrity`. It deliberately does not build the browser: it runs `check_repo.py`, then
`compileall` over `scripts/`, then prints both versions. It is the only workflow that inspects the
tree on a pull request, and `gitflow.yml` is the other workflow that runs on one: `gitflow.yml` judges
the branch name on `pull_request` and, on `push` to `main`, whether `main` is contained in `develop`.
Both report on a pull request, so either can be a required check.

`release.yml` triggers on tags matching `v*` and on `workflow_dispatch`, runs on a self-hosted runner
labelled `[self-hosted, linux, x64, chromium-build]` with a 700 minute timeout, and re-runs
`check_repo.py` before spending those hours.

`preflight.yml`, `windows.yml`, `macos.yml` and `sign-and-publish.yml` are `workflow_dispatch` only.
None of them can be a required status check, because a dispatch-only workflow never starts on a pull
request and a required check that never reports blocks the merge forever. `preflight.yml` exists to
answer which org credentials this repository can actually see, printing PRESENT or ABSENT and never a
value; `windows.yml` and `macos.yml` are dispatch-only on purpose because their first runs are
expected to fail on disk and on never-compiled platform code, and `sign-and-publish.yml` signs
artefacts a local build produced and uploaded to a draft release.

## What you will get wrong on the first attempt

Do not hand-edit anything in `patches/`. Edit `chromium/src` like a normal tree and run
`./scripts/redrob.py export`, which rewrites the directory from the checkout's own diff. A patch whose
filename no longer matches the `+++ b/` path inside it still applies, so nothing breaks at build time,
but `check_repo.py` fails on it because `ls patches/` stops being a usable inventory.

A file you add is not a patch. New code belongs under `sources/` with a line in `sources/manifest`, and
`check_repo.py` reports any file under `sources/` that no manifest line copies as an orphan, because an
uncopied file is never in the build and can be edited for weeks with no effect.

The generated strings are checked byte for byte. `scripts/gen_strings.py` writes
`sources/chrome/browser/redrob/resources/redrob_strings.grd`, its `translations/redrob_strings_ko.xtb`
and `redrob_localized_strings.h` from `l10n/*.tsv`, and `check_repo.py` regenerates them in memory and
fails if the committed files differ. A stale `.grd` compiles and ships the previous release's strings,
which is why it is checked rather than trusted. The same check reads every `.html` and `.ts` under
`sources/chrome/browser/resources` and fails on a `$i18n{key}` that no TSV row defines, because that
key reaches the page as literal text on a green build.

Every `read_text` and `write_text` in `scripts/*.py` must pass `encoding=`, enforced by an AST walk in
`check_repo.py`. Python's default is locale dependent, so a bare call works on Linux and raises
`UnicodeDecodeError` on Windows the first time a file contains a non-Latin-1 byte: the first Windows CI
run died exactly that way on a CHANGELOG that had just gained Korean.

The version is written in more places than it looks. `REDROB_VERSION` must match
`sources/chrome/installer/linux/common/redrob-version.txt`, or the `.deb` ships a version that is not
the tag, and `CHANGELOG.md` must contain a `## <version>` section for it. `branding/manifest` must
overwrite all seven Linux installer icon paths that `check_repo.py` hardcodes, or the package ships
Chromium's globe at the size a launcher actually shows.

Order matters when the pin moves. `brand` must run before `apply` so hand-written patches land on top
of the branding overlay, and the sequence on a Chromium bump is `sync`, `brand`, `apply`, `derive`,
`export`. `derive` regenerates the mechanical branding edits against the new tree instead of
conflict-resolving a strings patch with hundreds of substitutions by hand, and it fails loudly if
upstream moved the file rather than producing a stale patch.

If a checkout is present locally, `check_repo.py` additionally compares every manifest source against
the checkout's copy. `apply` overwrites the checkout from `sources/`, so an edit made only in the
checkout to a file this repository owns is silently discarded by the next `apply`, and `export` will
not catch it because `sources/`-owned files are excluded from its untracked-file report.

Finally, an incremental build passing is not evidence that the tree builds from scratch, and the build
log is not evidence that the product works. Every defect this fork has shipped was invisible to the
compiler: a UA stylesheet rule beating a `[hidden]` attribute, two composers sharing one element id, a
Mojo reply object being truthy so a refusal read as success. Run the browser and read the pixels.
