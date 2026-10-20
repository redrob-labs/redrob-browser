# Changelog

Redrob Browser's own versions. The Chromium release each one is cut from is in `CHROMIUM_VERSION` and moves on
upstream's four-week cadence whether we ship anything or not — the two numbers answer different questions, so
`scripts/redrob.py version` prints both.

## 0.5.0 — 2026-10-20

**A new app icon.** Redrob Browser wears the 2026 design-system icon from @redrob-labs/ui 1.8.0 on every
platform, in the dock, the taskbar, the launcher catalog and the extension.

**Redrob everywhere you look.** The names the browser shows you say Redrob Browser instead of Chrome: page
strings (Korean included), the Linux desktop entry, icon, man page and app-store metadata, the macOS document
kinds, the Windows executable (`redrob-browser.exe`) and the agent server process. The default-browser prompt and
the WebUI marks in dark mode use Redrob artwork. On Linux the password-store key lives in a "Redrob Safe Storage"
keyring item, copied from the old Chromium item, which is left in place.

**Redrob Launcher links open the launcher.** On Windows the browser registers `redrob-browser://` as its own
launch scheme and leaves `redrob://` to Redrob Launcher, so `redrob://open/<app>` links no longer open the browser.

## 0.4.0 — 2026-10-20

**Your phone can sign you in, too.** The app-bridge tools Redrob Code's daemon gets (the phone chat included) now
have `login`: the same password-store fill, the same per-site policy and the same sign-in record as the built-in
agent, and the password still never reaches the model. Only the agent server this browser started can ask for
it; another program on the debugging port is refused.

**Unlock where the task stops.** A task waiting on a locked password store shows Unlock in its "needs you"
notification. It asks the OS to re-authenticate and then carries on; Settings stays the fallback.

**The quick window stands on its own.** Ctrl+Shift+Space keeps the browser running while the small window is
open, even with no browser window left.

**Recent chats with tabs on top.** The toolbar gains a chats button next to account and Settings, listing the
same recent chats as the sidebar.

## 0.3.0 — 2026-10-19

**Tabs start across the top.** A new profile opens with the familiar horizontal tab strip; the sidebar is one
switch away in Settings (Use vertical tabs), and a profile that already chose the sidebar keeps it. With tabs on
top the toolbar carries the account button and a Settings button at its trailing edge, and saved tab groups show
in the bookmark bar so a group is reopened from there.

**The agent can sign in for you, without seeing the password.** A `login` tool fills the page from the profile's
own password store. The model is told only the outcome and the username. Settings > Passwords and the agent sets
when it may: always, only while unlocked (the default, unlocked by the OS's own re-authentication for a window you
choose), or never — per site as well — and lists every sign-in it made. Codes, passkeys and CAPTCHAs stay with you:
the task waits until you finish them.

**Memory you can read, edit and undo.** What the agent remembers is a folder of plain markdown files in the profile
(by day, by site, people, projects, you). After each task it notes what mattered; once a day it consolidates. Every
run is listed with what it changed and can be reverted. Retention is forever, 30 or 90 days. Settings > Memory.

**Ask from the address bar or from anywhere.** Type `>` and a space in the address bar to give the agent a task with
the current page as context. Ctrl+Shift+Space (Cmd on macOS) opens a small window that starts a task without the
browser in front; the shortcut can be changed or turned off.

**Tasks keep running when you close the window.** The browser stays up while a task is queued, running or waiting
for you, and tells you through the system's notifications when it is done or needs you. In guard mode a click that
would send, post, pay or delete waits for your OK. Effort has a third level, Ultrabrowse, for long jobs.

**Models and subscriptions come from the engine.** The provider list, subscription sign-in and your own API key are
the engine's, shown as it reports them; where it reports no usage the page links to Redrob Console instead of
showing a number.

**Skills follow the page.** Each request names the page the task is on, so Redrob Code 0.9.0 or later loads the
skills written for that site.

**Import from Firefox and Safari**, with progress per item and a Cancel button. Passwords from those browsers come
across as a CSV you export there and import in the password manager.

## 0.2.0 — 2026-10-17

**Redrob Code can drive this browser.** While the browser runs, its agent server registers itself with the
Redrob Code daemon on the machine (redrob-code 0.7.0 or later) as the app `browser`, and the daemon's agent —
the phone chat included — gets eight tools over the browser session the built-in agent already uses: list the
tabs, open one, navigate, read a page, find an element, click it, type into it, take a screenshot. Nothing
leaves the machine: the bridge is MCP over loopback, the registration is dropped when the browser quits, and when
no daemon is reachable the browser says so once in its log and carries on without it.

**Signed in once, through Redrob Launcher.** A Redrob Console provider saved without a workspace key now runs on
the sign-in Redrob Launcher keeps in its shared account file (`~/.config/redrob-shared/account.json` on Linux,
`~/Library/Application Support/ai.redrob.shared/account.json` on macOS, `%APPDATA%\Redrob\Shared\account.json` on
Windows; `REDROB_SHARED_DIR` overrides the directory). The agent server reads the file at the moment it builds a
request, so signing in, signing out or rotating the key in the launcher takes effect on the next request without a
restart. A key the provider has of its own always wins; nothing here writes the shared file, and the key never
reaches a page or the extension. The Redrob Console form says *Signed in with Redrob Launcher · account* and makes
the key optional while that is true, in English and Korean.

**Every release asset is named the way Redrob Launcher reads it.** `redrob-browser-<version>-<os>-<arch><suffix>`
— `redrob-browser-0.2.0-windows-x64-setup.exe`, `-macos-arm64.zip`, `-macos-arm64.dmg`, `-linux-x86_64.deb`,
`-windows-x64-portable.zip` — for the signed set and for the draft's unsigned `.app.zip` and `-packaging.zip`
alike. The Debian-named package moved out of the release into `out/deb` (what `redrob.py repo` reads), and
`sign-and-publish.yml` rebuilds that name from the package's control file for the apt pool. cdn.redrob.ai keeps
the names it has always served (`redrob-browser-x64-<version>-setup.exe`, `redrob-browser-macos-arm64-<version>.zip`,
`redrob-browser-amd64-<version>.deb`), so no `latest/` link or appcast enclosure moved. The 0.1.8 release's
assets were renamed in place to the same shape.

**The built-in Redrob Code agent shares one engine with the rest of the machine.** The agent now runs
`redrob acp --attach`, which makes the browser a thin client of the single Redrob Code daemon every Redrob app
on the machine attaches to (redrob-code 0.6.0 or later) rather than an engine process of its own; the daemon
starts on first use and goes away after ten idle minutes with no clients. A Redrob Code agent saved before this
change keeps working — the flag is added when the agent launches, so there is nothing to re-add.

**The Windows installer is signed through Azure Artifact Signing over OpenID Connect.** `sign-and-publish.yml`
no longer imports a certificate file: the signing job logs in to Azure with the job's own identity token
immediately before `signtool` runs, signs with the organisation's Public Trust certificate, and accepts the
result only when the full Authenticode check passes and the signer is `CN=McKinley Rice, Inc.` — the old
not-trusted allowance is gone. The vendored build system's Windows signer follows the same recipe. No
certificate file, password or client secret exists anywhere in this repository's configuration any more.

**Signing, publishing and the branch rules are the organisation's shared copies.** The Windows signing step
is `redrob-labs/.github/actions/sign-windows`; the release is created by the shared `release-publish.yml`,
which writes `SHA256SUMS.txt` and `redrob-launcher.json`, replaces the draft's assets with the signed set and
publishes it as latest (prerelease when the version carries a `-`); `gitflow.yml` calls the org-wide reusable
workflow with its one type list. `sign-and-publish.yml` gained a `dry_run` input that signs and verifies without
touching the release or the CDN, and lost `undraft` — a release is published when its signatures verify.

### Under the hood

`scripts/check_asset_names.py` is the launcher's asset parser transliterated; it self-tests in CI, runs over
`out/artifacts` at the end of every `package`, and reads the release's own asset list back before
`sign-and-publish.yml` publishes it. 0.1.9 was prepared on 2026-10-13 but never built or tagged; everything it
carried ships here.

## 0.1.8 — 2026-10-13

**The extension and the agent apps are on Redrob UI, end to end.** Every page the browser ships — the new tab,
the side panel's chat and history, settings, onboarding, the scheduled-tasks and connected-apps pages, and both
agent apps (the cockpit and its onboarding) — now draws its tokens, type, components and icons from
`@redrob-labs/ui` 1.3.1, the same release as the window's own chrome. One colour scheme covers the window and
the pages: choosing light, dark or system in either place changes both, and the pages pick the scheme up before
their first paint so a dark page is never white for a frame. Every stylesheet enters through one file, in a
declared cascade layer, so a third-party sheet can no longer repaint the system's primitives.

**English and Korean, everywhere.** The side panel, the app frame, settings, diagnostics, onboarding, the
extension manifest and both agent apps are localised, and a check fails the build on any hard-coded UI string.
The agent app's durations read `4분 0초` in Korean rather than `4m 0s`.

**2026 icons and a launch splash.** Every icon slot — the app icons on all three platforms, the Windows
installer and Start tiles, the document and PDF icons, the product favicon and the extension's action icons —
is the 2026 brand set, and the first new tab of a browser session opens on a short Redrob splash that hands
over to the page's first frame. It never runs in a frame or on a deep link.

**The agent apps no longer name the product they were forked from.** Their mark, name, promo copy and hosts are
Redrob's; the one remaining mention — the Claude Desktop extension, which is the upstream's own file — is
withheld from the MCP page until a Redrob-branded extension ships.

**Connect apps** shows a built-in app's description even when the app synced before the catalogue loaded.

### Under the hood

The agent extension is at 0.0.165. Every extension and onboarding screen is captured in CI, light and dark,
English and Korean, and measured for off-palette colours, contrast, missing focus rings, foreign icons and
untranslated copy against a ratcheted baseline; a dev `.deb` is built on the runner and its chrome measured from
pixels. The CDN publish step can replace an already-published version on request.

## 0.1.7 — 2026-10-10

**macOS and Windows ship from the same release as Linux.** 0.1.6 added a signed and notarized macOS app and a
signed Windows installer after the fact; 0.1.7 is the first release cut with all three from one source.

**The macOS app no longer carries a Linux program.** The bundle held a BrowserClaw server that Redrob never
starts, and only a Linux build of it existed. It is gone, and packaging now refuses any executable in the app
that is not a Mac binary.

**The Windows installer's file properties show the year.** The copyright line read
`Copyright @LASTCHANGE_YEAR@ Redrob`; it now reads `Copyright 2026 Redrob`.

**The extension draws from Redrob UI.** Its colours, component styles and fonts come from `@redrob-labs/ui`
1.3.1, the same release as the browser's own chrome, instead of a hand-copied table. A third-party editor
stylesheet that repainted Redrob Blue as a different blue across the extension no longer can.

**Connect apps** shows a built-in app's description even when the app synced before the catalogue loaded,
where it used to stay blank.

### Under the hood

Windows builds cross-compile on the Linux build host (`--flavour win_cross`) and macOS uses its own
`mac_cross` flavour; `docs/WINDOWS.md` and `docs/MACOS.md` describe both. The signing workflow takes the mac
signing module from the build, signs Sparkle and the agent server first, and notarizes after the Chromium
driver. The agent extension is at 0.0.164.

## 0.1.6 — 2026-10-08

**Redrob Code is the agent we recommend, and the browser now says so.** The onboarding "Set up your agent"
step opens with a Redrob Code card marked Recommended, and in Settings it leads the coding agents. When the
engine is not installed, connecting it no longer reports a crash: the launcher looks in the places our
installers put the engine, and if it is not there the message says where to get it.

**Connect with Redrob Console.** The provider form can now sign in to the console by device code: the
browser shows the code, opens the approval page, and the workspace key the console issues lands in the form.
The device code never leaves the agent server; the extension only holds an opaque handle.

**The assistant can offer replies.** After an answer, up to three short replies in your voice appear as chips
under its last message, in the side panel and the new-tab chat. Clicking one sends it. An external agent that
ends its answer with an `[OPTIONS: a | b | c]` line gets the same chips instead of raw brackets.

**The vertical-tabs column no longer draws your bookmarks twice.** It listed them under its own heading
while the bookmark bar showed the same entries, pushing the tab list down by up to eight rows. The column
keeps the workspace switcher, chats and tabs; the bar keeps bookmarks.

**Windows.** A branded setup window installs the product as "Redrob Browser" — the Start menu, Settings >
Apps and the taskbar all said the bare company name before. Setup can also install Redrob Code, off by
default, verified against that release's checksums; a Redrob Code failure never fails the browser install.
Uninstalling opens a matching branded window instead of Chromium's plain dialog. A reinstall opens the
browser afterwards and exits cleanly, where before it opened nothing and died on the way out. The engine
launches on Windows, and `chromium_src` overrides compile there too.

**Importing from Chrome** skips history rows that carry no visit time instead of failing the import.

### Under the hood

A fresh build machine gets every checkout input it needs: the pinned Sparkle and WinSparkle binaries are
fetched, the published agent extension is bundled when none is built, and `sync --no-history` exists for
machines that only build. macOS updates are signed with Redrob's key and an appcast is published; Windows
verifies WinSparkle updates against the same key. The agent extension is at 0.0.163.

## 0.1.5 — 2026-09-28

**Five sign-in strings no longer ask the user to sign in to something that does not exist.** In v0.1.4
`chrome://settings`, the avatar bubble and the enterprise profile prompt all read "Sign in to Redrob?".
There is no Redrob account — the button behind those strings signs the user into a **Google** account and
turns on Google sync, and that is what they say now. A table to rewrite them had existed since the Google
surface audit, but the patch carrying the strings was stored before it and was never regenerated, so five
of the seven kept the wrong name. The rules that generate them now declare how many places each rewrite
must hit, so it cannot drift back silently.

Each string was judged individually rather than swept, because the family genuinely divides: **"Sign in to
Redrob in a new profile?" is unchanged** — that one is about a browser profile, which is ours.

**Linux auto-update now has something to talk to.** The package has configured apt for itself since
v0.1.0, but no release ever built the repository it points at, so every installed copy had a valid apt
source aimed at nothing. Publishing now builds a signed apt repository, verifies both signatures against
the same public key the package embeds — the check apt makes on your machine — uploads it, and reads it
back before calling it published.

It is still **off in this release**, and deliberately: it needs a signing key, and without one the release
says so in three notices rather than publishing something shaped like a working update channel. An
unsigned apt repository is worse than none, because it makes every future update whatever the network
hands the user.

**`chrome://version` attributes this product to us**, and `chrome://settings` no longer offers Google's AI
features under our name — including a privacy disclosure that claimed, as Redrob, that data is sent to
Google and may be read by human reviewers. Neither is true here: the agent talks to whichever provider you
configured. Both were already fixed in the tree; they are named here because this is the first release
that carries them.

### Under the hood

Nothing below changes the browser. It changes what a Chromium upgrade costs, which is the thing that
decides how quickly a security release reaches you.

Hand-written patch lines fell from 3,836 to **533**. The branding rename — 2,690 lines across 19 stored
patches — is generated from rules, as is the whole packaging group. A stored patch records what a file
looked like; a rule records what we meant, and declares how many places it applies to, so a rule that now
matches a different number of sites **stops the build** instead of quietly changing the wrong amount of
code. Every converted patch was verified byte-identical to the one it replaced.

Two defects surfaced while doing it, both of which had been silently possible before:

- The rule generator read its rules with one YAML parser when a library was installed and a built-in one
  when it was not, **and the two disagreed** — so the patch produced depended on which machine ran the
  generator. Its own checker could not see this, because the checker used whichever parser was installed
  and compared the result against a patch made by that same parser. There is now a check that reads every
  rule both ways and diffs them.
- The apt repository's URL is stated twice, in the package and in the publishing workflow, in files that
  never reference each other. If those drift **nothing fails**: the release publishes a real repository,
  the package installs a real source, and every machine polls a 404 forever. A check now asserts they
  agree.

## 0.1.4 — 2026-09-26

**One unclean exit no longer makes a profile permanently unlaunchable.** This shipped broken in v0.1.3 and was
the most expensive defect in it. `profile.exit_type` stays `Crashed` until the browser exits cleanly, and on the
next launch this build trapped before any window appeared — so the flag never cleared and every launch after did
the same thing. One force-quit cost the user the whole profile, and their only recovery was to delete it, losing
tabs, bookmarks and workspaces.

The trap is `CHECK(element)` in `AppMenuButton::GetAnchor()`, reached from
`SessionCrashedBubbleView::ShowBubble()`. Upstream's crash bubble anchors to the app menu button. This fork keeps
that button built — menu accelerators reach for it without a null check — but permanently invisible, so
`GetAnchor()` takes upstream's fallback branch, which upstream only reaches in content-fullscreen, and CHECKs on
an element that is not there. At that point in startup NONE of `BrowserView`'s elements exist, not the fallback
anchor and not `kBrowserViewElementId`, because a `ViewSubregionAnchor` registers when its view is DRAWN and the
window has not been shown yet. The two obvious explanations were both wrong, and the diagnostics say so rather
than the reasoning: timestamped markers show the anchors created 184ms BEFORE the lookup that cannot find them,
and the element contexts match. Upstream survives only because its app menu button is visible, so it never needs
the fallback.

So the bubble is not shown in this fork. Repairing it instead would mean changing when startup registers view
elements — blast radius: every bubble anchored that way — to restore a surface this fork never integrated, since
the sidebar owns tabs and there is no session-restore story for the bubble to belong to. That is the same call
already made for the sign-in promo's effects control and the feature-showcase carousel. The
`Startup.CrashBubbleShown` histogram stays, so a crashed start is still recorded, and a restore-after-crash
affordance can be built later on our own surface where it can anchor to something that exists.

Reproduced by writing the state, not by trying to produce it: set `profile.exit_type` to `"Crashed"` in the
profile's `Preferences` and launch. Killing the browser does not work — `SIGKILL` never flushes the pref, which
is why an earlier attempt at this concluded the build did not reproduce it — and `--test-type` does not suppress
the bubble either, because that check sits after it. Verified with three launches from a `Crashed` profile, each
with a visible window. CI now launches twice on one profile, which is the shape of test that would have caught
it the first time.

**The settings page told users, under our name, that their data goes to Google and that Google staff read it.**
`chrome://settings` carried an "AI in Redrob" section — upstream's page for Google's own AI features, with brand
substitution making every one of them read as ours. Its rows were AI history search, AI suggestions, "Skills in
Redrob", "Indigo — Manage your Indigo data", and "Google 검색 AI 모드 및 연결된 앱", which offered to connect
Google Drive and Workspace. This product ships none of them. The disqualifying part was the disclosure above
those rows: beside a Google logo it stated `관련 데이터가 Google로 전송됩니다`, then in untranslated English that
"Data sent to Google may be seen by human reviewers to improve Redrob AI's technology". Both are false here —
this browser's agent talks to whichever provider the user configured, which `sidecar_client.cc` states goes to
that provider "not to Google and not to Redrob", and no Google reviewer sees any of it. The whole surface is now
off unconditionally, on both the static and the runtime path: accepting Glic's own first-run used to push
`showAiPage` back to true. `내 Google 서비스 설정` is deliberately kept, because that one is the real Google
account and sync home.

**The first-run flow continued into Google's promo carousel after our onboarding finished.** Six Korean steps
explaining this browser, then upstream's feature showcase: a Gemini step, a Google Lens step, a Password Manager
step offering to "툴바에 추가" — this product has no toolbar — and a theme picker headed, in English, "Make
Redrob yours". The English is the same root cause as the disclosure above: those strings come from the
Chromium-branded variants, which Google never translates. `RedrobFirstRunFlowController` now overrides
`RegisterPostIdentitySteps` and drops `kFeatureShowcase`, `kFinishOrContinue` and `kDefaultBrowser`, filtering
the queue rather than skipping registration so the base class keeps the completion wiring it owns.
`kSearchEngineChoice` is kept: that is a regulatory screen, not a promo.

**The profile bubble opened off the left edge of the screen.** Upstream hardcodes `BubbleBorder::TOP_RIGHT`,
which extends the bubble's body leftward from its anchor — correct when the avatar is the last button of a
top-right toolbar, which is where upstream puts it. Ours leads a left-hand sidebar at x≈17, so leftward is off
the window and off the display: measured on a 1560×860 window at 0,0, the body landed at a negative x and all
that was on screen was a ~40px slice of its right edge overlapping the sidebar it was anchored to. The arrow is
now chosen from the anchor's position against the work area, rather than pinned to the other corner, because the
same class also serves the incognito menu and an anchor near the trailing edge would then clip the other way.

**The workspace button could not be pressed until you already had a workspace.** It was `SetEnabled(count > 0)`,
and `ShowWorkspaceMenu` returned early on an empty list — so the header's only dropdown was dead from the moment
the browser was installed, which is exactly when someone presses it to find out what a workspace is. The tooltip
said to save a tab group first, but a tooltip is the reward for hovering something you already believe works.
The menu now always opens: with none saved it says so in a disabled row and offers "이 탭들을 워크스페이스로
저장", which groups the window's ungrouped tabs. Only ungrouped ones, because `AddToNewGroup` would otherwise
move tabs out of the group they are already in — the agent's own group included.

**An empty section was a heading with nothing under it**, which reads as a half-drawn list rather than an empty
one. Bookmarks and Chats now each carry a note saying what would put a row there — `Ctrl+D를 누르면 이 페이지가
여기 담깁니다` and `에이전트에게 맡긴 작업이 여기 쌓입니다` — built as labels, not rows, because a row that looks
like every other row and does nothing when clicked is the defect being fixed. The bookmarks note sits after the
`model->loaded()` guard: while the model is loading the section is not empty, it is unknown.

**The search pill had no state to change.** `seg-on` was a static class in the markup that nothing ever moved,
so the control permanently claimed "AI에게 요청" was selected. `Search` was not a mode at all — it acted the
instant it was clicked, and returned silently when the field was empty, which is why pressing it appeared to do
nothing. Enter was governed by neither segment, since `Ask AI` was the form's submit button. Both segments now
only select; submitting acts, and the placeholder follows the mode. A URL is still opened rather than searched or
filed as work, in either mode.

**The collapsed rail's glyphs did not line up.** The rail is 56px wide, so its centre is 27.5. Measured: the tab
favicon was correct at 27.5, the collapse toggle sat at 23.0 and the settings gear at 22.8 — both about 4.6px
left, because each kept the expanded row's leading padding into a state that has no labels to align to. The
toggle was explicit about it, reading `is_collapsed ? 0 : centre`, which is backwards. `RedrobAccountRow` did not
know about collapsing at all. Both are centred now, measured at 28.0 and 27.8.

The avatar was also missing from the collapsed rail entirely, while the comment beside the code that removed it
said it was "the one thing that STAYS". It is 28px, needs no label, and is this browser's only sign-in control.
Two things hid it: `SetVisible(!collapsed)` and, more decisively, hiding the container it lives in. It now stays
and centres, measured at 27.5.

**The onboarding ran once and was then unreachable**, so the one page that explains this product was the one
page a user could not get back to. Settings has a "시작하기" section that reopens it. Its final button used to
do nothing outside the first-run flow — there was no callback to run — which would have made the fix ship a dead
control; it now leaves on the new tab, the same place finishing first run lands.

**The package created an empty signing keyring on every machine that installed it.** With no update channel
configured, `install_deb822_sources` correctly refused to add an apt source — but `install_key` ran anyway, and
with `PGP_KEY_DATA` empty its body is silent rather than failing: `echo "" | base64 -d` exits 0 and produces
zero bytes. So `/usr/share/keyrings/redrob-browser.gpg` was created empty, and `/usr/share/keyrings` with it.
Nothing broke, because nothing referenced the file. What was wrong is what the file claimed: a keyring exists,
so the first thing to add a sources file — by hand, or a later version of this package — would get a signature
failure instead of a channel that is cleanly and visibly off. The guard now lives in `install_key` itself
rather than at its three call sites, because a guard per call site is a guard someone will add two of.

Present in v0.1.3, which is not being re-released for it: the file is inert there, and moving a published
release is worse than carrying a known-harmless artefact until the next one.

**The port the browser talks to the local engine on was unauthenticated.** `SidecarClient` generates a 32-byte
per-launch secret, binds it into the launch task and sends it as HTTP Basic on every request — and never gave it
to the engine. The engine enforces Basic only when `REDROB_SERVER_PASSWORD` is set, so with nothing set our
`Authorization` header was ignored and an ephemeral loopback port accepted requests from any process on the
machine that found it, with the user's Console credential and the engine's whole tool surface behind it. The
launch lambda even took the secret as a parameter and never read it, while the comment beside it claimed the
engine was "authenticated by a per-launch credential". The secret now reaches the engine through the
environment, on the same route as the API key: never on the command line, never logged, never on disk. The route
the client posted to did not exist either, so no task could have run even unauthenticated.

**The engine is now found on Windows, by walking `PATH` here rather than handing the job to the launcher.** Both
halves of the previous discovery failed silently as "not installed": the install-location branch looked for a
file named `redrob` with no `.exe`, and the `PATH` branch was `BUILDFLAG(IS_POSIX)`-guarded — `base::
ExecutableExistsInPath` does not exist on Windows — so it compiled out entirely, leaving `REDROB_CODE_BIN` as
the only way to find the engine on the platform the change was written to fix. A runtime fault a compile would
never have caught, on a job that does build and launch the browser.

**Google's name is now on what Google actually does, and off what our own engine does.** The rule, applied to
every surface in the survey: if Google is doing the work the name stays, and if our engine is doing it the name
goes. `chrome://version` credited "The Chromium Authors" and their copyright — the one page a user opens to
check what they are running attributed the product to someone else, contradicting `branding/BRANDING`. The
composer's Search segment hardcoded `https://www.google.com/search?q=` in the renderer, so choosing another
engine in settings changed nothing; the navigation now goes through the profile's default provider. Upstream's
assistant is switched off rather than having its text deleted, because a string edit leaves the feature running.
`내 Google 서비스 설정` and Google sign-in are both kept: those are Google's own account, and Chromium is where
they belong.

**Sign-in and sync were never removed from this fork — they are gated on three credentials it does not ship.** An
API key, an OAuth client id and a secret, which Google's own builds read from `google_apis/internal/`. Without
them Chromium substitutes the sentinel `dummytoken`, which is exactly what this fork's startup log prints, and
every Google-backed feature is inert, translation included. A missing input, not a regression. Demonstrated by
exporting three deliberately fake values: `chrome://settings/people` then renders the sign-in card, where
without them the page offers no sign-in row at all. The build takes those values from the environment and never
from a committed file — a key in the repository is a published key.

**Bookmarks you save with Ctrl+D now appear in the sidebar.** The section read only `bookmark_bar_node()`, and
Ctrl+D in this build files a page under Other bookmarks, so the sidebar contradicted its own empty-state note
telling users to press Ctrl+D to keep a page there. It now walks the bookmark bar, Other bookmarks and Mobile
bookmarks, in that order, under the same row cap.


Linux auto-update stays deliberately off. The CDN half is configured — `vars.REDROB_CDN_BUCKET` and its two
credential secrets are org values this repository can see, confirmed by `.github/workflows/preflight.yml` — and
the apt repository's own GPG key is the one thing absent. Wiring it is a later decision, not a missing piece
of this build.

## 0.1.3 — 2026-09-14

Korean actually translated, and a Windows build path.

**Our own UI was not translated, and the mixed window made that look like a bug.** Chromium ships `ko.pak` with
440 locales, so with `LANG=ko` the address bar read `Google에서 검색하거나 URL을 입력하세요.` above a sidebar
saying `Bookmarks`, `Chats`, `Tabs` — and `chrome://settings` showed `설정` in its tab title while our own foot
row said `Settings`, two words for the same thing in one window. There were zero `IDS_` uses in this fork and no
`.grd` at all. Now there are 242 strings behind grit, all of them Korean: the sidebar, the new tab and task view,
the settings page, and the first-run flow. `docs/L10N.md` has the whole path.

Everything derives from `l10n/*.tsv`, one row per string, because a localized string otherwise has to be kept in
step in three places — the English in a `.grd`, the Korean in a `.xtb` keyed by a **hash** of that English, and
the id at the use site. `scripts/gen_strings.py` generates all three and `redrob.py check` fails on drift. The
xtb fingerprint is reimplemented so `check` needs no checkout, and cross-checked against grit's own module when
one is present — a wrong id is dropped **silently** and ships English on a green build.

Two things cost a build each and are worth knowing before touching this. **`$i18n{}` does not work in
TypeScript**: `EnableReplaceI18nInJS` substitutes only inside Lit/Polymer HTML template literals, so a
`'$i18n{key}'` literal in a hand-written `.ts` reached the page as the visible text `$i18n{obContinue}` on the
onboarding button. The path there is `UseStringsJs()` plus `loadTimeData`. And **a sentence split around
`<strong>` breaks in Korean** — the newline between two fragments renders as a space, so `일정은` came out
`일정 은`; those sentences are now single strings carrying their own markup behind `$i18nRaw{}`.

**Windows.** `build/args/windows.gn`, `redrob.py build/run/package --flavour windows` (the packaging target is
upstream's own `mini_installer`, staged as `redrob-browser-x64-<version>-setup.exe` — the name the sibling repos
already publish under, so the CDN script's `latest/` alias needs no change), the `AddFontResourceExW` /
`FR_PRIVATE` font registration, and `.github/workflows/windows.yml`. None of it has been compiled: the workflow
is manual dispatch and expected to fail on **disk** first, which is the measurement that says a self-hosted
machine is needed. Signing, an update channel and the app icon are absent and listed as absent in
`docs/WINDOWS.md`. `redrob.py build` now refuses a flavour whose platform is not the host's, instead of failing
deep inside a toolchain.

**The macOS build would have failed at `gn gen` on a target that no longer existed.** `ui_font_bundle_data` was
added to the checkout and never copied back into `sources/`, while `patches/chrome-BUILD.gn.patch` depends on it
— and `apply` copies `sources/` **over** the checkout, so the next apply would have deleted the target its own
patch requires. `export` could not catch this by design, because a `sources/`-owned file is excluded from its
untracked-file report. `check_repo.py` now compares every manifest source against the checkout when one is
present.

## 0.1.2 — 2026-09-14

Korean, and a header that stopped losing two buttons.

**Hanja and decomposed Hangul had no font behind them.** The bundled Pretendard covers all 11,172 precomposed
Hangul syllables — which is why Korean looked fine — and zero of the conjoining Jamo block and zero CJK Han, both
measured. So Hanja in a document, and the NFD Hangul macOS puts in filenames, were tofu boxes on a minimal
install. `fonts-noto-cjk` is now a dependency: 256/256 Jamo and 20,976/20,992 Han. Pretendard stays as the UI
face; swapping the company's typeface to reach a block that only appears in decomposed strings would have cost
the brand everywhere to fix it in one place. The dependency adds about 60 MB.

**The sign-in promo pushed the magnifier and compose button off the sidebar.** Signed out, the avatar expands into
a "Sign in to Google?" pill about 145px wide, and in a flat 254px row that width shifted both trailing controls
past the column's edge — a browser that lost two controls depending on sign-in state. The leading group now
carries the row's flex, so the workspace name elides and the controls hold their coordinates.

**macOS groundwork**, none of it yet compiled: the CoreText font registration is written, the font travels as
`bundle_data` inside the framework where `DIR_MODULE` can actually find it, `build/args/mac.gn` is a dev flavour
sized for a hosted runner, and `.github/workflows/macos.yml` asks one question — does it build and launch. See
`docs/MACOS.md`.

## 0.1.1 — 2026-09-14

One fix, and it is the reason 0.1.0 should not be installed.

**The package configured Google's apt repository and installed Google's signing key.** An installed 0.1.0 wrote
`URIs: https://dl.google.com/linux/chrome-stable/deb/` into the user's apt sources and filled
`/usr/share/keyrings/redrob-browser.gpg` with Google Inc's Linux Packages Signing Authority key. Both were
inherited from upstream, where they are correct because upstream's package is Chrome.

Both hardcodings now come from one string, and the channel is off until Redrob has its own signing key: with no
key the package adds no source at all and says why. `scripts/update_signing_key.py` turns it on.

If you installed 0.1.0, remove what it added:

```
sudo rm -f /etc/apt/sources.list.d/redrob-browser.sources \
           /etc/apt/sources.list.d/redrob-browser.list \
           /usr/share/keyrings/redrob-browser.gpg
sudo apt-get update
```

## 0.1.0 — 2026-09-13

First tagged version. Chromium 153.0.8010.36, Linux, 72 patches.

### The shell

The window is a sidebar and a page. The vertical tab strip carries the workspace, bookmarks, chats and tabs;
above the page is a slim row with back, forward, reload and a flat address field that paints no box.

Its geometry is measured rather than judged. `redrob_sidebar_tokens.h` holds every number with the measurement
it came from — a 254px column, a 32px row, a selected pill 240 wide with 8px corners, a 16px favicon with an
8px gap to its label — and `MakeRow()` is the single place a row is built, so a row cannot disagree with the
tokens by being constructed at a call site that forgot one.

- Pretendard for the whole window, registered through fontconfig on Linux (Windows and macOS branches log that
  they are unimplemented, by name).
- The selected tab casts a real shadow. It needed the tab's own clip path widened first: a vertical tab clips
  its painting to its fill path, which silently discarded three earlier attempts.
- The group header no longer paints a filled bar in the sidebar, where it competed with the selection for the
  same visual meaning; it carries a leading mark and a tab count instead.
- The close button appears on hover and focus, not permanently on the selected row.
- The avatar sits with the workspace name, because the profile and the workspace are one feature here.
  Settings sits alone at the foot.
- Bookmark favicons load. They never had: `BaseBookmarkModelObserver` deliberately swallows the favicon
  callback, so the row asked once, got an empty image, and was never told the real one had arrived.

### The agent

- Read, click, type and save a file, with a permission model that actually refuses: `read-only`, `guard` and
  full access, chosen per task, with a refusal recorded as a step in the trace rather than silently dropped.
- Steer a running task, queue follow-ups, and an Ultrabrowse effort level.
- The trace shows captured frames, not placeholders.
- A URL typed alone in the composer is opened. A URL with words around it stays a task.

### Settings, onboarding, import

- `chrome://redrob-settings` covers routines, memory, model providers and passwords.
- First run actually runs, and says honestly what "import from Chrome" can and cannot mean per platform.
- A Chromium-family importer, because 153 ships none.

### Automation

- `POST /mcp` serves the browser as an MCP server, verified end to end against the reference SDK client: `GET`
  answers 405 and `notifications/*` answer 202 with an empty body, both of which the client requires and
  neither of which it says out loud.
- A loopback endpoint for scripts. `docs/AUTOMATION.md` replaces the browser-side CLI that was deleted — Redrob
  Code's own binary is already `redrob` and it speaks MCP as a client, so a second CLI was a second name for
  one path.
- OAuth 2.0 with PKCE for model-provider sign-in.

### Branding

Real tokens, real logo, and the strings that still said Chrome. Every branded file has exactly one owner so the
fork reproduces; `GOOGLE_OWNED_REWRITES` protects the phrases that must keep saying Google, because Chrome's
sync sign-in is a Google account and calling it a Redrob account offers something that does not exist.

### Known gaps

- Linux only. macOS needs `Assets.car`/`AppIcon.icon`, which needs `actool` on a mac host, and the Windows and
  macOS font registration paths are stubs.
- Packaged and signable, but nowhere to serve it. `redrob.py package` produces a real `.deb`
  (`redrob-browser-stable_0.1.0+153.0.8010.36-1_amd64.deb`) and `redrob.py repo` produces a signed apt
  repository from it, but nothing hosts that repository, so installing is still a manual act with no upgrade
  path. The signing key never lives in this repo — see `docs/RELEASE.md`.
- The packaging step needs `debchange`, `dpkg-deb` and `fakeroot` on the host, which is why the release workflow
  is self-hosted. See `docs/RUNNER.md`. No `.rpm`: upstream's combined target needs rpm tooling this build
  deliberately does not install.
- The `@` context picker is not implemented — `StartTask` accepts `context_refs` and nothing produces them.
