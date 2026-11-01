//! Chromium (CEF) as the engine behind every window tab (docs/CEF.md).
//!
//! The window keeps its own contract with the engine: `cdp::Op` goes in,
//! `cdp::Update` comes out. This module answers that contract with CEF
//! instead of the Obscura child process.
//!
//! CEF runs in the window process with windowless (off-screen) rendering
//! and an external message pump: the eframe loop calls [`pump`] every pass
//! and whenever CEF asks for it, so every CEF callback runs on the window's
//! own thread. Renderer, GPU and utility processes are this executable
//! started again with `--type=...`; [`subprocess`] runs them.

pub mod app;
pub mod client;
pub mod handlers;
pub mod input;
pub mod osr;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU16, Ordering};
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex, OnceLock};
use std::time::{Duration, Instant};

use cef::{args::Args, CefString, ImplCommandLine as _};

use crate::cdp::{Event, Update};
use crate::model::TabId;

/// Wakes whoever draws a tab (its window's viewport) after CEF changed it.
pub type Wake = Arc<dyn Fn(Option<TabId>) + Send + Sync>;

/// Where CEF callbacks report what happened to a tab.
///
/// CEF names a page by its browser identifier (`Browser::identifier()`); the
/// window names it by `TabId`. The map is filled when a tab's browser is
/// created and emptied when it closes.
#[derive(Clone)]
pub struct Sink {
    tx: Sender<Update>,
    tabs: Arc<Mutex<HashMap<i32, TabId>>>,
    wake: Wake,
}

impl Sink {
    pub fn new(tx: Sender<Update>, wake: Wake) -> Self {
        Sink {
            tx,
            tabs: Arc::default(),
            wake,
        }
    }

    pub fn bind(&self, browser_id: i32, tab: TabId) {
        self.tabs.lock().unwrap().insert(browser_id, tab);
    }

    pub fn unbind(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().remove(&browser_id)
    }

    pub fn tab_of(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().get(&browser_id).copied()
    }

    /// Report `event` for the tab behind `browser_id`. Events for a browser
    /// the window does not know (closing, or not yet bound) are dropped.
    pub fn send(&self, browser_id: i32, event: Event) {
        if let Some(tab) = self.tab_of(browser_id) {
            self.send_tab(tab, event);
        }
    }

    /// Report `event` for a tab by its window id.
    pub fn send_tab(&self, tab: TabId, event: Event) {
        let _ = self.tx.send(Update { tab, event });
        (self.wake)(Some(tab));
    }

    /// Report an event that belongs to no tab (downloads use tab 0).
    pub fn send_global(&self, event: Event) {
        let _ = self.tx.send(Update { tab: 0, event });
        (self.wake)(None);
    }

    /// Redraw the window showing `tab` (a new frame, a cursor change).
    pub fn repaint(&self, tab: TabId) {
        (self.wake)(Some(tab));
    }
}

/// Run a CEF subprocess (renderer, GPU, utility, zygote) when this process
/// is one, and return its exit code. Call first thing in `main`, before
/// anything else touches the process (logging, locks, windows).
pub fn subprocess() -> Option<i32> {
    #[cfg(target_os = "macos")]
    {
        // Helpers load the framework from their own bundle.
        let helper = std::env::args().any(|a| a.starts_with("--type="));
        let loader = cef::library_loader::LibraryLoader::new(
            &std::env::current_exe().unwrap_or_default(),
            helper,
        );
        if !loader.load() {
            eprintln!("redrob-browser: could not load the Chromium framework");
            return Some(1);
        }
        std::mem::forget(loader);
    }
    let _ = cef::api_hash(cef::sys::CEF_API_VERSION_LAST, 0);
    let args = Args::new();
    let is_child = args
        .as_cmd_line()
        .is_some_and(|c| c.has_switch(Some(&CefString::from("type"))) == 1);
    if !is_child {
        return None;
    }
    let mut app = app::new();
    let code = cef::execute_process(
        Some(args.as_main_args()),
        Some(&mut app),
        std::ptr::null_mut(),
    );
    Some(code.max(0))
}

/// How the window process starts Chromium.
pub struct Config {
    /// Chromium's own state for this process: the profile folder, or the
    /// incognito window's temporary folder.
    pub root: PathBuf,
    /// Where cookies, storage and the cache persist; `None` for incognito
    /// (memory only).
    pub cache: Option<PathBuf>,
}

static DEVTOOLS_PORT: AtomicU16 = AtomicU16::new(0);
static STARTED: AtomicBool = AtomicBool::new(false);
static CACHE: OnceLock<Option<PathBuf>> = OnceLock::new();

/// Start Chromium in this (the browser) process.
pub fn start(config: Config) -> anyhow::Result<()> {
    std::fs::create_dir_all(&config.root)?;
    if let Some(c) = &config.cache {
        std::fs::create_dir_all(c)?;
    }
    let _ = CACHE.set(config.cache.clone());
    // Agents and `redrob-browser tab` reach the tabs through Chromium's own
    // DevTools server, on loopback only, on a port nothing else holds.
    let port = std::net::TcpListener::bind("127.0.0.1:0")
        .and_then(|l| l.local_addr())
        .map(|a| a.port())
        .unwrap_or(0);
    DEVTOOLS_PORT.store(port, Ordering::SeqCst);

    let resources = resources_dir();
    let mut settings = cef::Settings {
        windowless_rendering_enabled: 1,
        external_message_pump: 1,
        no_sandbox: (!sandbox_usable()) as _,
        root_cache_path: CefString::from(config.root.to_string_lossy().as_ref()),
        cache_path: CefString::from(
            config
                .cache
                .as_deref()
                .map(|p| p.to_string_lossy().into_owned())
                .unwrap_or_default()
                .as_str(),
        ),
        persist_session_cookies: config.cache.is_some() as _,
        remote_debugging_port: port as _,
        log_severity: cef::sys::cef_log_severity_t::LOGSEVERITY_ERROR.into(),
        log_file: CefString::from(config.root.join("chromium.log").to_string_lossy().as_ref()),
        locale: CefString::from(locale().0),
        accept_language_list: CefString::from(locale().1),
        background_color: 0xFFFF_FFFF,
        ..Default::default()
    };
    if let Some(dir) = &resources {
        settings.resources_dir_path = CefString::from(dir.to_string_lossy().as_ref());
        settings.locales_dir_path = CefString::from(dir.join("locales").to_string_lossy().as_ref());
    }
    let args = Args::new();
    let mut app = app::new();
    if cef::initialize(
        Some(args.as_main_args()),
        Some(&settings),
        Some(&mut app),
        std::ptr::null_mut(),
    ) != 1
    {
        anyhow::bail!(
            "Chromium did not start (see {})",
            config.root.join("chromium.log").display()
        );
    }
    STARTED.store(true, Ordering::SeqCst);
    Ok(())
}

/// Chromium's DevTools port on 127.0.0.1, once Chromium runs.
pub fn devtools_port() -> Option<u16> {
    let port = DEVTOOLS_PORT.load(Ordering::SeqCst);
    (STARTED.load(Ordering::SeqCst) && port != 0).then_some(port)
}

/// The request context for the window's tabs: the profile's cookies,
/// storage and cache, or memory only for incognito.
pub fn request_context() -> Option<cef::RequestContext> {
    thread_local! {
        static CONTEXT: std::cell::RefCell<Option<cef::RequestContext>> = const { std::cell::RefCell::new(None) };
    }
    CONTEXT.with_borrow_mut(|c| {
        if c.is_none() {
            let cache = CACHE.get().cloned().flatten();
            *c = {
                let settings = cef::RequestContextSettings {
                    cache_path: CefString::from(
                        cache
                            .as_deref()
                            .map(|p| p.to_string_lossy().into_owned())
                            .unwrap_or_default()
                            .as_str(),
                    ),
                    persist_session_cookies: cache.is_some() as _,
                    ..Default::default()
                };
                cef::request_context_create_context(Some(&settings), None)
            };
        }
        c.clone()
    })
}

/// Chromium's UI locale and the languages pages are asked for.
fn locale() -> (&'static str, &'static str) {
    match crate::i18n::current() {
        crate::i18n::Lang::Ko => ("ko", "ko-KR,ko,en-US,en"),
        crate::i18n::Lang::En => ("en-US", "en-US,en"),
    }
}

/// When CEF last asked to be pumped, and for when.
static PUMP_DUE: Mutex<Option<Instant>> = Mutex::new(None);
static WAKER: OnceLock<Arc<dyn Fn(Duration) + Send + Sync>> = OnceLock::new();

/// How the pump asks the window loop for a pass: after this long.
pub fn set_waker(wake: impl Fn(Duration) + Send + Sync + 'static) {
    let _ = WAKER.set(Arc::new(wake));
}

/// CEF wants [`pump`] called in `delay` (from any thread).
pub(crate) fn schedule(delay: Duration) {
    let due = Instant::now() + delay;
    {
        let mut d = PUMP_DUE.lock().unwrap_or_else(|e| e.into_inner());
        if d.is_some_and(|old| old <= due) {
            return;
        }
        *d = Some(due);
    }
    if let Some(w) = WAKER.get() {
        w(delay);
    }
}

/// Let CEF do its work: call every window pass. Never re-entered.
pub fn pump() {
    thread_local! {
        static IN_PUMP: std::cell::Cell<bool> = const { std::cell::Cell::new(false) };
    }
    if !STARTED.load(Ordering::SeqCst) || IN_PUMP.get() {
        return;
    }
    IN_PUMP.set(true);
    *PUMP_DUE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    cef::do_message_loop_work();
    IN_PUMP.set(false);
    // A pass now and then even when CEF scheduled none, so nothing it
    // forgot to ask for stalls; CEF asks for every pass it needs.
    schedule(Duration::from_millis(200));
}

/// Stop Chromium. Every browser must be closed first (`cdp::close_all`).
pub fn shutdown() {
    if STARTED.swap(false, Ordering::SeqCst) {
        cef::shutdown();
    }
}

/// Chromium's resource files (icudtl.dat, *.pak, locales/): next to the
/// executable in a release, else in the CEF distribution the build used.
fn resources_dir() -> Option<PathBuf> {
    let exe_dir = std::env::current_exe().ok()?.parent()?.to_path_buf();
    if cfg!(target_os = "macos") || exe_dir.join("icudtl.dat").is_file() {
        return None;
    }
    std::env::var_os("CEF_PATH")
        .map(PathBuf::from)
        .or_else(|| option_env!("CEF_PATH").map(PathBuf::from))
        .filter(|d| d.join("icudtl.dat").is_file())
}

/// Whether Chromium can sandbox its renderers here. On Linux it needs the
/// setuid `chrome-sandbox` helper next to the executable, or unprivileged
/// user namespaces; without either Chromium refuses to start, so run
/// unsandboxed rather than not at all.
fn sandbox_usable() -> bool {
    if !cfg!(target_os = "linux") {
        return true;
    }
    if std::env::var_os("REDROB_NO_SANDBOX").is_some() {
        return false;
    }
    let helper = std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join("chrome-sandbox")));
    if helper.as_deref().is_some_and(setuid_root) {
        return true;
    }
    userns_allowed()
}

#[cfg(unix)]
fn setuid_root(p: &Path) -> bool {
    use std::os::unix::fs::MetadataExt;
    std::fs::metadata(p).is_ok_and(|m| m.uid() == 0 && m.mode() & 0o4000 != 0)
}

#[cfg(not(unix))]
fn setuid_root(_: &Path) -> bool {
    false
}

fn userns_allowed() -> bool {
    let read = |p: &str| std::fs::read_to_string(p).ok().map(|s| s.trim().to_string());
    if read("/proc/sys/kernel/unprivileged_userns_clone").as_deref() == Some("0") {
        return false;
    }
    // Ubuntu 24.04 and later: AppArmor denies them to unconfined programs.
    if read("/proc/sys/kernel/apparmor_restrict_unprivileged_userns").as_deref() == Some("1") {
        return false;
    }
    true
}
