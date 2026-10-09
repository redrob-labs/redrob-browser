# UI/UX redesign — every surface onto Redrob-UI

Status: **approved, phase 0 in progress.** Written 2026-10-09.

## The brief, as decided

| # | Decision |
|---|---|
| Scope | Everything: native window chrome, every Chromium surface, the agent extension, first-run onboarding, the claw apps |
| Target | `@redrob-labs/ui` itself — its components, tokens, icons and AppShell — is the visual reference |
| Depth | Rework: information architecture changes, not only a re-skin |
| Extension consumption | **Option A**: `@redrob-labs/ui` as a real dependency; `tokens.css` + `styles.css` + fonts imported; shadcn variables re-pointed at the semantic tokens. The hand-copied `--rr-*` layer is deleted |
| Icons | The design system's glyphs only, everywhere. lucide (77 distinct icons, 101 files) goes |
| Product colour | Browser's pink product wash on the native sidebar and on the extension's frame; controls stay Redrob Blue |
| Native ladder | Adopt the design system's values for the four documented divergences |
| Themes | system / light / dark, as `ThemeSwitch`, with **one** source of truth shared by the native chrome and every page |
| Korean | From the first PR. The extension and the onboarding app have **no i18n today** (no `chrome.i18n`, no library, ~150 hard-coded strings), so this is infrastructure, not translation |
| Delivery | Small PRs into `develop`, `<type>/<slug>` branches, squash-merged, no reviewers requested automatically |
| Verification | Machine-tested on the sandbox server: screenshots, computed styles, contrast, fonts, both themes, both languages |
| Native build | Built on the self-hosted `chromium-build` runner; the `.deb` is downloaded to the sandbox and captured there |
| Claw apps | Restyled, not deleted (phase 6) |
| Korean review | The product owner reviews every Korean string before its PR merges |
| Spec source | `@redrob-labs/ui` only. The design delivery's numbered spec documents are not a source for this work; where a rule is quoted from one in an existing comment, the package's own CSS and components decide |

## What Option A means for "Redrob-UI as the target"

Option A imports the design system's CSS but not its React components. Matching the target therefore
works like this:

- Tokens, fonts, `::selection`, autofill and scrollbars arrive from the package itself.
- Layout surfaces whose markup is simple (`rr-shell`, `rr-msg`, `rr-composer`, `rr-card`, `rr-badge`,
  `rr-field`) use the **`.rr-*` classes directly** in our own JSX. That keeps us inside A, since the classes
  come from the imported `styles.css`.
- Stateful primitives keep their Radix behaviour (shadcn dialog, menu, select, tooltip). Their **look** is
  rebuilt to the matching `.rr-*` anatomy: heights, radii, padding, type, focus ring, material surface,
  shadow and motion.
- **Parity gate.** The harness renders the real Redrob-UI component and our component side by side from
  the same package version, then compares computed metrics (height, radius, padding, font, colour per
  state). We can't compare pixels, because the markup differs. Metrics are what "looks like Redrob-UI"
  means in a form a machine can check.

If a primitive cannot reach parity without its React behaviour (likely candidates: `ModelPicker`,
`Combobox`), the PR stops and asks before moving to Option B for that one component.

## Verification — how "machine-tested on the server" works

**Extension and onboarding: fully on the sandbox** (8 cores, 30 GB RAM, 91 GB free).
- Build with the repository's Bun (1.4.2, installed via mise; the sandbox ships 1.2.14).
- Load the built extension into Playwright's Chromium, with a shim for the `browserOS` and `redrobPrivate`
  APIs that stock Chromium lacks. The shim serves fixture data: tasks, chats, schedules, connectors, settings.
- Capture matrix: every route × light/dark × en/ko × side panel at 360 and 480 px, and pages at 1280 and
  1600 px.
- Assertions on every capture:
  - every sampled role colour equals its token value;
  - axe-core contrast at AA;
  - `document.fonts` reports Pretendard (and Wanted Sans for ko) as loaded;
  - every focusable element shows a 2px focus ring at a 2px offset;
  - no lucide import and no round stroke caps;
  - no colour literal outside the token layer;
  - the parity metrics above.
- Screenshots are uploaded as workflow artifacts and linked from each PR.

**Native chrome: built on the runner, captured on the sandbox.** A Chromium checkout needs about 150 GB of
disk, and the sandbox has 91 GB free on 8 cores, so the binary is built on the self-hosted `chromium-build`
runner (the one `release.yml` uses):

- PR 0.6 adds `ui-build.yml`, a `workflow_dispatch` workflow on that runner. It builds a dev `.deb` from a
  given branch and uploads it as an artifact. It is never a required check, because a dispatch-only
  workflow never reports on a pull request.
- The sandbox downloads the artifact, installs it, and captures it:
  - Xvfb runs the browser with a fresh profile.
  - xdotool drives the menus, bubbles and the omnibox popup that CDP cannot open.
  - The window is screenshotted, and pixels at known regions are sampled against `redrob_design_tokens.h`
    for both themes and both languages.
- Each native PR links its run and its captures.

Not yet verified: whether the runner is online. Listing runners from the sandbox returned 403, so the first
dispatch is the test.

## Phases and PRs

Each line is one PR into `develop`. Every PR passes `repo integrity` (`check_repo.py`,
`check_design_tokens.py`, `vendor_design_system.py`) and `gitflow`. Agent PRs also pass `bun run check` and
`bun run test`, plus the capture job once it exists.

### Phase 0 — foundations (no visual change)

| PR | Branch | What | Done when |
|---|---|---|---|
| 0.1 | `docs/ui-redesign-plan` | This document. Also corrects AGENTS.md, which describes `patches/` (deleted; patches now live in `vendor/browseros/chromium_patches/`), Chromium 153 (now 155.0.8059.26) and 0.1.3 (now 0.1.6) | Merged |
| 0.2 | `chore/design-system-1.3.1` | Browser pin 1.0.2 → 1.3.1 via `vendor_design_system.py --update --accept-new-integrity`; recount classes and glyphs in the pin comments | All 9 token checks green; check 8 still reports 0 divergences |
| 0.3 | `test/ui-capture-harness` | Playwright harness, API shim, fixtures, capture matrix, the assertions above. Runs in a new non-required CI job; it becomes required once stable | Captures today's UI in all four theme/language combinations, and its assertions fail on today's off-spec values. That failing state is the baseline to burn down |
| 0.4 | `feat/extension-i18n` | Localisation for `apps/app` and `apps/app-onboard`, from **one source**: new `l10n/50-extension.tsv` rows. `gen_strings.py` also emits `_locales/{en,ko}/messages.json` for the extension and a typed JSON module for onboarding (which is a WebUI page with no `chrome.i18n`). `default_locale` goes in the manifest. Every existing string is moved into it | No hard-coded user-visible string remains (lint rule); Korean renders in every capture; `check_repo.py` regenerates and byte-compares the new outputs as it does the `.grd` |
| 0.5 | `chore/one-design-system-version` | Gate: the `@redrob-labs/ui` version in each agent `package.json` must equal `DESIGN_SYSTEM_PIN.json`, so the chrome and the pages cannot drift apart | Gate fails on a mismatch (reverse-verified) |
| 0.6 | `chore/ui-build` | `ui-build.yml` on the `chromium-build` runner (see Verification), plus the sandbox capture script for native chrome | One dispatch produces a `.deb`, and the sandbox captures today's chrome in both themes and both languages |

### Phase 1 — extension on the real tokens (Option A)

| PR | Branch | What |
|---|---|---|
| 1.1 | `feat/extension-design-system-dep` | Add `@redrob-labs/ui@1.3.1` (exact) to `apps/app`. Import `tokens.css`, `styles.css` and fonts in that order, inside a cascade layer placed **after** Tailwind's preflight. Re-point every shadcn variable at a semantic token (`--background: var(--surface-base)`, `--muted-foreground: var(--ink-secondary)`, `--input: var(--border-strong)`, …). Add `--surface-ai`/`--border-ai` roles. Delete the `--rr-*` copy and the hand-shipped fonts. Rewrite `design-tokens.test.ts` to assert the mapping, not the hex values |
| 1.2 | `feat/onboard-design-system-dep` | The same for `apps/app-onboard`. **Open risk:** it is served from `chrome://redrob-onboarding`, and its stylesheet says that WebUI forbids shipping font files. Investigate serving the browser's already-vendored fonts from the WebUI's shared resources instead of falling back to platform fonts |
| 1.3 | `feat/one-theme-source` | One theme controller setting both `data-theme` (what Redrob-UI reads) and `.dark` (what shadcn reads) before first paint. Its value is the **browser's own** colour-scheme pref, read and written through the private API, so the native chrome and every page always agree. `ThemeSwitch` anatomy: system / light / dark |

Gate added in 1.1: no colour literal and no undeclared `var()` anywhere in agent CSS or TSX. This mirrors
the browser's checks 2 and 4.

### Phase 2 — icons

| PR | Branch | What |
|---|---|---|
| 2.1 | `docs/icon-mapping` | A table mapping each of the 77 lucide icons to one of the 260 design-system glyphs, each justified from the icon groups, as UX-PROGRAMME slice 1 did. Icons with no equivalent are listed for a decision, never hand-drawn |
| 2.2 | `refactor/extension-icons` | Swap everything to the package's icons, including the generated shadcn and ai-elements files. Remove `lucide-react`. Lint gate: no `lucide-react`/`@tabler` import, no round `stroke-linecap`/`stroke-linejoin`, no inline `<path>` outside the package |

### Phase 3 — primitives to Redrob anatomy

One PR per family, each with its parity test:

| PR | Branch | Components | Matching anatomy |
|---|---|---|---|
| 3.1 | `feat/rr-actions` | button, button-group, kbd | `rr-btn`, `rr-iconbtn` |
| 3.2 | `feat/rr-forms` | input, textarea, select, checkbox, switch, label, form | `rr-field`, `rr-control`, `rr-select`, `rr-choice`, `rr-switch` |
| 3.3 | `feat/rr-overlays` | dialog, alert-dialog, sheet, popover, dropdown-menu, hover-card, tooltip | `rr-modal`, `rr-drawer`, `rr-menu`, `rr-tip` (`--surface-material`, `--shadow-md/lg`, `::backdrop` scrim, entrance motion along the 40° rake, `prefers-reduced-motion`) |
| 3.4 | `feat/rr-feedback` | sonner, alert, progress, skeleton, badge, card, tabs, separator, scroll-area | `rr-toast`, `rr-alert`, `rr-progress`, `rr-skeleton`, `rr-badge`, `rr-card`, `rr-tabs`, `rr-scroller` |
| 3.5 | `feat/rr-chat-elements` | the 30 ai-elements | `rr-msg`, `rr-composer`, `rr-cstatus`, `rr-spinner`, `rr-cite`, `rr-action`, `rr-timeline`, `rr-approval`, `rr-receipt`; agent output on `--surface-ai` |

### Phase 4 — extension surfaces reworked

| PR | Branch | Surface | Rework |
|---|---|---|---|
| 4.1 | `feat/app-shell` | Frame for `/home`, settings, scheduled, connect-apps | `rr-shell` anatomy: 232px nav with folded state, `data-product="browser"` wash over the top 132px, header with title and meta, an optional rail, a skip link |
| 4.2 | `feat/sidepanel-chat` | Side panel `/` and `/history` | Message / composer / timeline anatomy, `ComposerMode` and `ComposerStatus`, `ApprovalStep` for permissions, `PromptSuggestions` and `EmptyState` when empty, history as a list of title + meta rows |
| 4.3 | `feat/newtab-composer` | New tab | Composer first ("Ask AI a task, @ for context"), recent tasks as cards, brand mark per theme (both artwork files, never recoloured) |
| 4.4 | `feat/settings-shell` | All `/settings/*` | UX-PROGRAMME slice 8: grouped nav with group labels and a `New` badge, grouped cards, and every row as title + sub + exactly one control. A new **Appearance** section holds `ThemeSwitch` and `LangSwitch`. Gate: one row pattern |
| 4.5 | `feat/tasks-and-connectors` | Scheduled tasks, connect apps, MCP | `ScheduleRow`, `ConnectorCard`, `PlaybookRow`, `TaskStatus`, `AccessList` |
| 4.6 | `feat/onboarding-steps` | First run | Slices 3 and 6b: a step is a claim plus one decision; the modal pattern over a dimmed parent; the import step; the model step on the plain-select fallback; a return hint on the default action |
| 4.7 | `feat/agent-glow` | `glow.content` overlay | Tokens and the brand gradient; motion along the rake; reduced-motion fallback |

### Phase 5 — native chrome (verified through 0.6)

| PR | Branch | What |
|---|---|---|
| 5.1 | `fix/native-semantic-ladder` | Adopt the four values. Dark surface becomes a system surface; the dark frame stops sitting above its cards; light ink becomes `--ink-primary`; dark accent-soft becomes `--surface-brand-subtle`. Update DESIGN-SYSTEM.md's divergence table to empty |
| 5.2 | `feat/native-sys-colours` | Map Chromium's whole `kColorSys*` role set from tokens, not the 20 IDs mapped today. This one change themes menus, bubbles, dialogs, the omnibox popup, downloads, infobars, hover cards, permission prompts, the find bar, scrollbars, and the `chrome://` pages that read the colour pipeline. It ships with a role table: sys role → token → reason |
| 5.3 | `feat/native-shape-and-type` | Corner radii and control heights through the layout provider (a `chromium_src` override, not a patch where possible). Pretendard as the UI font, with Wanted Sans for Korean. Native type sizes mapped to the design system's type scale |
| 5.4 | `feat/native-icons` | Extend `vendor_design_system.py` to convert the package's `dist/native/icons/*.svg` into Chromium `.icon` vector format, pinned by the manifest sha256s. Replace toolbar, menu, omnibox and sidebar vector icons. Extend check 9 to native |
| 5.5 | `feat/sidebar-product-wash` | UX-PROGRAMME slice 2b: a header view that owns its paint, with the 132px browser wash (55% on dark), keeping upstream's rounded seam |
| 5.6 | `feat/sidebar-ia` | Slice 9: profile chip, search, panel toggle; bookmarks, chats and tabs as grouped lists, each with its own "new" row |
| 5.7 | `feat/native-toolbar-omnibox` | Address bar and omnibox popup rows to the field and menu anatomy; toolbar buttons to `rr-iconbtn` metrics |
| 5.8 | `feat/chrome-pages-theme` | Stock `chrome://settings`, history, downloads and extensions: confirm they follow 5.2. Patch only what still reads hard-coded `--cr-*` values; set the font |

Every new native string goes in `l10n/*.tsv` with English and Korean.

### Phase 6 — claw apps

`apps/claw-app` and `apps/claw-onboard` are not shipped by this browser and are still fully
BrowserOS-branded (313 and 47 files). They are restyled with the same playbook as phases 1–4:

| PR | Branch | What |
|---|---|---|
| 6.1 | `fix/claw-branding` | Remove every visible BrowserOS name, logo, Product Hunt and Discord promo, and upstream host from both apps and their manifests. Copy the onboarding app's no-upstream-branding test to guard it |
| 6.2 | `feat/claw-design-system` | Add the dependency and the token mapping. The upstream fonts (Schibsted Grotesk, Newsreader, JetBrains Mono) and the `#0254ec` palette go. Strings move to the localisation from 0.4 |
| 6.3 | `refactor/claw-icons` | Replace tabler and lucide with the design system's icons, using the mapping from 2.1 extended to tabler |
| 6.4 | `feat/claw-surfaces` | Cockpit, audit, replay, skills, task detail and MCP on the phase-3 primitives and the `rr-shell` frame; the insight charts on the design system's Insights marks |

## Ordering

0.1 → 0.2 → 0.3 → 0.4 / 0.5 / 0.6 → 1.x → 2.x → 3.x → 4.x. Phase 5 runs in parallel once 0.6 works: 5.1
and 5.2 first, because they are the largest visible win for the least code. Phase 6 comes after phase 4,
because it reuses phase 3's primitives.

## Stop and ask, rather than deciding

- Whether the `chromium-build` runner is online (first dispatch in 0.6).
- Lucide or tabler icons with no design-system equivalent (2.1, 6.3).
- Any primitive that fails parity under Option A (phase 3).
- Third-party marks on the claim step, the vault's at-rest format, and the model ranking source.
  UX-PROGRAMME slices 4, 5 and 6a stay blocked and are **out of this plan** until decided.
- Korean copy: every PR that adds strings waits for the product owner's review of its TSV rows.
