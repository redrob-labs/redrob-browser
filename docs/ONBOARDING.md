# Onboarding and the agent's tool surface

The reference product is another AI browser. Two write-ups describe what it does end to end:
`techbukket.com/blog/aside-install-guide` and `/aside-use-cases`. This file records what that
implies for us, and the exact Chromium 153 seams each piece hangs off, so the work does not need
re-investigating.

## Where we are

Built and verified: the shell (no toolbar, vertical sidebar, account + Settings at its foot), the new
tab as the task composer, a task opening as a tab with its trace, the engine's streaming transport,
the tool loop, agent tabs as real grouped tabs, captured-frame previews, workspaces on saved tab
groups, and the branding.

Not built: everything below.

## 1. First run

The reference's first launch is six steps before the browser: welcome, account, an explanation of what the
agent does, a password-manager choice, connecting a model or subscription, and importing from another
browser. We have none of it -- our first launch goes straight to a new tab.

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

## 5. The rest, in the order it should land

Each of these is a feature the reference has and we do not.

1. **Chats section.** The reference's sidebar is Bookmarks / Chats / Tabs, where Chats is the list of
   agent tasks. Ours says Workspaces and has no Chats. Our task list currently lives only on the new
   tab page.
2. **Suggested tasks** on the new tab, instead of "No tasks yet" -- the reference uses it to lead
   people to Memory, Routines and settings.
3. **Steer and Queue** for a task already running. We have a stop button and nothing else, so the
   only way to correct a running task is to kill it.
4. **Routines**: cron routines that start a new task on a schedule, and heartbeat routines that wake
   an existing chat with its context. Managed from Settings.
5. **Memory**: preferences and context carried between tasks, reviewable and editable, with a
   retention setting.
6. **Ultrabrowse**: a deeper research effort that plans sub-tasks across many sources. Our effort
   picker already has the affordance and no behaviour behind it.
7. **CLI, MCP and REPL**: a `redrob` command that runs a browser task from a terminal, an MCP server
   so other agents can call this browser as a tool, and a REPL for deterministic page automation.
   Redrob Code already ships a CLI, so the shape is known.
8. **Password manager**: the reference offers its own, connecting an existing one, or skipping.
   Relevant to us mainly because logged-in sites are where the agent is useful.
9. **Model providers**: connecting a ChatGPT, Claude or Copilot subscription by OAuth, or an API key.
   Ours is hardcoded to `redrob/auto`.

## What "the same design" means

The instruction is to take the reference's structure AND its visual language. Concretely, from the
import screen: a window-filling step, a dotted-pattern field behind the content, one large centred
isometric illustration with a soft shadow, a title and one line of secondary copy, carousel dots for
the step position, a dark pill primary action on the right and a quiet Back on the left.

Drawn in Redrob's own tokens, which are already in the tree -- the palette and Pretendard are wired
into the new tab page. The reference's ARTWORK is not ours to copy; the composition is what the
instruction is about.
