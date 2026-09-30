# The product-surface programme

Every surface a person meets before they ever load a page — the download, the installer, first run,
and the settings shell — brought onto the design system, and brought up to the information
architecture in the UX reference set.

This document is the executable plan. Each slice below is bounded, has its own gate, and states what
"done" means in terms something can check. A loop drives it one slice at a time, in order, and each
slice ends in a build, a captured frame, and a commit.

## The reference set

Thirteen frames, at `~/workplace/redrob-browser-refs/ux-reference-2026-09-30/01..13.png`.

**They are deliberately outside this repository and must stay outside it.** They are a third party's
product screenshots: committing them puts someone else's copyrighted interface in our history, and
this repository's own rule is that a competitor is never named in our documents, commits, PRs or code
comments. Cited here by NUMBER and by what the frame *shows*, never by whose product it is. Anyone
implementing a slice reads the frame for its information architecture — what facts a step must carry,
in what order, with what controls — and then draws it in our own language. Nothing is traced.

| # | What the frame shows | Slice |
|---|---|---|
| 01 | Installer download window: centred status, thin progress bar, brand aurora bleeding from the bottom edge, minimise + close only | 7 |
| 02 | First-run sign-in: split panel, mark and wordmark, three-line display headline, email field, primary action, federated action | 2 |
| 03 | Email verification: back chevron, headline, destination address, six single-digit boxes, action with spinner, disabled resend with countdown | 2 |
| 04 | Import step: centred title, two source cards with a check badge on the chosen one, four-dot pager, Skip + Next with a return hint | 3 |
| 05 | Profile picker over the import step: source mark, profile rows with relative last-used time, a check on the chosen one, Back / Cancel / Import | 3 |
| 06 | A claim step: centred title, two-line sub, a tilted three-row grid of third-party marks | 4 |
| 07 | Credentials step: split panel, radio cards each with title + sub, one carrying an info affordance, and an animated explainer on the right | 5 |
| 08 | Vault password modal: titled header with a mark, two password fields with reveal and helper text, a biometric toggle row, Cancel / Next | 5 |
| 09 | Model step: radio cards with a mark, a name, a "Recommended" badge, a sub, then a text link to more | 6 |
| 10 | More-options modal: scrollable provider list, parent dimmed | 6 |
| 11 | Own-API-key modal: same pattern, visible scrollbar | 6 |
| 12 | Small confirm modal: mark, title, two-line body, Cancel / Connect with an external hint | 6 |
| 13 | The shell with settings open: left rail with profile chip and grouped sections, a settings nav column with group labels and "New" badges, and a content pane of grouped rows each with title + sub + one control | 8, 9 |

What the set is actually teaching, across all thirteen frames, is four things we do not do yet:

1. **A step is a claim plus one decision.** Title, at most two lines of sub, then exactly one thing to
   choose. Never a form.
2. **A modal is where a sub-decision goes**, over a dimmed parent whose own controls stay visible and
   disabled — so the person can see they have not lost their place.
3. **Every list row is title + sub + one control on the right.** Group label above, card around the
   group. That single pattern carries all of settings.
4. **The keyboard is drawn.** A return hint on the default action, a countdown on a disabled one.

## What exists today

Measured, not assumed.

| Surface | State |
|---|---|
| `chrome://redrob` new tab | On the design system (tokens, component layer, fonts). 12 step glyphs still hand-drawn |
| `chrome://redrob-onboarding` | 6 steps already declared: `welcome account agent passwords model import`. 726 lines. Only `import` is built out |
| `chrome://redrob-settings` | 8 sections, 1516 lines. Fields on `.rr-field`/`.rr-control` since the component layer landed |
| Vertical sidebar (C++ views) | Design-system colour roles, except one local exception — the light wash |
| Installer | Linux packaging only (`sources/chrome/installer/linux/`). No branded download or install surface on any platform |
| Account / vault / subscription | Nothing. Zero hits for vault, device flow, subscription plumbing |

So `account`, `agent`, `passwords` and `model` are declared steps with no content, and the reference
set describes exactly what belongs in each. That is the spine of the programme.

---

## Slice 1 — the last 16 hand-drawn glyphs — **DONE**

**Why first.** It is the only slice with no open design question, it touches one file pair, and it
retires a rule nothing currently enforces.

Measured inventory: **16 unique glyphs at 17 sites** — 12 `stepGlyph` cases, the queued-message
withdraw mark, and three in `redrob.html` (permission shield at two sites, a back chevron, a
not-found ring). An earlier note in `DESIGN-SYSTEM.md` said 18; that was a miscount of sites for
glyphs and is corrected here.

They are drawn at 16×16 with round caps at stroke 1.3–1.6. `45-icons.md` specifies 24×24 on a 20px
live area, stroke 2 unscaled, **butt** caps ("Never round"), miter joins at limit 3, every diagonal
at 40° and dots as a 2×2 filled square. The set ships 252 glyphs on that geometry.

The mapping, each justified from the spec rather than by eye:

| Step | Today | Design system | Grounds |
|---|---|---|---|
| `kSearchedMemory` | clock | `history` | "`refresh` / `history` — same ring; refresh clockwise, history counter-clockwise." Looking back is `history` |
| `kOpenedPage` | window | `browser` | Product and work group |
| `kCapturedScreenshot` | camera | `camera` | Media group |
| `kSavedArtifact` | page, folded corner | `save` | Files and documents: "save and restore" |
| `kUsedCredential` | key | `key` | "`key` — access granted (vs `lock`, access withheld)" |
| `kSpawnedSubagents` | one into two | `split` | Objects and controls: `split` / `merge` |
| `kRefused` | barred ring | `blocked` | Status and feedback: rings and glyphs, withheld |
| `kSteered` | a turn taken | `route` | Evidence group. "Beads on a line lose to a staircase (`route` has no beads)" — a run's path changing |
| `kQueuedMessage` | three dots | `pending` | The spec's own words: "`pending` is three dots, not a clock"; "a time vs **a wait with no time**" |
| `kPlanned` | three lines | `list` | A plan is a list. NOT `checklist` — nothing in the trace is tickable, and a tick claims a state we do not have |
| `kRoutine` | clock with a crown | `repeat` | Time and scheduling. A routine fires on its own; that is recurrence |
| `kThinking` | a bare circle | `pulse` | Not `sparkle` ("for generated content only") and not `spark` ("use sparingly"). And the current glyph is a named failure mode: "**A primitive rather than a thing** (`record` as a bare circle)" |
| withdraw mark | an ✕ | `close` | "the shape is universal: close, search, chevrons" |
| permission | shield + tick | `shieldCheck` | State group |
| back | chevron | `chevronLeft` | Interface group |
| not found | ring + bang | `alert` | Status and feedback |

**Two of these are meaning decisions and are taken here, not deferred.** `kSteered` → `route` and
`kThinking` → `pulse`. The earlier note said they had no equivalent in 252; re-read against the
spec's group table they do, and leaving them hand-drawn is what forces the whole set to stay
non-spec.

**The transport problem, and why this is not a copy-paste.** The design system ships icons as a React
module (`dist/icons/index.js`: `name: (p) => svg(p, [h('path', {d: …})])`). This is a WebUI under
Trusted Types with no React and no bundler resolving `node_modules`, and assigning `innerHTML`
throws. So the geometry must arrive as **data, in the tree, before the build**, exactly as the two
stylesheets and the eight fonts already do.

- `scripts/vendor_design_system.py` gains an icon step: parse the pinned tarball's icon module, emit
  `design_icons.ts` — a frozen table of `name → [[tag, attrs], …]` for the 16 we use, plus the shared
  frame attributes (`viewBox 0 0 24 24`, `stroke-width 2`, `stroke-linecap butt`, `stroke-linejoin
  miter`, `stroke-miterlimit 3`). Generated, never hand-edited, pinned by the same integrity hash.
- `redrob.ts`'s `stepGlyph` switch becomes a lookup into that table. `stepIcon` keeps building
  elements with `createElementNS`, which is already Trusted-Types-safe.
- The four `redrob.html` glyphs become `<svg>` with the shared frame and the vendored geometry.

**Gate — check 9: no hand-drawn glyph.** Fails on any `<path>`, `<circle>`, `<rect>`, `<line>`,
`<polyline>` or `<ellipse>` in our WebUI markup or TypeScript whose geometry is not byte-identical to
an entry in `design_icons.ts`, and on any `stroke-linecap: round`, `stroke-linejoin: round`, stroke
width other than 2, or `viewBox` other than `0 0 24 24` on an icon selector. Today it would fail 16
times; after the slice, zero. Reverse-verify by restoring one round cap.

**Done when.** `stepGlyph` contains no path data; check 9 green; the trace rendered in the built
binary with one step of each kind visible, captured, and each glyph's ink box measured to sit inside
the 20px live area scaled to the render size.

---

## Slice 2 — the light rail is off-brand — **DONE** (the 132px product wash deferred to 2b)

**The report.** The light sidebar does not look like ours. It is correct: the column is painted
`#e9fbff`, a cyan measured off an old mock (`#e1faff` at the top, `#f6fefe` at the foot), and **no
Redrob ramp contains it.** It is the last entry in `ALLOWED_LOCAL_COLOURS`, justified on the grounds
that the design system "does not define a window-chrome wash".

**That justification was wrong, and it was wrong because a token was missing.** The design system
defines the rail precisely:

```css
.rr-shell__side                         { background: var(--surface-sunken); }   /* light */
[data-theme="dark"] .rr-shell__side     { background: var(--surface-raised); }   /* dark  */
.rr-shell[data-product] .rr-shell__side {
  background-image: linear-gradient(180deg, var(--product-wash) 0, transparent 132px);
}
.rr-shell[data-product="browser"]       { --product-wash: var(--product-browser-wash); }
```

So a Redrob rail is a neutral ground plus **its product's own wash, fading out at 132px** — an edge
fade under the brand mark, not a tint over the whole column. `--product-browser-wash` resolves to
`--product-browser-1` `#fff3f8` in light and `--product-browser-10` `#420028` in dark (the dark one
at 55%).

It could not be used because **`--product-browser-wash` was declared nowhere.** The delivery's
`tokens.json` defines 119 product tokens; its `tokens.css` declared none of them, so all 28 of those
`.rr-shell[data-product]` declarations were invalid and silently dropped — in this browser and in
every other Redrob app. Fixed upstream in `@redrob-labs/ui` 1.0.2, with a gate
(`references:check`) that fails on any `var()` naming a property nothing declares.

Note the dark rail is **already** right: `#141719` is `--surface-raised`, which is what the design
system paints there. Only light is wrong, which is exactly what was reported.

**The change.** Pin 1.0.2. Then:

- light rail ground `#e9fbff` → `--surface-sunken` `#eff1f4`; `kSidebarWashLight` deleted, leaving
  `ALLOWED_LOCAL_COLOURS` **empty**.
- the top 132px carries `--product-browser-wash`.

**The risk, named up front.** A full-column background belongs in the colour pipeline
(`kColorFrameActive`), not a local `views::Background` — a previous attempt proved the latter is
overpainted further down the same constructor, and reordering it displaces the structural
`CustomCornersBackground` that draws the rounded seam. A **gradient** therefore cannot go in the same
place as the flat colour. The wash is only the header region, so the slice attempts it on the header
view alone and, if that view does not own its own paint, ships the corrected flat ground and records
the wash as its own slice rather than forcing it.

**Done when.** `ALLOWED_LOCAL_COLOURS` empty; palette compiled and diffed against the previous
revision showing the light rail as the only role that moved; both themes captured and the rail's
pixels sampled against the token values.

---

## Slice 2b — the rail's 132px product wash

Deferred out of slice 2 with a measured reason rather than a preference. `--product-browser-wash` resolves now
(1.0.2), so the value is available; what is missing is a view to paint it on. The column's fill is whatever
`kColorFrameActive` resolves to, and going through the colour pipeline is what preserves upstream's rounded
seam between sidebar and page — installing our own gradient background on the column replaced that seam, and
painted nothing at all until it was ordered after upstream's own `SetBackground`. A gradient needs a view that
owns its paint, and none spans the column's top band: `RedrobSidebarSections` is the whole list and
`RedrobAccountRow` is its foot. So this slice adds one, which is a change to the column's structure.

Light `--product-browser-1` `#fff3f8`, dark `--product-browser-10` `#420028` at 55%, reaching transparent at
132px, over the ground slice 2 already corrected.

## Slice 2c — one compiled icon module for all three bundles

`design_icons.ts` is compiled by the `redrob/` bundle's `build_webui` target, and a sibling bundle's `ts_files`
are relative to its own directory, so the settings page carries its two glyphs as a transcribed `<symbol>`
sprite instead. Check 9 compares every coordinate against the table, so the transcription cannot drift — but
two definitions of one glyph is still one too many, and the onboarding slices will each want glyphs of their
own. This slice makes the compiled module reachable from all three, the way `input_files_base_dir` already
makes the one copy of the fonts and the sheets reachable.

## Slice 3 — the import step, and the modal pattern

Refs 04, 05. The one step that already has content, so it is where the reference set's modal pattern
gets built once and reused by slices 5 and 6.

- Source cards: mark, name, a check badge on the chosen one. `.rr-card` + the choice pattern already
  in the step markup.
- The profile picker as a **modal over the step**: parent dimmed, parent's own Skip/Next visible and
  disabled, its own Back / Cancel / Import. Relative last-used time per profile.
- The pager and the return hint on the default action.

**Deliverable beyond the step itself:** `redrob_modal.ts` + the styles, on `.rr-` components, with
focus trapped, `Esc` closing, focus restored to the invoking control, and the parent marked
`aria-hidden` while open. Slices 5 and 6 import it.

**Gate — check 10: a modal keeps its parent reachable.** Every modal has an accessible name, a
trapped focus ring, a restored focus target and an `Esc` path. Asserted in the built binary over CDP,
not read off the source.

---

## Slice 4 — the claim step

Ref 06. A centred title, a two-line sub, and a tilted grid of third-party marks.

Two constraints the reference cannot answer for us:

- **The marks are other companies' logos.** `46-imagery.md` and the logo spec govern what we may
  ship. This slice ships the layout and the motion with our own placeholder tiles, and the question
  of which third-party marks we have the right to display is escalated rather than decided here.
- **The claim itself must be true of our product.** The copy is written from what our engine actually
  does, and is checked against `07-voice.md`. No claim is carried over from a reference frame.

**Done when.** The step renders the grid at the reference's perspective and row rhythm, degrades to a
flat grid under `prefers-reduced-motion`, and every string traces to a `.grd` entry we authored.

---

## Slice 5 — credentials and the vault

Refs 07, 08. The largest slice, and the only one that stores a secret.

- The step: radio cards, one per approach, each title + sub, with the security implication stated on
  the card rather than in a tooltip.
- The vault modal: two password fields with reveal, "8 or more characters" as helper text tied to the
  field with `aria-describedby`, and a biometric toggle row.

**Security, stated before any code.** This slice introduces a local secret store. It does not ship
until: the key derivation and at-rest format are written down and reviewed; the plaintext never
crosses the Mojo boundary into a renderer; the WebUI receives *state* (locked / unlocked / absent)
and never a value; and the platform biometric path is real rather than a toggle that stores a flag.
A vault that looks finished and is not is worse than no vault. **This is the slice most likely to
need a decision from outside the loop, and the loop must stop and ask rather than invent a format.**

**Gate — check 11: no secret reaches a renderer.** The mojom for this surface carries no field that
can hold a credential value, asserted structurally against the `.mojom`.

---

## Slice 6 — the model step, and the ranking behind it

Refs 09–12, plus the `ModelPicker` work already designed in `DESIGN-SYSTEM.md`.

The reference's step is a radio card group, a text link to more, and three nested modals. Ours has
to carry one thing theirs does not: the ranking is **ours**, and `55-agents.md` requires one ranking
shown identically across every app with no re-ranking to favour the product it appears in.

**Sub-slice 6a — the engine. BLOCKED, and the block is measured rather than assumed.**

The transport is settled and unremarkable. The engine is an Effect `HttpApi`: a schema, a group in
`packages/protocol/src/groups/`, a service in core, a handler in `packages/server/src/handlers/`, wired into
`api.ts` and `handlers.ts`. `variant.ts` is the closest existing shape, since it is also a route that fronts
something the console owns. That part is a day's work and needs no decision.

**What does not exist is the ranking itself.** Searched, not guessed:

| Where a monthly ranking could live | What is there |
|---|---|
| `redrob-console` | **zero** occurrences of `leaderboard`. The engine already reaches it at `console.redrob.ai/api/backend/v1/models` for the model catalogue, so the path exists — the endpoint does not |
| `redrob-code` (the engine) | nothing |
| The design system delivery | a **dated example**: `reference/components/ModelPicker/preview.html`, 10KB, `edition: "September 2026"`, with professions, picks, `monthly`, `why` and `harness` |

The third row is the trap. It is a complete, correct-looking payload, and shipping it is precisely the failure
rule 6 forbids — "a September edition compiled into a browser someone installs in March is a false claim with
a date on it". It is a preview fixture, not a maintained source, and nothing updates it.

So there are three unanswered questions, and every one of them is a decision rather than a lookup:

1. **Who authors the monthly ranking, and against what?** `55-agents.md` promises "one ranking, honest ...
   nothing is re-ranked to favor the product the picker is in", which is a commitment about a process, not a
   data format.
2. **Where is it served from?** The console is the consistent answer — the engine already holds a credential
   for it, so no second fetcher and one cache — but that means a new console endpoint and a new thing for the
   console to own.
3. **What happens between editions?** `edition` is mandatory and a payload without one is refused, so the
   answer cannot be "serve the last one forever" without saying how stale is too stale.

**The loop must stop here.** Writing the endpoint now would produce a route that returns `null` for months —
which is honest, and is also not the feature — or, worse, one seeded from the preview fixture, which is the
one outcome the design explicitly rules out. Escalated rather than decided.

What is NOT blocked, and can proceed independently: **sub-slice 6b's step layout**, on the plain `<select>`
fallback the design already requires for the no-engine case. The ranked list is the part that waits.

**Sub-slice 6a, once a source exists.** The leaderboard reaches the browser the way the model list already
does: WebUI → mojom → `TaskHostImpl` → `TaskStore` → engine HTTP. No second fetcher in the browser,
one cache, one place to verify a payload, and the same bytes behind the same ranking in three
products. The mojom shape and the six rules it must keep (never sort, absent renders as absent,
`edition` mandatory, decode one entry at a time keeping the failure reason, convert currency in the
page, **ship no fallback copy**) are already written in `DESIGN-SYSTEM.md` and are not restated here.

The engine side is a new endpoint in `redrob-code`'s server package plus its schema, and the browser
side is the mojom, the `TaskStore` call, and the decode. **Three things are open and need answering
before the picker can claim to be finished**, also recorded in `DESIGN-SYSTEM.md`: Redrob Auto needs
a second engine capability (`matchedTask` per turn), the three override layers need a pref and a
migration rule, and `here` is a string the two sides must agree on and should assert rather than
assume.

**Sub-slice 6b — the step.** The radio cards, the nested modals on slice 3's component, and the
plain `<select>` fallback retained for the no-engine case. The composer's three selects stay as they
are: `.rr-control` is a bordered filled field and that row's own reference forbids a fill, a border
and a pressed state, and `<select>` sizes to its widest option, which is the bug the current
transparent-overlay construction exists to avoid.

---

## Slice 7 — the download and the installer

Ref 01. **This surface does not exist on any platform.** The repository has Linux packaging and
nothing else, so this slice is new work rather than a restyle, and it is the one surface a person
meets *before* the product is on their machine.

- A download page and an installer window sharing one visual language: centred status line, a thin
  determinate progress bar, and the brand's aurora bleeding from the bottom edge — which is our own
  `gradient-light` and the wash tokens, not a reproduction of the reference's palette.
- Minimise and close only. No maximise on a fixed-size window.
- Every state drawn, not just the happy one: verifying, no network, insufficient space, a failed
  signature check, and a resume. The reference frame shows one state; an installer that has only that
  one is an installer that lies.

**Constraint.** The installer is signed code that runs with the user's trust before anything else in
the product does. Its copy, its failure states and its signature handling are reviewed, and the
packaging for each platform is a separate decision from the visual design. This slice delivers the
design and the web download page first; per-platform installer UI follows once the packaging path for
that platform is settled.

---

## Slice 8 — the settings shell

Ref 13, right-hand two thirds. Eight sections exist; the reference shows the pattern they should all
follow.

- A nav column with **group labels** (Personal / Agent / Features / Archived), and a `New` badge
  where something is new.
- A content pane of **grouped cards**, each row title + sub + exactly one control on the right —
  select, toggle, button, or a chevron into a sub-page. One pattern, no exceptions.
- A promo banner at the top of General with a single action (ours: make Redrob the default browser).
- External-link rows carry the external glyph.

**Gate — check 12: one row pattern.** Every settings row resolves to title + sub + one control. A row
with two controls, or with a control and no label, fails.

---

## Slice 9 — the left rail's own information architecture

Ref 13, left third. Today the rail is tabs. The reference shows a rail carrying a profile chip, a
search affordance, a panel toggle, and **three grouped lists** — bookmarks with a drop target, chats,
and tabs — each with its own "new" row.

This is the largest behavioural change in the programme and the one furthest from what exists, so it
is last: it depends on slice 2 for the rail's ground, slice 1 for its glyphs, and slice 6 for what a
chat row means.

---

## How the loop runs a slice

1. Read this file and `docs/DESIGN-SYSTEM.md`. Take the first slice not marked done.
2. Read the reference frames it cites, for information architecture only.
3. Read the design system's own spec pages for the surface (`45-icons.md`, `40-surfaces-and-motion.md`,
   `07-voice.md`, `90-web.md`) **before** writing, and quote the line that justifies each choice.
4. Implement. New values come from a token, never a literal.
5. Add the slice's gate and **reverse-verify it** — inject the fault, watch it fail, restore.
6. Run every gate. Build. Capture both themes on `:0`. Read computed styles from the live binary over
   CDP rather than believing the stylesheet.
7. Commit, push, PR, and confirm the new gate ran **in the CI log**, not just that the tick is green.
8. Append what was learned to this file. Mark the slice done. Stop.

**Stop and ask, rather than deciding, when:** a third party's mark or copyright is involved (slice 4),
a secret's at-rest format is undecided (slice 5), a ranking would have to be invented to fill a field
(slice 6), or a platform's packaging and signing path is unsettled (slice 7). Those four are the
places where a plausible guess is worse than a pause.
