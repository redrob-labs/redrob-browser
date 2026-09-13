# Changelog

Redrob Browser's own versions. The Chromium release each one is cut from is in `CHROMIUM_VERSION` and moves on
upstream's four-week cadence whether we ship anything or not — the two numbers answer different questions, so
`scripts/redrob.py version` prints both.

## 0.1.0 — unreleased

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
- Packaged but not distributable: `redrob.py package` produces a real `.deb`
  (`redrob-browser-stable_0.1.0+153.0.8010.36-1_amd64.deb`), and there is no signing and no update channel, so
  installing it is a manual act with no upgrade path.
- The packaging step needs `debchange`, `dpkg-deb` and `fakeroot` on the host, which is why the release workflow
  is self-hosted. See `docs/RUNNER.md`. No `.rpm`: upstream's combined target needs rpm tooling this build
  deliberately does not install.
- The `@` context picker is not implemented — `StartTask` accepts `context_refs` and nothing produces them.
