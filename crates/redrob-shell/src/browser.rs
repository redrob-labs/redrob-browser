//! The browser process: every window of one profile, on one engine connection.
//!
//! The engine gives every CDP connection its own pages (docs/AGENT.md), so all
//! windows share this process's one connection and its one relay. Each window
//! is an OS window (an egui viewport) drawing its own [`Window`]; a tab is
//! handed between windows as it is, with its engine target, so its page,
//! history, scroll position and form state come along without a reload.
//!
//! What windows share lives here and is lent to the window being drawn: the
//! profile database, the password vault, bookmarks, history, downloads and
//! recently closed tabs. Engine updates arrive on one channel and go to the
//! window showing their tab.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{mpsc, Arc};
use std::time::{Duration, Instant};

use egui::ViewportId;

use crate::cdp::{self, Event, Update, WindowId};
use crate::model::{self, Bookmark, DownloadItem, HistoryEntry, Model, Tab, TabId};
use crate::profile::{Bounds, Profile, SavedWindow, SessionWindow};
use crate::{media_view, relay, theme, updater, vault, Window, NEW_TAB};

/// Everything `main` prepared before the first window opens.
pub struct Start {
    pub ws_url: String,
    pub endpoint_file: std::path::PathBuf,
    pub profile: Option<Profile>,
    pub incognito: bool,
    pub restore: Vec<SavedWindow>,
    pub start_url: Option<String>,
}

/// What a window asks of the browser.
pub enum Request {
    NewWindow,
    /// Open a new window holding this tab. `at`: its top-left on screen.
    Detach {
        moved: Box<Moved>,
        at: Option<egui::Pos2>,
    },
    /// Close every window and keep them all in the saved session.
    Quit,
}

/// A tab on its way to another window, with what its window kept for it.
pub struct Moved {
    pub tab: Tab,
    pub media: media_view::TabMedia,
    pub drm: Option<String>,
    pub login: Option<(String, tokio::sync::oneshot::Sender<serde_json::Value>)>,
}

/// Lent to the window being drawn, and taken back after.
#[derive(Default)]
struct Shared {
    profile: Option<Profile>,
    vault: Option<vault::Vault>,
    bookmarks: Vec<Bookmark>,
    history: Vec<HistoryEntry>,
    downloads: Vec<DownloadItem>,
    closed: Vec<(String, String)>,
    /// One GPU painter for all windows: a moved tab's GPU tiles stay valid.
    #[cfg(feature = "gpu")]
    gpu: Option<crate::gpu_paint::GpuPainter>,
}

impl Shared {
    fn lend(&mut self, w: &mut Window) {
        w.profile = self.profile.take();
        w.vault = self.vault.take();
        #[cfg(feature = "gpu")]
        {
            w.gpu = self.gpu.take();
        }
        std::mem::swap(&mut w.model.bookmarks, &mut self.bookmarks);
        std::mem::swap(&mut w.model.history, &mut self.history);
        std::mem::swap(&mut w.model.downloads, &mut self.downloads);
        std::mem::swap(&mut w.model.closed, &mut self.closed);
    }

    fn reclaim(&mut self, w: &mut Window) {
        self.profile = w.profile.take();
        self.vault = w.vault.take();
        #[cfg(feature = "gpu")]
        {
            self.gpu = w.gpu.take();
        }
        std::mem::swap(&mut w.model.bookmarks, &mut self.bookmarks);
        std::mem::swap(&mut w.model.history, &mut self.history);
        std::mem::swap(&mut w.model.downloads, &mut self.downloads);
        std::mem::swap(&mut w.model.closed, &mut self.closed);
    }
}

/// Engine updates for a tab the browser has not placed yet (a popup whose
/// `Opened` is still on its way) wait here, at most this many.
const MAX_ORPHANS: usize = 64;

pub struct Browser {
    /// In the order they opened; the first one drawn in the root viewport,
    /// while it lives.
    windows: Vec<Window>,
    shared: Shared,
    updates: mpsc::Receiver<Update>,
    commands: tokio::sync::mpsc::UnboundedSender<(WindowId, cdp::Command)>,
    open_rx: mpsc::Receiver<Option<String>>,
    login_rx: mpsc::Receiver<relay::LoginRequest>,
    places: relay::Places,
    last_places: HashMap<String, relay::TabPlace>,
    orphans: Vec<Update>,
    next_wid: WindowId,
    focused: WindowId,
    incognito: bool,
    /// The updater's answer, for the first window made.
    update_rx: Option<mpsc::Receiver<updater::Available>>,
    session_sig: u64,
    session_saved_at: Instant,
    /// The session was saved for the last time; closing must not overwrite it.
    final_saved: bool,
}

/// The OS window for a browser window: undecorated except on macOS, at
/// `bounds` when known.
pub fn window_builder(
    incognito: bool,
    bounds: Option<Bounds>,
    maximized: bool,
) -> egui::ViewportBuilder {
    static ICON: std::sync::OnceLock<Arc<egui::IconData>> = std::sync::OnceLock::new();
    let icon = ICON.get_or_init(|| Arc::new(crate::app_icon())).clone();
    let mut b = egui::ViewportBuilder::default()
        .with_title(if incognito {
            "Redrob Browser (Incognito)"
        } else {
            "Redrob Browser"
        })
        .with_inner_size([1280.0, 860.0])
        .with_min_inner_size([480.0, 360.0])
        // The tab strip is the title bar, as in Chrome: macOS keeps its
        // traffic lights over it; Windows and Linux get the window's own
        // minimize, maximize and close buttons at its right end.
        .with_decorations(cfg!(target_os = "macos"))
        .with_fullsize_content_view(cfg!(target_os = "macos"))
        .with_titlebar_shown(!cfg!(target_os = "macos"))
        .with_title_shown(!cfg!(target_os = "macos"))
        .with_icon(icon);
    if let Some(r) = bounds {
        b = b
            .with_position([r.x, r.y])
            .with_inner_size([r.width.max(480.0), r.height.max(360.0)]);
    }
    if maximized {
        b = b.with_maximized(true);
    }
    b
}

impl Browser {
    pub fn start(cc: &eframe::CreationContext<'_>, start: Start) -> Self {
        let ctx = cc.egui_ctx.clone();
        theme::install(&ctx);
        theme::set_preference(
            &ctx,
            &start
                .profile
                .as_ref()
                .and_then(|p| p.setting("theme"))
                .unwrap_or_default(),
        );
        if start.incognito {
            ctx.set_theme(egui::ThemePreference::Dark);
        }
        let (cmd_tx, cmd_rx) = tokio::sync::mpsc::unbounded_channel();
        let (upd_tx, upd_rx) = mpsc::channel();
        let (login_tx, login_rx) = mpsc::channel();
        let (open_tx, open_rx) = mpsc::channel();
        let places: relay::Places = Default::default();
        // Background threads wake the root viewport; the other windows are
        // drawn from its frame.
        let wake_ctx = ctx.clone();
        let relay_window = relay::Window {
            login: login_tx,
            open_window: open_tx,
            places: places.clone(),
            wake: Arc::new(move || wake_ctx.request_repaint_of(ViewportId::ROOT)),
        };
        let (ws_url, endpoint_file) = (start.ws_url, start.endpoint_file);
        let repaint_ctx = ctx.clone();
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            let errors = upd_tx.clone();
            rt.block_on(async move {
                if let Err(e) = cdp::run(
                    ws_url,
                    endpoint_file,
                    relay_window,
                    cmd_rx,
                    upd_tx,
                    move || repaint_ctx.request_repaint_of(ViewportId::ROOT),
                )
                .await
                {
                    let _ = errors.send(Update {
                        tab: 0,
                        event: Event::Error(e.to_string()),
                    });
                }
            });
        });

        let profile = start.profile;
        let (update_tx, update_rx) = mpsc::channel();
        // Check for a newer release at most once a day, off the UI thread.
        let last = profile
            .as_ref()
            .and_then(|p| p.setting("update_checked"))
            .and_then(|v| v.parse::<u64>().ok())
            .unwrap_or(0);
        if model::now().saturating_sub(last) > updater::CHECK_EVERY_SECS {
            if let Some(p) = &profile {
                let _ = p.set_setting("update_checked", &model::now().to_string());
            }
            std::thread::spawn(move || {
                if let Ok(Some(a)) = updater::check() {
                    let _ = update_tx.send(a);
                }
            });
        }
        let mut loaded = Model::default();
        if let Some(p) = &profile {
            if let Err(e) = p.load(&mut loaded) {
                eprintln!("redrob-browser: could not read bookmarks and history: {e}");
            }
        }
        let vault = match profile.as_ref().filter(|_| !start.incognito) {
            Some(p) => match vault::Vault::open(&p.dir) {
                Ok(v) => Some(v),
                Err(e) => {
                    eprintln!("redrob-browser: password vault unavailable: {e}");
                    None
                }
            },
            None => None,
        };
        let mut browser = Self {
            windows: Vec::new(),
            shared: Shared {
                profile,
                vault,
                bookmarks: loaded.bookmarks,
                history: loaded.history,
                downloads: Vec::new(),
                closed: Vec::new(),
                #[cfg(feature = "gpu")]
                gpu: cc
                    .wgpu_render_state
                    .as_ref()
                    .and_then(crate::gpu_paint::GpuPainter::new),
            },
            updates: upd_rx,
            commands: cmd_tx,
            open_rx,
            login_rx,
            places,
            last_places: HashMap::new(),
            orphans: Vec::new(),
            next_wid: 1,
            focused: 1,
            incognito: start.incognito,
            update_rx: Some(update_rx),
            session_sig: 0,
            session_saved_at: Instant::now(),
            final_saved: false,
        };

        let mut restore = start.restore;
        if restore.is_empty() {
            restore.push(SavedWindow {
                tabs: Vec::new(),
                active: 0,
                bounds: None,
                maximized: false,
            });
        }
        for (i, saved) in restore.into_iter().enumerate() {
            let builder = window_builder(browser.incognito, saved.bounds, saved.maximized);
            let mut w = browser.make_window(i == 0, builder);
            w.bounds = saved.bounds;
            w.maximized = saved.maximized;
            w.restore(saved.tabs, saved.active);
            browser.windows.push(w);
        }
        let first = &mut browser.windows[0];
        match start.start_url {
            Some(url) => first.open_tab(&model::to_url(&url), true),
            None if first.model.tabs.is_empty() => first.open_tab(NEW_TAB, true),
            None => {}
        }
        browser.session_sig = browser.session_signature();
        browser
    }

    fn make_window(&mut self, root: bool, builder: egui::ViewportBuilder) -> Window {
        let wid = self.next_wid;
        self.next_wid += 1;
        let viewport = if root {
            ViewportId::ROOT
        } else {
            ViewportId::from_hash_of(("redrob-window", wid))
        };
        let (inbox, updates) = mpsc::channel();
        let (agent_tx, agent_rx) = mpsc::channel();
        let (account_tx, account_rx) = mpsc::channel();
        let (login_tx, login_rx) = mpsc::channel();
        let update_rx = self.update_rx.take().unwrap_or_else(|| mpsc::channel().1);
        Window {
            commands: cdp::Commands {
                window: wid,
                tx: self.commands.clone(),
            },
            updates,
            model: Model::default(),
            profile: None,
            last_session_save: Instant::now(),
            show_downloads: false,
            show_devtools: false,
            internal: Default::default(),
            media: Default::default(),
            drm: Default::default(),
            vault: None,
            pending_save: None,
            agent_tx,
            agent_rx,
            account_tx,
            account_rx,
            update_rx,
            update: None,
            self_update: Default::default(),
            login_rx,
            agent_logins: Default::default(),
            notice: None,
            address: String::new(),
            editing: false,
            focus_address: false,
            error: None,
            last_size: (0, 0, 0.0),
            address_id: egui::Id::new("address"),
            autoscroll: Default::default(),
            incognito: self.incognito,
            wid,
            viewport,
            builder,
            inbox,
            login_tx,
            requests: Vec::new(),
            bounds: None,
            maximized: false,
            session_dirty: false,
            tab_drag: None,
            top_sites: None,
            new_tab_query: String::new(),
            // Lent from `Shared` while the window draws.
            #[cfg(feature = "gpu")]
            gpu: None,
        }
    }

    /// A new window next to `beside` (or the focused one), or with its
    /// top-left at `at`, the size of the window it came from.
    fn new_window(&mut self, beside: Option<usize>, at: Option<egui::Pos2>) -> usize {
        let source = beside
            .or_else(|| self.focused_index())
            .and_then(|i| self.windows.get(i))
            .and_then(|w| w.bounds);
        let bounds = match (at, source) {
            (Some(p), Some(b)) => Some(Bounds {
                x: p.x,
                y: p.y,
                ..b
            }),
            (Some(p), None) => Some(Bounds {
                x: p.x,
                y: p.y,
                width: 1280.0,
                height: 860.0,
            }),
            // Chrome's cascade: a little right of and below the window it came from.
            (None, Some(b)) => Some(Bounds {
                x: b.x + 32.0,
                y: b.y + 32.0,
                ..b
            }),
            (None, None) => None,
        };
        let builder = window_builder(self.incognito, bounds, false).with_active(true);
        let mut w = self.make_window(false, builder);
        w.bounds = bounds;
        self.focused = w.wid;
        self.windows.push(w);
        self.windows.len() - 1
    }

    fn focused_index(&self) -> Option<usize> {
        self.windows
            .iter()
            .position(|w| w.wid == self.focused)
            .or((!self.windows.is_empty()).then_some(0))
    }

    fn owner(&self, tab: TabId) -> Option<usize> {
        self.windows
            .iter()
            .position(|w| w.model.index_of(tab).is_some())
    }

    /// Send engine updates, relay requests and sign-ins to their windows.
    fn route(&mut self) {
        while let Ok(u) = self.updates.try_recv() {
            if let Event::Opened { opener, .. } = &u.event {
                let to = opener
                    .and_then(|o| self.owner(o))
                    .or_else(|| self.focused_index());
                let tab = u.tab;
                if let Some(i) = to {
                    let _ = self.windows[i].inbox.send(u);
                    let (mine, rest): (Vec<_>, Vec<_>) =
                        self.orphans.drain(..).partition(|o| o.tab == tab);
                    self.orphans = rest;
                    for o in mine {
                        let _ = self.windows[i].inbox.send(o);
                    }
                }
                continue;
            }
            match self.owner(u.tab) {
                Some(i) => {
                    let _ = self.windows[i].inbox.send(u);
                }
                // Downloads and connection errors: the window in front.
                None if u.tab == 0 || matches!(u.event, Event::Error(_)) => {
                    if let Some(i) = self.focused_index() {
                        let _ = self.windows[i].inbox.send(u);
                    }
                }
                None => {
                    self.orphans.push(u);
                    if self.orphans.len() > MAX_ORPHANS {
                        self.orphans.remove(0);
                    }
                }
            }
        }
        while let Ok(req) = self.login_rx.try_recv() {
            let to = self
                .windows
                .iter()
                .position(|w| w.model.tabs.iter().any(|t| t.target_id == req.target_id))
                .or_else(|| self.focused_index());
            if let Some(i) = to {
                let _ = self.windows[i].login_tx.send(req);
            }
        }
        while let Ok(url) = self.open_rx.try_recv() {
            let i = self.new_window(None, None);
            let w = &mut self.windows[i];
            match url {
                Some(u) => w.open_tab(&model::to_url(&u), true),
                None => w.open_tab(NEW_TAB, true),
            }
        }
    }

    /// Draw window `i` into `ui`, which belongs to its viewport.
    fn show(&mut self, i: usize, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        let w = &mut self.windows[i];
        let focused = ctx.input(|inp| {
            let v = inp.viewport();
            if let (Some(outer), Some(inner)) = (v.outer_rect, v.inner_rect) {
                w.bounds = Some(Bounds {
                    x: outer.min.x,
                    y: outer.min.y,
                    width: inner.width(),
                    height: inner.height(),
                });
            }
            w.maximized = v.maximized.unwrap_or(false);
            v.focused == Some(true)
        });
        if focused {
            self.focused = w.wid;
        }
        self.shared.lend(w);
        w.frame(ui);
        self.shared.reclaim(w);
    }

    /// A window closed. The last one stays in the saved session, as in
    /// Chrome; any other leaves it, and its tabs close in the engine.
    fn close_window(&mut self, i: usize) {
        if self.windows.len() == 1 {
            self.save_session();
            self.final_saved = true;
            self.windows.remove(i);
            return;
        }
        let mut w = self.windows.remove(i);
        for t in std::mem::take(&mut w.model.tabs) {
            w.media.drop_tab(t.id);
            w.op(t.id, cdp::Op::Close);
        }
        self.save_session();
    }

    fn handle_requests(&mut self, ctx: &egui::Context) {
        let mut requests = Vec::new();
        for (i, w) in self.windows.iter_mut().enumerate() {
            requests.extend(std::mem::take(&mut w.requests).into_iter().map(|r| (i, r)));
        }
        for (from, req) in requests {
            match req {
                Request::NewWindow => {
                    let i = self.new_window(Some(from), None);
                    self.windows[i].open_tab(NEW_TAB, true);
                }
                Request::Detach { moved, at } => {
                    let i = self.new_window(Some(from), at);
                    let Moved {
                        tab,
                        media,
                        drm,
                        login,
                    } = *moved;
                    let w = &mut self.windows[i];
                    let id = tab.id;
                    w.media.put_tab(media);
                    if let Some(key_system) = drm {
                        w.drm.requested(id, key_system);
                    }
                    if let Some(login) = login {
                        w.agent_logins.insert(id, login);
                    }
                    w.model.insert_tab(tab, true);
                    // Activate from the new window: the engine gives the
                    // target that window's page size and keeps it on screen.
                    w.activated();
                }
                Request::Quit => {
                    self.save_session();
                    self.final_saved = true;
                    ctx.send_viewport_cmd_to(ViewportId::ROOT, egui::ViewportCommand::Close);
                }
            }
        }
    }

    /// Tell the relay which window each tab is in, when that changed.
    fn publish_places(&mut self) {
        let mut now = HashMap::new();
        for (n, w) in self.windows.iter().enumerate() {
            for t in &w.model.tabs {
                if !t.target_id.is_empty() {
                    now.insert(
                        t.target_id.clone(),
                        relay::TabPlace {
                            window: n as u32 + 1,
                            agent: t.agent,
                        },
                    );
                }
            }
        }
        if now != self.last_places {
            *self.places.lock().unwrap() = now.clone();
            self.last_places = now;
        }
    }

    /// What the saved session holds, as one number.
    fn session_signature(&self) -> u64 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        for w in &self.windows {
            w.model.active.hash(&mut h);
            for t in &w.model.tabs {
                (t.id, &t.url, &t.title, t.agent).hash(&mut h);
            }
            if let Some(b) = w.bounds {
                (
                    b.x.to_bits(),
                    b.y.to_bits(),
                    b.width.to_bits(),
                    b.height.to_bits(),
                )
                    .hash(&mut h);
            }
            w.maximized.hash(&mut h);
            u8::MAX.hash(&mut h);
        }
        h.finish()
    }

    fn save_session(&mut self) {
        self.session_saved_at = Instant::now();
        for w in &mut self.windows {
            w.session_dirty = false;
        }
        if self.incognito || self.final_saved {
            return;
        }
        let Some(p) = self.shared.profile.as_mut() else {
            return;
        };
        let windows: Vec<SessionWindow<'_>> = self
            .windows
            .iter()
            .map(|w| SessionWindow {
                model: &w.model,
                bounds: w.bounds,
                maximized: w.maximized,
            })
            .collect();
        if let Err(e) = p.save_session(&windows) {
            eprintln!("redrob-browser: could not save the session: {e}");
        }
    }

    /// Save soon after the windows, their tabs or their places change, so a
    /// crash or a kill loses at most a second of it.
    fn save_if_changed(&mut self, ctx: &egui::Context) {
        let sig = self.session_signature();
        let dirty = self.windows.iter().any(|w| w.session_dirty);
        if sig == self.session_sig && !dirty {
            return;
        }
        let wait = Duration::from_secs(1);
        if self.session_saved_at.elapsed() >= wait {
            self.save_session();
            self.session_sig = sig;
        } else {
            ctx.request_repaint_after(wait);
        }
    }
}

impl eframe::App for Browser {
    fn on_exit(&mut self) {
        self.save_session();
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.route();

        if let Some(i) = self
            .windows
            .iter()
            .position(|w| w.viewport == ViewportId::ROOT)
        {
            self.show(i, ui);
            if ctx.input(|i| i.viewport().close_requested()) && self.windows.len() > 1 {
                // The process lives on for the other windows: this one only hides.
                ctx.send_viewport_cmd(egui::ViewportCommand::CancelClose);
                ctx.send_viewport_cmd(egui::ViewportCommand::Visible(false));
                self.close_window(i);
            }
        }
        let children: Vec<ViewportId> = self
            .windows
            .iter()
            .map(|w| w.viewport)
            .filter(|v| *v != ViewportId::ROOT)
            .collect();
        for viewport in children {
            let Some(i) = self.windows.iter().position(|w| w.viewport == viewport) else {
                continue;
            };
            let builder = self.windows[i].builder.clone();
            let closing = ctx.show_viewport_immediate(viewport, builder, |ui, _| {
                self.show(i, ui);
                ui.ctx().input(|i| i.viewport().close_requested())
            });
            if closing {
                self.close_window(i);
            }
        }
        self.handle_requests(&ctx);
        if self.windows.is_empty() {
            ctx.send_viewport_cmd_to(ViewportId::ROOT, egui::ViewportCommand::Close);
            return;
        }
        self.publish_places();
        self.save_if_changed(&ctx);
    }
}
