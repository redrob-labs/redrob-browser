# The design system in this browser

Every other Redrob product installs `@redrob-labs/ui` and gets its colours by resolving `var()`. This one
cannot, and the reason is worth stating plainly because it decides everything else here.

The window chrome — tabs, the vertical sidebar, the toolbar — is painted by C++ `views`. There is no CSS
engine in that path and therefore no `var(--surface-base)` to resolve. The WebUI pages are assembled by
`build_webui` from files that are already in the source tree when the build starts; there is no
`node_modules` and no resolver to ask. So the values have to arrive as **literals, in the tree, before the
build**.

That leaves copying, and a copy with no gate is the exact failure this setup exists to prevent: the browser
goes on painting last season's blue while the website, the console and the docs move on, and nothing reports
it, because a hardcoded colour is always consistent with itself.

## What is copied, and from where

`DESIGN_SYSTEM_PIN.json` names the release. `scripts/vendor_design_system.py` fetches that exact published
tarball, verifies it against the pinned `integrity`, and writes twelve files:

| vendored file | what it is for |
| --- | --- |
| `sources/chrome/browser/ui/color/redrob_design_tokens.h` | 223 colours per theme as `0xAARRGGBB`, for the C++ chrome (1.3.1) |
| `sources/chrome/browser/resources/redrob/design_tokens.css` | 331 distinct custom properties (1.3.1), for WebUI pages |
| `sources/chrome/browser/resources/redrob/design_system.css` | 166 `.rr-*` class roots (1.3.1) — and token supersessions, which is why its load order is gated |
| `sources/chrome/browser/resources/redrob/fonts/*.woff2` | the 8 faces `--font-sans` and `--font-mono` can select |
| `redrob/design_tokens.json` | the same values as data, for tooling that is neither |

The brand artwork is pinned separately, by sha256 rather than by version: `@redrob-labs/ui` ships no logo
file on purpose, so those two files come from the design system delivery instead of the registry.

None of them is transformed on the way in — each is the upstream artifact byte for byte with a provenance
banner. A transformation here would be a second place a colour is decided, which is the thing being removed.

**A vendored file is never edited by hand.** Change the design system, release it, re-pin:

```
# edit DESIGN_SYSTEM_PIN.json: new version, integrity cleared
python3 scripts/vendor_design_system.py --update --accept-new-integrity
# put the printed integrity back in the pin, then commit pin + files together
```

`integrity` is pinned as well as `version` because it is the only part a registry cannot restate. A
published npm version is immutable, so a tarball whose hash stops matching is a tampered or corrupted
fetch, and the script refuses it rather than vendoring it.

## Two gates, and why they are separate

`scripts/check_design_tokens.py` runs offline in milliseconds and checks the browser's **use** of the copy:

1. every `ds::light::kFoo` / `ds::dark::kFoo` reference names a token that exists — a design-system rename
   is otherwise reported by the C++ compiler three hours into a Chromium build;
2. no colour literal appears in the chrome unless it is listed in `ALLOWED_LOCAL_COLOURS` with a reason;
3. no stylesheet **of ours** loaded after the vendored pair redeclares a property either of them already
   defines, at document scope. Scope matters: `design_system.css` declares `--control-height-md` again
   under `[data-density="compact"]`, which is an opt-in a container switches on, not a clash — reporting it
   would be reporting the feature. The first version of this check was selector-blind and produced six such
   findings, which is how the blindness was found;
4. every `var(--foo)` in our own sheets names a token the design system declares. This is check 1 for the
   CSS side and it matters more, because CSS has no compiler: an undeclared custom property does not warn or
   fall back, it makes the whole declaration invalid at computed-value time, so a renamed token ships as a
   page that looks subtly unstyled with every build green;
5. every font family a stack we can **reach** may select is declared AND has its file in the bundle. Not
   hypothetical — this is the check that found Pretendard had not been loading at all. "Reach" is read from
   the markup: `design_system.css` names Newsreader and Nanum Myeongjo in `.rr-voice-*`'s literal fallback
   stacks, so taking the sheet's mere presence as reach would demand 1.2 MB of serif for text nothing
   renders, and taking it as no reach at all would let the first `class="rr-voice-1"` ship Georgia in
   silence. It arms on the first use of such a class;
6. the logo files are byte-identical to their pinned sha256, both grounds ship, and no rule of ours puts a
   mask, filter, opacity, background or shadow on a mark selector;
7. both vendored sheets are linked on every page that links either, tokens **first**. `design_system.css`
   supersedes `--ink-muted` and `--surface-sunken`; in the wrong order the browser paints the superseded
   values. Both orders are valid CSS and both build green, so nothing else can catch it;
8. the native header and the CSS agree on every token both define — 174 of the header's 178 constants,
   resolved through `var()` chains per theme. See below.

### The header and the CSS disagree about three colours, and only this browser can tell

One release ships two artifacts: a C++ header of literals and a stylesheet. Every other Redrob product
consumes one or the other. This browser consumes **both**, in adjacent pixels — the window chrome paints a
muted label from `ds::light::kInkMuted`, and a WebUI page a few pixels away paints a placeholder from
`var(--ink-muted)`.

They do not match, because `dist/native/redrob_tokens.h` is generated from the token sheet alone and never
sees the three roles `design_system.css` supersedes:

| | header says | CSS resolves to |
|---|---|---|
| `--ink-muted` light | `#7c8390` (Gray 6) | `#686e78` |
| `--ink-muted` dark | `#7c8390` | `#838a97` |
| `--surface-sunken` dark | `#000000` | `#1c1f26` |

Nine points per channel. Nobody spots it, nothing fails, and it is permanent in code — the same shape as the
four transcribed colours this whole exercise started from.

**Fixed, at the source, in `@redrob-labs/ui` 1.0.2**, which this browser pins. All three were accessibility
corrections rather than preferences, and the design system had said so in a comment beside them: `tokens.css`
was where they belonged "once tokens.css regenerates". `--ink-muted` light was below AA on *every* light
ground in the system (3.81:1 / 3.62:1 / 3.37:1, now 5.13 / 4.87 / 4.54), and `--surface-sunken` dark put layer
two 7.51 L\* **below** the page, reversing the dark elevation ladder at its second step so a well read as a
hole punched through the document.

Upstream also carries `supersession:check` now, which fails a release whose two sheets disagree about a token
they both declare — so the class of defect is closed, not just this instance. Check 8 here compares **370**
tokens and reports **0** divergences, and `HEADER_CSS_DIVERGENCES` is empty.

That emptying was not done from memory. Check 8 fails on a **stale** entry as well as an unlisted one, so the
pin bump itself reported all three exemptions as describing divergences that no longer existed. An exemption
naming a divergence that has been fixed is worse than never having had one: it silently permits that
divergence to come back.

The one value this fix moves in real pixels is the C++ `label_muted`, which reads `--ink-muted`: every
secondary label in the browser goes from 3.81:1 to 5.13:1. `kSurfaceSunken` is still not read by the chrome.

`scripts/vendor_design_system.py` (no arguments) reaches the registry and checks the **copy itself** against
the pin. A push should not have to reach npm to be told it typed a hex, which is why these are two scripts
and not one.

## Colours this browser decides for itself

**None.** `ALLOWED_LOCAL_COLOURS` is empty, and the way both entries left it is the part worth keeping.

- `kPageLight` `#fcfeff`, the content area, went because `page` is the one role the C++ shares an EDGE with
  the WebUI: the three pages paint their own `html` background from `--surface-base`, and this field paints
  the same area before and around them. Two values for one surface is a seam that shows as a flash on load
  and a hairline at the edges. That also settled the ladder's direction — the page is the BASE with the
  chrome above it — which is why dark `page` moved a step down from `#141719` to `#0a0b0c`.

- `kSidebarWashLight` `#e9fbff`, the light sidebar, went because **the design system does describe this
  rail** and the entry said it did not. `.rr-shell__side` gives the rail `--surface-sunken` in light and
  `--surface-raised` in dark, plus the product's own wash as an edge fade reaching transparent at 132px.

  The reason that was not obvious is worth recording: the wash half of the rule reads
  `var(--product-browser-wash)`, and **nothing declared that property**. The delivery's `tokens.json` defines
  119 product tokens and its `tokens.css` declared none of them, so all 28 of those `.rr-shell[data-product]`
  declarations were invalid and were dropped — here and in every other Redrob app. The rule therefore read as
  though the system had no opinion about a rail's ground. It had one. Fixed upstream in 1.0.2 with
  `references:check`, which fails on any `var()` naming a property nothing declares.

  `#e9fbff` was never a wash the system omitted. It appears in no Redrob ramp; the nearest thing in the entire
  palette is `--product-chat-1` `#e9fbfb`, a different product's tint, and this browser's own product colour
  is pink. The dark rail was already correct at `#141719`, which is exactly what was reported.

**The lesson, since the same sentence was wrong twice.** "The design system has no token for this" was
asserted in a comment, with a plausible reason attached, for both entries, and was false both times. An entry
here now requires the SEARCH to have been done — grep the token sheet *and* the component sheet for the
surface by name — not a reason why a token probably does not exist.

The 132px product wash is **not** in yet, and the reason is structural. The sidebar's fill is whatever
`kColorFrameActive` resolves to, and going through the colour pipeline is what preserves upstream's rounded
seam between the sidebar and the page; installing our own gradient background on the column replaced that
seam and, for the same reason, painted nothing until it was ordered after upstream's own `SetBackground`. A
gradient needs a view that owns its paint, and none here spans the column's top band — `RedrobSidebarSections`
is the whole list, `RedrobAccountRow` its foot. That is a change to the column's structure, so it is its own
slice in `UX-PROGRAMME.md`.

## Where the chrome does not yet match the system's semantic ladder

The mixer now takes every other value from the vendored header, but four of those fields name a **primitive**
(`kGray8`, `kBlue9`) rather than the semantic role that would be the natural choice. That is a finding, not an
oversight: the value the browser paints today is not the value the matching role carries, so adopting the role
would change the browser's appearance — which a token refactor must not do silently. Each is a decision:

| where | paints | the system's matching role |
| --- | --- | --- |
| dark `surface` | `#292e37` (Gray 8) | none. Dark surfaces are `#0a0b0c` base, `#141719` raised, `#000000` sunken — `#292e37` is not among them, so the browser's dark surface ladder does not line up with the system's at all |
| dark `frame` | `#141719` | `--surface-raised`. So in dark the *sidebar* sits at the raised level and the cards on it sit higher still, inverting the relationship the light theme has |
| light `ink` | `#141719` (Gray 9) | `--ink-primary` is `#0a0b0c` |
| dark `accent_soft` | `#061460` (Blue 9) | `--surface-brand-subtle` is `#030c34` |

Two values moved when the chrome was rewired, and both are corrections rather than redesigns.

Light `accent_soft`, `#eff4ff` → `#eef4ff`: the design system says `#eef4ff` and the hand-transcribed copy
said `#eff4ff`. Three more of the same kind were found in the palette and are gone with it: the Red ramp's
first three steps, which the copy had at `#ffe8e1`, `#ffc2ba`, `#ff5452` against the system's `#ffe1e1`,
`#ffabab`, `#ff4b4b`. Nothing was broken by any of them, which is the whole problem: drift of that size is
invisible on screen and permanent in code.

`page`, both themes, to `--surface-base` — see the section above on the colours this browser still decides
for itself. That one is visible, and it is the seam with the WebUI closing.

## The WebUI pages: done

All three pages -- the new tab, settings and onboarding -- link `design_tokens.css` and take every colour,
size, radius, shadow and typeface from it. The local `tokens.css` is gone. What replaced it is
`chrome_base.css`, which declares NO custom property and carries only the two things a Chromium WebUI needs
and the design system deliberately does not provide: a background and ink on `html`, and `color-scheme` so
the scrollbar, the `<select>` popup and the caret follow the theme.

Measured afterwards, in the running browser rather than from the source: 233 `var()` references, all
resolving to a vendored token; `data-theme` and `color-scheme` correct in both themes on all three pages;
the eight most load-bearing tokens computing to exactly what the sheet declares; Pretendard actually loaded.

The three obstacles this document listed, and what each turned out to need:

**The theme switch.** As predicted: the system goes dark on `[data-theme="dark"]` and ships no
`prefers-color-scheme` rule, so linking it alone gives a permanently light page. `theme.ts` sets the
attribute from `matchMedia` and keeps a `change` listener, and it is imported FIRST in each entry module --
a module script is deferred, so it runs before the first paint, where waiting for `DOMContentLoaded` would
put a white flash in front of every dark page load.

**The ten shadowed properties.** Gone rather than reconciled: nothing redeclares a vendored name, so
`check_design_tokens.py` check 3 is armed on all three pages and silent because there is nothing to report.

**The vocabularies.** Moved, not aliased. The 45 `--rr-*` primitives are deleted, and the 53 semantic names
are gone with them -- `--surface` became `--surface-base`, `--raised` became `--surface-raised`,
`--muted-foreground` became `--ink-secondary`, and `--accent` split in two, because the system separates the
colour you FILL with (`--action-primary`) from the one you set TYPE in (`--ink-brand`, Blue 7 on light, which
passes contrast as text where the fill colour does not).

### What this changed on screen, on purpose

The elevation direction inverted. The old sheet put a white card on a near-white page; the system's light
theme is a white page with `--surface-raised` (Gray 1) cards. Both are coherent, and the system's is the one
every other Redrob surface uses.

27 declarations that never went through a token at all -- a bare `font-size: 12px` -- now name a role. Five
of them were uppercase tracked eyebrows, and `--text-meta` is the system's role for exactly that line: "the
line above a title that says what a thing is: sentence case, no extra tracking. **Never uppercase** and never
a second typeface." So `.tile-kind`, `.trace h2`, `.task-state`, `.nav h1` and `.field > span` lost the
uppercase and the tracking. That is the spec's rule, not a preference.

`.mono` stopped asking for JetBrains Mono, which was never in the bundle and so had always rendered in
whatever monospace the machine happened to have. It uses `--text-code` now.

### Two things a build found that reading could not

**Every CSS in `static_files` is linted by Chromium's own stylelint config.** The vendored sheet fails it
about 60 times -- double quotes, `#ffffff` over `#fff`, no blank line before a rule -- and it is a generated
file we must not edit. It is shipped through `generate_grd` / `extra_grdp_files` instead, byte-identical, at
the same resource path, and the three bundles all read the one copy in `redrob/` rather than each holding
their own.

**The fonts were never loading, and had not been for a long time.** The sheet declares `Pretendard` as six
static weights under `fonts/`; the browser shipped a single variable cut under the family name `Pretendard
Variable`. Renaming our face to `Pretendard` did not fix it -- Blink matched the vendored static faces, whose
files were absent, and every weight sat at `status: "error"` in the live page while the build stayed green.
The fix was to stop declaring the family twice: `DESIGN_SYSTEM_PIN.json` now vendors the eight font files the
`--font-sans` and `--font-mono` stacks can actually select (Pretendard's six weights, Wanted Sans and Noto
Sans Devanagari, 1.7 MB), the 2 MB variable cut and its three copies are deleted, and `check_design_tokens.py`
check 5 fails the build if a selectable family's file is ever missing again. The serif and display cuts are
deliberately not vendored: no stylesheet here names `--font-serif` or its Korean pairs, and the same check
reports them as declared-but-unreachable so the decision stays visible.

### The one defect left is closed, and the fix is not the one this document proposed

The brand mark was close to invisible on a dark page, and it turned out to be three faults, not one.

`redrob-mark.svg` was a hand-drawn file: a `#000921` silhouette with a `#0066FF`-to-`#7C24FF` blurred glow,
where the brand symbol is a blue-to-cyan gradient. So this was not the Redrob mark, it was a near-copy of
it, and no gate could tell -- nothing in a build reads a PNG or an SVG's pixels. It was drawn at
`opacity: 0.5`, which `10-logo.md` rules out along with recoloring and restretching. And against the page:

| page | mark contrast |
| --- | --- |
| light, `--surface-base` #ffffff | 4.83:1 .. 19.87:1 |
| dark, `--surface-base` #0a0b0c (before) | 1.00:1 .. 4.08:1 |
| dark, `--surface-raised` #141719 (older) | 1.10:1 .. 3.72:1 |

The mask-and-paint-from-a-token option this document used to offer is not available: `10-logo.md` says the
artwork is "Never redrawn, restretched, recolored or otherwise modified", and lists recoloring, substituting
the gradient and adding an effect under Incorrect usage. A mask keeps the silhouette and throws the artwork
away, which is that recolor -- it would have fixed the number and broken the rule.

The spec's own answer is a file per ground. `assets/Symbol/README.md` assigns `redrob-symbol.png` (the brand
gradient) to white and light grounds and `redrob-symbol-solid-white.png` (flat white) to `redrob-black` and
dark surfaces. Both now ship, both are in the DOM, and the page shows one, keyed to `data-theme` -- which is
exactly what the design system's own `.rr-mark` rules do. Measured on the built browser:

| page | mark contrast |
| --- | --- |
| light, ground #ffffff | 1.04:1 .. 5.57:1 (gradient artwork, best ink 5.57:1) |
| dark, ground #0a0b0c | 1.69:1 .. 19.70:1 (flat white, best ink 19.70:1) |

The artwork is pinned by sha256 in `DESIGN_SYSTEM_PIN.json`, under `brand_assets` rather than with the npm
package: `@redrob-labs/ui` deliberately ships no logo file, because its `Mark` component takes `src` and
`darkSrc` as props and the host supplies them. `check_design_tokens.py` check 6 fails on a hash mismatch, on
a missing ground, and on any `mask`, `filter`, `opacity`, `background` or shadow landing on a mark selector --
that last one because a fade or a tint here reads as an ordinary styling tweak in review rather than as a
brand violation.

## What does not apply here

The React components do not. `@redrob-labs/ui` ships 123 of them and they render `div`s with `rr-*` classes;
the chrome has no DOM and the WebUI is TypeScript and Lit, built by `build_webui`. Vendoring React, Tailwind
and Radix into `third_party` would mean re-fitting the GN integration on every Chromium roll for class names
that resolve to these tokens anyway.

What crosses is the CSS. `system.css` is vendored as `design_system.css` and linked by all three pages, so
the components' *look* is available as classes; what is not available is their *behaviour*, which lives in
the React files. A component that is pure CSS (`Field`, `Select` in its native form, `Badge`, `Card`) is
usable here as markup. One that needs state (`Select`'s list variant, `Combobox`, `ModelPicker`'s panel) is
a CSS shell that something has to drive, and here that something is our own TypeScript.

### The component layer: what came across, and what it changed

289 KB raw, 56 KB gzipped, ONE copy — `input_files_base_dir` points every bundle at `redrob/`, as it already
did for the fonts. Measured on the comment-stripped file: **145** distinct `.rr-*` component classes across
**2,017** rules. (An earlier note in this file said 1,239; that counted a different thing, and a count nobody
names the metric for is a count nobody can check.)

It is not only components, and that is the part worth knowing before reading the screenshots:

| Not namespaced | What it sets |
|---|---|
| `::selection`, `[data-theme="dark"] ::selection` | Blue 2 / Blue 8 |
| `:root` | `caret-color`, `accent-color`, `scrollbar-width: thin`, `scrollbar-color` |
| `input`/`select`/`textarea:-webkit-autofill` | Autofill inset fill on `--surface-base` instead of Blink's yellow |
| `li::marker` | `--ink-secondary` |
| `::backdrop` | `--overlay-scrim` |
| `[lang="ko"]` | `word-break: keep-all` |
| `:lang(hi)`, `:lang(hi) em`/`i` | The Devanagari stack, and no synthetic italic |

And it **supersedes two token values**. In the design system's own order the component sheet loads second and
wins; that is intended, and it means the browser had been painting the superseded ones:

| Token | `design_tokens.css` | `design_system.css` wins with |
|---|---|---|
| `--surface-sunken` (dark) | `#000000` | `#1c1f26` |
| `--ink-muted` (light) | `var(--gray-6)` = `#7c8390` | `#686e78` |
| `--ink-muted` (dark) | `var(--gray-6)` = `#7c8390` | `#838a97` |

It also adds `--series-1..6`, `--tex-*`, `--rake-dx/dy` and `--dia-rake` at document scope.

Three consequences that were not obvious from reading:

- **The order is load-bearing and invisible.** Both link orders are valid CSS and both build green; in the
  wrong one the browser paints `#000000` sunken while every other Redrob surface paints `#1c1f26`. Gate
  check 7 exists only for that.
- **`data-theme` now has to be on `<html>` statically.** The component sheet hangs those supersessions off
  `:root:not([data-theme="light"])`, which matches a document with *no* `data-theme` at all. A page whose
  `theme.ts` failed would render light everywhere except `--surface-sunken`, `--ink-muted` and the six
  `--series-*`. All three pages now carry `data-theme="light"` in the markup, and `theme.ts` overwrites it
  before first paint.
- **`preflight.css` is deliberately still out.** It is the design system's optional page-owner sheet, and
  `chrome_base.css` is already this browser's version of exactly that. Two sheets claiming `html` is the
  shadowing defect check 3 catches.

### The settings page: the field components, used as components

The 19 form fields on `chrome://redrob-settings` are now `.rr-field` + `.rr-control` + `.rr-select`, which
deleted a local `.field` block that was a second, nearly-identical definition of a field: a 4px label gap
against the system's 8px, `--border-subtle` against `--border-strong`, `--control-radius` against
`--field-radius`, a 7px/10px pad against a token height, and a label in `--ink-secondary` at `--text-meta`
against the system's `--ink-primary` at 600. None of it was wrong. All of it was a second place a field's
shape was decided.

The six `<select>`s take `Select`'s native shape exactly as `Select.tsx` emits it — `.rr-select-wrap` holding
the control and a `.rr-select-wrap__caret` the system draws, rather than the platform's arrow, which is a
different size and colour per platform.

`.field-row` stayed. A row of fields is this page's layout, not a component.

### The composer's three controls are NOT rr-select, on purpose

`chrome://redrob/`'s permission, model and effort controls stay as they are, and this is a decision rather
than unfinished work. Two reasons, both already written into `redrob.css`:

- They are not fields. The comment above `.ctl` records the reference's decision — "no fill, no border and no
  pressed state, because the composer already tells you what is selected by showing its name". `.rr-control`
  is a bordered, filled, `width: 100%` field. Putting three of them in that row contradicts the reference the
  row was built from.
- The width technique would be lost. A `<select>` lays out at its **widest** option, so "Guard" occupied the
  width of "Full access". The page draws the value as ordinary text and lays the real `<select>` over the
  control invisibly. `.rr-select` keeps the native box, so the hole comes back.

The design system's own nearest shape for this row is `.rr-model__trigger` — 32px, `radius-full`,
transparent, `--ink-secondary`, hover `--surface-sunken`, an inline caret in `--ink-muted`. That is the
ModelPicker's trigger, and wearing its class for a permission control would be claiming to be a component we
are not. When the model control becomes a real `ModelPicker` (below), it takes that trigger and the other two
follow its metrics.

### Every glyph is the design system's

`45-icons.md` is ten lines long and exact: a 24x24 box on a 20px live area, a 2px **unscaled** stroke,
**butt** caps ("Never round"), **miter** joins at limit 3, every diagonal at 40 degrees, dots as a 2x2 filled
square. The delivery ships **252** glyphs drawn to it, with `lint/icons.py --strict` of its own.

This browser used to draw **16** by hand — measured, correcting an earlier note that said 18 by counting
sites for glyphs. Twelve trace step glyphs and the queued-message withdraw mark in `redrob.ts`, three in
`redrob.html` (the permission shield at two sites, a back chevron, a not-found ring). Every one a 16x16 box,
with our sheets declaring **round** caps at stroke 1.3, 1.4, 1.5 and 1.6. Same class of divergence as a
transcribed colour: internally consistent, unremarkable on screen, disagreeing with every other Redrob
surface — and nothing could see it, because a build never looks at path data.

All 16 are now the design system's, and **two of them were previously recorded as having no equivalent among
the 252.** Re-read against the spec's own group table, both do:

| | | grounds |
|---|---|---|
| `kSteered` | `route` | The Evidence group's staircase. The spec's own note: "beads on a line lose to a staircase (`route` has no beads)". A steer is the run's path turning |
| `kThinking` | `pulse` | **Not** `sparkle` — "`sparkle` is for generated content only" — and not `spark`, "use sparingly". What it replaces is a bare circle, which the spec lists *by name* as a way an icon fails: "a primitive rather than a thing" |

And one that reads like a judgement call is not. `kQueuedMessage` → `pending`, in the spec's own words:
"`pending` is three dots, not a clock", distinguished from `clock` as "a time vs **a wait with no time**".

The rest: `history` (not `clock` — "refresh clockwise, history counter-clockwise", and this is looking back),
`browser`, `camera`, `save`, `key` ("access granted, vs `lock`, access withheld"), `split`, `blocked`, `list`
(**not** `checklist` — nothing in a trace is tickable, and a tick claims a state we do not have), `repeat`,
`close`, `shieldCheck`, `chevronLeft`, `alert`.

**The composer's select caret went too**, and it was not on the list. It was two CSS borders rotated 45
degrees — the classic CSS chevron — which is a hand-drawn glyph that happens not to be an SVG. The spec puts
every directional mark on the 40 degree rake and names exactly two 45 degree exceptions, `close` and `spark`,
neither of which can be built from borders. It is now the delivery's `chevronDown`.

#### How the geometry gets here

The delivery ships its glyphs as a **React module**. This is a WebUI under Trusted Types with no React, no
bundler and no `node_modules` at build time, and assigning `innerHTML` throws — so a glyph cannot be imported,
and its geometry has to arrive as **data, in the tree, before the build**, exactly as the two stylesheets and
the eight fonts already do.

`vendor_design_system.py` grew a `derived` step for it: parse the pinned tarball's icon module, emit
`design_icons.ts` as a frozen table, under the same version and integrity pin. It is the only vendored
artifact that is *transformed* rather than copied, so the transform is deliberately narrow — it copies every
attribute verbatim, never reformatting a coordinate, and it **refuses** rather than emit a glyph whose element
count does not match the source, because a dropped `<path>` is a glyph that still draws.

Two things that were wrong on the way, both worth keeping:

- **A camelCase-to-kebab rule mangles `viewBox`.** SVG attribute names are case-sensitive and `viewBox` is
  genuinely camelCase, so the rule emitted `view-box`, which a parser *ignores* — every glyph would have
  rendered at the default `0 0 300 150` viewBox and been invisibly mis-scaled. It is an explicit table now, so
  an unanticipated attribute fails the vendor step instead of being silently mangled.
- **The frame is read from the module's own `svg()` helper**, not retyped, so the ten rules arrive with the
  artwork rather than from someone's memory of them.

#### Check 9, and the failure mode that is not the obvious one

Gate check 9 fails on hand-drawn geometry in our markup or TypeScript. It also reads **CSS**, and that is the
part worth explaining: `fill`, `stroke`, `stroke-width`, `stroke-linecap` and `stroke-linejoin` exist both as
SVG presentation attributes and as CSS properties, **and the CSS wins**. So one `stroke-linecap: round` in our
sheet silently defeats the vendored frame on every glyph it matches — geometry correct in the file, correct in
the DOM, wrong on screen. All five icon rules in this page had exactly that.

The settings page keeps its two glyphs as a transcribed `<symbol>` sprite, because `design_icons.ts` is
compiled by the `redrob/` bundle and a sibling bundle's `ts_files` are relative to its own directory.
Transcription is not forbidden — an **unverified** transcription is. Each symbol declares which vendored glyph
it carries and check 9 compares every coordinate. Both match the delivery exactly today; without the check
they would keep matching until the first re-pin moved one. Sharing the compiled module across all three
bundles is a build change and is its own slice in `UX-PROGRAMME.md`.

Five faults injected, five caught: a CSS override, a hand-drawn glyph back in the markup, a `data-icon` naming
a glyph the table lacks, a sprite drifting one coordinate, and the vendored frame losing its butt caps.

## The model picker and the leaderboard source

`ModelPicker`'s 30 `.rr-model__*` rules are now in the bundle, so the CSS is no longer what blocks it. The
data is. This section is the design for closing that, and it is a design rather than a change: nothing below
is implemented.

### What the component needs, and what the browser has

`ModelPicker` asks what the person does and what they want, then ranks. Per pick it renders a rank, the model
name, a short name for the trigger, the harness it runs in, an effort level on that maker's own scale, one
line of *why* it is ranked there, and a monthly price. Around them it renders the source's name, its edition,
and a `basis` block explaining how the ranking and pricing work.

`TaskStore::ListModels()` returns `ModelOption`: `id`, `provider_id`, `name`, `capabilities[]`, `price_band`.

No rank. No monthly figure. No profession, no task, no why, no harness, no edition. So the honest gap is
not "some fields are missing" — it is that the browser holds a **list** and the component renders a
**ranking**, and those are different kinds of thing.

`capabilities[]` and `price_band` must never be turned into one. A ranking derived locally from capability
strings would differ from the website's for the same month, which breaks the promise the control is built on:
`55-agents.md` says `ModelPicker` shows *one* ranking across every app and that "nothing is re-ranked to
favor the product the picker is in".

### Where the ranking comes from: the local engine, not the browser

Three sources were considered.

| Source | Why not, or why |
|---|---|
| Vendored and pinned, like the tokens | The ranking is re-issued monthly and a browser release is not. An install would display an edition older than its own age, and the pin would have to be bumped on a calendar rather than on a change. Rejected. |
| Fetched by the browser from a Redrob endpoint | Puts a network request behind the new-tab page, with its own privacy story, its own cache, and its own integrity problem — a reordered payload is an invisible attack on a ranking. Rejected as a *second* fetcher. |
| **Served by the local engine, which already serves the model list** | Chosen. |

The engine is already the browser's only source of model data, over one path: WebUI → mojom → `TaskHostImpl`
→ `TaskStore` → engine HTTP. Adding the leaderboard there means no new network code in the browser, one
cache, one place to verify a payload, and — because Desk and Code talk to the same engine — the same bytes
behind the same ranking in three products, which is what "one ranking" has to mean in practice.

It degrades the way the model list already degrades: no engine, no ranking. That is a known, visible state
today ("Default model" on a machine with no engine), not a new failure mode.

### The mojom shape

Mirrors the component's own types, so no translation layer gets to make a decision:

```
struct LeaderboardEffort { string label; uint32 level; uint32 of; };

struct LeaderboardPick {
  string id; string model; string short_name; string harness;
  LeaderboardEffort? effort;
  string why;                 // empty means absent, never generated
  double? monthly;            // base currency; null means unpriced, never 0
};

struct LeaderboardTask {
  string id; string label; string title; string usage;
  array<LeaderboardPick> picks;   // ORDER IS THE RANK
};

struct LeaderboardProfession { string id; string label; bool disabled;
                              array<LeaderboardTask> tasks; };

struct Leaderboard {
  string name;                    // "Redrob Leaderboard"
  string edition;                 // "September 2026" -- REQUIRED
  string note;                    // "Updated monthly"
  string base_currency;           // "USD"
  map<string, double> rates;      // conversion from base
  array<string> basis;            // the paragraphs, as authored
  array<LeaderboardProfession> professions;
};

// Null when the engine has no leaderboard, which is not an error.
GetLeaderboard() => (Leaderboard? leaderboard);
```

### The rules the implementation has to keep

These are the parts that are easy to get wrong and impossible to see afterwards.

1. **Never sort, never filter, never re-rank.** `picks` arrives in rank order and is rendered in array order.
   `here` greys a pick that runs elsewhere and leaves it at its true place; it does not remove it, because a
   filtered list makes the ranking look shorter than it is.
2. **Absent renders as absent.** No `why` means no why line. `monthly` null means no price, not `0` and not
   "from". A component whose promise is honesty must not be fed a placeholder.
3. **`edition` is mandatory.** A payload without one is refused and the picker falls back to the plain
   select. An undated ranking cannot be checked against the website, so it is worse than none.
4. **Decode one entry at a time and count the drops.** A whole-array decode behind a fallback means one
   unexpected value silently costs the entire ranking and nothing reports why. Keep the failure reason.
5. **Convert in the page, not in the engine.** `monthly` stays in `base_currency`; the page applies `rates`
   and rounds to that currency's step, because the page is what knows the document language. Pre-converting
   in the engine would bake one reader's currency into a cache three products share.
6. **Ship no fallback copy.** If the engine has no leaderboard, there is no ranking. A September edition
   compiled into a browser someone installs in March is a false claim with a date on it.

### What is still open, and needs an answer before code

- **Redrob Auto needs a second engine capability.** The component's Auto layer shows which task the last
  message was matched to (`matchedTask`), and `55-agents.md` requires every answer to say who chose and at
  what rank. The engine has to return that per turn. Until it does, the picker can ship with `auto` off — the
  ranked list is useful on its own — but Auto must not be drawn as an option that does nothing.
- **Three layers of override need a home.** Auto, a task the person pins, a model the person pins. That is
  per-profile state, so a pref, and its migration is a decision (what happens to a pinned model that leaves
  the ranking next month — fall back to Auto, or keep a model the list no longer carries).
- **`here` is a string the two sides must agree on.** The component compares `pick.harness` to `here` by
  equality, so "Redrob Browser" has to be spelled identically in the engine's data and in the browser. That
  is a contract, and it should be asserted, not assumed.

### The panel's behaviour is ours to write

`.rr-model__*` is a CSS shell. The open/close, the profession and task selects, the roving listbox, the
dismiss-on-outside-click and the keyboard handling live in `ModelPicker.tsx` and do not cross. Reproducing
them in `redrob.ts` is the larger half of the work, and the one place where this browser's copy can drift
from every other surface's behaviour while looking identical. Worth its own slice, and worth a test that
drives it rather than a screenshot that shows it.
