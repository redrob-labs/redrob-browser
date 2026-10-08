# The delivery loop

Every capability we do not have, as one ordered queue a loop can run — one item per pass, each with an owner, an
acceptance line, and whether it costs a three-hour build.

Read `docs/CAPABILITY-MAP.md` for what each item IS and how its absence was verified. This document is only the
order and the ownership.

## The architecture this queue assumes

Decided before the queue was written, because the order depends on it.

| owner | keeps | changing it costs |
|---|---|---|
| **N** — native (fork) | window and tab layout, address bar, first paint, OS integration, installer, and the private capability surface itself | a full build, hours |
| **X** — extension | every pixel that is a document: settings, onboarding, side panel, new tab, dialogs | seconds |
| **E** — engine | all agent capability, and every setting that persists | minutes |
| **H** — helper | OS input, screen reading, on-device models. A separate signed process, installed by our installer alone | its own release |

**The boundary is crossed only through a namespaced private permission.** One ad-hoc channel and the rule is
dead. Measured today: our own UI is ~4,400 hand-written lines with exactly **three** seams to the browser
(`PageHandlerFactory.getRemote`) across 42 mojom methods, so the migration is re-homing three bootstrap points,
not rewriting the UI.

**And it unlocks the design system's component layer, which the fork can never reach.** Measured: our extension
is already **React 19.2.4 + Vite 8** with 28 JSX/TSX files, and `@redrob-labs/ui` is a React 19 package of 123
typed components and 262 icons. So a surface living in the extension can `import` the real components — the same
way our other React products do — while a C++/Views or WebUI surface can only ever take the CSS and token
layers and hand-build every control. That is why phase U below is not cosmetic: today "the design system is in"
means colour, type and spacing, and every control is still ours to maintain.

Three constraints that follow, and each one is a way this can go wrong:

1. The settings and onboarding extension must be **bundled as a component extension**. A store extension can be
   uninstalled, and a browser whose settings page can be uninstalled is broken.
2. The service worker holds **no state**. It is killed when idle. State lives in the engine, which is already
   true.
3. The same extension ships to other browsers **without** the private permissions and feature-detects them. Two
   codebases would diverge within a month.

## How the loop runs

One item per pass. A pass is done when its acceptance line is true and its gate is green — not when it compiles.

- Items marked **build** need `redrob.py build --flavour dev` and a real window before they can be called done.
- Items marked **no build** are extension or engine only. If a pass in phases 3–5 needs a build, the ownership
  rule was broken — stop and fix the rule, not the item.
- Every new gate is reverse-verified: put the fault back, watch it fail, then fix it again.
- One item per commit, item id in the subject.
- Phases are ordered by dependency, not by value. Do not reorder phases. Items WITHIN a phase may be reordered.

## Phase 0 — the foundation. Nothing after it works without it.

| id | item | owner | build |
|---|---|---|---|
| F-1 | Private capability surface: a namespaced permission class, restricted in the fork's API features, with one API registered through it | N | build |
| F-2 | The ownership rule, written down, with a gate that fails a UI file added under `sources/` once phase 3 has begun | N | no build |
| F-3 | Feature detection contract: the extension runs with the private APIs absent and degrades, proven by loading it in stock Chromium | X | no build |
| F-4 | Authenticated channel between extension and engine, matching what the browser's own engine port already does | X + E | no build |
| F-5 | **The channel cannot degrade to unauthenticated.** Today `engine-location.js` omits the Authorization header entirely when no token is stored, so a token-less engine on loopback answers anyone — any local process, not just us. A missing credential must be a refusal, not a downgrade. The credential should also stop being a long-lived secret the extension holds: the engine issues a challenge, the browser signs it with the profile's own identity through the private API, and the extension carries only a short-lived token it cannot mint | N + X + E | build |

F-5 is a Phase 0 item discovered after F-4 merged, and it is the one security gap in the queue: every other item fails
visibly, this one works perfectly while being wrong. It needs a build because signing belongs to the browser — the
extension must not be able to produce the credential itself, or the downgrade comes back by another route.

## Phase 1 — the engine reaches the user. Every agent item below is dead until it does.

| id | item | owner | build |
|---|---|---|---|
| G-1 | The engine ships with the browser, or onboarding installs it — decide which, then do it | N + X | build |
| G-2 | "The local service is not running" as a real UI state, not silence | X | no build |
| G-3 | Onboarding cannot finish claiming a working agent it cannot reach | X | no build |

**G-1 is decided: onboarding installs the engine.** It is not bundled with the browser.

The two options were not equal in cost. Bundling means every browser release carries a ~50 MB
engine binary per platform, the two version numbers move together whether or not either changed,
and an engine fix cannot reach a user without a full browser release. Installing on first run keeps
the two releasable apart, which is the same reason the surfaces are moving into the extension.

What the decision costs, stated plainly rather than discovered later:

- **The download is the browser's job, not the extension's.** An extension can fetch bytes; it
  cannot write an executable into `~/.redrob/bin` or mark it executable. So this is a private API
  (`getEngineInstallState`, `installEngine`, `onEngineInstallStateChanged`) and a browser-side
  installer, not an extension-side one.
- **First run needs the network.** A machine with no connection finishes onboarding with no engine.
  That is why G-3's honest exit exists and is not optional.
- **Integrity is a hash, not a signature.** The archive is checked against the `SHA256SUMS` the
  release publishes, which proves the bytes arrived intact and does NOT prove we asked the right
  host — both come from the same origin. A signature checked against a key shipped in the browser
  is the real answer and is not written yet. Worth knowing before this is called finished.
  (The engine's own shell installer does not check the hash at all, so this path is already
  stricter than the documented one.)

The resolution order the installer writes into is the one `SidecarClient::FindEngineBinary` already
searches: the environment override, then `~/.redrob/bin`, then `PATH`. Installing anywhere else
produces an engine the browser cannot find, which is the one failure a person cannot diagnose.

## Phase U — the design system's COMPONENT layer. Runs alongside phases 2–4, not after them.

Every surface that moves into the extension must arrive built from `@redrob-labs/ui`, not hand-rolled in the new
home. Doing this per surface as it moves is one pass; doing it afterwards is the same work twice.

| id | item | owner | build |
|---|---|---|---|
| U-1 | The package pinned by version + integrity, the way the token vendor already pins, and a clean install proving every subpath resolves | X | no build |
| U-2 | A gate that fails a hand-built control where the library ships one. The settings page already grew a second `.field` definition disagreeing with `.rr-field` on four properties, and nothing failed | X | no build |
| U-3 | Settings rows, fields, selects and buttons from the library — folded into S-2/S-3, not a later sweep | X | no build |
| U-4 | Onboarding steps, step dots and the Back/Skip/Next row from the library — folded into O-2 | X | no build |
| U-5 | Side panel and new tab from the library — folded into A-2/A-3 | X | no build |
| U-6 | **Icons: take all 262 glyphs.** Ours are 18 hand-drawn at 16×16 with round caps; the spec is a 24×24 box, 2px stroke, butt caps ("never round"), miter limit 3. Two of the eighteen have been migrated. Nothing gates this yet | X | no build |
| U-7 | **ModelPicker.** BLOCKED ON DATA, not on CSS: the component is a ranked top-five per profession and task, each pick carrying rank, monthly price, harness and a reason. `ListModels()` returns id, provider, name, capabilities and a price band — no rank, no monthly, no profession, no reason. Inventing a ranking in a control whose promise is "one honest ranking" is worse than a plain select | X + E | no build |
| U-8 | The three roles where the vendored header and the component sheet disagree stay recorded, and a pin bump that changes them fails rather than sliding under | X | no build |
| U-9 | Retire the local control CSS each surface leaves behind, per surface, in the same pass | X | no build |

U-7's dependency is the engine, not the library: it needs a ranked model source, which is why it sits beside
phase 5 rather than inside phase 2. U-6 is independent and can run any time — it is the largest visible quality
gap that costs nothing but care.

## Phase 2 — settings move out of C++. Smallest migration, largest maintenance win.

| id | item | owner | build |
|---|---|---|---|
| S-1 | The 23 settings mojom methods re-homed onto the private API | N | build |
| S-2 | Settings page rendered by the extension, grouped, one route per section | X | no build |
| S-3 | One row component for every row, taken from `@redrob-labs/ui` (U-3); no per-section layout and no hand-built control | X | no build |
| S-4 | Search across titles AND descriptions, jumping to the row | X | no build |
| S-5 | Browser preferences people look for — default search engine, languages, spell check, zoom — surfaced here, and the rest linked, not reimplemented | X | no build |
| S-6 | One status banner slot: default browser, update available, engine missing | X | no build |
| S-7 | Delete the C++ settings page | N | build |

## Phase 3 — onboarding moves out.

| id | item | owner | build |
|---|---|---|---|
| O-1 | The 7 onboarding mojom methods re-homed onto the private API | N | build |
| O-2 | Onboarding rendered by the extension, every control from `@redrob-labs/ui` (U-4) | X | no build |
| O-3 | Email → verification code step, six boxes, resend countdown, whole-code paste | X | no build |
| O-4 | Import step: source cards, then that source's profiles with last-used times | X | no build |
| O-5 | Split layout — what is being asked for, shown beside the asking | X | no build |
| O-6 | A step stating the product's position. One claim, written by a person | X | no build |
| O-7 | Credential step with an honest line about where credentials live and what the model sees | X | no build |
| O-8 | Delete the C++ onboarding page | N | build |

## Phase 4 — the agent surface moves out.

| id | item | owner | build |
|---|---|---|---|
| A-1 | The 12 agent mojom methods re-homed onto the private API | N | build |
| A-2 | Side panel rendered by the extension, controls from `@redrob-labs/ui` (U-5) | X | no build |
| A-3 | New tab rendered by the extension, controls from `@redrob-labs/ui` (U-5) | X | no build |
| A-4 | Rich answer rendering: maths, diagrams, syntax highlighting | X | no build |
| A-5 | A launch surface naming what the agent can already act in, with example prompts | X | no build |
| A-6 | Side-panel session policy on tab change: new session or keep | X + E | no build |
| A-7 | Delete the C++ agent WebUI | N | build |

## Phase 5 — subscriptions and money. The engine already has the auth paths.

| id | item | owner | build |
|---|---|---|---|
| M-1 | Provider list sourced from the engine, never hardcoded in the browser | X + E | no build |
| M-2 | Connect an existing paid subscription. **Acceptance is end-to-end on a real account: that provider's own usage must move** | X + E | no build |
| M-3 | Own API key, behind the subscriptions, stored by the engine and never rendered back | X + E | no build |
| M-4 | Plan and usage, with the source of every number stated | X + E | no build |
| M-5 | Usage statistics: sessions, last active, weekly average, activity heatmap | X + E | no build |
| M-6 | Commercial state where a person will see it: trial ended, payment failed, billing expired | X | no build |
| M-7 | Referral link crediting both sides | X + E | no build |
| M-8 | A separate model for image generation | X + E | no build |
| M-9 | The user adds and removes models from the catalogue | X + E | no build |
| M-10 | Model pins migrate instead of breaking | E | no build |
| M-11 | Compaction and retry as user settings | X + E | no build |

## Phase 6 — skills. Cheap per skill, and worthless without the mechanism.

| id | item | owner | build |
|---|---|---|---|
| K-1 | Typed domain objects in code mode: page, screen, mail, vault — not a tool list | E | no build |
| K-2 | Skill auto-arming from frontmatter URL patterns and keywords | E | no build |
| K-3 | A real document toolchain in code mode: read AND write Word, Excel, PowerPoint, PDF | E | no build |
| K-4 | First skills written against K-1, one per integration we claim | E | no build |
| K-5 | A skill that writes skills | E | no build |
| K-6 | Curated tool-server presets, named, including desktop apps | X + E | no build |
| K-7 | Per-server tool inventories, so a user can see which tools are live | X + E | no build |
| K-8 | External password managers as first-class integrations | E | no build |

K-1 comes first and is not optional: a skill document is cheap BECAUSE the objects exist. Porting skill text without
the objects ports documents that cannot run.

What K-1 and K-2 look like when they are real, from a capability audit of a shipped competing browser:

- **K-1 is a REPL tool with typed globals, not a tool list.** Each skill opens by naming the global it drives --
  `page`, `channel`, a per-integration object -- and the skill body is JavaScript against it. One audited build carried
  13 such globals, and the busiest was the page object, named in two thirds of its skills. A skill that has to describe
  a tool call instead of a method is the shape K-1 is meant to replace.
- **K-2's frontmatter is two keys beside the existing ones**: an icon, and an auto-arm block carrying keyword and URL
  glob lists (`docs.google.com/document/**`). Under half the audited skills used it, which is the point -- a skill that
  arms on everything is a skill that is always in the prompt.
- **Scale check.** That build shipped 32 skills; we ship one. The gap is not the prose, it is K-1 and K-2 -- without
  them there is nothing for 32 documents to be written against.

## Phase 7 — the agent stops being a chat.

| id | item | owner | build |
|---|---|---|---|
| W-1 | Work survives the window closing | E | no build |
| W-2 | Agent-owned tabs expire after an idle period | N + E | build |
| W-3 | Task notifications, separately toggleable: needs attention, task done, routine done | X + E | no build |
| W-4 | Completion sound, custom file allowed | X + E | no build |
| W-5 | Routines proposed on a cadence when a repetition is noticed | E | no build |
| W-6 | Episodic memory with offline consolidation | E | no build |
| W-7 | Consolidation runs listed, inspectable, revertible, and triggerable by hand | X + E | no build |

## Phase 8 — reach beyond the page.

| id | item | owner | build |
|---|---|---|---|
| P-1 | The helper process: signed, installed by our installer alone, its own protocol version | H | its own release |
| P-2 | Screen reading as text, locally | H | — |
| P-3 | OS-level control: drive applications outside the browser | H | — |
| P-4 | On-device model, image description and upscaling on the NPU, no key and no network | H | — |
| P-5 | Coordinate fallback when selectors cannot address a control | E + H | no build |
| P-6 | Solving a human-verification challenge | E | no build |
| P-7 | Image generation and editing in the conversation | E | no build |
| P-8 | Ambient observation with rules: observe or do-not-observe per site AND per native application, pausable | H + E | — |
| P-9 | Sending messages as the user, ask-first or automatic, waiting for the reply | E | no build |
| P-10 | Paying with a stored card: spend cap by day or month, ask-first under a threshold, a note per card | E | no build |

P-9 and P-10 are the two items in this whole queue that can cost a user money or reputation. Neither ships
without an explicit default-off and a confirmation path, and P-10's spend cap is not a setting to add later.

**P-2 and P-4 are platform calls, not models we train or ship.** A capability audit of a shipped competing browser
found its helper declaring OS AI APIs for exactly these: text recognition for reading a screen as text, an image
scaler for upscaling, and foreground/object extraction for describing and editing. It carried one workload manifest
per NPU vendor and nothing else — no weights of its own. So the cost of P-2 and P-4 is binding to an OS AI surface and
shipping a per-NPU manifest, which is small; the real cost stays in P-1, the signed helper that is allowed to call it.
This also means both are available only where that OS surface is, so each needs a stated answer for platforms without
one rather than a silent absence.

## Phase 9 — the browser people expect.

| id | item | owner | build |
|---|---|---|---|
| B-1 | Content blocking: subscription lists, custom rules, and an answer to "why was this blocked" | N + X | build |
| B-2 | Agent in the address bar: tab context, file context, a mode that is visibly not a search | N + X | build |
| B-3 | A global quick window: own shortcut, own size, reachable unfocused | N + X | build |
| B-4 | Bookmarks section inside the tab rail | N | build |
| B-5 | Tab insertion position, horizontal tab shrink, tab switcher by recency | N | build |
| B-6 | Tab preview on hover | N | build |
| B-7 | Window background translucency | N | build |
| B-8 | Automatic picture-in-picture | N | build |
| B-9 | Multiple profiles with a switcher of ours | N + X | build |

**B-3, B-5's switcher and B-6 are mostly EXTENSION work, and this table has them as native.** A capability audit of a
shipped competing browser measured the split: the quick window, the tab switcher and the hover preview are extension
PAGES there, and the native side contributes only a pref getter/setter pair per behaviour plus a shortcut that opens a
page. Same for W-3's notifications. So each of these is one small `build` slice — four prefs and a window-opening
command, done ONCE — and then three surfaces that are `no build` like every other document we own.

Re-planning them is a separate pass, not a rider here, because the native slice is shared and should be cut once rather
than three times. What is recorded now is that the `build` label on all of B-3/B-5/B-6 overstates the cost, and that
pricing them as full native features is why they sit at the bottom of the queue.

## Phase 10 — data in, data across.

| id | item | owner | build |
|---|---|---|---|
| D-1 | Import from Firefox and Safari | N | build |
| D-2 | Import a browser's encrypted store, through a privileged service. The platform's app-bound encryption already ships with our fork; nothing of ours uses it | N | build |
| D-3 | Import progress, cancellable, with events | N + X | build |
| D-4 | File associations for HTML and PDF, and an installed-web-app group | N | build |
| D-5 | Local-network discovery rule at install time | N | build |
| D-6 | A version floor below which upgrade is refused and a clean install forced | N | build |
| D-7 | Sync across devices | E + console | no build |
| D-8 | Credential vault — only if we mean it. A vault is a promise about other people's passwords | X + E | no build |

## Phase 11 — install and first impression.

| id | item | owner | build |
|---|---|---|---|
| I-1 | Download progress window carrying our brand. No artefact exists to match; design it from our own system | N | its own binary |
| I-2 | Installer copy in our voice, in the string table | N | build |
| I-3 | Download page handing the right artefact per platform, with its checksum shown | web | no build |
| I-4 | **The first-run terms dialog must stop asking agreement to a document it does not show.** Official build, since 0.1.0 | N | build |

I-4 is a defect, not a feature, and it is the only item in this queue that is live in a shipped release. It is
placed last only because it is small; if the queue is ever paused, do this one anyway.

## What this queue does not contain

- Anything already built. `CAPABILITY-MAP.md` marks those `yes`, and three of them are places we are ahead
  rather than behind.
- The Windows installer build, which is out of scope by decision.
- Any item justified only by the reference build having it. Presence in someone else's product is not a reason;
  each item above is here because a person using ours hits its absence.
