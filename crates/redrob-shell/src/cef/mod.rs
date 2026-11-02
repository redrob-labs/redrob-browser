//! Chromium (CEF) as the engine behind every window tab (docs/CEF.md).
//!
//! The window keeps its own contract with the engine: `cdp::Op` goes in,
//! `cdp::Update` comes out. This module answers that contract with CEF
//! instead of the Obscura child process.
//!
//! CEF runs in the window process, on the window's own thread: the eframe
//! loop calls [`pump`] every pass and whenever Chromium has work, so every
//! CEF callback runs on the window's thread. On Windows and macOS CEF says
//! when through its external message pump. On Linux Chromium keeps its own
//! glib message loop, which [`pump`] runs until idle, and the window learns
//! of its work from glib's descriptors (wake.rs): the external pump returns
//! from every nested run loop (drag and drop) within 10 ms. Each tab's page
//! is a native child window of its browser window (native.rs). Renderer, GPU and utility processes are this executable
//! started again with `--type=...`; [`subprocess`] runs them.

pub mod app;
pub mod client;
pub mod handlers;
pub mod keys;
pub mod native;
#[cfg(target_os = "linux")]
mod wake;
#[cfg(target_os = "linux")]
pub mod xdnd;

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
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
        let sink = Sink {
            tx,
            tabs: Arc::default(),
            wake,
        };
        let _ = GLOBAL_SINK.set(sink.clone());
        sink
    }

    pub fn bind(&self, browser_id: i32, tab: TabId) {
        self.tabs.lock().unwrap().insert(browser_id, tab);
    }

    pub fn unbind(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().remove(&browser_id)
    }

    // tab_of, send and send_global serve the feature handlers
    // (cef/handlers/), which know a page by its browser id.
    #[allow(dead_code)]
    pub fn tab_of(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().get(&browser_id).copied()
    }

    /// Report `event` for the tab behind `browser_id`. Events for a browser
    /// the window does not know (closing, or not yet bound) are dropped.
    #[allow(dead_code)]
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

    /// Have the window look at the tab behind `browser_id` again (a dialog
    /// it shows was answered elsewhere).
    pub fn wake(&self, browser_id: i32) {
        if let Some(tab) = self.tab_of(browser_id) {
            (self.wake)(Some(tab));
        }
    }

    /// Report an event that belongs to no tab (downloads use tab 0).
    #[allow(dead_code)]
    pub fn send_global(&self, event: Event) {
        let _ = self.tx.send(Update { tab: 0, event });
        (self.wake)(None);
    }
}

static GLOBAL_SINK: OnceLock<Sink> = OnceLock::new();

/// The window's sink, for browsers that belong to no tab yet (client.rs
/// `stray_client`).
pub(crate) fn global_sink() -> Option<&'static Sink> {
    GLOBAL_SINK.get()
}

/// Each tab's CDP target id and its browser, so the relay can reach what
/// the window holds for a target (its page dialogs).
fn targets() -> &'static Mutex<HashMap<String, i32>> {
    static TARGETS: OnceLock<Mutex<HashMap<String, i32>>> = OnceLock::new();
    TARGETS.get_or_init(Default::default)
}

/// `target` is the CDP target id of the browser `browser_id`.
pub fn note_target(target: &str, browser_id: i32) {
    if let Ok(mut t) = targets().lock() {
        t.insert(target.to_string(), browser_id);
    }
}

/// The browser `browser_id` closed.
pub fn forget_browser(browser_id: i32) {
    if let Ok(mut t) = targets().lock() {
        t.retain(|_, b| *b != browser_id);
    }
}

/// The browser behind a CDP target id, for a window tab.
pub fn browser_of(target: &str) -> Option<i32> {
    targets().lock().ok()?.get(target).copied()
}

/// Every open browser by its id, so code off CEF's UI thread (the relay)
/// can reach one through [`with_browser`].
fn browsers() -> &'static Mutex<HashMap<i32, cef::Browser>> {
    static BROWSERS: OnceLock<Mutex<HashMap<i32, cef::Browser>>> = OnceLock::new();
    BROWSERS.get_or_init(Default::default)
}

/// `browser` was created; `None` once the browser `id` closed.
pub(crate) fn keep_browser(id: i32, browser: Option<&cef::Browser>) {
    if let Ok(mut b) = browsers().lock() {
        match browser {
            Some(browser) => b.insert(id, browser.clone()),
            None => b.remove(&id),
        };
    }
}

/// Run `job` with the browser `id` on CEF's UI thread; false when no such
/// browser is open.
pub fn with_browser(id: i32, job: impl FnOnce(&cef::Browser) + Send + 'static) -> bool {
    let Some(browser) = browsers().lock().ok().and_then(|b| b.get(&id).cloned()) else {
        return false;
    };
    handlers::on_ui(move || job(&browser));
    true
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

static STARTED: AtomicBool = AtomicBool::new(false);
static CACHE: OnceLock<Option<PathBuf>> = OnceLock::new();

/// How agents reach Chromium's DevTools protocol: through the window's relay
/// only (relay.rs), which holds this.
pub enum DevTools {
    /// `--remote-debugging-pipe`: Chromium reads commands from one pipe and
    /// writes replies to the other, in this process: fds 3 and 4 on Linux
    /// and macOS, handles named by `--remote-debugging-io-pipes` on
    /// Windows. No port: nothing else on the machine can connect, and the
    /// relay's checks cannot be bypassed.
    Pipe {
        commands: std::fs::File,
        replies: std::fs::File,
    },
    /// A loopback port, only when the pipe could not be set up or did not
    /// answer on an earlier start ([`pipe_failed`]).
    Port(u16),
}

static DEVTOOLS: Mutex<Option<DevTools>> = Mutex::new(None);
/// The browser process passes `--remote-debugging-pipe` (cef/app.rs).
pub(crate) static PIPE: AtomicBool = AtomicBool::new(false);
/// Windows: Chromium's ends of the pipes, `<read>,<write>` handle values,
/// for `--remote-debugging-io-pipes` (cef/app.rs).
pub(crate) static PIPE_HANDLES: OnceLock<String> = OnceLock::new();
/// Where a failed DevTools pipe is remembered, so the next start uses a port.
static PIPE_MARK: OnceLock<PathBuf> = OnceLock::new();

/// The DevTools pipe did not answer (relay.rs probes it): remember it, so
/// the next start of this profile uses a loopback port. Chromium cannot
/// open a port once it runs.
pub fn pipe_failed(why: &str) {
    eprintln!("redrob-browser: DevTools pipe failed ({why}); the next start uses a loopback port");
    if let Some(mark) = PIPE_MARK.get() {
        let _ = std::fs::write(mark, why);
    }
}

/// Windows: two anonymous pipes for Chromium's DevTools. The handles stay
/// in this process (Chromium runs here, and maps them into its own C
/// runtime with `_open_osfhandle`), so they are not inheritable: no program
/// this one starts gets them.
#[cfg(windows)]
fn windows_pipe() -> Option<(DevTools, String)> {
    use std::os::windows::io::FromRawHandle;
    use windows_sys::Win32::Foundation::{CloseHandle, HANDLE};
    use windows_sys::Win32::System::Pipes::CreatePipe;
    fn pipe() -> Option<(HANDLE, HANDLE)> {
        let (mut r, mut w): (HANDLE, HANDLE) = (std::ptr::null_mut(), std::ptr::null_mut());
        // SAFETY: out pointers to locals; no security attributes (not
        // inheritable); a 1 MiB buffer.
        (unsafe { CreatePipe(&mut r, &mut w, std::ptr::null(), 1 << 20) } != 0).then_some((r, w))
    }
    let (cmd_r, cmd_w) = pipe()?;
    let Some((rep_r, rep_w)) = pipe() else {
        // SAFETY: handles this function created and nothing else holds.
        unsafe {
            CloseHandle(cmd_r);
            CloseHandle(cmd_w);
        }
        return None;
    };
    // SAFETY: fresh pipe ends; each File owns its handle from here.
    let (commands, replies) = unsafe {
        (
            std::fs::File::from_raw_handle(cmd_w as _),
            std::fs::File::from_raw_handle(rep_r as _),
        )
    };
    // Chromium reads commands and writes replies. Handle values fit in 32
    // bits, which is how Chromium parses them.
    let handles = format!("{},{}", cmd_r as usize as u32, rep_w as usize as u32);
    Some((DevTools::Pipe { commands, replies }, handles))
}

/// Put Chromium's DevTools pipe on fds 3 and 4. Call first thing in the
/// browser process, before anything else opens a file (which would take
/// those numbers).
pub fn reserve_devtools_pipe() {
    #[cfg(unix)]
    {
        fn pipe() -> Option<(libc::c_int, libc::c_int)> {
            let mut fds = [0; 2];
            // SAFETY: fds has room for the two descriptors.
            (unsafe { libc::pipe(fds.as_mut_ptr()) } == 0).then_some((fds[0], fds[1]))
        }
        /// Move `fd` to `to`, close-on-exec: Chromium uses it in this process,
        /// and no program this one starts may inherit it.
        fn place(fd: libc::c_int, to: libc::c_int) -> bool {
            // SAFETY: plain descriptor calls on descriptors this function owns.
            unsafe {
                if fd != to && libc::dup2(fd, to) < 0 {
                    return false;
                }
                if fd != to {
                    libc::close(fd);
                }
                libc::fcntl(to, libc::F_SETFD, libc::FD_CLOEXEC) == 0
            }
        }
        /// Our end: above the low numbers, close-on-exec.
        fn ours(fd: libc::c_int) -> Option<std::fs::File> {
            use std::os::fd::FromRawFd;
            // SAFETY: fd is a fresh pipe end; the File owns its copy.
            unsafe {
                let high = libc::fcntl(fd, libc::F_DUPFD_CLOEXEC, 10);
                libc::close(fd);
                (high >= 0).then(|| std::fs::File::from_raw_fd(high))
            }
        }
        let (Some((cmd_r, cmd_w)), Some((rep_r, rep_w))) = (pipe(), pipe()) else {
            return;
        };
        // Our ends first, so the dup2s below cannot land on them.
        let (Some(commands), Some(replies)) = (ours(cmd_w), ours(rep_r)) else {
            return;
        };
        let (cmd_r, rep_w) = {
            // SAFETY: as above.
            let r = unsafe { libc::fcntl(cmd_r, libc::F_DUPFD_CLOEXEC, 10) };
            let w = unsafe { libc::fcntl(rep_w, libc::F_DUPFD_CLOEXEC, 10) };
            unsafe {
                libc::close(cmd_r);
                libc::close(rep_w);
            }
            (r, w)
        };
        if cmd_r < 0 || rep_w < 0 || !place(cmd_r, 3) || !place(rep_w, 4) {
            return;
        }
        *DEVTOOLS.lock().unwrap_or_else(|e| e.into_inner()) =
            Some(DevTools::Pipe { commands, replies });
        PIPE.store(true, Ordering::SeqCst);
    }
}

/// Start Chromium in this (the browser) process.
pub fn start(config: Config) -> anyhow::Result<()> {
    std::fs::create_dir_all(&config.root)?;
    if let Some(c) = &config.cache {
        std::fs::create_dir_all(c)?;
    }
    let _ = CACHE.set(config.cache.clone());
    // Agents and `redrob-browser tab` reach the tabs through the window's
    // relay, which speaks to Chromium over the DevTools pipe; only where
    // there is none, over a loopback port nothing else holds.
    let mark = config.root.join("devtools-pipe-failed");
    let failed_before = mark.is_file();
    let _ = PIPE_MARK.set(mark);
    if failed_before {
        PIPE.store(false, Ordering::SeqCst);
        DEVTOOLS.lock().unwrap_or_else(|e| e.into_inner()).take();
    }
    #[cfg(windows)]
    if !failed_before {
        if let Some((pipe, handles)) = windows_pipe() {
            *DEVTOOLS.lock().unwrap_or_else(|e| e.into_inner()) = Some(pipe);
            let _ = PIPE_HANDLES.set(handles);
            PIPE.store(true, Ordering::SeqCst);
        }
    }
    let port = if PIPE.load(Ordering::SeqCst) {
        match PIPE_HANDLES.get() {
            Some(h) => eprintln!("redrob-browser: DevTools: pipe (handles {h})"),
            None => eprintln!("redrob-browser: DevTools: pipe (fds 3 and 4)"),
        }
        0
    } else {
        let port = std::net::TcpListener::bind("127.0.0.1:0")
            .and_then(|l| l.local_addr())
            .map(|a| a.port())
            .unwrap_or(0);
        *DEVTOOLS.lock().unwrap_or_else(|e| e.into_inner()) = Some(DevTools::Port(port));
        let why = if failed_before {
            "the pipe failed on an earlier start; delete devtools-pipe-failed to retry"
        } else {
            "no pipe could be made"
        };
        eprintln!("redrob-browser: DevTools: loopback port {port} ({why})");
        port
    };

    // Linux: Widevine from a CDM already on the machine (widevine.rs).
    handlers::widevine::prepare(&config.root);

    let resources = resources_dir();
    let mut settings = cef::Settings {
        external_message_pump: (!cfg!(target_os = "linux")) as _,
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
        // No `accept_language_list`: CEF prefers it over the profile's
        // `intl.accept_languages` for every page it creates, so a language
        // the window switches to later would be lost on the next
        // navigation. The preference is written once Chromium is up
        // (cef/app.rs) and on every change (`apply_languages`).
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

#[cfg(unix)]
static TERMINATE: AtomicBool = AtomicBool::new(false);

/// Run `quit` (on a thread of its own) when the process gets SIGTERM or
/// SIGINT. Replaces Chromium's handlers, which end the process at once,
/// before the window closed its pages and Chromium wrote its cookies.
pub fn on_terminate(quit: impl Fn() + Send + 'static) {
    #[cfg(unix)]
    {
        extern "C" fn handler(_: libc::c_int) {
            TERMINATE.store(true, Ordering::SeqCst);
        }
        // SAFETY: the handler only stores to an atomic, which is
        // async-signal-safe.
        unsafe {
            let h = handler as extern "C" fn(libc::c_int) as libc::sighandler_t;
            libc::signal(libc::SIGTERM, h);
            libc::signal(libc::SIGINT, h);
        }
        std::thread::spawn(move || loop {
            std::thread::sleep(Duration::from_millis(100));
            if TERMINATE.swap(false, Ordering::SeqCst) {
                quit();
            }
        });
    }
    #[cfg(not(unix))]
    let _ = quit;
}

/// Chromium's DevTools connection, once Chromium runs; handed out once, to
/// the relay.
pub fn take_devtools() -> Option<DevTools> {
    if !STARTED.load(Ordering::SeqCst) {
        return None;
    }
    let mut d = DEVTOOLS.lock().unwrap_or_else(|e| e.into_inner());
    match d.as_ref()? {
        DevTools::Port(0) => None,
        _ => d.take(),
    }
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

/// Ask pages for the window's languages (`Accept-Language`,
/// `navigator.languages`) from now on, as Chrome does when its languages
/// change: open pages pick them up at once. Call on the window thread after
/// the window's language changed.
pub fn apply_languages() {
    if STARTED.load(Ordering::SeqCst) {
        handlers::on_ui(write_languages);
    }
}

/// [`apply_languages`] on CEF's UI thread. Also run once Chromium's context
/// is ready (cef/app.rs): the profile keeps the preferences, and the
/// window's language may have changed since they were written.
///
/// Chromium derives `intl.accept_languages` from `intl.selected_languages`
/// (LanguagePrefs), so both are written, the selected ones first.
pub(crate) fn write_languages() {
    let langs = locale().1;
    set_pref("intl.selected_languages", langs);
    set_pref("intl.accept_languages", langs);
}

/// Set the profile's string preference `name` (Chromium's own settings).
/// Call on CEF's UI thread.
pub(crate) fn set_pref(name: &str, value: &str) {
    set_pref_to(name, Pref::Str(value));
}

/// A preference value.
pub(crate) enum Pref<'a> {
    Str(&'a str),
    Bool(bool),
    List(&'a [&'a str]),
}

/// Set the profile's preference `name` to `value`. Call on CEF's UI thread.
pub(crate) fn set_pref_to(name: &str, value: Pref) {
    use cef::{ImplListValue as _, ImplPreferenceManager as _, ImplValue as _};
    let contexts = [request_context(), cef::request_context_get_global_context()];
    for c in contexts.iter().flatten() {
        let Some(mut v) = cef::value_create() else {
            continue;
        };
        match &value {
            Pref::Str(s) => {
                v.set_string(Some(&CefString::from(*s)));
            }
            Pref::Bool(b) => {
                v.set_bool(*b as _);
            }
            Pref::List(items) => {
                let Some(mut list) = cef::list_value_create() else {
                    continue;
                };
                for (i, s) in items.iter().enumerate() {
                    list.set_string(i, Some(&CefString::from(*s)));
                }
                v.set_list(Some(&mut list));
            }
        }
        // Not empty: CEF refuses a null error string, and an empty
        // CefString has no buffer.
        let mut error = CefString::from(" ");
        if c.set_preference(Some(&CefString::from(name)), Some(&mut v), Some(&mut error)) != 1 {
            eprintln!("redrob-browser: {name} not set: {error}");
        }
    }
}

/// Chrome's own features the window relies on (docs/FEATURES.md): spell
/// check in English and Korean, and no second password manager next to the
/// window's vault. Run once Chromium's context is ready (cef/app.rs).
pub(crate) fn write_feature_prefs() {
    set_pref_to("browser.enable_spellchecking", Pref::Bool(true));
    set_pref_to(
        "spellcheck.dictionaries",
        Pref::List(handlers::spelling::DICTIONARIES),
    );
    // The window's vault saves and fills passwords (vault.rs); Chrome's
    // password manager would ask a second time.
    set_pref_to("credentials_enable_service", Pref::Bool(false));
    // Offer to translate pages in other languages, as Chrome does.
    set_pref_to("translate.enabled", Pref::Bool(true));
}

/// Whether the profile holds its own value for the preference `name` (not
/// Chromium's default). Call on CEF's UI thread.
pub(crate) fn pref_is_set(name: &str) -> bool {
    use cef::{ImplDictionaryValue as _, ImplPreferenceManager as _};
    let Some(mut dict) = request_context().and_then(|c| c.all_preferences(0)) else {
        return false;
    };
    let mut parts = name.split('.').peekable();
    while let Some(part) = parts.next() {
        let key = CefString::from(part);
        if parts.peek().is_none() {
            return dict.has_key(Some(&key)) == 1;
        }
        match dict.dictionary(Some(&key)) {
            Some(d) => dict = d,
            None => return false,
        }
    }
    false
}

/// The profile's string preference `name`; empty when unset. Call on CEF's
/// UI thread.
pub(crate) fn pref(name: &str) -> String {
    use cef::{ImplPreferenceManager as _, ImplValue as _};
    request_context()
        .and_then(|c| c.preference(Some(&CefString::from(name))))
        .map(|v| CefString::from(&v.string()).to_string())
        .unwrap_or_default()
}

/// Chromium's UI locale and the languages pages are asked for.
fn locale() -> (&'static str, &'static str) {
    let lang = crate::i18n::current();
    let ui = match lang {
        crate::i18n::Lang::Ko => "ko",
        crate::i18n::Lang::En => "en-US",
    };
    (ui, handlers::languages::list(lang))
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

static PUMPS: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// How many times Chromium's loop has run: a silent DevTools pipe only
/// means failure while Chromium runs (relay.rs).
pub fn pumps() -> u64 {
    PUMPS.load(Ordering::Relaxed)
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
    PUMPS.fetch_add(1, Ordering::Relaxed);
    *PUMP_DUE.lock().unwrap_or_else(|e| e.into_inner()) = None;
    cef::do_message_loop_work();
    #[cfg(target_os = "linux")]
    wake::after_pump();
    IN_PUMP.set(false);
    // A pass now and then even when CEF scheduled none, so nothing it
    // forgot to ask for stalls. On Linux this is also when Chromium's
    // delayed tasks run (glib cannot tell when they are due between
    // pumps; everything posted, and every X11 event, wakes it at once):
    // often while Chromium is busy, rarely once it has been idle a while.
    #[cfg(target_os = "linux")]
    let every = if wake::busy_lately() { 100 } else { 1000 };
    #[cfg(not(target_os = "linux"))]
    let every = 200;
    schedule(Duration::from_millis(every));
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
    let read = |p: &str| {
        std::fs::read_to_string(p)
            .ok()
            .map(|s| s.trim().to_string())
    };
    if read("/proc/sys/kernel/unprivileged_userns_clone").as_deref() == Some("0") {
        return false;
    }
    // Ubuntu 24.04 and later: AppArmor denies them to unconfined programs.
    if read("/proc/sys/kernel/apparmor_restrict_unprivileged_userns").as_deref() == Some("1") {
        return false;
    }
    true
}

#[cfg(all(test, windows))]
mod windows_tests {
    use std::io::{Read, Write};
    use std::os::windows::io::FromRawHandle;

    use super::*;

    #[test]
    fn chromium_gets_its_pipe_ends_as_handle_values() {
        let Some((
            DevTools::Pipe {
                mut commands,
                mut replies,
            },
            handles,
        )) = windows_pipe()
        else {
            panic!("no pipe");
        };
        let (r, w) = handles.split_once(',').expect("<read>,<write>");
        let (r, w): (u32, u32) = (r.parse().unwrap(), w.parse().unwrap());
        // SAFETY: the handles windows_pipe left for Chromium; the test owns them.
        let (mut chromium_reads, mut chromium_writes) = unsafe {
            (
                std::fs::File::from_raw_handle(r as usize as _),
                std::fs::File::from_raw_handle(w as usize as _),
            )
        };
        commands.write_all(b"{\"id\":1}\0").unwrap();
        let mut got = [0u8; 9];
        chromium_reads.read_exact(&mut got).unwrap();
        assert_eq!(&got, b"{\"id\":1}\0");
        chromium_writes.write_all(b"{}\0").unwrap();
        let mut back = [0u8; 3];
        replies.read_exact(&mut back).unwrap();
        assert_eq!(&back, b"{}\0");
    }
}
