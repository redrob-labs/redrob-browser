# Memory

What the agent carries from one task to the next (CAP-19). It is a folder of plain markdown files in the
profile, written by the browser, readable and editable by the user, and every change to it can be undone.

## Layout

```
<profile>/Redrob/memory/
  MEMORY.md                 index: one line per file, saying what it holds
  USER.md                   who the user is, what they prefer
  episodic/YYYY-MM-DD.md    what happened, one file per day
  sites/<host>.md           paths through a site that worked (search URLs, menus, form order)
  people/<name>.md          people the user works with
  projects/<name>.md        ongoing work
  .snapshots/<run id>/      the whole tree as it was before a run first wrote
```

Created on first use. A file name is a relative path: lower-case letters, digits, `-`, `_` and `/`, ending
in `.md` (`MEMORY.md` and `USER.md` are the two upper-case exceptions). No `..`, no empty segment, no
segment starting with a dot -- which is what keeps `.snapshots/` out of reach. At most 64 KiB a file and
4 MiB in all.

## The write boundary

Only `MemoryStore` (`sources/chrome/browser/redrob/memory_store.cc`) touches these files, on one sequenced
blocking task runner, and it writes only inside a **run**:

| Run kind | Started by | Tools it gets |
|---|---|---|
| `extract` | `TaskStore`, when an ordinary task finishes successfully | `memory_list`, `memory_read`, `recall`, `memory_write`, `memory_edit` |
| `consolidate` | the built-in daily routine (only after 3+ extractions since the last one), or *Run consolidation now* | the same |
| `user` | an edit or delete in Settings → Memory | -- |
| `revert` | the Revert button on a run | -- |

The engine never touches the disk. It proposes `memory_write` / `memory_edit` tool calls and the browser
runs them (`TaskStore::RunMemoryTool`). Those two tools are declared **only** to the hidden memory tasks;
an ordinary task is offered `memory_list`, `memory_read` and `recall`, and if a model names a write tool
anyway it is refused in the trace. So a task cannot rewrite memory as a side effect of what it browsed.

Memory tasks are hidden: not in the task list, not sent to any page, no tabs, read-only permission mode,
and they do not count against the user's four concurrent tasks.

## Runs, snapshots and revert

Every run has a row in the `redrob.memory.runs` pref: id (unix ms), kind, start, duration, tokens (0 when
the engine reports none, which is the case today), and the files it touched with +/- line counts. Before
a run's first write the whole tree is copied to `.snapshots/<run id>/`. The last 30 runs and their
snapshots are kept.

Revert copies a run's snapshot back over the tree. It is a run of its own, snapshotted first, so a revert
can be reverted.

## Inputs to extraction

The finished task's prompt, the tail of its answer, its step labels, and the hosts the agent opened. The
titles and URLs the agent's own tab visited are added **only** when the user turns on *Use the pages the
agent visited* (`redrob.memory.history_input`, off by default). The user's own browsing history is never
an input.

## Retention

`redrob.memory.retention_days`: 30, 90 or 0 (forever). Only `episodic/` ages out, by the date in the file
name, on startup and daily. Files consolidation moved facts into stay until the user deletes them.

## Migration

The old store was a list of sentences in `redrob.memory.entries`. On first start it is moved once:
unpinned entries become bullets in `episodic/<date created>.md`, pinned ones go to `USER.md`.
