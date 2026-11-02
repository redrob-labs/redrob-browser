//! Linux: run glib's main context for Chromium, and wake the window loop
//! when it has work.
//!
//! Chromium runs on the window thread through the external message pump
//! (`cef::pump`), which runs Chromium's own tasks only. Its X11 connection
//! (input and expose for its windows, the clipboard's selection requests)
//! and the input method's D-Bus replies are glib sources on the default
//! main context, which the program's loop has to run, as cefclient's glib
//! loop does. After each pump [`after_pump`] runs the main context's ready
//! sources, then asks glib which descriptors and timeout it waits on, and a
//! watcher thread polls them and asks for a pass as soon as one is
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

struct Glib {
    default: unsafe extern "C" fn() -> Ctx,
    acquire: unsafe extern "C" fn(Ctx) -> c_int,
    release: unsafe extern "C" fn(Ctx),
    prepare: unsafe extern "C" fn(Ctx, *mut c_int) -> c_int,
    query: unsafe extern "C" fn(Ctx, c_int, *mut c_int, *mut GPollFd, c_int) -> c_int,
    check: unsafe extern "C" fn(Ctx, c_int, *mut GPollFd, c_int) -> c_int,
    iteration: unsafe extern "C" fn(Ctx, c_int) -> c_int,
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
                default: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_default")?),
                acquire: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_acquire")?),
                release: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_release")?),
                prepare: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_prepare")?),
                query: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_query")?),
                check: std::mem::transmute::<*mut c_void, _>(sym("g_main_context_check")?),
                iteration: std::mem::transmute::<*mut c_void, _>(sym(
                    "g_main_context_iteration",
                )?),
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

/// Call on the window thread right after each pump.
pub fn after_pump() {
    let Some(g) = glib() else { return };
    let mut fds = vec![GPollFd::default(); 32];
    let (ready, timeout, n) = {
        // SAFETY: the default main context, owned by this thread (the one
        // Chromium pumps on), not inside an iteration now. After running
        // what is ready, prepare, query and check make one more cycle
        // without dispatching, to learn what to wait on; the next pass
        // dispatches what that found ready.
        unsafe {
            let ctx = (g.default)();
            if (g.acquire)(ctx) == 0 {
                return;
            }
            // What is ready now (X11 events, D-Bus replies), without
            // blocking; a bounded number of rounds, the rest next pass.
            for _ in 0..16 {
                if (g.iteration)(ctx, 0) == 0 {
                    break;
                }
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
    if ready {
        super::schedule(Duration::ZERO);
    } else if timeout >= 0 {
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
            super::schedule(Duration::ZERO);
            // Until the window has pumped: what woke us is Chromium's to read.
            let s = SHARED.lock().unwrap_or_else(|e| e.into_inner());
            let _ = PUMPED.wait_timeout_while(s, Duration::from_millis(500), |s| s.pumps == seen);
        }
    }
}
