//! Each tab's Chromium page is a native child window of its browser window
//! (docs/CEF.md): an X11 window on Linux, an HWND on Windows, an NSView on
//! macOS. This module finds the browser window's own native handle and
//! places, shows, hides, re-parents and focuses the pages in it.
//!
//! Rectangles are physical pixels from the parent's top-left corner.

use cef::WindowInfo;

/// A native window: X11 `Window`, Win32 `HWND` or `NSView *`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash)]
pub struct Handle(pub usize);

/// Where a page sits in its window, and at what scale (physical pixels per
/// point, for macOS, which places views in points).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Place {
    pub parent: Handle,
    pub rect: [i32; 4],
    pub scale: f32,
}

/// Far off screen: where a page waits until it is shown (Linux has no
/// hidden flag at creation).
pub(crate) const AWAY: i32 = -30_000;

/// The runtime style of every page (docs/CEF.md, docs/CHROME-FEATURES.md): Chrome
/// style, so pages get Chrome's own features (print preview, extensions,
/// autofill, passwords, chrome:// pages, choosers, page info). macOS: CEF
/// always uses Alloy for a page inside a parent NSView, so pages are
/// Chrome style there only when hosted as windows of their own
/// (cef/host.rs `mac_opt_in`).
pub fn style() -> cef::RuntimeStyle {
    let s = if chrome_style() {
        cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_CHROME
    } else {
        cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_ALLOY
    };
    s.into()
}

/// Whether pages run in Chrome style ([`style`]).
pub fn chrome_style() -> bool {
    (!cfg!(target_os = "macos") || crate::cef::host::mac_opt_in())
        && std::env::var_os("REDROB_ALLOY").is_none()
}

/// How a browser's page is created: a child of `place.parent`, hidden
/// unless `shown`.
pub fn child_info(place: Place, shown: bool) -> WindowInfo {
    let [x, y, w, h] = place.rect;
    let (w, h) = (w.max(1), h.max(1));
    let bounds = if cfg!(target_os = "macos") {
        let s = place.scale.max(0.1);
        cef::Rect {
            x: (x as f32 / s).round() as i32,
            y: (y as f32 / s).round() as i32,
            width: (w as f32 / s).round() as i32,
            height: (h as f32 / s).round() as i32,
        }
    } else if !shown && cfg!(target_os = "linux") {
        cef::Rect {
            x: AWAY,
            y: AWAY,
            width: w,
            height: h,
        }
    } else {
        cef::Rect {
            x,
            y,
            width: w,
            height: h,
        }
    };
    // macOS: inside a parent NSView only Alloy (CEF would log an error
    // and pick Alloy itself).
    let runtime_style = if cfg!(target_os = "macos") {
        cef::sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_ALLOY.into()
    } else {
        style()
    };
    let info = WindowInfo {
        runtime_style,
        ..Default::default()
    }
    .set_as_child(raw_handle(place.parent), &bounds);
    #[cfg(windows)]
    let info = {
        use windows_sys::Win32::UI::WindowsAndMessaging::WS_VISIBLE;
        let mut info = info;
        if !shown {
            info.style &= !WS_VISIBLE;
        }
        info
    };
    #[cfg(target_os = "macos")]
    let info = WindowInfo {
        hidden: (!shown) as _,
        ..info
    };
    info
}

#[cfg(windows)]
fn raw_handle(h: Handle) -> cef::sys::cef_window_handle_t {
    cef::sys::HWND(h.0 as _)
}
#[cfg(windows)]
fn handle_value(h: cef::sys::cef_window_handle_t) -> usize {
    h.0 as usize
}
#[cfg(not(windows))]
fn raw_handle(h: Handle) -> cef::sys::cef_window_handle_t {
    h.0 as _
}
#[cfg(not(windows))]
fn handle_value(h: cef::sys::cef_window_handle_t) -> usize {
    h as usize
}

/// The native window of a browser's page.
pub fn of(browser: &cef::Browser) -> Option<Handle> {
    use cef::{ImplBrowser, ImplBrowserHost};
    let h = handle_value(browser.host()?.window_handle());
    (h != 0).then_some(Handle(h))
}

pub use imp::{detach, find_window, focus, place, raise, reparent, set_visible};

/// The native window of a CEF Views window (cef/host.rs).
pub fn window_of(window: &cef::Window) -> Option<Handle> {
    use cef::ImplWindow;
    let h = handle_value(window.window_handle());
    (h != 0).then_some(Handle(h))
}

/// Move a page's own top-level window into `place.parent`, out of sight,
/// and `show` it there (cef/host.rs): it never reaches the window manager
/// (Linux) or the taskbar (Windows), and from then on it is a page like a
/// child one. macOS: it becomes a child window of the browser window
/// instead, shown with the page.
pub use imp::embed;

/// The browser window `place.parent` moved to a screen of another scale:
/// tell a hosted page (Windows, where Chromium learns its scale from its
/// own top-level window's `WM_DPICHANGED`, which a child window never gets).
#[cfg(windows)]
pub use imp::rescale;

#[cfg(not(windows))]
pub fn rescale(_child: Handle, _place: Place) {}

/// Whether `child` moved on screen since the last call, its window having
/// moved (Windows: a child window gets no `WM_MOVE` then, so Chromium is
/// sent one; it keeps the page's screen position for popups and
/// `window.screenX`). Elsewhere Chromium follows by itself.
#[cfg(windows)]
pub use imp::follow;

#[cfg(not(windows))]
pub fn follow(_child: Handle) -> bool {
    false
}

/// Where the pointer is on screen (physical pixels) and whether its
/// primary button is down, whichever window has it: a tab dragged out of
/// a window follows it over others (browser.rs). None where the platform
/// does not say (macOS): the window that took the press reports it.
#[cfg(any(target_os = "linux", windows))]
pub use imp::pointer;

#[cfg(target_os = "macos")]
pub fn pointer() -> Option<(i32, i32, bool)> {
    None
}

/// The browser window's own controls take the keyboard.
#[cfg(not(target_os = "linux"))]
pub fn focus_chrome(top: Handle) {
    focus(top);
}

/// Whether the browser window's controls have the keyboard while the
/// window reads as unfocused (Linux, focus window); elsewhere the window's
/// own focus says it.
#[cfg(not(target_os = "linux"))]
pub fn chrome_has_keyboard(_top: Handle) -> bool {
    false
}

#[cfg(target_os = "linux")]
pub use imp::{chrome_has_keyboard, focus_chrome, set_page_hidden};

#[cfg(target_os = "linux")]
mod imp {
    use std::sync::OnceLock;

    use x11rb::connection::Connection as _;
    use x11rb::protocol::xproto::{
        AtomEnum, ConfigureWindowAux, ConnectionExt as _, InputFocus, PropMode, StackMode, Window,
    };
    use x11rb::rust_connection::RustConnection;
    use x11rb::wrapper::ConnectionExt as _;

    use super::{Handle, Place, AWAY};

    struct X {
        conn: RustConnection,
        root: Window,
    }

    fn x() -> Option<&'static X> {
        static X: OnceLock<Option<X>> = OnceLock::new();
        X.get_or_init(|| {
            let (conn, screen) = x11rb::connect(None).ok()?;
            let root = conn.setup().roots.get(screen)?.root;
            Some(X { conn, root })
        })
        .as_ref()
    }

    fn atom(x: &X, name: &str) -> Option<u32> {
        use std::collections::HashMap;
        use std::sync::Mutex;
        static ATOMS: Mutex<Option<HashMap<String, u32>>> = Mutex::new(None);
        let mut cache = ATOMS.lock().unwrap_or_else(|e| e.into_inner());
        let cache = cache.get_or_insert_with(HashMap::new);
        if let Some(a) = cache.get(name) {
            return Some(*a);
        }
        let a = x
            .conn
            .intern_atom(false, name.as_bytes())
            .ok()?
            .reply()
            .ok()?
            .atom;
        cache.insert(name.to_string(), a);
        Some(a)
    }

    fn property(x: &X, w: Window, prop: u32, kind: u32) -> Option<Vec<u8>> {
        let r = x
            .conn
            .get_property(false, w, prop, kind, 0, 1024)
            .ok()?
            .reply()
            .ok()?;
        Some(r.value)
    }

    /// This process's top-level window titled `title` (the window looks
    /// for itself by a title it sets for a moment, main.rs).
    pub fn find_window(title: &str) -> Option<Handle> {
        let x = x()?;
        let net_name = atom(x, "_NET_WM_NAME")?;
        let utf8 = atom(x, "UTF8_STRING")?;
        let pid_atom = atom(x, "_NET_WM_PID")?;
        let pid = std::process::id();
        let mine = |w: Window| {
            property(x, w, pid_atom, AtomEnum::CARDINAL.into()).and_then(|v| {
                v.get(..4)
                    .map(|b| u32::from_ne_bytes([b[0], b[1], b[2], b[3]]))
            }) == Some(pid)
        };
        let named = |w: Window| {
            property(x, w, net_name, utf8).is_some_and(|v| v == title.as_bytes())
                || property(x, w, AtomEnum::WM_NAME.into(), AtomEnum::STRING.into())
                    .is_some_and(|v| v == title.as_bytes())
        };
        // Window managers put each top-level window inside a frame: look
        // two levels down from the root.
        let mut level = vec![x.root];
        for _ in 0..3 {
            let mut next = Vec::new();
            for w in level {
                let Some(tree) = x.conn.query_tree(w).ok().and_then(|c| c.reply().ok()) else {
                    continue;
                };
                for c in tree.children {
                    if named(c) && mine(c) {
                        return Some(Handle(c as usize));
                    }
                    next.push(c);
                }
            }
            level = next;
        }
        None
    }

    pub fn place(child: Handle, p: Place) {
        let Some(x) = x() else { return };
        let [px, py, w, h] = p.rect;
        let aux = ConfigureWindowAux::new()
            .x(px)
            .y(py)
            .width(w.max(1) as u32)
            .height(h.max(1) as u32);
        if let Ok(c) = x.conn.configure_window(child.0 as Window, &aux) {
            c.ignore_error();
        }
        let _ = x.conn.flush();
    }

    /// Put `child` above its sibling pages (an extension's popup over the
    /// page it acts on).
    pub fn raise(child: Handle) {
        let Some(x) = x() else { return };
        let aux = ConfigureWindowAux::new().stack_mode(StackMode::ABOVE);
        if let Ok(c) = x.conn.configure_window(child.0 as Window, &aux) {
            c.ignore_error();
        }
        let _ = x.conn.flush();
    }

    /// Chromium decides whether a page is hidden (no painting, timers
    /// slowed, `document.hidden`) from its window's `_NET_WM_STATE`, as
    /// cefclient sets it; unmapping alone leaves the page running.
    fn set_hidden_state(x: &X, w: Window, hidden: bool) {
        let (Some(state), Some(hidden_atom)) =
            (atom(x, "_NET_WM_STATE"), atom(x, "_NET_WM_STATE_HIDDEN"))
        else {
            return;
        };
        let data: Vec<u32> = if hidden {
            vec![hidden_atom]
        } else {
            Vec::new()
        };
        if let Ok(c) = x
            .conn
            .change_property32(PropMode::REPLACE, w, state, AtomEnum::ATOM, &data)
        {
            c.ignore_error();
        }
    }

    /// Tell Chromium a page is hidden or shown without moving it (its
    /// browser window was minimized or restored).
    pub fn set_page_hidden(child: Handle, hidden: bool) {
        let Some(x) = x() else { return };
        set_hidden_state(x, child.0 as Window, hidden);
        let _ = x.conn.flush();
    }

    pub fn set_visible(child: Handle, visible: bool, p: Option<Place>) {
        let Some(x) = x() else { return };
        let w = child.0 as Window;
        set_hidden_state(x, w, !visible);
        if visible {
            if let Some(p) = p {
                place(child, p);
            }
            if let Ok(c) = x.conn.map_window(w) {
                c.ignore_error();
            }
        } else {
            // Mapped, out of sight: Chromium stops drawing an unmapped
            // page, and an agent's screenshot of it would never arrive.
            let aux = ConfigureWindowAux::new().x(AWAY).y(AWAY);
            if let Ok(c) = x.conn.configure_window(w, &aux) {
                c.ignore_error();
            }
        }
        let _ = x.conn.flush();
    }

    pub fn reparent(child: Handle, p: Place) {
        let Some(x) = x() else { return };
        let [px, py, ..] = p.rect;
        if let Ok(c) = x.conn.reparent_window(
            child.0 as Window,
            p.parent.0 as Window,
            px as i16,
            py as i16,
        ) {
            c.ignore_error();
        }
        let _ = x.conn.flush();
        place(child, p);
    }

    pub fn embed(child: Handle, p: Place, show: impl FnOnce()) {
        if let Some(x) = x() {
            let w = child.0 as Window;
            if let Ok(c) = x
                .conn
                .reparent_window(w, p.parent.0 as Window, AWAY as i16, AWAY as i16)
            {
                c.ignore_error();
            }
            set_hidden_state(x, w, true);
            let _ = x.conn.flush();
        }
        show();
    }

    /// Out of its window, which is about to be destroyed: under the root,
    /// unmapped, until Chromium destroys it.
    pub fn detach(child: Handle) {
        let Some(x) = x() else { return };
        if let Ok(c) = x.conn.unmap_window(child.0 as Window) {
            c.ignore_error();
        }
        if let Ok(c) = x
            .conn
            .reparent_window(child.0 as Window, x.root, AWAY as i16, AWAY as i16)
        {
            c.ignore_error();
        }
        let _ = x.conn.flush();
    }

    pub fn pointer() -> Option<(i32, i32, bool)> {
        let x = x()?;
        let r = x.conn.query_pointer(x.root).ok()?.reply().ok()?;
        let down = u16::from(r.mask) & u16::from(x11rb::protocol::xproto::KeyButMask::BUTTON1) != 0;
        Some((r.root_x as i32, r.root_y as i32, down))
    }

    /// Give `w` the keyboard.
    pub fn focus(w: Handle) {
        let Some(x) = x() else { return };
        if let Ok(c) =
            x.conn
                .set_input_focus(InputFocus::PARENT, w.0 as Window, x11rb::CURRENT_TIME)
        {
            c.ignore_error();
        }
        let _ = x.conn.flush();
    }

    /// The browser window's own controls take the keyboard.
    pub fn focus_chrome(top: Handle) {
        let Some(x) = x() else { return };
        let to = crate::cef::xdnd::focus_window(top.0 as Window).unwrap_or(top.0 as Window);
        if let Ok(c) = x
            .conn
            .set_input_focus(InputFocus::PARENT, to, x11rb::CURRENT_TIME)
        {
            c.ignore_error();
        }
        let _ = x.conn.flush();
    }

    /// Whether the browser window's controls have the keyboard. The window
    /// manager focuses the browser window itself (a click in its chrome):
    /// the keyboard moves on to its focus window.
    pub fn chrome_has_keyboard(top: Handle) -> bool {
        let Some(x) = x() else { return false };
        let top = top.0 as Window;
        let Some(f) = x.conn.get_input_focus().ok().and_then(|c| c.reply().ok()) else {
            return false;
        };
        let proxy = crate::cef::xdnd::focus_window(top);
        if f.focus == top {
            focus_chrome(Handle(top as usize));
            return true;
        }
        proxy == Some(f.focus)
    }
}

#[cfg(windows)]
mod imp {
    use std::cell::{Cell, RefCell};
    use std::collections::HashMap;

    use windows_sys::Win32::Foundation::{HWND, LPARAM, LRESULT, RECT, WPARAM};
    use windows_sys::Win32::UI::HiDpi::GetDpiForWindow;
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetFocus, SetFocus};
    use windows_sys::Win32::UI::Shell::{DefSubclassProc, RemoveWindowSubclass, SetWindowSubclass};
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowLongW, GetWindowRect, GetWindowTextW, GetWindowThreadProcessId,
        IsChild, SendMessageW, SetParent, SetWindowLongW, SetWindowPos, ShowWindow, GWL_EXSTYLE,
        GWL_STYLE, HTCLIENT, HTERROR, HTNOWHERE, HTTRANSPARENT, HWND_MESSAGE, HWND_TOP,
        SWP_FRAMECHANGED, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOSIZE, SWP_NOZORDER, SW_HIDE, SW_SHOWNA,
        WA_ACTIVE, WA_INACTIVE, WM_ACTIVATE, WM_DPICHANGED, WM_KILLFOCUS, WM_LBUTTONDOWN,
        WM_MBUTTONDOWN, WM_MOVE, WM_NCDESTROY, WM_NCHITTEST, WM_POINTERDOWN, WM_RBUTTONDOWN,
        WM_SETFOCUS, WM_XBUTTONDOWN, WS_CAPTION, WS_CHILD, WS_CLIPCHILDREN, WS_CLIPSIBLINGS,
        WS_EX_APPWINDOW, WS_EX_CLIENTEDGE, WS_EX_DLGMODALFRAME, WS_EX_NOACTIVATE, WS_EX_STATICEDGE,
        WS_EX_TOOLWINDOW, WS_EX_TOPMOST, WS_EX_WINDOWEDGE, WS_MAXIMIZE, WS_MAXIMIZEBOX,
        WS_MINIMIZE, WS_MINIMIZEBOX, WS_POPUP, WS_SYSMENU, WS_THICKFRAME,
    };

    use super::{Handle, Place, AWAY};

    fn hwnd(h: Handle) -> HWND {
        h.0 as HWND
    }

    pub fn find_window(title: &str) -> Option<Handle> {
        struct Search {
            title: Vec<u16>,
            pid: u32,
            found: usize,
        }
        unsafe extern "system" fn each(w: HWND, data: LPARAM) -> i32 {
            // SAFETY: `data` is the Search below, alive for the EnumWindows call.
            let s = unsafe { &mut *(data as *mut Search) };
            let mut pid = 0;
            // SAFETY: a window handle Windows gave us; out pointer to a local.
            unsafe { GetWindowThreadProcessId(w, &mut pid) };
            if pid != s.pid {
                return 1;
            }
            let mut buf = [0u16; 256];
            // SAFETY: the buffer's length is passed.
            let n = unsafe { GetWindowTextW(w, buf.as_mut_ptr(), buf.len() as i32) };
            if n > 0 && buf[..n as usize] == s.title[..] {
                s.found = w as usize;
                return 0;
            }
            1
        }
        let mut s = Search {
            title: title.encode_utf16().collect(),
            pid: std::process::id(),
            found: 0,
        };
        // SAFETY: the callback only touches `s`, which outlives the call.
        unsafe { EnumWindows(Some(each), &mut s as *mut Search as LPARAM) };
        (s.found != 0).then_some(Handle(s.found))
    }

    pub fn place(child: Handle, p: Place) {
        let [x, y, w, h] = p.rect;
        // SAFETY: plain window calls on a handle CEF made; a stale one fails.
        unsafe {
            SetWindowPos(
                hwnd(child),
                std::ptr::null_mut(),
                x,
                y,
                w.max(1),
                h.max(1),
                SWP_NOZORDER | SWP_NOACTIVATE,
            )
        };
    }

    /// Put `child` above its sibling pages.
    pub fn raise(child: Handle) {
        // SAFETY: as above.
        unsafe {
            SetWindowPos(
                hwnd(child),
                HWND_TOP,
                0,
                0,
                0,
                0,
                SWP_NOMOVE | SWP_NOSIZE | SWP_NOACTIVATE,
            )
        };
    }

    pub fn set_visible(child: Handle, visible: bool, p: Option<Place>) {
        if let (true, Some(p)) = (visible, p) {
            place(child, p);
        }
        // SAFETY: as above.
        unsafe { ShowWindow(hwnd(child), if visible { SW_SHOWNA } else { SW_HIDE }) };
    }

    pub fn reparent(child: Handle, p: Place) {
        // SAFETY: as above; both are windows of this process.
        unsafe { SetParent(hwnd(child), hwnd(p.parent)) };
        place(child, p);
    }

    /// Out of its window, which is about to be destroyed: a message-only
    /// window holds it until Chromium destroys it.
    pub fn detach(child: Handle) {
        // SAFETY: as above.
        unsafe { SetParent(hwnd(child), HWND_MESSAGE) };
    }

    pub fn focus(w: Handle) {
        // SAFETY: as above.
        unsafe { SetFocus(hwnd(w)) };
    }

    /// Our subclass of hosted pages' windows (`SetWindowSubclass` id).
    const PAGE: usize = 0x7265_6472;

    thread_local! {
        /// The hosted page Chromium was told is active (`WM_ACTIVATE`).
        static ACTIVE: Cell<usize> = const { Cell::new(0) };
        /// Where each shown page was on screen ([`follow`]).
        static AT: RefCell<HashMap<usize, (i32, i32)>> = RefCell::new(HashMap::new());
    }

    /// Make Chromium's top-level window `child` (a frameless Views window,
    /// cef/host.rs) a child window of `p.parent`, as CEF does for a page
    /// with a parent window (chrome_child_window.cc): `WS_CHILD`, no
    /// caption, frame or taskbar styles, out of sight in the page area.
    /// It is shown without taking activation (as CEF's ShowWindow does
    /// with `WS_EX_NOACTIVATE`), so a tab opening in the background does
    /// not bring the browser window to the front.
    pub fn embed(child: Handle, p: Place, show: impl FnOnce()) {
        let h = hwnd(child);
        let [_, _, w, ht] = p.rect;
        // SAFETY: window calls on a window CEF just made on this thread.
        unsafe {
            let style = GetWindowLongW(h, GWL_STYLE) as u32;
            let frame = WS_POPUP
                | WS_CAPTION
                | WS_THICKFRAME
                | WS_SYSMENU
                | WS_MINIMIZEBOX
                | WS_MAXIMIZEBOX
                | WS_MINIMIZE
                | WS_MAXIMIZE;
            let style = (style & !frame) | WS_CHILD | WS_CLIPSIBLINGS | WS_CLIPCHILDREN;
            // Before SetParent: a window taken from the desktop becomes a
            // child only with WS_CHILD set and WS_POPUP cleared (SetParent).
            SetWindowLongW(h, GWL_STYLE, style as i32);
            let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
            let top = WS_EX_APPWINDOW
                | WS_EX_TOOLWINDOW
                | WS_EX_TOPMOST
                | WS_EX_WINDOWEDGE
                | WS_EX_CLIENTEDGE
                | WS_EX_STATICEDGE
                | WS_EX_DLGMODALFRAME;
            SetWindowLongW(h, GWL_EXSTYLE, ((ex & !top) | WS_EX_NOACTIVATE) as i32);
            SetParent(h, hwnd(p.parent));
            SetWindowPos(
                h,
                std::ptr::null_mut(),
                AWAY,
                AWAY,
                w.max(1),
                ht.max(1),
                SWP_NOZORDER | SWP_NOACTIVATE | SWP_FRAMECHANGED,
            );
            SetWindowSubclass(h, Some(page_proc), PAGE, 0);
        }
        // It was made at the scale of the screen nearest its first
        // position, which need not be the browser window's.
        rescale(
            child,
            Place {
                rect: [AWAY, AWAY, w, ht],
                ..p
            },
        );
        show();
        // SAFETY: as above.
        unsafe {
            let ex = GetWindowLongW(h, GWL_EXSTYLE) as u32;
            SetWindowLongW(h, GWL_EXSTYLE, (ex & !WS_EX_NOACTIVATE) as i32);
        }
    }

    /// Tell Chromium a hosted page's scale is its browser window's now
    /// (per-monitor DPI v2): the `WM_DPICHANGED` a top-level window gets
    /// when it moves to another screen, with the page's rectangle in its
    /// parent, which Chromium applies with SetWindowPos (parent
    /// coordinates for a child window).
    pub fn rescale(child: Handle, p: Place) {
        // SAFETY: plain window calls; a stale handle fails.
        let dpi = unsafe { GetDpiForWindow(hwnd(p.parent)) };
        if dpi == 0 {
            return;
        }
        let [x, y, w, h] = p.rect;
        let mut r = RECT {
            left: x,
            top: y,
            right: x + w.max(1),
            bottom: y + h.max(1),
        };
        // SAFETY: `r` outlives the synchronous SendMessage.
        unsafe {
            SendMessageW(
                hwnd(child),
                WM_DPICHANGED,
                (dpi | (dpi << 16)) as WPARAM,
                &mut r as *mut RECT as LPARAM,
            )
        };
    }

    pub fn follow(child: Handle) -> bool {
        let h = hwnd(child);
        let mut r = RECT {
            left: 0,
            top: 0,
            right: 0,
            bottom: 0,
        };
        // SAFETY: out pointer to a local.
        if unsafe { GetWindowRect(h, &mut r) } == 0 {
            return false;
        }
        let at = (r.left, r.top);
        let before = AT.with_borrow_mut(|a| a.insert(child.0, at));
        if before.is_none() || before == Some(at) {
            return false;
        }
        // HWNDMessageHandler::OnMove ignores the position.
        // SAFETY: as above.
        unsafe { SendMessageW(h, WM_MOVE, 0, 0) };
        true
    }

    /// Chromium counts its window active, and its page focused, only on
    /// `WM_ACTIVATE`, and handles that message only for a top-level
    /// window (HWNDMessageHandler::IsTopLevelWindow reads WS_CHILD): a
    /// child window never gets one. CEF patches Chromium to activate a
    /// window it made a child itself on focus (DesktopWindowTreeHostWin::
    /// HandleNativeFocus); a window made a child afterwards has no such
    /// flag, so it is told here, WS_CHILD lifted for the message, as the
    /// X input focus tells it on Linux.
    fn set_active(h: HWND, on: bool) {
        let cur = ACTIVE.get();
        if on == (cur == h as usize) {
            return;
        }
        if on && cur != 0 {
            set_active(cur as HWND, false);
        }
        ACTIVE.set(if on { h as usize } else { 0 });
        let state = if on { WA_ACTIVE } else { WA_INACTIVE };
        // SAFETY: plain window calls on a page window of this thread.
        unsafe {
            let style = GetWindowLongW(h, GWL_STYLE);
            SetWindowLongW(h, GWL_STYLE, style & !(WS_CHILD as i32));
            SendMessageW(h, WM_ACTIVATE, state as WPARAM, 0);
            SetWindowLongW(h, GWL_STYLE, style);
        }
    }

    /// Hosted pages' window procedure in front of Chromium's.
    unsafe extern "system" fn page_proc(
        h: HWND,
        msg: u32,
        wp: WPARAM,
        lp: LPARAM,
        _id: usize,
        _data: usize,
    ) -> LRESULT {
        // SAFETY: Windows calls this for `h` with its own message; passing
        // it on is what a subclass does.
        let next = || unsafe { DefSubclassProc(h, msg, wp, lp) };
        match msg {
            WM_NCHITTEST => {
                // Never a frame: a click at the page's edge is the page's,
                // not a resize or move of it inside the browser window.
                let r = next();
                if r == HTTRANSPARENT as LRESULT
                    || r == HTNOWHERE as LRESULT
                    || r == HTERROR as LRESULT
                {
                    r
                } else {
                    HTCLIENT as LRESULT
                }
            }
            WM_LBUTTONDOWN | WM_RBUTTONDOWN | WM_MBUTTONDOWN | WM_XBUTTONDOWN | WM_POINTERDOWN => {
                // A click takes the keyboard (CEF's patch does this for its
                // own child windows in DesktopWindowTreeHostWin).
                // SAFETY: plain window calls.
                unsafe {
                    if GetFocus() != h {
                        SetFocus(h);
                    }
                }
                next()
            }
            WM_SETFOCUS => {
                let r = next();
                set_active(h, true);
                r
            }
            WM_KILLFOCUS => {
                let r = next();
                let to = wp as HWND;
                // SAFETY: plain window call; a null `to` is no child.
                if to != h && unsafe { IsChild(h, to) } == 0 {
                    set_active(h, false);
                }
                r
            }
            WM_NCDESTROY => {
                if ACTIVE.get() == h as usize {
                    ACTIVE.set(0);
                }
                AT.with_borrow_mut(|a| a.remove(&(h as usize)));
                // SAFETY: removing this very subclass from its window.
                unsafe { RemoveWindowSubclass(h, Some(page_proc), PAGE) };
                next()
            }
            _ => next(),
        }
    }

    pub fn pointer() -> Option<(i32, i32, bool)> {
        use windows_sys::Win32::Foundation::POINT;
        use windows_sys::Win32::UI::Input::KeyboardAndMouse::{GetAsyncKeyState, VK_LBUTTON};
        use windows_sys::Win32::UI::WindowsAndMessaging::GetCursorPos;
        let mut p = POINT { x: 0, y: 0 };
        // SAFETY: out pointer to a local.
        if unsafe { GetCursorPos(&mut p) } == 0 {
            return None;
        }
        // SAFETY: no pointers.
        let down = unsafe { GetAsyncKeyState(VK_LBUTTON as i32) } as u16 & 0x8000 != 0;
        Some((p.x, p.y, down))
    }
}

#[cfg(target_os = "macos")]
mod imp {
    use std::cell::RefCell;
    use std::collections::HashMap;

    use objc2::rc::Retained;
    use objc2::{define_class, msg_send, MainThreadMarker, MainThreadOnly};
    use objc2_app_kit::{
        NSApplication, NSBackingStoreType, NSView, NSWindow, NSWindowCollectionBehavior,
        NSWindowOrderingMode, NSWindowStyleMask,
    };
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    use super::{Handle, Place};

    define_class!(
        /// A borderless window that can take the keyboard (an extension's
        /// popup lifted over hosted pages, [`float`]).
        #[unsafe(super(NSWindow))]
        #[thread_kind = MainThreadOnly]
        #[name = "RedrobFloatWindow"]
        struct FloatWindow;

        impl FloatWindow {
            #[unsafe(method(canBecomeKeyWindow))]
            fn can_become_key_window(&self) -> bool {
                true
            }
        }
    );

    thread_local! {
        /// Views of the browser window lifted into a window of their own,
        /// by view ([`float`]).
        static FLOATS: RefCell<HashMap<usize, Retained<NSWindow>>> = RefCell::new(HashMap::new());
    }

    /// The view behind a handle. Only views this window made or CEF made
    /// in it are ever passed here, and they live while their tab does.
    fn view(h: Handle) -> Option<&'static NSView> {
        // SAFETY: see above; a null handle gives None.
        unsafe { (h.0 as *const NSView).as_ref() }
    }

    /// The window `c` is the content view of: a page hosted as a window
    /// of its own (cef/host.rs), or a view lifted out ([`float`]). A page
    /// inside the browser window (Alloy, child NSView) has none.
    fn own_window(c: &NSView) -> Option<Retained<NSWindow>> {
        let w = c.window()?;
        let content = w.contentView()?;
        std::ptr::eq(Retained::as_ptr(&content), c).then_some(w)
    }

    fn same(a: &NSWindow, b: &NSWindow) -> bool {
        std::ptr::eq(a, b)
    }

    pub fn find_window(title: &str) -> Option<Handle> {
        let mtm = MainThreadMarker::new()?;
        let app = NSApplication::sharedApplication(mtm);
        for w in app.windows().iter() {
            if w.title().to_string() == title {
                let v = w.contentView()?;
                return Some(Handle(Retained::as_ptr(&v) as usize));
            }
        }
        None
    }

    /// The frame of a child view, in its parent's coordinates (points,
    /// bottom-up unless the parent is flipped).
    fn frame(parent: &NSView, p: Place) -> NSRect {
        let s = p.scale.max(0.1) as f64;
        let [x, y, w, h] = p.rect.map(|v| v as f64 / s);
        let y = if parent.isFlipped() {
            y
        } else {
            parent.bounds().size.height - y - h
        };
        NSRect::new(NSPoint::new(x, y), NSSize::new(w.max(1.0), h.max(1.0)))
    }

    /// `p`'s rectangle on screen (points, bottom-up), and the browser
    /// window it is in.
    fn on_screen(p: Place) -> Option<(NSRect, Retained<NSWindow>)> {
        let parent = view(p.parent)?;
        let win = parent.window()?;
        let in_window = parent.convertRect_toView(frame(parent, p), None);
        Some((win.convertRectToScreen(in_window), win))
    }

    /// Keep `w` a child window of `parent` (it moves, hides and minimizes
    /// with it) and in front of the other ones.
    fn attach(w: &NSWindow, parent: &NSWindow) {
        if let Some(old) = w.parentWindow() {
            if same(&old, parent) {
                // Re-added below: the last child added is the front one.
                parent.removeChildWindow(w);
            } else {
                old.removeChildWindow(w);
            }
        }
        // SAFETY: both are live windows of this process, on the main
        // thread.
        unsafe { parent.addChildWindow_ordered(w, NSWindowOrderingMode::Above) };
        w.orderWindow_relativeTo(NSWindowOrderingMode::Above, parent.windowNumber());
        // Lifted views (an extension's popup) stay in front of the pages.
        if !FLOATS.with_borrow(|f| f.values().any(|x| same(x, w))) {
            let floats: Vec<Retained<NSWindow>> = FLOATS.with_borrow(|f| {
                f.values()
                    .filter(|x| x.isVisible() && x.parentWindow().is_some_and(|p| same(&p, parent)))
                    .cloned()
                    .collect()
            });
            for f in floats {
                parent.removeChildWindow(&f);
                // SAFETY: as above.
                unsafe { parent.addChildWindow_ordered(&f, NSWindowOrderingMode::Above) };
            }
        }
    }

    fn unattach(w: &NSWindow) {
        if let Some(p) = w.parentWindow() {
            p.removeChildWindow(w);
        }
        w.orderOut(None);
    }

    /// Lift `c`, a view of the browser window (an extension's popup), into
    /// a borderless window of its own: a hosted page is a child window,
    /// and a child window covers every view of its parent.
    fn float(c: &NSView) -> Option<Retained<NSWindow>> {
        let mtm = MainThreadMarker::new()?;
        let parent_view = c.superview_main()?;
        let parent = parent_view.window()?;
        let rect = parent.convertRectToScreen(parent_view.convertRect_toView(c.frame(), None));
        // Windows of views that are gone.
        FLOATS.with_borrow_mut(|f| f.retain(|_, w| w.contentView().is_some()));
        let this = FloatWindow::alloc(mtm).set_ivars(());
        // SAFETY: NSWindow's designated initializer, on the main thread.
        let w: Retained<FloatWindow> = unsafe {
            msg_send![
                super(this),
                initWithContentRect: rect,
                styleMask: NSWindowStyleMask::Borderless,
                backing: NSBackingStoreType::Buffered,
                defer: false,
            ]
        };
        let w: Retained<NSWindow> = w.into_super();
        // SAFETY: we hold the window; AppKit must not free it on close.
        unsafe { w.setReleasedWhenClosed(false) };
        w.setHasShadow(true);
        w.setCollectionBehavior(NSWindowCollectionBehavior::FullScreenAuxiliary);
        // SAFETY: `c` is a live view; kept alive while it moves.
        let keep = unsafe { Retained::retain(c as *const NSView as *mut NSView) };
        c.removeFromSuperview();
        w.setContentView(Some(c));
        drop(keep);
        attach(&w, &parent);
        FLOATS.with_borrow_mut(|f| f.insert(c as *const NSView as usize, w.clone()));
        Some(w)
    }

    pub fn place(child: Handle, p: Place) {
        let Some(c) = view(child) else { return };
        if let Some(w) = own_window(c) {
            if let Some((r, _)) = on_screen(p) {
                w.setFrame_display(w.frameRectForContentRect(r), true);
            }
            return;
        }
        let Some(parent) = view(p.parent) else { return };
        c.setFrame(frame(parent, p));
    }

    /// Put `child` above its sibling pages: the last subview draws on top,
    /// the last child window added is the front one.
    pub fn raise(child: Handle) {
        let Some(c) = view(child) else { return };
        if let Some(w) = own_window(c) {
            if let Some(p) = w.parentWindow() {
                attach(&w, &p);
            }
            return;
        }
        if crate::cef::host::enabled() {
            float(c);
            return;
        }
        let Some(parent) = c.superview_main() else {
            return;
        };
        // SAFETY: `c` is a live view; kept alive while it moves.
        let keep = unsafe { Retained::retain(c as *const NSView as *mut NSView) };
        c.removeFromSuperview();
        parent.addSubview(c);
        drop(keep);
    }

    pub fn set_visible(child: Handle, visible: bool, p: Option<Place>) {
        let Some(c) = view(child) else { return };
        if let Some(w) = own_window(c) {
            match (visible, p) {
                (true, Some(p)) => {
                    place(child, p);
                    if let Some((_, parent)) = on_screen(p) {
                        attach(&w, &parent);
                    }
                }
                (true, None) => {
                    if let Some(parent) = w.parentWindow() {
                        attach(&w, &parent);
                    }
                }
                (false, _) => unattach(&w),
            }
            return;
        }
        if let (true, Some(p)) = (visible, p) {
            place(child, p);
        }
        c.setHidden(!visible);
    }

    pub fn reparent(child: Handle, p: Place) {
        let Some(c) = view(child) else { return };
        if let Some(w) = own_window(c) {
            if w.isVisible() {
                if let Some((_, parent)) = on_screen(p) {
                    attach(&w, &parent);
                }
            }
            place(child, p);
            return;
        }
        let Some(parent) = view(p.parent) else { return };
        // Keep it alive between leaving the old window and joining the new.
        // SAFETY: `c` is a live view.
        let keep = unsafe { Retained::retain(c as *const NSView as *mut NSView) };
        c.removeFromSuperview();
        parent.addSubview(c);
        drop(keep);
        place(child, p);
    }

    /// Out of its window, which is about to close; CEF keeps the view
    /// until it destroys it.
    pub fn detach(child: Handle) {
        let Some(c) = view(child) else { return };
        let lifted = FLOATS.with_borrow_mut(|f| f.remove(&child.0));
        if let Some(w) = own_window(c) {
            unattach(&w);
            if lifted.is_none() {
                // A hosted page's window: Chrome closes it with the page.
                return;
            }
        }
        // The window held the last reference: keep one, so the view
        // outlives it until CEF is done with it (a closed tab's view).
        // SAFETY: `c` is a live view.
        std::mem::forget(unsafe { Retained::retain(c as *const NSView as *mut NSView) });
        c.removeFromSuperview();
        if let Some(w) = lifted {
            w.setContentView(None);
        }
    }

    pub fn focus(h: Handle) {
        let Some(v) = view(h) else { return };
        let Some(win) = v.window() else { return };
        // A hosted page's own window, a lifted popup's, or the browser
        // window taking the keyboard back from them.
        if !win.isKeyWindow() {
            win.makeKeyWindow();
        }
        win.makeFirstResponder(Some(v));
    }

    /// `superview` on the main thread, where every view here lives.
    trait Superview {
        fn superview_main(&self) -> Option<Retained<NSView>>;
    }

    impl Superview for NSView {
        fn superview_main(&self) -> Option<Retained<NSView>> {
            // SAFETY: read on the main thread (the window's), on a live view.
            unsafe { self.superview() }
        }
    }

    /// A page window hosted here: no shadow over the page area, and it
    /// goes with the browser window into a fullscreen space (a page asking
    /// for fullscreen stays over the page area, host.rs).
    pub fn embed(child: Handle, _p: Place, _show: impl FnOnce()) {
        // Not shown here: Widget::Show would make it key and bring the
        // browser window forward for every tab opened in the background.
        // It is ordered in as a child window when its tab is on screen.
        let Some(w) = view(child).and_then(own_window) else {
            return;
        };
        w.setHasShadow(false);
        w.setCollectionBehavior(NSWindowCollectionBehavior::FullScreenAuxiliary);
    }
}
