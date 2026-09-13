# Installing and testing 0.1.0

**Linux x86-64 only.** There is no macOS or Windows build of 0.1.0 — macOS needs `Assets.car` and `AppIcon.icon`,
which need `actool` on a mac host, and the font registration paths for both platforms are stubs that log their own
absence. If you are on a Mac, you need a Linux VM or box for this one.

## Getting the file

The repository is **private**, so the download URL is not anonymous: a bare `curl` gets `404`, and so does a
browser that is not logged in to a GitHub account with access to `redrob-labs/redrob-browser`. Two ways that do
work:

**From the release page**, logged in: <https://github.com/redrob-labs/redrob-browser/releases/tag/v0.1.0>

**With the GitHub CLI**, which uses your existing `gh auth login`:

```
gh release download v0.1.0 --repo redrob-labs/redrob-browser \
  --pattern "*.deb" --pattern "*SHA256SUMS.txt"
```

Prefer the CLI. The filename contains a `+` (`0.1.0+153.0.8010.36`), which a URL encodes as `%2B` — hand-copying
the link into a shell is a reliable way to fetch nothing.

## Verify before installing

```
sha256sum -c redrob-browser-0.1.0-SHA256SUMS.txt
```

Expect `OK`. The package is 113 MB and 385 MB installed. Nothing signs it yet, so this checksum is the only
integrity check there is — worth actually running.

## Install

```
sudo dpkg -i redrob-browser-stable_0.1.0+153.0.8010.36-1_amd64.deb
sudo apt-get install -f
```

The second line is expected to do work on a fresh machine rather than being a formality: the package depends on
about thirty runtime libraries — `libgtk-3-0`, `libnss3`, `libasound2`, `libcups2`, `libvulkan1`, `libgbm1`,
`fonts-liberation` among them — and `dpkg -i` does not resolve dependencies on its own. If `dpkg` complains, run
the `apt-get install -f` and then re-check with `dpkg -l redrob-browser-stable`.

Then launch **Redrob Browser** from the desktop menu, or:

```
/usr/bin/redrob-browser-stable
```

## A five-minute test, in the order things are most likely to be wrong

1. **The window.** Sidebar on the left with the workspace name, Bookmarks, Chats, Tabs; a slim row above the page
   with back, forward, reload and a flat address field that paints no box. The taskbar and window icon should be
   the Redrob mark — that was wrong at 32px until this release, so it is worth a look.
2. **Type a URL in the composer and press Enter.** `github.com` alone should NAVIGATE. Typing
   `summarise github.com for me` should instead file a task — the boundary is whitespace, and both halves matter.
3. **Bookmark two real sites** and check the sidebar rows show their actual favicons, not grey globes. Favicons
   never loaded at all before this release, so this is a regression check rather than a nicety.
4. **Start a task** from the composer. Watch the permission control: it opens on **Guard**, not full access. Ask
   it to save a file and confirm the refusal appears as a step in the trace rather than vanishing.
5. **The selected tab** in the sidebar should be a raised white pill with a shadow, and its close button should
   appear on hover — not sit there permanently.
6. **Settings** from the sidebar foot opens `chrome://redrob-settings`.

If something looks wrong, the fastest useful report is a screenshot plus what you did, because most of this
release was measured against a reference rather than judged by eye.

## Uninstalling

```
sudo apt-get remove redrob-browser-stable
```

It installs under `/opt/redrob/redrob-browser` and owns `/etc/redrob/policies/enrollment`, so removal is clean and
does not touch a Chromium install if you have one. That separation is deliberate: before this release the package
name and install path were still Chromium's, which would have made the two the same files on disk.

## What will not work yet

- **No automatic updates.** A signed apt repository is built by the pipeline, but nothing serves it, so this is a
  manual install. `apt upgrade` will not find a newer Redrob.
- **No `.rpm`.**
- **The `@` context picker** in the composer is not implemented — the task API accepts context references and
  nothing produces them yet.
