# UI/UX plan — redrob-browser follows redrob-cowork

Written 2026-09-23. Standard: **redrob-cowork's UI/UX is the reference.** Where this browser and
cowork disagree about a token, a component, a label or a flow, cowork wins unless there is a written
reason it cannot.

Each item below is one unit of work: small enough to finish in one sitting, with a stated
done-when, and marked with what it depends on. Work the waves in order; inside a wave the items are
independent.

## Why cowork is a usable standard, concretely

Cowork already owns the vocabulary this browser hand-rolls:

| What the browser needs | What cowork already has |
|---|---|
| Confirmation before destructive actions | `components/ui/alert-dialog.tsx` |
| Command palette | `components/ui/command.tsx` |
| Empty states | `components/ui/empty.tsx` |
| Form fields with labels and errors | `components/ui/field.tsx`, `input.tsx`, `label.tsx` |
| A correct radio group | `components/ui/radio-group.tsx` |
| A real select, not a native one with a fake label painted over it | `components/ui/select.tsx` |
| Model picker over the console catalogue | `domains/session/modals/model-picker-modal.tsx`, `use-model-picker.ts`, `session-model-store.ts` |
| Single source of truth for the console provider | `domains/settings/redrob-provider.ts` |
| Settings as real pages | `domains/settings/pages/{general,ai,appearance,preferences,extensions,mcp,plugins,updates,advanced,debug}-view.tsx` |
| Theme, language and window controls | `domains/settings/appearance/{theme,language,window}-section.tsx` |
| Full token scale, light and dark | `styles/{redrob-tokens,colors,tailwind-theme,fonts}.css` |

The browser cannot import React into a Chromium WebUI — that is a per-release merge cost this fork
should not take on. So this is a **vocabulary port, not a code port**: same token names, same
component anatomy, same labels and same flow, rebuilt in the WebUI's own TS and CSS.

## Wave 0 — see the thing (one item, blocks all verification)

**0. Get a running build.** There is no Chromium checkout and no `out/` on this host, so right now
every item below can be written but none can be *looked at*. `bootstrap` → `sync` (~65 GiB) →
`apply` → `brand` → `build` (dev args). Done when `out/dev/chrome` launches on `:0` with a fresh
profile and `chrome://redrob` renders.

Everything after this point is written to be verified by screenshot at the end of the item. Without
wave 0 a loop will produce code nobody has seen.

## Wave 1 — the design system

**1. Port cowork's token scale.** The browser's `tokens.css` carries a hand-picked subset: `--rr-blue`
1,3,5,6,7,9,10 (2, 4, 8 missing) and `--rr-red` 3,4 only. Cowork carries the full scales plus the
Radix gray and black-alpha ramps and `--rr-gradient-primary`. Copy the whole set by value from
`styles/redrob-tokens.css` and `styles/colors.css`; keep the existing shadcn semantic layer
(`--background`, `--muted-foreground`, …) mapped onto it. Done when no `--rr-*` step used by cowork
is absent here and every semantic token resolves to a ramp step rather than a literal.

**2. Verify dark mode, do not add it.** Earlier notes in this plan claimed the browser had no dark
mode; that was wrong. `tokens.css` sets `color-scheme: light dark` and expresses every themed token
with `light-dark()`, which is stricter than a duplicated dark block — a token cannot be defined in one
mode and forgotten in the other. What is unverified is whether the four screens actually *look* right
in dark: `redrob.css`, `redrob_settings.css` and `redrob_onboarding.css` may still carry literal
colours that bypass the tokens. Done when every literal colour in the three stylesheets is either a
token or has a written reason, and both schemes are screenshotted.

**3. Keep the native select; fix its invisible focus.** This item used to say "replace the fake
select". That was wrong, and measuring it says why. `.ctl-select` paints the value as text and lays a
real `<select>` over the control at `opacity: 0` — which is what keeps the width honest (a `<select>`
is laid out at its widest option) **while keeping the native popup, native type-ahead, native touch
behaviour and native screen-reader semantics**. Replacing it with a hand-rolled listbox would throw
all four away and reimplement them worse. The genuine defect is that the focused element is
transparent, so the browser's own focus ring is invisible: a keyboard user tabbing onto the
permission, model or effort control sees nothing move. Fix with `:focus-within` on the visible
wrapper. Done when every one of the four selects shows a ring on keyboard focus and the native popup
still opens.

**3a. Give every button-like control a focus ring.** Measured across the three stylesheets, focus
styling exists only for text inputs: `redrob.css` has two rules, `redrob_settings.css` three (all
`.field` inputs), `redrob_onboarding.css` one. Everything clickable — `.seg`, `.tile`, `.pill`,
`.send`, `.choice`, `.card-open`, `.nav-link`, the onboarding dots — is left to the UA default against
custom backgrounds and radii. `--ring` is defined in `tokens.css` and used twice in the whole product.
Done when one shared rule covers every interactive control on all four screens and the ring is
`--ring`.

**4. NARROWED — one empty-SURFACE shape, and leave empty-LIST notes alone.** The reference's anatomy is
media + title + description + action, centred and narrow. Applying it to every empty state here would
make the product worse: the settings lists sit under a heading and a lede that already say what the list
is, so a centred block repeating both is noise. So the anatomy goes where there is a genuinely empty
SURFACE — the task view when its id does not resolve, which until now showed a bare title and nothing
else — and the one-line note stays the list variant. Both share a class vocabulary so a future surface
picks the right one. Done: `.empty-block` with `.empty-title` / `.empty-detail` and an action, used by
`#trace-empty`; `.pill-solid` added to the main bundle for that action, matching the settings bundle's
values, with a note that a third caller means it belongs in `tokens.css`.

## Wave 2 — stop lying to the user

**5. Remove or build the three dead "+" buttons.** `#attach` and two unnamed `.ctl-icon` copies have
zero references in `redrob.ts`. Decision: remove them now and reintroduce with the `@` picker.
Done when no control on any screen has zero handlers — check by listing every `id` and `data-*`
control in the three HTML files and grepping each.

**6. Delete onboarding's dead controls.** `#email`, `#have-account`, `#more-providers` — zero
references each. Either wire them to redrob-auth or remove them. The email field is the worst: it
asks for an address and discards it. Done when the account step either does something with what it
collects or does not collect it.

**7. Make the preview close button stick.** `#preview-close` sets `hidden = true`; `renderTask()`
sets it back on the next push. Hold the dismissal in page state and honour it until a new frame
arrives. Done when closing it survives ten trace updates.

**8. Confirm destructive actions.** "Forget everything" (all memory) and provider Remove (a stored
credential) both fire on one click; `redrob_settings.ts` contains no `confirm` at all. Use cowork's
`alert-dialog.tsx` anatomy, and say in the copy what is lost and that it cannot be undone. Done when
both need a second, named confirmation.

**9. Localize the five hardcoded English strings.** `model_store.cc:260,265,269` and
`routine_store.cc:263,268` send English straight to the UI. Move them into `redrob_strings.grd` and
`l10n_util`. Done when a Korean UI shows no English on any error path in Settings.

**10. Settle the model id — measure before changing it.** Three places show `redrob/auto`, and it
looked like a stale label to swap for the canonical `auto`. It is not: `task_store.cc:86` defines
`constexpr char kModel[] = "redrob/auto"` and that is the value sent **on the wire** to the engine, so
changing it is a behavioural change, not a rename. Two namespaces are in play and both may be right
in their own place — the console's OpenAI-compatible API takes a bare model id, while the engine
addresses a model as provider plus model, and its `redrob` provider takes the console's own ids
verbatim. Worse, the route the browser posts to — `/experimental/external/chat/completions`
(`sidecar_client.cc:592`) — does not appear in the engine's source at all, while the engine has
recently gained a standard `/v1/chat/completions`. Done when a live task has been run against the
engine and the request that actually succeeds is recorded here; only then change the constant, and
change the three display strings to match whatever that is. Do not touch it before that.

## Wave 3 — the model picker, cowork's way

**11. Make the built-in provider real.** `redrob_settings.ts:275` fabricates
`{id: '', model: 'redrob/auto', endpoint: ''}` client-side, so the UI does not know what it talks to.
The row should report what the built-in path ACTUALLY is.

*Premise corrected (cycle 47). This item was written assuming the built-in provider points at the
console, so it asked for the console base URL and a link where a key is issued. That is wrong, and the
evidence is this week's: the built-in path goes through the LOCAL ENGINE, which holds its own console
credential (`REDROB_API_KEY`, then the credential store, then `auth.json`) and is reached over loopback
at an ephemeral port. The single-login property is the whole point — no product holds a key of its own
on this path — so a key-issuing link in OUR settings would teach the wrong model of the system and
invite a user to paste a key nothing here reads.*

- What the row should say instead: that this is the local engine, what state it is in (ready / not
  installed / stopped responding), and the default model id it routes with. Status matters more than
  the endpoint: an ephemeral loopback port changes every launch and tells a user nothing they can act
  on, while "not installed" is the single most useful fact this page could show, because it explains
  every task failing at once.
- The one place a sign-in action IS correct is the engine's `401` with code
  `engine_not_authenticated`, which the engine's own contract names as the only condition a client may
  offer one for — and even then it is the ENGINE's sign-in, not ours.
- Needs a mojom addition, like item 12 did: `ModelSettings` has no engine state at all. Put it there
  rather than in a second call, since the page deliberately fetches everything in one.
- Done when the row shows the engine's real state and no fabricated endpoint, and when a machine with
  no engine says so on this page instead of looking configured.

**12. Populate the model picker from the catalogue.** `#model` has one hardcoded option and its value
is never read; `startTask()` takes no model. Port cowork's picker behaviour — searchable list,
grouped by provider, recently-used first, `auto` at the top — and thread a model through `startTask`
and the mojom. Done when a model chosen on the new tab is the model the task runs on, and the task
view reports it instead of the static `#reply-model` span.

*Resolved after reading both sides (cycle 40). The open question was where a catalogue could come from
at all, given the console returns 401 unauthenticated and this product has no sign-in.*

- **Source: the LOCAL ENGINE, not the console.** `GET /config/providers` returns
  `{providers: Info[], default: DefaultModelIDs}`, and each model carries `id`, `providerID`, `name`,
  `family`, `capabilities`, `cost`, `limit`, `status` and `release_date`. It sits behind the same HTTP
  Basic we already send, so it needs no new credential and no console round-trip.
- **Correction, from measuring it (cycle 60): the list is NOT what this machine can currently run.** This
  item originally claimed the opposite, as the reason to prefer the engine over a console catalogue. The
  engine advertises `redrob/auto` in that response and then answers the completions route for that same
  id with `400 model redrob/auto is not available on this engine`, because availability depends on a
  provider credential the engine can actually use while the list does not. The engine remains the right
  source — it needs no sign-in and no console round-trip — but the picker must treat an entry as a
  candidate rather than a promise: a choice can fail on use, and the failure has to read as the engine
  not being able to run that model, not as the user picking something unsupported. See ROADMAP findings
  34 and 35.
- **The facets map onto that shape rather than being invented**: `capabilities` → the capability
  filters, `cost` → the price band, `providerID` (plus a vendor inference) → the vendor filter. The
  reference's picker is a modal with facet groups, a token-wise search, a sortable table and an escape
  hatch to settings; its search deliberately matches every whitespace token against ONE haystack
  (description, title, provider id, model id, `provider/model`, vendor) so that typing the name a user
  SEES — provider then model — resolves. Copy that rule; a per-field substring test fails it.
- **Layers this touches, in order**: a mojom `ListModels()` plus a `model` argument on `StartTask`; a
  `TaskStore` that sends the chosen id instead of the `kModel` constant (verified in cycle 37 to be a
  wire value — `redrob/auto` is what the engine received); the picker UI; and the task view reading the
  task's own model rather than a static span.
- **The empty state is the normal state.** On a machine with no engine the list is unavailable, so the
  picker must say that and keep offering the one honest option rather than rendering an empty table.
  Chosen model persists per profile; `auto` stays the default.

**13. Presets for the provider sign-in form.** Authorize URL, token URL, client ID and scopes are
free-text today; nobody fills that in by hand. Follow cowork's connect flow: pick a provider, then
one secret, with the raw fields behind an advanced disclosure. Done when a provider can be connected
without the user knowing an OAuth endpoint.

## Wave 4 — settings becomes a settings page

**14. Make the nav a router.** All seven sections render at once in one scroll; `.page` has no hidden
state and `.nav-link` styles only `:hover`, so there is no sense of place. One section visible at a
time, current item marked, deep-linkable. Done when each section has its own URL and the nav shows
where you are.

**15. Search the long LISTS, not the settings page.** This item used to say settings needed a global
search across sections. Checking the reference says otherwise: its search is
`SettingsListSearchInput`, used *inside* a page to filter that page's own list (MCP servers,
extensions) — there is no cross-section settings search to copy. Ours has one list that genuinely gets
long: memory, which is capped at 200 entries. Routines can grow too. Done when the memory list has a
search input above it that filters as you type, with a leading magnifier and the count of what is
shown, and the same control is reused for routines if that list grows.

**16. Reconcile the section taxonomy with cowork.** Cowork: general, ai, appearance, preferences,
extensions, mcp, plugins, updates, advanced, debug. Ours: getting-started, routines, memory, models,
passwords, cli, files. Map ours onto cowork's names where they mean the same thing, and write down
each place they deliberately differ. Done when a user who knows cowork's settings can find the same
thing here.

**17. Fill the empty settings surfaces.** Appearance does not exist here at all — cowork has theme,
language and window sections. Add them; theme depends on item 2. Done when the browser's own
appearance is configurable from its own settings rather than only from `chrome://settings`.

**18. Fix the password chooser's ARIA.** `role="radiogroup"` wrapping buttons with `aria-pressed`.
Onboarding's copy of the same chooser already does it correctly with `role="radio"` and
`aria-checked` — make Settings match. Done when a screen reader announces three radios in a group.

## Wave 5 — manage what you created

**19. WITHDRAWN — already built.** Routine rows already carry Run now, Pause/Resume and Delete, and
show `lastError` when a run was skipped; the mojom has `RemoveRoutine`, `SetRoutineEnabled`,
`RunRoutineNow` and `UpdateRoutine`. The only thing missing against this item is that Delete has no
confirmation — fold that into item 8's dialog.

**20. WITHDRAWN — already built.** Memory rows already carry Pin/Unpin and Delete.

**21. Queued follow-ups get cancel.** The one real gap in this wave, and it is not UI-only: `#queued`
renders pending messages as plain `<li>` and `redrob.mojom` has no way to withdraw one — `SendFollowUp`
only adds. Needs a mojom method plus a `TaskStore` operation before any control can exist. Done when a
queued message can be dropped before it runs.

**21a. Edit a routine.** `UpdateRoutine` exists in the mojom and nothing calls it: the form only ever
adds. Done when an existing routine's prompt, schedule, permission and effort can be changed in place
instead of deleted and retyped.

## Wave 6 — the task surface

**22. Give the task tab a way home.** No home link or back affordance; the only route out is the
browser's Back. Done when the new tab is one click away from any task.

**23. Hide the composer for a task that does not exist.** When `tasks.get(openTaskId)` misses, the
follow-up form, its controls and its send button stay live against nothing. Done when a missing task
shows an empty state (item 4's anatomy) and no live form.

**24. Fix the trace's live region.** `#trace` is `aria-live="polite"` and is cleared and rebuilt on
every update, so a screen reader re-announces the whole history each time and any focus inside is
destroyed. Announce the newest step only; update in place instead of rebuilding. Done when a step
arriving announces one step and does not move focus.

**25. Make elapsed time tick.** `elapsed()` is computed at render with no timer, so "working 12s"
stays 12s. Done when a running task's timer advances without a push from the browser.

**26. Replace the emoji step icons.** `stepIcon()` returns `🕘 🗔 📷 🗎 🔑 ⑃ ⊘ ↺ ⋯ ☰ ⏱`, which fall
back to boxes without a colour emoji font and render inconsistently even with one. Use the product's
own icon set, as cowork does. Done when every step kind has a real icon.

**27. WITHDRAWN — effort is a fact, not a control, and the layout already says so.** This item and
item 17 were the same claim: that permission mode is changeable mid-task while effort only displays,
for no stated reason. Measuring it gives the reason. `redrob.mojom` has effort only as a `StartTask`
argument — there is no `SetEffort`, and the `Task` struct's own comment says the field is there so the
task "later still shows the effort it actually ran at". So effort is immutable by design, recorded
rather than offered. And the two are not even in the same place: effort sits in the task HEADER beside
the state, where facts about the run live, while the permission select sits in the composer, where
controls live. The sweep compared a header fact to a composer control and called the difference an
inconsistency. Nothing to change.

## Wave 7 — a command palette

**28. Build it on cowork's `command.tsx` anatomy**, over tabs, chats, history, bookmarks and settings
sections. This is the item that makes the rest reachable, so it comes after the surfaces exist rather
than before. Done when one shortcut finds anything named in the product.

*Reframed (cycle 51). This item and the shortcut removed from onboarding as 27c are the SAME feature,
and treating them separately is what made both look smaller than they are. Onboarding taught
Ctrl+Shift+E — "press it anywhere to ask about what you are looking at" — and that is precisely what a
command surface in this product is for: one chord, from any tab, to hand the browser a task with the
page you are on as context. The palette is that surface; the chord is its way in.*

- **Its blocker is not UI.** Nothing binds any chord to anything of ours: there is no Redrob command id
  in `chrome_command_ids.h`, no Redrob row in `chrome/browser/ui/accelerator_table.cc`, and we do not
  patch that file at all today. A page-level key handler would work only while `chrome://redrob` is
  already focused, which is the one situation where a user does not need it — the composer is right
  there and already has focus.
- **Context is the other half.** `StartTask` reserves `context_refs` as "opaque handles the browser
  process resolves — a tab, a selection, a bookmark", and nothing mints one. Without a ref for the
  active tab, "ask about what you are looking at" can only send the words, not the page.
- **Reference anatomy to keep**: an entry is `{title, detail, meta, searchText, onSelect}`, and
  `searchText` carries synonyms beyond the title so an entry is findable by the words a user would
  reach for rather than only its own name. Modes for drilling in (its root / sessions / agents) map
  onto ours as: start a task, recent tasks, settings sections, routines.
- **Judgement on scope**: our action space is about fifteen destinations, which is small for a palette
  — the model-picker call in item 12 was made on the same grounds. What earns this one its place is not
  the list length but the *anywhere*: the value is reaching the product from a tab that is not ours,
  which is the same reason the chord existed in the copy before it existed in the code.

## Standing rules for every item

- Read cowork's version of the thing before writing ours, and match its labels and anatomy.
- No competitor products named in code, comments, commits, PRs or docs.
- Every item ends with a screenshot of the changed surface at `:0`, light and dark, plus the
  keyboard path through it. An item without a screenshot is not finished (needs wave 0).
- Do not commit unless asked.
- After each item, list every control on the touched screen and confirm each has a handler — the
  dead-control class of bug is how this list started.
