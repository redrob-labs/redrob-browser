# Upstream

Redrob Browser is a fork of [Obscura](https://github.com/h4ckf0r0day/obscura), a browser
engine written in Rust (Apache-2.0). It carries a merged tree, not a patch set.

| | |
|---|---|
| Upstream | https://github.com/h4ckf0r0day/obscura |
| Pinned tag | `v0.2.5` |
| Commit | `bd9529418b7fa975b50eabeac415cfaaa865a588` |
| Pin file | `upstream-base.json` |

## Absorbing upstream

Follow upstream tags. Sync on a `sync/upstream-<tag>` branch and merge it into `develop` as a
merge commit, never a squash, so the next sync keeps a real merge base.

The earlier Chromium-based Redrob Browser was removed in full before this fork was taken.
None of its code is carried here.
