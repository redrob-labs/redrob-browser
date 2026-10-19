# Capability map: what an agent browser is expected to do, and where we stand

One row per capability, in our own vocabulary. Written after an exhaustive read of a comparable shipped Windows
build — 10 areas, ~7,980 files, binaries and bundles rather than source — checked area by area against a
coverage checklist rather than by browsing.

**How to read the `us` column.** `yes` means the capability exists in our trees and was verified by reading the
code, not by a word match. `partial` means a real piece exists and a named piece does not. `no` means verified
absent across `redrob-browser/sources`, `redrob-code/packages/*/src` and `redrob-extension/src`. A word
appearing in our tree is not the capability: `passkey` and `recovery` both matched, in the importer, and neither
is a feature.

Item ids in the last column refer to `docs/PRODUCT-BACKLOG.md`.

## 1. Browser chrome — the part only a fork can build

| capability | what a person gets | us | item |
|---|---|---|---|
| Vertical tabs in a side rail, switchable | Tabs down the left instead of across the top, as a setting | yes | — |
| Bookmarks section inside the tab rail | Bookmarks live in the same rail as tabs | no | — |
| Tab insertion position | Where a new tab lands in the rail | no | — |
| Horizontal tab shrink | Tabs narrow instead of scrolling | no | — |
| Tab switcher ordered by recent use | Alt-Tab for tabs, most-recent first | no | — |
| Tab search | Find a tab by name | yes | — |
| Tab preview on hover | A live preview, video included | no | — |
| Window background translucency | The window takes the desktop's blur | no | — |
| Automatic picture-in-picture | Leaving a video tab floats the player | no | — |
| Default zoom, languages, spell check, search engines in OUR settings | The handful of browser preferences people look for, in our own page | partial — Chromium owns them; ours are not surfaced | SET-4 |
| A status banner slot | Default-browser, update, engine-missing prompts in one place | no | SET-5 |
| Grouped settings with a route per section | A settings page that can grow | no | SET-1..3 |
| Content blocking | Subscription lists, custom rules, and a way to ask why a request was blocked | no | CAP-7 |
| File associations and an installed-web-app group | Open HTML and PDF with us; web apps grouped in the OS | no | — |
| Local-network discovery opened at install | A firewall rule for mDNS | no | — |
| Forced clean install below a version floor | Refuse to upgrade across a migration boundary | no | — |

## 2. The agent's surface

| capability | what a person gets | us | item |
|---|---|---|---|
| Agent in a side panel | A conversation beside the page | yes — native, and again in our extension | — |
| Agent in the address bar | Type intent where you already type | no | CAP-3 |
| Agent owns its own tabs, and they expire | The agent opens tabs and tidies up after itself | partial — we have agent tabs, no idle policy | — |
| A global quick window | Own shortcut, own size, reachable without the browser focused | no | CAP-5 |
| Selection actions the user defines | Select text or an area, get YOUR actions: prompt templates with the selection substituted, open-URL, copy. Configurable icon, name, colour, hotkey | no | CAP-10 (new) |
| Per-site notification subscriptions the agent consumes | The agent watches a site's notifications and reacts; revocable per site | no | CAP-11 (new) |
| A launch surface listing what it can already act in | Named apps with example prompts, instead of an empty box | no | — |
| Work that survives the window closing | An agent task is not a chat | no | CAP-4 |
| Side-panel session policy on tab change | New session per tab, or keep the session | no | — |
| Task notifications, separable | Needs-attention / task done / routine done, independently | no | — |
| Completion sound | Including a custom file | no | — |

## 3. What the agent can actually do

| capability | what a person gets | us | item |
|---|---|---|---|
| Code as the tool interface | The model writes a script instead of calling one tool at a time | yes — ours reaches MCP servers | — |
| Typed domain objects in that script | First-class handles for the page, the screen, the mail account, the vault — not a tool list | no | CAP-12 (new) |
| A real document toolchain in that script | Read AND write Word, Excel, PowerPoint, PDF with the actual libraries | no | CAP-13 (new) |
| Reusable skills as data | A folder with instructions; the engine already loads exactly this shape | partial — loader exists, we ship none | CAP-1 |
| Skills that arm themselves | Frontmatter naming URL patterns and keywords, so a skill loads when the tab or prompt matches | no | CAP-2 |
| A skill that writes skills | Turn a repeated instruction into a saved one | no | CAP-1 |
| Curated tool-server presets | Named presets for desktop apps, not a blank server form | no | CAP-14 (new) |
| Tool servers over local process and HTTP, with per-server tool inventories | Bring your own tools, and see which of them are live | partial — we support MCP; no inventory or presets | — |
| Solving a human-verification challenge | The agent gets past a checkbox instead of stopping | no | — |
| Coordinate fallback when selectors fail | Click by pixel when the page cannot be addressed any other way | no | — |
| Image generation and editing | Make and change images in the conversation | no | — |
| Reading the screen as text | OCR, locally | no | CAP-6 |
| OS-level control | Drive apps outside the browser, from a separate signed helper | no | CAP-6 |
| On-device model, OCR and image description on the NPU | Cheap, private work with no network and no key | no | CAP-15 (new) |
| Sending messages as the user | Mail and chat apps, with ask-first or automatic, and it waits for the reply | no | CAP-16 (new) |
| Paying with a stored card | Spend caps by day or month, ask-first under a threshold, a note per card saying what it is for | no | CAP-17 (new) |
| Ambient observation with rules | Observe or do-not-observe per site AND per native app, pausable | no | CAP-18 (new) |
| Sub-agents | Delegated work with its own session | yes | — |
| Artifacts | Files the agent produced, kept | yes | — |
| Routines | Saved schedules | yes | — |
| Routines proposed to you | The product notices a repetition and offers to save it | no | — |
| Rich answer rendering | Maths, diagrams, syntax highlighting | no | CAP-8 |

## 4. Memory, models and money

| capability | what a person gets | us | item |
|---|---|---|---|
| Memory the agent carries between sessions | yes | yes | — |
| Episodic memory with offline consolidation | The agent reviews its own history after enough time and enough sessions | no | CAP-19 (new) |
| Consolidation runs are listed, inspectable and revertible, and can be triggered by hand | Memory you can audit and undo | no | CAP-19 |
| Context compaction as a USER setting | Reserve and keep-recent token budgets the user controls | no | — |
| Retry policy as a USER setting | Attempts and backoff the user controls | partial — retry exists in the engine, not exposed | — |
| Connect a subscription you already pay for | Reuse an existing paid plan; your own quota is spent | partial — the engine already has an OAuth path; the browser does not expose it | SUB-1..2 |
| Own API key | Behind the subscriptions, stored by the engine | partial — engine yes, browser no | SUB-3 |
| A separate model for image generation | Not the same model as chat | no | — |
| The user edits the model catalogue | Add and remove models | no | — |
| Model pins that migrate | An old pin is rewritten, not left broken | no | — |
| Plan and usage, with the source stated | What is connected and what was spent | no | SUB-4 |
| Usage statistics | Sessions, last active, weekly average, an activity heatmap | no | CAP-20 (new) |
| Commercial state in the UI | Trial ended, payment failed, billing expired — where a person will see it | no | — |
| Referral | An invite link that credits both sides | no | — |

## 5. Data, identity and platform

| capability | what a person gets | us | item |
|---|---|---|---|
| Import from other browsers | Bookmarks, history, cookies | yes — six Chromium-family browsers | — |
| Import from Firefox and Safari | The two families we cannot read today | no | ONB-5 |
| Import a browser's ENCRYPTED store | Saved passwords and cookies protected by the OS. Needs a privileged service; the platform's app-bound encryption already ships with our fork, we just have nothing that uses it | no | ONB-5 |
| Import progress, cancellable | A long import you can watch and stop | no | ONB-4 |
| A credential vault | Login, passkey, TOTP, identity, card, note, SSH key, API credential; biometric unlock | partial — no second vault by design: the agent signs in with LOGINS from the profile's own password store (`login` tool, fill by the password manager, the model sees a username only), behind a policy (always / while unlocked by OS re-auth, default / never), a per-site list and an AI sign-in history in Settings; codes, passkeys and CAPTCHAs are handed to the user. Passkey, TOTP, card, note, SSH and API-credential types are not built (`docs/CREDENTIALS.md`) | CAP-9 |
| First-class support for OTHER password managers | The product works with the manager you already use | no | — |
| Multiple profiles with a switcher | Separate identities in one install | partial — Chromium profiles exist; no surface of ours | — |
| Sync across devices | partial everywhere: theirs is experimental and OFF; ours is unbuilt | no | — |
| Private capability surface for our own extension | A namespaced permission an extension must request, and only ours may hold, so extension UI can drive native chrome | no | CAP-21 (new) |
| Authenticated channel between extension and engine | The local port is not open to anything on the machine | partial — the browser's own engine port was closed; the extension's is not | — |
| An engine that ships with the browser, or an onboarding step that installs it | The product works the moment it is installed | no | ONB-9 |
| "The local service is not running" as a real UI state | A missing engine is explained, not silent | no | ONB-9 |

## 6. Where we are ahead, and it is not a feature

Two of these came out of measuring a built binary, and neither would appear in a capability table, because both
are about a capability we deliberately do NOT have.

**The inherited AI settings surface is off, unconditionally.** At this Chromium version upstream ships its own
AI features — an AI page, history search, a "Skills in \<brand\>" row, a Drive and Workspace connection — and
brand substitution makes every one of them read as ours. The disqualifying part was not the advertising but the
disclosure above the rows, which said under OUR name that data is sent to Google and may be read by human
reviewers. Both are false here.
`rewrite/chrome/browser/ui/webui/settings/settings_ui.cc.yaml` forces the booleans false after upstream's own
calls, so a boolean added in a later rebase is still overridden. The reference build left that surface in place
with its own name on it.

**The engine's local port is authenticated.** It was open to anything on the machine and is not any more.

**One of our own surfaces is still wrong, and it is the same class.** The first-run terms dialog renders
"This Space Intentionally Blank" under a title asking for agreement, on the official build, and has since
0.1.0 — INS-4. A browser that asks consent to a document it does not show has the same defect it just fixed
elsewhere.

## 7. Method, and what this map cannot tell you

Read per area, every candidate cross-checked against our own trees before being called a gap. What the method
does NOT cover, stated so a reader does not over-trust the table:

- The daemon in the reference build is a single 131 MB self-contained Node binary. Its strings are engine and
  crypto internals, so its tool registry was not readable. Its capabilities were recovered from the UI bundles
  and from its own skill documents instead, which may be incomplete.
- A capability present in a shipped build is not evidence it works well, and absence from our tree is not
  evidence we should build it. This is an inventory, not a plan. The plan is the backlog, and the backlog is
  ordered by what depends on what — the engine reaching the user first, because every agent row above is dead
  without it.
- Nothing here was executed. No installer, no binary, no helper.
