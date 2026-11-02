//! The window's engine contract, answered by Chromium (CEF).
//!
//! Windows send [`Command`]s; [`process`] runs them on the window thread
//! against each tab's CEF browser, and CEF's handlers (cef/client.rs) send
//! page changes back as [`Update`]s tagged with the tab. Agents and
//! `redrob-browser tab ...` reach the same tabs through Chromium's DevTools
//! protocol, behind the window's relay ([`relay`]).

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::time::Duration;

use cef::{Browser, CefString, ImplBrowser, ImplBrowserHost, ImplFrame, Registration};
use serde_json::json;
use tokio::sync::mpsc;

use crate::cef::client::{self, TabCtx, LOGIN_BINDING, WORLD};
use crate::cef::native::{self, Handle, Place};
use crate::cef::Sink;
use crate::model::TabId;

/// Finds the sign-in form on the page and types into it. The values arrive
/// as call arguments, never inside the script text.
const FILL_LOGIN_JS: &str = r#"function (username, password) {
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const pw = [...document.querySelectorAll('input[type=password]')].find(visible);
  if (!pw) return 'no-form';
  const scope = pw.form || document;
  const fields = [...scope.querySelectorAll('input')].filter(visible);
  const before = fields.slice(0, fields.indexOf(pw)).reverse();
  const user = before.find((e) => /^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username');
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (user && username) set(user, username);
  set(pw, password);
  pw.focus();
  return 'filled';
}"#;

/// Runs in every document, in the window's own world: when a form with a
/// filled password field is submitted, or a button next to one is clicked,
/// report the sign-in to the window so it can offer to save it. The page
/// cannot see the binding, which is the only channel.
const LOGIN_SUBMIT_JS: &str = r#"(() => {
  if (typeof redrobLoginSubmit !== 'function') return;
  let last = '';
  const report = (scope) => {
    const pw = [...(scope || document).querySelectorAll('input[type=password]')].find((e) => e.value);
    if (!pw) return;
    const fields = [...(pw.form || document).querySelectorAll('input')];
    const before = fields.slice(0, fields.indexOf(pw)).reverse();
    const user = before.find((e) => e.value && (/^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username'));
    const key = (user ? user.value : '') + '\u0000' + pw.value;
    if (key === last) return;
    last = key;
    redrobLoginSubmit(JSON.stringify({ origin: location.origin, username: user ? user.value : '', password: pw.value }));
  };
  addEventListener('submit', (e) => report(e.target), true);
  addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type=submit]');
    if (b) report(b.form || document);
  }, true);
})();"#;

pub enum Op {
    Open(String),
    Close,
    /// This tab is now the one on screen in the window that sent it.
    Activate,
    Navigate(String),
    Back,
    Forward,
    Reload,
    Stop,
    /// Give the page the keyboard, or take it away.
    Focus(bool),
    /// An agent works in this tab: out of sight it keeps running and
    /// drawing (Chromium answers a hidden page's screenshot only now and
    /// then), as the agent's own screen.
    Agent,
    /// Chromium's developer tools for this tab, in their own window.
    DevTools,
    /// Type a saved login into the page's sign-in form.
    FillLogin {
        username: String,
        password: zeroize::Zeroizing<String>,
    },
    /// Find `text` in the page; `next` continues the search it started.
    /// Answered with `Event::FindResult` (cef/handlers/find.rs).
    Find {
        text: String,
        forward: bool,
        match_case: bool,
        next: bool,
    },
    /// Close find: clear the highlight, keep the selection.
    StopFind,
    /// Ctrl +, Ctrl -, Ctrl 0. The level is remembered for the site.
    Zoom(crate::cef::handlers::zoom::Step),
    Print,
    /// Run extension `id`'s toolbar action on this tab's page: its popup
    /// page (`popup`) opens over the page under `anchor`, the icon's
    /// rectangle in physical pixels of the window; without one its
    /// `onClicked` listeners run (cef/handlers/extensions.rs).
    Extension {
        id: String,
        popup: Option<String>,
        anchor: [i32; 4],
    },
    /// Close the extension popup over this tab, if one is open.
    ClosePopup,
    /// What the page info bubble shows: answered with `Event::SiteInfo`.
    SiteInfo,
    /// Delete the cookies and stored data of this site (`origin`).
    ClearSiteData(String),
    /// Reading mode on or off (cef/handlers/reader.rs).
    Reader,
}

/// The browser window a command came from. A tab belongs to the window that
/// last opened or activated it, so a tab moved to another window keeps its
/// browser, page, history and form state.
pub type WindowId = u64;

/// A window's way to the engine: every command it sends carries its id.
#[derive(Clone)]
pub struct Commands {
    pub window: WindowId,
    pub tx: mpsc::UnboundedSender<(WindowId, Command)>,
}

impl Commands {
    pub fn send(&self, cmd: Command) -> Result<(), mpsc::error::SendError<(WindowId, Command)>> {
        self.tx.send((self.window, cmd))
    }
}

pub enum Command {
    Tab(TabId, Op),
    /// The page area of the window that sent it: its native window, the
    /// rectangle in physical pixels from that window's top-left, the scale,
    /// and whether a page shows there (the window draws its own pages, the
    /// new tab page and settings, in the same place).
    Place {
        place: Place,
        visible: bool,
    },
    /// The window's own controls take the keyboard from the page.
    FocusWindow,
    /// The window is about to close: its pages leave it first, so none is
    /// left inside a destroyed native window.
    Detach,
}

pub enum Event {
    /// A different document.
    Navigated(String),
    /// Same document, new URL (fragment or history API).
    UrlChanged(String),
    Title(String),
    Loading(bool),
    /// The page opened a new window; show it as a new tab next to its opener.
    Opened {
        url: String,
        opener: Option<TabId>,
        /// Opened behind the current tab (a middle click on a link).
        background: bool,
    },
    /// The page closed itself (`window.close()`), or its browser went away.
    Closed,
    /// The person signed in on a page; the window may offer to save it.
    LoginSubmitted {
        origin: String,
        username: String,
        password: zeroize::Zeroizing<String>,
    },
    /// The tab's DevTools target id, once it is known.
    Target(String),
    /// Result of FillLogin: "filled" or "no-form".
    Filled(String),
    /// A page asks for camera, microphone, location, notifications or the
    /// clipboard; the window asks the person (cef/handlers/permission.rs).
    Permission(crate::cef::handlers::permission::Prompt),
    /// alert, confirm, prompt or "leave this page?" (cef/handlers/jsdialog.rs).
    Dialog(crate::cef::handlers::jsdialog::Dialog),
    /// The page's context menu, for the window to draw.
    ContextMenu(crate::cef::handlers::context_menu::Menu),
    /// Matches for `Op::Find`: how many, which one is selected (1-based).
    FindResult {
        count: i32,
        active: i32,
    },
    /// The page's zoom changed, in percent.
    Zoom(u32),
    /// Put this text on the clipboard ("Copy link address").
    Clipboard(String),
    /// Open this address in a new tab behind the current one.
    OpenTab(String),
    /// Open this address in a new tab in front (a page Chrome opened by
    /// itself). Sent with tab 0.
    ShowTab(String),
    /// The page opened a link of a scheme only another program handles
    /// (mailto:, tel:): ask before handing it over (cef/handlers/external.rs).
    External {
        origin: String,
        url: String,
    },
    /// A file download began or changed state. Sent with tab 0.
    Download {
        guid: String,
        url: String,
        filename: String,
        state: String,
        path: String,
        bytes: u64,
    },
    /// A window shortcut pressed while the page had the keyboard
    /// (cef/keys.rs).
    Shortcut(crate::cef::keys::Shortcut),
    /// The page took the keyboard (a click in it, or the window gave it).
    Focused,
    /// Tab or Shift+Tab past the page's last or first field.
    TakeFocus,
    /// The link under the pointer, for the status bubble.
    Status(Option<String>),
    /// The page's connection and certificate (`Op::SiteInfo`).
    SiteInfo(crate::cef::handlers::site_info::SiteInfo),
    /// The extension popup over this tab closed (`window.close()`, or the
    /// window closed it).
    PopupClosed,
    /// An extension's toolbar badge changed (cef/handlers/extensions.rs).
    /// Sent with tab 0.
    Badges,
    Error(String),
}

pub struct Update {
    pub tab: TabId,
    pub event: Event,
}

struct Tab {
    browser: Browser,
    _devtools: Option<Registration>,
    /// The page's native window.
    native: Option<Handle>,
    /// Where it is now, and whether it is shown.
    at: Option<(Place, bool)>,
}

/// Every tab's CEF browser. Lives on the window thread, where CEF runs.
struct Engine {
    sink: Sink,
    tabs: HashMap<TabId, Tab>,
    /// Tabs asked for whose browser CEF has not created yet: their address,
    /// and ops that came meanwhile.
    opening: HashMap<TabId, (String, Vec<Op>)>,
    /// Tabs waiting for their window's native handle before CEF can make
    /// their page.
    unplaced: HashMap<TabId, String>,
    /// Browsers asked to close and not closed yet.
    closing: HashSet<TabId>,
    /// The tab on screen in each window.
    active: HashMap<WindowId, TabId>,
    /// Each window's page area, and whether a page shows there.
    places: HashMap<WindowId, (Place, bool)>,
    /// Which window shows each tab.
    tab_window: HashMap<TabId, WindowId>,
    /// Agent tabs (`Op::Agent`).
    agents: HashSet<TabId>,
    /// The extension popup open over a tab, at most one.
    popup: Option<Popup>,
}

/// An extension's popup page: a page of its own over the page it acts on,
/// right-aligned under the toolbar icon that opened it, as big as what it
/// draws (Chrome's limits: 25 x 25 to 800 x 600 points).
struct Popup {
    tab: TabId,
    /// The tab it acts on.
    page: TabId,
    window: WindowId,
    anchor: [i32; 4],
    url: String,
    place: Place,
    browser: Option<Browser>,
    native: Option<Handle>,
    _devtools: Option<Registration>,
    /// Its `chrome.tabs` fix (`extensions::popup_script`), run when its page
    /// stops before its first script.
    script: Option<String>,
}

impl Popup {
    /// Where a popup `w` x `h` (physical pixels) sits: under the icon, its
    /// right edge at the icon's, inside the page area.
    fn rect(&self, area: [i32; 4], w: i32, h: i32) -> [i32; 4] {
        let [ax, ay, aw, ah] = self.anchor;
        let [px, py, pw, ph] = area;
        let w = w.min(pw).max(1);
        let h = h.min(ph).max(1);
        let x = (ax + aw - w).clamp(px, (px + pw - w).max(px));
        let y = (ay + ah + 2).max(py);
        [x, y, w, h]
    }
}

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
}

/// Start answering commands.
pub fn init(sink: Sink) {
    ENGINE.with_borrow_mut(|e| {
        *e = Some(Engine {
            sink,
            tabs: HashMap::new(),
            opening: HashMap::new(),
            unplaced: HashMap::new(),
            closing: HashSet::new(),
            active: HashMap::new(),
            places: HashMap::new(),
            tab_window: HashMap::new(),
            agents: HashSet::new(),
            popup: None,
        })
    });
}

/// Let CEF work, adopt the browsers it created and run every queued
/// command.
pub fn process(commands: &mut mpsc::UnboundedReceiver<(WindowId, Command)>) {
    crate::cef::pump();
    loop {
        let created = client::take_created();
        let closed = client::take_closed();
        let resized = client::take_resized();
        let paused = client::take_paused();
        let escaped = client::take_popup_escaped();
        let focused = client::take_focused();
        let replied = client::run_replies();
        let cmd = commands.try_recv().ok();
        if created.is_empty()
            && focused.is_empty()
            && closed.is_empty()
            && resized.is_empty()
            && paused.is_empty()
            && !escaped
            && cmd.is_none()
            && !replied
        {
            break;
        }
        ENGINE.with_borrow_mut(|e| {
            let Some(e) = e.as_mut() else { return };
            for c in created {
                e.adopt(c);
            }
            for (tab, w, h) in resized {
                e.resize_popup(tab, w, h);
            }
            for tab in focused {
                e.page_focused(tab);
            }
            for tab in paused {
                e.popup_paused(tab);
            }
            if escaped {
                if let Some(page) = e.popup.as_ref().map(|p| p.page) {
                    e.close_popup();
                    e.sink.send_tab(page, Event::PopupClosed);
                }
            }
            for tab in closed {
                if e.popup.as_ref().is_some_and(|p| p.tab == tab) {
                    client::set_popup_browser(0);
                    if let Some(p) = e.popup.take() {
                        e.sink.send_tab(p.page, Event::PopupClosed);
                    }
                }
                e.closing.remove(&tab);
                if e.tabs.remove(&tab).is_some() {
                    e.tab_window.remove(&tab);
                    e.active.retain(|_, t| *t != tab);
                }
            }
        });
        // Ops for a tab still being created wait for it; the rest run now,
        // outside the engine borrow (a CEF call may run callbacks).
        if let Some((window, cmd)) = cmd {
            run(window, cmd);
        }
    }
}

/// Close every browser and wait (pumping) until CEF has, at most `limit`.
pub fn close_all(limit: Duration) {
    let browsers: Vec<Browser> = ENGINE.with_borrow_mut(|e| {
        let Some(e) = e.as_mut() else {
            return Vec::new();
        };
        e.opening.clear();
        e.unplaced.clear();
        let ids: Vec<TabId> = e.tabs.keys().copied().collect();
        e.closing.extend(ids);
        let popup = e.popup.take().and_then(|p| {
            e.closing.insert(p.tab);
            p.browser
        });
        e.tabs
            .drain()
            .map(|(_, t)| t.browser)
            .chain(popup)
            .collect()
    });
    for b in &browsers {
        if let Some(h) = b.host() {
            h.close_browser(1);
        }
    }
    let deadline = std::time::Instant::now() + limit;
    while std::time::Instant::now() < deadline {
        crate::cef::pump();
        let created = client::take_created();
        for c in created {
            if let Some(h) = c.browser.host() {
                h.close_browser(1);
            }
            ENGINE.with_borrow_mut(|e| {
                if let Some(e) = e.as_mut() {
                    e.closing.insert(c.tab);
                }
            });
        }
        let closed = client::take_closed();
        let left = ENGINE.with_borrow_mut(|e| {
            let Some(e) = e.as_mut() else { return 0 };
            for t in closed {
                e.closing.remove(&t);
            }
            e.closing.len()
        });
        if left == 0 {
            break;
        }
        std::thread::sleep(Duration::from_millis(10));
    }
    ENGINE.with_borrow_mut(|e| *e = None);
}

impl Engine {
    fn adopt(&mut self, c: client::Created) {
        if self.popup.as_ref().is_some_and(|p| p.tab == c.tab) {
            self.adopt_popup(c);
            return;
        }
        let browser = c.browser.clone();
        let devtools = c.observe();
        // A page another page opened lives in its opener's window.
        if !self.tab_window.contains_key(&c.tab) {
            let parent = client::place_of(c.tab).map(|p| p.parent);
            let window = self
                .places
                .iter()
                .find(|(_, (p, _))| Some(p.parent) == parent)
                .map(|(w, _)| *w);
            if let Some(w) = window {
                self.tab_window.insert(c.tab, w);
            }
        }
        let native = native::of(&browser);
        // Where CEF made it: hidden unless it is its window's tab on screen.
        let at = client::place_of(c.tab).map(|p| (p, false));
        self.tabs.insert(
            c.tab,
            Tab {
                browser: c.browser,
                _devtools: devtools,
                native,
                at,
            },
        );
        let (url, ops) = self.opening.remove(&c.tab).unwrap_or_default();
        // The window's own script world: sign-ins report there, out of the
        // page's reach. Then the address, once that is in place.
        let sink = self.sink.clone();
        let tab = c.tab;
        client::devtools_send(&browser, "Page.enable", json!({}));
        client::devtools_send(
            &browser,
            "Runtime.addBinding",
            json!({ "name": LOGIN_BINDING, "executionContextName": WORLD }),
        );
        client::devtools_send(
            &browser,
            "Page.addScriptToEvaluateOnNewDocument",
            json!({ "source": LOGIN_SUBMIT_JS, "worldName": WORLD, "runImmediately": true }),
        );
        // Its Chrome window, for its extensions' badges.
        client::devtools(
            &browser,
            "Browser.getWindowForTarget",
            json!({}),
            move |_, r| {
                if let Some(w) = r["windowId"].as_i64() {
                    crate::cef::handlers::extensions::set_window(tab, w);
                }
            },
        );
        let b = browser.clone();
        client::devtools(&browser, "Target.getTargetInfo", json!({}), move |_, r| {
            if let Some(id) = r["targetInfo"]["targetId"].as_str() {
                crate::cef::note_target(id, b.identifier());
                sink.send_tab(tab, Event::Target(id.to_string()));
            }
            if !url.is_empty() && url != "about:blank" {
                if let Some(f) = b.main_frame() {
                    f.load_url(Some(&CefString::from(url.as_str())));
                }
            }
        });
        // Created shown or hidden; make it match its window now.
        let shown = self.shown(tab);
        if let Some(t) = self.tabs.get_mut(&tab) {
            if let Some((p, _)) = t.at {
                t.at = Some((p, !shown));
            }
        }
        let window = self.tab_window.get(&tab).copied().unwrap_or(0);
        self.sync_window(window);
        for op in ops {
            self.handle(window, tab, op);
        }
    }

    /// `tab`'s page took the keyboard (a click in it). A page hosted as a
    /// Chrome window of its own (cef/host.rs) counts as active, and takes
    /// keys, only while its own native window has the X input focus:
    /// Chromium asks the window manager for that, which ignores a window
    /// inside another. So the page on screen gets it here, as the window
    /// manager would give it.
    fn page_focused(&mut self, tab: TabId) {
        if !crate::cef::host::enabled() || !self.shown(tab) {
            return;
        }
        if let Some(child) = self.tabs.get(&tab).and_then(|t| t.native) {
            native::focus(child);
        }
    }

    /// Whether `tab` is the page on screen in its window.
    fn shown(&self, tab: TabId) -> bool {
        let Some(w) = self.tab_window.get(&tab) else {
            return false;
        };
        self.active.get(w) == Some(&tab) && self.places.get(w).is_some_and(|(_, v)| *v)
    }

    /// Put the tab's page where its window wants it: in that window, over
    /// its page area, shown only while it is the tab on screen.
    fn sync(&mut self, tab: TabId) {
        let shown = self.shown(tab);
        let place = self
            .tab_window
            .get(&tab)
            .and_then(|w| self.places.get(w))
            .map(|(p, _)| *p);
        let Some(t) = self.tabs.get_mut(&tab) else {
            return;
        };
        let Some(child) = t.native else {
            return;
        };
        let Some(place) = place else {
            // Its window has no native handle yet (a tab moving to a new
            // window): out of sight until it has.
            if let Some((p, true)) = t.at {
                native::set_visible(child, false, None);
                t.at = Some((p, false));
            }
            return;
        };
        let before = t.at;
        if before == Some((place, shown)) {
            return;
        }
        trace(format_args!(
            "tab {tab}: {:?} -> {:?} shown {shown} (window {:#x})",
            before.map(|(p, s)| (p.rect, s)),
            place.rect,
            child.0
        ));
        if before.is_some_and(|(p, _)| p.parent != place.parent) {
            native::reparent(child, place);
        }
        match (before.map(|(_, s)| s), shown) {
            (Some(true), true) => native::place(child, place),
            (_, true) => native::set_visible(child, true, Some(place)),
            (Some(false), false) => {}
            (_, false) => {
                native::set_visible(child, false, None);
                #[cfg(target_os = "linux")]
                if self.agents.contains(&tab) {
                    native::set_page_hidden(child, false);
                }
            }
        }
        // No `was_hidden` (it is for off-screen pages): Chromium follows its
        // window being shown or hidden, and a hidden page still answers an
        // agent's screenshot, which `was_hidden` would leave waiting.
        let host = t.browser.host();
        if let Some(h) = &host {
            if before.is_some_and(|(p, _)| p.scale != place.scale) {
                h.notify_screen_info_changed();
            }
            if shown {
                h.was_resized();
            }
        }
        t.at = Some((place, shown));
        client::set_place(tab, Some(place));
    }

    fn sync_window(&mut self, window: WindowId) {
        let tabs: Vec<TabId> = self
            .tab_window
            .iter()
            .filter(|(_, w)| **w == window)
            .map(|(t, _)| *t)
            .collect();
        // Hide first, then show: two pages never cover each other.
        let (on, off): (Vec<TabId>, Vec<TabId>) = tabs.into_iter().partition(|t| self.shown(*t));
        #[cfg(target_os = "linux")]
        let first = on.first().copied();
        for t in off.into_iter().chain(on) {
            self.sync(t);
        }
        #[cfg(target_os = "linux")]
        let page = first
            .and_then(|t| self.tabs.get(&t))
            .and_then(|t| Some((t.native?, t.at?.0.rect)));
        // Drops over the page go to the page on screen, the rest to the
        // window's chrome (cef/xdnd.rs).
        #[cfg(target_os = "linux")]
        if let Some((p, _)) = self.places.get(&window) {
            crate::cef::xdnd::set_target(p.parent, page);
        }
    }

    fn set_place(&mut self, window: WindowId, place: Place, visible: bool) {
        if self.places.get(&window) == Some(&(place, visible)) {
            return;
        }
        self.places.insert(window, (place, visible));
        // Tabs that waited for the window's handle get their pages now.
        let waiting: Vec<TabId> = self
            .unplaced
            .keys()
            .copied()
            .filter(|t| self.tab_window.get(t) == Some(&window))
            .collect();
        for tab in waiting {
            if let Some(url) = self.unplaced.remove(&tab) {
                self.create(tab, url);
            }
        }
        self.sync_window(window);
    }

    fn open(&mut self, window: WindowId, tab: TabId, url: String) {
        self.tab_window.insert(tab, window);
        self.opening.insert(tab, (url.clone(), Vec::new()));
        if self.places.contains_key(&window) {
            self.create(tab, url);
        } else {
            self.unplaced.insert(tab, url);
        }
    }

    /// Ask CEF for the tab's browser; `adopt` takes it once it exists.
    fn create(&mut self, tab: TabId, _url: String) {
        let Some((place, _)) = self
            .tab_window
            .get(&tab)
            .and_then(|w| self.places.get(w))
            .copied()
        else {
            return;
        };
        let shown = self.shown(tab);
        let mut client = client::new(TabCtx {
            tab,
            sink: self.sink.clone(),
        });
        client::set_place(tab, Some(place));
        let info = native::child_info(place, shown);
        let settings = client::browser_settings();
        let mut context = crate::cef::request_context();
        // The page loads its address once the window's scripts are in
        // place (adopt), so it starts blank.
        let ok = if crate::cef::host::enabled() {
            crate::cef::host::create(
                tab,
                place,
                &mut client,
                "about:blank",
                &settings,
                context.as_mut(),
            )
        } else {
            cef::browser_host_create_browser(
                Some(&info),
                Some(&mut client),
                Some(&CefString::from("about:blank")),
                Some(&settings),
                None,
                context.as_mut(),
            ) == 1
        };
        if !ok {
            self.opening.remove(&tab);
            client::set_place(tab, None);
            self.sink.send_tab(
                tab,
                Event::Error("Chromium could not open the tab".to_string()),
            );
        }
    }

    /// The window `window` goes away: its pages move out of it first.
    fn detach(&mut self, window: WindowId) {
        let tabs: Vec<TabId> = self
            .tab_window
            .iter()
            .filter(|(_, w)| **w == window)
            .map(|(t, _)| *t)
            .collect();
        for tab in tabs {
            if let Some(t) = self.tabs.get_mut(&tab) {
                if let Some(child) = t.native {
                    native::set_visible(child, false, None);
                    native::detach(child);
                }
                t.at = None;
            }
        }
        #[cfg(target_os = "linux")]
        if let Some((p, _)) = self.places.get(&window) {
            crate::cef::xdnd::forget(p.parent);
        }
        self.places.remove(&window);
        self.active.remove(&window);
    }

    fn handle(&mut self, window: WindowId, tab: TabId, op: Op) {
        if let Op::Open(url) = op {
            self.open(window, tab, url);
            return;
        }
        // Activate is the window's, not the page's: it may move the tab to
        // another window before its page exists.
        if let Op::Activate = op {
            self.activate(window, tab);
            if self.tabs.contains_key(&tab) {
                return;
            }
        }
        if let Op::Agent = op {
            self.agents.insert(tab);
            // Out of sight now: shown to Chromium again.
            #[cfg(target_os = "linux")]
            if let Some(t) = self
                .tabs
                .get(&tab)
                .filter(|t| t.at.is_some_and(|(_, s)| !s))
            {
                if let Some(child) = t.native {
                    native::set_page_hidden(child, false);
                }
            }
            return;
        }
        if let Some((_, waiting)) = self.opening.get_mut(&tab) {
            if !matches!(op, Op::Activate) {
                waiting.push(op);
            }
            return;
        }
        if let Op::Close = op {
            self.agents.remove(&tab);
            // Never created (its window had no handle yet).
            if self.unplaced.remove(&tab).is_some() {
                self.tab_window.remove(&tab);
                self.active.retain(|_, t| *t != tab);
                return;
            }
        }
        if let Op::ClosePopup = op {
            if self.popup.as_ref().is_some_and(|p| p.page == tab) {
                self.close_popup();
            }
            return;
        }
        let Some(browser) = self.tabs.get(&tab).map(|t| t.browser.clone()) else {
            return;
        };
        match op {
            Op::Open(_) | Op::Activate | Op::Agent | Op::ClosePopup => {}
            Op::Extension {
                id, popup: None, ..
            } => {
                self.close_popup();
                crate::cef::handlers::extensions::run_action(&browser, &id);
            }
            Op::Extension {
                id,
                popup: Some(url),
                anchor,
            } => {
                crate::cef::handlers::extensions::prepare_popup(&browser, &id);
                self.open_popup(window, tab, url, anchor);
            }
            Op::SiteInfo => {
                let info = crate::cef::handlers::site_info::of(&browser);
                trace(format_args!("tab {tab}: site info {info:?}"));
                self.sink.send_tab(tab, Event::SiteInfo(info));
            }
            Op::ClearSiteData(origin) => client::devtools_send(
                &browser,
                "Storage.clearDataForOrigin",
                json!({ "origin": origin, "storageTypes": "all" }),
            ),
            Op::Close => {
                if self.popup.as_ref().is_some_and(|p| p.page == tab) {
                    self.close_popup();
                }
                if let Some(t) = self.tabs.remove(&tab) {
                    // Out of sight at once; Chromium destroys it later.
                    if let Some(child) = t.native {
                        native::set_visible(child, false, None);
                    }
                }
                self.closing.insert(tab);
                self.tab_window.remove(&tab);
                self.active.retain(|_, t| *t != tab);
                if let Some(h) = browser.host() {
                    h.close_browser(1);
                }
            }
            Op::Focus(true) => {
                trace(format_args!("focus page {tab}"));
                if let Some(child) = self.tabs.get(&tab).and_then(|t| t.native) {
                    native::focus(child);
                }
                if let Some(h) = browser.host() {
                    h.set_focus(1);
                }
            }
            Op::Focus(false) => {
                if let Some(h) = browser.host() {
                    h.set_focus(0);
                }
            }
            Op::Navigate(url) => {
                self.sink.send_tab(tab, Event::Loading(true));
                if let Some(f) = browser.main_frame() {
                    f.load_url(Some(&CefString::from(url.as_str())));
                }
            }
            Op::Back => browser.go_back(),
            Op::Forward => browser.go_forward(),
            Op::Reload => {
                self.sink.send_tab(tab, Event::Loading(true));
                browser.reload();
            }
            Op::Stop => {
                browser.stop_load();
                self.sink.send_tab(tab, Event::Loading(false));
            }
            Op::DevTools => crate::cef::handlers::context_menu::inspect(&browser, None),
            Op::FillLogin { username, password } => {
                let sink = self.sink.clone();
                let b = browser.clone();
                client::devtools(
                    &browser,
                    "Runtime.evaluate",
                    json!({ "expression": "document" }),
                    move |_, doc| {
                        let Some(object_id) = doc["result"]["objectId"].as_str() else {
                            sink.send_tab(tab, Event::Filled("no-form".to_string()));
                            return;
                        };
                        let args = json!([{ "value": username }, { "value": password.as_str() }]);
                        let sink2 = sink.clone();
                        client::devtools(
                            &b,
                            "Runtime.callFunctionOn",
                            json!({ "objectId": object_id, "functionDeclaration": FILL_LOGIN_JS, "arguments": args, "returnByValue": true }),
                            move |_, r| {
                                let outcome = r["result"]["value"]
                                    .as_str()
                                    .unwrap_or("no-form")
                                    .to_string();
                                sink2.send_tab(tab, Event::Filled(outcome));
                            },
                        );
                    },
                );
            }
            op => crate::cef::handlers::run_op(&self.sink, &browser, op),
        }
    }

    /// Open extension popup `url` over `page`, under `anchor`.
    fn open_popup(&mut self, window: WindowId, page: TabId, url: String, anchor: [i32; 4]) {
        self.close_popup();
        let Some((area, _)) = self.places.get(&window).copied() else {
            return;
        };
        let tab = client::next_popup_tab();
        let mut popup = Popup {
            tab,
            page,
            window,
            anchor,
            url,
            place: area,
            browser: None,
            native: None,
            _devtools: None,
            script: None,
        };
        // Small until it says how big it is (`on_auto_resize`).
        let s = area.scale.max(0.1);
        let rect = popup.rect(area.rect, (64.0 * s) as i32, (32.0 * s) as i32);
        popup.place = Place { rect, ..area };
        client::set_place(tab, Some(popup.place));
        let mut c = client::new(TabCtx {
            tab,
            sink: self.sink.clone(),
        });
        // Alloy style: a Chrome style page would be a Chrome window of its
        // own, the one Chrome then calls "last focused", and an extension's
        // background would act on the popup instead of the page.
        let mut info = native::child_info(popup.place, true);
        info.runtime_style = cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_ALLOY.into();
        let settings = client::browser_settings();
        let mut context = crate::cef::request_context();
        let ok = cef::browser_host_create_browser(
            Some(&info),
            Some(&mut c),
            Some(&CefString::from("about:blank")),
            Some(&settings),
            None,
            context.as_mut(),
        ) == 1;
        if ok {
            self.popup = Some(popup);
        } else {
            client::set_place(tab, None);
            self.sink.send_tab(page, Event::PopupClosed);
        }
    }

    /// The popup's browser exists: over the page, with the keyboard, its
    /// window script in place, then its page.
    fn adopt_popup(&mut self, c: client::Created) {
        let devtools = c.observe();
        let page = self
            .popup
            .as_ref()
            .and_then(|p| self.tabs.get(&p.page))
            .map(|t| t.browser.clone());
        let Some(p) = self.popup.as_mut() else { return };
        let browser = c.browser.clone();
        p.native = native::of(&browser);
        p.browser = Some(browser.clone());
        client::set_popup_browser(browser.identifier());
        p._devtools = devtools;
        if let Some(n) = p.native {
            native::raise(n);
            native::focus(n);
        }
        if let Some(h) = browser.host() {
            h.set_auto_resize_enabled(
                1,
                Some(&cef::Size {
                    width: 25,
                    height: 25,
                }),
                Some(&cef::Size {
                    width: 800,
                    height: 600,
                }),
            );
            h.set_focus(1);
        }
        let url = p.url.clone();
        let load = move |b: &Browser| {
            if let Some(f) = b.main_frame() {
                f.load_url(Some(&CefString::from(url.as_str())));
            }
        };
        let Some(page) = page else {
            load(&browser);
            return;
        };
        let b = browser.clone();
        let tab = c.tab;
        client::devtools(
            &page,
            "Browser.getWindowForTarget",
            json!({}),
            move |_, r| {
                let Some(w) = r["windowId"].as_i64() else {
                    load(&b);
                    return;
                };
                // Stop before the popup's first script: the fix goes in there
                // (`popup_paused`). A script added for new documents does not
                // run in an extension's pages.
                ENGINE.with_borrow_mut(|e| {
                    if let Some(p) = e.as_mut().and_then(|e| e.popup.as_mut()) {
                        if p.tab == tab {
                            p.script = Some(crate::cef::handlers::extensions::popup_script(w));
                        }
                    }
                });
                client::devtools_send(&b, "Debugger.enable", json!({}));
                let b2 = b.clone();
                client::devtools(
                    &b,
                    "DOMDebugger.setInstrumentationBreakpoint",
                    json!({ "eventName": "scriptFirstStatement" }),
                    move |_, _| load(&b2),
                );
            },
        );
    }

    /// The popup's page stopped before its first script: fix `chrome.tabs`
    /// there, then let it run.
    fn popup_paused(&mut self, tab: TabId) {
        let Some(p) = self.popup.as_mut().filter(|p| p.tab == tab) else {
            return;
        };
        let Some(b) = p.browser.clone() else { return };
        if let Some(script) = p.script.take() {
            client::devtools_send(&b, "Runtime.evaluate", json!({ "expression": script }));
            client::devtools_send(
                &b,
                "DOMDebugger.removeInstrumentationBreakpoint",
                json!({ "eventName": "scriptFirstStatement" }),
            );
        }
        client::devtools_send(&b, "Debugger.resume", json!({}));
        if p.script.is_none() {
            client::devtools_send(&b, "Debugger.disable", json!({}));
        }
    }

    /// The popup asked for `w` x `h` points.
    fn resize_popup(&mut self, tab: TabId, w: i32, h: i32) {
        let Some(p) = self.popup.as_mut().filter(|p| p.tab == tab) else {
            return;
        };
        let Some((area, _)) = self.places.get(&p.window).copied() else {
            return;
        };
        let s = area.scale.max(0.1);
        let rect = p.rect(
            area.rect,
            (w as f32 * s).round() as i32,
            (h as f32 * s).round() as i32,
        );
        p.place = Place { rect, ..area };
        client::set_place(tab, Some(p.place));
        if let Some(n) = p.native {
            native::place(n, p.place);
            native::raise(n);
        }
        if let Some(h) = p.browser.as_ref().and_then(|b| b.host()) {
            h.was_resized();
        }
    }

    /// Close the extension popup, if one is open. Not reported: the window
    /// asked for it, or opened another popup in its place.
    fn close_popup(&mut self) {
        let Some(p) = self.popup.take() else { return };
        client::set_popup_browser(0);
        if let Some(n) = p.native {
            native::set_visible(n, false, None);
        }
        if let Some(h) = p.browser.as_ref().and_then(|b| b.host()) {
            self.closing.insert(p.tab);
            h.close_browser(1);
        }
    }

    /// `tab` is now the page on screen in `window`, which may take it from
    /// another window.
    fn activate(&mut self, window: WindowId, tab: TabId) {
        let before = self.tab_window.insert(tab, window);
        let prev = self.active.insert(window, tab).filter(|p| *p != tab);
        // A tab handed to another window leaves the old one's screen.
        if let Some(old) = before.filter(|w| *w != window) {
            if self.active.get(&old) == Some(&tab) {
                self.active.remove(&old);
            }
            // Its page has not been made yet: it is made in this window.
            if self.unplaced.contains_key(&tab) && self.places.contains_key(&window) {
                if let Some(url) = self.unplaced.remove(&tab) {
                    self.create(tab, url);
                }
            }
        }
        if let Some(p) = prev {
            if let Some(h) = self.tabs.get(&p).and_then(|t| t.browser.host()) {
                h.set_focus(0);
            }
            self.sync(p);
        }
        self.sync_window(window);
        // The window it left loses its page on screen.
        if let Some(old) = before.filter(|w| *w != window) {
            self.sync_window(old);
        }
        self.sync(tab);
    }
}

/// `REDROB_TRACE=1`: what the engine does with pages and the keyboard.
pub fn trace(what: std::fmt::Arguments<'_>) {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    if *ON.get_or_init(|| std::env::var_os("REDROB_TRACE").is_some()) {
        eprintln!("redrob-browser: {what}");
    }
}

fn run(window: WindowId, cmd: Command) {
    // Take the engine out while a command runs: CEF calls made for it may
    // run callbacks that look at it.
    let Some(mut e) = ENGINE.with_borrow_mut(|e| e.take()) else {
        return;
    };
    match cmd {
        Command::Place { place, visible } => e.set_place(window, place, visible),
        Command::FocusWindow => {
            trace(format_args!("focus window {window}"));
            if let Some(tab) = e.active.get(&window).copied() {
                if let Some(h) = e.tabs.get(&tab).and_then(|t| t.browser.host()) {
                    h.set_focus(0);
                }
            }
            if let Some((p, _)) = e.places.get(&window) {
                native::focus_chrome(p.parent);
            }
        }
        Command::Detach => e.detach(window),
        Command::Tab(tab, op) => e.handle(window, tab, op),
    }
    ENGINE.with_borrow_mut(|slot| {
        if slot.is_none() {
            *slot = Some(e);
        }
    });
}

/// The agents' door: the window's relay in front of Chromium's DevTools
/// server. Writes the relay address to `endpoint_file` once it listens.
pub async fn relay(
    endpoint_file: std::path::PathBuf,
    window: crate::relay::Window,
) -> anyhow::Result<()> {
    let devtools = loop {
        if let Some(d) = crate::cef::take_devtools() {
            break d;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    let relay_url = crate::relay::start(devtools.into(), window).await?;
    crate::write_private(&endpoint_file, &relay_url);
    // The relay's tasks live on this runtime: keep it for the process.
    std::future::pending::<()>().await;
    Ok(())
}
