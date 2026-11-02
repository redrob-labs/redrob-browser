# Chromium (CEF) in the window

Status: in progress (branch `feat/cef`).

## Decision

Window tabs run on Chromium through CEF (Chromium Embedded Framework). The
headless agent engine (`redrob-browser fetch | scrape | serve | mcp`) stays on
Obscura.

Why: sites expect Chrome. With our own engine they broke in three layers:
the TLS/HTTP-2 fingerprint (Stack Overflow and Google block on the first
request; BoringSSL cannot produce Chrome's ClientHello), missing JS behaviour
that bot challenges probe, and missing web platform features and layout
differences. Chromium removes all three at once. Every other agentic browser
(Comet, Dia, Atlas) made the same choice.

We do not build Chromium. CEF ships prebuilt binaries per platform; the
`cef` crate (tauri-apps/cef-rs, Apache-2.0 OR MIT, version
`156.3.0+156.0.15` = Chromium 156) downloads them and generates Rust
bindings. Chromium security updates arrive as a `cef` crate bump.

Which of Chrome's features work in the window, and how the window stands
in for Chrome's toolbar: docs/CHROME-FEATURES.md.

## Shape

```
redrob-browser-window (one process per profile, CEF browser process)
  ├ egui chrome: tab strip, toolbar, address bar, bookmarks bar, side
  │  panels, downloads bar, find bar, permission / login / dialog bars
  ├ cef/        CEF app + client + handlers
  │   ├ native.rs: each tab's page is a native child window of its browser
  │   │  window (X11 window / HWND / NSView), placed over the page area;
  │   │  only the tab on screen is shown, moved between windows by
  │   │  re-parenting. Chromium does its own keyboard, IME, clipboard,
  │   │  popups (<select>), cursor, drag and drop, scrolling, throttling
  │   ├ host.rs (Linux, Windows; macOS opt-in): each page is a Chrome
  │   │  browser with Chrome's toolbar (hidden), in a frameless CEF Views
  │   │  window moved into the browser window before it is shown, so
  │   │  extension actions run through Chrome (activeTab); see "Pages as
  │   │  Chrome windows" below
  │   ├ keys.rs: window shortcuts taken in on_pre_key_event while the page
  │   │  has the keyboard
  │   ├ xdnd.rs (Linux): the chrome's focus window and the window's XDND
  │   │  proxy (drops over the page go to the page on screen, over the
  │   │  chrome a link or text opens)
  │   └ events: display / load / life-span / focus / download / ... -> cdp::Update
  ├ popup.rs: menus, address-bar suggestions, the page's context menu,
  │  tooltips, the status bubble: small borderless windows above the page
  ├ strip.rs: the tab strip and tab groups (chip, color line, collapse)
  ├ browser.rs: tab drags between windows, read from the global pointer
  │  (X11 query_pointer, GetCursorPos; macOS: the window that took the
  │  press): pulled out, a tab is a window of its own following the
  │  pointer with its page re-parented; over any strip it goes in there,
  │  and a window left without tabs closes
  ├ DevTools protocol on a pipe (fds 3/4, `--remote-debugging-pipe`), no port
  │   held by the relay only; agents (`redrob-browser tab`, MCP) reach it there
  └ CEF subprocesses: renderer, GPU, utility = the same executable
     (macOS: "Redrob Browser Helper*.app" bundles)

redrob-browser (CLI, MCP, headless serve)  -> Obscura engine, unchanged
```

The window's contract with the engine stays `cdp::Op` in, `cdp::Update` out
(`crates/redrob-shell/src/cdp.rs`). The CEF backend answers it. Events that
only existed because our engine lacked features (scene channel, wheel answer,
media element bridge, MSE, DRM tab, our own DevTools panel, highlight overlay)
go away: Chromium scrolls, plays media and has its own DevTools.

Nothing egui draws can cover a page: it is a window of its own. So what
floats over the page in Chrome is a small window here too (popup.rs: the
address-bar suggestions, menus, the page's context menu, the permission
prompt, the zoom badge, tooltips, the link under the pointer), and what
Chrome shows as a bar (the find bar, page dialogs, downloads) sits above or
below the page and the page shrinks for it.

Keyboard: a click in the page gives Chromium the keyboard; a click in the
chrome, Ctrl+L or F6 take it back, Escape or Enter in the address bar
return it. Window shortcuts (Ctrl+T/W/N/L/Tab, Ctrl+F, Ctrl+P, zoom, F5,
F12, Alt+Left/Right) are taken from egui while the chrome has the
keyboard and in `KeyboardHandler::on_pre_key_event` while a page has it.

Linux specifics:
- The window runs on X11 (winit's X11 backend, XWayland under Wayland) and
  Chromium with `--ozone-platform=x11`: its pages are X11 child windows.
- Chromium runs its own glib message loop, not CEF's external pump: that
  pump returns from nested run loops (drag and drop) within 10 ms.
  `cef::pump` runs the loop until idle; cef/wake.rs wakes the window when
  glib's descriptors (Chromium's wakeup pipe, its X11 and D-Bus
  connections) have work.
- The chrome has the keyboard through a focus window (cef/xdnd.rs): with
  the browser window itself focused, X reports keys to the page under the
  pointer. winit is patched to stay active meanwhile (vendor/winit).
- Pages use GTK's input method module (fcitx5, IBus) like Chrome; the
  address bar talks to fcitx5 over D-Bus (ime.rs), including the 한/영 and
  한자 keys egui cannot carry.
- One Xlib error handler serves the process: winit's ignores errors from
  Chromium's connections.

`crates/redrob-shell/src/cef/mod.rs` defines `Sink`: CEF callbacks report
`cdp::Event`s for a CEF browser id; the sink maps it to the window `TabId`.

## Pages as Chrome windows (Linux, Windows; macOS opt-in)

CEF makes a Chrome style page created inside a parent window
(`WindowInfo::set_as_child`) a popup-type Chrome browser without Chrome's
toolbar. Chrome keeps the extensions' toolbar container in that toolbar, and
everything that runs an extension's action as a click (and so grants it
`activeTab`) goes through the container: `Extensions.triggerAction` crashes
Chromium without one. So each page is created differently
(`cef/host.rs`):

- a CEF Views `BrowserView` whose delegate asks for Chrome's normal toolbar
  (`CEF_CTT_NORMAL`; the browser is still TYPE_POPUP, but CEF builds the
  toolbar with its extensions container), hidden as soon as it exists;
- in a frameless top-level CEF window of its own (one Chrome style
  BrowserView per CEF window), whose native window is re-parented into the
  browser window's page area before it is first shown, as a window manager
  moves a window into its frame. From then on native.rs places, shows, hides
  and re-parents it like a child page;
- pages a page opens come through the opener view's delegate
  (`get_delegate_for_popup_browser_view`), DevTools too (a framed window of
  their own).

What the window does for it:

- A click on an extension's icon asks Chrome over the relay's DevTools
  connection to run the action (`Extensions.triggerAction` on the page's
  "tab" target, found by its Chrome window): Chrome grants `activeTab` and
  runs `onClicked`. For an action with a popup Chrome draws no popup of its
  own (its toolbar is not on screen) and the window opens it as before. CEF's
  own DevTools sessions are refused the method ("Method not allowed").
- Linux: Chromium counts such a page active, and gives it keys, only while its own
  window has the X input focus; it asks the window manager for that with
  `_NET_ACTIVE_WINDOW`, which ignores a window inside another. So the page
  on screen gets `XSetInputFocus` when it takes the keyboard (cdp.rs
  `page_focused`).
- Chrome closing such a page itself (an agent's `Target.closeTarget`) calls
  no `do_close`; the window learns of it in `on_before_close`.

Windows (native.rs `embed`; written from Chromium 156 and CEF cf671c0
sources, not yet run on Windows):

- The Views window's HWND (`CefWindow::GetWindowHandle`) gets `WS_CHILD`,
  loses its caption, frame and taskbar styles, and `SetParent` puts it in
  the browser window before it is first shown, as CEF does for its own
  child windows (chrome_child_window.cc: `params.child`, `WS_EX_NOACTIVATE`
  around the first `Show` so a background tab does not bring the window
  forward).
- Chromium handles `WM_ACTIVATE` only for a top-level window
  (`HWNDMessageHandler::IsTopLevelWindow` reads `WS_CHILD`), and CEF's
  patch that activates a child window on focus applies only to windows it
  made a child itself (`has_external_parent_`). Without activation the
  page gets no characters and TSF ignores it. A subclass in front of
  Chromium's window procedure sends it `WM_ACTIVATE` on `WM_SETFOCUS` and
  `WM_KILLFOCUS`, `WS_CHILD` lifted for that one message; a mouse button
  press gives the page `SetFocus`, as CEF's patch does; hit tests are
  always `HTCLIENT`, so the page's edge never resizes it.
- Scale: a child window never gets `WM_DPICHANGED`. The page is sent one
  (the browser window's DPI, `GetDpiForWindow`, and the page's rectangle in
  its parent) when it is embedded and whenever the window's scale changes,
  per-monitor DPI v2 as the rest of the process.
- Moves: a child window gets no `WM_MOVE` when its parent moves; pages on
  screen that moved are sent one (Chromium updates its screen position)
  and `NotifyMoveOrResizeStarted` (popups close).
- Fullscreen: Chrome sizes a fullscreen page's window to the screen in
  screen coordinates; the window puts it back over the page area
  (`on_window_fullscreen_transition`), fullscreen there, as on Linux.

macOS (`REDROB_MAC_HOSTED=1`, off by default until it runs on a Mac): CEF
refuses Chrome style for a page inside a parent NSView
(`CefBrowserCreateParams::MaybeSetWindowInfo`, browser_host_create.cc,
issue #3294) but not for a Views window of its own. Moving that window's
content view into ours is not possible: it is Chromium's
`BridgedContentView`, bound to its own `NativeWidgetMacNSWindow` (events,
key status, the compositor). So the page's NSWindow (borderless, no
shadow, `FullScreenAuxiliary`) is kept over the page area as a child
window of the browser window (`addChildWindow:ordered:`): it moves,
minimizes and changes spaces with it; it is ordered in while its tab is on
screen and out otherwise, placed in screen points. A child window covers
every view of its parent, so an extension's popup (an Alloy NSView) is
lifted into a borderless child window of its own, in front of the pages.
A click in the page makes its window key, so the browser window's title
bar shows as inactive meanwhile. These pages are Chrome style; other
views inside the window (extension popups) stay Alloy.

`REDROB_CHILD_PAGES=1` keeps child pages everywhere.

## Agents

The relay (`relay.rs`) holds the only connection to Chromium's DevTools protocol:
`cef::reserve_devtools_pipe` puts a pipe pair on fds 3 and 4 before anything else opens a
file, Chromium runs with `--remote-debugging-pipe` and no port, and `relay::start` gives each
client its own browser session on that pipe (`Target.attachToBrowserTarget`). Nothing on the
machine can reach Chromium except through the relay, which checks the peer, `Host`, `Origin`
and a secret in its address (written owner-only to `ws-endpoint`). On Windows, libcef's own C
runtime cannot see our fds 3 and 4, so the window makes two anonymous pipes and passes
Chromium's ends as `--remote-debugging-io-pipes=<read>,<write>` (handle values; Chromium maps
them with `_open_osfhandle`). The relay checks the pipe with `Browser.getVersion`; a pipe that
stays silent while Chromium runs is remembered (`devtools-pipe-failed` in the profile's
Chromium folder) and the next start uses a random loopback port. The log names the transport.

The window answers `Target.createTarget`, `activateTarget` and `closeTarget` for its tabs
(`relay::TabRequest`; CEF's own `createTarget` would open a Chrome-style window outside ours):
an agent tab opens in the focused window, behind the person's tab when `background` is set,
and the reply carries its target id once Chromium has one. The window fills `relay::Places`
by target id so `Target.getTargets` shows `redrobWindow`, `redrobAgent` and `redrobActive`.

## Profiles

- One `RequestContext` per profile with `cache_path` = the profile's data dir
  (`profile.rs`), so cookies, localStorage, IndexedDB and the HTTP cache
  persist like Chrome's.
- Incognito: a `RequestContext` with an empty `cache_path` (memory only).
- Import from Chrome (`import_chrome.rs`): write cookies through
  `CookieManager::set_cookie`; history and bookmarks stay in our model.

## Work split

| Part | Branch | Owns |
|---|---|---|
| C1 core | `feat/cef-core` | `cef/mod.rs`, `cef/app.rs`, `cef/client.rs`, `cef/native.rs`, `cef/keys.rs`, `cef/wake.rs`, `cef/xdnd.rs`, `popup.rs`, `cdp.rs`, `engine.rs`, `browser.rs`, `main.rs`, removing the Obscura scene path from the window |
| C2 agents | `feat/cef-agent` | `relay.rs`, `agent_bridge.rs`, `instance.rs`, the CLI `tab` command and MCP window bridge in `obscura-cli` / `obscura-mcp` |
| C3 features | `feat/cef-features` | `cef/handlers/*.rs`, `profile.rs`, `import_chrome.rs`, `vault.rs` |
| C4 packaging | `feat/cef-package` | `.github/workflows/release.yml`, `installer/`, `scripts/`, `self_update.rs`, `updater.rs`, `NOTICE`, `docs/RELEASE.md` |

C1 wires the handlers C3 writes: each `cef/handlers/<name>.rs` exposes
`pub fn new(sink: super::super::Sink, ...) -> cef::<Name>Handler` and C1's
client returns it from `get_<name>_handler`.

## Risks

- Size: the release archive grows by about 100 MB per platform.
- Codecs: CEF's prebuilt binaries leave out H.264 and AAC. YouTube serves
  VP9/AV1 with Opus. Widevine needs the CDM component: Windows and macOS
  ask the component updater at start; on Linux the window points Chromium
  at a CDM already on the machine (Google Chrome's, or one Chrome or
  Chromium downloaded) and otherwise plays protected media from the start
  after the updater's download (cef/handlers/widevine.rs).
- macOS: every helper app is signed and notarized with the main app.
