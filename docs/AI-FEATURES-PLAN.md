# AI features — the panel on the right, Privacy Protection, Smart Compare, Teach Mode, Job Apply

Status: **plan, not started.** Nothing in this document is built. Every PR below waits for the
product owner's go-ahead.

Last checked against GitHub on 10 October 2026. What changed since the first draft is in §2.1.

## 1. The brief, as decided

| Question | Decision |
|---|---|
| Which panel moves | The **Ask Redrob** side panel (`agent/apps/app/entrypoints/sidepanel`). It moves to the **right by default**, and Settings → "Side panel position" still lets the user move it back |
| Names | **Privacy Protection** (개인정보 보호), **Smart Compare**, **Teach Mode** (which makes **Playbooks**), **Job Apply** |
| Privacy model | The on-device model ships in v1. Keep as much as possible on the device. Team policy applies to business accounts only |
| Teach Mode | Recording starts only when the user presses **Teach**. Playbooks stay on the device, and can be synced and shared |
| Running a playbook | The agent **re-plans from the playbook's intent** each run. The recorded steps are guidance, not a script |
| Smart Compare source | **Option A**: the agent searches each store in background tabs of the user's own browser |
| Region | Taken from the browser's locale |
| Job Apply | Several automation modes, including fully automatic. Job sites are chosen by locale. LinkedIn's terms-of-service risk is accepted. It is not connected to any Redrob hiring product |
| UI foundation | Re-adopt `@redrob-labs/ui` (1.3.1). The re-adoption is the open stack #41–#54 |
| Model | **Redrob Auto** by default, selectable the way Cowork does it (Auto, then one recommended model per lab, with the full list in Settings) |

## 2. What this builds on

Everything below was read in this tree, in `redrob-cowork` and in `redrob-ui`.

- **The chat is an extension side panel.** Chromium's `SidePanel` hosts it as a contextual
  `kExtension` entry, opened through BrowserOS's `chrome.sidePanel.browserosToggle`
  (`agent/apps/app/lib/browseros/toggleSidePanel.ts`). No Redrob code places it on the left. Chromium
  155 does, through `prefs::kSidePanelAlignmentOverrides`, a dictionary whose defaults come from
  `base::i18n::IsRTL()`
  (`vendor/browseros/chromium_patches/chrome/browser/ui/side_panel/side_panel_prefs.cc`).
- **The agent loop runs in `agent/apps/server`.** `chat-service.ts` sends a turn either to the AI-SDK
  agent or to an ACP agent. The browser tools in `packages/browser-mcp/src/tools/registry.ts` (`tabs`,
  `tab_groups`, `navigate`, `snapshot`, `read`, `grep`, `act`, `upload`, `evaluate`, `run`, `screenshot`
  …) already drive the user's real, logged-in profile. Smart Compare and Job Apply need no new
  browser tools.
- **Nothing filters what reaches the model.** `trust-boundary.ts` only fences prompt injection, and
  `page_tools.cc` refuses to type into password fields. No API exposes saved passwords or autofill
  data; `redrobPrivate` reaches their prefs only.
- **Cowork's privacy feature is the reference.** It lives in `redrob-cowork/apps/server/src/privacy/*`
  and `opencode-plugins/redrob-privacy-gate.ts`:
  - Typed placeholders (`[EMAIL_1]`, `[PERSON_2]`) are swapped in before the cloud call and restored in
    answers and in tool arguments.
  - If the check fails, nothing is sent.
  - Levels are Off, Standard, High and Strict.
  - Detection is patterns with checksums, plus `1T/veil-pii-ko-lite` (int8 ONNX, about 103 MB,
    Apache-2.0) at High and Strict.
  - `labels.ts` has no dependencies and can be ported as is.
  - Cowork does not detect passwords or secrets. The browser can, because it holds them.
- **Recording has prior art.** The unshipped `apps/claw-app` has an rrweb recorder with a durable
  outbox, and `claw-server-rust/src/api/mcp/distill.rs` turns a proven sequence into a helper. Neither
  is in the extension that ships.
- **`@redrob-labs/ui` 1.3.1 already has components for most of these screens:** `PrivacyProtection`,
  `ProtectionStatus`, `PrivateText`, `ComposerStatus`, `ThreadNote`, `Playbook`, `PlaybookRow`,
  `AppAccess`, `ApprovalStep`, `AgentTimeline`, `TaskStatus`, `ScheduleRow`, `Money`,
  `ConvertedAmount`, `SourceSet`, `Confidence`, `Criteria`, `MatchBreakdown`, `Shortlist`, `Stepper`
  and `AppShell`. Building on them means less new UI and less drift from Cowork.
- **The extension has no i18n today.** #50 adds it from `l10n/50-extension.tsv`, so every new string
  in this plan goes there, in English and Korean.

### 2.1 Latest on GitHub, and what it changes here

| PR | State | What it means for this plan |
|---|---|---|
| browser #56, chat elements | open, stack 15 | Messages are `.rr-msg--user` / `.rr-msg--assistant`, written as `.is-user > .ui-msg` in `global.css`. The assistant's bubble is on `--surface-ai`. The composer is `.rr-composer`, and suggestions are `.rr-prompt` pills. Our `PrivateText` sits inside the user bubble, and our result cards inside the assistant bubble. The moment chips are `.rr-prompt` pills, not a new style |
| browser #57, AppShell | open, stack 16, `ui capture` running | The app frame is `.rr-shell`, and every nav row is one `.ui-shell-link` style in `components/sidebar/SidebarNavigation.tsx` (today: Home, Connect apps, Scheduled Tasks, Settings). Playbooks, Jobs and Privacy are added as rows there. `RedrobMark` is the only brand mark. **The tip of the stack is now `feat/app-shell-v2`**, and our extension PRs start from it |
| browser #43–#54 | open, updated | The ui-capture harness is `bun run ui:capture`: 84 captures, light/dark × en/ko, with a ratcheted `baseline.json` (offPalette, focusMissing, contrast, untranslated, fonts). There are also `check:ui-strings` and `check:ui-icons`. Each extension PR here adds its own capture scenes and may not raise any metric |
| browser #55, this plan | open, no review yet | — |
| redrob-ui #60, privacy defaults | open, parity red, unreleased | `PrivacyProtection`'s defaults stop saying where the check runs ("Running", "Privacy protection is off"). We **pass our own `running`, `offTitle`, `offText` and `lede`** ("Running on this computer"), so our copy is the same on 1.3.1 and on whatever release follows. The same PR gives `ScheduleRow` a layout below 480 px, which the side panel needs: take it when it ships |
| redrob-ui #59, ModelGuide 1.4.0 | open | Cowork's "Recommended best models" link opens the Model Guide. 0.3 links to the console's guide for now; it can embed `ModelGuide` once we are on 1.4 |
| redrob-ui #61, stable ids | open | No effect: the extension does not render on a server |
| Cowork #180, route-labeller packaging | open | The packaged Cowork server failed to resolve an on-device ML package, because packaging only ships dependencies the desktop app declares. Our compiled server has the same kind of trap. PR 1.2 must prove the model loads **from the packaged artefact**, not from `bun run` |
| Cowork #181, #185, #186, voice | open | Not in scope; noted for later |

**The redesign has phases still to land, and they overlap with ours** (from `docs/UI-REDESIGN.md` on
#41). Each overlap is assigned to one owner so nothing is built twice:

| Redesign phase | Overlap | Who builds it |
|---|---|---|
| 4.2 `feat/sidepanel-chat` | `ComposerStatus`, `ComposerMode`, `ApprovalStep`, `PromptSuggestions` in the panel | **Redesign** builds the slots. Our 1.4 adds the privacy item, 2.1 the chips, 3.3 the approvals. If 4.2 has not started by the time 1.4 is ready, 1.4 adds `ComposerStatus` and 4.2 reuses it |
| 4.4 `feat/settings-shell` | The Privacy page and the Smart Compare region setting | Built in 4.4's row pattern (title, sub, exactly one control). Until 4.4 lands, the pages follow that pattern by hand |
| 4.5 `feat/tasks-and-connectors` | `PlaybookRow` and `ScheduleRow` | **Redesign** brings both into the app. Our 3.4 uses them and does not restyle them |
| 4.7 `feat/agent-glow` | The Teach Mode recording frame on `glow.content` | **Redesign** owns the overlay. Our 3.1 adds a `recording` state to it |

## 3. The experience

### 3.1 Principles

1. **One place for AI, on the right.** The left side is the user's own things: tabs and chats. The
   right side is the assistant. The panel opens beside what it is talking about, and the reading
   order goes from content to help.
2. **Bring the feature to the moment.** Nobody opens a "Price comparison" menu. A product page
   offers **Compare prices**, a job posting offers **Apply with Redrob**, and a site with a saved
   playbook offers **Run "Weekly groceries"**. These show up as one row of chips above the composer
   and as the toolbar action's badge. No feature gets a permanent tab.
3. **Say what will happen before it happens, and what happened after.**
   - Before Send: `ComposerStatus` shows privacy, model and memory.
   - In the message: `PrivateText` shows the user their own words, with what the AI saw instead.
   - Before anything consequential: `ApprovalStep`.
   - After a run: a receipt.
4. **Long work never holds the panel hostage.**
   - Compare, playbook runs and job applications run in a **named, collapsed tab group** ("Smart
     Compare", "Applying · 12"). The work stays visible and can be stopped, and it stays out of the
     way.
   - A one-line **run strip** at the top of the panel shows each run's `TaskStatus`.
   - Anything that needs the user raises an approval in the panel, and a system notification if
     the panel is closed.
5. **Nothing irreversible without a stop.**
   - Payment, placing an order and submitting an application are stops by default.
   - Fully automatic Job Apply is the one place a stop can be waived. It is waived per playbook or
     per mode, never as a side effect of saying yes once (`ApprovalStep.onAlways`).
6. **Plain words.** Cowork's copy rules carry over: no "AI Firewall", "LLM", "provider", "model
   router" or "API key" in user-facing copy. Users are not technical.

### 3.2 The window

```
┌──────────────┬────────────────────────────────────────┬──────────────────────┐
│ ▢ Tabs       │                                        │ Ask Redrob     ⟲ ● ⋯ │
│ ▢ Chats      │              the page                  │ ▸ Applying · 3 of 12 │ run strip
│ ▢ Bookmarks  │                                        │                      │
│              │                                        │   conversation       │
│ (vertical,   │                                        │                      │
│  native)     │                                        │ [Compare prices] […] │ moment chips
│              │                                        │ 🛡 Private · High  Auto│ ComposerStatus
│              │                                        │ ┌──────────────────┐ │
│              │                                        │ │ Ask about this…  │ │ Composer
└──────────────┴────────────────────────────────────────┴─┴──────────────────┴─┘
```

- **Panel header:** the title, then History (⟲), **Teach** (●) and an overflow menu (⋯). The menu
  holds Playbooks, Jobs, Privacy and Settings, which open full pages in the app.
- **Width:** the panel is designed and captured at 360 and 480 px.
- **Full pages** live in the app (`entrypoints/app`, inside the `.rr-shell` frame from #57). The
  sidebar gains **Playbooks**, **Jobs** and **Privacy** as `.ui-shell-link` rows beside Home,
  Connect apps, Scheduled Tasks and Settings. A full page is for managing things; the panel is for
  doing them.
- **What our UI sits inside** (from #56):
  - Moment chips are `.rr-prompt` pills in one row above the `.rr-composer`.
  - Result cards (Smart Compare, a draft playbook, an application receipt) render inside the
    assistant's `--surface-ai` bubble, so they read as the AI's work.
  - `PrivateText` renders inside the user's bubble.
- **Optional follow-up** (native, not in this plan's PRs): a chat picked from the left column's
  "Chats" list opens in the right panel instead of the new-tab page.

### 3.3 Privacy Protection

**Panel, before Send.** The first `ComposerStatus` item is `🛡 Private · High`. Opening it shows
`PrivacyProtection`: on or off, the level, "Running on this computer", and the count kept from the
AI this week. If the on-device check cannot run (still downloading, failed, or Off), the item says so
in words rather than showing a grey shield.

We pass `running`, `offTitle`, `offText` and `lede` ourselves, from `l10n/`, and never rely on the
component's defaults: redrob-ui #60 makes those defaults neutral, and "on this computer" is the
browser's claim to make.

**In the user's message.** Each value that was swapped renders as `PrivateText`, a dotted underline.
Focusing it reads "The AI saw [EMAIL_1]". The user always reads their own words.

**Between turns.** A `ThreadNote` appears when the browser itself withheld something:

```
  🛡 Your saved password for amazon.com stayed on this computer.
  🛡 2 fields on this page were left out: card number, security code.
```

**At Strict.** A confirm dialog before Send lists what will be hidden, with Edit and Send as equal
buttons. This is Cowork's dialog.

**Settings → Privacy** (a full page):

```
┌ ProtectionStatus ─────────────────────────────────────────────┐
│ 🛡 Privacy Protection is on · High                             │
│ ● Running on this computer   ·  41 details kept from AI this week │
└───────────────────────────────────────────────────────────────┘
What happens when you press Send        (3 rows, Cowork's copy)
Never sent to AI, at any level          saved passwords · card numbers and
                                        addresses you saved for autofill ·
                                        anything typed into a password field
Protection level                        Off · Standard · High (Your level) · Strict
Sites AI never reads                    + Add site     (e.g. mybank.com — the agent
                                        can't read or act on these pages)
Names to keep private                   [textarea]  Save names
🔒 Set by Acme Corp's policy            (business accounts only; hidden otherwise)
Where it works, and what it can miss
```

"Never sent" is the browser-only promise. It holds at every level, including Off, because these
values are the user's credentials, and a credential is never what a user means to send.

### 3.4 Smart Compare

**Noticing.** On a product page the toolbar action gets a small badge, and the panel's chip row
offers **Compare prices**. The comparison runs on click, because it opens background tabs and costs
credits. Settings has "Compare automatically on product pages", off by default.

**Running.** A collapsed tab group, "Smart Compare", appears and disappears. The panel shows a
three-line `AgentTimeline` ("Searching Coupang… Naver Shopping… Matching 9 listings").

**Result card in the panel** (Korea shown):

```
┌ Smart Compare · Korea ─────────────────────────────── ⟳ ┐
│ Sony WH-1000XM6, black                                   │
│ Lowest  ₩389,000  at Coupang   ₩40,000 less than here     │
│ ──────────────────────────────────────────────────────── │
│ Coupang         ₩389,000   Free delivery · Tomorrow  Open │
│ Naver Shopping  ₩395,500   +₩3,000 delivery · 11st   Open │
│ This page       ₩429,000                                 │
│ Same product  ▮▮▮ Sure — model number matches           │
│ Checked 2 of 3 stores · Naver: 1 listing out of stock     │
│ Checked 2 min ago                                         │
└──────────────────────────────────────────────────────────┘
```

- Prices use `Money`.
- A cross-currency row uses `ConvertedAmount`, which shows the rate and its date.
- The match uses `Confidence`. Variants ("Same model, different colour") are labelled and never
  ranked as the lowest.
- `SourceSet` says which stores were not read, so a missing store is never mistaken for "no
  cheaper price".
- "Open" opens the listing in a new foreground tab.
- **Stores by locale:**

  | Locale | Region | Stores |
  |---|---|---|
  | `ko*` | Korea | Coupang, Naver Shopping |
  | `en-IN`, `hi*`, other `*-IN` | India | Flipkart |
  | everything else | US | Amazon.com |

  The card names the region. Settings can override it if the locale guesses wrong.

### 3.5 Teach Mode and Playbooks

**Teaching.** The user presses **● Teach** in the panel header.

```
┌ Teaching Redrob ───────────────────────────── ■ Stop ┐
│ Do the task once, the way you normally would.        │
│ Passwords and card numbers are never recorded.       │
│  1 Opened amazon.com/fresh                           │
│  2 Searched "oat milk"                               │
│  3 Added "Oatly Barista 1L" ×2 to cart               │
│  4 …                                                  │
│                     [ Pause ]  [ Discard ]  [ Done ]  │
└──────────────────────────────────────────────────────┘
```

While recording, the page gets a thin recording frame, and the toolbar action shows a dot. The
frame is a `recording` state added to the `glow.content` overlay that redesign 4.7 reworks. Recording covers only the tab where Teach was
pressed and the tabs it opens.

**Draft.** **Done** turns the recording into a draft `Playbook`:

```
┌ Weekly groceries ──────────────────────────── Draft ┐
│ Reorder my usual groceries on Amazon Fresh            │
│ Asks you for:  grocery list · delivery slot           │
│ 1 Open Amazon Fresh                                   │
│ 2 For each item on the grocery list, find it and add it │
│ 3 Pick the delivery slot                              │
│ 4 ✋ Place the order — stops and asks                  │
│ Uses: amazon.com (can act)                 AppAccess  │
│ Stops once before anything is final                    │
│                      [ Try it now ]  [ Save ]         │
└──────────────────────────────────────────────────────┘
```

- Typed literals become **inputs** ("grocery list") when they look like data, rather than being
  baked into the playbook.
- Steps describe intent ("find it and add it"), not selectors, which is what lets a run re-plan.
- Anything that pays, orders, submits or sends is marked ✋ automatically. The user can edit it but
  cannot hide it.

**Running.** A playbook can run from four places:
- The chip "Run Weekly groceries" when the user is on a site the playbook uses.
- The Playbooks page.
- The composer (type `/` to pick a playbook).
- A schedule (`ScheduleRow`, reusing scheduled tasks).

A run shows `AgentTimeline`, with `ApprovalStep` at each ✋.

**Playbooks page.**
- A list of `PlaybookRow`s (name, summary, step count, number of stops), using the row as
  redesign 4.5 brings it in for scheduled tasks.
- Actions: Run, Edit, Schedule, Share, Delete. Plus Import.
- A shared or imported playbook opens in a review screen showing its sites and its stops before it
  can be saved.

### 3.6 Job Apply

This is a full page, **Jobs**, with three tabs. When the user is on a job posting, the panel offers
the chip **Apply with Redrob**.

**Profile** (filled once):
- The résumé, stored on this computer.
- An **answer bank**: work authorisation, notice period, salary expectation, links, and diversity
  questions, which default to "Prefer not to say".
- What the user is looking for, as `Criteria`, with inferred conditions marked "My assumption".

**Search.**
- Results from the locale's job sites:

  | Region | Sites |
  |---|---|
  | US | LinkedIn, Indeed, plus Greenhouse, Lever, Workday and Ashby career pages |
  | India | Naukri, LinkedIn, Indeed India, foundit |
  | Korea | Wanted, Saramin, JobKorea, LinkedIn |

- Each result shows `MatchBreakdown` ("Meets 4 of 5"). A condition with no evidence is never
  counted against the user.
- The user adds jobs to a `Shortlist` and chooses how much happens without them:

```
How should Redrob apply?
 ○ Review each     I check every form before it is sent
 ○ Approve a batch I approve the list once; it stops only for questions it can't answer
 ○ Fully automatic It finds and applies to matching jobs on its own, up to [10] a day
```

- **Fully automatic still has a floor.** It never invents an answer that is not in the answer bank;
  it parks that job as "Needs you". It never pays a fee. It never applies twice to the same company
  and role. It stops when a site asks the user to sign in.

**Applications.**
- A tracker: job, company, site, `TaskStatus` (Queued, Filling, Needs you, Sent, Failed) and when
  it was sent.
- Each sent application keeps a **receipt**: a screenshot of the final form and every answer given.
  That is what the user needs when a recruiter calls.

Privacy Protection matters here. The AI sees `[PHONE_1]`, and the real number goes straight into the
form, because placeholders are restored in tool arguments. A job application is the clearest case of
"the AI did the work without seeing my details".

## 4. Architecture

### 4.1 Panel on the right

- First, in a 155 checkout, confirm which key in `kSidePanelAlignmentOverrides` governs extension
  and contextual entries.
- Then change its default from Redrob's own pref code (`sources/chrome/browser/redrob/redrob_prefs.cc`,
  `SetDefaultPrefValue` after `side_panel_prefs` registers). That is level 1 in
  `docs/CUSTOMISATION.md`, with no patch.
- Keep RTL mirrored: the panel sits on the right exactly when `!IsRTL()`.
- A user-set value wins, so anyone who already chose a side keeps it. Upstream's Settings dropdown
  keeps working, and it needs no new strings.
- Fallback, only if a registry default cannot be changed from outside: a `rewrite/` rule on
  `side_panel_prefs.cc`. That file already carries a BrowserOS patch, so check how plaster stacks a
  rule on it first.

### 4.2 Privacy Protection

| Piece | Where |
|---|---|
| `packages/privacy` | A port of Cowork's `labels.ts`, `wordpiece.ts` and the detector core (decode and refine). Runtime-neutral, with the tests ported too |
| On-device runtime | **Decided by a measured spike** (PR 1.2). Two candidates: (a) `onnxruntime-node` shipped next to the compiled server and allowed through `native-addon-guard.ts`, which today blocks hidden native addons; (b) `onnxruntime-web` on WebGPU in an extension offscreen document. Cowork measured WASM at 1–2.5 s per 1,000 characters, so the bar is ≤ 300 ms per 1,000 characters at p50 on the reference laptops. The measurement is taken **from the packaged server binary**: Cowork #180 is a packaged build that could not resolve its on-device ML package even though `bun run` worked |
| Model delivery | Downloaded on first use from `cdn.redrob.ai`, pinned by SHA-256 the way `detector-source.ts` does it, with a "Getting ready" state in `PrivacyProtection`. Downloading avoids adding about 103 MB to every installer |
| The gate | `apps/server/src/api/services/privacy/`. It runs on every path to a model: (1) user text, system text and memory before the provider call, in both `processBrowserOsMessage` and `processAcpMessage`; (2) **tool outputs** (`snapshot`, `read`, `grep`, `evaluate`, `run`, `screenshot` alt text) in `browser-tool-dispatch.ts`, since a page is the browser's biggest leak; (3) restore in tool arguments (`act` fill and type); (4) restore in the streamed answer, with a small buffer so a placeholder split across chunks is never shown half-restored. If the check fails, nothing is sent. Labels are kept per conversation, in memory |
| Saved secrets | Native `RedrobSecretMatcher` in `sources/chrome/browser/redrob/`. It keeps salted hashes of normalised saved-password values and autofill values (from `PasswordStore` and `PersonalDataManager`), and scans text, returning spans and kinds but **never values**. The server reaches it through the existing native `rpc_server`; the panel reaches it through a new `redrobPrivate.scanForSavedSecrets` |
| Page rules | Password fields are always left out of snapshots. Sites in "Sites AI never reads" are refused by a new guard beside `guards/read-only.ts` |
| Team policy | Cowork's signed JWS policy format and verifier. It applies only when the signed-in account is a business workspace. Until the browser has an account client (`docs/ACCOUNT-SYNC-DESIGN.md`), it can also come in as a Chromium managed policy key. Non-business users never see a lock |
| Settings | Stored in the server's SQLite (drizzle migration). The weekly count stores counts, never values |

### 4.3 Smart Compare

- **Detection** (content script in `apps/app`): read schema.org `Product` and `Offer` (JSON-LD,
  microdata) and Open Graph product tags, with small adapters for Amazon, Flipkart, Coupang and
  Naver. The result is an identity: brand, model, GTIN/EAN/UPC or ASIN, title, price and currency.
  The badge is set with `chrome.action.setBadgeText`, so no native work is needed.
- **The service** is `POST /compare` on the server, which runs a constrained sub-agent:
  - It opens each store's search URL in a collapsed tab group (`tab_groups`).
  - It extracts listings with a deterministic extractor per store, falling back to the model.
  - The model judges each listing as same product, variant or different.
  - It returns a structured result.
  - Results are cached for 30 minutes per product identity. Each store has a time budget, and a store
    that times out shows up in `SourceSet` as not checked.
- Region comes from `chrome.i18n.getUILanguage()`, with the override in Settings.

### 4.4 Teach Mode and Playbooks

- **The recorder** is a new, lighter content script in `apps/app` that records **meaning, not DOM**:
  - It records navigations, clicks (role, accessible name, nearby label), inputs (field label plus a
    value class: literal, likely input, or secret) and submits.
  - A secret-class value is never stored.
  - The buffer and durable outbox follow `claw-app/modules/recorder`; rrweb is not brought in.
- **Drafting** is `POST /playbooks/draft`. The model turns the event list into the playbook schema:

  ```
  name, purpose, inputs[], sites[], steps[{ intent, hint{ url, target }, stop, reason }]
  ```

  A deterministic pass marks pay, order, submit and send steps as stops, whatever the model said.
- **Storage** is new drizzle tables `playbooks` and `playbook_runs` in the server's SQLite, on this
  device only.
- **A run** is a normal agent turn with a system prompt built from the playbook's intent, steps,
  inputs and stops. `ApprovalStep` gates each stop, and so does a guard on `act` that recognises
  checkout and payment pages even when the playbook did not mark them.
- **Share** is an export to a `.redrob-playbook.json` file and an import that goes through the
  review screen.
- **Sync** joins Layer 1 of `docs/ACCOUNT-SYNC-DESIGN.md` (tasks, routines, memory) once the account
  client exists. The playbook schema is versioned from day one so it can sync later.

### 4.5 Job Apply

- **The profile** is on this device: the résumé file in the profile directory, and the answer bank
  and criteria in SQLite. The résumé is parsed by the model behind the privacy gate.
- **Search** uses a sub-agent over the locale's job sites in a tab group. It extracts postings from
  schema.org `JobPosting` (common across ATS pages) and falls back to the model.
- **The apply engine** has an adapter per form family: LinkedIn Easy Apply, Indeed, Greenhouse,
  Lever, Workday, Ashby, Naukri, Wanted, Saramin and JobKorea. Each adapter is a built-in playbook
  plus field-mapping hints. Anything else falls back to a generic agent.
  - Answers come only from the answer bank. A question it cannot answer parks the application as
    "Needs you".
  - The résumé is attached with `upload`.
  - Before submitting it takes a screenshot (the receipt), then submits, or waits for approval,
    depending on the mode.
  - Safeguards: a daily cap, de-duplication by company and normalised title, and a pause when the
    user is signed out.
- A queue in the server runs one application at a time per site, so as not to trip rate limits.

### 4.6 Model choice

`redrob-console` with `defaultModelId: 'auto'` already exists in `providerTemplates.ts`. Mirror
Cowork's #128:
- The composer's menu shows Redrob Auto, then one recommended model per lab, taken from the
  console's `featured` list (with a local copy as a fallback).
- Settings → AI holds the full, searchable list.
- Smart Compare's matching and Teach Mode's drafting go through the same choice. They do not
  hard-code a model.

## 5. Delivery

GitFlow as `AGENTS.md` states it:
- Every branch is `<type>/<slug>`, cut from `develop`, with one PR per row below into `develop`.
- PRs are ready for review, and no reviewers are requested automatically.
- **Extension PRs** run:
  - `bun run check`, `bun run test` and `bun run build:agent`
  - `bun run check:ui-strings` and `bun run check:ui-icons`
  - `bun run ui:capture`, with new scenes for the PR's surfaces and an updated `baseline.json`, and
    no metric allowed to rise

  They attach the captures (360 and 480 px, light and dark, English and Korean) and bump the
  extension version so `agent-extension.yml` can publish.
- **Native PRs** run `check_repo.py`, then a build-host build, then the relevant part of
  `docs/TESTING.md`. They are batched to save build hours.

**Dependency on the redesign stack.** #41–#57 bring `@redrob-labs/ui` 1.3.1, i18n, the capture
harness, the chat elements and the AppShell frame. The extension PRs here need them. "stack" in the
table below means: branch from the stack's tip, which today is `feat/app-shell-v2` (#57), and
retarget to `develop` as it merges. The native PRs (0.2, 1.5) and the server-only PRs (1.1–1.3) do
not depend on it and can go first. Where a row also needs a redesign phase that is not open yet
(4.2, 4.4, 4.5, 4.7), that is named, and §2.1 says what happens if that phase is late.

| # | Branch | What | Depends on |
|---|---|---|---|
| 0.1 | `docs/ai-features-plan` | This document | — |
| 0.2 | `feat/side-panel-right-default` | §4.1 (native) | — |
| 0.3 | `feat/model-picker-auto` | §4.6 | stack |
| 1.1 | `feat/privacy-core` | `packages/privacy`, ported with its tests | — |
| 1.2 | `chore/privacy-runtime-spike` | Measure (a) against (b); record the numbers and pick one | 1.1 |
| 1.3 | `feat/privacy-gate` | The server gate, tool-output labelling, streaming restore, fail-closed | 1.2 |
| 1.4 | `feat/privacy-ui` | The `ComposerStatus` chip, `PrivateText`, `ThreadNote`, the Strict confirm, the Privacy page, model download | 1.3, stack; redesign 4.2 and 4.4 if they are open |
| 1.5 | `feat/privacy-saved-secrets` | Native `RedrobSecretMatcher`, `redrobPrivate` and rpc, password fields always left out (native) | 1.3 |
| 1.6 | `feat/privacy-team-policy` | Business-only signed policy and the lock UI | 1.4 |
| 2.1 | `feat/smart-compare-detect` | Product detection, badge, chip | stack, redesign 4.2 |
| 2.2 | `feat/smart-compare-service` | `/compare`, store extractors, matching, cache | 2.1 |
| 2.3 | `feat/smart-compare-card` | The result card, region override, auto setting | 2.2 |
| 3.1 | `feat/teach-mode-recorder` | Recorder, Teach header button, recording frame | stack, redesign 4.7 |
| 3.2 | `feat/playbooks-draft` | Drafting, schema, storage, the draft editor | 3.1 |
| 3.3 | `feat/playbooks-run` | Re-planning runner, stops and the `act` guard, chips, `/` in the composer, schedule | 3.2 |
| 3.4 | `feat/playbooks-library` | Playbooks page, export, import and review | 3.3, redesign 4.5 |
| 4.1 | `feat/job-apply-profile` | Jobs page shell, profile, answer bank, criteria | 1.3, stack |
| 4.2 | `feat/job-apply-search` | Locale sites, `JobPosting` extraction, `MatchBreakdown`, shortlist | 4.1 |
| 4.3 | `feat/job-apply-engine` | Adapters, the three modes, queue, caps, receipts | 4.2, 3.3 |
| 4.4 | `feat/job-apply-tracker` | Applications tracker, "Needs you" notifications, chip on postings | 4.3 |

Order: 0.x → 1.1–1.4 → 2.x → 3.x → 4.x, with 1.5 and 1.6 running alongside 2.x. Privacy goes first
because Job Apply's promise ("the AI never saw your phone number") rests on it, and because it is the
trust that makes users accept Teach Mode's recording.

## 6. Risks

- **The redesign stack** (#41–#57, 16 PRs, none reviewed yet) is unmerged. If it changes or stalls,
  every extension PR here moves with it. Its later phases (4.2, 4.4, 4.5, 4.7) overlap ours; §2.1
  says who builds each overlap, so neither side builds it twice.
- **The runtime inside the compiled server.** Bun's `--compile` and `native-addon-guard.ts` may
  refuse onnxruntime-node, and a packaged build can miss a dependency that `bun run` finds
  (Cowork #180). That is what 1.2 decides, measured on the packaged binary, before any UI promises
  "Running on this computer".
- **redrob-ui defaults moving under us.** #60 changes `PrivacyProtection`'s default copy. We pass
  every string explicitly, so a design-system bump does not change what the browser claims.
- **Restoring placeholders in a stream** is the subtlest code in the gate, and a half-restored label
  is visible to users. It gets its own tests.
- **Bot defences** on Coupang and LinkedIn. Running in the user's real browser helps, but per-store
  time budgets and a "not checked" state are the honest answer when it fails.
- **Fully automatic Job Apply can misfire at scale.** The daily cap, answer-bank-only answers,
  de-duplication and receipts are the safeguards. LinkedIn's terms-of-service risk is accepted by the
  product owner.
- **Prompt injection** from product and job pages. `trust-boundary.ts` plus stops on every
  consequential action. An instruction on a page never removes a stop.
- **Sync** waits on the browser's account client, which does not exist yet.

## 7. Still open, with the default this plan assumes

| Question | Default here |
|---|---|
| Stack on #41–#57, or wait for them to merge | Stack on `feat/app-shell-v2`, retarget as they merge |
| Who builds the composer status line and approvals if redesign 4.2 is late | We do, in 1.4, and 4.2 reuses it |
| Move to redrob-ui 1.4 (ModelGuide glance, `ScheduleRow` narrow layout) | When it is released and the stack moves its pin; not in our PRs |
| Download the on-device model or bundle it in the installer | Download on first use, hash-pinned |
| How a playbook is shared | A file in v1; a link once sync exists |
| Hindi strings for India | English only in v1; the l10n pipeline can add a column later |
| Override the region in Settings | Yes, small, under Smart Compare |
