# Architecture

This document is for someone who has to change this browser and does not want to read Chromium to do it.

The one sentence that makes the repository small: **Chromium is fetched, not owned.** Everything in this
repository is either a file we wrote, a per-file delta against a file that stays Chromium's, or a script that
puts the two together. Nothing here requires understanding 148 GB of someone else's code.

`README.md` is the quick start. This is the map.

## 1. What you actually own

Measured on `153.0.8010.36` / Redrob `0.1.4`:

| Where | Size | What it is |
|---|---|---|
| `chromium/src` | ~148 GB | Fetched at `CHROMIUM_VERSION`, never committed. Not yours. Not read. |
| `sources/` | 87 files, **~15,900 lines** | Code we wrote outright. This is the product. |
| `patches/` | 86 patches | One per Chromium file we modify. Named after the file. |
| `branding/` | 41 files | Files replaced wholesale: `BRANDING`, every icon, the wordmark. |
| `l10n/` | 4 TSVs | One row per translatable string. The `.grd`/`.xtb` are generated. |
| `scripts/` | 1,730 lines | The entire fork workflow. `redrob.py` is 909 of it. |

The 15,900 splits as C++ 10,700 · TypeScript/CSS/HTML 4,383 · Mojo IDL 487 · GN 320. Raw byte counts under
`sources/` look far larger only because four vendored font binaries live there.

**A day is enough to read all of it.** That is the design goal of the layout, not a coincidence.

## 2. Four owners, and a path has exactly one

| Owner | Use it when | Declared in |
|---|---|---|
| `sources/` | The file is ours. It exists because we wrote it. | `sources/manifest` (source → destination) |
| `patches/` | The file is Chromium's and we changed some lines. | the filename itself |
| `branding/` | The file is Chromium's and we replace all of it. | `branding/manifest` (source, target, kind) |
| `l10n/` | It is a user-visible string. | `l10n/*.tsv` |

A patch's **name is its path**: `chrome/browser/ui/x.cc` → `chrome-browser-ui-x.cc.patch`. That is Brave's
convention, and it is why `ls patches/` is a readable inventory of what this fork changes instead of a pile of
numbered blobs. `redrob.py check` fails a patch whose name stopped matching the path inside it.

The one-owner rule is enforced, because breaking it fails in the worst way — silently:

- a file under `sources/` that no manifest line copies is **never in the build**, so you can edit it for weeks
  and nothing happens. `check` reports it as an orphan.
- `apply` copies `sources/` **into** the checkout, so an edit you make in the checkout to a file we own is
  discarded by the next `apply`. `check` compares the two and tells you to copy it back.

## 3. The pipeline, and its inverse

```sh
./scripts/redrob.py sync     # fetch Chromium at CHROMIUM_VERSION
./scripts/redrob.py apply    # our sources FIRST, then patches/
./scripts/redrob.py brand    # overlay branding/
./scripts/redrob.py build    # gn gen + autoninja
./scripts/redrob.py run      # launch with a scratch profile
```

Two details in `apply` matter when it goes wrong:

- **sources before patches.** A registration patch refers to `chrome/browser/ui/webui/redrob`; that directory
  has to exist before the patch can mention it.
- **`git apply --3way`.** A patch that drifted against a new Chromium reports a real conflict naming one file,
  instead of refusing the whole set. That is the difference between a rebase you can finish and one you redo.

Going backwards:

| Command | Does |
|---|---|
| `redrob.py export` | Rewrites `patches/` from whatever you changed in the checkout. Patches are never hand-edited. A new file is *reported*, not patched in — new files belong in `sources/`. |
| `redrob.py derive` | Regenerates the branding substitutions (the ~768-edit strings work) against a new tree, so that patch is never conflict-resolved by hand. |
| `redrob.py strings` | Regenerates the `.grd`, the `.xtb` and the C++ header from `l10n/*.tsv`. |
| `redrob.py check` | Repo integrity. No checkout needed. Run it before packaging. |

## 4. Module map

Everything of ours lives at its Chromium destination path, so the tree shape tells you what layer it is in.

| Path under `sources/chrome/` | Lines | What lives here |
|---|---|---|
| `browser/redrob/` | 6,853 | The engine-facing brain: task store, sidecar client, tool implementations, stores, RPC server. |
| `browser/resources/redrob/` | ~2,300 | `chrome://redrob` — our new tab. `redrob.ts` + `redrob.css`. |
| `browser/resources/redrob_settings/` | ~1,500 | Our settings page. |
| `browser/resources/redrob_onboarding/` | ~870 | First-run flow, including the Chrome profile import step. |
| `browser/ui/views/tabs/vertical/` | 1,202 | The **native** sidebar (Views, not web). Bookmarks, history, workspaces, account row. |
| `browser/ui/webui/redrob*/` | 2,051 | Three WebUI hosts: the page controller, the Mojo handler, the `.mojom` contract. |
| `browser/{utility,common}/importer/` | 636 | Chrome/Chromium profile import. |
| `browser/ui/color/` | 143 | Our color mixer entries. |

The single most useful thing about this tree: **every file in `browser/redrob/` has a header comment that
explains why it is shaped the way it is.** They are not boilerplate. Read the top of `task_store.h`,
`sidecar_client.h` and `rpc_server.h` before reading any `.cc`.

## 5. How one feature travels, end to end

A task typed into the new tab. This is the path to trace with a debugger if you want to understand the product
in one sitting.

```
redrob.ts                     the page states INTENT: prompt, permission mode, effort
   │  Mojo
redrob.mojom                  the contract. Deliberately small.
   │
task_host_impl.cc             renderer-reachable surface. Owns almost nothing.
   │
TaskStore  (task_store.cc)    profile service. 1,557 lines. The centre of the product.
   │  HTTP, loopback
sidecar_client.cc             finds, launches and talks to the Redrob engine
   │
[ engine ]                    does inference, STREAMS text, PROPOSES tool calls
   │
TaskStore again               decides which proposed tools it is willing to run,
   │                          then runs them: agent_tabs / page_tools / file_tools
   └──> back up the same chain as state + trace the page renders
```

Three things this shape is protecting, all stated in the source comments:

1. **The task lives on the profile, not on the page.** A task opens as a *tab*; navigating creates a new
   document and a new handler, so a task stored on the handler would vanish the moment you opened it.
2. **The engine proposes tools; the browser runs them.** That is the engine's own contract for this endpoint,
   and it is the security boundary — one place in the browser process decides what model output may do.
3. **The page never chooses a model, holds a credential, or reaches the network.** That is why the Mojo
   interface is small.

The sidebar does **not** go through this path. It is Views code reading Chromium's own models directly
(`BookmarkModel`, history). If you are changing something visible in the left column, you are in
`redrob_sidebar_sections.cc`, not in TypeScript.

## 6. The seams — how our code gets into Chromium's build

This is the part that is invisible until you add something new and it does not appear. Our code compiles
because a small number of **patches** register it. If you add a service or a WebUI, you will touch these too.

| Patch | Registers |
|---|---|
| `chrome-BUILD.gn`, `chrome-browser-BUILD.gn`, `chrome-browser-ui-BUILD.gn`, … | our GN targets as deps of Chromium's |
| `chrome-browser-prefs-browser_prefs.cc` | `redrob::prefs::RegisterProfilePrefs` — every pref, from one place |
| `chrome-browser-profiles-chrome_browser_main_extra_parts_profiles.cc` | the five keyed-service factories (task, memory, model, routine, rpc) |
| `tools-gritsettings-resource_ids.spec` | resource id range 5400 for our three WebUI bundles |
| `tools-gritsettings-translation_expectations.pyl` | our locales, so grit accepts the `.xtb` |
| `chrome-common-chrome_features.cc` | feature defaults we override — e.g. `kGlic` off on every platform |
| `ui-webui-resources-tools-build_webui.gni` | our WebUI build path |
| 43 more under `chrome-browser-*` | the actual behaviour changes |

## 7. Boundaries that are load-bearing

Do not weaken these without reading the comment that explains them.

- **A renderer never holds a credential.** `ModelStore` encrypts the user's provider key through the platform
  keystore. The settings page can set and replace a key; it cannot read one back.
- **Tools run in the browser process, in one place.** A tool call the permission mode does not cover is
  refused, and the refusal is reported to the engine as a tool result so it can route around it.
- **`file_tools` takes a file NAME, never a path.** The browser decides the directory. There is no traversal
  check to get wrong, because the dangerous input has nowhere to go.
- **The RPC server is off by default.** A local HTTP server that can drive the browser *is* the browser to any
  other process. Loopback only, per-launch bearer token, token file owner-only inside the profile.
- **The agent works in real, visible tabs.** No headless path, no hidden `WebContents`. The user can watch,
  take over and close it, and the agent gets exactly the user's own permissions.
- **The sidecar is loopback with per-launch Basic credentials**, its API key passed in the child's environment
  rather than on a command line where `ps` would show it.

## 8. Strings

Never hand-write a localized string. One row in `l10n/*.tsv`:

```
key <TAB> English <TAB> Korean [<TAB> description]
```

`redrob.py strings` generates the `.grd`, the `.xtb` (keyed by a fingerprint of the English) and
`redrob_localized_strings.h`. All three are checked in under `sources/`, and `redrob.py check` fails if any has
drifted from the TSV. See `docs/L10N.md`.

## 9. Build flavours

`build/args/{dev,release,windows,mac}.gn`. Use `dev` for everything except a release: `release` is LTO + PGO and
measured **57,478 steps / 3h12m** on this host. `redrob.py build` writes the flavour's args into `out/<flavour>`
and appends Google API args from the environment if they are set — never from a committed file, because a
committed key is a published key (`docs/GOOGLE-CREDENTIALS.md`).

## 10. Reading order

1. `scripts/redrob.py` — the whole workflow is one file. Read `cmd_apply`, `cmd_export`, `cmd_build`.
2. `docs/AI_SURFACE.md`, then `sources/chrome/browser/ui/webui/redrob/redrob.mojom` — the product's contract.
3. The header comment of `sources/chrome/browser/redrob/task_store.h`, then the `.cc`.
4. `sources/chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.cc` — the thing you can see.
5. `ls patches/`. Read a patch when a name tells you it is the one you need. Not before.

## 11. Where to make a change

| You want to change | Go to |
|---|---|
| a row or section in the left sidebar | `sources/.../views/tabs/vertical/redrob_sidebar_sections.cc` |
| the new tab | `sources/.../resources/redrob/redrob.ts`, `.css` |
| our settings page | `sources/.../resources/redrob_settings/` + `sources/.../webui/redrob_settings/` |
| a new call between page and browser | the `.mojom`, then `*_host_impl.cc`, then the TS caller |
| what the agent can do | `page_tools` / `file_tools` / `agent_tabs`, the dispatch in `TaskStore`, and `PermissionMode` |
| something remembered across launches | `redrob_prefs.cc` (already registered by the `browser_prefs.cc` patch) |
| Chromium's own behaviour | edit `chromium/src` directly, then `redrob.py export` |
| any user-visible string | `l10n/*.tsv`, then `redrob.py strings` |
| the product name, an icon | `branding/`, then `redrob.py brand` |

## 12. What is checked, and what is not

`redrob.py check` has seven gates: `sources/` orphans, the branding manifest, patch names, the version in
**both** files that hold it, generated-string drift, checkout drift against `sources/`, and script encodings.

CI is narrower than it looks:

- `checks.yml` on Linux is **lint and tooling only**. Nothing builds or runs the browser on Linux in CI.
- `windows.yml` and `macos.yml` **do** build and run it on real runners, and assert survival plus a font log.
- Since 0.1.4 both reuse one profile and force-kill the first run, because every job used to run once on a fresh
  `mktemp -d` profile — which is exactly the case where the profile-corruption crash does not reproduce.
- No release runner is registered. Release builds happen on a workstation and only the artefacts are uploaded
  (`docs/RELEASE.md`).

## 13. Traps that have cost real time

Each of these was paid for once already.

- **The version lives in two files.** `REDROB_VERSION` and the checkout's `redrob-version.txt`. Miss the second
  and the `.deb` is stamped with the old version. `check` catches it; run it before `package`.
- **Switching branches changes `patches/` but not the checkout.** The checkout keeps the previously applied
  state, so `apply` then conflicts. Restore the named path with `git checkout HEAD -- <path>` and re-apply.
- **`export` regenerates from the entire checkout.** If another branch's patch is still applied, `export` will
  pull that drift into your patch set. Check `git status` in the repo after every `export`.
- **`sources/` is authoritative.** An edit made in the checkout to a file we own is thrown away by the next
  `apply`. Copy it back into `sources/`.
- **Our new-tab patch overrides the start URL**, so a `chrome://` page passed on the command line is replaced.
  Reach it with `ctrl+l` instead.
- **`--test-type` hides warning infobars.** A screenshot taken with it cannot prove an infobar is absent.
- **`xdotool search --pid` with no `--name` pattern never returns.** Always give a pattern, and wrap every GUI
  command in `timeout`.
