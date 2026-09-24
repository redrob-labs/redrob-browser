# Roadmap

Written 2026-09-23. Baseline: `REDROB_VERSION` 0.1.3, Chromium 153.0.8010.36, branch `develop`,
84 patches, 17 commits unreleased since `v0.1.3`.

Priority is the product surface: every screen correct, every control alive, every path reachable.
Platform work (Windows, macOS, mobile) waits until that is true.

## The surface

Four screens, and that is all of them:

| Screen | Where |
|---|---|
| New tab — composer, suggested tiles, recent tasks | `sources/chrome/browser/resources/redrob/redrob.html` `#home` |
| Task tab — trace, frame preview, follow-up composer | same file, `#task` |
| Settings — 7 sections | `sources/chrome/browser/resources/redrob_settings/` |
| Onboarding — 6 steps | `sources/chrome/browser/resources/redrob_onboarding/` |
| Sidebar shell — workspaces, bookmarks, chats, tabs, account, settings | `sources/chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.cc` |

## Phase 1 — screen sweep

### Dead controls: on screen, clickable, wired to nothing

1. **Three "+" add-context buttons do nothing.** `#attach` on the new tab plus two unnamed
   `.ctl-icon` copies in the task composer. `redrob.ts` contains zero references to `attach` and zero
   to `ctl-icon`. The `@` picker they belong to is unbuilt (`redrob.ts:614` passes `[]` for
   `context_refs`), so the button is an affordance for a feature that does not exist. Either build
   the picker or remove the buttons — shipping a button that swallows clicks is worse than shipping
   neither.
2. **The new tab's model picker is inert, and the product already has the two pieces it needs.**
   `#model` has one hardcoded `<option>` (`redrob/auto`), is never populated, and its value is never
   read — `startTask()` takes no model argument. The "Redrob engine" row in Settings is not a real
   provider either: `redrob_settings.ts:197` fabricates it client-side as
   `{id: '', model: 'redrob/auto', endpoint: ''}`, so the UI does not know what it talks to.
   Meanwhile the console serves a catalogue of roughly 343 models over its OpenAI-compatible
   `https://console.redrob.ai/api/backend/v1`, routed through the canonical `auto` id, and
   redrob-cowork already has a working picker over it —
   `apps/app/src/react-app/domains/session/modals/{model-picker-modal.tsx,use-model-picker.ts}`,
   `session-model-store.ts`, and `domains/settings/redrob-provider.ts` as the single source of truth
   for the base URL, the key-issuing console link and the canonical model id. Read those before
   building a third answer. Also note cowork records that the canonical id is **`auto`** and that the
   `redrob-ai` / `redrob-translate` aliases are retired — this browser's `redrob/auto` string does not
   match it, in all three places it appears.
3. **The task view's model label is hardcoded.** `#reply-model` is a static `redrob/auto` span that
   no code updates, so it misreports the model on every task that is not on auto.
4. **Onboarding collects an email and throws it away.** `#email` on the account step has zero
   references in `redrob_onboarding.ts`.
5. **Onboarding's "I already have an account" button is dead.** `#have-account`, zero references.
6. **Onboarding's "more providers" button is dead.** `#more-providers`, zero references.

### Controls that appear to work and then undo themselves

7. **Closing the frame preview does not stick.** `#preview-close` sets `preview.hidden = true`, but
   `renderTask()` unconditionally sets it back to `false` whenever the task has any captured frame —
   and it runs on every push from the browser. The user closes the panel, the next trace update
   reopens it. Dismissal has to be remembered in page state.

### Destructive actions with no confirmation and no undo

8. **"Forget everything" wipes all memory on one click.** `#memory-forget` in Settings has no
   confirm step and no undo; there is no `confirm` anywhere in `redrob_settings.ts`.
9. **Removing a provider deletes a stored credential on one click.** Same file, same absence. Both
   need a confirmation, and the copy should say what is lost.

### Things you can create but not manage

10. **CORRECTED — routines are fully manageable.** This list originally said routine rows were
    read-only text with no way to pause, edit or delete. That was wrong: `renderRoutines` gives every
    row **Run now**, **Pause/Resume** and **Delete** buttons, and also surfaces `lastError` on its own
    line when a run was skipped. The mojom backs all of it (`RemoveRoutine`, `SetRoutineEnabled`,
    `RunRoutineNow`, `UpdateRoutine`). The false finding came from reading a fixed-size grep window
    after the list anchor, which cut off just above the actions block.
11. **CORRECTED — memory entries are individually manageable.** Same mistake, same cause:
    `renderMemoryRow` gives every entry **Pin/Unpin** and **Delete**, on top of the bulk wipe.
12. **Queued follow-ups cannot be cancelled.** This one stands, and it is worse than a missing button:
    `#queued` lists pending messages as plain `<li>`, and `redrob.mojom` exposes no way to withdraw
    one — `SendFollowUp` only adds. So the fix is not UI-only; it needs a mojom method and a
    `TaskStore` operation before a control can exist.

Provider, routine and memory rows all carry actions, so the product is consistent about actionable
rows after all — the inconsistency claimed here earlier was an artefact of the same bad measurement.

### Navigation and orientation

13. **Settings has no sense of place.** All 7 sections render at once in one long scroll (`.page` has
    no hidden state); the left nav is anchor jumps, and `.nav-link` styles only `:hover` — there is no
    current-section state. Either make the nav a real router or highlight the section in view.
14. **Settings has no search.** Every section is reachable only by knowing which of the seven it is in.
15. **A task tab has no way back.** `#task` has no home link or back affordance; the only route out
    is the browser's own Back. The new tab is where all work starts, so it should be one click away.
16. **A missing task leaves a live composer.** When `tasks.get(openTaskId)` misses, `renderTask()`
    sets the title to "not found" and returns — leaving the follow-up form, its controls and its send
    button visible and usable against a task that does not exist.
17. **CORRECTED — effort is not a control.** This said effort was changeable before a task and
    invisible after, while permission mode is changeable mid-task, for no stated reason. The reason is
    in the contract: `redrob.mojom` carries effort only as a `StartTask` argument with no `SetEffort`,
    and the `Task` struct's comment says the field exists so a task "later still shows the effort it
    actually ran at". Effort is immutable by design. The two also sit in different places — effort in
    the task header beside the state, where facts live; the permission select in the composer, where
    controls live — so there was never an inconsistency to fix.

### Accessibility

18. **Settings' password chooser announces wrong.** `role="radiogroup"` wrapping `<button>` children
    that carry `aria-pressed`. A radiogroup's children must be `role="radio"` with `aria-checked` —
    which is exactly what the onboarding copy of the same chooser does correctly. Fix Settings to
    match onboarding.
19. **The whole trace is one live region, rebuilt from scratch.** `#trace` has `aria-live="polite"`
    and `renderTask()` clears it with `textContent = ''` and rebuilds every child on every update, so
    a screen reader re-announces the entire task history each time a step arrives. Make the live
    region the newest step, not the log.
20. **Rebuilding the trace drops focus.** Same cause — anything focused inside the trace is destroyed
    on the next push.
21. **Onboarding's step dots ship untranslated English.** `redrob_onboarding.ts:47` sets
    `dot.ariaLabel = \`Step ${i + 1} of ${STEPS.length}\`` in code rather than from
    `loadTimeData`. (An earlier note here also claimed the dots lacked `role="tab"` inside their
    `role="tablist"`; that was wrong — `redrob_onboarding.ts:45-46` sets `role` and `aria-selected` on
    each dot. Only the label is the defect.)

### Copy and content

22. **The search segment always uses Google.** `redrob.ts:601` hardcodes
    `google.com/search`, so changing the default search engine in settings does not change what the
    new tab's field does. The TODO is already in the code; the fix needs the browser side to hand
    over the default provider's URL.
23. **The provider sign-in form is a developer form.** Authorize URL, token URL, client ID and scopes
    are all free-text inputs with no presets for known providers. Nobody completes that by hand. It
    needs per-provider presets, with the raw fields kept behind an "advanced" disclosure.
24. **A localized string carries a live element id.** `IDS_REDROB_SE_CLI_RPC_NOTE` embeds
    `<span class="mono" id="rpc-handle">`, rendered with `$i18nRaw`. A translation that drops the
    span silently removes an element the page addresses.
25. **Step icons are emoji.** `stepIcon()` returns `🕘 🗔 📷 🗎 🔑 ⑃ ⊘ ↺ ⋯ ☰ ⏱`. Without a colour
    emoji font installed these fall back to boxes, and several (`⑃`, `⊘`, `↺`) render as thin glyphs
    inconsistent with the rest. Use the product's own icon set.
26. **A running task's elapsed time is frozen.** `elapsed()` is computed during render with no timer,
    so "working 12s" stays 12s until the next push from the browser.
27. **Five user-facing strings are hardcoded English in C++.** `model_store.cc:260,265,269` return
    "This machine's keystore has not answered yet.", "A name, a model and a valid endpoint are all
    required." and "There are already too many providers." straight into the sign-in form's status
    line; `routine_store.cc:263,268` store "The task engine was not available." and "That chat no
    longer exists, so there was nothing to wake." as a routine's `last_error`, which the settings page
    does display. None go through `l10n_util`, so a Korean UI shows English at exactly the moment
    something has gone wrong.

### Still open from earlier work

30. **Nothing in CI launches the browser twice on one profile.** FIXED, with the guard sitting alongside
    the fix it guards. Every job used `--user-data-dir="$(mktemp -d)"` and launched once, so the case that
    works — a fresh profile's first start — was the only case ever tested. That is why finding 29 survived
    here as a hypothesis for so long: its failure appears only on the SECOND launch of a profile whose
    first did not exit cleanly. Both platform jobs now reuse one directory, kill the first launch hard on
    purpose, and require the second to come up. Note what remains: the Linux `checks` job never launches
    anything — it is lint and tooling with no build — so every piece of runtime coverage this repository
    has is Windows and macOS. Nothing verifies Linux behaviour except a human.

31. **The RPC token file is protected on POSIX only.** `WriteHandleFileOnBlockingThread` in
    `rpc_server.cc` writes the handle file — which holds a 32-byte token that, in that function's own
    words, "grants control of the browser" — into the profile directory, then narrows it to owner
    read/write under `#if BUILDFLAG(IS_POSIX)` with no `#else`. On Windows the file keeps whatever ACL it
    inherits. In practice a profile under the user's own AppData is usually already user-only, so this is
    weaker than the POSIX case rather than plainly open — but the code makes an explicit security
    decision on one platform and silently none on the other, which is a thing to decide rather than
    inherit. Either assert the ACL on Windows too, or say in that comment why inheritance is considered
    enough there.

32. **The shape to grep for is a lone `IS_POSIX` guard with no `#else`.** Our platform coverage is uneven
    in a way worth knowing rather than guessing at. `redrob_fonts.cc` and `chromium_profile_locator.cc`
    are properly three-way — Windows, macOS, and a real `#else` — so that platform work was done
    deliberately. `sidecar_client.cc` was not: the engine was findable on Windows only through an
    environment variable, because its install-location branch looked for a name with no `.exe` and its
    PATH branch was compiled out entirely. `rpc_server.cc` is finding 31. The pattern reads as "POSIX
    needs this" and behaves as "every other platform gets nothing", and it is silent both times.

27e. **The engine's loopback port was unauthenticated, and our own comment said otherwise.** FIXED.
    `SidecarClient` generates a 32-byte per-launch secret, binds it into the launch task, and sends it as
    HTTP Basic on every request — but never gave it to the engine. The engine enforces Basic only when
    `REDROB_SERVER_PASSWORD` is set, so with nothing set our `Authorization` header was ignored and the
    ephemeral loopback port accepted requests from **any process on the machine that found it**, with the
    engine holding the user's Console credential and its own tool surface behind it. The launch lambda
    even took the secret as a parameter and never read it. It is now passed to the child through the
    environment, on the same route as the API key: never on the command line, never logged, never on disk.
    Worth noting for review: the header was being sent all along, so this is one line and no protocol
    change — the two halves simply were never connected.

27c. **"Ask about what you are looking at" is designed but unbuilt, and onboarding was teaching it.** The
    first-run agent step told users to press Ctrl+Shift+E anywhere. Nothing binds that chord: there is no
    Redrob command id in `chrome_command_ids.h`, no Redrob row in `chrome/browser/ui/accelerator_table.cc`,
    and that table binds `VKEY_E` only with Ctrl (focus search) and Alt (app menu). The hint is removed.
    The feature itself is half-designed and worth building: `StartTask` in `redrob.mojom` already carries
    `context_refs`, documented as "opaque handles the browser process resolves — a tab, a selection, a
    bookmark. Not URLs and not paths", but the only caller passes `[]` and nothing in the browser process
    mints a ref. So it needs three things, none of them UI: a ref minter for the active tab, a command id
    plus an accelerator-table entry, and a decision about where the prompt is typed. The strings are still
    in the dictionary.

27d. **The account step describes an account nobody can create.** Cycle 6 removed its fake email field and
    its handler-less "I already have an account" button, which left an imperative heading — "Create your
    Redrob account" — over a step with no control at all. Reworded to describe what the account is for,
    which is what the body already does. The real fix is a sign-in, and that is cross-repo: the console
    made redrob-auth the only way in, so first run cannot mint an account by itself.

27b. **The first thing anyone sees is an upstream legal dialog under our name.** Before onboarding, first
    run shows a 600x508 modal titled **"Redrob Additional Terms of Service"** whose body reads "This Space
    Intentionally Blank / In official builds this space will show the terms of service", with Cancel and
    Accept. The title is ours by brand substitution; the content is Chromium's placeholder. So an official
    build would present terms at this point, and nothing in this repository says whose. This is the same
    shape as the settings page that told users their data went to Google: an upstream surface rebranded as
    ours, making a claim the product has not decided. Either ship real terms here or suppress the dialog —
    a product and legal decision, not something to quietly change.

27. The collapsed rail's second tab row draws a broken-image favicon, off-centre by 1.5px.
28. Remaining English leakage from the Chromium-branded string variants (profile popup, session
    restore infobar).
29. `profile.exit_type=Crashed` puts the shipped v0.1.3 build on the post-crash path, where it traps
    with `SIGTRAP` and never clears the flag — one unclean exit makes a profile permanently
    unusable. Needs a `dcheck_always_on` build to recover the `CHECK` message the official build
    strips. This outranks everything above: a user who hits it loses the whole profile.

## What a source sweep cannot answer

Everything above came from reading the tree. These need a running binary, and there is no build on
this host — the checkout is a cold clone with no Chromium source and no `out/`, so the pixel pass
needs `bootstrap` + `sync` (~65 GiB) + a dev build first.

- Layout and spacing against the design tokens at each window width, and the collapsed rail.
- Focus order and full keyboard reach on all four screens.
- Contrast of the actual painted colours, light and dark.
- Whether each screen's empty, loading, error and long-content states look finished.
- Every deep path walked by hand: onboarding end to end, a routine firing, a provider connected, a
  task steered and cancelled, the importer, the folder picker.

## Where the rest of the product actually is

Read off the repositories on 2026-09-23, not from memory. This matters because two of these have
moved past what this browser assumes.

**redrob-code** — v0.4.1 released, no open PRs, `develop` 4 ahead of `main`. Those four commits are
the engine's **OpenAI-compatible `/v1/chat/completions` with a documented SSE response** (#58, #60,
#61). This browser does not use it: `sidecar_client.cc:592` posts to
`/experimental/external/chat/completions`. So the browser is on a bespoke experimental route while
the engine now serves the standard one. Moving to `/v1/chat/completions` is a real work item, and it
is the difference between the browser being a special case of the engine's API and being its only
non-standard caller.

**redrob-console** — `develop` 1 ahead of `main`, a `release/0.28.0` branch open, and #134 has
landed: **redrob-auth is now the console's only way in.** Open PR #135 adds internal workspaces a
deployment does not charge. Any account or sign-in work in this browser targets redrob-auth, not a
console-local login, and the billing model is still moving — so do not build against it yet.

**redrob-cowork** — v0.1.13 released, `develop` 7 ahead of `main`, 4 open PRs (#51 tests on PR, #52,
#53 release-asset upload, #56). Recent work is a **harness shim registered as an engine provider,
with onboarding wired to real detection** (#65, #66, and the in-flight
`feat/finish-harness-wiring`). That is the same problem this browser solves in its own onboarding's
model step — worth reading before building a second answer to it.

## Later, in order

1. Ship the 17 unreleased commits once Phase 1's high-severity items are in — v0.1.4.
2. Move the sidecar off `/experimental/external/chat/completions` onto the engine's
   `/v1/chat/completions` now that it exists and its SSE shape is documented.
3. Turn on auto-update: signing key and CDN credentials. Not code.
4. Windows. The tree already carries `build/args/windows.gn`, a dispatch-only
   `.github/workflows/windows.yml`, a real `sign-windows` job and `mini_installer` packaging; it has
   never been compiled. Two things are known to be wrong before the first build: font registration
   uses `AddFontResourceExW`/`FR_PRIVATE`, which registers with GDI where the renderer sandbox only
   reaches fonts through the DirectWrite proxy, so it must become a DirectWrite custom font
   collection; and `WIN_CSC_LINK` holds a base64 PFX, which since 2023-06-01 can no longer be
   reissued for a publicly-trusted code-signing cert.
5. macOS. The workflow exists and has never run; the app icon needs `actool` on a Mac.
6. Accounts and sync — through redrob-auth, once console 0.28.0 and the unmetered-workspace work
   settle.
7. Mobile, if it is wanted: a companion app that reaches the desktop agent. A phone cannot run this
   engine — iOS mandates WebKit, and Chromium's own iOS port drops Blink and shares no UI with
   desktop.
