# Changelog

Redrob Browser's own versions. The Chromium release each one is cut from is in `CHROMIUM_VERSION` and moves on
upstream's four-week cadence whether we ship anything or not — the two numbers answer different questions, so
`scripts/redrob.py version` prints both.

## 0.1.3 — 2026-09-14

Korean actually translated, and a Windows build path.

**Our own UI was not translated, and the mixed window made that look like a bug.** Chromium ships `ko.pak` with
440 locales, so with `LANG=ko` the address bar read `Google에서 검색하거나 URL을 입력하세요.` above a sidebar
saying `Bookmarks`, `Chats`, `Tabs` — and `chrome://settings` showed `설정` in its tab title while our own foot
row said `Settings`, two words for the same thing in one window. There were zero `IDS_` uses in this fork and no
`.grd` at all. Now there are 242 strings behind grit, all of them Korean: the sidebar, the new tab and task view,
the settings page, and the first-run flow. `docs/L10N.md` has the whole path.

Everything derives from `l10n/*.tsv`, one row per string, because a localized string otherwise has to be kept in
step in three places — the English in a `.grd`, the Korean in a `.xtb` keyed by a **hash** of that English, and
the id at the use site. `scripts/gen_strings.py` generates all three and `redrob.py check` fails on drift. The
xtb fingerprint is reimplemented so `check` needs no checkout, and cross-checked against grit's own module when
one is present — a wrong id is dropped **silently** and ships English on a green build.

Two things cost a build each and are worth knowing before touching this. **`$i18n{}` does not work in
TypeScript**: `EnableReplaceI18nInJS` substitutes only inside Lit/Polymer HTML template literals, so a
`'$i18n{key}'` literal in a hand-written `.ts` reached the page as the visible text `$i18n{obContinue}` on the
onboarding button. The path there is `UseStringsJs()` plus `loadTimeData`. And **a sentence split around
`<strong>` breaks in Korean** — the newline between two fragments renders as a space, so `일정은` came out
`일정 은`; those sentences are now single strings carrying their own markup behind `$i18nRaw{}`.

**Windows.** `build/args/windows.gn`, `redrob.py build/run/package --flavour windows` (the packaging target is
upstream's own `mini_installer`, staged as `redrob-browser-x64-<version>-setup.exe` — the name the sibling repos
already publish under, so the CDN script's `latest/` alias needs no change), the `AddFontResourceExW` /
`FR_PRIVATE` font registration, and `.github/workflows/windows.yml`. None of it has been compiled: the workflow
is manual dispatch and expected to fail on **disk** first, which is the measurement that says a self-hosted
machine is needed. Signing, an update channel and the app icon are absent and listed as absent in
`docs/WINDOWS.md`. `redrob.py build` now refuses a flavour whose platform is not the host's, instead of failing
deep inside a toolchain.

**The macOS build would have failed at `gn gen` on a target that no longer existed.** `ui_font_bundle_data` was
added to the checkout and never copied back into `sources/`, while `patches/chrome-BUILD.gn.patch` depends on it
— and `apply` copies `sources/` **over** the checkout, so the next apply would have deleted the target its own
patch requires. `export` could not catch this by design, because a `sources/`-owned file is excluded from its
untracked-file report. `check_repo.py` now compares every manifest source against the checkout when one is
present.

## 0.1.2 — 2026-09-14

Korean, and a header that stopped losing two buttons.

**Hanja and decomposed Hangul had no font behind them.** The bundled Pretendard covers all 11,172 precomposed
Hangul syllables — which is why Korean looked fine — and zero of the conjoining Jamo block and zero CJK Han, both
measured. So Hanja in a document, and the NFD Hangul macOS puts in filenames, were tofu boxes on a minimal
install. `fonts-noto-cjk` is now a dependency: 256/256 Jamo and 20,976/20,992 Han. Pretendard stays as the UI
face; swapping the company's typeface to reach a block that only appears in decomposed strings would have cost
the brand everywhere to fix it in one place. The dependency adds about 60 MB.

**The sign-in promo pushed the magnifier and compose button off the sidebar.** Signed out, the avatar expands into
a "Sign in to Google?" pill about 145px wide, and in a flat 254px row that width shifted both trailing controls
past the column's edge — a browser that lost two controls depending on sign-in state. The leading group now
carries the row's flex, so the workspace name elides and the controls hold their coordinates.

**macOS groundwork**, none of it yet compiled: the CoreText font registration is written, the font travels as
`bundle_data` inside the framework where `DIR_MODULE` can actually find it, `build/args/mac.gn` is a dev flavour
sized for a hosted runner, and `.github/workflows/macos.yml` asks one question — does it build and launch. See
`docs/MACOS.md`.

## 0.1.1 — 2026-09-14

One fix, and it is the reason 0.1.0 should not be installed.

**The package configured Google's apt repository and installed Google's signing key.** An installed 0.1.0 wrote
`URIs: https://dl.google.com/linux/chrome-stable/deb/` into the user's apt sources and filled
`/usr/share/keyrings/redrob-browser.gpg` with Google Inc's Linux Packages Signing Authority key. Both were
inherited from upstream, where they are correct because upstream's package is Chrome.

Both hardcodings now come from one string, and the channel is off until Redrob has its own signing key: with no
key the package adds no source at all and says why. `scripts/update_signing_key.py` turns it on.

If you installed 0.1.0, remove what it added:

```
sudo rm -f /etc/apt/sources.list.d/redrob-browser.sources \
           /etc/apt/sources.list.d/redrob-browser.list \
           /usr/share/keyrings/redrob-browser.gpg
sudo apt-get update
```

## 0.1.0 — 2026-09-13

First tagged version. Chromium 153.0.8010.36, Linux, 72 patches.

### The shell

The window is a sidebar and a page. The vertical tab strip carries the workspace, bookmarks, chats and tabs;
above the page is a slim row with back, forward, reload and a flat address field that paints no box.

Its geometry is measured rather than judged. `redrob_sidebar_tokens.h` holds every number with the measurement
it came from — a 254px column, a 32px row, a selected pill 240 wide with 8px corners, a 16px favicon with an
8px gap to its label — and `MakeRow()` is the single place a row is built, so a row cannot disagree with the
tokens by being constructed at a call site that forgot one.

- Pretendard for the whole window, registered through fontconfig on Linux (Windows and macOS branches log that
  they are unimplemented, by name).
- The selected tab casts a real shadow. It needed the tab's own clip path widened first: a vertical tab clips
  its painting to its fill path, which silently discarded three earlier attempts.
- The group header no longer paints a filled bar in the sidebar, where it competed with the selection for the
  same visual meaning; it carries a leading mark and a tab count instead.
- The close button appears on hover and focus, not permanently on the selected row.
- The avatar sits with the workspace name, because the profile and the workspace are one feature here.
  Settings sits alone at the foot.
- Bookmark favicons load. They never had: `BaseBookmarkModelObserver` deliberately swallows the favicon
  callback, so the row asked once, got an empty image, and was never told the real one had arrived.

### The agent

- Read, click, type and save a file, with a permission model that actually refuses: `read-only`, `guard` and
  full access, chosen per task, with a refusal recorded as a step in the trace rather than silently dropped.
- Steer a running task, queue follow-ups, and an Ultrabrowse effort level.
- The trace shows captured frames, not placeholders.
- A URL typed alone in the composer is opened. A URL with words around it stays a task.

### Settings, onboarding, import

- `chrome://redrob-settings` covers routines, memory, model providers and passwords.
- First run actually runs, and says honestly what "import from Chrome" can and cannot mean per platform.
- A Chromium-family importer, because 153 ships none.

### Automation

- `POST /mcp` serves the browser as an MCP server, verified end to end against the reference SDK client: `GET`
  answers 405 and `notifications/*` answer 202 with an empty body, both of which the client requires and
  neither of which it says out loud.
- A loopback endpoint for scripts. `docs/AUTOMATION.md` replaces the browser-side CLI that was deleted — Redrob
  Code's own binary is already `redrob` and it speaks MCP as a client, so a second CLI was a second name for
  one path.
- OAuth 2.0 with PKCE for model-provider sign-in.

### Branding

Real tokens, real logo, and the strings that still said Chrome. Every branded file has exactly one owner so the
fork reproduces; `GOOGLE_OWNED_REWRITES` protects the phrases that must keep saying Google, because Chrome's
sync sign-in is a Google account and calling it a Redrob account offers something that does not exist.

### Known gaps

- Linux only. macOS needs `Assets.car`/`AppIcon.icon`, which needs `actool` on a mac host, and the Windows and
  macOS font registration paths are stubs.
- Packaged and signable, but nowhere to serve it. `redrob.py package` produces a real `.deb`
  (`redrob-browser-stable_0.1.0+153.0.8010.36-1_amd64.deb`) and `redrob.py repo` produces a signed apt
  repository from it, but nothing hosts that repository, so installing is still a manual act with no upgrade
  path. The signing key never lives in this repo — see `docs/RELEASE.md`.
- The packaging step needs `debchange`, `dpkg-deb` and `fakeroot` on the host, which is why the release workflow
  is self-hosted. See `docs/RUNNER.md`. No `.rpm`: upstream's combined target needs rpm tooling this build
  deliberately does not install.
- The `@` context picker is not implemented — `StartTask` accepts `context_refs` and nothing produces them.
