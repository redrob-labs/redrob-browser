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
use crate::cef::input::{self, Button, Edit, Ime, KeyKind, MouseKind};
use crate::cef::osr::{self, SharedView};
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
    Mouse {
        kind: MouseKind,
        x: f32,
        y: f32,
        button: Button,
        clicks: u32,
        /// CEF event flags (cef/input.rs).
        modifiers: u32,
    },
    Wheel {
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        modifiers: u32,
    },
    Key {
        kind: KeyKind,
        windows_key_code: i32,
        native_key_code: i32,
        character: u16,
        modifiers: u32,
    },
    /// Typed characters.
    Text(String),
    /// Input method composition.
    Ime(Ime),
    /// An editing command (macOS takes these from the menu, not keys).
    Edit(Edit),
    /// The page area gained or lost keyboard focus.
    Focus(bool),
    /// Files from the desktop over the page (`drop`: let go).
    DropFiles {
        x: f32,
        y: f32,
        files: Vec<std::path::PathBuf>,
        drop: bool,
    },
    /// Files dragged over the page left it.
    DragLeave,
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
    /// The page area of the window that sent it: CSS pixels, the device
    /// scale factor and its top-left on screen.
    Resize {
        width: u32,
        height: u32,
        scale: f32,
        origin: (i32, i32),
    },
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
    FindResult { count: i32, active: i32 },
    /// The page's zoom changed, in percent.
    Zoom(u32),
    /// Put this text on the clipboard ("Copy link address").
    Clipboard(String),
    /// Open this address in a new tab behind the current one.
    OpenTab(String),
    /// A file download began or changed state. Sent with tab 0.
    Download {
        guid: String,
        url: String,
        filename: String,
        state: String,
        path: String,
        bytes: u64,
    },
    Error(String),
}

pub struct Update {
    pub tab: TabId,
    pub event: Event,
}

struct Tab {
    browser: Browser,
    _devtools: Option<Registration>,
}

/// Every tab's CEF browser. Lives on the window thread, where CEF runs.
struct Engine {
    sink: Sink,
    gpu: Option<osr::Gpu>,
    shared_texture: bool,
    tabs: HashMap<TabId, Tab>,
    /// Tabs asked for whose browser CEF has not created yet: their address,
    /// and ops that came meanwhile.
    opening: HashMap<TabId, (String, Vec<Op>)>,
    views: HashMap<TabId, SharedView>,
    /// Browsers asked to close and not closed yet.
    closing: HashSet<TabId>,
    /// The tab on screen in each window.
    active: HashMap<WindowId, TabId>,
    /// Each window's page area.
    sizes: HashMap<WindowId, (u32, u32, f32, (i32, i32))>,
    /// Which window shows each tab.
    tab_window: HashMap<TabId, WindowId>,
}

thread_local! {
    static ENGINE: RefCell<Option<Engine>> = const { RefCell::new(None) };
}

/// Start answering commands. `gpu`: the window's device, when CEF may
/// hand frames as textures it can import (`shared_texture`).
pub fn init(sink: Sink, gpu: Option<osr::Gpu>, shared_texture: bool) {
    ENGINE.with_borrow_mut(|e| {
        *e = Some(Engine {
            sink,
            gpu,
            shared_texture,
            tabs: HashMap::new(),
            opening: HashMap::new(),
            views: HashMap::new(),
            closing: HashSet::new(),
            active: HashMap::new(),
            sizes: HashMap::new(),
            tab_window: HashMap::new(),
        })
    });
}

/// A tab's page, for the window to draw.
pub fn view(tab: TabId) -> Option<SharedView> {
    ENGINE.with_borrow(|e| e.as_ref()?.views.get(&tab).cloned())
}

/// Let CEF work, adopt the browsers it created and run every queued
/// command. Returns the tabs whose browser closed, to free their textures.
pub fn process(commands: &mut mpsc::UnboundedReceiver<(WindowId, Command)>) -> Vec<TabId> {
    crate::cef::pump();
    let mut gone = Vec::new();
    loop {
        let created = client::take_created();
        let closed = client::take_closed();
        let replied = client::run_replies();
        let cmd = commands.try_recv().ok();
        if created.is_empty() && closed.is_empty() && cmd.is_none() && !replied {
            break;
        }
        ENGINE.with_borrow_mut(|e| {
            let Some(e) = e.as_mut() else { return };
            for c in created {
                e.adopt(c);
            }
            for tab in closed {
                gone.push(tab);
                e.closing.remove(&tab);
                e.views.remove(&tab);
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
    gone
}

/// Close every browser and wait (pumping) until CEF has, at most `limit`.
pub fn close_all(limit: Duration) {
    let browsers: Vec<Browser> = ENGINE.with_borrow_mut(|e| {
        let Some(e) = e.as_mut() else {
            return Vec::new();
        };
        e.opening.clear();
        let ids: Vec<TabId> = e.tabs.keys().copied().collect();
        e.closing.extend(ids);
        e.tabs.drain().map(|(_, t)| t.browser).collect()
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
    fn size_of(&self, tab: TabId) -> (u32, u32, f32, (i32, i32)) {
        self.tab_window
            .get(&tab)
            .and_then(|w| self.sizes.get(w))
            .or_else(|| self.sizes.values().next())
            .copied()
            .unwrap_or((1280, 800, 1.0, (0, 0)))
    }

    fn adopt(&mut self, c: client::Created) {
        let browser = c.browser.clone();
        let devtools = c.observe();
        self.views.insert(c.tab, c.ctx.view.clone());
        self.tabs.insert(
            c.tab,
            Tab {
                browser: c.browser,
                _devtools: devtools,
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
        let b = browser.clone();
        client::devtools(&browser, "Target.getTargetInfo", json!({}), move |_, r| {
            if let Some(id) = r["targetInfo"]["targetId"].as_str() {
                sink.send_tab(tab, Event::Target(id.to_string()));
            }
            if !url.is_empty() && url != "about:blank" {
                if let Some(f) = b.main_frame() {
                    f.load_url(Some(&CefString::from(url.as_str())));
                }
            }
        });
        // A tab is hidden until its window shows it.
        let shown = self.active.values().any(|t| *t == tab);
        if let Some(h) = browser.host() {
            h.was_hidden((!shown) as _);
        }
        let window = self.tab_window.get(&tab).copied().unwrap_or(0);
        for op in ops {
            self.handle(window, tab, op);
        }
    }

    fn resize(&mut self, window: WindowId, size: (u32, u32, f32, (i32, i32))) {
        if self.sizes.get(&window) == Some(&size) {
            return;
        }
        self.sizes.insert(window, size);
        let tabs: Vec<TabId> = self
            .tab_window
            .iter()
            .filter(|(_, w)| **w == window)
            .map(|(t, _)| *t)
            .collect();
        for tab in tabs {
            self.fit(tab);
        }
    }

    /// Give the tab its window's page size.
    fn fit(&mut self, tab: TabId) {
        let (w, h, scale, origin) = self.size_of(tab);
        let Some(view) = self.views.get(&tab) else {
            return;
        };
        let (resized, rescaled) = {
            let mut v = osr::lock(view);
            let resized = (v.width, v.height) != (w, h);
            let rescaled = v.scale != scale;
            v.width = w;
            v.height = h;
            v.scale = scale;
            v.origin = origin;
            (resized, rescaled)
        };
        if let Some(host) = self.tabs.get(&tab).and_then(|t| t.browser.host()) {
            if rescaled {
                host.notify_screen_info_changed();
            }
            if resized || rescaled {
                host.was_resized();
            }
        }
    }

    fn open(&mut self, window: WindowId, tab: TabId, url: String) {
        self.tab_window.insert(tab, window);
        let view = SharedView::default();
        {
            let (w, h, scale, origin) = self.size_of(tab);
            let mut v = osr::lock(&view);
            v.width = w;
            v.height = h;
            v.scale = scale;
            v.origin = origin;
        }
        self.views.insert(tab, view.clone());
        self.opening.insert(tab, (url, Vec::new()));
        let shared_texture = self.shared_texture && !osr::import_failed();
        let mut client = client::new(TabCtx {
            tab,
            sink: self.sink.clone(),
            view,
            gpu: self.gpu.clone().filter(|_| shared_texture),
        });
        let info = client::window_info(shared_texture);
        let settings = client::browser_settings();
        let mut context = crate::cef::request_context();
        // The page loads its address once the window's scripts are in
        // place (adopt), so it starts blank.
        let created = cef::browser_host_create_browser(
            Some(&info),
            Some(&mut client),
            Some(&CefString::from("about:blank")),
            Some(&settings),
            None,
            context.as_mut(),
        );
        if created != 1 {
            self.opening.remove(&tab);
            self.views.remove(&tab);
            self.sink.send_tab(
                tab,
                Event::Error("Chromium could not open the tab".to_string()),
            );
        }
    }

    fn handle(&mut self, window: WindowId, tab: TabId, op: Op) {
        if let Op::Open(url) = op {
            self.open(window, tab, url);
            return;
        }
        if let Some((_, waiting)) = self.opening.get_mut(&tab) {
            waiting.push(op);
            return;
        }
        let Some(browser) = self.tabs.get(&tab).map(|t| t.browser.clone()) else {
            return;
        };
        match op {
            Op::Open(_) => {}
            Op::Close => {
                self.tabs.remove(&tab);
                self.closing.insert(tab);
                self.tab_window.remove(&tab);
                self.active.retain(|_, t| *t != tab);
                if let Some(h) = browser.host() {
                    h.close_browser(1);
                }
            }
            Op::Activate => {
                let before = self.tab_window.insert(tab, window);
                if let Some(prev) = self.active.insert(window, tab).filter(|p| *p != tab) {
                    if let Some(h) = self.tabs.get(&prev).and_then(|t| t.browser.host()) {
                        h.set_focus(0);
                        h.was_hidden(1);
                    }
                }
                // A tab handed to another window leaves the old one's screen.
                if let Some(old) = before.filter(|w| *w != window) {
                    if self.active.get(&old) == Some(&tab) {
                        self.active.remove(&old);
                    }
                }
                self.fit(tab);
                if let Some(h) = browser.host() {
                    h.was_hidden(0);
                    h.invalidate(cef::sys::cef_paint_element_type_t::PET_VIEW.into());
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
            Op::DevTools => {
                if let Some(h) = browser.host() {
                    let info = cef::WindowInfo {
                        bounds: cef::Rect {
                            x: 0,
                            y: 0,
                            width: 1100,
                            height: 760,
                        },
                        window_name: CefString::from("Redrob Browser DevTools"),
                        // Chrome style: CEF refuses Alloy for DevTools windows.
                        runtime_style: cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_CHROME
                            .into(),
                        ..Default::default()
                    };
                    let mut client = client::devtools_client();
                    h.show_dev_tools(
                        Some(&info),
                        Some(&mut client),
                        Some(&cef::BrowserSettings::default()),
                        None,
                    );
                }
            }
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
            op if crate::cef::handlers::is_feature(&op) => {
                crate::cef::handlers::run_op(&self.sink, &browser, op)
            }
            other => input::apply(&browser, other),
        }
    }
}

fn run(window: WindowId, cmd: Command) {
    // Take the engine out while a command runs: CEF calls made for it may
    // run callbacks that look at it (view sizes, created browsers).
    let Some(mut e) = ENGINE.with_borrow_mut(|e| e.take()) else {
        return;
    };
    match cmd {
        Command::Resize {
            width,
            height,
            scale,
            origin,
        } => e.resize(window, (width, height, scale, origin)),
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
