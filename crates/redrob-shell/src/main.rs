//! Redrob Browser window.
//!
//! Tabs, a toolbar with back, forward, reload, an address field with
//! suggestions and a bookmarks bar. Every tab is a Chromium page (CEF,
//! docs/CEF.md) in a native child window placed over the page area; egui
//! draws the chrome around it, and what floats over the page (menus,
//! suggestions, tooltips) in small windows of its own (popup.rs).

// A GUI program on Windows: no console window behind the browser. Its errors
// go to a log file and a message box instead (startup.rs).
#![cfg_attr(windows, windows_subsystem = "windows")]

mod account;
mod agent_bridge;
mod browser;
mod bundle;
mod cdp;
mod cef;
mod i18n;
mod ime;
mod import_chrome;
mod instance;
mod internal;
mod model;
mod popup;
mod profile;
mod relay;
mod self_update;
mod startup;
mod strip;
mod theme;
mod trace;
mod updater;
mod vault;

use std::sync::mpsc;

use cdp::{Command, Event, Op, Update};
use cef::keys::Shortcut;
use egui::{Color32, CornerRadius, Key, Rect, Sense, Stroke, Vec2};
use i18n::{t, tf};
use model::{Model, SuggestionKind, Tab, TabId};
use theme::{size, Bar, Icon};

const NEW_TAB: &str = "about:blank";
/// Rows in the address bar's suggestion list, and each row's height.
const SUGGESTIONS: usize = 8;
const SUGGESTION_ROW: f32 = 34.0;

/// Put the caret of text field `id` at the end of `text`.
fn cursor_to_end(ctx: &egui::Context, id: egui::Id, text: &str) {
    if let Some(mut state) = egui::TextEdit::load_state(ctx, id) {
        let end = egui::text::CCursor::new(text.chars().count());
        state
            .cursor
            .set_char_range(Some(egui::text::CCursorRange::one(end)));
        state.store(ctx, id);
    }
}

/// `--incognito`: a private window. Its settings live in a temporary folder
/// deleted when the browser closes, and Chromium keeps its cookies and
/// storage in memory only.
const INCOGNITO_FLAG: &str = "--incognito";

fn main() -> anyhow::Result<()> {
    // Chromium's renderer, GPU and utility processes are this program.
    if let Some(code) = cef::subprocess() {
        std::process::exit(code);
    }
    // Before anything opens a file: fds 3 and 4 become Chromium's DevTools pipe.
    cef::reserve_devtools_pipe();
    startup::init();
    run().inspect_err(|e| startup::fail(e))
}

fn run() -> anyhow::Result<()> {
    let incognito = std::env::args().any(|a| a == INCOGNITO_FLAG);
    let start_url = std::env::args().skip(1).find(|a| !a.starts_with("--"));
    // One process, and so one Chromium, per profile: a later launch asks
    // the running browser for a window and exits (instance.rs).
    let paths = instance::paths(incognito);
    let _instance_lock = match instance::claim(&paths, start_url.as_deref())? {
        instance::Claim::Handed => return Ok(()),
        instance::Claim::Owner(lock) => lock,
    };
    let mut profile = match profile::Profile::open_default() {
        Ok(p) => Some(p),
        Err(e) => {
            eprintln!("redrob-browser: profile unavailable, nothing will be saved: {e}");
            None
        }
    };
    // Incognito keeps the person's language, search engine and theme, and
    // nothing else: no history, cookies, session, bookmarks or passwords.
    let incognito_dir = incognito.then(|| {
        std::env::temp_dir().join(format!("redrob-browser-incognito-{}", std::process::id()))
    });
    if let Some(dir) = &incognito_dir {
        let keep: Vec<(&str, String)> = ["language", "search_engine", "theme"]
            .into_iter()
            .filter_map(|k| profile.as_ref().and_then(|p| p.setting(k)).map(|v| (k, v)))
            .collect();
        profile = profile::Profile::open(dir).ok();
        if let Some(p) = &profile {
            for (k, v) in keep {
                let _ = p.set_setting(k, &v);
            }
            let _ = p.set_setting("update_checked", &model::now().to_string());
        }
    }
    i18n::set(i18n::detect(
        profile
            .as_ref()
            .and_then(|p| p.setting("language"))
            .as_deref(),
    ));
    if let Some(engine) = profile.as_ref().and_then(|p| p.setting("search_engine")) {
        model::set_search_engine(&engine);
    }
    // Chromium keeps its state in the profile; incognito cookies and
    // storage stay in memory.
    let root = match (&incognito_dir, &profile) {
        (Some(dir), _) => dir.join("chromium"),
        (None, Some(p)) => p.dir.join("chromium"),
        (None, None) => std::env::temp_dir().join(format!("redrob-browser-{}", std::process::id())),
    };
    let cache = (!incognito).then(|| root.join("Default"));
    // Before winit opens its input method (ime.rs).
    ime::init();
    cef::start(cef::Config { root, cache })?;
    // `redrob-browser tab ...` and agents find the relay here; cdp::relay
    // writes it once the relay is listening. Every window's tabs are on it.
    let endpoint_file = paths.endpoint.clone();
    let restore = match profile.as_ref().filter(|_| !incognito) {
        Some(p) => p.load_session().unwrap_or_else(|e| {
            eprintln!("redrob-browser: could not read the last session: {e}");
            Vec::new()
        }),
        None => Vec::new(),
    };
    let options = eframe::NativeOptions {
        viewport: browser::window_builder(
            incognito,
            restore.first().and_then(|w| w.bounds),
            restore.first().is_some_and(|w| w.maximized),
        ),
        // Linux: Chromium's pages are X11 child windows, so the window is an
        // X11 window too (XWayland under a Wayland session).
        #[cfg(target_os = "linux")]
        event_loop_builder: Some(Box::new(|b| {
            use winit::platform::x11::EventLoopBuilderExtX11 as _;
            b.with_x11();
        })),
        ..Default::default()
    };
    let start = browser::Start {
        endpoint_file: endpoint_file.clone(),
        profile,
        incognito,
        restore,
        start_url,
    };
    let result = eframe::run_native(
        "Redrob Browser",
        options,
        Box::new(move |cc| Ok(Box::new(browser::App::start(cc, start)))),
    );
    let _ = std::fs::remove_file(&endpoint_file);
    // Every page closes before Chromium stops (already done in on_exit,
    // unless eframe failed to start).
    cdp::close_all(std::time::Duration::from_secs(3));
    cef::shutdown();
    if let Some(dir) = incognito_dir {
        // Chromium has stopped; nothing of this window may stay on disk.
        let _ = std::fs::remove_dir_all(dir);
    }
    self_update::restart_if_requested();
    result.map_err(|e| anyhow::anyhow!("{e}"))
}

/// A prompt for Redrob Code: text typed after `/` (or the older `>`) in the
/// address field or the new tab page.
fn agent_prompt(text: &str) -> Option<&str> {
    let t = text.trim();
    t.strip_prefix('/')
        .or_else(|| t.strip_prefix('>'))
        .map(str::trim)
}

/// The address bar's suggestion list, as Chrome's omnibox shows it: open
/// while the person types, closed by Escape, a pick, a click elsewhere, a
/// tab switch, or the window losing the keyboard, moving or minimizing.
#[derive(Default)]
struct Suggest {
    open: bool,
    /// What the person typed: the list follows it, not the row the arrow
    /// keys put in the field.
    typed: String,
    /// The highlighted row; Enter opens it. The first row unless the arrow
    /// keys moved.
    sel: usize,
    /// The arrow keys moved the highlight (the field shows that row).
    arrowed: bool,
    /// The window's place on screen when the list opened.
    origin: Option<egui::Pos2>,
    /// The rows for `typed`, worked out once each time it changes.
    list: Vec<model::Suggestion>,
    /// What the rows come from, made when the address bar takes the
    /// keyboard and dropped when it gives it up.
    index: Option<model::SuggestIndex>,
}

impl Suggest {
    /// The list closes; the address bar may still have the keyboard.
    fn close(&mut self) {
        *self = Self {
            index: self.index.take(),
            ..Self::default()
        };
    }

    /// The rows for what was typed now.
    fn refresh(&mut self, model: &model::Model) {
        let index = self.index.get_or_insert_with(|| {
            trace::time("suggestion index", || model::SuggestIndex::new(model))
        });
        self.list = index.suggest(&self.typed, SUGGESTIONS);
    }
}

/// The window and taskbar icon, from the design system's app icon.
fn app_icon() -> egui::IconData {
    let png = include_bytes!("../assets/redrob-browser-256.png");
    match image::load_from_memory_with_format(png, image::ImageFormat::Png) {
        Ok(img) => {
            let rgba = img.to_rgba8();
            egui::IconData {
                width: rgba.width(),
                height: rgba.height(),
                rgba: rgba.into_raw(),
            }
        }
        Err(e) => {
            eprintln!("redrob-browser: app icon: {e}");
            egui::IconData::default()
        }
    }
}

/// Write a file only its owner can read: the CDP address is a key to every tab.
fn write_private(path: &std::path::Path, text: &str) {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    if let Ok(mut f) = options.open(path) {
        use std::io::Write;
        let _ = f.write_all(text.as_bytes());
    }
}

struct Window {
    commands: cdp::Commands,
    updates: mpsc::Receiver<Update>,
    model: Model,
    profile: Option<profile::Profile>,
    last_session_save: std::time::Instant,
    show_downloads: bool,
    internal: internal::State,
    vault: Option<vault::Vault>,
    /// A sign-in the person just made, waiting for "save this password?".
    pending_save: Option<(String, String, zeroize::Zeroizing<String>)>,
    agent_tx: mpsc::Sender<String>,
    agent_rx: mpsc::Receiver<String>,
    account_tx: mpsc::Sender<account::Msg>,
    account_rx: mpsc::Receiver<account::Msg>,
    update_rx: mpsc::Receiver<updater::Available>,
    login_rx: mpsc::Receiver<relay::LoginRequest>,
    /// Agent sign-ins waiting for the page's fill result, by tab.
    agent_logins:
        std::collections::HashMap<TabId, (String, tokio::sync::oneshot::Sender<serde_json::Value>)>,
    update: Option<updater::Available>,
    self_update: self_update::SelfUpdate,
    /// A one-line result shown under the toolbar, such as an import summary.
    notice: Option<String>,
    /// Address field text; follows the active tab's URL unless the person is typing.
    address: String,
    editing: bool,
    /// The address bar's suggestion list.
    suggest: Suggest,
    focus_address: bool,
    /// Give the page area keyboard focus on the next frame: after the
    /// address bar navigates, and for a tab opened on a page, as Chrome
    /// does, so scrolling keys (Page Down, Space, End) reach the page.
    focus_page: bool,
    error: Option<String>,
    /// The page area last sent to the engine.
    last_place: Option<(cef::native::Place, bool)>,
    last_title: String,
    address_id: egui::Id,
    /// Permission prompts, page dialogs, the context menu, find and zoom
    /// (cef/handlers/ui.rs).
    prompts: cef::handlers::ui::Prompts,
    /// Whether the page has the keyboard (Chromium says when it takes it;
    /// the window takes it back on a click in its chrome).
    page_focused: bool,
    /// The page took the keyboard this frame: this window is the one in front.
    took_focus: bool,
    /// Whether the window itself had the keyboard last frame.
    window_focused: bool,
    /// Whether the address bar had the keyboard last frame.
    address_focused: bool,
    /// The window is in front with its own controls (not the page) having
    /// the keyboard (browser.rs).
    chrome_keyboard: bool,
    /// Minimized: its page is hidden to Chromium (browser.rs).
    minimized: bool,
    /// Window shortcuts pressed while the page had the keyboard.
    page_shortcuts: Vec<Shortcut>,
    /// The link under the pointer in the page.
    status: Option<String>,
    /// This window's own native handle, once found (`find_native`), and the
    /// title it looks for itself by until then.
    native: Option<cef::native::Handle>,
    native_token: String,
    native_tries: u32,
    /// A private window (`--incognito`).
    incognito: bool,
    /// Which window this is, for the engine connection all windows share.
    wid: cdp::WindowId,
    /// The OS window it draws in.
    viewport: egui::ViewportId,
    /// Kept so the window is not re-created with changed attributes.
    builder: egui::ViewportBuilder,
    /// Where the browser sends this window's engine updates (browser.rs).
    inbox: mpsc::Sender<Update>,
    /// Where the browser sends agents' sign-in requests for this window's tabs.
    login_tx: mpsc::Sender<relay::LoginRequest>,
    /// What this window asks of the browser: new windows, moved tabs, quit.
    requests: Vec<browser::Request>,
    /// Outer top-left and page-area size on screen, in points.
    bounds: Option<profile::Bounds>,
    maximized: bool,
    /// Something the saved session should catch up with.
    session_dirty: bool,
    /// A tab or group drag that began in this strip, for the browser to run.
    drag_start: Option<browser::DragStart>,
    /// The drag going on in this strip (browser.rs sets it every pass).
    drag_view: Option<browser::DragView>,
    /// Where the strip and its tabs were drawn last.
    strip_layout: browser::StripLayout,
    /// The window's inner area on screen, in points.
    screen_inner: Option<Rect>,
    /// The group whose name is being typed in its chip, and the text.
    renaming: Option<(model::GroupId, String)>,
    /// The chrome takes the keyboard from the page on the next pass.
    take_keyboard: bool,
    /// Most visited sites for the new tab page, read once per new tab.
    top_sites: Option<Vec<(String, String)>>,
    new_tab_query: String,
    /// The extension whose popup is open over a tab
    /// (cef/handlers/extensions.rs).
    ext_popup: Option<(TabId, String)>,
    /// An extension icon was clicked this frame: it opened or closed the
    /// popup itself.
    ext_toggled: bool,
    /// Extension icons, by file (None: not an image).
    ext_icons: std::collections::HashMap<std::path::PathBuf, Option<egui::TextureHandle>>,
    /// When the window last asked for the installed extensions.
    ext_read_at: f64,
    /// What the page info bubble shows for a tab (`Op::SiteInfo`).
    site_info: Option<(TabId, cef::handlers::site_info::SiteInfo)>,
    /// The page info bubble shows the certificate.
    site_cert: bool,
    /// Show the bookmarks bar (the "bookmark_bar" setting), once read.
    bookmark_bar: Option<bool>,
    /// The reading list (the "reading_list" setting), once read.
    reading_list: Option<Vec<ReadingItem>>,
    /// Which of Chrome's page commands the active tab can run, as it last
    /// answered (`Op::Commands`, asked when the menu opens).
    page_commands: Option<(TabId, cdp::PageCommands)>,
}

/// A page saved to read later.
#[derive(Clone)]
struct ReadingItem {
    url: String,
    title: String,
    read: bool,
}

impl Window {
    fn op(&self, tab: TabId, op: Op) {
        let _ = self.commands.send(Command::Tab(tab, op));
    }

    fn active_id(&self) -> Option<TabId> {
        self.model.active_tab().map(|t| t.id)
    }

    /// Reopen the tabs from the last session in their order.
    fn restore(&mut self, tabs: Vec<profile::SavedTab>, active: usize, groups: Vec<model::Group>) {
        // Saved group ids are the last run's: give each a fresh one.
        let ids: std::collections::HashMap<u64, model::GroupId> = groups
            .iter()
            .map(|g| (g.id, model::alloc_group_id()))
            .collect();
        for g in groups {
            self.model.groups.push(model::Group {
                id: ids[&g.id],
                ..g
            });
        }
        for saved in tabs {
            let id = self.model.alloc_id();
            let mut tab = Tab::new(id, &saved.url);
            tab.title = saved.title;
            tab.group = saved.group.and_then(|g| ids.get(&g).copied());
            // Our own pages are drawn here; their Chromium tab waits on about:blank.
            let internal = internal::is_internal(&saved.url);
            tab.loading = !internal && saved.url != NEW_TAB;
            if internal {
                tab.title = internal::title(&saved.url).to_string();
            }
            self.model.tabs.push(tab);
            self.op(
                id,
                Op::Open(if internal {
                    NEW_TAB.to_string()
                } else {
                    saved.url
                }),
            );
        }
        self.model.prune_groups();
        if !self.model.tabs.is_empty() {
            self.model.active = active.min(self.model.tabs.len() - 1);
            // The tab on screen never hides in a collapsed group.
            if let Some(g) = self.model.tabs[self.model.active].group {
                if let Some(g) = self.model.group_mut(g) {
                    g.collapsed = false;
                }
            }
            self.activated();
        }
    }

    fn save_bookmarks(&mut self) {
        if let Some(p) = &mut self.profile {
            if let Err(e) = p.save_bookmarks(&self.model.bookmarks) {
                self.error = Some(tf("Could not save bookmarks: {0}", &[&e]));
            }
        }
    }

    /// The browser saves every window's tabs together (browser.rs).
    fn save_session(&mut self) {
        self.last_session_save = std::time::Instant::now();
        self.session_dirty = true;
    }

    /// A new tab next to the active one. A page opened from a grouped tab
    /// joins its group; a new tab page (Ctrl+T, +) goes after the group.
    fn open_tab(&mut self, url: &str, activate: bool) -> TabId {
        self.open_tab_with(url, activate, url != NEW_TAB)
    }

    fn open_tab_with(&mut self, url: &str, activate: bool, in_group: bool) -> TabId {
        let id = self.model.alloc_id();
        let mut tab = Tab::new(id, url);
        // Our own pages are drawn by the window; the Chromium tab waits on about:blank.
        let engine_url = if internal::is_internal(url) {
            tab.loading = false;
            tab.title = internal::title(url).to_string();
            NEW_TAB.to_string()
        } else {
            url.to_string()
        };
        self.model.insert_tab(tab, activate);
        if !in_group {
            if let Some(i) = self
                .model
                .index_of(id)
                .filter(|i| self.model.tabs[*i].group.is_some())
            {
                self.model.remove_from_group(i);
            }
        }
        self.op(id, Op::Open(engine_url));
        if url == NEW_TAB {
            self.top_sites = None;
        }
        if activate {
            self.activated();
            if url == NEW_TAB {
                self.focus_address = true;
            } else {
                self.focus_page = true;
            }
        }
        id
    }

    /// Open `urls` at the strip's end, the first on screen: Chrome's "Open
    /// all" for a bookmarks folder. Returns the new tabs.
    fn open_all(&mut self, urls: &[String]) -> Vec<TabId> {
        let mut ids = Vec::new();
        for (k, url) in urls.iter().enumerate() {
            let id = self.model.alloc_id();
            let mut tab = Tab::new(id, url);
            let engine_url = if internal::is_internal(url) {
                tab.loading = false;
                tab.title = internal::title(url).to_string();
                NEW_TAB.to_string()
            } else {
                url.clone()
            };
            self.model.tabs.push(tab);
            self.op(id, Op::Open(engine_url));
            if k == 0 {
                self.model.active = self.model.tabs.len() - 1;
            }
            ids.push(id);
        }
        if !ids.is_empty() {
            self.activated();
        }
        self.save_session();
        ids
    }

    /// "Open all in new group": the tabs at the strip's end, in a group
    /// named `title`.
    fn open_all_in_group(&mut self, urls: &[String], title: &str) -> Option<model::GroupId> {
        let ids = self.open_all(urls);
        self.model.group_tabs(&ids, title)
    }

    /// "Close group": its tabs close, and Ctrl+Shift+T brings the group back.
    fn close_group(&mut self, g: model::GroupId) {
        let Some(group) = self.model.group(g).cloned() else {
            return;
        };
        let Some(r) = self.model.group_range(g) else {
            return;
        };
        let mut tabs = Vec::new();
        for i in r.rev() {
            let (url, title) = {
                let t = &self.model.tabs[i];
                (t.url.clone(), t.title.clone())
            };
            if let Some(t) = self.model.take_tab(i) {
                self.prompts.close_tab(t.id);
                self.agent_logins.remove(&t.id);
                self.op(t.id, Op::Close);
            }
            tabs.push((url, title));
        }
        tabs.reverse();
        self.model.remember_closed(model::Closed::Group {
            title: group.title,
            color: group.color,
            tabs,
        });
        if self.model.tabs.is_empty() {
            self.open_tab(NEW_TAB, true);
        } else {
            self.activated();
        }
        self.save_session();
    }

    /// Click on a group's chip: collapse or expand it.
    fn toggle_group(&mut self, g: model::GroupId) {
        let collapsed = self.model.group(g).is_some_and(|x| x.collapsed);
        let had = self.active_id();
        if !self.model.set_collapsed(g, !collapsed) {
            // Every tab is in the group: Chrome opens a new tab beside it.
            let id = self.model.alloc_id();
            self.model.tabs.push(Tab::new(id, NEW_TAB));
            self.model.active = self.model.tabs.len() - 1;
            self.op(id, Op::Open(NEW_TAB.to_string()));
            self.top_sites = None;
        }
        if self.active_id() != had {
            self.activated();
        }
        self.save_session();
    }

    fn close_tab(&mut self, index: usize) {
        if let Some(id) = self.model.close_tab(index) {
            self.prompts.close_tab(id);
            self.op(id, Op::Close);
        }
        if self.model.tabs.is_empty() {
            self.open_tab(NEW_TAB, true);
        } else {
            self.activated();
        }
    }

    fn select_tab(&mut self, index: usize) {
        if index < self.model.tabs.len() && index != self.model.active {
            self.model.active = index;
            self.activated();
        }
    }

    /// The active tab changed: follow it in the address field and the engine.
    fn activated(&mut self) {
        self.editing = false;
        // The tab on screen never hides in a collapsed group.
        if let Some(g) = self.model.active_tab().and_then(|t| t.group) {
            if let Some(g) = self.model.group_mut(g) {
                g.collapsed = false;
            }
        }
        if let Some(t) = self.model.active_tab() {
            self.address = if t.url == NEW_TAB {
                String::new()
            } else {
                t.url.clone()
            };
            let id = t.id;
            let web = t.url != NEW_TAB && !internal::is_internal(&t.url);
            self.op(id, Op::Activate);
            // The tab on screen gets the keyboard, as in Chrome: its page,
            // or the address bar of a new tab.
            if web {
                self.focus_page = true;
            } else if t.url == NEW_TAB {
                self.focus_address = true;
            } else {
                // One of our own pages: the window takes the keyboard back
                // from the page that had it, which is no longer on screen,
                // so the shortcuts keep working.
                self.take_keyboard = true;
            }
        }
    }

    fn navigate(&mut self, url: String) {
        self.editing = false;
        if let Some(id) = self.active_id() {
            self.address = url.clone();
            if internal::is_internal(&url) {
                if let Some(t) = self.model.active_tab_mut() {
                    t.title = internal::title(&url).to_string();
                    t.url = url;
                    t.loading = false;
                }
                return;
            }
            // The page shows at once (a new tab page or settings make way
            // for it) and gets the keyboard, as in Chrome.
            if let Some(t) = self.model.active_tab_mut() {
                if t.url == NEW_TAB || internal::is_internal(&t.url) {
                    t.url = url.clone();
                    t.loading = true;
                }
            }
            self.focus_page = true;
            self.op(id, Op::Navigate(url));
        }
    }

    fn drain_updates(&mut self, ctx: &egui::Context) {
        while let Ok(Update { tab, event }) = self.updates.try_recv() {
            let Some(event) = self.prompts.take(ctx, tab, event) else {
                continue;
            };
            if let Event::OpenTab(url) = event {
                self.open_tab(&url, false);
                continue;
            }
            if let Event::ShowTab(url) = event {
                self.open_tab(&url, true);
                continue;
            }
            if let Event::Download {
                guid,
                url,
                filename,
                state,
                path,
                bytes,
            } = event
            {
                self.on_download(model::DownloadItem {
                    guid,
                    url,
                    filename,
                    state,
                    path,
                    bytes,
                });
                continue;
            }
            if let Event::LoginSubmitted {
                origin,
                username,
                password,
            } = event
            {
                self.offer_save(tab, origin, username, password);
                continue;
            }
            if let Event::Opened {
                url,
                opener,
                background,
            } = &event
            {
                let mut t = Tab::new(tab, url);
                t.loading = true;
                // A tab no page opened came from outside the window: an agent.
                t.agent = opener.is_none();
                if t.agent {
                    self.op(tab, Op::Agent);
                }
                // Next to its opener, as in Chrome.
                let keep = self.model.active;
                if let Some(i) = opener.and_then(|o| self.model.index_of(o)) {
                    self.model.active = i;
                }
                self.model.insert_tab(t, !*background);
                if *background {
                    self.model.active = keep.min(self.model.tabs.len() - 1);
                    if let Some(i) = self.model.index_of(tab) {
                        if i <= keep {
                            self.model.active = (keep + 1).min(self.model.tabs.len() - 1);
                        }
                    }
                } else {
                    self.activated();
                }
                continue;
            }
            if let Event::Closed = event {
                if let Some(i) = self.model.index_of(tab) {
                    self.close_tab(i);
                }
                continue;
            }
            if let Event::Badges = event {
                continue;
            }
            if let Event::PopupClosed = event {
                if self.ext_popup.as_ref().is_some_and(|(t, _)| *t == tab) {
                    self.ext_popup = None;
                }
                continue;
            }
            if let Event::SiteInfo(info) = event {
                self.site_info = Some((tab, info));
                continue;
            }
            if let Event::Commands(c) = event {
                self.page_commands = Some((tab, c));
                continue;
            }
            // Only the tab on screen can have the keyboard or the pointer,
            // and only while its page shows (not under the new tab page or
            // settings, where Chromium still focuses a page it creates).
            let on_screen = self
                .model
                .active_tab()
                .is_some_and(|t| t.id == tab && t.url != NEW_TAB && !internal::is_internal(&t.url));
            let event = match event {
                Event::Shortcut(s) => {
                    cdp::trace(format_args!("page {tab}: shortcut {s:?}"));
                    if on_screen {
                        self.page_shortcuts.push(s);
                    }
                    continue;
                }
                Event::Focused => {
                    cdp::trace(format_args!("page {tab} took the keyboard"));
                    if on_screen {
                        self.page_focused = true;
                        self.took_focus = true;
                        self.editing = false;
                        ctx.memory_mut(|m| m.surrender_focus(self.address_id));
                        // A click in the page closes what floats over it.
                        popup::close_menus(ctx);
                        self.prompts.close_menu();
                        self.close_ext_popup();
                    } else if self.model.index_of(tab).is_some() {
                        // Chromium focuses each page it makes, out of sight
                        // too (a new tab under the new tab page): the
                        // keyboard goes back where it belongs.
                        self.op(tab, Op::Focus(false));
                        let web = self.model.active_tab().filter(|t| {
                            t.id != tab && t.url != NEW_TAB && !internal::is_internal(&t.url)
                        });
                        match web.map(|t| t.id) {
                            Some(id) if self.page_focused => self.op(id, Op::Focus(true)),
                            _ => {
                                self.page_focused = false;
                                let _ = self.commands.send(Command::FocusWindow);
                            }
                        }
                    }
                    continue;
                }
                Event::TakeFocus => {
                    if on_screen {
                        self.focus_address = true;
                    }
                    continue;
                }
                Event::Status(link) => {
                    if on_screen {
                        self.status = link;
                    }
                    continue;
                }
                event => event,
            };
            let active = self.active_id() == Some(tab);
            let mut visited = None;
            let mut titled = None;
            let Some(t) = self.model.tab_mut(tab) else {
                if let Event::Error(e) = event {
                    self.error = Some(e);
                }
                continue;
            };
            match event {
                // Our own pages keep their redrob:// address while the
                // Chromium tab underneath sits on about:blank.
                Event::Navigated(url) | Event::UrlChanged(url)
                    if url == NEW_TAB && internal::is_internal(&t.url) => {}
                Event::Title(_) | Event::Loading(_) if internal::is_internal(&t.url) => {}
                Event::Navigated(url) => {
                    t.url = url.clone();
                    t.title.clear();
                    visited = Some((url, String::new()));
                }
                Event::UrlChanged(url) => {
                    t.url = url.clone();
                    visited = Some((url, t.title.clone()));
                }
                Event::Title(title) => {
                    t.title = title.clone();
                    titled = Some((t.url.clone(), title));
                }
                Event::Loading(l) => t.loading = l,
                Event::Error(e) => {
                    t.loading = false;
                    self.error = Some(e);
                }
                Event::Target(id) => t.target_id = id,
                Event::Filled(outcome) => {
                    if let Some((username, reply)) = self.agent_logins.remove(&tab) {
                        let _ = reply
                            .send(serde_json::json!({ "outcome": outcome, "username": username }));
                    } else if outcome != "filled" {
                        self.notice = Some(i18n::t("No sign-in form on this page.").to_string());
                    }
                }
                Event::Opened { .. }
                | Event::Closed
                | Event::Download { .. }
                | Event::LoginSubmitted { .. }
                | Event::Permission(_)
                | Event::Dialog(_)
                | Event::ContextMenu(_)
                | Event::FindResult { .. }
                | Event::Zoom(_)
                | Event::Clipboard(_)
                | Event::OpenTab(_)
                | Event::ShowTab(_)
                | Event::External { .. }
                | Event::Shortcut(_)
                | Event::Focused
                | Event::TakeFocus
                | Event::Status(_)
                | Event::SiteInfo(_)
                | Event::PopupClosed
                | Event::Commands(_)
                | Event::Badges => {}
            }
            let url_now = t.url.clone();
            // Blank tabs and our own pages are not history.
            let visited = visited.filter(|(u, _)| {
                u.starts_with("http://") || u.starts_with("https://") || u.starts_with("file:")
            });
            if let Some((url, title)) = visited {
                self.model.record_visit(&url, &title);
                if let Some(p) = &self.profile {
                    let _ = p.record_visit(&url, &title);
                }
            }
            if let Some((url, title)) = titled {
                self.model.set_history_title(&url, &title);
                if let Some(p) = &self.profile {
                    let _ = p.set_history_title(&url, &title);
                }
            }
            if active && !self.editing {
                self.address = if url_now == NEW_TAB {
                    String::new()
                } else {
                    url_now
                };
            }
        }
        let title = match self.model.active_tab().map(|t| t.label().to_string()) {
            Some(l) if !l.is_empty() => format!("{l} - {}", t("Redrob Browser")),
            _ => t("Redrob Browser").to_string(),
        };
        let title = if self.incognito {
            format!("{title} ({})", t("Incognito"))
        } else {
            title
        };
        // Setting the title wakes the window on X11: only when it changed,
        // and not while the window looks for itself by its title.
        if self.native.is_some() && title != self.last_title {
            self.last_title = title.clone();
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(title));
        }
    }

    /// The window's shortcuts: from egui while the chrome has the keyboard,
    /// from Chromium while the page has it (cef/keys.rs).
    fn shortcuts(&mut self, ctx: &egui::Context) {
        // The open menu's arrows and Enter first (popup::keys).
        popup::keys(ctx);
        let mut all = std::mem::take(&mut self.page_shortcuts);
        all.extend(cef::keys::from_egui(ctx));
        if ctx.input(|i| i.key_pressed(Key::Escape)) {
            all.push(Shortcut::Escape);
        }
        for s in all {
            self.shortcut(ctx, s);
        }
    }

    fn shortcut(&mut self, ctx: &egui::Context, s: Shortcut) {
        let n = self.model.tabs.len();
        let a = self.model.active;
        match s {
            Shortcut::NewTab => {
                self.open_tab(NEW_TAB, true);
            }
            Shortcut::CloseTab => self.close_tab(a),
            Shortcut::ReopenTab => {
                if let Some(c) = self.model.closed.pop() {
                    self.reopen(c);
                }
            }
            Shortcut::NewWindow => self.requests.push(browser::Request::NewWindow),
            Shortcut::NewIncognito => self.open_incognito(),
            Shortcut::Address => self.focus_address = true,
            Shortcut::Bookmark => self.toggle_bookmark(),
            Shortcut::Reload => {
                if let Some(id) = self.active_id() {
                    self.op(id, Op::Reload);
                }
            }
            // Tabs in a collapsed group are skipped, as in Chrome.
            Shortcut::NextTab if n > 1 => {
                if let Some(i) = self.model.next_shown(false) {
                    self.select_tab(i);
                }
            }
            // Ctrl+1..8: the nth tab shown in the strip; Ctrl+9: the last.
            Shortcut::SelectTab(k) => {
                let shown: Vec<usize> = (0..n).filter(|i| self.model.tab_shown(*i)).collect();
                let pick = if k >= 8 {
                    shown.last()
                } else {
                    shown.get(k as usize)
                };
                if let Some(&i) = pick {
                    self.select_tab(i);
                }
            }
            Shortcut::PrevTab if n > 1 => {
                if let Some(i) = self.model.next_shown(true) {
                    self.select_tab(i);
                }
            }
            Shortcut::Back | Shortcut::Forward => {
                if let Some(id) = self.active_id() {
                    self.op(
                        id,
                        if s == Shortcut::Back {
                            Op::Back
                        } else {
                            Op::Forward
                        },
                    );
                }
            }
            Shortcut::History => {
                self.open_tab(internal::HISTORY, true);
            }
            Shortcut::DevTools => self.devtools(),
            Shortcut::Downloads => self.show_downloads = true,
            Shortcut::Fullscreen => {
                let on = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
                ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(!on));
            }
            Shortcut::BookmarkAll => self.bookmark_all_tabs(),
            Shortcut::BookmarkBar => {
                let on = !self.bookmark_bar_shown();
                self.set_bookmark_bar(on);
            }
            Shortcut::BookmarkManager => {
                self.open_tab(internal::BOOKMARKS, true);
            }
            Shortcut::ClearData => {
                self.open_tab(internal::CLEAR_DATA, true);
            }
            Shortcut::TaskManager => self.chrome_command(cef::handlers::chrome::id::TASK_MANAGER),
            Shortcut::SavePage => self.chrome_command(cef::handlers::chrome::id::SAVE_PAGE),
            Shortcut::MoveTabLeft if a > 0 => self.model.move_tab_regroup(a, a - 1),
            Shortcut::MoveTabRight if a + 1 < n => self.model.move_tab_regroup(a, a + 1),
            Shortcut::Escape => {
                // A side menu first, as in Chrome, then the menu.
                if popup::escape(ctx) {
                    return;
                }
                popup::close_menus(ctx);
                // Escape in the address bar: its text goes back to the
                // page's address and the page gets the keyboard back.
                if self.address_focused {
                    self.address_focused = false;
                    self.editing = false;
                    ctx.memory_mut(|m| m.surrender_focus(self.address_id));
                    if let Some(t) = self.model.active_tab() {
                        let web = t.url != NEW_TAB && !internal::is_internal(&t.url);
                        self.address = if t.url == NEW_TAB {
                            String::new()
                        } else {
                            t.url.clone()
                        };
                        if web {
                            self.focus_page = true;
                        }
                    }
                }
                if let Some(id) = self.active_id() {
                    if let Some(op) = self.prompts.shortcut(s, id) {
                        self.op(id, op);
                    }
                }
            }
            _ => {
                // Find, zoom and print (cef/handlers/ui.rs).
                if let Some(id) = self.active_id() {
                    if let Some(op) = self.prompts.shortcut(s, id) {
                        self.op(id, op);
                    }
                }
            }
        }
    }

    fn on_download(&mut self, item: model::DownloadItem) {
        let finished = matches!(item.state.as_str(), "completed" | "canceled");
        let known = self.model.downloads.iter().any(|d| d.guid == item.guid);
        // A save dialog the person closed: Chrome lists nothing for it.
        if !known && item.state == "canceled" && item.path.is_empty() {
            return;
        }
        match self
            .model
            .downloads
            .iter_mut()
            .find(|d| d.guid == item.guid)
        {
            Some(d) => {
                d.state = item.state.clone();
                d.bytes = item.bytes;
                if !item.path.is_empty() {
                    d.path = item.path.clone();
                }
                if !item.filename.is_empty() {
                    d.filename = item.filename.clone();
                }
                if !item.url.is_empty() {
                    d.url = item.url.clone();
                }
            }
            None => self.model.downloads.push(item.clone()),
        }
        self.show_downloads = true;
        if finished {
            if let (Some(p), Some(d)) = (
                &self.profile,
                self.model.downloads.iter().find(|d| d.guid == item.guid),
            ) {
                let _ = p.record_download(d);
            }
        }
    }

    fn downloads_panel(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.strong(t("Downloads"));
            if ui.small_button(t("Close")).clicked() {
                self.show_downloads = false;
            }
        });
        use cef::handlers::download::{self, Action};
        for d in self.model.downloads.iter().rev().take(6) {
            ui.horizontal(|ui| {
                let state = match d.state.as_str() {
                    "completed" => t("Done"),
                    "canceled" => t("Failed"),
                    "paused" => t("Paused"),
                    _ => t("Downloading"),
                };
                ui.label(format!(
                    "{}  {}  {}",
                    d.filename,
                    state,
                    size_label(d.bytes)
                ));
                let path = std::path::Path::new(&d.path);
                match d.state.as_str() {
                    "inProgress" | "paused" => {
                        if d.state == "paused" {
                            if ui.small_button(t("Resume")).clicked() {
                                download::control(&d.guid, Action::Resume);
                            }
                        } else if ui.small_button(t("Pause")).clicked() {
                            download::control(&d.guid, Action::Pause);
                        }
                        if ui.small_button(t("Cancel")).clicked() {
                            download::control(&d.guid, Action::Cancel);
                        }
                    }
                    "completed" if !d.path.is_empty() => {
                        if ui.small_button(t("Open")).clicked() {
                            let _ = download::open(path);
                        }
                        if ui.small_button(t("Show in folder")).clicked() {
                            let _ = download::show_in_folder(path);
                        }
                    }
                    _ => {}
                }
                if !d.path.is_empty() {
                    ui.weak(&d.path);
                }
            });
        }
    }

    fn import_from(&mut self, source: &import_chrome::Source) {
        let Some(profile) = &mut self.profile else {
            self.notice = Some(t("Import needs a profile, and none could be opened.").to_string());
            return;
        };
        let scratch = profile.dir.join("import-tmp");
        let result = import_chrome::import(source, &scratch);
        let _ = std::fs::remove_dir(&scratch);
        let imported = match result {
            Ok(i) => i,
            Err(e) => {
                self.notice = Some(tf("Could not import from {0}: {1}", &[&source.name, &e]));
                return;
            }
        };
        let mut added = 0;
        for b in imported.bookmarks {
            if !self.model.bookmarks.iter().any(|x| x.url == b.url) {
                self.model.bookmarks.push(b);
                added += 1;
            }
        }
        let history = imported.history.len();
        let saved = profile
            .save_bookmarks(&self.model.bookmarks)
            .and_then(|_| profile.import_history(&imported.history));
        if let Err(e) = saved {
            self.notice = Some(tf("Could not save the import: {0}", &[&e]));
            return;
        }
        let _ = profile.load(&mut self.model);
        // Signed-in sites stay signed in: Chrome's cookies into Chromium's.
        let cookies = match import_chrome::read_cookies(source, &scratch) {
            Ok((c, _)) => cef::handlers::cookies::import(&c),
            Err(_) => 0,
        };
        let _ = std::fs::remove_dir(&scratch);
        self.notice = Some(tf(
            "Imported {0} bookmarks, {1} history entries and {2} cookies from {3}.",
            &[&added, &history, &cookies, &source.name],
        ));
    }

    /// The key button: saved logins for this site, filled by the person's click.
    fn key_button(&mut self, ui: &mut egui::Ui, url: &str) {
        let (Some(v), Some(origin)) = (&self.vault, vault::origin_of(url)) else {
            return;
        };
        let logins = v.logins_for(&origin);
        if logins.is_empty() {
            return;
        }
        let mut fill = None;
        let r = theme::icon_button(ui, Icon::Key, t("Key"));
        popup::menu(&r, 260.0, true, |ui| {
            for l in &logins {
                if ui.button(tf("Sign in as {0}", &[&l.username])).clicked() {
                    fill = Some(l.id);
                    ui.close();
                }
            }
        });
        let Some(id) = fill else { return };
        let Some(tab) = self.active_id() else { return };
        // The person's own click is also the vault unlock on platforms
        // without a device authenticator.
        if let Some(v) = &mut self.vault {
            v.unlock();
            match v.secret_for_fill(id, &origin, vault::Actor::Person) {
                Ok((username, password)) => self.op(tab, Op::FillLogin { username, password }),
                Err(e) => self.notice = Some(tf("Could not use the saved login: {0}", &[&e])),
            }
        }
    }

    /// How many buttons [`Self::extension_buttons`] draws: the pinned icons
    /// and the extensions menu.
    fn extension_buttons_count(&self) -> usize {
        let all = cef::handlers::extensions::list();
        if all.is_empty() {
            0
        } else {
            1 + all.iter().filter(|e| e.pinned).count()
        }
    }

    /// The pinned extensions' icons and the extensions menu (Chrome's
    /// puzzle piece) after the address field: Chrome style pages have no
    /// toolbar of their own to show them (cef/handlers/extensions.rs).
    fn extension_buttons(&mut self, ui: &mut egui::Ui) {
        use cef::handlers::extensions::{self, Extension};
        let now = ui.input(|i| i.time);
        if self.ext_read_at == 0.0 || now - self.ext_read_at > 2.0 {
            self.ext_read_at = now.max(0.001);
            cef::handlers::on_ui(extensions::refresh);
        }
        ui.ctx()
            .request_repaint_after(std::time::Duration::from_secs(2));
        let all = extensions::list();
        if all.is_empty() {
            return;
        }
        let mut run: Option<(Extension, Rect)> = None;
        for e in all.iter().filter(|e| e.pinned) {
            let r = self.extension_icon(ui, e);
            if r.clicked() {
                run = Some((e.clone(), r.rect));
            }
        }
        let r = theme::icon_button(ui, Icon::Plug, t("Extensions"));
        let anchor = r.rect;
        let mut pin: Option<(String, bool)> = None;
        let mut open: Option<&'static str> = None;
        popup::menu(&r, 320.0, true, |ui| {
            ui.add_space(2.0);
            ui.strong(t("Extensions"));
            for e in all.iter() {
                ui.horizontal(|ui| {
                    let tex = e.icon.as_ref().and_then(|p| self.ext_texture(ui.ctx(), p));
                    match tex {
                        Some(tex) => {
                            ui.add(egui::Image::new((tex, Vec2::splat(16.0))));
                        }
                        None => {
                            let ink = theme::palette(ui).ink_secondary;
                            ui.add(Icon::Plug.image(16.0, ink));
                        }
                    }
                    let name = ui.add(
                        egui::Button::new(theme::elide(&e.name, 32))
                            .frame(false)
                            .min_size(Vec2::new(210.0, 28.0)),
                    );
                    if name.clicked() {
                        run = Some((e.clone(), anchor));
                        ui.close();
                    }
                    let label = if e.pinned { t("Unpin") } else { t("Pin") };
                    if ui.small_button(label).clicked() {
                        pin = Some((e.id.clone(), !e.pinned));
                    }
                });
            }
            ui.separator();
            if ui
                .add(egui::Button::new(t("Manage extensions")).frame(false))
                .clicked()
            {
                open = Some("chrome://extensions/");
                ui.close();
            }
            if ui
                .add(egui::Button::new(t("Find more in the Chrome Web Store")).frame(false))
                .clicked()
            {
                open = Some("https://chromewebstore.google.com/category/extensions");
                ui.close();
            }
        });
        if let Some((id, on)) = pin {
            cef::handlers::on_ui(move || extensions::set_pinned(&id, on));
            self.ext_read_at = 0.0;
            ui.ctx()
                .request_repaint_after(std::time::Duration::from_millis(100));
        }
        if let Some(url) = open {
            self.open_tab(url, true);
        }
        if let Some((e, at)) = run {
            self.run_extension(ui.ctx(), &e, at);
        }
    }

    /// A pinned extension's toolbar button.
    fn extension_icon(
        &mut self,
        ui: &mut egui::Ui,
        e: &cef::handlers::extensions::Extension,
    ) -> egui::Response {
        let p = theme::palette(ui);
        let (rect, r) = ui.allocate_exact_size(Vec2::splat(size::CONTROL_SM), Sense::click());
        let open = self.ext_popup.as_ref().is_some_and(|(_, id)| *id == e.id);
        let fill = if r.is_pointer_button_down_on() || open {
            p.border_subtle
        } else if r.hovered() {
            p.surface_sunken
        } else {
            Color32::TRANSPARENT
        };
        ui.painter()
            .rect_filled(rect, CornerRadius::same(size::RADIUS_MD), fill);
        let icon = Rect::from_center_size(rect.center(), Vec2::splat(18.0));
        match e.icon.as_ref().and_then(|p| self.ext_texture(ui.ctx(), p)) {
            Some(tex) => {
                egui::Image::new((tex, Vec2::splat(18.0))).paint_at(ui, icon);
            }
            None => Icon::Plug.paint(ui, icon, p.ink_secondary),
        }
        let badge = self
            .active_id()
            .and_then(|t| cef::handlers::extensions::badge(&e.id, t));
        if let Some(b) = badge {
            let behind = if fill == Color32::TRANSPARENT {
                p.surface_base
            } else {
                fill
            };
            paint_badge(ui, rect, &b, p.border_subtle, behind);
        }
        popup::tip(r, &e.name)
    }

    /// The texture of an extension icon file, loaded once.
    fn ext_texture(
        &mut self,
        ctx: &egui::Context,
        path: &std::path::Path,
    ) -> Option<egui::TextureId> {
        self.ext_icons
            .entry(path.to_path_buf())
            .or_insert_with(|| {
                let img = image::load_from_memory(&std::fs::read(path).ok()?)
                    .ok()?
                    .to_rgba8();
                let size = [img.width() as usize, img.height() as usize];
                let color = egui::ColorImage::from_rgba_unmultiplied(size, img.as_raw());
                Some(ctx.load_texture(
                    format!("extension-icon:{}", path.display()),
                    color,
                    egui::TextureOptions::LINEAR,
                ))
            })
            .as_ref()
            .map(|t| t.id())
    }

    /// Run extension `e`'s action on the tab on screen; `at` is the button
    /// its popup hangs from. A second click on its icon closes the popup.
    fn run_extension(
        &mut self,
        ctx: &egui::Context,
        e: &cef::handlers::extensions::Extension,
        at: Rect,
    ) {
        let Some(tab) = self.active_id() else { return };
        self.ext_toggled = true;
        let again = self
            .ext_popup
            .as_ref()
            .is_some_and(|(t, id)| *t == tab && *id == e.id);
        self.close_ext_popup();
        if again {
            return;
        }
        let s = ctx.pixels_per_point();
        let px = |v: f32| (v * s).round() as i32;
        let anchor = [px(at.left()), px(at.top()), px(at.width()), px(at.height())];
        self.op(
            tab,
            Op::Extension {
                id: e.id.clone(),
                popup: e.popup.clone(),
                anchor,
            },
        );
        if e.popup.is_some() {
            self.ext_popup = Some((tab, e.id.clone()));
        }
    }

    fn close_ext_popup(&mut self) {
        if let Some((tab, _)) = self.ext_popup.take() {
            self.op(tab, Op::ClosePopup);
        }
    }

    /// The page info bubble: the connection, the certificate viewer, the
    /// site's permissions and data, as Chrome's from its location bar.
    fn page_info(&mut self, ui: &mut egui::Ui, url: &str) {
        let tab = self.active_id();
        let origin = vault::origin_of(url).unwrap_or_default();
        let host = url::Url::parse(url)
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
            .unwrap_or_else(|| url.to_string());
        let info = self
            .site_info
            .as_ref()
            .filter(|(t, i)| Some(*t) == tab && i.url == url)
            .map(|(_, i)| i.clone());
        let p = theme::palette(ui);
        ui.add_space(2.0);
        ui.strong(&host);
        ui.add_space(4.0);
        let Some(info) = info else {
            ui.weak(t("Loading..."));
            return;
        };
        if self.site_cert {
            if let Some(c) = &info.cert {
                self.certificate(ui, c);
            }
            return;
        }
        let https = url.starts_with("https://");
        let (icon, text) = if info.secure && !info.cert_error && !info.mixed {
            (Icon::Lock, t("Connection is secure"))
        } else if info.cert_error {
            (
                Icon::Globe,
                t("Your connection to this site is not private"),
            )
        } else if https && info.mixed {
            (Icon::Globe, t("Parts of this page are not secure"))
        } else {
            (Icon::Globe, t("Connection is not secure"))
        };
        ui.horizontal(|ui| {
            ui.add(icon.image(16.0, p.ink_secondary));
            ui.label(text);
        });
        if info.secure && !info.cert_error {
            ui.weak(t(
                "Passwords and card numbers you send to this site stay private.",
            ));
        } else {
            ui.weak(t("Do not enter passwords or card numbers on this site."));
        }
        if info.cert.is_some() {
            let label = if info.cert_error {
                t("Certificate is not valid")
            } else {
                t("Certificate is valid")
            };
            if ui.add(egui::Button::new(label).frame(false)).clicked() {
                self.site_cert = true;
            }
        }
        // The site's permissions, as the person answered them.
        let sites = &cef::handlers::features().sites;
        let saved = sites.entries(&origin, "permission.");
        if !saved.is_empty() {
            ui.separator();
            ui.strong(t("Permissions"));
            for (key, value) in saved {
                let Some(kind) = cef::handlers::permission::Kind::from_key(&key) else {
                    continue;
                };
                ui.horizontal(|ui| {
                    ui.label(cef::handlers::ui::tr(kind.label()));
                    ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                        if ui.small_button(t("Reset")).clicked() {
                            sites.set(&origin, &key, None);
                        }
                        let allowed = value == "allow";
                        let now = if allowed { t("Allowed") } else { t("Blocked") };
                        if ui.small_button(now).clicked() {
                            let next = if allowed { "block" } else { "allow" };
                            sites.set(&origin, &key, Some(next));
                        }
                    });
                });
            }
        }
        if origin.is_empty() {
            return;
        }
        ui.separator();
        if ui
            .add(egui::Button::new(t("Delete cookies and site data")).frame(false))
            .clicked()
        {
            if let Some(id) = tab {
                self.op(id, Op::ClearSiteData(origin.clone()));
            }
            self.notice = Some(tf("Deleted cookies and site data for {0}", &[&host]));
            ui.close();
        }
        if ui
            .add(egui::Button::new(t("Site settings")).frame(false))
            .clicked()
        {
            let page = format!("chrome://settings/content/siteDetails?site={origin}");
            self.open_tab(&page, true);
            ui.close();
        }
    }

    /// The certificate viewer, inside the page info bubble.
    fn certificate(&mut self, ui: &mut egui::Ui, c: &cef::handlers::site_info::Certificate) {
        let row = |ui: &mut egui::Ui, k: &str, v: &str| {
            if v.is_empty() {
                return;
            }
            ui.horizontal_wrapped(|ui| {
                ui.weak(k);
                ui.label(v);
            });
        };
        let mono = |ui: &mut egui::Ui, k: &str, v: &str| {
            ui.weak(k);
            ui.label(egui::RichText::new(v).monospace().size(10.5));
        };
        ui.strong(t("Certificate viewer"));
        ui.add_space(4.0);
        ui.label(egui::RichText::new(t("Issued to")).strong());
        row(ui, t("Common name"), &c.subject.common_name);
        row(ui, t("Organization"), &c.subject.organization);
        row(ui, t("Country"), &c.subject.country);
        ui.add_space(4.0);
        ui.label(egui::RichText::new(t("Issued by")).strong());
        row(ui, t("Common name"), &c.issuer.common_name);
        row(ui, t("Organization"), &c.issuer.organization);
        row(ui, t("Country"), &c.issuer.country);
        ui.add_space(4.0);
        ui.label(egui::RichText::new(t("Validity period")).strong());
        row(ui, t("Issued on"), &c.valid_from);
        row(ui, t("Expires on"), &c.valid_until);
        ui.add_space(4.0);
        ui.label(egui::RichText::new(t("Fingerprints")).strong());
        mono(ui, t("Serial number"), &c.serial);
        mono(ui, "SHA-256", &c.sha256);
        mono(ui, "SHA-1", &c.sha1);
        if !c.chain.is_empty() {
            ui.add_space(4.0);
            let n = c.chain.len();
            ui.label(
                egui::RichText::new(tf("Issued through {0} more certificates", &[&n])).strong(),
            );
            for (i, h) in c.chain.iter().enumerate() {
                mono(ui, &format!("{}", i + 1), h);
            }
        }
        ui.separator();
        ui.horizontal(|ui| {
            if ui.button(t("Back")).clicked() {
                self.site_cert = false;
            }
            if ui.button(t("Copy certificate")).clicked() {
                ui.ctx().copy_text(c.pem.clone());
                self.notice = Some(t("Copied the certificate (PEM).").to_string());
                ui.close();
            }
        });
    }

    /// Offer to save a sign-in, but only for the tab's own committed site: a
    /// page cannot plant a login for another origin.
    fn offer_save(
        &mut self,
        tab: TabId,
        origin: String,
        username: String,
        password: zeroize::Zeroizing<String>,
    ) {
        let Some(v) = &self.vault else { return };
        let Some(t) = self.model.tabs.iter().find(|t| t.id == tab) else {
            return;
        };
        if t.agent
            || vault::origin_of(&t.url).as_deref() != Some(origin.as_str())
            || v.never_save(&origin)
        {
            return;
        }
        self.pending_save = Some((origin, username, password));
    }

    /// An agent's sign-in request. The vault decides; the agent hears only the
    /// outcome and a username (docs/CREDENTIALS.md).
    fn agent_login(&mut self, req: relay::LoginRequest) {
        use serde_json::json;
        let Some(tab) = self
            .model
            .tabs
            .iter()
            .find(|t| t.target_id == req.target_id && !t.target_id.is_empty())
        else {
            let _ = req.reply.send(json!({ "outcome": "no-tab" }));
            return;
        };
        let (tab_id, url) = (tab.id, tab.url.clone());
        let Some(origin) = vault::origin_of(&url) else {
            let _ = req.reply.send(json!({ "outcome": "no-form" }));
            return;
        };
        let Some(v) = &self.vault else {
            let _ = req.reply.send(json!({ "outcome": "unavailable" }));
            return;
        };
        let login = match v.agent_login(&origin, req.username.as_deref()) {
            Ok(l) => l,
            Err(refusal) => {
                let outcome = match refusal {
                    vault::Refusal::Locked => "locked",
                    vault::Refusal::Blocked => "blocked",
                    vault::Refusal::Never => "never",
                    vault::Refusal::NoLogin => "no-login",
                    vault::Refusal::SeveralLogins => "several-logins",
                };
                v.audit(
                    &origin,
                    req.username.as_deref().unwrap_or(""),
                    vault::Actor::Agent,
                    outcome,
                );
                // Usernames are not secret: listing them lets the agent pick one.
                let usernames: Vec<String> = if refusal == vault::Refusal::SeveralLogins {
                    v.logins_for(&origin)
                        .into_iter()
                        .map(|l| l.username)
                        .collect()
                } else {
                    Vec::new()
                };
                let _ = req
                    .reply
                    .send(json!({ "outcome": outcome, "usernames": usernames }));
                return;
            }
        };
        match v.secret_for_fill(login.id, &origin, vault::Actor::Agent) {
            Ok((username, password)) => {
                self.agent_logins
                    .insert(tab_id, (username.clone(), req.reply));
                self.op(tab_id, Op::FillLogin { username, password });
            }
            Err(_) => {
                let _ = req.reply.send(json!({ "outcome": "failed" }));
            }
        }
    }

    fn save_bar(&mut self, ui: &mut egui::Ui) {
        let Some((origin, username, _)) = &self.pending_save else {
            return;
        };
        let exists = self
            .vault
            .as_ref()
            .is_some_and(|v| v.has_login(origin, username));
        let question = match (exists, username.is_empty()) {
            (true, true) => tf("Update the saved password on {0}?", &[origin]),
            (true, false) => tf(
                "Update the saved password for {0} on {1}?",
                &[username, origin],
            ),
            (false, true) => tf("Save the password on {0}?", &[origin]),
            (false, false) => tf("Save the password for {0} on {1}?", &[username, origin]),
        };
        let mut choice = 0;
        theme::bar(ui, Bar::Brand, |ui| {
            Icon::Key.paint(
                ui,
                Rect::from_center_size(
                    ui.cursor().left_center() + Vec2::new(8.0, 0.0),
                    Vec2::splat(16.0),
                ),
                theme::palette(ui).ink_brand,
            );
            ui.add_space(20.0);
            ui.label(question);
            if theme::button(ui, if exists { t("Update") } else { t("Save") }, true).clicked() {
                choice = 1;
            }
            if theme::button(ui, t("Not now"), false).clicked() {
                choice = 2;
            }
            if theme::button(ui, t("Never for this site"), false).clicked() {
                choice = 3;
            }
        });
        if choice == 0 {
            return;
        }
        let Some((origin, username, password)) = self.pending_save.take() else {
            return;
        };
        let Some(v) = &self.vault else { return };
        let result = match choice {
            1 => v.save(&origin, &username, &password),
            3 => v.set_never_save(&origin),
            _ => Ok(()),
        };
        if let Err(e) = result {
            self.notice = Some(tf("Could not save the password: {0}", &[&e]));
        }
    }

    fn import_passwords(
        &mut self,
        logins: anyhow::Result<Vec<import_chrome::ImportedLogin>>,
        skipped: usize,
        from: &str,
    ) {
        let Some(v) = &self.vault else {
            self.notice =
                Some(t("The password vault is not available on this system.").to_string());
            return;
        };
        match logins {
            Ok(list) => {
                let mut saved = 0;
                for (origin, username, password) in &list {
                    if v.save(origin, username, password).is_ok() {
                        saved += 1;
                    }
                }
                let extra = if skipped > 0 {
                    tf(
                        " {0} could not be opened; import a CSV export for those.",
                        &[&skipped],
                    )
                } else {
                    String::new()
                };
                self.notice = Some(format!(
                    "{}{extra}",
                    tf("Imported {0} passwords from {1}.", &[&saved, &from])
                ));
            }
            Err(e) => self.notice = Some(tf("Could not import passwords: {0}", &[&e])),
        }
    }

    /// `> ...` in the address bar: hand the prompt to Redrob Code.
    fn ask_agent(&mut self, prompt: String) {
        self.editing = false;
        if prompt.is_empty() {
            return;
        }
        let (url, title) = self
            .model
            .active_tab()
            .map(|t| (t.url.clone(), t.title.clone()))
            .unwrap_or_default();
        self.address = if url == NEW_TAB {
            String::new()
        } else {
            url.clone()
        };
        let server = self
            .profile
            .as_ref()
            .and_then(|p| p.setting("agent_server"))
            .unwrap_or_default();
        let tx = self.agent_tx.clone();
        std::thread::spawn(move || {
            let msg = match agent_bridge::send_prompt(&server, &prompt, &url, &title) {
                Ok(_) => t("Sent to Redrob Code.").to_string(),
                Err(e) => tf("Could not reach the agent: {0}", &[&e]),
            };
            let _ = tx.send(msg);
        });
        self.notice = Some(t("Sending to Redrob Code...").to_string());
    }

    /// Chromium's developer tools for the active tab, in their own window.
    fn devtools(&mut self) {
        if let Some(id) = self.active_id() {
            self.op(id, Op::DevTools);
        }
    }

    /// The ⋯ menu at the end of the toolbar, laid out as Chrome 156's:
    /// every row the same height with an icon slot, shortcuts right-aligned,
    /// and its groups' items in side menus beside it (popup::side_item).
    fn menu(&mut self, ui: &mut egui::Ui) {
        use egui::{KeyboardShortcut, Modifiers};
        use popup::{item, side_item, side_menu};
        let r = theme::icon_button(ui, Icon::More, t("Menu"));
        let ctx = ui.ctx().clone();
        let window = ctx.viewport_id();
        let keys = |m: Modifiers, k: Key| ctx.format_shortcut(&KeyboardShortcut::new(m, k));
        let cmd = Modifiers::COMMAND;
        let cmd_shift = Modifiers::COMMAND | Modifiers::SHIFT;
        let fullscreen = ctx.input(|i| i.viewport().fullscreen.unwrap_or(false));
        let active = self.active_id();
        if r.clicked() {
            // What Chrome can do on this page: its translate, cast, save and
            // QR rows show only where they work.
            if let Some(id) = active {
                self.op(id, Op::Commands);
            }
        }
        let anchor = r.rect;
        let zoom = active.map_or(100, |id| self.prompts.zoom_of(id));
        let (url, title) = self
            .model
            .active_tab()
            .map(|t| (t.url.clone(), t.title.clone()))
            .unwrap_or_default();
        let web = url != NEW_TAB && !internal::is_internal(&url) && !url.is_empty();
        let chrome = cef::native::chrome_style();
        let cmds = self
            .page_commands
            .filter(|(t, _)| Some(*t) == active)
            .map(|(_, c)| c)
            .unwrap_or_default();
        let key = |name: &str| egui::Id::new(("redrob-menu", name));
        let [passwords, history, bookmarks, groups, extensions] =
            ["passwords", "history", "bookmarks", "groups", "extensions"].map(key);
        let [find_edit, share, tools, help, bar, import, reading] = [
            "find-edit",
            "share",
            "tools",
            "help",
            "bookmark-bar",
            "import",
            "reading-list",
        ]
        .map(key);
        let signed_in = self
            .profile
            .as_ref()
            .and_then(|p| p.setting("account_email"))
            .filter(|e| !e.is_empty());
        popup::menu(&r, MENU_WIDTH, true, |ui| {
            ui.spacing_mut().item_spacing.y = 0.0;
            if item(ui, Some(Icon::Plus), t("New tab"), &keys(cmd, Key::T)).clicked() {
                self.open_tab(NEW_TAB, true);
                ui.close();
            }
            if item(ui, Some(Icon::Browser), t("New window"), &keys(cmd, Key::N)).clicked() {
                self.requests.push(browser::Request::NewWindow);
                ui.close();
            }
            if item(
                ui,
                Some(Icon::Incognito),
                t("New incognito window"),
                &keys(cmd_shift, Key::N),
            )
            .clicked()
            {
                self.open_incognito();
                ui.close();
            }
            popup::separator(ui);
            if signed_in.is_some() {
                if item(ui, Some(Icon::SignOut), t("Sign out"), "").clicked() {
                    account::sign_out();
                    if let Some(p) = &self.profile {
                        let _ = p.set_setting("account_name", "");
                        let _ = p.set_setting("account_email", "");
                    }
                    ui.close();
                }
            } else if item(ui, Some(Icon::SignIn), t("Sign in to Redrob"), "").clicked() {
                account::sign_in(self.account_tx.clone());
                ui.close();
            }
            popup::separator(ui);
            side_item(ui, passwords, Some(Icon::Key), t("Passwords and autofill"));
            side_item(ui, history, Some(Icon::History), t("History"));
            if item(ui, Some(Icon::Download), t("Downloads"), &keys(cmd, Key::J)).clicked() {
                self.show_downloads = true;
                ui.close();
            }
            side_item(
                ui,
                bookmarks,
                Some(Icon::Bookmark),
                t("Bookmarks and lists"),
            );
            side_item(ui, groups, Some(Icon::Stack), t("Tab groups"));
            side_item(ui, extensions, Some(Icon::Plug), t("Extensions"));
            if item(
                ui,
                Some(Icon::Trash),
                t("Delete browsing data..."),
                &keys(cmd_shift, Key::Delete),
            )
            .clicked()
            {
                self.open_tab(internal::CLEAR_DATA, true);
                ui.close();
            }
            popup::separator(ui);
            match zoom_row(ui, zoom, fullscreen, web) {
                Some(ZoomAction::Step(step)) => {
                    if let Some(id) = active {
                        self.op(id, Op::Zoom(step));
                    }
                }
                Some(ZoomAction::Fullscreen) => {
                    ui.ctx().send_viewport_cmd_to(
                        window,
                        egui::ViewportCommand::Fullscreen(!fullscreen),
                    );
                    ui.close();
                }
                None => {}
            }
            popup::separator(ui);
            if item(ui, Some(Icon::Print), t("Print..."), &keys(cmd, Key::P)).clicked() {
                if let Some(id) = active {
                    self.op(id, Op::Print);
                }
                ui.close();
            }
            if cmds.translate && item(ui, Some(Icon::Translate), t("Translate..."), "").clicked() {
                self.chrome_command(cef::handlers::chrome::id::SHOW_TRANSLATE);
                ui.close();
            }
            side_item(ui, find_edit, Some(Icon::Search), t("Find and edit"));
            side_item(ui, share, Some(Icon::Share), t("Cast, save, and share"));
            side_item(ui, tools, Some(Icon::Tool), t("More tools"));
            popup::separator(ui);
            side_item(ui, help, Some(Icon::Help), t("Help"));
            if item(ui, Some(Icon::Settings), t("Settings"), "").clicked() {
                self.open_tab(internal::SETTINGS, true);
                ui.close();
            }
            if item(ui, Some(Icon::Power), t("Exit"), "").clicked() {
                self.requests.push(browser::Request::Quit);
                ui.close();
            }
            popup::separator(ui);
            match &signed_in {
                Some(email) => popup::note(ui, Some(Icon::User), &tf("Signed in as {0}", &[email])),
                None => popup::note(ui, Some(Icon::User), t("Not signed in")),
            }
        });
        if !popup::any_open(&ctx) {
            return;
        }

        // The side menus, from this window's pass (popup::side_item).
        side_menu(&ctx, passwords, 260.0, |ui| {
            if item(ui, Some(Icon::Key), t("Password Manager"), "").clicked() {
                self.open_tab(internal::PASSWORDS, true);
                ui.close();
            }
            if chrome {
                if item(ui, Some(Icon::Card), t("Payment methods"), "").clicked() {
                    self.open_tab("chrome://settings/payments", true);
                    ui.close();
                }
                if item(ui, Some(Icon::Map), t("Addresses and more"), "").clicked() {
                    self.open_tab("chrome://settings/addresses", true);
                    ui.close();
                }
            }
        });
        side_menu(&ctx, history, 340.0, |ui| {
            if item(ui, Some(Icon::History), t("History"), &keys(cmd, Key::H)).clicked() {
                self.open_tab(internal::HISTORY, true);
                ui.close();
            }
            if !self.model.closed.is_empty() {
                popup::separator(ui);
                popup::note(ui, None, t("Recently closed"));
                let mut reopen = None;
                for (k, c) in self.model.closed.iter().rev().take(8).enumerate() {
                    let shortcut = if k == 0 {
                        keys(cmd_shift, Key::T)
                    } else {
                        String::new()
                    };
                    let (glyph, label) = match c {
                        model::Closed::Tab { url, title } => (
                            popup::Glyph::Icon(Icon::Globe),
                            if title.is_empty() { url } else { title }.clone(),
                        ),
                        model::Closed::Group { title, tabs, .. } => (
                            popup::Glyph::Icon(Icon::Stack),
                            tf(
                                "{0} ({1} tabs)",
                                &[
                                    &if title.is_empty() {
                                        t("Unnamed group")
                                    } else {
                                        title.as_str()
                                    },
                                    &tabs.len(),
                                ],
                            ),
                        ),
                    };
                    if item(ui, glyph, &theme::elide(&label, 40), &shortcut).clicked() {
                        reopen = Some(self.model.closed.len() - 1 - k);
                        ui.close();
                    }
                }
                if let Some(i) = reopen {
                    let c = self.model.closed.remove(i);
                    self.reopen(c);
                }
            }
            let mut recent: Vec<&model::HistoryEntry> = self.model.history.iter().collect();
            if !recent.is_empty() {
                recent.sort_unstable_by_key(|h| std::cmp::Reverse(h.last_visit));
                popup::separator(ui);
                popup::note(ui, None, t("Recent"));
                let mut go = None;
                for h in recent.iter().take(8) {
                    let label = if h.title.is_empty() { &h.url } else { &h.title };
                    if item(ui, Some(Icon::Globe), &theme::elide(label, 40), "").clicked() {
                        go = Some(h.url.clone());
                        ui.close();
                    }
                }
                if let Some(u) = go {
                    self.open_tab(&u, true);
                }
            }
        });
        let bookmarked = self.model.is_bookmarked(&url);
        side_menu(&ctx, bookmarks, 320.0, |ui| {
            let label = if bookmarked {
                t("Remove bookmark for this tab")
            } else {
                t("Bookmark this tab")
            };
            let star = if bookmarked {
                Icon::StarFilled
            } else {
                Icon::Star
            };
            if web && item(ui, Some(star), label, &keys(cmd, Key::D)).clicked() {
                self.toggle_bookmark();
                ui.close();
            }
            if item(
                ui,
                Some(Icon::FolderPlus),
                t("Bookmark all tabs"),
                &keys(cmd_shift, Key::D),
            )
            .clicked()
            {
                self.bookmark_all_tabs();
                ui.close();
            }
            popup::separator(ui);
            side_item(ui, bar, popup::Glyph::None, t("Show bookmarks bar"));
            if item(
                ui,
                Some(Icon::List),
                t("Open bookmarks manager"),
                &keys(cmd_shift, Key::O),
            )
            .clicked()
            {
                self.open_tab(internal::BOOKMARKS, true);
                ui.close();
            }
            side_item(
                ui,
                import,
                popup::Glyph::None,
                t("Import bookmarks and settings"),
            );
            popup::separator(ui);
            side_item(ui, reading, Some(Icon::Book), t("Reading list"));
            popup::separator(ui);
            popup::note(ui, None, t("Bookmarks"));
            let marks = &self.model.bookmarks;
            for f in bookmark_folders(marks)
                .iter()
                .filter(|f| folder_parent(f).is_empty())
            {
                if !model::is_other(f) {
                    side_item(ui, folder_key(f), Some(Icon::Folder), &theme::elide(f, 36));
                }
            }
            let mut go = None;
            for b in marks.iter().filter(|b| b.folder.is_empty()) {
                let label = if b.title.is_empty() { &b.url } else { &b.title };
                if item(ui, Some(Icon::Globe), &theme::elide(label, 40), "").clicked() {
                    go = Some(b.url.clone());
                    ui.close();
                }
            }
            side_item(
                ui,
                folder_key(model::OTHER),
                Some(Icon::Folder),
                t("Other bookmarks"),
            );
            if let Some(u) = go {
                self.navigate(u);
            }
        });
        side_menu(&ctx, bar, 240.0, |ui| {
            let on = self.bookmark_bar_shown();
            let flip = keys(cmd_shift, Key::B);
            for (choice, label) in [(true, t("Always")), (false, t("Never"))] {
                let shortcut = if choice == on { "" } else { flip.as_str() };
                if popup::choice_with(ui, label, choice == on, shortcut).clicked() {
                    self.set_bookmark_bar(choice);
                    ui.close();
                }
            }
        });
        side_menu(&ctx, import, 320.0, |ui| self.import_menu(ui));
        side_menu(&ctx, reading, 320.0, |ui| {
            let saved = self.reading_list().iter().any(|r| r.url == url);
            if web
                && !saved
                && item(ui, Some(Icon::Plus), t("Add tab to reading list"), "").clicked()
            {
                let entry = ReadingItem {
                    url: url.clone(),
                    title: title.clone(),
                    read: false,
                };
                self.reading_list().insert(0, entry);
                self.save_reading_list();
                ui.close();
            }
            let list = self.reading_list().clone();
            if list.is_empty() {
                popup::note(ui, None, t("Pages you save to read later show here."));
            }
            let mut go = None;
            for read in [false, true] {
                let part: Vec<&ReadingItem> = list.iter().filter(|r| r.read == read).collect();
                if part.is_empty() {
                    continue;
                }
                popup::separator(ui);
                popup::note(ui, None, if read { t("Read") } else { t("Unread") });
                for r in part {
                    let label = if r.title.is_empty() { &r.url } else { &r.title };
                    if item(ui, Some(Icon::Globe), &theme::elide(label, 40), "").clicked() {
                        go = Some(r.url.clone());
                        ui.close();
                    }
                }
            }
            if let Some(u) = go {
                for r in self.reading_list().iter_mut().filter(|r| r.url == u) {
                    r.read = true;
                }
                self.save_reading_list();
                self.navigate(u);
            }
        });
        // Every folder that is open, outermost first: each opens from a row
        // of the one before it.
        let open = popup::open_sides(&ctx);
        if !open.is_empty() {
            let marks = self.model.bookmarks.clone();
            let mut go = None;
            for f in bookmark_folders(&marks) {
                let k = folder_key(&f);
                if !open.contains(&k) {
                    continue;
                }
                side_menu(&ctx, k, 320.0, |ui| {
                    if let Some(u) = folder_side_menu(ui, &marks, &f) {
                        go = Some(u);
                    }
                });
            }
            if let Some(u) = go {
                self.navigate(u);
            }
        }
        side_menu(&ctx, groups, 300.0, |ui| {
            if item(ui, Some(Icon::Plus), t("Create new tab group"), "").clicked() {
                self.open_tab_with(NEW_TAB, true, false);
                let a = self.model.active;
                self.model.new_group(&[a]);
                self.save_session();
                ui.close();
            }
            if self.model.groups.is_empty() {
                return;
            }
            popup::separator(ui);
            let dark = ui.visuals().dark_mode;
            let mut show = None;
            for g in &self.model.groups {
                let n = self
                    .model
                    .tabs
                    .iter()
                    .filter(|t| t.group == Some(g.id))
                    .count();
                let name = if g.title.is_empty() {
                    t("Unnamed group")
                } else {
                    g.title.as_str()
                };
                let label = tf("{0} ({1} tabs)", &[&name, &n]);
                let dot = popup::Glyph::Dot(strip::group_color(g.color, dark));
                if item(ui, dot, &theme::elide(&label, 40), "").clicked() {
                    show = Some(g.id);
                    ui.close();
                }
            }
            if let Some(g) = show {
                if let Some(i) = self.model.tabs.iter().position(|t| t.group == Some(g)) {
                    if let Some(g) = self.model.group_mut(g) {
                        g.collapsed = false;
                    }
                    self.select_tab(i);
                    self.save_session();
                }
            }
        });
        side_menu(&ctx, extensions, 320.0, |ui| {
            if item(ui, Some(Icon::Plug), t("Manage extensions"), "").clicked() {
                self.open_tab("chrome://extensions/", true);
                ui.close();
            }
            if item(ui, Some(Icon::External), t("Visit Chrome Web Store"), "").clicked() {
                self.open_tab(
                    "https://chromewebstore.google.com/category/extensions",
                    true,
                );
                ui.close();
            }
            let all = cef::handlers::extensions::list();
            if all.is_empty() {
                return;
            }
            popup::separator(ui);
            let mut run = None;
            for e in all.iter() {
                let tex = e.icon.as_ref().and_then(|p| self.ext_texture(ui.ctx(), p));
                let glyph = tex.map_or(popup::Glyph::Icon(Icon::Plug), popup::Glyph::Image);
                if item(ui, glyph, &theme::elide(&e.name, 36), "").clicked() {
                    run = Some(e.clone());
                    ui.close();
                }
            }
            if let Some(e) = run {
                let ctx = ui.ctx().clone();
                self.run_extension(&ctx, &e, anchor);
            }
        });
        side_menu(&ctx, find_edit, 260.0, |ui| {
            if item(ui, Some(Icon::Search), t("Find..."), &keys(cmd, Key::F)).clicked() {
                self.page_shortcuts.push(Shortcut::Find);
                ui.close();
            }
            popup::separator(ui);
            for (glyph, label, k, e) in [
                (None, t("Cut"), Key::X, cdp::Edit::Cut),
                (Some(Icon::Copy), t("Copy"), Key::C, cdp::Edit::Copy),
                (Some(Icon::Clipboard), t("Paste"), Key::V, cdp::Edit::Paste),
            ] {
                if item(ui, glyph, label, &keys(cmd, k)).clicked() {
                    if let Some(id) = active {
                        self.op(id, Op::Edit(e));
                    }
                    ui.close();
                }
            }
        });
        side_menu(&ctx, share, 280.0, |ui| {
            if cmds.save
                && item(
                    ui,
                    Some(Icon::Save),
                    t("Save page as..."),
                    &keys(cmd, Key::S),
                )
                .clicked()
            {
                self.chrome_command(cef::handlers::chrome::id::SAVE_PAGE);
                ui.close();
            }
            // Cast and the QR code are Chrome bubbles anchored to Chrome's own
            // toolbar, which a page in this window does not have: they would
            // open nothing, so they are not offered.
            if cmds.save && web {
                popup::separator(ui);
            }
            if web && item(ui, Some(Icon::Link), t("Copy link"), "").clicked() {
                ui.ctx().copy_text(url.clone());
                self.notice = Some(t("Link copied.").to_string());
                ui.close();
            }
            if !(web || cmds.save) {
                popup::note(ui, None, t("Nothing to share on this page."));
            }
        });
        side_menu(&ctx, tools, 300.0, |ui| {
            if web && item(ui, Some(Icon::BookOpen), t("Reading mode"), "").clicked() {
                if let Some(id) = active {
                    self.op(id, Op::Reader);
                }
                ui.close();
            }
            if cmds.task_manager
                && item(
                    ui,
                    Some(Icon::Gauge),
                    t("Task manager"),
                    &keys(Modifiers::SHIFT, Key::Escape),
                )
                .clicked()
            {
                self.chrome_command(cef::handlers::chrome::id::TASK_MANAGER);
                ui.close();
            }
            popup::separator(ui);
            if item(
                ui,
                Some(Icon::Code),
                t("Developer tools"),
                &keys(cmd_shift, Key::I),
            )
            .clicked()
            {
                self.devtools();
                ui.close();
            }
            if item(ui, Some(Icon::FolderOpen), t("Open logs folder"), "").clicked() {
                startup::open_log_dir();
                ui.close();
            }
        });
        side_menu(&ctx, help, 260.0, |ui| {
            if item(ui, Some(Icon::Info), t("About Redrob Browser"), "").clicked() {
                self.open_tab(internal::ABOUT, true);
                ui.close();
            }
            if item(ui, Some(Icon::Bug), t("Report an issue"), "").clicked() {
                self.open_tab(ISSUES_URL, true);
                ui.close();
            }
        });
    }

    /// Import bookmarks and settings: from each browser found, and the
    /// passwords file Chrome exports.
    fn import_menu(&mut self, ui: &mut egui::Ui) {
        use popup::item;
        let sources = import_chrome::sources();
        if sources.is_empty() {
            popup::note(
                ui,
                None,
                t("No Chrome, Chromium, Edge or Brave profile found"),
            );
        }
        for s in &sources {
            if item(
                ui,
                popup::Glyph::None,
                &tf("Import from {0}", &[&s.name]),
                "",
            )
            .clicked()
            {
                self.import_from(s);
                ui.close();
            }
            if s.profile.join("Login Data").exists()
                && item(
                    ui,
                    popup::Glyph::None,
                    &tf("Import passwords from {0}", &[&s.name]),
                    "",
                )
                .clicked()
            {
                let scratch = self
                    .profile
                    .as_ref()
                    .map(|p| p.dir.join("import-tmp"))
                    .unwrap_or_else(std::env::temp_dir);
                let (logins, skipped) = match import_chrome::import_passwords(s, &scratch) {
                    Ok((l, n)) => (Ok(l), n),
                    Err(e) => (Err(e), 0),
                };
                self.import_passwords(logins, skipped, s.name);
                ui.close();
            }
        }
        // Chrome's "Export passwords" writes this file to the Downloads folder.
        let csv = profile::downloads_dir().join("Chrome Passwords.csv");
        if csv.exists()
            && item(
                ui,
                None,
                t("Import passwords from Chrome Passwords.csv"),
                "",
            )
            .clicked()
        {
            let logins = import_chrome::import_passwords_csv(&csv);
            self.import_passwords(logins, 0, t("the CSV file"));
            ui.close();
        }
    }

    /// Private windows share one process with its own memory-only engine.
    /// From an incognito window that is this process; from a normal one it
    /// is started, or asked for a window if it already runs (instance.rs).
    fn open_incognito(&mut self) {
        if self.incognito {
            self.requests.push(browser::Request::NewWindow);
            return;
        }
        let started = std::env::current_exe().and_then(|exe| {
            startup::no_console(std::process::Command::new(exe).arg(INCOGNITO_FLAG)).spawn()
        });
        match started {
            // Reap it when it closes, so it does not linger as a zombie.
            Ok(mut child) => {
                std::thread::spawn(move || child.wait());
            }
            Err(e) => self.notice = Some(tf("Could not open an incognito window: {0}", &[&e])),
        }
    }

    /// Chrome's "Move to new window": the tab goes to a new window of this
    /// process with its engine target, so its page, back and forward
    /// history, scroll position and typed text come along live. `at` is the
    /// new window's top-left on screen (a tab dragged out lands under the
    /// pointer); None puts it next to this window.
    fn move_to_new_window(&mut self, index: usize, at: Option<egui::Pos2>) {
        if self.model.tabs.len() < 2 {
            return;
        }
        let Some(tab) = self.model.take_tab(index) else {
            return;
        };
        let id = tab.id;
        let moved = browser::Moved {
            login: self.agent_logins.remove(&id),
            tab,
        };
        self.requests.push(browser::Request::Detach {
            moved: Box::new(browser::Payload::Tab(moved)),
            at,
        });
        self.activated();
        self.save_session();
    }

    /// "Move group to new window": the group and its tabs, live.
    fn move_group_to_new_window(&mut self, g: model::GroupId) {
        let all = self
            .model
            .group_range(g)
            .is_some_and(|r| r.len() == self.model.tabs.len());
        if all {
            return;
        }
        let Some((group, tabs)) = self.model.take_group(g) else {
            return;
        };
        let moved = tabs
            .into_iter()
            .map(|tab| browser::Moved {
                login: self.agent_logins.remove(&tab.id),
                tab,
            })
            .collect();
        self.requests.push(browser::Request::Detach {
            moved: Box::new(browser::Payload::Group(group, moved)),
            at: None,
        });
        self.activated();
        self.save_session();
    }

    /// A link or text dropped on the window's chrome at `at` (physical
    /// pixels): on the tab strip it opens in a new tab, elsewhere in the
    /// tab on screen, as Chrome does.
    #[cfg_attr(not(target_os = "linux"), allow(dead_code))]
    fn dropped(&mut self, at: (i32, i32), text: &str) {
        let scale = self.last_place.map_or(1.0, |(p, _)| p.scale);
        let url = model::to_url(text);
        if (at.1 as f32) / scale < 40.0 {
            self.open_tab(&url, true);
        } else {
            self.navigate(url);
        }
    }

    /// Bring back something closed (a tab, or a whole group).
    fn reopen(&mut self, c: model::Closed) {
        match c {
            model::Closed::Tab { url, .. } => {
                self.open_tab(&url, true);
            }
            model::Closed::Group { title, color, tabs } => {
                let urls: Vec<String> = tabs.into_iter().map(|(u, _)| u).collect();
                if let Some(g) = self.open_all_in_group(&urls, &title) {
                    if let Some(g) = self.model.group_mut(g) {
                        g.color = color;
                    }
                }
            }
        }
    }

    /// Delete browsing data (redrob://settings/clearBrowserData).
    fn clear_browsing_data(&mut self, c: internal::Clear) {
        if c.history {
            if let Some(p) = &self.profile {
                let _ = p.clear_history_since(c.since);
            }
            self.model.history.retain(|h| h.last_visit < c.since);
            self.suggest.index = None;
            self.top_sites = None;
        }
        if c.cookies || c.cache {
            if let Some(id) = self.active_id() {
                self.op(
                    id,
                    Op::ClearBrowsingData {
                        cookies: c.cookies,
                        cache: c.cache,
                    },
                );
            }
        }
        self.notice = Some(t("Browsing data deleted.").to_string());
    }

    /// One of Chrome's own commands on the tab on screen.
    fn chrome_command(&mut self, command: i32) {
        if let Some(id) = self.active_id() {
            self.op(id, Op::Chrome(command));
        }
    }

    /// Ctrl+Shift+D: the window's web pages into a new folder on the
    /// bookmarks bar, named so it is not mixed with another.
    fn bookmark_all_tabs(&mut self) {
        let pages: Vec<(String, String)> = self
            .model
            .tabs
            .iter()
            .filter(|t| t.url.starts_with("http://") || t.url.starts_with("https://"))
            .map(|t| (t.url.clone(), t.title.clone()))
            .collect();
        if pages.is_empty() {
            return;
        }
        let base = t("Saved tabs");
        let taken = |name: &str| {
            self.model
                .bookmarks
                .iter()
                .any(|b| b.folder == name || b.folder.starts_with(&format!("{name}/")))
        };
        let mut name = base.to_string();
        let mut n = 2;
        while taken(&name) {
            name = format!("{base} ({n})");
            n += 1;
        }
        for (url, title) in pages {
            self.model.bookmarks.push(model::Bookmark {
                url,
                title,
                folder: name.clone(),
            });
        }
        self.save_bookmarks();
        self.notice = Some(tf("Bookmarked the tabs in \"{0}\".", &[&name]));
    }

    fn bookmark_bar_shown(&mut self) -> bool {
        if self.bookmark_bar.is_none() {
            let v = self
                .profile
                .as_ref()
                .and_then(|p| p.setting("bookmark_bar"))
                .is_none_or(|v| v != "never");
            self.bookmark_bar = Some(v);
        }
        self.bookmark_bar.unwrap_or(true)
    }

    fn set_bookmark_bar(&mut self, on: bool) {
        self.bookmark_bar = Some(on);
        if let Some(p) = &self.profile {
            let _ = p.set_setting("bookmark_bar", if on { "always" } else { "never" });
        }
    }

    fn reading_list(&mut self) -> &mut Vec<ReadingItem> {
        let profile = self.profile.as_ref();
        self.reading_list.get_or_insert_with(|| {
            let text = profile.and_then(|p| p.setting("reading_list"));
            let v: serde_json::Value = text
                .and_then(|t| serde_json::from_str(&t).ok())
                .unwrap_or_default();
            v.as_array()
                .map(|a| {
                    a.iter()
                        .filter_map(|e| {
                            Some(ReadingItem {
                                url: e["url"].as_str()?.to_string(),
                                title: e["title"].as_str().unwrap_or_default().to_string(),
                                read: e["read"].as_bool().unwrap_or(false),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default()
        })
    }

    fn save_reading_list(&mut self) {
        let list: Vec<serde_json::Value> = self
            .reading_list()
            .iter()
            .map(|r| serde_json::json!({ "url": r.url, "title": r.title, "read": r.read }))
            .collect();
        if let Some(p) = &self.profile {
            let _ = p.set_setting("reading_list", &serde_json::Value::Array(list).to_string());
        }
    }

    fn toggle_bookmark(&mut self) {
        if let Some((url, title)) = self
            .model
            .active_tab()
            .map(|t| (t.url.clone(), t.title.clone()))
        {
            self.model.toggle_bookmark(&url, &title);
            self.save_bookmarks();
        }
    }

    /// Minimize, maximize or restore, and close, drawn at the strip's right
    /// end the way Windows draws them. Returns the width they take.
    fn caption_buttons(&mut self, ui: &mut egui::Ui, strip: Rect, maximized: bool) -> f32 {
        let p = *theme::palette(ui);
        let w = 46.0;
        for kind in 0..3usize {
            let x = strip.right() - w * (3 - kind) as f32;
            let rect =
                Rect::from_min_size(egui::pos2(x, strip.top()), Vec2::new(w, strip.height()));
            let r = ui.interact(rect, ui.id().with(("caption", kind)), Sense::click());
            let (fill, ink) = match (kind, r.hovered()) {
                (2, true) => (Color32::from_rgb(0xc4, 0x2b, 0x1c), Color32::WHITE),
                (_, true) => (p.border_subtle, p.ink_primary),
                _ => (Color32::TRANSPARENT, p.ink_secondary),
            };
            let painter = ui.painter();
            painter.rect_filled(rect, 0.0, fill);
            let c = rect.center();
            let stroke = Stroke::new(1.0, ink);
            let v = Vec2::new;
            match kind {
                0 => {
                    painter.hline((c.x - 5.0)..=(c.x + 5.0), c.y, stroke);
                }
                1 if maximized => {
                    let back = Rect::from_center_size(c + v(-1.5, 1.5), Vec2::splat(8.0));
                    painter.rect_stroke(back, 0.0, stroke, egui::StrokeKind::Inside);
                    painter.line_segment([c + v(-2.5, -4.5), c + v(4.5, -4.5)], stroke);
                    painter.line_segment([c + v(4.5, -4.5), c + v(4.5, 2.5)], stroke);
                }
                1 => {
                    let frame = Rect::from_center_size(c, Vec2::splat(10.0));
                    painter.rect_stroke(frame, 0.0, stroke, egui::StrokeKind::Inside);
                }
                _ => {
                    painter.line_segment([c + v(-5.0, -5.0), c + v(5.0, 5.0)], stroke);
                    painter.line_segment([c + v(5.0, -5.0), c + v(-5.0, 5.0)], stroke);
                }
            }
            let tip = match kind {
                0 => t("Minimize"),
                1 if maximized => t("Restore"),
                1 => t("Maximize"),
                _ => t("Close"),
            };
            if popup::tip(r, tip).clicked() {
                let cmd = match kind {
                    0 => egui::ViewportCommand::Minimized(true),
                    1 => egui::ViewportCommand::Maximized(!maximized),
                    _ => egui::ViewportCommand::Close,
                };
                ui.ctx().send_viewport_cmd(cmd);
            }
        }
        w * 3.0
    }

    /// The "Incognito" marker before the caption buttons. Returns its width.
    fn incognito_badge(&self, ui: &mut egui::Ui, strip: Rect, captions: f32) -> f32 {
        let p = *theme::palette(ui);
        let font = egui::FontId::proportional(12.0);
        let g = ui
            .painter()
            .layout_no_wrap(t("Incognito").to_string(), font, p.ink_primary);
        let w = g.size().x + 40.0;
        let center = egui::pos2(
            strip.right() - captions - w / 2.0 - 4.0,
            strip.center().y + 2.0,
        );
        let rect = Rect::from_center_size(center, Vec2::new(w, 26.0));
        ui.painter().rect_filled(
            rect,
            CornerRadius::same(size::RADIUS_FULL),
            p.surface_sunken,
        );
        let icon = Rect::from_center_size(
            egui::pos2(rect.left() + 16.0, rect.center().y),
            Vec2::splat(15.0),
        );
        Icon::Incognito.paint(ui, icon, p.ink_primary);
        let at = egui::pos2(rect.left() + 30.0, rect.center().y - g.size().y / 2.0);
        ui.painter().galley(at, g, p.ink_primary);
        w + 12.0
    }

    /// Without the system frame, the window's edges still resize it.
    fn resize_edges(&self, ui: &egui::Ui) {
        let ctx = ui.ctx();
        if cfg!(target_os = "macos") || ctx.input(|i| i.viewport().maximized.unwrap_or(false)) {
            return;
        }
        let rect = ui.max_rect();
        let Some(pos) = ctx.input(|i| i.pointer.hover_pos()) else {
            return;
        };
        let edge = 5.0;
        let w = pos.x - rect.left() < edge;
        let e = rect.right() - pos.x < edge;
        let n = pos.y - rect.top() < edge;
        let s = rect.bottom() - pos.y < edge;
        use egui::{CursorIcon as C, ResizeDirection as D};
        let (dir, cursor) = match (n, s, w, e) {
            (true, _, true, _) => (D::NorthWest, C::ResizeNorthWest),
            (true, _, _, true) => (D::NorthEast, C::ResizeNorthEast),
            (_, true, true, _) => (D::SouthWest, C::ResizeSouthWest),
            (_, true, _, true) => (D::SouthEast, C::ResizeSouthEast),
            (true, ..) => (D::North, C::ResizeNorth),
            (_, true, ..) => (D::South, C::ResizeSouth),
            (_, _, true, _) => (D::West, C::ResizeWest),
            (_, _, _, true) => (D::East, C::ResizeEast),
            _ => return,
        };
        ctx.set_cursor_icon(cursor);
        if ctx.input(|i| i.pointer.primary_pressed()) {
            ctx.send_viewport_cmd(egui::ViewportCommand::BeginResize(dir));
        }
    }

    /// Back, forward, reload, the address field and the page's buttons.
    fn toolbar(&mut self, ui: &mut egui::Ui) {
        let p = *theme::palette(ui);
        let id = self.active_id();
        let loading = self.model.active_tab().is_some_and(|t| t.loading);
        let url = self
            .model
            .active_tab()
            .map(|t| t.url.clone())
            .unwrap_or_default();
        let mut go: Option<String> = None;
        let mut field_rect = Rect::NOTHING;
        egui::Frame::new()
            .fill(p.surface_base)
            .inner_margin(egui::Margin {
                left: 8,
                right: 8,
                top: 6,
                bottom: 6,
            })
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 2.0;
                    if theme::icon_button(ui, Icon::Back, t("Back")).clicked() {
                        if let Some(id) = id {
                            self.op(id, Op::Back);
                        }
                    }
                    if theme::icon_button(ui, Icon::Forward, t("Forward")).clicked() {
                        if let Some(id) = id {
                            self.op(id, Op::Forward);
                        }
                    }
                    let (icon, tip) = if loading {
                        (Icon::Close, t("Stop"))
                    } else {
                        (Icon::Refresh, t("Reload"))
                    };
                    if theme::icon_button(ui, icon, tip).clicked() {
                        if let Some(id) = id {
                            self.op(id, if loading { Op::Stop } else { Op::Reload });
                        }
                    }
                    ui.add_space(6.0);
                    // Room for the buttons after the field: star, key, menu.
                    let after = 2.0 * (size::CONTROL_SM + 2.0)
                        + if self.has_logins(&url) {
                            size::CONTROL_SM + 2.0
                        } else {
                            0.0
                        }
                        + self.extension_buttons_count() as f32 * (size::CONTROL_SM + 2.0)
                        + 4.0;
                    let width = (ui.available_width() - after).max(120.0);
                    let (pill, _) = ui.allocate_exact_size(Vec2::new(width, 36.0), Sense::hover());
                    field_rect = pill;
                    let focused = ui.memory(|m| m.has_focus(self.address_id));
                    self.address_focused = focused;
                    let pill_fill = if focused {
                        p.surface_base
                    } else {
                        p.surface_sunken
                    };
                    ui.painter().rect_filled(
                        pill,
                        CornerRadius::same(size::RADIUS_FULL),
                        pill_fill,
                    );
                    if focused {
                        ui.painter().rect_stroke(
                            pill,
                            CornerRadius::same(size::RADIUS_FULL),
                            Stroke::new(2.0, p.focus_ring),
                            egui::StrokeKind::Inside,
                        );
                    }
                    let site_icon = if focused || url == NEW_TAB {
                        Icon::Search
                    } else if url.starts_with("https://") {
                        Icon::Lock
                    } else if internal::is_internal(&url) {
                        Icon::Sparkle
                    } else {
                        Icon::Globe
                    };
                    let icon_rect = Rect::from_center_size(
                        egui::pos2(pill.left() + 20.0, pill.center().y),
                        Vec2::splat(16.0),
                    );
                    // The page info bubble, from the lock or globe, as in
                    // Chrome (its connection, certificate, permissions).
                    if matches!(site_icon, Icon::Lock | Icon::Globe) {
                        let area = icon_rect.expand(6.0);
                        let hit = ui.interact(area, ui.id().with("page-info"), Sense::click());
                        if hit.hovered() {
                            ui.painter().rect_filled(
                                area,
                                CornerRadius::same(size::RADIUS_MD),
                                p.surface_sunken,
                            );
                        }
                        if hit.clicked() {
                            self.site_cert = false;
                            if let Some(id) = id {
                                self.op(id, Op::SiteInfo);
                            }
                        }
                        let hit = popup::tip(hit, t("View site information"));
                        popup::menu(&hit, 360.0, false, |ui| self.page_info(ui, &url));
                    }
                    site_icon.paint(ui, icon_rect, p.ink_muted);
                    let star_rect = Rect::from_center_size(
                        egui::pos2(pill.right() - 20.0, pill.center().y),
                        Vec2::splat(28.0),
                    );
                    let text_rect = Rect::from_x_y_ranges(
                        (icon_rect.right() + 10.0)..=(star_rect.left() - 4.0),
                        pill.y_range().shrink(6.0),
                    );
                    let mut field_ui = ui.new_child(
                        egui::UiBuilder::new()
                            .max_rect(text_rect)
                            .layout(egui::Layout::left_to_right(egui::Align::Center)),
                    );
                    // The suggestion list's keys, before the field sees them.
                    let list_open = self.suggestions_shown(ui.ctx());
                    if list_open {
                        self.suggestion_keys(ui.ctx());
                    } else if focused
                        && !self.address.trim().is_empty()
                        && ui.input_mut(|i| i.consume_key(egui::Modifiers::NONE, Key::ArrowDown))
                    {
                        // Down opens the list for the text in the field.
                        self.open_suggestions(ui.ctx());
                    }
                    let field = field_ui.add(
                        egui::TextEdit::singleline(&mut self.address)
                            .id(self.address_id)
                            // Tab completes from the list while it is open.
                            .lock_focus(list_open)
                            .frame(egui::Frame::NONE)
                            .font(egui::FontId::proportional(14.0))
                            .text_color(p.ink_primary)
                            .vertical_align(egui::Align::Center)
                            .desired_width(text_rect.width())
                            .hint_text(
                                egui::RichText::new(t("Search or enter address"))
                                    .color(p.ink_muted),
                            ),
                    );
                    // Only once the window has the keyboard back from the
                    // page: egui drops focus requests while it has not.
                    let window_focused = self.chrome_keyboard;
                    if self.focus_address && window_focused {
                        self.focus_address = false;
                        field.request_focus();
                        self.editing = true;
                    } else if self.focus_address {
                        ui.ctx().request_repaint();
                    }
                    if field.gained_focus() {
                        // Ready before the first letter (model::SuggestIndex).
                        self.suggest.index = Some(trace::time("suggestion index", || {
                            model::SuggestIndex::new(&self.model)
                        }));
                        // Select all, like every browser, so typing replaces the address.
                        if let Some(mut state) =
                            egui::TextEdit::load_state(ui.ctx(), self.address_id)
                        {
                            let all = egui::text::CCursorRange::two(
                                egui::text::CCursor::new(0),
                                egui::text::CCursor::new(self.address.chars().count()),
                            );
                            state.cursor.set_char_range(Some(all));
                            state.store(ui.ctx(), self.address_id);
                        }
                    }
                    if field.changed() {
                        self.open_suggestions(ui.ctx());
                    }
                    if field.lost_focus() {
                        // History may change before it is next used.
                        self.suggest.index = None;
                    }
                    if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        // The row the arrow keys picked, else what was typed
                        // (the first row).
                        let picked = (list_open && self.suggest.arrowed)
                            .then(|| self.suggest.list.get(self.suggest.sel).cloned())
                            .flatten();
                        if let Some(s) = picked {
                            go = Some(s.url);
                        } else if let Some(prompt) = agent_prompt(&self.address) {
                            self.ask_agent(prompt.trim().to_string());
                        } else if !self.address.trim().is_empty() {
                            go = Some(model::to_url(&self.address));
                        }
                    }
                    if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Escape)) {
                        self.editing = false;
                        // Back to the page, as in Chrome.
                        if url != NEW_TAB && !internal::is_internal(&url) {
                            self.focus_page = true;
                        }
                        self.address = if url == NEW_TAB {
                            String::new()
                        } else {
                            url.clone()
                        };
                    }
                    if url != NEW_TAB && !internal::is_internal(&url) {
                        let marked = self.model.is_bookmarked(&url);
                        let mut star_ui = ui.new_child(egui::UiBuilder::new().max_rect(star_rect));
                        let r = theme::icon_button_sized(
                            &mut star_ui,
                            if marked { Icon::StarFilled } else { Icon::Star },
                            t("Bookmark this page"),
                            28.0,
                            true,
                        );
                        if marked {
                            Icon::StarFilled.paint(
                                ui,
                                Rect::from_center_size(star_rect.center(), Vec2::splat(16.0)),
                                p.ink_brand,
                            );
                        }
                        if r.clicked() {
                            self.toggle_bookmark();
                        }
                    }
                    ui.add_space(4.0);
                    self.key_button(ui, &url);
                    self.extension_buttons(ui);
                    self.menu(ui);
                });
            });

        // Suggestions float under the address field while the person types.
        if self.suggestions_shown(ui.ctx()) {
            if let Some(url) = self.suggestion_list(ui.ctx(), p, field_rect) {
                go = Some(url);
            }
        }
        if let Some(url) = go {
            self.editing = false;
            self.suggest.close();
            ui.memory_mut(|m| m.surrender_focus(self.address_id));
            self.focus_page = true;
            self.navigate(url);
        }
    }

    /// The person typed (or pressed Down): the list opens for the text in
    /// the field, its first row highlighted.
    fn open_suggestions(&mut self, ctx: &egui::Context) {
        self.editing = true;
        self.suggest = Suggest {
            open: true,
            typed: self.address.clone(),
            sel: 0,
            arrowed: false,
            origin: Some(popup::screen_origin(ctx)),
            list: Vec::new(),
            index: self.suggest.index.take(),
        };
        self.suggest.refresh(&self.model);
    }

    /// Whether the suggestion list is on screen. It closes, as Chrome's
    /// does, when the address bar loses the keyboard (Escape, a click
    /// elsewhere, a tab switch), when the window does (another program in
    /// front, minimized), or when the window moves.
    fn suggestions_shown(&mut self, ctx: &egui::Context) -> bool {
        if !self.suggest.open {
            return false;
        }
        let moved = self
            .suggest
            .origin
            .is_some_and(|o| (o - popup::screen_origin(ctx)).length() > 0.5);
        let ours = self.editing
            && self.chrome_keyboard
            && !self.minimized
            && ctx.memory(|m| m.has_focus(self.address_id));
        if moved || !ours {
            self.suggest.close();
            return false;
        }
        // Any text has a first row: what was typed.
        !self.suggest.typed.trim().is_empty()
    }

    /// The text the field shows for a highlighted row: what was typed for
    /// the first row and the search, the address for the others.
    fn row_text(&self, s: &model::Suggestion) -> String {
        match s.kind {
            SuggestionKind::Url | SuggestionKind::Search => self.suggest.typed.clone(),
            SuggestionKind::Bookmark | SuggestionKind::History => s.url.clone(),
        }
    }

    /// Forget a history row (Shift+Delete or its remove button).
    fn forget_history(&mut self, url: &str) {
        self.model.remove_history(url);
        if let Some(index) = &mut self.suggest.index {
            index.remove_history(url);
        }
        if self.suggest.open {
            self.suggest.refresh(&self.model);
        }
        if let Some(p) = &self.profile {
            let _ = p.delete_history(url);
        }
        // The new tab page's most visited sites come from history.
        self.top_sites = None;
    }

    /// Chrome's keys for the open list, taken before the field sees them:
    /// Up and Down move the highlight and put that row in the field, Tab
    /// completes the field with the highlighted (or best) address match,
    /// Shift+Delete (or Delete on a row the arrows reached) forgets a
    /// history row.
    fn suggestion_keys(&mut self, ctx: &egui::Context) {
        use egui::Modifiers;
        let arrowed = self.suggest.arrowed;
        let (down, up, tab, delete) = ctx.input_mut(|i| {
            (
                i.consume_key(Modifiers::NONE, Key::ArrowDown),
                i.consume_key(Modifiers::NONE, Key::ArrowUp)
                    || i.consume_key(Modifiers::SHIFT, Key::Tab),
                i.consume_key(Modifiers::NONE, Key::Tab),
                i.consume_key(Modifiers::SHIFT, Key::Delete)
                    || (arrowed && i.consume_key(Modifiers::NONE, Key::Delete)),
            )
        });
        if !(down || up || tab || delete) {
            return;
        }
        let mut list = self.suggest.list.clone();
        let Some(last) = list.len().checked_sub(1) else {
            return;
        };
        let mut sel = self.suggest.sel.min(last);
        if tab {
            let typed = self.suggest.typed.trim().to_lowercase();
            let address_row = |s: &model::Suggestion| {
                matches!(s.kind, SuggestionKind::Bookmark | SuggestionKind::History)
            };
            let pick = if sel > 0 && address_row(&list[sel]) {
                Some(sel)
            } else {
                list.iter()
                    .position(|s| address_row(s) && model::completes(&s.url, &typed))
            };
            if let Some(i) = pick {
                self.address = list[i].url.clone();
                self.open_suggestions(ctx);
                cursor_to_end(ctx, self.address_id, &self.address);
            }
            return;
        }
        if down {
            sel = (sel + 1).min(last);
        }
        if up {
            sel = sel.saturating_sub(1);
        }
        if delete && list[sel].kind == SuggestionKind::History {
            let url = list[sel].url.clone();
            self.forget_history(&url);
            list = self.suggest.list.clone();
            sel = sel.min(list.len().saturating_sub(1));
        }
        let Some(row) = list.get(sel) else {
            return;
        };
        self.address = self.row_text(row);
        self.suggest.sel = sel;
        self.suggest.arrowed = sel > 0;
        cursor_to_end(ctx, self.address_id, &self.address);
    }

    /// The list under the address field, in a window of its own as Chrome's
    /// (it covers the page). Returns the address of a row clicked.
    fn suggestion_list(
        &mut self,
        ctx: &egui::Context,
        p: theme::Palette,
        field_rect: Rect,
    ) -> Option<String> {
        let list = std::mem::take(&mut self.suggest.list);
        let sel = self.suggest.sel.min(list.len().saturating_sub(1));
        let at = popup::to_screen(
            ctx,
            egui::pos2(field_rect.left(), field_rect.bottom() + 4.0),
        );
        let (go, forget) = popup::show(
            ctx,
            popup::Slot::Suggestions,
            // Remembered by its row count: each opens measured.
            egui::Id::new(("suggestions", list.len())),
            at,
            field_rect.width(),
            |ui| {
                let mut go = None;
                let mut forget = None;
                ui.set_width(field_rect.width() - 12.0);
                for (i, s) in list.iter().enumerate() {
                    let icon = match s.kind {
                        SuggestionKind::Url => Icon::Globe,
                        SuggestionKind::Bookmark => Icon::Star,
                        SuggestionKind::History => Icon::History,
                        SuggestionKind::Search => Icon::Search,
                    };
                    let (row, r) = ui.allocate_exact_size(
                        Vec2::new(ui.available_width(), SUGGESTION_ROW),
                        Sense::click(),
                    );
                    if i == sel || r.contains_pointer() {
                        ui.painter().rect_filled(
                            row,
                            CornerRadius::same(size::RADIUS_MD),
                            p.surface_sunken,
                        );
                    }
                    icon.paint(
                        ui,
                        Rect::from_center_size(
                            egui::pos2(row.left() + 18.0, row.center().y),
                            Vec2::splat(16.0),
                        ),
                        p.ink_muted,
                    );
                    // History rows can be removed, as in Chrome.
                    let remove = (s.kind == SuggestionKind::History
                        && (i == sel || r.contains_pointer()))
                    .then(|| {
                        Rect::from_center_size(
                            egui::pos2(row.right() - 18.0, row.center().y),
                            Vec2::splat(24.0),
                        )
                    });
                    let (title, detail) = match s.kind {
                        SuggestionKind::Search => (s.title.clone(), t("Search").to_string()),
                        _ if s.title.is_empty() => (s.url.clone(), String::new()),
                        _ => (s.title.clone(), s.url.clone()),
                    };
                    let right = remove.map_or(row.right(), |b| b.left());
                    let painter = ui.painter_at(Rect::from_x_y_ranges(
                        (row.left() + 4.0)..=(right - 4.0),
                        row.y_range(),
                    ));
                    let g = painter.layout_no_wrap(
                        theme::elide(&title, 60),
                        egui::FontId::proportional(13.0),
                        p.ink_primary,
                    );
                    let tw = g.size().x;
                    painter.galley(
                        egui::pos2(row.left() + 38.0, row.center().y - g.size().y / 2.0),
                        g,
                        p.ink_primary,
                    );
                    if !detail.is_empty() {
                        painter.text(
                            egui::pos2(row.left() + 38.0 + tw + 10.0, row.center().y),
                            egui::Align2::LEFT_CENTER,
                            theme::elide(&detail, 70),
                            egui::FontId::proportional(12.0),
                            p.ink_muted,
                        );
                    }
                    if let Some(b) = remove {
                        let hit = ui.interact(b, egui::Id::new(("forget", i)), Sense::click());
                        if hit.hovered() {
                            ui.painter()
                                .circle_filled(b.center(), 12.0, p.surface_raised);
                        }
                        Icon::Close.paint(
                            ui,
                            Rect::from_center_size(b.center(), Vec2::splat(14.0)),
                            p.ink_muted,
                        );
                        if hit.clicked() {
                            forget = Some(s.url.clone());
                            continue;
                        }
                    }
                    if r.clicked() {
                        go = Some(s.url.clone());
                    }
                }
                (go, forget)
            },
        );
        self.suggest.list = list;
        if let Some(url) = forget {
            self.forget_history(&url);
            if self.suggest.arrowed {
                // The highlighted row went: the field shows what was typed.
                self.address = self.suggest.typed.clone();
                self.suggest.sel = 0;
                self.suggest.arrowed = false;
                cursor_to_end(ctx, self.address_id, &self.address);
            }
            ctx.request_repaint();
        }
        go
    }

    fn has_logins(&self, url: &str) -> bool {
        match (&self.vault, vault::origin_of(url)) {
            (Some(v), Some(origin)) => !v.logins_for(&origin).is_empty(),
            _ => false,
        }
    }

    fn bookmarks_bar(&mut self, ui: &mut egui::Ui) {
        if !self.bookmark_bar_shown() {
            return;
        }
        let p = *theme::palette(ui);
        let top_level: Vec<(usize, model::Bookmark)> = self
            .model
            .bookmarks
            .iter()
            .cloned()
            .enumerate()
            .filter(|(_, b)| b.folder.is_empty())
            .collect();
        // The bar's folders: the first part of each folder path, in order.
        let mut folders: Vec<String> = Vec::new();
        for b in self
            .model
            .bookmarks
            .iter()
            .filter(|b| !model::is_other(&b.folder))
        {
            if let Some(top) = b.folder.split('/').next().filter(|f| !f.is_empty()) {
                if !folders.iter().any(|f| f == top) {
                    folders.push(top.to_string());
                }
            }
        }
        let bookmarks = self.model.bookmarks.clone();
        let mut go = None;
        let mut go_new_tab = None;
        let mut remove = None;
        // A folder's "Open all": (addresses, folder name, where).
        let mut open_all: Option<(Vec<String>, String, OpenAll)> = None;
        let r = egui::Frame::new()
            .fill(p.surface_base)
            .inner_margin(egui::Margin {
                left: 10,
                right: 10,
                top: 0,
                bottom: 4,
            })
            .show(ui, |ui| {
                ui.set_width(ui.available_width());
                if top_level.is_empty() && folders.is_empty() {
                    return;
                }
                ui.horizontal(|ui| {
                    ui.spacing_mut().item_spacing.x = 2.0;
                    for (i, b) in &top_level {
                        let label =
                            theme::elide(if b.title.is_empty() { &b.url } else { &b.title }, 22);
                        let g = ui.painter().layout_no_wrap(
                            label,
                            egui::FontId::proportional(12.0),
                            p.ink_secondary,
                        );
                        let w = g.size().x + 34.0;
                        if ui.available_width() < w {
                            break;
                        }
                        let (rect, r) = ui.allocate_exact_size(Vec2::new(w, 26.0), Sense::click());
                        if r.hovered() {
                            ui.painter().rect_filled(
                                rect,
                                CornerRadius::same(size::RADIUS_SM),
                                p.surface_sunken,
                            );
                        }
                        Icon::Globe.paint(
                            ui,
                            Rect::from_center_size(
                                egui::pos2(rect.left() + 14.0, rect.center().y),
                                Vec2::splat(13.0),
                            ),
                            p.ink_muted,
                        );
                        ui.painter().galley(
                            egui::pos2(rect.left() + 26.0, rect.center().y - g.size().y / 2.0),
                            g,
                            p.ink_secondary,
                        );
                        let r = popup::tip(r, &b.url);
                        if r.clicked() {
                            go = Some(b.url.clone());
                        }
                        if r.middle_clicked() {
                            go_new_tab = Some(b.url.clone());
                        }
                        popup::context_menu(&r, |ui| {
                            if ui.button(t("Open in new tab")).clicked() {
                                go_new_tab = Some(b.url.clone());
                                ui.close();
                            }
                            if ui.button(t("Open in new window")).clicked() {
                                open_all =
                                    Some((vec![b.url.clone()], String::new(), OpenAll::Window));
                                ui.close();
                            }
                            if ui.button(t("Remove")).clicked() {
                                remove = Some(*i);
                                ui.close();
                            }
                        });
                    }
                    for folder in &folders {
                        let label = theme::elide(folder, 22);
                        let g = ui.painter().layout_no_wrap(
                            label,
                            egui::FontId::proportional(12.0),
                            p.ink_secondary,
                        );
                        let w = g.size().x + 34.0;
                        if ui.available_width() < w {
                            break;
                        }
                        let (rect, r) = ui.allocate_exact_size(Vec2::new(w, 26.0), Sense::click());
                        if r.hovered() {
                            ui.painter().rect_filled(
                                rect,
                                CornerRadius::same(size::RADIUS_SM),
                                p.surface_sunken,
                            );
                        }
                        Icon::Folder.paint(
                            ui,
                            Rect::from_center_size(
                                egui::pos2(rect.left() + 14.0, rect.center().y),
                                Vec2::splat(13.0),
                            ),
                            p.ink_muted,
                        );
                        ui.painter().galley(
                            egui::pos2(rect.left() + 26.0, rect.center().y - g.size().y / 2.0),
                            g,
                            p.ink_secondary,
                        );
                        // Click: the folder's bookmarks; right-click: open them all.
                        popup::menu(&r, 280.0, false, |ui| {
                            if let Some(u) = folder_menu(ui, &bookmarks, folder, &mut open_all) {
                                go = Some(u);
                            }
                        });
                        popup::context_menu(&r, |ui| {
                            open_all_items(ui, &bookmarks, folder, &mut open_all);
                        });
                    }
                });
            });
        let rect = r.response.rect;
        ui.painter().hline(
            rect.x_range(),
            rect.bottom(),
            Stroke::new(1.0, p.border_subtle),
        );
        if let Some(i) = remove {
            self.model.bookmarks.remove(i);
            self.save_bookmarks();
        }
        if let Some((urls, name, how)) = open_all {
            match how {
                OpenAll::Tabs => {
                    self.open_all(&urls);
                }
                OpenAll::Window => self.requests.push(browser::Request::OpenWindow(urls)),
                OpenAll::Group => {
                    self.open_all_in_group(&urls, &name);
                }
            }
        }
        if let Some(url) = go_new_tab {
            self.open_tab(&url, false);
        }
        if let Some(url) = go {
            self.navigate(url);
        }
    }

    /// The first screen of a new tab: the mark, a search field and the
    /// person's most visited sites.
    fn new_tab_page(&mut self, ui: &mut egui::Ui, rect: Rect) {
        let p = *theme::palette(ui);
        ui.painter().rect_filled(rect, 0.0, p.surface_base);
        if self.top_sites.is_none() {
            let mut sites: Vec<(String, String)> = Vec::new();
            if let Some(prof) = &self.profile {
                let mut h = prof.history_page("", 200, 0).unwrap_or_default();
                h.sort_by(|a, b| {
                    b.visits
                        .cmp(&a.visits)
                        .then(b.last_visit.cmp(&a.last_visit))
                });
                let mut hosts = std::collections::HashSet::new();
                for e in h {
                    let Some(host) = url::Url::parse(&e.url)
                        .ok()
                        .and_then(|u| u.host_str().map(str::to_string))
                    else {
                        continue;
                    };
                    if hosts.insert(host.clone()) {
                        sites.push((e.url, if e.title.is_empty() { host } else { e.title }));
                    }
                    if sites.len() == 8 {
                        break;
                    }
                }
            }
            self.top_sites = Some(sites);
        }
        let column = 560.0f32.min(rect.width() - 48.0);
        let top = rect.top() + (rect.height() * 0.2).clamp(32.0, 180.0);
        let area = Rect::from_min_size(
            egui::pos2(rect.center().x - column / 2.0, top),
            Vec2::new(column, rect.bottom() - top),
        );
        let mut ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(area)
                .layout(egui::Layout::top_down(egui::Align::Center)),
        );
        ui.add(
            egui::Image::from_bytes(
                "bytes://redrob-ui/redrob-browser-icon-web.svg",
                theme::BRAND_ICON,
            )
            .fit_to_exact_size(Vec2::splat(64.0)),
        );
        ui.add_space(size::SPACE_3);
        ui.label(
            egui::RichText::new("Redrob Browser")
                .size(22.0)
                .color(p.ink_primary)
                .strong(),
        );
        ui.add_space(size::SPACE_6);

        // The search field, the same as the address bar.
        let (pill, _) = ui.allocate_exact_size(Vec2::new(column, size::CONTROL_LG), Sense::hover());
        let id = egui::Id::new("newtab-search");
        let focused = ui.memory(|m| m.has_focus(id));
        ui.painter().rect_filled(
            pill,
            CornerRadius::same(size::RADIUS_FULL),
            p.surface_raised,
        );
        let stroke = if focused {
            Stroke::new(2.0, p.focus_ring)
        } else {
            Stroke::new(1.0, p.border_subtle)
        };
        ui.painter().rect_stroke(
            pill,
            CornerRadius::same(size::RADIUS_FULL),
            stroke,
            egui::StrokeKind::Inside,
        );
        Icon::Search.paint(
            &ui,
            Rect::from_center_size(
                egui::pos2(pill.left() + 24.0, pill.center().y),
                Vec2::splat(18.0),
            ),
            p.ink_muted,
        );
        let text_rect = Rect::from_x_y_ranges(
            (pill.left() + 46.0)..=(pill.right() - 20.0),
            pill.y_range().shrink(8.0),
        );
        let mut field_ui = ui.new_child(
            egui::UiBuilder::new()
                .max_rect(text_rect)
                .layout(egui::Layout::left_to_right(egui::Align::Center)),
        );
        let field = field_ui.add(
            egui::TextEdit::singleline(&mut self.new_tab_query)
                .id(id)
                .frame(egui::Frame::NONE)
                .font(egui::FontId::proportional(15.0))
                .text_color(p.ink_primary)
                .desired_width(text_rect.width())
                .hint_text(egui::RichText::new(t("Search or enter address")).color(p.ink_muted)),
        );
        if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
            let q = std::mem::take(&mut self.new_tab_query);
            if let Some(prompt) = agent_prompt(&q) {
                self.ask_agent(prompt.trim().to_string());
            } else if !q.trim().is_empty() {
                self.navigate(model::to_url(&q));
            }
        }
        ui.add_space(size::SPACE_2);
        if self.incognito {
            ui.label(
                egui::RichText::new(t(
                    "Incognito: this window keeps no history, cookies or passwords.",
                ))
                .size(12.0)
                .color(p.ink_secondary),
            );
        }
        ui.label(
            egui::RichText::new(t("Start with / to ask Redrob Code"))
                .size(12.0)
                .color(p.ink_muted),
        );
        ui.add_space(size::SPACE_6 + size::SPACE_2);

        // Most visited sites as tiles, four to a row.
        let sites = self.top_sites.clone().unwrap_or_default();
        if sites.is_empty() {
            return;
        }
        let tile = Vec2::new(112.0, 92.0);
        let per_row = ((column / (tile.x + 8.0)).floor() as usize).clamp(1, 4);
        let mut open = None;
        for row in sites.chunks(per_row) {
            let w = row.len() as f32 * (tile.x + 8.0) - 8.0;
            let (line, _) = ui.allocate_exact_size(Vec2::new(column, tile.y), Sense::hover());
            let mut x = line.center().x - w / 2.0;
            for (url, title) in row {
                let r_rect = Rect::from_min_size(egui::pos2(x, line.top()), tile);
                let r = ui.interact(
                    r_rect,
                    egui::Id::new(("site", url.as_str())),
                    Sense::click(),
                );
                if r.hovered() {
                    ui.painter().rect_filled(
                        r_rect,
                        CornerRadius::same(size::RADIUS_LG),
                        p.surface_raised,
                    );
                }
                let c = egui::pos2(r_rect.center().x, r_rect.top() + 32.0);
                ui.painter().circle_filled(c, 22.0, p.surface_sunken);
                let letter = title
                    .chars()
                    .find(|c| c.is_alphanumeric())
                    .map(|c| c.to_uppercase().to_string())
                    .unwrap_or_default();
                ui.painter().text(
                    c,
                    egui::Align2::CENTER_CENTER,
                    letter,
                    egui::FontId::proportional(18.0),
                    p.ink_brand,
                );
                ui.painter().text(
                    egui::pos2(r_rect.center().x, r_rect.top() + 72.0),
                    egui::Align2::CENTER_CENTER,
                    theme::elide(title, 14),
                    egui::FontId::proportional(12.0),
                    p.ink_secondary,
                );
                if r.on_hover_text(url).clicked() {
                    open = Some(url.clone());
                }
                x += tile.x + 8.0;
            }
            ui.add_space(8.0);
        }
        if let Some(u) = open {
            self.navigate(u);
        }
    }
}

impl Window {
    /// One frame of this window, in its own OS window (browser.rs).
    fn frame(&mut self, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        self.drain_updates(&ctx);
        self.find_native(&ctx);
        // Back from another program (the window manager focused the
        // window): the page gets the keyboard back if it had it.
        let focused = self.chrome_keyboard;
        if focused && !self.window_focused && self.page_focused {
            self.focus_page = true;
        }
        self.window_focused = focused;
        // A click in the chrome, or Ctrl+L from the page: the chrome takes
        // the keyboard back from the page.
        while let Ok(msg) = self.agent_rx.try_recv() {
            self.notice = Some(msg);
        }
        while let Ok(req) = self.login_rx.try_recv() {
            self.agent_login(req);
        }
        if let Ok(a) = self.update_rx.try_recv() {
            self.self_update
                .offered(&a, self.profile.as_ref().map(|p| p.dir.clone()));
            self.update = Some(a);
        }
        if let Some(n) = self.self_update.poll() {
            self.notice = Some(n);
        }
        while let Ok(msg) = self.account_rx.try_recv() {
            match msg {
                account::Msg::Open(url) => {
                    self.open_tab(&url, true);
                    self.notice =
                        Some(t("Signing in. Finish in the page that opened.").to_string());
                }
                account::Msg::SignedIn { name, email } => {
                    if let Some(p) = &self.profile {
                        let _ = p.set_setting("account_name", &name);
                        let _ = p.set_setting("account_email", &email);
                    }
                    let who = if email.is_empty() { name } else { email };
                    self.notice = Some(tf("Signed in as {0}", &[&who]));
                }
                account::Msg::Failed(e) => self.notice = Some(tf("Could not sign in: {0}", &[&e])),
            }
        }
        self.shortcuts(&ctx);
        if ctx.input(|i| i.pointer.any_pressed()) {
            self.prompts.close_menu();
        }
        // A page dialog or the find bar opened: the chrome types there.
        let bar = self
            .active_id()
            .is_some_and(|id| self.prompts.wants_keyboard(id));
        let take = std::mem::take(&mut self.take_keyboard);
        if self.page_focused
            && (take || self.focus_address || bar || ctx.input(|i| i.pointer.any_pressed()))
        {
            cdp::trace(format_args!("window {} takes the keyboard", self.wid));
            self.page_focused = false;
            let _ = self.commands.send(Command::FocusWindow);
        }
        self.resize_edges(ui);
        // A crash must not lose the open tabs.
        if self.last_session_save.elapsed() > std::time::Duration::from_secs(30) {
            self.save_session();
        }

        let p = *theme::palette(ui);
        egui::Panel::top("chrome")
            .frame(egui::Frame::new().fill(p.surface_base))
            .show_separator_line(false)
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                self.tab_bar(ui);
                self.toolbar(ui);
                self.bookmarks_bar(ui);
                self.save_bar(ui);
                // A page dialog and the find bar, above the page.
                if let Some(id) = self.active_id() {
                    for op in self.prompts.bars(ui, id) {
                        self.op(id, op);
                    }
                }
                if let Some(e) = self.error.clone() {
                    theme::bar(ui, Bar::Danger, |ui| {
                        ui.label(egui::RichText::new(e).color(p.danger));
                    });
                }
                if let Some((version, url)) = self
                    .update
                    .as_ref()
                    .map(|u| (u.version.clone(), u.url.clone()))
                {
                    theme::bar(ui, Bar::Brand, |ui| {
                        if self.self_update.ready() {
                            ui.label(tf("Redrob Browser {0} is ready.", &[&version]));
                            if theme::button(ui, t("Restart to update"), true).clicked() {
                                self.save_session();
                                self.self_update.restart();
                                self.requests.push(browser::Request::Quit);
                            }
                            return;
                        }
                        ui.label(tf("Redrob Browser {0} is available.", &[&version]));
                        if self.self_update.busy() {
                            ui.spinner();
                            return;
                        }
                        if self.self_update.can_start() {
                            if theme::button(ui, t("Update now"), true).clicked() {
                                self.self_update.start(ctx.clone());
                            }
                        } else if theme::button(ui, t("Download"), true).clicked() {
                            self.open_tab(&url, true);
                            self.update = None;
                        }
                        if theme::button(ui, t("Not now"), false).clicked() {
                            self.update = None;
                        }
                    });
                }
                if let Some(n) = self.notice.clone() {
                    theme::bar(ui, Bar::Info, |ui| {
                        ui.label(n);
                        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
                            if theme::icon_button_sized(ui, Icon::Close, t("OK"), 24.0, true)
                                .clicked()
                            {
                                self.notice = None;
                            }
                        });
                    });
                }
            });

        if self.show_downloads && !self.model.downloads.is_empty() {
            egui::Panel::bottom("downloads")
                .frame(
                    egui::Frame::new()
                        .fill(p.surface_raised)
                        .inner_margin(egui::Margin::symmetric(16, 8))
                        .stroke(Stroke::new(1.0, p.border_subtle)),
                )
                .show(ui, |ui| self.downloads_panel(ui));
        }

        egui::CentralPanel::default()
            .frame(egui::Frame::NONE.fill(p.surface_base))
            .show(ui, |ui| {
                let (rect, _response) =
                    ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
                // Our own pages and the new tab page are drawn here; a web
                // page is Chromium's native window over this rectangle.
                let web = self
                    .model
                    .active_tab()
                    .is_some_and(|t| t.url != NEW_TAB && !internal::is_internal(&t.url));
                self.place_page(&ctx, rect, web);
                if self.model.tabs.is_empty() {
                    return;
                }
                let tab_index = self.model.active;
                let page_url = self.model.tabs[tab_index].url.clone();
                if page_url == NEW_TAB {
                    self.new_tab_page(ui, rect);
                    return;
                }
                if internal::is_internal(&page_url) {
                    ui.painter().rect_filled(rect, 0.0, p.surface_base);
                    let column = 760.0f32.min(rect.width() - 48.0);
                    let inner = Rect::from_min_max(
                        egui::pos2(rect.center().x - column / 2.0, rect.top() + 24.0),
                        egui::pos2(rect.center().x + column / 2.0, rect.bottom() - 16.0),
                    );
                    let mut page_ui = ui.new_child(egui::UiBuilder::new().max_rect(inner));
                    let act = internal::ui(
                        &mut page_ui,
                        &page_url,
                        &mut self.internal,
                        self.profile.as_ref(),
                        self.vault.as_mut(),
                        &self.model.bookmarks,
                    );
                    if let Some(url) = act.remove_bookmark {
                        self.model.bookmarks.retain(|b| b.url != url);
                        self.save_bookmarks();
                    }
                    if let Some(c) = act.clear {
                        self.clear_browsing_data(c);
                    }
                    if let Some(choice) = act.theme {
                        theme::set_preference(&ctx, &choice);
                        if let Some(p) = &self.profile {
                            let _ = p.set_setting("theme", &choice);
                        }
                    }
                    if let Some(id) = act.search_engine {
                        model::set_search_engine(&id);
                        if let Some(p) = &self.profile {
                            let _ = p.set_setting("search_engine", &id);
                        }
                    }
                    if let Some(u) = act.open_new_tab {
                        self.open_tab(&u, false);
                    }
                    match act.open_all {
                        Some((urls, Some(name))) => {
                            self.open_all_in_group(&urls, &name);
                        }
                        Some((urls, None)) => {
                            self.open_all(&urls);
                        }
                        None => {}
                    }
                    if let Some(u) = act.open {
                        self.navigate(u);
                    }
                    return;
                }
                // Web pages are white until Chromium's window shows.
                ui.painter().rect_filled(rect, 0.0, Color32::WHITE);
                let page_id = self.model.tabs[tab_index].id;
                self.page(&ctx, rect, page_id);
            });
        // An extension popup closes on a click anywhere else in the window,
        // and when its tab leaves the screen.
        let clicked = ctx.input(|i| i.pointer.any_click());
        let off_screen = self
            .ext_popup
            .as_ref()
            .is_some_and(|(t, _)| self.active_id() != Some(*t));
        if (clicked && !self.ext_toggled) || off_screen {
            self.close_ext_popup();
        }
        self.ext_toggled = false;
        popup::end_frame(&ctx, self.page_focused || self.chrome_keyboard);
    }

    /// Find this window's native handle: it sets a title only it has, looks
    /// for the window with that title, then puts its own title back.
    fn find_native(&mut self, ctx: &egui::Context) {
        if self.native.is_some() {
            return;
        }
        if self.native_tries == 0 {
            self.native_token =
                format!("redrob-browser-window-{}-{}", std::process::id(), self.wid);
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(self.native_token.clone()));
        } else if let Some(h) = cef::native::find_window(&self.native_token) {
            self.native = Some(h);
            // The real title goes back on with the next frame.
            self.last_title.clear();
        }
        self.native_tries += 1;
        if self.native.is_none() {
            if self.native_tries.is_multiple_of(50) {
                // The title may not have reached the window: set it again.
                ctx.send_viewport_cmd(egui::ViewportCommand::Title(self.native_token.clone()));
            }
            ctx.request_repaint_after(std::time::Duration::from_millis(16));
        }
    }

    /// Tell the engine where the page area is (physical pixels in this
    /// window) and whether a web page shows there.
    fn place_page(&mut self, ctx: &egui::Context, rect: Rect, web: bool) {
        let Some(parent) = self.native else { return };
        let scale = ctx.pixels_per_point();
        // Whole physical pixels; round outward so the page covers the area.
        let x0 = (rect.left() * scale).floor() as i32;
        let y0 = (rect.top() * scale).floor() as i32;
        let x1 = (rect.right() * scale).ceil() as i32;
        let y1 = (rect.bottom() * scale).ceil() as i32;
        let place = cef::native::Place {
            parent,
            rect: [x0, y0, (x1 - x0).max(1), (y1 - y0).max(1)],
            scale,
        };
        let visible = web && rect.width() > 1.0 && rect.height() > 1.0;
        if self.last_place != Some((place, visible)) {
            self.last_place = Some((place, visible));
            let visible = visible && !self.minimized;
            let _ = self.commands.send(Command::Place { place, visible });
        }
    }

    /// The page area of web tab `tab`: the keyboard between the page and
    /// the chrome, and what floats over the page.
    fn page(&mut self, ctx: &egui::Context, rect: Rect, tab: TabId) {
        if self.focus_page {
            self.focus_page = false;
            self.editing = false;
            ctx.memory_mut(|m| m.surrender_focus(self.address_id));
            self.op(tab, Op::Focus(true));
        }
        if let Some(link) = self.status.clone() {
            popup::status(ctx, rect, &link);
        }
        self.prompts.overlays(ctx, tab, rect);
        if self.prompts.take_refocus() {
            self.focus_page = true;
            ctx.request_repaint();
        }
    }
}

/// Where a bookmarks folder's "Open all" opens its bookmarks.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum OpenAll {
    Tabs,
    Window,
    Group,
}

/// The ⋯ menu's width, as Chrome's.
/// Where "Report an issue" goes.
const ISSUES_URL: &str = "https://github.com/redrob-labs/redrob-browser/issues/new";

/// Every bookmarks folder (and every folder above one), parents before
/// their folders; "Other bookmarks" always.
fn bookmark_folders(marks: &[model::Bookmark]) -> Vec<String> {
    let mut all = std::collections::BTreeSet::new();
    all.insert(model::OTHER.to_string());
    for b in marks {
        let mut path = b.folder.as_str();
        while !path.is_empty() {
            all.insert(path.to_string());
            path = folder_parent(path);
        }
    }
    all.into_iter().collect()
}

/// The folder a folder is in ("" for the bookmarks bar).
fn folder_parent(path: &str) -> &str {
    path.rsplit_once('/').map_or("", |(p, _)| p)
}

/// The side menu of a bookmarks folder in the ⋯ menu.
fn folder_key(path: &str) -> egui::Id {
    egui::Id::new(("redrob-menu-folder", path))
}

/// A bookmarks folder's side menu: its folders, then its bookmarks.
/// Returns the bookmark clicked.
fn folder_side_menu(ui: &mut egui::Ui, marks: &[model::Bookmark], path: &str) -> Option<String> {
    let folders = bookmark_folders(marks);
    let mut any = false;
    for f in folders.iter().filter(|f| folder_parent(f) == path) {
        any = true;
        let name = f.rsplit('/').next().unwrap_or(f);
        popup::side_item(
            ui,
            folder_key(f),
            Some(Icon::Folder),
            &theme::elide(name, 36),
        );
    }
    let mut go = None;
    for b in marks.iter().filter(|b| b.folder == path) {
        any = true;
        let label = if b.title.is_empty() { &b.url } else { &b.title };
        if popup::item(ui, Some(Icon::Globe), &theme::elide(label, 40), "").clicked() {
            go = Some(b.url.clone());
            ui.close();
        }
    }
    if !any {
        popup::note(ui, None, t("(empty)"));
    }
    go
}

const MENU_WIDTH: f32 = 312.0;

/// What the ⋯ menu's zoom row asks for.
enum ZoomAction {
    Step(cef::handlers::zoom::Step),
    Fullscreen,
}

/// Chrome's zoom row: the label, then − percent + and full screen at the
/// right edge. Zoom applies to web pages only.
fn zoom_row(ui: &mut egui::Ui, percent: u32, fullscreen: bool, web: bool) -> Option<ZoomAction> {
    use cef::handlers::zoom::Step;
    let p = *theme::palette(ui);
    let (rect, hover) =
        ui.allocate_exact_size(Vec2::new(ui.available_width(), popup::ROW), Sense::hover());
    if hover.hovered() && popup::pointer_moved(ui) {
        popup::close_side(ui.ctx());
    }
    ui.painter().text(
        egui::pos2(rect.left() + popup::LABEL_X, rect.center().y),
        egui::Align2::LEFT_CENTER,
        t("Zoom"),
        egui::FontId::proportional(13.0),
        p.ink_primary,
    );
    let side = 28.0;
    let cell = |right: f32, width: f32| {
        Rect::from_min_size(
            egui::pos2(right - width, rect.center().y - side / 2.0),
            Vec2::new(width, side),
        )
    };
    let button = |ui: &mut egui::Ui, at: Rect, icon: Icon, tip: &str, enabled: bool| {
        let mut c = ui.new_child(egui::UiBuilder::new().max_rect(at));
        theme::icon_button_sized(&mut c, icon, tip, side, enabled).clicked()
    };
    let mut act = None;
    let full = cell(rect.right() - 4.0, side);
    let tip = if fullscreen {
        t("Exit full screen")
    } else {
        t("Full screen")
    };
    if button(ui, full, Icon::Fullscreen, tip, true) {
        act = Some(ZoomAction::Fullscreen);
    }
    // A rule between the zoom controls and full screen, as in Chrome.
    let rule_x = full.left() - 6.0;
    ui.painter().vline(
        rule_x,
        (rect.top() + 6.0)..=(rect.bottom() - 6.0),
        Stroke::new(1.0, p.border_subtle),
    );
    let plus = cell(rule_x - 6.0, side);
    if button(ui, plus, Icon::Plus, t("Zoom in"), web) {
        act = Some(ZoomAction::Step(Step::In));
    }
    let label = cell(plus.left(), 52.0);
    ui.painter().text(
        label.center(),
        egui::Align2::CENTER_CENTER,
        format!("{percent}%"),
        egui::FontId::proportional(13.0),
        if web { p.ink_primary } else { p.ink_muted },
    );
    let minus = cell(label.left(), side);
    if button(ui, minus, Icon::Minus, t("Zoom out"), web) {
        act = Some(ZoomAction::Step(Step::Out));
    }
    act
}

/// Every bookmark in folder `path` and the folders inside it, as Chrome's
/// "Open all" takes them.
fn folder_urls(bookmarks: &[model::Bookmark], path: &str) -> Vec<String> {
    let inside = format!("{path}/");
    bookmarks
        .iter()
        .filter(|b| b.folder == path || b.folder.starts_with(&inside))
        .map(|b| b.url.clone())
        .collect()
}

/// A folder's "Open all (N)", "Open all in new window" and "Open all in
/// new group", as in Chrome's bookmark folder menu.
fn open_all_items(
    ui: &mut egui::Ui,
    bookmarks: &[model::Bookmark],
    path: &str,
    out: &mut Option<(Vec<String>, String, OpenAll)>,
) {
    let urls = folder_urls(bookmarks, path);
    let n = urls.len();
    let name = path.rsplit('/').next().unwrap_or(path).to_string();
    for (label, how) in [
        (tf("Open all ({0})", &[&n]), OpenAll::Tabs),
        (t("Open all in new window").to_string(), OpenAll::Window),
        (t("Open all in new group").to_string(), OpenAll::Group),
    ] {
        if ui.add_enabled(n > 0, egui::Button::new(label)).clicked() {
            *out = Some((urls.clone(), name.clone(), how));
            ui.close();
        }
    }
}

/// A bookmarks folder's menu: its bookmarks, its folders (one level
/// open at a time) and "Open all". Returns the bookmark clicked.
fn folder_menu(
    ui: &mut egui::Ui,
    bookmarks: &[model::Bookmark],
    path: &str,
    out: &mut Option<(Vec<String>, String, OpenAll)>,
) -> Option<String> {
    let mut go = None;
    let inside = format!("{path}/");
    let mut subs: Vec<String> = Vec::new();
    for b in bookmarks {
        if let Some(rest) = b.folder.strip_prefix(&inside) {
            let sub = format!("{inside}{}", rest.split('/').next().unwrap_or(rest));
            if !subs.contains(&sub) {
                subs.push(sub);
            }
        }
    }
    for sub in &subs {
        let name = sub.rsplit('/').next().unwrap_or(sub);
        popup::submenu(ui, name, |ui| {
            for b in bookmarks.iter().filter(|b| &b.folder == sub) {
                let label = theme::elide(if b.title.is_empty() { &b.url } else { &b.title }, 40);
                if ui.button(label).clicked() {
                    go = Some(b.url.clone());
                    ui.close();
                }
            }
            ui.separator();
            open_all_items(ui, bookmarks, sub, out);
        });
    }
    let mut any = !subs.is_empty();
    for b in bookmarks.iter().filter(|b| b.folder == path) {
        any = true;
        let label = theme::elide(if b.title.is_empty() { &b.url } else { &b.title }, 40);
        if ui.button(label).clicked() {
            go = Some(b.url.clone());
            ui.close();
        }
    }
    if !any {
        ui.label(t("(empty)"));
    }
    ui.separator();
    open_all_items(ui, bookmarks, path, out);
    go
}

/// A download size the way Chrome's download list shows it: B, KB, MB, GB.
fn size_label(bytes: u64) -> String {
    const UNITS: [&str; 4] = ["B", "KB", "MB", "GB"];
    let mut value = bytes as f64;
    let mut unit = 0;
    while value >= 1024.0 && unit < UNITS.len() - 1 {
        value /= 1024.0;
        unit += 1;
    }
    if unit == 0 {
        format!("{bytes} B")
    } else {
        format!("{value:.1} {}", UNITS[unit])
    }
}

/// An extension's badge over its toolbar button `button`, laid out as
/// Chrome's (`IconWithBadgeImageSource`): 14 points high at the bottom of
/// the 28 point icon area, the text at most 23 points wide with 2 on each
/// side, at least as wide as high, right-aligned until 20 wide and centered
/// from there, with a 1 point cutout in `behind` around it. `default` is
/// the background when the extension set none.
fn paint_badge(
    ui: &egui::Ui,
    button: Rect,
    badge: &cef::handlers::extensions::Badge,
    default: Color32,
    behind: Color32,
) {
    const HEIGHT: f32 = 14.0;
    const MAX_TEXT: f32 = 23.0;
    const PADDING: f32 = 2.0;
    let area = Rect::from_center_size(button.center(), Vec2::splat(28.0));
    let [r, g, b, a] = badge.background;
    let background = if a == 0 {
        default
    } else {
        Color32::from_rgb(r, g, b)
    };
    let [r, g, b, a] = badge.color;
    let color = if a == 0 {
        max_contrast(background)
    } else {
        Color32::from_rgba_unmultiplied(r, g, b, a)
    };
    let font = egui::FontId::proportional(9.0);
    let galley = ui.painter().layout_no_wrap(badge.text.clone(), font, color);
    let text_w = galley.size().x.min(MAX_TEXT).ceil();
    let mut width = text_w + PADDING * 2.0;
    // Even, as the area is: an odd badge in an even area blurs.
    if (width as i32) % 2 != (area.width() as i32) % 2 {
        width += 1.0;
    }
    let width = width.max(HEIGHT);
    let x = if width >= 20.0 {
        area.left() + ((area.width() - width) / 2.0).floor()
    } else {
        area.right() - width
    };
    let rect = Rect::from_min_size(
        egui::pos2(x, area.bottom() - HEIGHT),
        Vec2::new(width, HEIGHT),
    );
    let painter = ui.painter();
    painter.rect_filled(rect.expand(1.0), CornerRadius::same(3), behind);
    painter.rect_filled(rect, CornerRadius::same(4), background);
    let text_rect = Rect::from_center_size(rect.center(), Vec2::new(text_w, HEIGHT));
    let at = egui::pos2(
        text_rect.center().x - galley.size().x.min(MAX_TEXT) / 2.0,
        rect.center().y - galley.size().y / 2.0,
    );
    painter
        .with_clip_rect(text_rect.intersect(painter.clip_rect()))
        .galley(at, galley, color);
}

/// White or near black, whichever contrasts more with `c`
/// (`color_utils::GetColorWithMaxContrast`).
fn max_contrast(c: Color32) -> Color32 {
    fn lum(c: Color32) -> f32 {
        let ch = |v: u8| {
            let v = v as f32 / 255.0;
            if v <= 0.03928 {
                v / 12.92
            } else {
                ((v + 0.055) / 1.055).powf(2.4)
            }
        };
        0.2126 * ch(c.r()) + 0.7152 * ch(c.g()) + 0.0722 * ch(c.b())
    }
    let dark = Color32::from_rgb(0x20, 0x21, 0x24);
    let l = lum(c);
    let with_white = 1.05 / (l + 0.05);
    let with_dark = (l + 0.05) / (lum(dark) + 0.05);
    if with_white >= with_dark {
        Color32::WHITE
    } else {
        dark
    }
}
