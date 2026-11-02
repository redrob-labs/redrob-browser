//! Linux: drag and drop over a browser window (XDND).
//!
//! Chromium points the browser window's `XdndProxy` at the page window it
//! made last, so every drop over the window went to that page: a hidden
//! tab's, and the toolbar could take none. Here each browser window gets a
//! proxy window of its own. Over the page area of the tab on screen it
//! forwards the drag to that page unchanged (Chromium answers the source
//! itself); over the tab strip and toolbar it is the drop target, as
//! Chrome's omnibox and tab strip are: a dropped link or text opens there
//! ([`take_drops`]).
//!
//! The same connection owns each browser window's focus window
//! ([`focus_window`]): an input-only child out of sight that has the
//! keyboard while the chrome does. With the browser window itself focused,
//! X reports keys to the page under the pointer; and X never passes key
//! events above the focus window, so the keys it gets are handed on to the
//! browser window (winit), as GTK's focus window does for GTK. The keys
//! egui has no name for, the Korean 한/영 and 한자 keys, go to the input
//! method (ime.rs) on the way. While a page has the keyboard, its window
//! takes them and Chromium's input method does.

use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};

use x11rb::connection::Connection as _;
use x11rb::protocol::xproto::{
    AtomEnum, ClientMessageEvent, ConnectionExt as _, CreateWindowAux, EventMask, PropMode, Window,
    WindowClass,
};
use x11rb::protocol::Event;
use x11rb::rust_connection::RustConnection;
use x11rb::wrapper::ConnectionExt as _;

use super::native::Handle;

/// Something dropped on a window's chrome: the window, the point (physical
/// pixels from its top-left) and the text (a link, or words to search).
pub struct Drop {
    pub window: Handle,
    pub at: (i32, i32),
    pub text: String,
}

struct Target {
    proxy: Window,
    /// The page on screen: its XDND window and its rectangle.
    page: Option<(Window, [i32; 4])>,
    /// The page on screen, as the engine knows it (its native window).
    shown: Option<Handle>,
}

/// One drag in progress over a proxy.
struct Drag {
    toplevel: Window,
    /// The window the source addressed (proxy or browser window).
    to: Window,
    source: Window,
    enter: [u32; 5],
    /// The drag is over the page (forwarded) rather than the chrome.
    in_page: Option<Window>,
    /// Over the chrome: the point, the type it will take.
    at: (i32, i32),
    chosen: Option<u32>,
}

struct X {
    conn: RustConnection,
    root: Window,
    atoms: HashMap<&'static str, u32>,
}

#[derive(Default)]
struct State {
    targets: HashMap<Window, Target>,
    drag: Option<Drag>,
    drops: Vec<Drop>,
}

static STATE: Mutex<Option<State>> = Mutex::new(None);
static WAKE: OnceLock<Box<dyn Fn() + Send + Sync>> = OnceLock::new();

const NAMES: &[&str] = &[
    "XdndAware",
    "XdndProxy",
    "XdndEnter",
    "XdndPosition",
    "XdndStatus",
    "XdndLeave",
    "XdndDrop",
    "XdndFinished",
    "XdndSelection",
    "XdndTypeList",
    "XdndActionCopy",
    "text/uri-list",
    "text/x-moz-url",
    "text/plain;charset=utf-8",
    "UTF8_STRING",
    "text/plain",
    "REDROB_DROP",
    "_NET_WM_STATE",
    "_NET_WM_STATE_HIDDEN",
];

fn x() -> Option<&'static X> {
    static X: OnceLock<Option<X>> = OnceLock::new();
    X.get_or_init(|| {
        let (conn, screen) = x11rb::connect(None).ok()?;
        let root = conn.setup().roots.get(screen)?.root;
        let mut atoms = HashMap::new();
        for n in NAMES {
            let a = conn
                .intern_atom(false, n.as_bytes())
                .ok()?
                .reply()
                .ok()?
                .atom;
            atoms.insert(*n, a);
        }
        let x = X { conn, root, atoms };
        std::thread::Builder::new()
            .name("xdnd".into())
            .spawn(run)
            .ok()?;
        Some(x)
    })
    .as_ref()
}

fn atom(x: &X, n: &str) -> u32 {
    x.atoms.get(n).copied().unwrap_or(0)
}

/// How the window learns that something was dropped.
pub fn set_waker(wake: impl Fn() + Send + Sync + 'static) {
    let _ = WAKE.set(Box::new(wake));
}

/// What was dropped on the windows' chrome since the last call.
pub fn take_drops() -> Vec<Drop> {
    STATE
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_mut()
        .map(|s| std::mem::take(&mut s.drops))
        .unwrap_or_default()
}

/// The window of a page that takes XDND: the page window itself or the
/// first of its descendants that says so.
fn dnd_window(x: &X, w: Window) -> Window {
    let aware = atom(x, "XdndAware");
    let mut level = vec![w];
    for _ in 0..3 {
        let mut next = Vec::new();
        for w in level {
            let has = x
                .conn
                .get_property(false, w, aware, AtomEnum::ANY, 0, 1)
                .ok()
                .and_then(|c| c.reply().ok())
                .is_some_and(|r| r.type_ != 0);
            if has {
                return w;
            }
            if let Some(t) = x.conn.query_tree(w).ok().and_then(|c| c.reply().ok()) {
                next.extend(t.children);
            }
        }
        level = next;
    }
    w
}

/// Browser window `toplevel` shows `page` (a page's native window) at
/// `rect`, or no page. Makes its proxy the first time, and points the
/// window's `XdndProxy` at it again (Chromium resets it for every page it
/// makes).
pub fn set_target(toplevel: Handle, page: Option<(Handle, [i32; 4])>) {
    let Some(x) = x() else { return };
    let top = toplevel.0 as Window;
    let shown = page.map(|(p, _)| p);
    let page = page.map(|(p, r)| (dnd_window(x, p.0 as Window), r));
    let mut st = STATE.lock().unwrap_or_else(|e| e.into_inner());
    let st = st.get_or_insert_with(State::default);
    let proxy = match st.targets.get(&top) {
        Some(t) => t.proxy,
        None => {
            let Ok(proxy) = x.conn.generate_id() else {
                return;
            };
            let aux = CreateWindowAux::new().override_redirect(1);
            if x.conn
                .create_window(
                    0,
                    proxy,
                    x.root,
                    -10,
                    -10,
                    1,
                    1,
                    0,
                    WindowClass::INPUT_ONLY,
                    0,
                    &aux,
                )
                .is_err()
            {
                return;
            }
            let _ = x.conn.change_property32(
                PropMode::REPLACE,
                proxy,
                atom(x, "XdndAware"),
                AtomEnum::ATOM,
                &[5],
            );
            let _ = x.conn.change_property32(
                PropMode::REPLACE,
                proxy,
                atom(x, "XdndProxy"),
                AtomEnum::WINDOW,
                &[proxy],
            );
            proxy
        }
    };
    let _ = x.conn.change_property32(
        PropMode::REPLACE,
        top,
        atom(x, "XdndProxy"),
        AtomEnum::WINDOW,
        &[proxy],
    );
    let _ = x.conn.flush();
    if !st.targets.contains_key(&top) {
        // Minimized and restored: its page is hidden and shown with it.
        let aux = x11rb::protocol::xproto::ChangeWindowAttributesAux::new()
            .event_mask(EventMask::STRUCTURE_NOTIFY | EventMask::PROPERTY_CHANGE);
        let _ = x.conn.change_window_attributes(top, &aux);
        let _ = x.conn.flush();
    }
    st.targets.insert(top, Target { proxy, page, shown });
}

/// The browser window closes.
pub fn forget(toplevel: Handle) {
    let Some(x) = x() else { return };
    let mut st = STATE.lock().unwrap_or_else(|e| e.into_inner());
    if let Some(t) = st
        .as_mut()
        .and_then(|s| s.targets.remove(&(toplevel.0 as Window)))
    {
        let _ = x.conn.destroy_window(t.proxy);
        let _ = x.conn.flush();
    }
}

fn send(x: &X, to: Window, window: Window, kind: &str, data: [u32; 5]) {
    let e = ClientMessageEvent::new(32, window, atom(x, kind), data);
    let _ = x.conn.send_event(false, to, EventMask::NO_EVENT, e);
    let _ = x.conn.flush();
}

/// Forward a message to the page, addressed to it: Chromium finds the
/// page by the message's window, as when the source sent it there.
fn forward(x: &X, page: Window, e: &ClientMessageEvent) {
    let mut e = *e;
    e.window = page;
    let _ = x.conn.send_event(false, page, EventMask::NO_EVENT, e);
    let _ = x.conn.flush();
}

fn run() {
    let Some(x) = x() else { return };
    loop {
        let Ok(ev) = x.conn.wait_for_event() else {
            return;
        };
        let mut st = STATE.lock().unwrap_or_else(|e| e.into_inner());
        let st = st.get_or_insert_with(State::default);
        match ev {
            Event::ClientMessage(e) => client_message(x, st, &e),
            // The window manager unmaps a minimized window. Chromium does
            // not see its page hidden with it (a child window keeps its
            // own state), so it is told, as cefclient does.
            Event::UnmapNotify(e) if e.window == e.event => {
                if let Some(p) = st.targets.get(&e.window).and_then(|t| t.shown) {
                    super::native::set_page_hidden(p, true);
                }
            }
            Event::MapNotify(e) if e.window == e.event => {
                if let Some(p) = st.targets.get(&e.window).and_then(|t| t.shown) {
                    super::native::set_page_hidden(p, false);
                }
            }
            // Window managers that keep a minimized window mapped (its
            // frame goes) say so in _NET_WM_STATE.
            Event::PropertyNotify(e) if e.atom == atom(x, "_NET_WM_STATE") => {
                if let Some(p) = st.targets.get(&e.window).and_then(|t| t.shown) {
                    let hidden = x
                        .conn
                        .get_property(false, e.window, e.atom, AtomEnum::ATOM, 0, 64)
                        .ok()
                        .and_then(|c| c.reply().ok())
                        .and_then(|r| {
                            r.value32()
                                .map(|mut v| v.any(|a| a == atom(x, "_NET_WM_STATE_HIDDEN")))
                        })
                        .unwrap_or(false);
                    super::native::set_page_hidden(p, hidden);
                }
            }
            Event::KeyPress(e) => {
                korean_key(x, e.detail, false);
                pass_key(x, e);
            }
            Event::KeyRelease(e) => {
                korean_key(x, e.detail, true);
                pass_key(x, e);
            }
            Event::SelectionNotify(e) => {
                let Some(d) = st.drag.take() else { continue };
                let mut text = String::new();
                if e.property != 0 {
                    if let Some(r) = x
                        .conn
                        .get_property(true, e.requestor, e.property, AtomEnum::ANY, 0, 1 << 20)
                        .ok()
                        .and_then(|c| c.reply().ok())
                    {
                        text = decode(x, d.chosen.unwrap_or(0), &r.value);
                    }
                }
                send(
                    x,
                    d.source,
                    d.source,
                    "XdndFinished",
                    [
                        d.to,
                        (!text.is_empty()) as u32,
                        atom(x, "XdndActionCopy"),
                        0,
                        0,
                    ],
                );
                if !text.is_empty() {
                    st.drops.push(Drop {
                        window: Handle(d.toplevel as usize),
                        at: d.at,
                        text,
                    });
                    if let Some(w) = WAKE.get() {
                        w();
                    }
                }
            }
            _ => {}
        }
    }
}

/// Each browser window's focus window, by browser window.
static FOCUS: Mutex<Option<HashMap<Window, Window>>> = Mutex::new(None);

/// The focus window of browser window `top`, made the first time.
pub fn focus_window(top: Window) -> Option<Window> {
    let x = x()?;
    let mut f = FOCUS.lock().unwrap_or_else(|e| e.into_inner());
    let f = f.get_or_insert_with(HashMap::new);
    if let Some(w) = f.get(&top) {
        return Some(*w);
    }
    let w = x.conn.generate_id().ok()?;
    let aux = CreateWindowAux::new().event_mask(EventMask::KEY_PRESS | EventMask::KEY_RELEASE);
    x.conn
        .create_window(
            0,
            w,
            top,
            -10,
            -10,
            1,
            1,
            0,
            WindowClass::INPUT_ONLY,
            0,
            &aux,
        )
        .ok()?;
    x.conn.map_window(w).ok()?;
    let _ = x.conn.flush();
    f.insert(top, w);
    Some(w)
}

/// A key the focus window got goes on to its browser window, as if the
/// server had sent it there.
fn pass_key(x: &X, e: x11rb::protocol::xproto::KeyPressEvent) {
    let top = FOCUS
        .lock()
        .unwrap_or_else(|e| e.into_inner())
        .as_ref()
        .and_then(|f| f.iter().find(|(_, w)| **w == e.event).map(|(t, _)| *t));
    let Some(top) = top else { return };
    let mut k = e;
    k.event = top;
    k.child = e.event;
    let mask = if e.response_type & 0x7f == x11rb::protocol::xproto::KEY_RELEASE_EVENT {
        EventMask::KEY_RELEASE
    } else {
        EventMask::KEY_PRESS
    };
    let _ = x.conn.send_event(false, top, mask, k);
    let _ = x.conn.flush();
}

/// The 한/영 (Hangul) and 한자 (Hangul_Hanja) keysyms.
const HANGUL: [u32; 2] = [0xff31, 0xff34];

fn korean_key(x: &X, code: u8, release: bool) {
    static MAP: OnceLock<HashMap<u8, u32>> = OnceLock::new();
    let map = MAP.get_or_init(|| {
        let setup = x.conn.setup();
        let (min, max) = (setup.min_keycode, setup.max_keycode);
        let mut m = HashMap::new();
        if let Some(r) = x
            .conn
            .get_keyboard_mapping(min, max - min + 1)
            .ok()
            .and_then(|c| c.reply().ok())
        {
            let per = r.keysyms_per_keycode.max(1) as usize;
            for (i, syms) in r.keysyms.chunks(per).enumerate() {
                if let Some(s) = syms.iter().find(|s| HANGUL.contains(s)) {
                    m.insert(min + i as u8, *s);
                }
            }
        }
        m
    });
    if let Some(sym) = map.get(&code) {
        crate::ime::raw_key(*sym, code as u32, release);
        if let Some(w) = WAKE.get() {
            w();
        }
    }
}

/// The first link or line of text in what was dropped.
fn decode(x: &X, kind: u32, v: &[u8]) -> String {
    let s = if kind == atom(x, "text/x-moz-url") {
        let u: Vec<u16> = v
            .as_chunks::<2>()
            .0
            .iter()
            .map(|c| u16::from_ne_bytes(*c))
            .collect();
        String::from_utf16_lossy(&u)
    } else {
        String::from_utf8_lossy(v).into_owned()
    };
    let s = s.trim_matches('\0');
    if kind == atom(x, "text/uri-list") || kind == atom(x, "text/x-moz-url") {
        s.lines()
            .map(str::trim)
            .find(|l| !l.is_empty() && !l.starts_with('#'))
            .unwrap_or("")
            .to_string()
    } else {
        s.trim().to_string()
    }
}

fn client_message(x: &X, st: &mut State, e: &ClientMessageEvent) {
    let data = e.data.as_data32();
    let kind = e.type_;
    crate::cdp::trace(format_args!(
        "xdnd {} window {:#x} data {:x?}",
        x.atoms
            .iter()
            .find(|(_, a)| **a == kind)
            .map_or("?", |(n, _)| n),
        e.window,
        data
    ));
    // Sources address the proxy or the browser window it stands for; the
    // answers name the same window.
    let to = e.window;
    let Some((&top, target)) = st
        .targets
        .iter()
        .find(|(top, t)| **top == to || t.proxy == to)
    else {
        return;
    };
    let page = target.page;
    if kind == atom(x, "XdndEnter") {
        let source = data[0];
        let mut types: Vec<u32> = data[2..5].iter().copied().filter(|t| *t != 0).collect();
        if data[1] & 1 != 0 {
            if let Some(r) = x
                .conn
                .get_property(
                    false,
                    source,
                    atom(x, "XdndTypeList"),
                    AtomEnum::ATOM,
                    0,
                    64,
                )
                .ok()
                .and_then(|c| c.reply().ok())
            {
                types = r.value32().map(|v| v.collect()).unwrap_or(types);
            }
        }
        let wanted = [
            "text/uri-list",
            "text/x-moz-url",
            "text/plain;charset=utf-8",
            "UTF8_STRING",
            "text/plain",
        ];
        let chosen = wanted
            .iter()
            .map(|n| atom(x, n))
            .find(|a| types.contains(a));
        st.drag = Some(Drag {
            toplevel: top,
            to,
            source,
            enter: data,
            in_page: None,
            at: (0, 0),
            chosen,
        });
        return;
    }
    let Some(d) = st
        .drag
        .as_mut()
        .filter(|d| d.toplevel == top && d.source == data[0])
    else {
        return;
    };
    if kind == atom(x, "XdndPosition") {
        let (rx, ry) = ((data[2] >> 16) as i16, (data[2] & 0xffff) as i16);
        let Some(t) = x
            .conn
            .translate_coordinates(x.root, top, rx, ry)
            .ok()
            .and_then(|c| c.reply().ok())
        else {
            return;
        };
        let (px, py) = (t.dst_x as i32, t.dst_y as i32);
        let over =
            page.filter(|(_, [x0, y0, w, h])| px >= *x0 && py >= *y0 && px < x0 + w && py < y0 + h);
        match (d.in_page, over) {
            (Some(was), Some((now, _))) if was == now => forward(x, now, e),
            (was, now) => {
                if let Some(was) = was {
                    send(x, was, was, "XdndLeave", [d.source, 0, 0, 0, 0]);
                }
                d.in_page = now.map(|(w, _)| w);
                if let Some((w, _)) = now {
                    let enter = ClientMessageEvent::new(32, w, atom(x, "XdndEnter"), d.enter);
                    forward(x, w, &enter);
                    forward(x, w, e);
                }
            }
        }
        if d.in_page.is_none() {
            d.at = (px, py);
            let accept = d.chosen.is_some() as u32;
            // Accept, and send every position (the page area is a hole).
            send(
                x,
                d.source,
                d.source,
                "XdndStatus",
                [to, accept | 2, 0, 0, accept * atom(x, "XdndActionCopy")],
            );
        }
    } else if kind == atom(x, "XdndLeave") {
        if let Some(w) = d.in_page {
            forward(x, w, e);
        }
        st.drag = None;
    } else if kind == atom(x, "XdndDrop") {
        if let Some(w) = d.in_page {
            forward(x, w, e);
            st.drag = None;
            return;
        }
        match d.chosen {
            Some(kind) => {
                let target = st.targets.get(&top).map(|t| t.proxy).unwrap_or(top);
                let _ = x.conn.convert_selection(
                    target,
                    atom(x, "XdndSelection"),
                    kind,
                    atom(x, "REDROB_DROP"),
                    data[2],
                );
                let _ = x.conn.flush();
            }
            None => {
                send(x, d.source, d.source, "XdndFinished", [to, 0, 0, 0, 0]);
                st.drag = None;
            }
        }
    }
}
