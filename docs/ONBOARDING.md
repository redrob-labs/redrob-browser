# Onboarding and the agent's tool surface

This file records what our first run and our agent tool surface have to do, and the exact Chromium 153
seams each piece hangs off, so the work does not need re-investigating.

Where a competing product was looked at during research, it is described here only as what a first run
of that CLASS of product does -- never named, never cited, never quoted. Our surfaces are specified
from our own engine's behaviour and from the design system; the UX reference frames that informed the
visual programme live outside this repository and are catalogued in `UX-PROGRAMME.md`.

## Where we are

Built and verified: the shell (no toolbar, vertical sidebar, account + Settings at its foot), the new
tab as the task composer, a task opening as a tab with its trace, the engine's streaming transport,
the tool loop, agent tabs as real grouped tabs, captured-frame previews, workspaces on saved tab
groups, and the branding.

Then, in order, everything §5 used to list as not built:

* **Chats** in the sidebar, listing the profile's real tasks.
* **Suggested tasks** on the new tab, filling the composer rather than launching.
* **Steer and Queue.** One call with a mode, because the timing question is the feature: Enter queues,
  interrupting is a button you have to mean. Queued messages land at a boundary where the engine has
  been answered for everything it proposed; interrupting commits the partial answer WITHOUT the tool
  calls that were still arriving, since recording those leaves the engine holding calls that will never
  be answered.
* **Routines**, cron and heartbeat, on a wall-clock timer so a suspended machine still fires. Skipped
  rather than queued when four tasks are already running; a routine overdue because the browser was
  closed runs once, not once per interval missed.
* **Memory**, prefs-backed and capped at 200 entries so it stays reviewable in one screen, with each
  entry carrying the task that produced it. Searched at the start of every task, and what it found
  becomes a step in the trace.
* **Ultrabrowse**, which is a real tool budget (3 / 8 / 32 rounds), the `reasoning_effort` the engine is
  told, and `plan_research` -- somewhere to write a plan into the trace before the tabs start opening.
* **CLI, MCP and REPL.** `--redrob-task="..."` works with no setup through the process singleton;
  everything that needs an answer back goes through a loopback endpoint that also serves MCP at
  `POST /mcp`, which is how Redrob Code drives this browser. See docs/AUTOMATION.md.
* **Password manager**: the three-way choice, told truthfully -- "another manager" stops save prompts
  and does not stop filling, and nothing is migrated.
* **Model providers**: an API key per provider, encrypted through the platform keystore, never readable
  back by any page, with turns routed to that provider through a second entry point rather than a flag.
* **The Chromium-family importer**, because 153 has none at all.

Not built, and named rather than implied:

* **OAuth model providers.** API keys work; connecting a ChatGPT or Claude *subscription* needs a
  loopback PKCE flow, and there is no reusable PKCE client in the tree (`OAuth2AccessTokenFetcherImpl`
  has no `redirect_uri` or `code_verifier` and parses a Google-shaped response). The pieces are now all
  here -- `net::HttpServer` for the loopback listener, ModelStore for the encrypted token -- but the flow
  itself is unwritten.
* **The `@` context picker.** `StartTask` accepts `context_refs` and nothing produces them yet.
* **A packaged `redrob` binary on PATH.** Deliberately not built, and the reasoning is in
  docs/AUTOMATION.md: Redrob Code's binary is already `redrob`, and it speaks MCP as a client, so the way
  to drive this browser from a terminal is to point the agent you already have at `POST /mcp` rather than
  to ship a second command with the same name doing a worse version of the same job. A wrapper existed
  briefly and was deleted. Verified end to end -- `redrob mcp list` reports connected and an agent turn
  calls `browse` and reads the answer back.
* **macOS `Assets.car` / `AppIcon.icon`**, which need `actool` and therefore a mac host.
* **A cold-cache full build**, never validated: every build since the first has been incremental.


## 1. First run

An agentic browser's first launch runs six steps before the browser itself: welcome, account, an
explanation of what the agent does, a password-manager choice, connecting a model or subscription, and
importing from another browser. We declare all six in `redrob_onboarding` and only `import` is built
out -- our first launch otherwise goes straight to a new tab. `UX-PROGRAMME.md` slices the remaining
five.

Chromium 153 already has the surface this needs, and it is NOT a tab. `FirstRunService` decides
whether to run it:

    ShouldOpenFirstRun = IsFirstRunEligibleProcess() && IsFirstRunEligibleProfile() &&
                         !IsFirstRunMarkedFinishedInPrefs()
    chrome/browser/ui/startup/first_run_service.cc:317

and `ProfilePickerView` hosts it in its own top-level Views widget created before any browser window
exists. Off-the-record and guest profiles are excluded by the service, which is the behaviour we
want anyway.

The substitution point is one function:

    ProfilePickerView::CreateFlowController
    chrome/browser/ui/views/profiles/profile_picker_view.cc:705

For `EntryPoint::kFirstRun` it builds `FirstRunFlowController`. A fork controller subclasses that and
overrides `Init()` only, so the whole completion chain -- `PreFinishWithBrowser()` running
`first_run_exited_callback_` with `kCompleted`, the pref write, the picker teardown, the browser
opening -- is inherited rather than reimplemented.

A step that simply shows one of our WebUI pages already exists:

    ProfileManagementStepController::CreateForProfilePickerApp(host, initial_url)
    chrome/browser/ui/views/profiles/profile_management_step_controller.h:35

Completion must go through the native closure, NOT by having JavaScript write the pref. The pref is
local state, not profile state:

    prefs::kFirstRunFinished == "browser.first_run_finished"
    registered in chrome/browser/prefs/browser_prefs.cc

`chrome://intro` (`IntroUI`) is the closest in-tree model for the page itself; copy its `WebUIConfig`
registration and its two BUILD.gn targets rather than inventing a shape.

## 2. Importing from another browser

This is the one place where the reference promises something this fork cannot promise everywhere, so
the finding is recorded in full rather than as a task.

**Chromium 153 has no Chrome importer at all.** Not "no cookie support" -- no Chrome. The importer
type enum is only:

    TYPE_IE = 0, TYPE_FIREFOX = 2, TYPE_SAFARI = 3, TYPE_BOOKMARKS_FILE = 5, TYPE_EDGE = 6
    components/user_data_importer/common/importer_type.h:16

There is no `TYPE_CHROME`, no Chrome detector in `ImporterList`, and no Chrome importer to inspect. So
importing a Chrome profile's bookmarks, history, passwords or search engines is not "call the existing
importer from a new surface" -- it means writing a new Chromium-family importer. That is ordinary work
and worth doing.

Cookies are not importable through that machinery either, by upstream's own admission:

    COOKIES = 1 << 2,  // Not supported yet.
    components/user_data_importer/common/importer_data_types.h:27

and the importer bridge carries bookmarks, home page, favicons, history, search keywords, passwords
and autofill -- nothing for cookies or sessions. `ALL` includes the COOKIES bit anyway, so `ALL` must
never be read as "everything has an implementation".

That leaves reading Chrome's cookie database directly, and the answer differs by platform in a way
that decides the product rather than the implementation:

* **Windows: do not build it.** Modern Chrome cookies are App-Bound Encrypted (`v20`) and decryption
  validates the calling application's path, so a different executable cannot decrypt them through
  ordinary OSCrypt. That check exists specifically to stop other programs stealing session cookies.
  Working around it would mean defeating an anti-credential-theft protection, which is not a feature
  regardless of how convenient it would be.
* **macOS and Linux: technically feasible, deliberately scoped.** The key is per OS user and per
  product branding, so a source-aware provider could ask for Google Chrome's Keychain or keyring entry
  with the user's explicit authorisation. Feasible is not the same as advisable, and it must be the
  user's decision at the moment it happens, not a checkbox in a wizard.

Two further limits apply even where it is feasible. Session cookies held only in the source process's
memory are not in its SQLite at all, so "close Chrome first" improves the snapshot but cannot make it
complete. And device-bound sessions live in a separate database with cryptographic binding that
copying cookies does not transfer -- for those sites the user will be signed out no matter what.

Also worth knowing: the "close the other browser and try again" behaviour is not upstream's. The lock
check is Firefox-only and returns true for everything else, because there is no upstream Chrome
importer to have needed it. Requiring Chrome to be closed is still the right behaviour for a new
importer -- it avoids an inconsistent SQLite/WAL snapshot -- but it is ours to implement.

**Product consequence.** The reference product is macOS-only, and carrying logins across is one of the
reasons it can be. This fork targets Windows, where that capability is off the table. So the import
step must report per-source capabilities truthfully rather than advertise a fixed list -- which is why
`ImportSource` carries `has_cookies` as its own explicit flag, and why it will be false for Chrome on
Windows. A step that says it brought your logins over when it did not is worse than one that says it
brought your bookmarks.

## 3. The agent's tools

We declare exactly one tool, `open_page`. Six of the reference's ten use cases are unreachable
without more, and the missing ones are all "read the page" or "act on the page" or "write a file".

Reading a page, from the browser process:

    content::WebContents::RequestAXTreeSnapshot(AXTreeSnapshotCallback, ...)

Available on a normal desktop build, asynchronous, and does not permanently turn accessibility on.

Acting on a page: `RenderWidgetHost::ForwardMouseEvent` / `ForwardKeyboardEvent` are production APIs,
but they take widget-space coordinates and there is no single in-tree helper mapping an accessibility
node id to a click point -- that part is ours to write.

Running script on a page has a sharp edge worth recording. `RenderFrameHost::ExecuteJavaScript`
CHECKs `CanExecuteJavaScript()` and that gate does NOT admit ordinary http(s) pages, so the browser
process cannot call it on a web page. `ExecuteJavaScriptInIsolatedWorld` has no such gate and works
on any committed page. That is the seam to use, and it is also the better one: an isolated world
shares the DOM but not the page's JavaScript globals, so the page cannot observe or tamper with what
the agent runs.

## 4. Permissions, which are currently a lie

The composer's `Local` and `Guard` chips do nothing. `TaskStore::SetRouting` stores the value and
returns true unconditionally, and no code path reads it. The reference has three real modes --
`Read only`, `Guard`, `Full access` -- plus a working folder, with `Guard` the default.

This must land in the SAME change as the file and input tools, not after them. Shipping the ability
to write files and then adding the boundary is the wrong order: the window between them is a browser
where model output can write anywhere.

Chromium already has a path-scoped grant primitive to build on rather than invent:
`content::FileSystemAccessPermissionContext` and `FileSystemAccessPermissionGrant`, with
`ChromeFileSystemAccessPermissionContext` persisting grants.

File writes themselves are UI-thread authorization followed by `base::ThreadPool` blocking I/O, with
only the already-authorized destination copied into the posted closure.

## 5. The rest, and what each turned out to cost

Each of these was a feature the reference has and we did not. All are built now; what is recorded here
is the seam each hangs off and the decision inside it that a future reader would otherwise re-litigate.

1. **Chats section.** The reference's sidebar is Bookmarks / Chats / Tabs. Ours is Workspaces /
   Bookmarks / Chats / Tabs, listing the profile's tasks newest first via `TaskStore::Observer`, capped
   because the column is 240px and the tab list has to stay visible.
2. **Suggested tasks** on the new tab. A tile FILLS the composer rather than launching: the user should
   see and be able to change the words about to be sent on their behalf.
3. **Steer and Queue.** `SendFollowUp(task_id, prompt, FollowUpMode)`. Draining happens in
   `OnCompletionFinished` (turn produced prose, not another call) and in `FinishTool` (all proposed
   calls answered) -- the two points where inserting a user message does not corrupt a turn the engine is
   mid-answer on.
4. **Routines.** `RoutineStore`, a profile service created *with* the browser context, because a lazily
   created scheduler never arms its timer. `base::WallClockTimer`, not `OneShotTimer`: the latter is
   TimeTicks-based and freezes across suspend.
5. **Memory.** `MemoryStore` over prefs. The 200-entry cap is the design, not a shortcut -- memory that
   outgrows the list that shows it has stopped being reviewable.
6. **Ultrabrowse.** Effort decides the tool budget, the `reasoning_effort` field, and whether
   `plan_research` is declared. Not a sentence in a prompt claiming depth.
7. **CLI, MCP and REPL.** Two paths, because the process singleton is one-way: it forwards a command
   line and answers with an ACK, no payload and no exit code (`process_singleton_posix.cc` sends the ACK
   the moment the callback accepts, before the work is even posted). So `--redrob-task=` covers the
   fire-and-forget case with zero setup, and a loopback `net::HttpServer` covers everything needing an
   answer back. That server must run on a thread with an IO message pump -- `SocketPosix::Accept`
   DCHECKs otherwise, which is a crash on the first connection rather than a startup failure.
   `GET /hello` is unauthenticated on purpose: a browser killed outright leaves its handle file behind,
   and a client that opened with the token would hand it to whatever process later bound that port.
8. **Password manager.** `kCredentialsEnableService` false stops *offering*, not filling. The UI says so.
9. **Model providers.** `os_crypt_async::Encryptor` -- the sync `components/os_crypt/sync/os_crypt.h`
   this was first written against no longer exists in 153. The key crosses to the browser once and never
   comes back; a settings page can set one and see that one is set, and cannot read it.


## What "the same design" means

The instruction is to take the reference's structure AND its visual language. Concretely, from the
import screen: a window-filling step, a dotted-pattern field behind the content, one large centred
isometric illustration with a soft shadow, a title and one line of secondary copy, carousel dots for
the step position, a dark pill primary action on the right and a quiet Back on the left.

Drawn in Redrob's own tokens, which are already in the tree -- the palette and Pretendard are wired
into the new tab page. The reference's ARTWORK is not ours to copy; the composition is what the
instruction is about.
