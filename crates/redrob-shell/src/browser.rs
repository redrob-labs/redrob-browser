//! The browser process: every window of one profile, on one Chromium.
//!
//! Chromium (CEF) runs in this process; all windows share it and its one
//! relay for agents. Each window is an OS window (an egui viewport) drawing
//! its own [`Window`]; a tab is handed between windows as it is, with its
//! Chromium browser, so its page, history, scroll position and form state
//! come along without a reload.
//!
//! What windows share lives here and is lent to the window being drawn: the
//! profile database, the password vault, bookmarks, history, downloads and
//! recently closed tabs. Engine updates arrive on one channel and go to the
//! window showing their tab.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};
use std::sync::{mpsc, Arc, Mutex, MutexGuard};
use std::time::{Duration, Instant};

use egui::ViewportId;

use crate::cdp::{self, Event, Update, WindowId};
use crate::model::{self, Bookmark, Closed, DownloadItem, HistoryEntry, Model, Tab, TabId};
use crate::profile::{Bounds, Profile, SavedWindow, SessionWindow};
use crate::{relay, theme, updater, vault, Window, NEW_TAB};

/// Everything `main` prepared before the first window opens.
pub struct Start {
    pub endpoint_file: std::path::PathBuf,
    pub profile: Option<Profile>,
    pub incognito: bool,
    pub restore: Vec<SavedWindow>,
    pub start_url: Option<String>,
}

/// What a window asks of the browser.
pub enum Request {
    NewWindow,
    /// Open a new window holding these tabs. `at`: its top-left on screen.
    Detach {
        moved: Box<Payload>,
        at: Option<egui::Pos2>,
    },
    /// Open these addresses in a new window: a bookmarks folder's "Open
    /// all in new window".
    OpenWindow(Vec<String>),
    /// Close every window and keep them all in the saved session.
    Quit,
}

/// A tab on its way to another window, with what its window kept for it.
pub struct Moved {
    pub tab: Tab,
    pub login: Option<(String, tokio::sync::oneshot::Sender<serde_json::Value>)>,
}

/// What moves between windows: one tab, or a tab group with its tabs.
pub enum Payload {
    Tab(Moved),
    Group(model::Group, Vec<Moved>),
}

/// What a tab drag holds.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum DragItem {
    Tab(TabId),
    /// A group, by its chip.
    Group(model::GroupId),
}

/// A drag that began in a window's strip: the item, and where the pointer
/// took hold of it (points from the item's top-left).
#[derive(Clone, Copy, Debug)]
pub struct DragStart {
    pub item: DragItem,
    pub grab: egui::Vec2,
}

/// A drag going on in this window's strip: the item follows the pointer,
/// at `x` (window points) less `grab`.
#[derive(Clone, Copy, Debug)]
pub struct DragView {
    pub item: DragItem,
    pub x: f32,
    pub grab: f32,
}

/// The strip as the window last drew it, in window points: where a tab
/// dragged in from another window lands.
#[derive(Clone, Debug)]
pub struct StripLayout {
    pub rect: egui::Rect,
    /// Each tab or chip shown: its center, and the strip index a tab
    /// dropped before it gets.
    pub slots: Vec<(f32, usize)>,
    /// Where the first item starts.
    pub left: f32,
}

impl Default for StripLayout {
    fn default() -> Self {
        Self {
            rect: egui::Rect::NOTHING,
            slots: Vec::new(),
            left: crate::strip::TAB_STRIP_LEFT,
        }
    }
}

/// Pulled this far (points) above or below its strip, a dragged tab
/// leaves the window.
pub const DETACH_AT: f32 = 40.0;

/// A tab drag across windows (Chrome's tab drag controller).
#[derive(Clone, Copy, Debug)]
struct Drag {
    item: DragItem,
    grab: egui::Vec2,
    /// The window that took the press: where the pointer is read from
    /// where the platform does not say (cef/native.rs).
    press: WindowId,
    /// The window moving with the pointer, holding the item alone.
    following: Option<WindowId>,
}

/// Lent to the window being drawn, and taken back after.
#[derive(Default)]
struct Shared {
    profile: Option<Profile>,
    vault: Option<vault::Vault>,
    bookmarks: Vec<Bookmark>,
    history: Vec<HistoryEntry>,
    downloads: Vec<DownloadItem>,
    closed: Vec<Closed>,
}

impl Shared {
    fn lend(&mut self, w: &mut Window) {
        w.profile = self.profile.take();
        w.vault = self.vault.take();
        std::mem::swap(&mut w.model.bookmarks, &mut self.bookmarks);
        std::mem::swap(&mut w.model.history, &mut self.history);
        std::mem::swap(&mut w.model.downloads, &mut self.downloads);
        std::mem::swap(&mut w.model.closed, &mut self.closed);
    }

    fn reclaim(&mut self, w: &mut Window) {
        self.profile = w.profile.take();
        self.vault = w.vault.take();
        std::mem::swap(&mut w.model.bookmarks, &mut self.bookmarks);
        std::mem::swap(&mut w.model.history, &mut self.history);
        std::mem::swap(&mut w.model.downloads, &mut self.downloads);
        std::mem::swap(&mut w.model.closed, &mut self.closed);
    }
}

/// The process was asked to stop (SIGTERM, Ctrl+C).
static QUIT: std::sync::atomic::AtomicBool = std::sync::atomic::AtomicBool::new(false);

/// Engine updates for a tab the browser has not placed yet (a popup whose
/// `Opened` is still on its way) wait here, at most this many.
const MAX_ORPHANS: usize = 64;

struct TargetWaiter {
    tab: TabId,
    reply: tokio::sync::oneshot::Sender<Result<String, String>>,
    since: Instant,
}

pub struct Browser {
    /// In the order they opened; the first one drawn in the root viewport,
    /// while it lives.
    windows: Vec<Window>,
    shared: Shared,
    updates: mpsc::Receiver<Update>,
    commands: tokio::sync::mpsc::UnboundedSender<(WindowId, cdp::Command)>,
    /// What the windows asked of Chromium, run on this thread (cdp.rs).
    command_rx: tokio::sync::mpsc::UnboundedReceiver<(WindowId, cdp::Command)>,
    open_rx: mpsc::Receiver<Option<String>>,
    login_rx: mpsc::Receiver<relay::LoginRequest>,
    /// Agents' tab requests (relay.rs).
    tab_rx: mpsc::Receiver<relay::TabRequest>,
    /// Agent tabs opened and waiting for their target id, which answers
    /// `Target.createTarget`.
    target_waiters: Vec<TargetWaiter>,
    places: relay::Places,
    /// The viewport showing each tab, so an engine update for a tab wakes
    /// only the window it is in.
    placement: Arc<Mutex<HashMap<TabId, ViewportId>>>,
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
    /// A tab or group being dragged, from any window to any window.
    drag: Option<Drag>,
    /// The pointer on screen (points) and the button, as the window that
    /// took the press saw it last (where the platform cannot say).
    press_pointer: Option<(egui::Pos2, bool)>,
    /// Windows, most recently in front last: a drop over windows that
    /// overlap goes to the one in front.
    front: Vec<WindowId>,
}

/// Linux: Xlib has one error handler per process, and winit's keeps the
/// last error of any connection and panics on it at the next focus change.
/// Chromium's GTK connection makes harmless errors (its input method asks
/// where a closed page's window was): those are not winit's, so its hook
/// takes every error of another connection.
#[cfg(target_os = "linux")]
fn ignore_other_x_errors(cc: &eframe::CreationContext<'_>) {
    use winit::raw_window_handle::{HasDisplayHandle as _, RawDisplayHandle};
    let Ok(handle) = cc.display_handle() else {
        return;
    };
    let RawDisplayHandle::Xlib(x) = handle.as_raw() else {
        return;
    };
    let Some(ours) = x.display.map(|d| d.as_ptr() as usize) else {
        return;
    };
    winit::platform::x11::register_xlib_error_hook(Box::new(move |display, _event| {
        display as usize != ours
    }));
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
        #[cfg(target_os = "linux")]
        ignore_other_x_errors(cc);
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
        let (tab_tx, tab_rx) = mpsc::channel();
        let places: relay::Places = Default::default();
        // Background threads wake the root viewport; the other windows are
        // drawn from its frame.
        let wake_ctx = ctx.clone();
        let relay_window = relay::Window {
            login: login_tx,
            open_window: open_tx,
            // Agent tabs are window tabs: the window opens, shows and closes them.
            tabs: Some(tab_tx),
            places: places.clone(),
            wake: Arc::new(move || wake_ctx.request_repaint_of(ViewportId::ROOT)),
        };
        let endpoint_file = start.endpoint_file;
        let repaint_ctx = ctx.clone();
        let placement: Arc<Mutex<HashMap<TabId, ViewportId>>> = Default::default();
        let wake_of = placement.clone();
        // A page changed: redraw the window showing it.
        let sink = crate::cef::Sink::new(
            upd_tx.clone(),
            Arc::new(move |tab: Option<TabId>| {
                let viewport = tab
                    .and_then(|t| wake_of.lock().ok()?.get(&t).copied())
                    .unwrap_or(ViewportId::ROOT);
                repaint_ctx.request_repaint_of(viewport);
            }),
        );
        // A link or text dropped on a window's chrome (cef/xdnd.rs).
        #[cfg(target_os = "linux")]
        {
            let drop_ctx = ctx.clone();
            crate::cef::xdnd::set_waker(move || drop_ctx.request_repaint_of(ViewportId::ROOT));
        }
        // Chromium's work runs in window passes (cef::pump).
        let pump_ctx = ctx.clone();
        crate::cef::set_waker(move |delay| {
            pump_ctx.request_repaint_after_for(delay, ViewportId::ROOT)
        });
        // SIGTERM or Ctrl+C: quit as the menu does, so Chromium writes its
        // cookies and the session is saved.
        let quit_ctx = ctx.clone();
        crate::cef::on_terminate(move || {
            QUIT.store(true, std::sync::atomic::Ordering::SeqCst);
            quit_ctx.request_repaint_of(ViewportId::ROOT);
        });
        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_multi_thread()
                .enable_all()
                .build()
                .expect("tokio runtime");
            let errors = upd_tx.clone();
            rt.block_on(async move {
                if let Err(e) = cdp::relay(endpoint_file, relay_window).await {
                    let _ = errors.send(Update {
                        tab: 0,
                        event: Event::Error(format!("agent relay: {e}")),
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
        // Per-site choices: the profile's, or memory only for incognito.
        let sites = profile
            .as_ref()
            .filter(|_| !start.incognito)
            .and_then(|p| crate::profile::SiteSettings::open(&p.dir).ok())
            .unwrap_or_else(crate::profile::SiteSettings::memory);
        crate::cef::handlers::configure(crate::cef::handlers::Features {
            sites,
            downloads: crate::profile::downloads_dir(),
        });
        cdp::init(sink);
        let mut browser = Self {
            windows: Vec::new(),
            shared: Shared {
                profile,
                vault,
                bookmarks: loaded.bookmarks,
                history: loaded.history,
                downloads: Vec::new(),
                closed: Vec::new(),
            },
            updates: upd_rx,
            commands: cmd_tx,
            command_rx: cmd_rx,
            open_rx,
            login_rx,
            tab_rx,
            target_waiters: Vec::new(),
            places,
            last_places: HashMap::new(),
            placement,
            orphans: Vec::new(),
            next_wid: 1,
            focused: 1,
            incognito: start.incognito,
            update_rx: Some(update_rx),
            session_sig: 0,
            session_saved_at: Instant::now(),
            final_saved: false,
            drag: None,
            press_pointer: None,
            front: Vec::new(),
        };

        let mut restore = start.restore;
        if restore.is_empty() {
            restore.push(SavedWindow {
                tabs: Vec::new(),
                active: 0,
                bounds: None,
                maximized: false,
                groups: Vec::new(),
            });
        }
        for (i, saved) in restore.into_iter().enumerate() {
            let builder = window_builder(browser.incognito, saved.bounds, saved.maximized);
            let mut w = browser.make_window(i == 0, builder);
            w.bounds = saved.bounds;
            w.maximized = saved.maximized;
            w.restore(saved.tabs, saved.active, saved.groups);
            browser.windows.push(w);
        }
        let first = &mut browser.windows[0];
        match start.start_url {
            Some(url) => {
                first.open_tab(&model::to_url(&url), true);
            }
            None if first.model.tabs.is_empty() => {
                first.open_tab(NEW_TAB, true);
            }
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
            internal: Default::default(),
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
            focus_page: false,
            error: None,
            last_place: None,
            address_id: egui::Id::new("address"),
            prompts: Default::default(),
            page_focused: false,
            took_focus: false,
            window_focused: false,
            address_focused: false,
            chrome_keyboard: false,
            minimized: false,
            page_shortcuts: Vec::new(),
            status: None,
            native: None,
            native_token: String::new(),
            native_tries: 0,
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
            drag_start: None,
            drag_view: None,
            strip_layout: StripLayout::default(),
            screen_inner: None,
            renaming: None,
            take_keyboard: false,
            top_sites: None,
            new_tab_query: String::new(),
            last_title: String::new(),
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
    /// Hand `u` to window `i`, waking it if it is not the one drawing now.
    fn deliver(&self, ctx: &egui::Context, i: usize, u: Update) {
        let w = &self.windows[i];
        let _ = w.inbox.send(u);
        if w.viewport != ctx.viewport_id() {
            ctx.request_repaint_of(w.viewport);
        }
    }

    fn route(&mut self, ctx: &egui::Context) {
        while let Ok(u) = self.updates.try_recv() {
            if let Event::Opened { opener, .. } = &u.event {
                let to = opener
                    .and_then(|o| self.owner(o))
                    .or_else(|| self.focused_index());
                let tab = u.tab;
                if let Some(i) = to {
                    self.deliver(ctx, i, u);
                    let (mine, rest): (Vec<_>, Vec<_>) =
                        self.orphans.drain(..).partition(|o| o.tab == tab);
                    self.orphans = rest;
                    for o in mine {
                        self.deliver(ctx, i, o);
                    }
                }
                continue;
            }
            match self.owner(u.tab) {
                Some(i) => self.deliver(ctx, i, u),
                // Downloads and connection errors: the window in front.
                None if u.tab == 0 || matches!(u.event, Event::Error(_)) => {
                    if let Some(i) = self.focused_index() {
                        self.deliver(ctx, i, u);
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
                ctx.request_repaint_of(self.windows[i].viewport);
            }
        }
        while let Ok(req) = self.tab_rx.try_recv() {
            self.tab_request(ctx, req);
        }
        #[cfg(target_os = "linux")]
        for d in crate::cef::xdnd::take_drops() {
            if let Some(w) = self.windows.iter_mut().find(|w| w.native == Some(d.window)) {
                w.dropped(d.at, &d.text);
                ctx.request_repaint_of(w.viewport);
            }
        }
        // The 한/영 key for the window in front (cef/xdnd.rs, ime.rs).
        #[cfg(target_os = "linux")]
        if crate::ime::has_raw_keys() {
            if let Some(i) = self.focused_index() {
                ctx.request_repaint_of(self.windows[i].viewport);
            }
        }
        while let Ok(url) = self.open_rx.try_recv() {
            let i = self.new_window(None, None);
            let w = &mut self.windows[i];
            match url {
                Some(u) => {
                    w.open_tab(&model::to_url(&u), true);
                }
                None => {
                    w.open_tab(NEW_TAB, true);
                }
            }
        }
    }

    /// The window and index of the tab with this DevTools target id.
    fn find_target(&self, target: &str) -> Option<(usize, usize)> {
        if target.is_empty() {
            return None;
        }
        self.windows.iter().enumerate().find_map(|(i, w)| {
            w.model
                .tabs
                .iter()
                .position(|t| t.target_id == target)
                .map(|j| (i, j))
        })
    }

    /// An agent's `Target.createTarget`, `activateTarget` or `closeTarget`.
    fn tab_request(&mut self, ctx: &egui::Context, req: relay::TabRequest) {
        match req {
            relay::TabRequest::Open {
                url,
                background,
                new_window,
                reply,
            } => {
                // The window's own pages (passwords, settings) are the person's.
                if crate::internal::is_internal(&url) {
                    let _ = reply.send(Err(format!("{url} is not for agents")));
                    return;
                }
                let i = if new_window {
                    self.new_window(None, None)
                } else {
                    match self.focused_index() {
                        Some(i) => i,
                        None => {
                            let _ = reply.send(Err("the browser has no window".into()));
                            return;
                        }
                    }
                };
                let w = &mut self.windows[i];
                let id = w.open_tab(&url, new_window || !background);
                if let Some(t) = w.model.tab_mut(id) {
                    t.agent = true;
                }
                w.op(id, cdp::Op::Agent);
                w.session_dirty = true;
                ctx.request_repaint_of(w.viewport);
                self.target_waiters.push(TargetWaiter {
                    tab: id,
                    reply,
                    since: Instant::now(),
                });
            }
            relay::TabRequest::Activate { target, reply } => {
                let found = self.find_target(&target);
                if let Some((i, j)) = found {
                    let w = &mut self.windows[i];
                    w.select_tab(j);
                    ctx.request_repaint_of(w.viewport);
                }
                let _ = reply.send(found.is_some());
            }
            relay::TabRequest::Close { target, reply } => {
                let found = self.find_target(&target);
                if let Some((i, j)) = found {
                    let w = &mut self.windows[i];
                    w.close_tab(j);
                    ctx.request_repaint_of(w.viewport);
                }
                let _ = reply.send(found.is_some());
            }
        }
    }

    /// Answer agents whose new tab now has its target id.
    fn answer_waiters(&mut self) {
        if self.target_waiters.is_empty() {
            return;
        }
        let ids: HashMap<TabId, String> = self
            .windows
            .iter()
            .flat_map(|w| w.model.tabs.iter().map(|t| (t.id, t.target_id.clone())))
            .collect();
        for w in std::mem::take(&mut self.target_waiters) {
            match ids.get(&w.tab) {
                Some(t) if !t.is_empty() => {
                    let _ = w.reply.send(Ok(t.clone()));
                }
                None => {
                    let _ = w.reply.send(Err("the tab closed".into()));
                }
                Some(_) if w.since.elapsed() > Duration::from_secs(15) => {
                    let _ = w.reply.send(Err("Chromium did not open the tab".into()));
                }
                Some(_) => self.target_waiters.push(w),
            }
        }
    }

    /// Draw window `i` into `ui`, which belongs to its viewport.
    fn show(&mut self, i: usize, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        let w = &mut self.windows[i];
        let press = self.drag.is_some_and(|d| d.press == w.wid);
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
            w.screen_inner = v.inner_rect;
            if press {
                if let (Some(r), Some(p)) = (v.inner_rect, inp.pointer.latest_pos()) {
                    self.press_pointer = Some((p + r.min.to_vec2(), inp.pointer.primary_down()));
                }
            }
            w.maximized = v.maximized.unwrap_or(false);
            v.focused == Some(true)
        });
        // Linux: whether the chrome (its focus window, cef/native.rs) has
        // the keyboard comes from X; winit's focus also covers the page.
        let focused = match w.native {
            Some(n) if cfg!(target_os = "linux") => crate::cef::native::chrome_has_keyboard(n),
            _ => focused,
        };
        w.chrome_keyboard = focused;
        if focused {
            self.focused = w.wid;
        }
        if focused || w.page_focused {
            let wid = w.wid;
            if self.front.last() != Some(&wid) {
                self.front.retain(|x| *x != wid);
                self.front.push(wid);
            }
        }
        self.shared.lend(w);
        crate::ime::before_pass(&ctx, focused);
        w.frame(ui);
        crate::ime::after_pass(&ctx, focused);
        // The page has the keyboard: its window is the one in front (the
        // window itself then reads as unfocused).
        if std::mem::take(&mut w.took_focus) {
            self.focused = w.wid;
        }
        self.shared.reclaim(w);
    }

    /// A window closed. The last one stays in the saved session, as in
    /// Chrome; any other leaves it, and its tabs close in Chromium.
    fn close_window(&mut self, i: usize) {
        if self.windows.len() == 1 {
            self.save_session();
            self.final_saved = true;
            self.windows.remove(i);
            return;
        }
        let mut w = self.windows.remove(i);
        // Its pages leave its native window before that is destroyed.
        let _ = w.commands.send(cdp::Command::Detach);
        for t in std::mem::take(&mut w.model.tabs) {
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
                    self.put(i, *moved, 0);
                }
                Request::OpenWindow(urls) => {
                    let i = self.new_window(Some(from), None);
                    self.windows[i].open_all(&urls);
                }
                Request::Quit => {
                    self.save_session();
                    self.final_saved = true;
                    ctx.send_viewport_cmd_to(ViewportId::ROOT, egui::ViewportCommand::Close);
                }
            }
        }
    }

    /// Take `item` out of window `i`, with what the window kept for its
    /// tabs. The window shows its next tab.
    fn take(&mut self, i: usize, item: DragItem) -> Option<Payload> {
        let w = &mut self.windows[i];
        let payload = match item {
            DragItem::Tab(id) => {
                let index = w.model.index_of(id)?;
                let tab = w.model.take_tab(index)?;
                Payload::Tab(Moved {
                    login: w.agent_logins.remove(&id),
                    tab,
                })
            }
            DragItem::Group(g) => {
                let (group, tabs) = w.model.take_group(g)?;
                let moved = tabs
                    .into_iter()
                    .map(|tab| Moved {
                        login: w.agent_logins.remove(&tab.id),
                        tab,
                    })
                    .collect();
                Payload::Group(group, moved)
            }
        };
        if !w.model.tabs.is_empty() {
            w.activated();
        }
        w.session_dirty = true;
        Some(payload)
    }

    /// Put tabs from another window into window `i` at strip index `at`,
    /// the moved tab on screen.
    fn put(&mut self, i: usize, payload: Payload, at: usize) {
        let w = &mut self.windows[i];
        match payload {
            Payload::Tab(Moved { tab, login }) => {
                if let Some(login) = login {
                    w.agent_logins.insert(tab.id, login);
                }
                w.model.insert_tab_at(tab, at);
            }
            Payload::Group(group, moved) => {
                let mut tabs = Vec::new();
                for Moved { tab, login } in moved {
                    if let Some(login) = login {
                        w.agent_logins.insert(tab.id, login);
                    }
                    tabs.push(tab);
                }
                w.model.insert_group(group, tabs, at, true);
            }
        }
        // Activate from this window: Chromium moves the page into it,
        // gives it this window's size and keeps it on screen.
        w.activated();
        w.session_dirty = true;
    }

    /// A window lost its last tab to a drag: it closes, as in Chrome.
    fn retire(&mut self, ctx: &egui::Context, i: usize) {
        if self.windows[i].viewport == ViewportId::ROOT {
            // The process lives on for the other windows: the first only hides.
            ctx.send_viewport_cmd_to(ViewportId::ROOT, egui::ViewportCommand::Visible(false));
        }
        self.close_window(i);
        ctx.request_repaint_of(ViewportId::ROOT);
    }

    fn window_of(&self, wid: WindowId) -> Option<usize> {
        self.windows.iter().position(|w| w.wid == wid)
    }

    fn holder_of(&self, item: DragItem) -> Option<usize> {
        self.windows.iter().position(|w| match item {
            DragItem::Tab(id) => w.model.index_of(id).is_some(),
            DragItem::Group(g) => w.model.group(g).is_some(),
        })
    }

    /// The pointer on screen in points, and whether the button is down.
    fn pointer(&self, ctx: &egui::Context) -> Option<(egui::Pos2, bool)> {
        match crate::cef::native::pointer() {
            Some((x, y, down)) => {
                let s = ctx.pixels_per_point().max(0.1);
                Some((egui::pos2(x as f32 / s, y as f32 / s), down))
            }
            None => self.press_pointer,
        }
    }

    /// Where a window's top-left goes so that `item`, the first in its
    /// strip, sits under the pointer at `p` where it was held.
    fn origin_for(&self, p: egui::Pos2, grab: egui::Vec2) -> egui::Pos2 {
        let left = self
            .windows
            .first()
            .map_or(crate::strip::TAB_STRIP_LEFT, |w| w.strip_layout.left);
        p - egui::vec2(left + grab.x, crate::strip::TAB_TOP + grab.y)
    }

    /// Chrome's tab drag, run every pass: a tab (or a group) slides in its
    /// strip; pulled out it becomes a window of its own that follows the
    /// pointer; over any window's strip it goes into that strip where the
    /// pointer is, and a window it leaves empty closes. Its page comes
    /// along (its native window is re-parented, cdp.rs).
    fn drag_tick(&mut self, ctx: &egui::Context) {
        for w in &mut self.windows {
            if let Some(s) = w.drag_start.take() {
                self.drag = Some(Drag {
                    item: s.item,
                    grab: s.grab,
                    press: w.wid,
                    following: None,
                });
                self.press_pointer = None;
            }
        }
        let Some(mut d) = self.drag else {
            return;
        };
        for w in &mut self.windows {
            w.drag_view = None;
        }
        let (Some(holder), Some((p, down))) = (self.holder_of(d.item), self.pointer(ctx)) else {
            self.drag = None;
            return;
        };
        if !down {
            // Let go: where it is, it stays.
            cdp::trace(format_args!("drag {:?}: dropped at {p:?}", d.item));
            self.drag = None;
            self.press_pointer = None;
            for w in &mut self.windows {
                ctx.request_repaint_of(w.viewport);
            }
            return;
        }
        // Keep the pointer read while the button is down.
        ctx.request_repaint_of(ViewportId::ROOT);
        let following = d.following == Some(self.windows[holder].wid);
        let strip_of = |w: &Window| {
            let inner = w.screen_inner?;
            Some(w.strip_layout.rect.translate(inner.min.to_vec2()))
        };
        // The strip under the pointer: its own (with room to pull before
        // it leaves), or another window's, the one in front first.
        let mut target = None;
        let mut best = -1i64;
        for (i, w) in self.windows.iter().enumerate() {
            let Some(strip) = strip_of(w) else { continue };
            let band = if i == holder {
                if following {
                    continue;
                }
                strip.expand2(egui::vec2(0.0, DETACH_AT))
            } else {
                strip
            };
            if !band.contains(p) {
                continue;
            }
            let rank = self
                .front
                .iter()
                .position(|x| *x == w.wid)
                .map_or(0, |r| r as i64 + 1);
            if i == holder {
                // Its own strip wins while the pointer is still in it.
                target = Some(i);
                break;
            }
            if rank > best {
                best = rank;
                target = Some(i);
            }
        }
        let n_items = |w: &Window| match d.item {
            DragItem::Tab(_) => w.model.tabs.len(),
            DragItem::Group(g) => {
                w.model.tabs.len() - w.model.group_range(g).map_or(0, |r| r.len()) + 1
            }
        };
        match target {
            Some(i) if i == holder => {
                let w = &mut self.windows[i];
                let x = p.x - w.screen_inner.map_or(0.0, |r| r.min.x);
                w.drag_view = Some(DragView {
                    item: d.item,
                    x,
                    grab: d.grab.x,
                });
                ctx.request_repaint_of(w.viewport);
            }
            Some(i) => {
                // Into another window's strip, at the pointer.
                let w = &self.windows[i];
                let x = p.x - w.screen_inner.map_or(0.0, |r| r.min.x);
                let at = w
                    .strip_layout
                    .slots
                    .iter()
                    .find(|(c, _)| *c > x - d.grab.x + 24.0)
                    .map_or(w.model.tabs.len(), |(_, idx)| *idx);
                let viewport = w.viewport;
                let Some(payload) = self.take(holder, d.item) else {
                    self.drag = None;
                    return;
                };
                self.put(i, payload, at);
                cdp::trace(format_args!(
                    "drag {:?}: into window {} at {at}",
                    d.item, self.windows[i].wid
                ));
                let wv = &mut self.windows[i];
                wv.drag_view = Some(DragView {
                    item: d.item,
                    x,
                    grab: d.grab.x,
                });
                ctx.send_viewport_cmd_to(viewport, egui::ViewportCommand::Focus);
                ctx.request_repaint_of(viewport);
                d.following = None;
                if self.windows[holder].model.tabs.is_empty() {
                    self.retire(ctx, holder);
                }
            }
            None if following => {
                let at = self.origin_for(p, d.grab);
                let w = &self.windows[holder];
                ctx.send_viewport_cmd_to(w.viewport, egui::ViewportCommand::OuterPosition(at));
            }
            None => {
                // Out of its strip: a window of its own, under the pointer.
                let at = self.origin_for(p, d.grab);
                if n_items(&self.windows[holder]) <= 1 {
                    d.following = Some(self.windows[holder].wid);
                    cdp::trace(format_args!("drag {:?}: its window follows", d.item));
                    let w = &self.windows[holder];
                    ctx.send_viewport_cmd_to(w.viewport, egui::ViewportCommand::OuterPosition(at));
                } else if let Some(payload) = self.take(holder, d.item) {
                    let from_wid = self.windows[holder].wid;
                    let i = self.new_window(self.window_of(from_wid), Some(at));
                    self.put(i, payload, 0);
                    d.following = Some(self.windows[i].wid);
                    cdp::trace(format_args!(
                        "drag {:?}: out to window {}",
                        d.item, self.windows[i].wid
                    ));
                    ctx.request_repaint_of(ViewportId::ROOT);
                }
            }
        }
        self.drag = Some(d);
    }

    /// Tell the relay which window each tab is in, when that changed.
    fn publish_places(&mut self) {
        let mut now = HashMap::new();
        for (n, w) in self.windows.iter().enumerate() {
            for (j, t) in w.model.tabs.iter().enumerate() {
                if !t.target_id.is_empty() {
                    now.insert(
                        t.target_id.clone(),
                        relay::TabPlace {
                            window: n as u32 + 1,
                            agent: t.agent,
                            active: j == w.model.active,
                        },
                    );
                }
            }
        }
        if now != self.last_places {
            *self.places.lock().unwrap() = now.clone();
            self.last_places = now;
        }
        let placement: HashMap<TabId, ViewportId> = self
            .windows
            .iter()
            .flat_map(|w| w.model.tabs.iter().map(|t| (t.id, w.viewport)))
            .collect();
        if let Ok(mut p) = self.placement.lock() {
            if *p != placement {
                *p = placement;
            }
        }
    }

    /// What the saved session holds, as one number.
    fn session_signature(&self) -> u64 {
        let mut h = std::collections::hash_map::DefaultHasher::new();
        for w in &self.windows {
            w.model.active.hash(&mut h);
            for t in &w.model.tabs {
                (t.id, &t.url, &t.title, t.agent, t.group).hash(&mut h);
            }
            for g in &w.model.groups {
                (g.id, &g.title, g.color, g.collapsed).hash(&mut h);
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

/// The eframe app: the browser behind a lock, so each window's viewport can
/// draw on its own schedule (deferred viewports). A window repaints only for
/// its own input, its own tabs' engine updates and its own animations.
pub struct App(Arc<Mutex<Browser>>);

impl App {
    pub fn start(cc: &eframe::CreationContext<'_>, start: Start) -> Self {
        Self(Arc::new(Mutex::new(Browser::start(cc, start))))
    }
}

fn lock(b: &Mutex<Browser>) -> MutexGuard<'_, Browser> {
    b.lock().unwrap_or_else(|e| e.into_inner())
}

impl eframe::App for App {
    fn on_exit(&mut self) {
        lock(&self.0).save_session();
        // While the windows still exist: Chromium ends the process from its
        // X11 error handler once they are gone, before `main` could stop it.
        cdp::close_all(Duration::from_secs(3));
        crate::cef::shutdown();
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let me = self.0.clone();
        lock(&self.0).root_pass(ui, &me);
    }

    /// eframe runs no pass for a minimized window, only this: Chromium
    /// still has to run its pages, downloads and agents' DevTools calls.
    fn logic(&mut self, ctx: &egui::Context, _frame: &mut eframe::Frame) {
        if ctx.input(|i| i.viewport().minimized == Some(true)) {
            let mut b = lock(&self.0);
            b.route(ctx);
            b.after(ctx);
        }
    }
}

impl Browser {
    /// What every pass does after drawing its window.
    fn after(&mut self, ctx: &egui::Context) {
        self.sync_minimized(ctx);
        let windows = self.windows.len();
        self.drag_tick(ctx);
        self.handle_requests(ctx);
        // The windows' commands go to Chromium, and Chromium does its work.
        cdp::process(&mut self.command_rx);
        if self.windows.is_empty() {
            ctx.send_viewport_cmd_to(ViewportId::ROOT, egui::ViewportCommand::Close);
            return;
        }
        // A window opened or closed: the root pass registers viewports.
        if self.windows.len() != windows && ctx.viewport_id() != ViewportId::ROOT {
            ctx.request_repaint_of(ViewportId::ROOT);
        }
        self.publish_places();
        self.answer_waiters();
        self.save_if_changed(ctx);
    }

    /// A minimized window's page is hidden to Chromium (no painting, timers
    /// slowed), as Chrome's is: its page is a child window, which Chromium
    /// does not see minimized with its parent.
    fn sync_minimized(&mut self, ctx: &egui::Context) {
        let infos = ctx.input(|i| i.raw.viewports.clone());
        for w in &mut self.windows {
            let m = infos
                .get(&w.viewport)
                .and_then(|v| v.minimized)
                .unwrap_or(false);
            if m == w.minimized {
                continue;
            }
            w.minimized = m;
            if let Some((place, visible)) = w.last_place {
                let _ = w.commands.send(cdp::Command::Place {
                    place,
                    visible: visible && !m,
                });
            }
        }
    }

    /// A pass of a window's own viewport.
    fn child_pass(&mut self, viewport: ViewportId, ui: &mut egui::Ui) {
        let ctx = ui.ctx().clone();
        self.route(&ctx);
        let Some(i) = self.windows.iter().position(|w| w.viewport == viewport) else {
            return;
        };
        self.show(i, ui);
        if ctx.input(|i| i.viewport().close_requested()) {
            self.close_window(i);
            ctx.request_repaint_of(ViewportId::ROOT);
        }
        self.after(&ctx);
    }

    fn root_pass(&mut self, ui: &mut egui::Ui, me: &Arc<Mutex<Browser>>) {
        let ctx = ui.ctx().clone();
        if QUIT.swap(false, std::sync::atomic::Ordering::SeqCst) {
            if let Some(w) = self.windows.first_mut() {
                w.requests.push(Request::Quit);
            }
        }
        self.route(&ctx);

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
        // Where the platform cannot open more OS windows, viewports are drawn
        // inside the root pass, which holds the lock: draw them immediately.
        let embedded = ctx.embed_viewports();
        for viewport in children {
            let Some(i) = self.windows.iter().position(|w| w.viewport == viewport) else {
                continue;
            };
            let builder = self.windows[i].builder.clone();
            if embedded {
                let closing = ctx.show_viewport_immediate(viewport, builder, |ui, _| {
                    self.show(i, ui);
                    ui.ctx().input(|i| i.viewport().close_requested())
                });
                if closing {
                    self.close_window(i);
                }
            } else {
                let me = me.clone();
                ctx.show_viewport_deferred(viewport, builder, move |ui, _| {
                    lock(&me).child_pass(viewport, ui);
                });
            }
        }
        self.after(&ctx);
    }
}
