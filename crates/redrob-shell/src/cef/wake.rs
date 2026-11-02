//! Linux: wake the window loop when Chromium's message loop has work.
//!
//! On Linux Chromium runs its own glib message loop (no external pump,
//! cef/mod.rs): `cef::pump` runs it until idle. What it waits on between
//! pumps are file descriptors of glib's default main context: its own
//! wakeup pipe (a task was posted, from any thread), its X11 connection
//! (input and expose for its windows, the clipboard's selection requests)
//! and the input method's D-Bus connection. After each pump
//! [`after_pump`] asks glib which descriptors those are, and a watcher
//! thread polls them and asks the window for a pass as soon as one is
//! readable.
//!
//! glib comes from the process (libcef loads it); its functions are looked
//! up at run time, so the build needs no glib.

use std::os::raw::{c_int, c_void};
use std::sync::{Condvar, Mutex, OnceLock};
use std::time::Duration;

#[repr(C)]
#[derive(Clone, Copy, Default)]
struct GPollFd {
    fd: c_int,
    events: u16,
    revents: u16,
}

type Ctx = *mut c_void;

type DefaultFn = unsafe extern "C" fn() -> Ctx;
type AcquireFn = unsafe extern "C" fn(Ctx) -> c_int;
type ReleaseFn = unsafe extern "C" fn(Ctx);
type PrepareFn = unsafe extern "C" fn(Ctx, *mut c_int) -> c_int;
type QueryFn = unsafe extern "C" fn(Ctx, c_int, *mut c_int, *mut GPollFd, c_int) -> c_int;
type CheckFn = unsafe extern "C" fn(Ctx, c_int, *mut GPollFd, c_int) -> c_int;

struct Glib {
    default: DefaultFn,
    acquire: AcquireFn,
    release: ReleaseFn,
    prepare: PrepareFn,
    query: QueryFn,
    check: CheckFn,
}

fn glib() -> Option<&'static Glib> {
    static G: OnceLock<Option<Glib>> = OnceLock::new();
    G.get_or_init(|| {
        let sym = |name: &str| {
            let c = std::ffi::CString::new(name).ok()?;
            // SAFETY: looking up a symbol in the process's loaded libraries.
            let p = unsafe { libc::dlsym(libc::RTLD_DEFAULT, c.as_ptr()) };
            (!p.is_null()).then_some(p)
        };
        // SAFETY: each pointer is glib's function of that name, with the
        // signature glib documents.
        unsafe {
            Some(Glib {
                default: std::mem::transmute::<*mut c_void, DefaultFn>(sym(
                    "g_main_context_default",
                )?),
                acquire: std::mem::transmute::<*mut c_void, AcquireFn>(sym(
                    "g_main_context_acquire",
                )?),
                release: std::mem::transmute::<*mut c_void, ReleaseFn>(sym(
                    "g_main_context_release",
                )?),
                prepare: std::mem::transmute::<*mut c_void, PrepareFn>(sym(
                    "g_main_context_prepare",
                )?),
                query: std::mem::transmute::<*mut c_void, QueryFn>(sym("g_main_context_query")?),
                check: std::mem::transmute::<*mut c_void, CheckFn>(sym("g_main_context_check")?),
            })
        }
    })
    .as_ref()
}

/// What the watcher polls, and how many pumps have run (it waits for the
/// next one after each wake, so a descriptor Chromium has not read yet
/// does not wake it twice).
struct Shared {
    fds: Vec<GPollFd>,
    pumps: u64,
}

static SHARED: Mutex<Shared> = Mutex::new(Shared {
    fds: Vec::new(),
    pumps: 0,
});
static PUMPED: Condvar = Condvar::new();
/// The watcher's own pipe: written when the descriptor list changed.
static NUDGE: OnceLock<(c_int, c_int)> = OnceLock::new();

/// When the watcher last saw Chromium's loop get work, in ms since start.
static LAST_WORK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

fn now_ms() -> u64 {
    static START: OnceLock<std::time::Instant> = OnceLock::new();
    START
        .get_or_init(std::time::Instant::now)
        .elapsed()
        .as_millis() as u64
        + 1
}

/// Whether Chromium's loop had work in the last two seconds (input, posted
/// tasks): its delayed tasks are likely due soon.
pub fn busy_lately() -> bool {
    let last = LAST_WORK.load(std::sync::atomic::Ordering::Relaxed);
    last != 0 && now_ms().saturating_sub(last) < 2000
}

/// Call on the window thread right after each pump.
pub fn after_pump() {
    let Some(g) = glib() else { return };
    let mut fds = vec![GPollFd::default(); 32];
    let (ready, timeout, n) = {
        // SAFETY: the default main context, owned by this thread (the one
        // Chromium pumps on), not inside an iteration now. prepare, query
        // and check make one cycle without dispatching, to learn what to
        // wait on; Chromium's loop dispatches it in the next pump.
        unsafe {
            let ctx = (g.default)();
            if (g.acquire)(ctx) == 0 {
                return;
            }
            let mut prio = 0;
            let ready = (g.prepare)(ctx, &mut prio);
            let mut timeout = -1;
            let mut n = (g.query)(
                ctx,
                prio,
                &mut timeout,
                fds.as_mut_ptr(),
                fds.len() as c_int,
            );
            if n as usize > fds.len() {
                fds.resize(n as usize, GPollFd::default());
                n = (g.query)(
                    ctx,
                    prio,
                    &mut timeout,
                    fds.as_mut_ptr(),
                    fds.len() as c_int,
                );
            }
            let n = (n.max(0) as usize).min(fds.len());
            for f in &mut fds[..n] {
                f.revents = 0;
            }
            (g.check)(ctx, prio, fds.as_mut_ptr(), n as c_int);
            (g.release)(ctx);
            (ready != 0, timeout, n)
        }
    };
    fds.truncate(n);
    // Chromium's work source asks for a zero timeout whenever its loop is
    // not running (between pumps): only a real wait (a GTK timer) is worth
    // a pass.
    if ready {
        super::schedule(Duration::ZERO);
    } else if timeout > 0 {
        super::schedule(Duration::from_millis(timeout as u64));
    }
    let changed = {
        let mut s = SHARED.lock().unwrap_or_else(|e| e.into_inner());
        s.pumps += 1;
        let changed = s.fds.len() != fds.len()
            || s.fds
                .iter()
                .zip(&fds)
                .any(|(a, b)| a.fd != b.fd || a.events != b.events);
        s.fds = fds;
        changed
    };
    PUMPED.notify_all();
    start();
    if changed {
        if let Some((_, w)) = NUDGE.get() {
            // SAFETY: a byte into the watcher's own pipe.
            unsafe { libc::write(*w, [1u8].as_ptr().cast(), 1) };
        }
    }
}

fn start() {
    static STARTED: OnceLock<()> = OnceLock::new();
    STARTED.get_or_init(|| {
        let mut p = [0; 2];
        // SAFETY: room for two descriptors.
        if unsafe { libc::pipe2(p.as_mut_ptr(), libc::O_CLOEXEC | libc::O_NONBLOCK) } != 0 {
            return;
        }
        let _ = NUDGE.set((p[0], p[1]));
        let _ = std::thread::Builder::new()
            .name("chromium-wake".into())
            .spawn(move || watch(p[0]));
    });
}

fn watch(nudge: c_int) {
    loop {
        let (mut fds, seen) = {
            let s = SHARED.lock().unwrap_or_else(|e| e.into_inner());
            let fds: Vec<libc::pollfd> = s
                .fds
                .iter()
                .map(|f| libc::pollfd {
                    fd: f.fd,
                    events: f.events as i16,
                    revents: 0,
                })
                .collect();
            (fds, s.pumps)
        };
        fds.push(libc::pollfd {
            fd: nudge,
            events: libc::POLLIN,
            revents: 0,
        });
        // SAFETY: a valid array of pollfd, its length passed.
        let n = unsafe { libc::poll(fds.as_mut_ptr(), fds.len() as _, 1000) };
        if n <= 0 {
            continue;
        }
        let last = fds.len() - 1;
        if fds[last].revents != 0 {
            let mut buf = [0u8; 64];
            // SAFETY: draining our own non-blocking pipe.
            while unsafe { libc::read(nudge, buf.as_mut_ptr().cast(), buf.len()) } > 0 {}
        }
        if fds[..last].iter().any(|f| f.revents != 0) {
            LAST_WORK.store(now_ms(), std::sync::atomic::Ordering::Relaxed);
            super::schedule(Duration::ZERO);
            // Until the window has pumped: what woke us is Chromium's to read.
            let s = SHARED.lock().unwrap_or_else(|e| e.into_inner());
            let _ = PUMPED.wait_timeout_while(s, Duration::from_millis(500), |s| s.pumps == seen);
        }
    }
}
