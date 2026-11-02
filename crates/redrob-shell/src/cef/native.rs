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
const AWAY: i32 = -30_000;

/// The runtime style of every page (docs/CEF.md, docs/FEATURES.md): Chrome
/// style, so pages get Chrome's own features (print preview, extensions,
/// autofill, passwords, chrome:// pages, choosers, page info). macOS: CEF
/// always uses Alloy for a page inside a parent NSView.
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
    !cfg!(target_os = "macos") && std::env::var_os("REDROB_ALLOY").is_none()
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
    let info = WindowInfo {
        runtime_style: style(),
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

pub use imp::{detach, find_window, focus, place, reparent, set_visible};

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
        AtomEnum, ConfigureWindowAux, ConnectionExt as _, InputFocus, PropMode, Window,
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
    use windows_sys::Win32::Foundation::{HWND, LPARAM};
    use windows_sys::Win32::UI::Input::KeyboardAndMouse::SetFocus;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        EnumWindows, GetWindowTextW, GetWindowThreadProcessId, SetParent, SetWindowPos, ShowWindow,
        HWND_MESSAGE, SWP_NOACTIVATE, SWP_NOZORDER, SW_HIDE, SW_SHOWNA,
    };

    use super::{Handle, Place};

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
}

#[cfg(target_os = "macos")]
mod imp {
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSView};
    use objc2_foundation::{NSPoint, NSRect, NSSize};

    use super::{Handle, Place};

    /// The view behind a handle. Only views this window made or CEF made
    /// in it are ever passed here, and they live while their tab does.
    fn view(h: Handle) -> Option<&'static NSView> {
        // SAFETY: see above; a null handle gives None.
        unsafe { (h.0 as *const NSView).as_ref() }
    }

    pub fn find_window(title: &str) -> Option<Handle> {
        let mtm = MainThreadMarker::new()?;
        let app = NSApplication::sharedApplication(mtm);
        for w in app.windows().iter() {
            if w.title().to_string() == title {
                let v = w.contentView()?;
                return Some(Handle(objc2::rc::Retained::as_ptr(&v) as usize));
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

    pub fn place(child: Handle, p: Place) {
        let (Some(c), Some(parent)) = (view(child), view(p.parent)) else {
            return;
        };
        c.setFrame(frame(parent, p));
    }

    pub fn set_visible(child: Handle, visible: bool, p: Option<Place>) {
        let Some(c) = view(child) else { return };
        if let (true, Some(p)) = (visible, p) {
            place(child, p);
        }
        c.setHidden(!visible);
    }

    pub fn reparent(child: Handle, p: Place) {
        let (Some(c), Some(parent)) = (view(child), view(p.parent)) else {
            return;
        };
        // Keep it alive between leaving the old window and joining the new.
        // SAFETY: `c` is a live view.
        let keep = unsafe { objc2::rc::Retained::retain(c as *const NSView as *mut NSView) };
        c.removeFromSuperview();
        parent.addSubview(c);
        drop(keep);
        place(child, p);
    }

    /// Out of its window, which is about to close; CEF keeps the view
    /// until it destroys it.
    pub fn detach(child: Handle) {
        if let Some(c) = view(child) {
            // The window held the last reference: keep one, so the view
            // outlives it until CEF is done with it (a closed tab's view).
            // SAFETY: `c` is a live view.
            std::mem::forget(unsafe {
                objc2::rc::Retained::retain(c as *const NSView as *mut NSView)
            });
            c.removeFromSuperview();
        }
    }

    pub fn focus(w: Handle) {
        let Some(v) = view(w) else { return };
        if let Some(win) = v.window() {
            win.makeFirstResponder(Some(v));
        }
    }
}
