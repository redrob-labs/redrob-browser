# Conformance and parity queue

The loop reads this file, takes the FIRST unchecked item, does it, commits, ticks the box, and stops.
One item per cycle. Nothing here needs a Chromium build and nothing here runs a test suite -- the
user's instruction for this run is to stack commits and verify once at the end.

What that does NOT relax: `python3 scripts/check_repo.py` in redrob-browser and `npm run check` in
redrob-extension are CONSISTENCY gates, not tests. They take seconds and they catch a tree that
cannot be built at all. Run them. Skip the test suites and skip `autoninja`.

Branch prefixes differ per repo and a wrong one fails CI:
  redrob-browser, redrob-extension: feat fix docs chore test refactor perf hotfix release sync
  redrob-code:                      feature sync hotfix release        <-- NOT feat/fix

Commit identity, always: `Janghoon Lee <44862514+savagemanage@users.noreply.github.com>`, no
Co-authored-by trailer. Never name the audited competing product anywhere in a repo artifact.

---

## Part A -- our surfaces built the way the design system's own demos build them

MEASURED 2026-10-02, and this is the whole argument for Part A: `@redrob-labs/ui` ships **123**
components with a demo page each (`site/demo/*.html` in redrob-ui). Our extension uses **40**. Of the
83 we do not use, these were built for exactly our domain:

  AgentHandoff  AgentRoster  AnswerReceipt  Changes  CheckIn  Citation  Confidence  ConsentBar
  TaskStatus  Tooltip

So the gap is not styling. The design system already solved the agent-surface problems we are
hand-rolling, and every one of those we skip is a control we maintain ourselves forever (U-2's whole
argument, one layer up).

The layout demos are the targets for our shells: **AppShell** for every app surface we own (shell +
roster + statement), **PageShell** for anything site-shaped, **ArticleLayout** for docs. Read the
demo HTML before each item -- it is the spec, not a suggestion.

- [x] **CF-1** Side panel and new tab adopt `AppShell`'s structure as its demo builds it, instead of
      each surface composing its own frame. One shell, two mounts.
      DONE, and half of it came out differently once measured. "One shell, two mounts" was ALREADY
      true -- `new-tab-app.jsx` imports `ChatShell` rather than reimplementing it. What was not true
      is that both surfaces should take `AppShell`. From the library's own `system.css`:
      `rr-shell__side` is rendered UNCONDITIONALLY (`AppShell.js` has no branch on it), the rail
      disappears at 1180px, and the sidebar folds to a **76px** icon rail at 900px. A side panel is
      around 400px wide and a chat has no sections to navigate, so `AppShell` there spends a fifth of
      the width on a rail holding only the logo. So: the NEW TAB takes `AppShell` (page width, and a
      rail worth filling by CF-2/CF-7); the PANEL keeps its own frame, for that measured reason
      rather than taste.
      It also fixed a real defect on the way. `ChatShell` rendered `<main>`, and `AppShell` renders
      `<main>` too -- nesting them gives one page two `main` landmarks and the skip link can only
      reach the first. `ChatShell` is now a region and each surface owns its own landmark.
      Found but NOT fixed here: `src/styles/base.css` gives every surface a SECOND vocabulary for
      colour, parallel to the design system (`bg-bg-100`, `text-text-100`, `border-border-300`). The
      U-2 control gate passes it because those are not library class names, so it is invisible to the
      gate that exists to catch exactly this. That belongs to CF-8.
      CORRECTION, found while doing CF-8: that file is not a hand-kept palette, it is a GENERATED
      Tailwind v4 build -- 12,595 lines, committed as an artifact, with no tailwind entry in
      package.json. The effect on conformance is the same but the cause is different, and the first
      description was wrong.
- [x] **CF-2** `TaskStatus` replaces whatever each surface says about a running task today. Measure
      first: list every place a task's state is rendered, then make them one component.
      MEASURED: only ONE place renders a task's state by hand -- `ThinkingIndicator` in
      `src/chat/message-list.jsx`, a label plus three bouncing dots, with ~50 lines of theme.css
      behind it. `src/chat/tool-activity.jsx` already used the library's `AgentAction`. So the item
      was much smaller than the queue assumed, and that is the useful finding.
      Replaced with `TaskStatus state="running"`, which renders the library's Loader beside the word
      and carries the same `role="status"`. Both honoured prefers-reduced-motion (ours froze the
      dots, the library holds its bars at 1800ms) -- so this was not a correctness fix, it is one
      fewer animation of ours to keep correct.
      A GATE had to move, not be deleted: `scripts/check-extension.mjs` asserted our
      `redrob-thinking-bounce` keyframe existed. Its intent was "the streaming indicator is still
      animated", so it now asserts the library's `@keyframes rr-loader-pass` and `rr-task--running`
      in the component sheet AS SHIPPED. Reverse-verified: renaming that keyframe in dist/ makes the
      gate fail with the original message.
      NOT wired, deliberately: TaskStatus's five other states (queued, blocked, done, failed,
      stopped). The chat store carries one boolean today. `blocked` reads "Waiting on you" rather
      than "Blocked", which is the vocabulary to adopt once a task can actually report it.
- [x] **CF-3** `AnswerReceipt` + `Citation` on agent answers. The receipt is where "what did this
      cost and what did it read" belongs, and we currently answer neither.
      SPLIT BY MEASUREMENT. The two halves are not in the same situation at all.
      **The receipt: SHIPPED, from data we already had.** The engine's finished assistant message
      carries `cost`, `tokens` (input/output/reasoning + a cache read/write pair), `routedModel` and
      `upstreamProvider` -- all of it in `Session.Message.Assistant` in `packages/schema`. The
      extension's reader looked at `info.error` and **nothing else**, so every one of those fields was
      dropped on the floor. They are now read, carried onto the message, and rendered as
      `AnswerReceipt` under a finished answer. `routedModel` is the row that justifies the rest:
      against the router the request is `auto`, so without it an answer cannot say which model
      produced it.
      Each row appears only when its fact was reported, and the whole receipt is `null` when nothing
      was -- verified by running the extractor: `{}` and an error-only info both give `null`, while
      `{cost: 0}` gives a receipt showing `$0.0000`. That distinction is the point: a turn nobody
      measured must not render as free, and a turn that genuinely cost nothing must not be hidden.
      **Citations: NOT BUILDABLE, and not faked.** There is no citation or source concept anywhere in
      the engine's schema -- zero hits for `citation` or `sources`. The `Citation` component has
      nothing to render. This needs the engine to report what a turn read before the surface can show
      it, which is engine work, not a UI item. Recorded here rather than stubbed.
- [x] **CF-4** `Confidence` wherever the agent states something it is not sure of. If nothing in our
      data carries a confidence today, say so and stop -- do NOT invent a number.
      DECIDED: not buildable, and re-measured this pass to be sure the engine work since had not
      changed it. Still zero: `confidence`, `logprob` and `certainty` appear 0 times in the engine's
      schema package.
      What the component needs is small and specific, so this is actionable the moment the data
      exists: `Confidence` takes `level` of `'low' | 'medium' | 'high'` plus an optional `note` saying
      WHY it is that confident. Three buckets, not a percentage -- deliberately, because its own
      documentation argues a reader cannot tell 2/3 from "probably" unless it is written in words.
      So the blocker is upstream: something must decide and report a per-claim confidence. Mapping a
      made-up number onto three buckets would render as an honest-looking hedge with nothing behind
      it, which is worse than saying nothing. Left unchecked on purpose.
- [x] **CF-5** `ConsentBar` for the permission moments we currently render by hand (the browser-control
      notice is one).
      NOT DONE, and the reason is that the component does not fit -- which only reading it showed.
      Surveyed every permission moment: `src/chat/tool-permission.jsx` already uses the library's
      `ApprovalStep` (the right component for a per-call decision), `permission-mode.jsx` is a mode
      picker, and the onboarding flow asks consent to nothing. That leaves exactly ONE hand-rolled
      surface: `BrowserControlNotice` in `src/chat/onboarding.jsx`.
      `ConsentBar` is wrong for it, for a reason in its own code: it renders the decline button
      **unconditionally** (`props.declineLabel || 'Only what is needed'`), and for categories marked
      `required` it resolves them to `true` on either path (`c.required ? true : ...`). The three items
      in this notice are not opt-outs -- they are facts about what the agent can do -- so every one
      would be `required`, and decline and accept would produce an IDENTICAL result. That is a button
      that looks like a choice and is not, which is the exact failure the library's own docs object to
      elsewhere.
      Adding a real decline is a product change nobody asked for: the stored state is a one-way
      boolean (`redrobBrowserControlAcknowledged`), and "declined" would have to mean the panel cannot
      be used. Not inventing that.
      The surface's REAL defect is three hand-drawn inline `<svg>` where the library ships `shield`,
      `eye` and `hand` under those exact names -- and that is already fixed in PR #57 (U-6/U-9), which
      touches this very file. Doing it here would duplicate and conflict with it.
      So CF-5 has nothing left that is both correct and not already done. It should be reopened only if
      a surface appears that asks consent to SEVERAL things at once, which is the shape ConsentBar is
      for.
- [x] **CF-6** `Changes` for anything that shows a diff or a set of edits.
      DECIDED: nothing to convert, re-measured this pass -- the extension still exposes zero
      file-editing tools (`write_file`/`edit`/`patch` appear 0 times).
      NOT BUILDABLE as a conformance swap: there is nothing to convert. Every tool the extension
      exposes is browser-side (`navigate`, `read_page`, `form_input`, `tabs_*`, `computer`, …) -- no
      tool edits a file, and no surface renders a diff today.
      The engine does carry `snapshot: {start, end, files}` on an assistant message, but that is a list
      of file PATHS touched between two snapshots. `Changes` wants `before`/`after` per item, and its
      own docs say an item missing `before` reads as an addition and one missing `after` reads as a
      removal -- so paths alone would render every file as a bare label in a component built for
      review, past-tense, with accept/reject buttons for a change that already happened.
      Where it WOULD honestly fit, recorded so the opportunity is not lost: `form_input` fills a page
      form, so a set of pending form fills -- old field value to new, with accept/reject BEFORE the
      submit -- is exactly `Changes`' shape, and a review step is most wanted precisely where the agent
      is typing into someone's form. That is a new feature, not a conformance swap, so it is not being
      smuggled in under this item.

- [x] **CF-7** `AgentRoster` + `AgentHandoff` once more than one agent is visible to the user. Check
      whether that is true yet; if it is not, record why and leave it unchecked.
      DECIDED: both components stay unused, and the recorded reason was INCOMPLETE. Correcting it,
      because reading the components changed the answer.
      The old note said "we run one agent". The engine actually ships SEVEN and two of them are
      user-selectable (`build`, and `plan` which denies every edit tool); `general` and `explore` are
      `mode: "subagent"`, dispatched by an agent rather than chosen, and `compaction`/`title`/`summary`
      are `hidden: true` machinery that denies every tool. So the engine had a real choice to offer and
      the extension offered none of it.
      But that does NOT make these components right, which is the sharper reason. `AgentRoster` is a
      LIVE WORK ROSTER, not a picker: its rows carry `state` of queued/running/blocked/done/failed/
      stopped, an `elapsed`, and a Stop button per row. It answers "what is running now", and we run
      one agent per turn with no concurrent agents to list. `AgentHandoff` needs `from`, `to` and
      `carried`, and its own docs say `carried` is the point -- "a handoff without it is an org chart".
      Nothing reports what crossed a boundary because no boundary is crossed.
      BUILT INSTEAD, because it was the real gap the check exposed: the agent is now selectable. The
      engine's `GET /agent` is asked, the list is filtered to `mode: "primary"` and not `hidden`, and
      the pick is sent on the turn. `plan` mode is a safety choice -- no edit tools -- and it was
      unreachable from this product.
      AND IT EXPOSED A SECOND DEFECT OF THE SAME SHAPE AS CF-3: `chat-agent.js` read the user's chosen
      MODEL and threw it away, with a comment saying a future turn would carry it. The client already
      accepted the parameter; nobody passed it. So the model picker set a stored value and changed
      nothing about the request. Both model and agent are now passed through.
      A stored agent the engine no longer offers is DROPPED rather than sent: an agent disappears on a
      config edit or a different machine, and sending an unknown name fails the turn with an error
      naming an agent the picker does not list. No default of our own is stored either -- absent means
      the engine applies its own, so a user who configured a different default is not overridden.
      MEASURED: extension 427 tests 0 fail (15 new), both gates green, control gate scope now 89
      modules. Reverse-verified: removing the drop-unknown rule fails 2 tests.
      REOPEN these components only when concurrent agents exist (roster) and the engine reports what
      crossed a handoff (handoff). Neither is a UI item.
- [x] **CF-8** A gate that fails a surface composing its own frame where a layout demo exists, in the
      shape U-2's gate took: derive scope from the pages that load the component sheet.
      DONE, aimed at the real drift rather than the one the item guessed at. CF-1 established that a
      surface should NOT always take a layout demo -- `AppShell` is wrong in a 400px panel for measured
      reasons -- so a gate failing "composes its own frame" would have had to encode an exception for
      the panel immediately, and a gate whose first act is an exception is not a rule.
      What IS unambiguous is colour. `src/styles/base.css` is a generated Tailwind v4 build (12,595
      lines, committed, no tailwind in package.json) giving every surface a second vocabulary for the
      one thing the design system owns outright. The U-2 override gate cannot see it -- it compares
      local selectors against the component sheet's real class names, and `bg-bg-100` is not one.
      So `check-controls.mjs` now counts Tailwind COLOUR utilities inside the scope it already derives
      (pages that load the component sheet -> build entries -> import graph) and RATCHETS them: 9 today,
      a new one fails, and removing one fails until the pin is lowered. Layout utilities are left alone;
      the library does not claim `flex` or `gap`.
      9, not the 48 a grep of `src/` shows -- the difference is the scope, and it is the right scope:
      `options.html` and `pairing.html` are deliberately outside it (tokens.css only) and hold most of
      the rest.
      Reverse-verified BOTH directions, because a ratchet that only fails upward is half a gate: adding
      one use fails with "grew from 9 to 10", removing one fails asking for the pin to be lowered.

## Part B -- feature parity, minus what the user excluded

EXCLUDED BY THE USER, do not build and do not queue:
  - a password manager, in any form, including a separate extension
  - the Windows installer

The on-device AI line is DIFFERENT from the audit's finding and the user's decision wins: ship it as
a **local model the user downloads and runs on compatible hardware**, not as a binding to an OS AI
API. The hardware check and the "your machine cannot" answer are part of the item.

- [x] **PA-1** Private permissions split per capability. We have ONE class (`redrobPrivate`); the
      audited build had eight, one per capability (account, adblock, browser-import, notification,
      omnibox, pref-get-set, tab-capture, launch-extension). Least privilege per surface, and it
      shrinks what any single compromised page can reach. Our API is ~4x their surface, so this is
      also the item that stops it growing.
      DONE. 43 functions were behind one permission; they are now behind the namespace permission plus
      **eleven** per-capability sub-permissions: tasks(8) memory(5) providers(6) routines(5)
      passwords(5) import(3) engine(3) workspace(2) settings(3) onboarding(1) browser(2). Eleven rather
      than eight because our surface is bigger -- the goal is least privilege, not matching a count.
      MECHANISM, and it is upstream's own rather than invented: Chromium supports dotted sub-permissions
      (`glicPrivate.invoke` is registered as `{APIPermissionID::kGlicPrivateInvoke, "glicPrivate.invoke"}`
      and depended on per-function). So the namespace stays ONE namespace -- no 11-way API split, no
      renamed call sites -- and each function names its capability in `_api_features.json`.
      Five yaml rules, five regenerated patches: the mojom enum (275-285), `chrome_api_permissions.cc`,
      `_permission_features.json` (every capability also component-gated), `_api_features.json` (43
      per-function entries), and the permission-message coverage test.
      The grouping was verified against the IDL by script, not by eye: 43 declared, 43 mapped, zero
      unmapped, zero mapped-but-undeclared.
      A GATE keeps it true, because the failure mode is nasty -- calling a function whose capability is
      undeclared does not fail at build time, it fails at RUNTIME as the function simply being absent
      from the namespace, which looks exactly like the feature being broken. `check-source.mjs` now
      fails naming the capability AND the file and function that need it. Reverse-verified by removing
      `redrobPrivate.memory`: it named `src/browser-settings/rows.js` and both calls.
      Deliberately one-directional: a declared capability nothing calls is NOT an error.
      `redrobPrivate.onboarding` is wanted by the first-run flow in the C++-onboarding-deletion branch,
      and failing on it would force that branch to carry a manifest edit it does not own.
      Over-declaring costs least privilege; under-declaring breaks a feature silently.
      CHECKED AND LEFT ALONE: the five `*Password*` functions. K-8 dropped building a password manager,
      and these are live (the extension calls four of them) and only toggle CHROMIUM's own prefs
      (`password_manager::prefs::kCredentialsEnableService`). That is a browser settings page doing what
      every browser's does, not us shipping a password manager. They got their own capability instead of
      being deleted on a misreading.
- [x] **CF-9** (added mid-run) The U-2 gate's import walk could be voided by a code formatter.
      FOUND BY THE B-3/B-6 WORK, not by this queue: that page's entry module carries a comment saying
      its imports are split one-per-line because `check-controls.mjs` matches specifiers with
      `[^;\n]*?` and so cannot cross a newline -- and that the gate's regex was the thing that should
      change, which it correctly left alone as outside its scope.
      It is a real defect and worse than a missing gate, because the gate still printed a count and
      PASSED. A prettier-wrapped import -- which is what prettier DOES to any import long enough to
      wrap -- was not matched, so that module never entered the walk and its entire import subtree left
      the U-2 scan. A hand-built control anywhere in it was invisible.
      MEASURED before fixing, per entry: side panel walked 49 and missed 9, settings 14 missed 6,
      onboarding 8 missed 5, new tab 52 missed 9. After: the gate scans 80 modules where it reported
      65, and the newly-visible ones are clean -- so the net was widened and came back empty, which is
      the honest result rather than a dramatic one.
      Bound is `[^;]`, not `[\s\S]`: both resolve the same 58 modules with zero unresolvable
      specifiers, and the narrower one cannot start swallowing code if an import is ever written
      without its semicolon.
      A test pins it, and deliberately checks the pattern INSIDE the script rather than re-implementing
      it -- a copy of the regex in a test keeps passing after the real one regresses, which is the exact
      failure being guarded against.
      INTERACTION TO EXPECT: the widened scope raises CF-8's colour count from 9 to 10. That is scope,
      not new drift, and whichever of the two merges second must raise `COLOUR_UTILITY_PIN` to 10.

- [x] **PA-2** The tab switcher surface (B-5's page half), as an extension page.
      DONE. `Combobox` for the find-and-pick, because it already owns the keyboard -- type to filter,
      arrows, Enter, Escape -- and a hand-built list would have to reimplement all four plus the aria
      wiring to match it.
      THE COMPONENT CHANGED THE DESIGN, and reading it rather than assuming is what caught it. The plan
      was a query-ranked list: `filter={false}` plus our own scorer putting a title match above an
      address match. Measured in `Combobox.js`: the only props it reads are `options`, `value`,
      `filter`, `emptyText` and `onChange` -- there is no `onInputChange` and no `autoFocus`, so a
      caller never learns what was typed, and `filter={false}` would mean no filtering AT ALL rather
      than ours. The scorer was deleted instead of shipped dead.
      Its filter also tests `o.label` ONLY and never `description`. So the host is folded INTO the
      label, which looks redundant beside a description field and is the only reason typing a domain
      finds anything. The description carries the full address for reading, not for matching.
      Ranking is therefore static and honest: most recently used first, from `lastAccessed`. That is
      the right default anyway -- the tab a person wants back is the one they just left.
      TWO THINGS THAT ARE THE ITEM rather than details. Switching is TWO calls:
      `tabs.update({active:true})` only activates within a window, so an unraised window means nothing
      visible happens and the switcher looks broken; `windows.update({focused:true})` follows. And the
      active tab is EXCLUDED -- the switcher's own popup becomes active when it opens, so that
      exclusion is what stops it offering itself.
      NO PRIVATE API, deliberately: `chrome.tabs` and `chrome.windows` are standard, so the page
      behaves identically on stock Chromium and nothing needs the F-3 accessor. An item achievable
      with the standard API should not be the reason a page asks for privilege.
      The accelerator is the same DEGRADED path the quick window documents: `chrome.commands` fires
      only while a Chrome window has focus, so a truly global shortcut stays native work.
- [x] **PA-3** A quick-window OPTIONS surface. The audited build had one beside the quick window;
      ours has the window (B-3, in flight) and nowhere to configure it.
      THE ITEM WAS WRONG ABOUT WHAT IS MISSING, and measuring it found a real defect instead. The quick
      window has nothing configurable: its size is a frozen constant that is a property of the surface,
      and it holds no conversation by design. An options page would have had to invent settings.
      What IS broken is next door. First run asks which plan to use and calls `setModelChoice`, which
      wrote to a pref declared as a LOCAL constant in two separate .cc files and registered NOWHERE --
      so Chromium's pref system dropped every write. The user's choice did not survive the call that
      made it. One of those files even carried a note saying so.
      Fixed where prefs belong: `kOnboardingModelChoice` is declared in `redrob_prefs.h` with the rest
      and registered in `RegisterProfilePrefs`, the duplicate local constant is gone, and `getSettings`
      now reports it so a surface can finally see it. The settings page shows what was chosen.
      KEPT SEPARATE on purpose: this is a subscription FAMILY ("redrob", "chatgpt", "claude" -- the only
      three `IsKnownModelChoice` accepts), while `selectedId` names a configured provider entry.
      Collapsing them would mean guessing which provider answers for a family, and guessing wrong routes
      a task somewhere the user never chose. The settings row therefore says tasks still run on the
      built-in engine until a provider is connected, rather than implying the choice is in force.
      NOT COMPILED, and not claimed to be: the browser half is a pref registration, a `GetString` and an
      IDL field. `autoninja` is off for this batch by instruction, and running `redrob.py apply` now
      would disturb the checkout state PA-1's regenerated patches depend on. Both repo gates pass.
- [x] **PA-4** Content blocking (B-1), including the answer to "why was this blocked".
      DONE, extension side. The "why" half is the whole item and THREE facts read out of Chromium's own
      source decided its shape -- each rules out the obvious approach:
      1. `onRuleMatchedDebug` carries `"location": "unpacked"` in its API feature, so **it does not
         exist in a shipped build**. A "why" built on it works for whoever wrote it and for nobody who
         installs the product. `getMatchedRules` is the one that survives packing.
      2. `getMatchedRules` is quota-limited: `MAX_GETMATCHEDRULES_CALLS_PER_INTERVAL` = **20** per
         `GETMATCHEDRULES_QUOTA_INTERVAL` = **10 minutes**. Polling it for a live list spends the budget
         in minutes and then fails silently -- the worst failure shape for a feature whose job is
         explaining things.
      3. `ShouldSkipQuotaLimiting()` returns `user_gesture()`, so a call made because the person ASKED is
         exempt entirely. So: never poll, always answer. The row has a button, not a live count, and
         that is the only shape that keeps working rather than a compromise.
      The badge count is separate and free: `setExtensionActionOptions({displayActionCountAsBadgeText})`
      makes the browser keep the per-tab count with no listener and no quota. Asked for unconditionally,
      so the badge is already right the instant blocking is switched on.
      `getMatchedRules` returns only `{ruleId, rulesetId}` -- no url, no condition. So rule IDS CARRY THE
      CATEGORY by range (1000-1999 trackers, 2000-2999 ads), which is the only way to explain a block
      without keeping a second copy of every rule in memory. An id outside every range reads as
      `unknown` rather than being guessed at.
      Verified by running the module: `1000 -> tracker`, `2000 -> ads`, `9999 -> unknown`, grouping
      collapses 4 matches to `[{tracker,3},{ads,1}]`, and an absent or throwing API returns **null, not
      `[]`** -- "nothing was blocked" and "cannot tell" are different claims and the surface says so.
      OFF BY DEFAULT and shipped that way (`enabled: false` in the manifest, verified in `dist/`). A
      blocker switched on for someone breaks pages they were using and gives them no reason to connect
      the two.
      ONE OWNER (`blocking-owner.js`), in the shape F-3/G-1/G-2 already enforce, because the state lives
      in two places that must agree -- a stored boolean and whether the ruleset is enabled. A switch
      reading "on" over a browser that is not blocking is strictly worse than off. Both start-up paths
      re-apply it: normally a no-op, but the only repair after a crash, an update that reset the ruleset,
      or a profile copied between machines.
- [x] **PA-5** Agent in the address bar (B-2): tab context, file context, visibly not a search.
      CODE WRITTEN, NOT COMPILED. `autoninja` is off for this batch by instruction, so this claims
      exactly as much as the gates prove: `check_repo.py` and `check_design_tokens.py` green, every
      rewrite anchor matched against the real upstream file, patches regenerated. It has never been
      through a compiler and this item should not be read as "working".
      THE FIRST LAYOUT COULD NOT HAVE LINKED, and finding that was the useful part. The provider is
      constructed inside `AutocompleteController`, which lives in `components/omnibox` -- and
      components cannot depend on chrome. So the first version, with the provider and action under
      `sources/chrome/browser/redrob/` holding a `Profile*`, was unbuildable however it was written.
      Upstream already has the seam: `OmniboxAction::Client`, reached as `context.client_`, is the
      interface components declares and chrome implements. The provider and action moved to
      `sources/components/omnibox/`, hold no profile, and one method was added to that Client, which
      `ChromeAutocompleteProviderClient` (which does hold the Profile) implements.
      Two more things measurement corrected on the way. The label string had to move from our own
      `redrob_strings.grd` to `components/omnibox_strings.grdp`, because a components file cannot see
      a chrome-level grit header. And `mojom::PermissionMode::kDefault` / `Effort::kDefault`, which
      the first draft used, DO NOT EXIST -- the enumerators are `kReadOnly`/`kGuard`/`kFullAccess` and
      `kQuick`/`kStandard`/...; read out of the mojom rather than assumed.
      WHAT MAKES THE ROW NOT A SEARCH, which is the item's own wording and otherwise taste: empty
      `destination_url` so nothing can navigate and every path goes through `takeover_action`; no
      `keyword` and no `search_terms_args`, so it is not attributed to a search engine in the UI or in
      metrics; `NAVSUGGEST_PERSONALIZED` rather than a SEARCH_* type, which is what decides the icon
      and the trailing "Search <engine>" text.
      `allowed_to_be_default_match` is false and the relevance sits below the default match. A row
      that outranked the user's own typed URL would make Enter start a task when they meant to
      navigate, which is the one mistake this must never make.
      PERMISSION MODE IS THE SECURITY DECISION: `kReadOnly`. The user typed one sentence in the
      address bar and saw no folder picker and no prompt, so the widest thing it may do is read.
      FIVE upstream places, not four. The Type enum's comment names four; the action also needs an id
      in `omnibox_action_concepts.h`, and that file generates a Java enum, so Android follows for free.
      The metrics proto is THIRD-PARTY and editing it is a real cost, accepted because
      `AsOmniboxEventProviderType` must return something and returning another provider's id would
      attribute our rows to that provider in every omnibox metric. Next free ordinal measured as 36
      by reading that enum's block alone -- a first count across the whole file gave a wrong answer,
      since the file holds several enums numbered independently.
      NO UNIT TEST, and that is a real gap rather than an oversight: `sources/` has no C++ test
      harness at all (0 files matching `*unittest*` or `*_test.cc`), so `WantsAgentRow` is pure and
      testable in principle with nowhere to run it. Whoever next runs a build should add one.
      DESKTOP ONLY, in `DefaultOmniboxProviders`' `!IS_ANDROID && !IS_IOS` arm: the row's value is the
      active tab as context plus a task surface to land in, and the mobile omnibox has neither here.

- [x] **PA-6** Bookmarks inside the tab rail (B-4).
      ALREADY DONE, and this note was wrong. It said "the tab rail is native views work, so there is
      nothing an extension page can contribute and nothing verifiable without a build" -- true about
      extensions, and it concluded the item was unstarted. Measured: the rail HAS a bookmarks section
      and it reads the real model.
      `sources/chrome/browser/ui/views/tabs/vertical/redrob_sidebar_sections.{h,cc}` (940 lines) builds
      a heading plus a list from `BookmarkModelFactory`, observes the model, and gets the favicon case
      right -- `BookmarkNodeFaviconChanged` is overridden EXPLICITLY, with a comment saying why:
      `BaseBookmarkModelObserver` deliberately swallows that callback ("observers typically don't care
      as much about favicons") and routes nothing to `BookmarkModelChanged`, so a row would keep its
      fallback globe forever after the favicon arrived.
      Two caps are deliberate and recorded in the source: the bookmark list is capped and scrolled,
      because the column is 240px and a long bookmark bar would push the tab list off the bottom, and
      the tabs are what the rail is for.
      NOTHING LEFT in this item. A row is `MakeRow`, the one shared row builder, so a bookmark row and
      the foot's Settings row are the same object rather than two constructions kept in step by hand.

- [x] **PA-7** Multiple profiles with a switcher of ours (B-9).
      ALREADY DONE BY REUSE, and the note's own warning turns out not to apply. It said a profile
      switcher "would be the first surface wanting a capability permission that does not exist yet, so
      it needs a twelfth rather than reusing `browser`." That concern was about an EXTENSION-side
      switcher. There is no extension involved: Chromium's own `AvatarToolbarButton` is reparented
      into the head of our sidebar, so no private API is reached and no twelfth capability is needed.
      Reparented rather than reimplemented, which is the right call and is argued in the source: that
      button already carries the sign-in state machine, the sync-error badges and the profile menu, and
      a hand-rolled replacement would be a second, worse account UI that drifts from the first. It is
      wired both ways -- `ToolbarView::SetRedrobAvatarButton` hands the toolbar our instance, so
      upstream code that looks for its avatar finds ours.
      AND THE HARD PART WAS ALREADY FOUND AND FIXED, with measurement: upstream hardcodes the profile
      bubble to TOP_RIGHT, which is correct for a top-right toolbar because the body then extends
      LEFTWARD from the anchor. Our avatar is at the head of a LEFT-hand sidebar at x~17, so leftward
      is off the screen. Measured on a 1560x860 window at 0,0: the body landed at negative x and the
      only thing visible was a ~40px slice of the bubble's right edge, overlapping the sidebar it was
      anchored to -- it read as a rendering fault and the controls inside could not be reached. Fixed
      in `profile_menu_view_base.cc.yaml`.
      RECORDED DEBT, from that rule's own note: the corner-choosing helper is our code sitting in an
      upstream anonymous namespace. It belongs in a file we own, leaving a two-line patch there. That
      is a separate change because it adds a translation unit and GN deps, so it alters the built
      binary, whereas the current rule does not.

- [x] **PA-8** Local model download + run on compatible hardware, with an honest refusal on hardware
      that cannot. Covers P-2 and P-4 under the user's decision.
      DONE, including the surface, which the first pass at this item left open. `redrob models-local`
      prints what this machine is, then per configured local endpoint every installed model with
      either "runs here" or the refusal and its numbers.
      DRIVEN END TO END against a server serving the runtime's real `/api/tags` shape, and THAT RUN
      FOUND A DEFECT NOTHING ELSE WOULD HAVE. A local runtime is configured with its OpenAI base,
      conventionally `/v1`, but `/api/tags` is a SIBLING of `/v1`, not a child. Joining onto the
      configured base produced `/v1/api/tags`, got a 404, and the command printed "answering, with
      nothing installed" against a server serving two models -- a wrong statement that reads as a
      working feature, because a 404 and an empty list are both "no models" to a caller that does not
      separate them. Fixed, regression-tested, reverse-verified.
      Measured output on this host (16 cores, 61.8 GiB): a 2 GiB model "runs here"; a 120 GiB model
      refused with "needs about 144.0 GiB of memory (120.0 GiB of weights plus runtime headroom) and
      38.9 GiB is free of 61.8 GiB total -- short by 105.1 GiB, more than this machine has in total".
      TOP-LEVEL command, not `models local`: `models` takes a positional provider filter, so a
      subcommand there is ambiguous with a provider named `local`.
      MEASURED FIRST, and it shrank the item: the RUN half already existed. A local runtime is already
      an allowed provider (`local-provider.ts`: the one trusted OpenAI-compatible package, local URL
      only) and `local-models.ts` already lists what it serves.
      The probe is NOT native, which the item's original note had wrong. The engine is a process on
      the user's own machine, so memory, cores and arch come straight from the OS; only the GPU needs
      a shell out, and that is per-platform.
      `local-model-fit.ts` rests on three rules. (1) An unseen GPU is reported as NOT MEASURED, never
      as absent: telling a user with a discrete card they have none is a false claim about their own
      computer, and the refusal text is asserted never to mention a GPU it did not look at. (2) It
      never invents a model's size; the figure comes from the runtime. (3) A refusal carries its
      numbers and distinguishes short-but-the-machine-has-it from short-whatever-you-close.
      Memory is checked against AVAILABLE, not total, and `os.freemem()` understates on Linux. That
      direction is chosen: it can refuse a model that would have squeezed in, and it will not promise
      one that gets killed mid-generation, which loses the user's work.
      WE DO NOT FETCH WEIGHTS OURSELVES: no mirror choice, no quantisation choice, no digest we chose
      to trust. The runtime resumes interrupted downloads and shares progress between callers already;
      re-implementing that would mean owning model provenance.
      WHY A SECOND SET OF ROUTES: the OpenAI-compatible `GET /models` the provider listing uses
      reports an id and NOTHING ELSE -- no size -- so it cannot answer the question this item turns
      on. Sizes and the fetch live on the runtime's own API.
      Shapes taken from the runtime's published API reference, and each trap it states explicitly has
      a test: `completed` may be ABSENT while a layer downloads; `total` is per-LAYER, not per-model
      (read as whole-model progress it shows a bar that resets every layer); an in-band `error` frame
      arrives after a 200 and is terminal; and a whole-body `JSON.parse` FAILS on the real stream,
      asserted so nobody simplifies the line reader back into one parse.
      MEASURED: core 1031 tests 0 fail across 123 files; redrob cli 380 tests 0 fail; generated SDK
      clean; `tsc` clean for core and redrob. CORRECTION: an earlier pass of this item reported core
      as 1034 across 124 files. That figure does not reproduce on this branch and the number above is
      the one measured here.
      NO CLOUD FALLBACK exists and none should be added: a user who asked for a local model asked for
      the data to stay on the machine.

- [x] **PA-9** The remaining skills, against K-1's typed globals.
      DONE, and the measurement moved the item. The arming MECHANISM was the work, not the prose:
      K-2 landed `SkillArming.arm` as a pure function and NOTHING CALLED IT -- measured, its only
      caller was its own test. Worse, the skill surface the system prompt actually reads is a second,
      older loader (`packages/redrob/src/skill/index.ts`) whose `Info` dropped `autoInject` entirely,
      so every skill on disk looked like a skill that declared no arming block. Both fixed: the field
      is carried through the loader, and `SystemPrompt.armedSkills` calls the matcher and injects the
      armed bodies as their own labelled block, with the patterns that armed them.
      Shipped one document against the real surface: `page-control`, the six `page` calls, checked
      BOTH ways against the bound tool namespace (names every call that exists, names none that does
      not, and the "Six calls" sentence is asserted against the real count).
      URL arming is wired but not fed: getting the active tab costs a browser round trip per message,
      which with no extension attached spends the request deadline before the model sees anything.
      Keyword arming works today; the URL half needs the session to HOLD its tab URL as state rather
      than ask for it. Recorded in the code at the call site.
      MEASURED: core 998 tests 0 fail; redrob tool+session 854 pass 0 fail; skill loader 19 pass
      (2 new); page-skill 5 pass; reverse-verified both ways -- removing the wiring fails 4 system
      tests, removing the loader field fails the end-to-end arming test.
      STILL OPEN, and bigger than this item: the core `SkillV2` plugin registry (`BuiltinSkills`,
      with `documents` and `skill-writer`) feeds an `EmbeddedSource` list that NOTHING in the engine
      consumes -- grepped, zero consumers. So the builtin skills are registered and unreachable, and
      only disk skills actually load. That is a seam to close, not a document to write.

- [x] **PA-10** Make `page` real. The audited build exposed 13 code-mode globals; K-1 landed 2 and BOTH
      DONE via the extension channel, the route the user chose after the recommendation. The engine
      publishes a pending request on its existing V2 `/api/event` stream and the extension dials that
      stream and answers over HTTP -- NO new listener and NO inbound socket, so nothing new on this
      machine is dialable by another local process. engine PR #64, extension PR #72.
      Three things the build decided rather than the design: the result is a tagged union per action,
      so a client answering `page.query` with a string is a protocol error the engine can name instead
      of an empty node list the model reads as "nothing matched"; there is a 20s deadline, because the
      event stream has no subscriber count and waiting forever would hang a session whose browser is
      absent; and a refusal is its own route, because an unexposed tab is a normal answer and routing
      it through the deadline would spend 20s to say so.
      The investigation below stands as the record of why the loopback RPC was NOT used.
      currently throw (`unavailablePage`, `unavailableChannel`).
      NEEDS A DECISION FROM THE USER -- a security boundary, so not mine to take unilaterally. The
      investigation is finished and the finding is the useful part:
      `unavailablePage`'s own message names the blocker exactly: "the engine process has no browser-page
      control surface; the browser must expose page control to the engine first." The engine and the
      browser are separate processes and every existing channel runs browser -> engine (the sidecar
      client). `page` needs the reverse.
      THERE IS EXACTLY ONE EXISTING REVERSE CHANNEL and it is already well built: the loopback RPC in
      `sources/chrome/browser/redrob/rpc_server.h`. Its own header states the posture -- loopback only, a
      bearer token generated per launch, the token in a profile file with owner-only permissions ("the
      same boundary as reading the cookie database"), off unless the user turns it on. And critically:
      "every tool it exposes goes through the SAME StartTask the surface uses -- an external caller cannot
      reach a capability, or skip a permission gate, that the agent inside the browser does not have."
      So the three ways forward differ in what they cost the user, not in difficulty:
      (a) `page` speaks to that RPC as an MCP client. Cleanest -- reuses an authenticated, gated path that
          already exists. But the RPC is OFF by default for a stated reason, so `page` would work only for
          users who turned it on, and every skill needing `page` would fail for everyone else.
      (b) A dedicated engine-facing channel scoped to page operations only. Better posture than opening
          the general-purpose RPC, more work, and a second socket to defend.
      (c) Route page control through the EXTENSION, which already drives the browser over CDP and the
          accessibility tree. Different topology: the engine asks the browser, the browser asks the
          extension. No new socket, but it makes the extension load-bearing for engine skills.
      Not choosing one by myself: (a) changes what a user must enable for the product to work, and the
      repo's own comment explains why that default is what it is.

---

## Standing rules for the loop

1. ONE item per cycle. Tick its box in the same commit as the work.
2. Measure before you build. Several items above say "measure first" and mean it -- the queue was
   written from a survey, not from the product.
3. If an item turns out to rest on something absent, do NOT fake it. Record what is missing under the
   item, leave the box unchecked, and move to the next one.
4. Report only real signals. A cycle that found the item already done is a successful cycle; say that
   in one line and tick the box.
5. When every box is ticked, stop the loop and say so.
