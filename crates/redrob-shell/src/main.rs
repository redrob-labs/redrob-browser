//! Redrob Browser window.
//!
//! Tabs, a toolbar with back, forward, reload, an address field with
//! suggestions and a bookmarks bar. Each tab's page is drawn on the GPU
//! from the display list the engine sends (compositor/); input inside the
//! page area goes to the engine as CDP input events.

// A GUI program on Windows: no console window behind the browser. Its errors
// go to a log file and a message box instead (startup.rs).
#![cfg_attr(windows, windows_subsystem = "windows")]

mod account;
mod agent_bridge;
mod autoscroll;
mod browser;
mod cdp;
mod compositor;
mod devtools;
mod drm_tab;
mod engine;
mod i18n;
mod import_chrome;
mod input;
mod instance;
mod internal;
mod media;
mod media_view;
mod model;
mod profile;
mod relay;
mod self_update;
mod startup;
mod theme;
mod updater;
mod vault;
mod webvtt;

use std::sync::mpsc;

use cdp::{Command, Event, Op, Update};
use egui::{Color32, CornerRadius, Key, Modifiers, Rect, Sense, Stroke, Vec2};
use i18n::{t, tf};
use model::{Model, SuggestionKind, Tab, TabId};
use theme::{size, Bar, Icon};

const NEW_TAB: &str = "about:blank";

/// `--incognito`: a private window. Its settings live in a temporary folder
/// deleted when the browser closes, and its engine keeps cookies and storage
/// in memory only.
const INCOGNITO_FLAG: &str = "--incognito";

fn main() -> anyhow::Result<()> {
    startup::init();
    run().inspect_err(|e| startup::fail(e))
}

fn run() -> anyhow::Result<()> {
    let incognito = std::env::args().any(|a| a == INCOGNITO_FLAG);
    let start_url = std::env::args().skip(1).find(|a| !a.starts_with("--"));
    // One process, and so one engine, per profile: a later launch asks the
    // running browser for a window and exits (instance.rs).
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
    // Incognito cookies and storage stay in the engine's memory.
    let storage = profile
        .as_ref()
        .filter(|_| !incognito)
        .map(|p| p.engine_dir());
    let engine = engine::Engine::start(storage.as_deref())?;
    // `redrob-browser tab ...` and agents find the relay here; cdp::run
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
        ..Default::default()
    };
    let ws_url = engine.ws_url.clone();
    let start = browser::Start {
        ws_url,
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
    drop(engine);
    if let Some(dir) = incognito_dir {
        // The engine has exited; nothing of this window may stay on disk.
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
    show_devtools: bool,
    internal: internal::State,
    media: media_view::Media,
    /// Tabs whose page asked for DRM video the engine cannot play.
    drm: drm_tab::Offers,
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
    focus_address: bool,
    error: Option<String>,
    last_size: (u32, u32, f32),
    last_title: String,
    address_id: egui::Id,
    autoscroll: autoscroll::Autoscroll,
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
    /// The tab being dragged in the strip, and where on it the pointer took hold.
    tab_drag: Option<(TabId, f32)>,
    /// Most visited sites for the new tab page, read once per new tab.
    top_sites: Option<Vec<(String, String)>>,
    new_tab_query: String,
    /// Draws pages; the reason when the GPU cannot.
    gpu: Result<compositor::Gpu, String>,
}

impl Window {
    fn op(&self, tab: TabId, op: Op) {
        let _ = self.commands.send(Command::Tab(tab, op));
    }

    fn active_id(&self) -> Option<TabId> {
        self.model.active_tab().map(|t| t.id)
    }

    /// Reopen the tabs from the last session in their order.
    fn restore(&mut self, tabs: Vec<profile::SavedTab>, active: usize) {
        for saved in tabs {
            let id = self.model.alloc_id();
            let mut tab = Tab::new(id, &saved.url);
            tab.title = saved.title;
            // Our own pages are drawn here; their engine tab waits on about:blank.
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
        if !self.model.tabs.is_empty() {
            self.model.active = active.min(self.model.tabs.len() - 1);
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

    fn open_tab(&mut self, url: &str, activate: bool) {
        let id = self.model.alloc_id();
        let mut tab = Tab::new(id, url);
        // Our own pages are drawn by the window; the engine tab waits on about:blank.
        let engine_url = if internal::is_internal(url) {
            tab.loading = false;
            tab.title = internal::title(url).to_string();
            NEW_TAB.to_string()
        } else {
            url.to_string()
        };
        self.model.insert_tab(tab, activate);
        self.op(id, Op::Open(engine_url));
        if url == NEW_TAB {
            self.top_sites = None;
        }
        if activate {
            self.activated();
            if url == NEW_TAB {
                self.focus_address = true;
            }
        }
    }

    fn close_tab(&mut self, index: usize) {
        if let Some(id) = self.model.close_tab(index) {
            self.media.drop_tab(id);
            self.drm.clear(id);
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
        if let Some(t) = self.model.active_tab() {
            self.address = if t.url == NEW_TAB {
                String::new()
            } else {
                t.url.clone()
            };
            self.op(t.id, Op::Activate);
        }
        if self.show_devtools {
            self.devtools_opened();
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
            self.op(id, Op::Navigate(url));
        }
    }

    fn drain_updates(&mut self, ctx: &egui::Context) {
        let mut open_links = Vec::new();
        while let Ok(Update { tab, event }) = self.updates.try_recv() {
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
            if let Event::Media(v) = &event {
                self.media.request(tab, v);
                continue;
            }
            if let Event::MediaRects(r) = event {
                self.media.set_rects(tab, r);
                continue;
            }
            if let Event::DrmRequested { key_system } = event {
                self.drm.requested(tab, key_system);
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
            if let Event::Opened { url, opener } = &event {
                let mut t = Tab::new(tab, url);
                t.loading = true;
                // A tab no page opened came from outside the window: an agent.
                t.agent = opener.is_none();
                if let Some(i) = opener.and_then(|o| self.model.index_of(o)) {
                    self.model.active = i;
                }
                self.model.insert_tab(t, true);
                self.activated();
                continue;
            }
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
                Event::Scene(msg) => t.scene.apply(msg),
                Event::SceneLink(link) => t.scene.set_link(link),
                Event::SceneUnavailable(e) => t.scene.error = Some(e),
                Event::ScrollKey(key) => {
                    t.scene.scroll_key(key);
                    t.scene.flush();
                }
                Event::WheelAnswer {
                    node,
                    prevented,
                    scrolled,
                    at,
                    delta,
                    smooth,
                } => {
                    // A cancelled wheel must not have moved the page; a
                    // deferred one moves now that the page let it.
                    let res = t.scene.resolve(t.scene.viewport());
                    t.scene.wheel_answer(node, prevented);
                    if prevented && scrolled {
                        t.scene.scroll_at(&res, at, (-delta.0, -delta.1), smooth);
                    } else if !prevented && !scrolled {
                        t.scene.scroll_at(&res, at, delta, smooth);
                    }
                    t.scene.flush();
                }
                Event::Console { level, text } => t.devtools.log(&level, text),
                Event::NetRequest { id, method, url } => t.devtools.request(id, method, url),
                Event::NetResponse { id, status, mime } => t.devtools.response(&id, status, mime),
                Event::Dom(root) => t.devtools.dom = Some(root),
                Event::Styles(styles) => t.devtools.set_styles(styles),
                Event::Highlight(model) => t.devtools.set_highlight(model),
                Event::Picked(node) => t.devtools.picked(node),
                // Our own pages keep their redrob:// address while the engine
                // tab underneath sits on about:blank.
                Event::Navigated(url) | Event::UrlChanged(url)
                    if url == NEW_TAB && internal::is_internal(&t.url) => {}
                Event::Title(_) | Event::Loading(_) if internal::is_internal(&t.url) => {}
                Event::Navigated(url) => {
                    self.media.drop_tab(tab);
                    self.drm.clear(tab);
                    t.devtools.navigated();
                    t.url = url.clone();
                    t.title.clear();
                    t.scene.navigated();
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
                Event::LinkAt(link) => {
                    if let Some(url) = self.autoscroll.link_answer(link) {
                        open_links.push(url);
                    }
                }
                Event::Opened { .. }
                | Event::Download { .. }
                | Event::LoginSubmitted { .. }
                | Event::DrmRequested { .. }
                | Event::Media(_)
                | Event::MediaRects(_) => {}
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
        for url in open_links {
            self.open_tab(&url, false);
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
        // Setting the title wakes the window on X11: only when it changed.
        if title != self.last_title {
            self.last_title = title.clone();
            ctx.send_viewport_cmd(egui::ViewportCommand::Title(title));
        }
    }

    /// Browser shortcuts, taken before the page sees the keys.
    fn shortcuts(&mut self, ctx: &egui::Context) {
        let cmd = Modifiers::COMMAND;
        let shift = Modifiers::COMMAND | Modifiers::SHIFT;
        let (new, close, reopen, address, bookmark, reload, next, prev, back, fwd) =
            ctx.input_mut(|i| {
                (
                    i.consume_key(cmd, Key::T),
                    i.consume_key(cmd, Key::W),
                    i.consume_key(shift, Key::T),
                    i.consume_key(cmd, Key::L),
                    i.consume_key(cmd, Key::D),
                    i.consume_key(cmd, Key::R) || i.consume_key(Modifiers::NONE, Key::F5),
                    i.consume_key(Modifiers::CTRL, Key::Tab) || i.consume_key(cmd, Key::PageDown),
                    i.consume_key(Modifiers::CTRL | Modifiers::SHIFT, Key::Tab)
                        || i.consume_key(cmd, Key::PageUp),
                    i.consume_key(Modifiers::ALT, Key::ArrowLeft),
                    i.consume_key(Modifiers::ALT, Key::ArrowRight),
                )
            });
        let n = self.model.tabs.len();
        if new {
            self.open_tab(NEW_TAB, true);
        }
        if close {
            self.close_tab(self.model.active);
        }
        if reopen {
            if let Some((url, _)) = self.model.closed.pop() {
                self.open_tab(&url, true);
            }
        }
        if address {
            self.focus_address = true;
        }
        if bookmark {
            self.toggle_bookmark();
        }
        if reload {
            if let Some(id) = self.active_id() {
                self.op(id, Op::Reload);
            }
        }
        if next && n > 1 {
            self.select_tab((self.model.active + 1) % n);
        }
        if prev && n > 1 {
            self.select_tab((self.model.active + n - 1) % n);
        }
        if back || fwd {
            if let Some(id) = self.active_id() {
                self.op(id, if back { Op::Back } else { Op::Forward });
            }
        }
        // Ctrl+Shift+N: a new incognito window. Ctrl+N: a new window.
        if ctx.input_mut(|i| i.consume_key(shift, Key::N)) {
            self.open_incognito();
        }
        if ctx.input_mut(|i| i.consume_key(cmd, Key::N)) {
            self.requests.push(browser::Request::NewWindow);
        }
        // Ctrl+H: history.
        if ctx.input_mut(|i| i.consume_key(cmd, Key::H)) {
            self.open_tab(internal::HISTORY, true);
        }
        // F12 or Ctrl+Shift+I: developer tools.
        let tools = ctx.input_mut(|i| {
            i.consume_key(Modifiers::NONE, Key::F12) || i.consume_key(shift, Key::I)
        });
        if tools {
            self.toggle_devtools();
        }
        // Ctrl+Shift+PageUp/PageDown move the active tab left or right.
        let (left, right) = ctx.input_mut(|i| {
            (
                i.consume_key(shift, Key::PageUp),
                i.consume_key(shift, Key::PageDown),
            )
        });
        let a = self.model.active;
        if left && a > 0 {
            self.model.move_tab(a, a - 1);
        }
        if right && a + 1 < n {
            self.model.move_tab(a, a + 1);
        }
    }

    fn on_download(&mut self, item: model::DownloadItem) {
        let finished = item.state != "inProgress";
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
        for d in self.model.downloads.iter().rev().take(6) {
            ui.horizontal(|ui| {
                let state = match d.state.as_str() {
                    "completed" => t("Done"),
                    "canceled" => t("Failed"),
                    _ => t("Downloading"),
                };
                ui.label(format!("{}  {}  {} KB", d.filename, state, d.bytes / 1024));
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
        self.notice = Some(tf(
            "Imported {0} bookmarks and {1} history entries from {2}.",
            &[&added, &history, &source.name],
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
        egui::Popup::menu(&r)
            .align(egui::RectAlign::BOTTOM_END)
            .show(|ui| {
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
            .unwrap_or_else(|| agent_bridge::DEFAULT_SERVER.to_string());
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

    fn toggle_devtools(&mut self) {
        self.show_devtools = !self.show_devtools;
        if self.show_devtools {
            self.devtools_opened();
        }
    }

    /// Network reporting starts the first time the tools open on a tab.
    fn devtools_opened(&mut self) {
        let Some(t) = self.model.active_tab_mut() else {
            return;
        };
        if !t.devtools.network_on {
            t.devtools.network_on = true;
            let id = t.id;
            self.op(id, Op::DevtoolsOpen);
        }
    }

    fn devtools_panel(&mut self, ui: &mut egui::Ui) {
        let Some(t) = self.model.active_tab_mut() else {
            return;
        };
        let id = t.id;
        let act = devtools::ui(ui, &mut t.devtools);
        if let Some(expr) = act.evaluate {
            self.op(id, Op::Evaluate(expr));
        }
        if act.refresh_dom {
            self.op(id, Op::GetDom);
        }
        if let Some(node) = act.styles_for {
            self.op(id, Op::NodeStyles(node));
        }
        if let Some(node) = act.highlight {
            self.op(id, Op::Highlight(node));
        }
        if act.close {
            self.show_devtools = false;
            self.op(id, Op::Highlight(None));
        }
    }

    /// The ⋯ menu at the end of the toolbar.
    fn menu(&mut self, ui: &mut egui::Ui) {
        let r = theme::icon_button(ui, Icon::More, t("Menu"));
        let item = |ui: &mut egui::Ui, icon: Icon, text: &str| {
            let p = theme::palette(ui);
            ui.add(
                egui::Button::image_and_text(icon.image(16.0, p.ink_secondary), text)
                    .frame(false)
                    .min_size(Vec2::new(220.0, 30.0)),
            )
        };
        egui::Popup::menu(&r)
            .align(egui::RectAlign::BOTTOM_END)
            .width(248.0)
            .show(|ui| {
                if item(ui, Icon::Plus, t("New tab")).clicked() {
                    self.open_tab(NEW_TAB, true);
                    ui.close();
                }
                if item(ui, Icon::Plus, t("New window")).clicked() {
                    self.requests.push(browser::Request::NewWindow);
                    ui.close();
                }
                if item(ui, Icon::Incognito, t("New incognito window")).clicked() {
                    self.open_incognito();
                    ui.close();
                }
                ui.separator();
                if item(ui, Icon::History, t("History")).clicked() {
                    self.open_tab(internal::HISTORY, true);
                    ui.close();
                }
                if item(ui, Icon::Download, t("Downloads")).clicked() {
                    self.show_downloads = true;
                    ui.close();
                }
                if item(ui, Icon::Key, t("Passwords")).clicked() {
                    self.open_tab(internal::PASSWORDS, true);
                    ui.close();
                }
                if item(ui, Icon::Code, t("Developer tools")).clicked() {
                    self.toggle_devtools();
                    ui.close();
                }
                if item(ui, Icon::Settings, t("Settings")).clicked() {
                    self.open_tab(internal::SETTINGS, true);
                    ui.close();
                }
                ui.separator();
                let signed_in = self
                    .profile
                    .as_ref()
                    .and_then(|p| p.setting("account_email"))
                    .filter(|e| !e.is_empty());
                match signed_in {
                    Some(email) => {
                        ui.add_space(2.0);
                        ui.weak(tf("Signed in as {0}", &[&email]));
                        if item(ui, Icon::User, t("Sign out")).clicked() {
                            account::sign_out();
                            if let Some(p) = &self.profile {
                                let _ = p.set_setting("account_name", "");
                                let _ = p.set_setting("account_email", "");
                            }
                            ui.close();
                        }
                    }
                    None => {
                        if item(ui, Icon::SignIn, t("Sign in to Redrob")).clicked() {
                            account::sign_in(self.account_tx.clone());
                            ui.close();
                        }
                    }
                }
                ui.menu_button(t("Language"), |ui| {
                    let now = i18n::current();
                    for (lang, name) in [(i18n::Lang::En, "English"), (i18n::Lang::Ko, "한국어")]
                    {
                        if ui.selectable_label(now == lang, name).clicked() {
                            i18n::set(lang);
                            if let Some(p) = &self.profile {
                                let _ = p.set_setting("language", i18n::code(lang));
                            }
                            ui.close();
                        }
                    }
                });
                ui.menu_button(t("Import"), |ui| {
                    let sources = import_chrome::sources();
                    if sources.is_empty() {
                        ui.weak(t("No Chrome, Chromium, Edge or Brave profile found"));
                    }
                    for s in &sources {
                        if ui.button(tf("Import from {0}", &[&s.name])).clicked() {
                            self.import_from(s);
                            ui.close();
                        }
                        if s.profile.join("Login Data").exists()
                            && ui
                                .button(tf("Import passwords from {0}", &[&s.name]))
                                .clicked()
                        {
                            let scratch = self
                                .profile
                                .as_ref()
                                .map(|p| p.dir.join("import-tmp"))
                                .unwrap_or_else(std::env::temp_dir);
                            let (logins, skipped) =
                                match import_chrome::import_passwords(s, &scratch) {
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
                        && ui
                            .button(t("Import passwords from Chrome Passwords.csv"))
                            .clicked()
                    {
                        let logins = import_chrome::import_passwords_csv(&csv);
                        self.import_passwords(logins, 0, t("the CSV file"));
                        ui.close();
                    }
                });
            });
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
            media: self.media.take_tab(id),
            drm: self.drm.take(id),
            login: self.agent_logins.remove(&id),
            tab,
        };
        self.requests.push(browser::Request::Detach {
            moved: Box::new(moved),
            at,
        });
        self.activated();
        self.save_session();
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

    /// The tab strip: tabs share the width up to 220pt each; the active one
    /// joins the toolbar below it.
    fn tab_bar(&mut self, ui: &mut egui::Ui) {
        let p = *theme::palette(ui);
        let height = 40.0;
        // The strip is the title bar: drag it to move the window, double-click to maximize.
        let (strip, drag) = ui.allocate_exact_size(
            Vec2::new(ui.available_width(), height),
            Sense::click_and_drag(),
        );
        let strip_fill = if self.incognito {
            p.surface_raised
        } else {
            p.surface_sunken
        };
        ui.painter().rect_filled(strip, 0.0, strip_fill);
        if drag.drag_started_by(egui::PointerButton::Primary) {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
        }
        let maximized = ui.ctx().input(|i| i.viewport().maximized.unwrap_or(false));
        if drag.double_clicked() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
        }
        let mut select = None;
        let mut close = None;
        let plus_side = 28.0;
        // macOS draws its traffic lights over the strip's left end.
        let left_pad = if cfg!(target_os = "macos") {
            76.0
        } else {
            size::SPACE_2
        };
        let captions = if cfg!(target_os = "macos") {
            0.0
        } else {
            self.caption_buttons(ui, strip, maximized)
        };
        let badge = if self.incognito {
            self.incognito_badge(ui, strip, captions)
        } else {
            0.0
        };
        let strip = Rect::from_min_max(
            strip.min,
            egui::pos2(strip.right() - captions - badge, strip.bottom()),
        );
        let left = strip.left() + left_pad;
        let room = (strip.width() - left_pad - size::SPACE_2 - plus_side - size::SPACE_1).max(0.0);
        let n = self.model.tabs.len().max(1) as f32;
        let width = (room / n).clamp(48.0, 220.0);
        let top = strip.top() + 6.0;
        let count = self.model.tabs.len();
        let pointer = ui.ctx().pointer_latest_pos();
        let mut drag_state = self.tab_drag;
        let mut reorder = None;
        let mut move_out = None;
        // Where a tab dragged out of the strip was let go, on screen.
        let mut drop_at: Option<egui::Pos2> = None;
        // Pulled this far above or below the strip, a tab leaves the window.
        let detach_at = 40.0;
        let detached = |y: f32| y > strip.bottom() + detach_at || y < strip.top() - detach_at;
        // The dragged tab is painted last, over the tabs it slides across.
        let mut order: Vec<usize> = (0..count).collect();
        if let Some(d) = drag_state.and_then(|(id, _)| self.model.index_of(id)) {
            order.retain(|&i| i != d);
            order.push(d);
        }
        for i in order {
            let tab = &self.model.tabs[i];
            // Every window is on the one relay, so agent tabs move too.
            let detachable = count > 1;
            let out = |y: f32| detachable && detached(y);
            let slot = left + i as f32 * width;
            if slot > strip.right() - plus_side {
                continue;
            }
            let id = ui.id().with(("tab", tab.id));
            let dragging = drag_state.filter(|(d, _)| *d == tab.id);
            // Other tabs slide to their new places; the dragged one follows the pointer.
            let x = match (dragging, pointer) {
                (Some((_, grab)), Some(pos)) if !out(pos.y) => {
                    let max = left + count.saturating_sub(1) as f32 * width;
                    let x = (pos.x - grab).clamp(left, max.max(left));
                    ui.ctx().animate_value_with_time(id.with("x"), x, 0.0)
                }
                _ => ui.ctx().animate_value_with_time(id.with("x"), slot, 0.12),
            };
            let rect =
                Rect::from_min_size(egui::pos2(x, top), Vec2::new(width, strip.bottom() - top));
            let r = ui.interact(rect, id, Sense::click_and_drag());
            if r.drag_started_by(egui::PointerButton::Primary) {
                let grab = r.interact_pointer_pos().map_or(0.0, |p| p.x - x);
                drag_state = Some((tab.id, grab));
                select = Some(i);
            }
            if let (Some((_, grab)), Some(pos)) = (dragging, pointer) {
                if r.drag_stopped() {
                    drag_state = None;
                    if out(pos.y) {
                        move_out = Some(i);
                        // The new window's first tab sits where this one was
                        // held: its strip starts at the left pad, 6 points down.
                        let origin = ui
                            .ctx()
                            .input(|i| i.viewport().inner_rect.map(|r| r.min))
                            .unwrap_or_default();
                        drop_at =
                            Some(origin + pos.to_vec2() - Vec2::new(grab + left_pad, 6.0 + 12.0));
                    }
                } else if !out(pos.y) {
                    let to = ((pos.x - grab - left) / width + 0.5).floor();
                    let to = (to.max(0.0) as usize).min(count.saturating_sub(1));
                    if to != i {
                        reorder = Some((i, to));
                    }
                } else {
                    // Out of the strip: a copy of the tab rides under the pointer.
                    let ghost = Rect::from_min_size(pos - Vec2::new(grab, 12.0), rect.size());
                    let fg = ui
                        .ctx()
                        .layer_painter(egui::LayerId::new(egui::Order::Tooltip, id.with("ghost")));
                    fg.rect_filled(ghost, CornerRadius::same(size::RADIUS_MD), p.surface_base);
                    fg.rect_stroke(
                        ghost,
                        CornerRadius::same(size::RADIUS_MD),
                        Stroke::new(1.0, p.border_subtle),
                        egui::StrokeKind::Inside,
                    );
                    fg.text(
                        egui::pos2(ghost.left() + 12.0, ghost.center().y),
                        egui::Align2::LEFT_CENTER,
                        tab.label(),
                        egui::FontId::proportional(12.5),
                        p.ink_primary,
                    );
                }
            }
            let active = i == self.model.active;
            let painter = ui.painter_at(rect.expand2(Vec2::new(8.0, 0.0)));
            let top_round = CornerRadius {
                nw: size::RADIUS_MD,
                ne: size::RADIUS_MD,
                sw: 0,
                se: 0,
            };
            if active {
                painter.rect_filled(rect, top_round, p.surface_base);
            } else if r.hovered() {
                painter.rect_filled(
                    rect.shrink2(Vec2::new(2.0, 3.0)),
                    CornerRadius::same(size::RADIUS_SM),
                    p.surface_raised,
                );
            } else if i + 1 != self.model.active && i + 1 < self.model.tabs.len() {
                painter.vline(
                    rect.right(),
                    rect.y_range().shrink(9.0),
                    Stroke::new(1.0, p.border_subtle),
                );
            }
            // Icon: a spinner while loading, the sparkle for agent tabs, else a globe.
            let icon_rect = Rect::from_center_size(
                egui::pos2(rect.left() + 18.0, rect.center().y),
                Vec2::splat(16.0),
            );
            if tab.loading {
                egui::Spinner::new()
                    .size(14.0)
                    .color(p.ink_brand)
                    .paint_at(ui, icon_rect);
            } else if tab.agent {
                Icon::Sparkle.paint(ui, icon_rect, p.ink_brand);
            } else if internal::is_internal(&tab.url) || tab.url == NEW_TAB {
                Icon::Sparkle.paint(ui, icon_rect, p.ink_secondary);
            } else {
                Icon::Globe.paint(ui, icon_rect, p.ink_muted);
            }
            let show_close = active || r.hovered();
            let close_rect = Rect::from_center_size(
                egui::pos2(rect.right() - 16.0, rect.center().y),
                Vec2::splat(20.0),
            );
            let mut label = tab.label().to_string();
            if label.is_empty() {
                label = t("New tab").to_string();
            }
            let text_left = icon_rect.right() + 8.0;
            let text_right = if show_close {
                close_rect.left() - 4.0
            } else {
                rect.right() - 10.0
            };
            if text_right - text_left > 12.0 {
                let ink = if active {
                    p.ink_primary
                } else {
                    p.ink_secondary
                };
                let galley = ui.painter().layout(
                    label,
                    egui::FontId::proportional(12.5),
                    ink,
                    f32::INFINITY,
                );
                let clip = Rect::from_x_y_ranges(text_left..=text_right, rect.y_range());
                let tp = ui.painter_at(clip);
                tp.galley(
                    egui::pos2(text_left, rect.center().y - galley.size().y / 2.0),
                    galley.clone(),
                    ink,
                );
                if galley.size().x > clip.width() {
                    // Fade the cut end into the tab instead of an ellipsis.
                    let bg = if active {
                        p.surface_base
                    } else if r.hovered() {
                        p.surface_raised
                    } else {
                        p.surface_sunken
                    };
                    let fade = Rect::from_x_y_ranges(
                        (text_right - 18.0)..=text_right,
                        rect.y_range().shrink(6.0),
                    );
                    let mut mesh = egui::Mesh::default();
                    mesh.colored_vertex(fade.left_top(), bg.gamma_multiply(0.0));
                    mesh.colored_vertex(fade.right_top(), bg);
                    mesh.colored_vertex(fade.right_bottom(), bg);
                    mesh.colored_vertex(fade.left_bottom(), bg.gamma_multiply(0.0));
                    mesh.add_triangle(0, 1, 2);
                    mesh.add_triangle(0, 2, 3);
                    tp.add(mesh);
                }
            }
            if show_close {
                let cr = ui.interact(close_rect, id.with("close"), Sense::click());
                if cr.hovered() {
                    painter.rect_filled(
                        close_rect,
                        CornerRadius::same(size::RADIUS_XS),
                        p.border_subtle,
                    );
                }
                Icon::Close.paint(
                    ui,
                    close_rect.shrink(4.0),
                    if cr.hovered() {
                        p.ink_primary
                    } else {
                        p.ink_secondary
                    },
                );
                if cr.on_hover_text(t("Close tab")).clicked() {
                    close = Some(i);
                }
            }
            let r = r.on_hover_text(&tab.url);
            if r.clicked() {
                select = Some(i);
            }
            if r.middle_clicked() {
                close = Some(i);
            }
            r.context_menu(|ui| {
                if ui
                    .add_enabled(detachable, egui::Button::new(t("Move to new window")))
                    .clicked()
                {
                    move_out = Some(i);
                    ui.close();
                }
            });
        }
        if drag_state.is_some() && !ui.ctx().input(|i| i.pointer.primary_down()) {
            // The press ended somewhere the tab never heard of it.
            drag_state = None;
        }
        self.tab_drag = drag_state;
        let shown = self.model.tabs.len() as f32;
        let plus_x =
            (left + shown * width + size::SPACE_1).min(strip.right() - plus_side - size::SPACE_1);
        let plus_rect = Rect::from_min_size(
            egui::pos2(plus_x, strip.center().y - plus_side / 2.0 + 3.0),
            Vec2::splat(plus_side),
        );
        let mut plus_ui = ui.new_child(egui::UiBuilder::new().max_rect(plus_rect));
        let new_tab =
            theme::icon_button_sized(&mut plus_ui, Icon::Plus, t("New tab"), plus_side, true)
                .clicked();
        if let Some(i) = move_out {
            self.move_to_new_window(i, drop_at);
        } else if new_tab {
            self.open_tab(NEW_TAB, true);
        } else if let Some(i) = close {
            self.close_tab(i);
        } else if let Some(i) = select {
            self.select_tab(i);
        }
        if let Some((from, to)) = reorder {
            self.model.move_tab(from, to);
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
            if r.on_hover_text(tip).clicked() {
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
                        + 4.0;
                    let width = (ui.available_width() - after).max(120.0);
                    let (pill, _) = ui.allocate_exact_size(Vec2::new(width, 36.0), Sense::hover());
                    field_rect = pill;
                    let focused = ui.memory(|m| m.has_focus(self.address_id));
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
                    let field = field_ui.add(
                        egui::TextEdit::singleline(&mut self.address)
                            .id(self.address_id)
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
                    if self.focus_address {
                        self.focus_address = false;
                        field.request_focus();
                        self.editing = true;
                    }
                    if field.gained_focus() {
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
                        self.editing = true;
                    }
                    if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                        if let Some(prompt) = agent_prompt(&self.address) {
                            self.ask_agent(prompt.trim().to_string());
                        } else if !self.address.trim().is_empty() {
                            go = Some(model::to_url(&self.address));
                        }
                    }
                    if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Escape)) {
                        self.editing = false;
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
                    self.menu(ui);
                });
            });

        // Suggestions float under the address field while the person types.
        if self.editing && ui.memory(|m| m.has_focus(self.address_id)) {
            let list = self.model.suggest(&self.address, 8);
            if !list.is_empty() {
                egui::Area::new(egui::Id::new("suggestions"))
                    .order(egui::Order::Foreground)
                    .fixed_pos(egui::pos2(field_rect.left(), field_rect.bottom() + 4.0))
                    .show(ui.ctx(), |ui| {
                        egui::Frame::popup(ui.style())
                            .inner_margin(egui::Margin::same(6))
                            .corner_radius(CornerRadius::same(size::RADIUS_LG))
                            .show(ui, |ui| {
                                ui.set_width(field_rect.width() - 12.0);
                                for s in list {
                                    let icon = match s.kind {
                                        SuggestionKind::Bookmark => Icon::Star,
                                        SuggestionKind::History => Icon::History,
                                        SuggestionKind::Search => Icon::Search,
                                    };
                                    let (row, r) = ui.allocate_exact_size(
                                        Vec2::new(ui.available_width(), 34.0),
                                        Sense::click(),
                                    );
                                    if r.hovered() {
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
                                    let title = if s.title.is_empty() {
                                        s.url.clone()
                                    } else {
                                        s.title.clone()
                                    };
                                    let painter = ui.painter_at(row.shrink2(Vec2::new(4.0, 0.0)));
                                    let g = painter.layout_no_wrap(
                                        theme::elide(&title, 60),
                                        egui::FontId::proportional(13.0),
                                        p.ink_primary,
                                    );
                                    let tw = g.size().x;
                                    painter.galley(
                                        egui::pos2(
                                            row.left() + 38.0,
                                            row.center().y - g.size().y / 2.0,
                                        ),
                                        g,
                                        p.ink_primary,
                                    );
                                    if !s.title.is_empty() {
                                        painter.text(
                                            egui::pos2(
                                                row.left() + 38.0 + tw + 10.0,
                                                row.center().y,
                                            ),
                                            egui::Align2::LEFT_CENTER,
                                            theme::elide(&s.url, 70),
                                            egui::FontId::proportional(12.0),
                                            p.ink_muted,
                                        );
                                    }
                                    if r.clicked() {
                                        go = Some(s.url.clone());
                                    }
                                }
                            });
                    });
            }
        }
        if let Some(url) = go {
            self.editing = false;
            ui.memory_mut(|m| m.surrender_focus(self.address_id));
            self.navigate(url);
        }
    }

    fn has_logins(&self, url: &str) -> bool {
        match (&self.vault, vault::origin_of(url)) {
            (Some(v), Some(origin)) => !v.logins_for(&origin).is_empty(),
            _ => false,
        }
    }

    fn bookmarks_bar(&mut self, ui: &mut egui::Ui) {
        let p = *theme::palette(ui);
        let top_level: Vec<(usize, model::Bookmark)> = self
            .model
            .bookmarks
            .iter()
            .cloned()
            .enumerate()
            .filter(|(_, b)| b.folder.is_empty())
            .collect();
        let mut go = None;
        let mut go_new_tab = None;
        let mut remove = None;
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
                if top_level.is_empty() {
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
                        let r = r.on_hover_text(&b.url);
                        if r.clicked() {
                            go = Some(b.url.clone());
                        }
                        if r.middle_clicked() {
                            go_new_tab = Some(b.url.clone());
                        }
                        r.context_menu(|ui| {
                            if ui.button(t("Open in new tab")).clicked() {
                                go_new_tab = Some(b.url.clone());
                                ui.close();
                            }
                            if ui.button(t("Remove")).clicked() {
                                remove = Some(*i);
                                ui.close();
                            }
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
                "bytes://redrob-ui/redrob-browser-icon.svg",
                theme::BRAND_ICON,
            )
            .fit_to_exact_size(Vec2::splat(64.0))
            .corner_radius(14),
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
                let page = self
                    .model
                    .active_tab()
                    .map(|t| t.url.clone())
                    .unwrap_or_default();
                let mut drm_notice = None;
                let active = self.active_id();
                if self.drm.wants_bar(active, &page) {
                    theme::bar(ui, Bar::Info, |ui| {
                        if let drm_tab::Choice::Notice(n) = self.drm.bar(ui, active, &page) {
                            drm_notice = Some(n);
                        }
                    });
                }
                if let Some(n) = drm_notice {
                    self.notice = Some(n);
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

        if self.show_devtools {
            egui::Panel::right("devtools")
                .resizable(true)
                .default_size(440.0)
                .frame(
                    egui::Frame::new()
                        .fill(p.surface_raised)
                        .inner_margin(egui::Margin::same(8))
                        .stroke(Stroke::new(1.0, p.border_subtle)),
                )
                .show(ui, |ui| self.devtools_panel(ui));
        }

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
                let (rect, response) =
                    ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
                let scale = ctx.pixels_per_point();
                // At a fractional scale the page area is a fractional number
                // of CSS pixels; round up so the page covers its last column
                // and row instead of leaving a white line.
                let size = (
                    (rect.width() - 0.01).ceil() as u32,
                    (rect.height() - 0.01).ceil() as u32,
                    scale,
                );
                if size != self.last_size && size.0 > 0 && size.1 > 0 {
                    self.last_size = size;
                    let _ = self.commands.send(Command::Resize {
                        width: size.0,
                        height: size.1,
                        scale,
                    });
                }
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
                    );
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
                    if let Some(u) = act.open {
                        self.navigate(u);
                    }
                    return;
                }
                // Web pages are white until they paint, as in every browser.
                ui.painter().rect_filled(rect, 0.0, Color32::WHITE);
                let page_slot = ui.painter().add(egui::Shape::Noop);
                let page_id = self.model.tabs[tab_index].id;
                let view = (rect.width(), rect.height());
                let local = |p: egui::Pos2| (p.x - rect.left(), p.y - rect.top());
                let mut animating = self.model.tabs[tab_index].scene.tick();
                let res = self.model.tabs[tab_index].scene.resolve(view);
                // Scrollbars take their own pointer input before the page.
                let bars =
                    compositor::scrollbars(ui, rect, &mut self.model.tabs[tab_index].scene, &res);
                let over_bar = |p: &egui::Pos2| bars.iter().any(|b| b.contains(*p));

                if response.clicked() || response.drag_started() {
                    response.request_focus();
                    self.editing = false;
                }
                let focused = response.has_focus();
                let mut events = ui.input(|i| i.events.clone());
                events.retain(|e| match e {
                    egui::Event::PointerButton { pos, .. } => !over_bar(pos),
                    _ => true,
                });
                let pointer = ui.input(|i| i.pointer.hover_pos());
                // Middle-click autoscroll takes its clicks before the page sees them.
                let ask = self.autoscroll.filter(&mut events, rect);
                if let Some((x, y)) = ask.ask_link_at {
                    let scene = &self.model.tabs[tab_index].scene;
                    if scene.has_frame() {
                        // The hit regions know the link: no round trip.
                        let link = scene.hover(&res, (x, y)).and_then(|h| h.link);
                        if let Some(url) = self.autoscroll.link_answer(link) {
                            self.open_tab(&url, false);
                        }
                    } else {
                        self.op(page_id, Op::LinkAt { x, y });
                    }
                }
                let tab_index = self.model.active;
                if self.autoscroll.active() {
                    let step = self.autoscroll.tick(pointer, rect);
                    if let Some(anchor) = self.autoscroll.anchor() {
                        let t = &mut self.model.tabs[tab_index];
                        t.scene.scroll_at(
                            &res,
                            local(anchor),
                            (step.scroll.x, step.scroll.y),
                            false,
                        );
                    }
                    let p = *theme::palette(ui);
                    self.autoscroll.paint(
                        ui.painter(),
                        p.ink_primary,
                        p.surface_base.gamma_multiply(0.9),
                    );
                    ui.ctx().set_cursor_icon(egui::CursorIcon::AllScroll);
                    ui.ctx().request_repaint();
                }
                if response.hovered() || focused || response.is_pointer_button_down_on() {
                    let hover = pointer.filter(|p| !over_bar(p));
                    let t = &mut self.model.tabs[tab_index];
                    let mut ops = devtools::pick_input(
                        &mut t.devtools,
                        &mut events,
                        rect,
                        self.show_devtools,
                    );
                    let input = input::page_ops(&events, hover, rect, focused);
                    ops.extend(input.ops);
                    if let Some(at) = input.pressed_at {
                        t.scene.pointer_down(&res, at);
                    }
                    for w in input.wheel {
                        let node = t.scene.hover(&res, w.at).map(|h| h.node);
                        let scrolled = match t.scene.wheel_plan(node) {
                            compositor::WheelPlan::Scrolled => {
                                t.scene.scroll_at(&res, w.at, w.delta, w.smooth);
                                true
                            }
                            compositor::WheelPlan::Deferred | compositor::WheelPlan::Cancelled => {
                                false
                            }
                        };
                        ops.push(Op::Wheel {
                            x: w.at.0,
                            y: w.at.1,
                            dx: w.delta.0,
                            dy: w.delta.1,
                            modifiers: w.modifiers,
                            node,
                            scrolled,
                            smooth: w.smooth,
                        });
                    }
                    let id = t.id;
                    for op in ops {
                        self.op(id, op);
                    }
                }
                let t = &mut self.model.tabs[tab_index];
                t.scene.flush();
                animating |= t.scene.tick();
                // Offsets may have moved this frame: draw with the new ones.
                let res = t.scene.resolve(view);
                let scale = ctx.pixels_per_point();
                match &mut self.gpu {
                    Ok(gpu) => {
                        let media = &mut self.media;
                        let texture = gpu.draw(
                            self.wid,
                            page_id,
                            &mut t.scene,
                            &res,
                            view,
                            scale,
                            &mut |key| media.external_frame(page_id, key),
                        );
                        if let (Some(id), true) = (texture, t.scene.has_frame()) {
                            // Whole physical pixels, so the texture maps 1:1.
                            let min = (rect.min.to_vec2() * scale).round() / scale;
                            let shown = Rect::from_min_size(min.to_pos2(), rect.size());
                            let uv = Rect::from_min_max(egui::pos2(0.0, 0.0), egui::pos2(1.0, 1.0));
                            ui.painter().set(
                                page_slot,
                                egui::Shape::image(id, shown.intersect(rect), uv, Color32::WHITE),
                            );
                        }
                    }
                    Err(e) => {
                        ui.painter().text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            tf("This page cannot be drawn: {0}", &[e]),
                            egui::FontId::proportional(14.0),
                            Color32::from_gray(90),
                        );
                    }
                }
                if !t.scene.has_frame() {
                    if let Some(e) = &t.scene.error {
                        ui.painter().text(
                            rect.center(),
                            egui::Align2::CENTER_CENTER,
                            tf("This page cannot be drawn: {0}", &[e]),
                            egui::FontId::proportional(14.0),
                            Color32::from_gray(90),
                        );
                    }
                }
                let composited = t.scene.external_rects(&res);
                self.media.set_composited(page_id, &composited);
                // The cursor and the hovered link come from the hit regions.
                let t = &self.model.tabs[tab_index];
                let hovered = pointer
                    .filter(|p| rect.contains(*p) && !over_bar(p) && response.hovered())
                    .and_then(|p| t.scene.hover(&res, local(p)));
                let in_page = pointer.is_some_and(|p| rect.contains(p));
                if !self.autoscroll.active() && in_page && response.hovered() {
                    ui.ctx()
                        .set_cursor_icon(compositor::cursor_icon(hovered.as_ref()));
                }
                if let Some(link) = hovered.as_ref().and_then(|h| h.link.as_deref()) {
                    compositor::status_bubble(ui, rect, link, pointer);
                }
                if animating {
                    ctx.request_repaint();
                }
                // Video layers go over the page.
                if !self.media.is_empty() {
                    let commands = self.commands.clone();
                    self.media.poll(Some(page_id), |t, op| {
                        let _ = commands.send(Command::Tab(t, op));
                    });
                    if self.media.paint(ui, rect, page_id) {
                        ctx.request_repaint_after(std::time::Duration::from_millis(16));
                    } else {
                        ctx.request_repaint_after(std::time::Duration::from_millis(250));
                    }
                }

                if let Some(model) = &self.model.tabs[tab_index].devtools.highlight {
                    devtools::paint_highlight(ui.painter(), rect, model);
                }
            });
    }
}
