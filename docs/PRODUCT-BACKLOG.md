# Product backlog: the surfaces a person actually sees

This is the browser's user-facing work, ordered, in a shape a loop can consume: one item per pass, each with
its own acceptance criterion and the gate that proves it. It is NOT a feature wish list — every item here is a
surface that already exists in some form and is wrong, or a surface a shipped browser is expected to have and
we do not.

**The binding acceptance criterion for every item in §2 and §3 is the design system.** A change that adds the
right behaviour with hand-rolled colour, type, spacing or controls is NOT done. `docs/DESIGN-SYSTEM.md` records
what is vendored (`design_tokens.css`, `design_system.css`, `redrob_tokens.h`) and `scripts/check_design_tokens.py`
is the gate. If a surface needs a control the design system does not ship, that is a finding to record, not a
licence to invent one locally — the settings page already paid for this once with a second `.field` definition
that disagreed with `.rr-field` on four properties.

Reference captures of a comparable product's flow are held OUTSIDE this repository at
`/home/ubuntu/reference/ui-reference/onboarding/` (14 PNGs, install through first run). They are a reference for
STEP ORDER and information density only. Do not copy their layout, their copy, or their brand, and do not name
that product anywhere in this repository. Our own design system decides how each step looks.

## 0. How to run this in a loop

One item per pass. A pass is done when its acceptance line is true and its gate is green — not when the code
compiles.

1. Read the item. Read the surface's current state before changing it.
2. Change it.
3. Run the item's gate. If the gate does not cover the item's acceptance line, the gate is the work.
4. Verify on a real build for anything visual. `python scripts/redrob.py build --flavour dev` then a real
   window — a WebUI change that is not rendered has not been seen. Reverse-verify any new gate by injecting
   the fault it claims to catch.
5. Commit one item per commit. The item id belongs in the subject.

Do not batch items. Each one is sized to be finishable, and a pass that touches four surfaces cannot be
reviewed or reverted.

## 1. Install and first launch — item group INS

Nothing a person sees before the browser opens is ours yet. This is the first impression and it is currently
whatever the platform's installer chrome looks like.

| id | item | acceptance |
|---|---|---|
| INS-1 | Download progress window carries our brand | A progress window with our mark, our surface colours from the token layer, and our progress control. No platform-default dialog chrome. |
| INS-2 | Installer copy is ours | Every string a person reads during install is in our voice and in the string table, not hardcoded in installer script. |
| INS-3 | The download page hands over the right artefact per platform | One page, correct file for the visitor's OS, checksum shown, and it says what it is installing. |
| INS-4 | First-run terms dialog says something true | It currently renders "This Space Intentionally Blank" under a title asking for agreement, on the OFFICIAL build. Either it carries real terms or the step does not exist. Shipping consent to an empty document is the defect. |

INS-4 is not cosmetic. It has shipped since 0.1.0 and it asks a person to accept a document we do not show
them.

## 2. Onboarding — item group ONB

We have six steps: `welcome`, `account`, `agent`, `passwords`, `model`, `import`
(`redrob_onboarding.ts:23`). The order is wrong in one place and three steps are missing.

| id | item | acceptance |
|---|---|---|
| ONB-1 | Every step uses design-system controls | No local `.field`, `.button`, `.card` definitions in the onboarding sheet. Inputs are `.rr-field`/`.rr-control`, buttons are the DS button, the step dots and the Back/Skip/Next row are one shared component. |
| ONB-2 | Split layout: form left, live product right | Each step that asks for something shows what it is for. Right pane is a real screenshot or a live surface, not decoration. |
| ONB-3 | Email → verification code step | Six single-character boxes, resend with a visible countdown, paste of a whole code fills all six. Errors are inline, not a dialog. |
| ONB-4 | Import step shows sources as cards, then profiles | Source cards with real product marks; a selected source then lists ITS profiles with a last-used time, and Import/Cancel/Back. We already detect profiles — this is presentation. |
| ONB-5 | Import covers the browsers people actually leave | Today: Chrome, Chromium, Edge, Brave, Opera, Vivaldi. Missing: Firefox, Safari. Each one added must be proved against a real profile fixture, not a hand-written one. |
| ONB-6 | A step that states the product's position | One screen, one claim, no feature list. Ours must be our claim, written by a person, not a translation of anyone else's. |
| ONB-7 | Credential step offers a real choice | "Let the browser fill sign-ins for you" with two paths — bring credentials in, or keep using an existing manager — and an honest line about where they are stored and what the model can see. |
| ONB-8 | Subscription / provider step | See §3 SUB. Onboarding's part is the step shape: recommended option first, other subscriptions behind one link, own API key behind that. |
| ONB-9 | The engine is present by the end of onboarding | Today the browser searches `PATH` and `~/.redrob/bin` and silently has no engine if it finds nothing. Onboarding must either install it or walk the person through installing it, and must not finish claiming a working agent it cannot reach. |

ONB-9 is the item that makes the rest worth doing. Every agent surface is dead without an engine.

## 3. Subscriptions and providers — item group SUB

This is where the largest product gap is, and it is smaller than it looks because the engine already has the
machinery.

**Measured:** the engine's `providers login` already branches on an auth method of `oauth`, an `api` key, and a
`wellknown` provider-metadata flow (`packages/redrob/src/cli/cmd/providers.ts`), and ranks `anthropic` and
`github-copilot` among its providers. What is missing is the browser exposing it.

| id | item | acceptance |
|---|---|---|
| SUB-1 | Provider list in our UI, sourced from the engine | The browser asks the engine what it can log into and renders that. No hardcoded provider list in the browser — a second list is a second truth. |
| SUB-2 | Subscription sign-in, not just API keys | A person with an existing paid subscription can connect it and have their own quota used. Verify end to end on a real account: the provider's own usage must move. Do not report this done from a successful redirect. |
| SUB-3 | Own-API-key path | Behind the subscription options, not beside them. Key is stored by the engine, never by the browser, and never rendered back. |
| SUB-4 | Plan and usage surface | What plan is connected, what has been spent, where the number came from. A usage figure with no stated source is worse than none. |

SUB-2's acceptance line is deliberately harsh. A sign-in flow that completes and then silently bills the wrong
account is indistinguishable from one that works, until the bill arrives.

## 4. Settings information architecture — item group SET

Ours is a flat page with these headings: Getting Started, Routines, Memory, Models, Sign-in, Provider,
Passwords, CLI, Files, Appearance. It has no grouping and no route per section, so it cannot grow.

| id | item | acceptance |
|---|---|---|
| SET-1 | Grouped navigation with a route per section | Four groups — the person, the agent, features, archive. Each section has its own URL so a link can point at it and Back works. |
| SET-2 | Every row is a design-system row | One row component: title, description, control on the right. No per-section layout. |
| SET-3 | Search across settings | Searches titles AND descriptions, and jumps to the row highlighted. |
| SET-4 | The Chromium half is reachable, not duplicated | Default search engine, languages, spell check, zoom and the rest already exist in Chromium. Surface the handful people expect to find here and link the rest. Do not reimplement a preference the browser already owns. |
| SET-5 | A first-class status banner | Default-browser prompt, engine-missing prompt, update-available prompt share one component and one place. Today they have nowhere to live. |

## 5. Capabilities we do not have — item group CAP

Each of these is a project, not a pass. They are listed so the loop does not mistake them for polish, and
ordered by how much of the product depends on them.

| id | item | why it is here |
|---|---|---|
| CAP-1 | Skills | A skill is a folder with a `SKILL.md` and frontmatter, and the engine already loads exactly that shape (`packages/core/src/skill.ts`). The work is not the format; it is which skills we write and how they arm. |
| CAP-2 | Skill auto-arming | Frontmatter that names URL patterns and keywords, so a skill loads when the tab or the prompt matches. Without this a skill library is a list nobody opens. |
| CAP-3 | Agent in the address bar | The address bar is where a person already types intent. Ours is only in the sidebar. This needs tab context, file context, and a mode that is visibly not a search. |
| CAP-4 | Work that survives the window closing | An agent task that stops when a window closes is a chat, not an agent. |
| CAP-5 | A global quick window | Own shortcut, own size, reachable without the browser focused. |
| CAP-6 | OS-level control | A separate signed helper process, installed by our installer alone, never a tool inside the engine. See the briefing's scope note. |
| CAP-7 | Content blocking | Subscription lists, custom rules, and a way to test why one request was blocked. Expected of a browser; we have none. |
| CAP-8 | Rich answer rendering | Maths, diagrams and syntax highlighting in agent output. Cheap, and it is most of the perceived quality of an answer. |
| CAP-9 | Credential vault | Only if we mean it: a vault is a promise about other people's passwords. Chromium's own store is the honest default until we do. |

## 6. Gates

An item is done when its gate is green, and a gate that cannot fail is not a gate.

- `scripts/check_design_tokens.py` — the design-system gate, eight checks. Every §2–§4 item passes through it.
- `scripts/check_repo.py` — manifest, patch names, versions, rewrite rules. Runs in CI without a checkout.
- `python scripts/redrob.py build --flavour dev` then a real window, for anything visual.
- A new gate must be reverse-verified: put the fault back, watch it fail, then fix it again. A gate is not
  evidence until it has failed once on purpose.
