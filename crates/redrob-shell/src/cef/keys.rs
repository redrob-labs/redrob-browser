//! The window's keyboard shortcuts, wherever the keyboard is.
//!
//! A page is a native child window, so while it has the keyboard the
//! window's own egui loop never sees a key. Chromium shows every key to
//! [`KeyboardHandler::on_pre_key_event`] first: the window's shortcuts are
//! taken there and sent to the window as `Event::Shortcut`, and the page
//! never gets them. While the toolbar has the keyboard, [`from_egui`] reads
//! the same shortcuts from egui's input. Text, editing keys, the input
//! method, Tab, arrows and the clipboard stay Chromium's.

use cef::{
    rc::Rc as _, wrap_keyboard_handler, Browser, ImplBrowser, ImplKeyboardHandler, KeyEvent,
    KeyboardHandler, WrapKeyboardHandler,
};
use egui::{Key, Modifiers};

use super::Sink;
use crate::cdp::Event;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Shortcut {
    NewTab,
    CloseTab,
    ReopenTab,
    NewWindow,
    NewIncognito,
    Address,
    Bookmark,
    Reload,
    NextTab,
    PrevTab,
    Back,
    Forward,
    History,
    DevTools,
    MoveTabLeft,
    MoveTabRight,
    Find,
    FindNext,
    FindPrev,
    ZoomIn,
    ZoomOut,
    ZoomReset,
    Print,
    /// Not taken from the page: it closes the window's menus and bars.
    Escape,
}

// CEF event flags.
const SHIFT: u32 = 1 << 1;
const CONTROL: u32 = 1 << 2;
const ALT: u32 = 1 << 3;
const COMMAND: u32 = 1 << 7;

/// The shortcut for a key press, by its Windows virtual key code and CEF
/// modifier flags.
pub fn shortcut(vk: i32, flags: u32) -> Option<Shortcut> {
    use Shortcut::*;
    // ⌘ on macOS, Ctrl elsewhere.
    let cmd_flag = if cfg!(target_os = "macos") {
        COMMAND
    } else {
        CONTROL
    };
    let shift = flags & SHIFT != 0;
    let alt = flags & ALT != 0;
    let cmd = flags & cmd_flag != 0 && !alt;
    let ctrl = flags & CONTROL != 0 && !alt;
    let plain = flags & (SHIFT | CONTROL | ALT | COMMAND) == 0;
    let ch = |c: u8| vk == c as i32;
    Some(match () {
        _ if cmd && shift && ch(b'T') => ReopenTab,
        _ if cmd && shift && ch(b'N') => NewIncognito,
        _ if cmd && shift && ch(b'I') => DevTools,
        _ if cmd && shift && ch(b'G') => FindPrev,
        _ if cmd && shift && vk == 0x21 => MoveTabLeft,
        _ if cmd && shift && vk == 0x22 => MoveTabRight,
        _ if ctrl && shift && vk == 0x09 => PrevTab,
        _ if ctrl && !shift && vk == 0x09 => NextTab,
        _ if cmd && shift => return None,
        _ if cmd && ch(b'T') => NewTab,
        _ if cmd && (ch(b'W') || vk == 0x73) => CloseTab,
        _ if cmd && ch(b'N') => NewWindow,
        _ if cmd && ch(b'L') => Address,
        _ if cmd && ch(b'D') => Bookmark,
        _ if cmd && ch(b'R') => Reload,
        _ if cmd && ch(b'H') => History,
        _ if cmd && ch(b'F') => Find,
        _ if cmd && ch(b'G') => FindNext,
        _ if cmd && ch(b'P') => Print,
        _ if cmd && vk == 0x21 => PrevTab,
        _ if cmd && vk == 0x22 => NextTab,
        // = and + (main row and keypad), - (main row and keypad), 0.
        _ if cmd && (vk == 0xBB || vk == 0x6B) => ZoomIn,
        _ if cmd && (vk == 0xBD || vk == 0x6D) => ZoomOut,
        _ if cmd && (ch(b'0') || vk == 0x60) => ZoomReset,
        _ if flags & ALT != 0 && flags & (CONTROL | COMMAND) == 0 && vk == 0x25 => Back,
        _ if flags & ALT != 0 && flags & (CONTROL | COMMAND) == 0 && vk == 0x27 => Forward,
        _ if flags & ALT != 0 && flags & (CONTROL | COMMAND) == 0 && ch(b'D') => Address,
        _ if plain && vk == 0x74 => Reload,
        _ if plain && vk == 0x75 => Address,
        _ if plain && vk == 0x7B => DevTools,
        _ if plain && vk == 0x72 => FindNext,
        _ if shift && flags & (CONTROL | ALT | COMMAND) == 0 && vk == 0x72 => FindPrev,
        _ if plain && vk == 0x1B => Escape,
        _ => return None,
    })
}

/// The same shortcuts from egui's input, taken out of it.
pub fn from_egui(ctx: &egui::Context) -> Vec<Shortcut> {
    use Shortcut::*;
    let cmd = Modifiers::COMMAND;
    let shift = Modifiers::COMMAND | Modifiers::SHIFT;
    let none = Modifiers::NONE;
    let alt = Modifiers::ALT;
    // With Shift first: a shortcut without Shift also matches the same keys
    // with it (egui's logical matching).
    let table: &[(Modifiers, Key, Shortcut)] = &[
        (shift, Key::T, ReopenTab),
        (shift, Key::N, NewIncognito),
        (shift, Key::I, DevTools),
        (shift, Key::G, FindPrev),
        (shift, Key::PageUp, MoveTabLeft),
        (shift, Key::PageDown, MoveTabRight),
        (Modifiers::CTRL | Modifiers::SHIFT, Key::Tab, PrevTab),
        (Modifiers::CTRL, Key::Tab, NextTab),
        (cmd, Key::T, NewTab),
        (cmd, Key::W, CloseTab),
        (cmd, Key::F4, CloseTab),
        (cmd, Key::N, NewWindow),
        (cmd, Key::L, Address),
        (cmd, Key::D, Bookmark),
        (cmd, Key::R, Reload),
        (cmd, Key::H, History),
        (cmd, Key::F, Find),
        (cmd, Key::G, FindNext),
        (cmd, Key::P, Print),
        (cmd, Key::PageUp, PrevTab),
        (cmd, Key::PageDown, NextTab),
        (cmd, Key::Plus, ZoomIn),
        (cmd, Key::Equals, ZoomIn),
        (cmd, Key::Minus, ZoomOut),
        (cmd, Key::Num0, ZoomReset),
        (alt, Key::ArrowLeft, Back),
        (alt, Key::ArrowRight, Forward),
        (alt, Key::D, Address),
        (none, Key::F5, Reload),
        (none, Key::F6, Address),
        (none, Key::F12, DevTools),
        (Modifiers::SHIFT, Key::F3, FindPrev),
        (none, Key::F3, FindNext),
    ];
    let mut out = Vec::new();
    ctx.input_mut(|i| {
        for (m, k, s) in table {
            if i.consume_key(*m, *k) {
                out.push(*s);
            }
        }
    });
    out
}

wrap_keyboard_handler! {
    struct Keys {
        sink: Sink,
    }

    impl KeyboardHandler {
        fn on_pre_key_event(
            &self,
            browser: Option<&mut Browser>,
            event: Option<&KeyEvent>,
            _os_event: Option<&mut cef::sys::XEvent>,
            _is_keyboard_shortcut: Option<&mut ::std::os::raw::c_int>,
        ) -> ::std::os::raw::c_int {
            let (Some(browser), Some(e)) = (browser, event) else {
                return 0;
            };
            use cef::sys::cef_key_event_type_t as T;
            let kind = *e.type_.as_ref();
            if kind != T::KEYEVENT_RAWKEYDOWN && kind != T::KEYEVENT_KEYDOWN {
                return 0;
            }
            let Some(s) = shortcut(e.windows_key_code, e.modifiers) else {
                return edit(browser, e);
            };
            self.sink.send(browser.identifier(), Event::Shortcut(s));
            // Escape stays the page's as well (it closes the page's own popups).
            (s != Shortcut::Escape) as _
        }
    }
}

/// macOS: ⌘C, ⌘X, ⌘V, ⌘A, ⌘Z and ⇧⌘Z run the page's editing commands
/// (the app has no Edit menu to send them). Elsewhere Chromium's own
/// key bindings do.
fn edit(browser: &Browser, e: &KeyEvent) -> ::std::os::raw::c_int {
    if !cfg!(target_os = "macos")
        || e.modifiers & COMMAND == 0
        || e.modifiers & (CONTROL | ALT) != 0
    {
        return 0;
    }
    use cef::ImplFrame;
    let Some(f) = browser.focused_frame().or_else(|| browser.main_frame()) else {
        return 0;
    };
    let shift = e.modifiers & SHIFT != 0;
    match (e.windows_key_code as u8, shift) {
        (b'C', false) => f.copy(),
        (b'X', false) => f.cut(),
        (b'V', false) => f.paste(),
        (b'A', false) => f.select_all(),
        (b'Z', false) => f.undo(),
        (b'Z', true) => f.redo(),
        _ => return 0,
    }
    1
}

pub fn handler(sink: Sink) -> KeyboardHandler {
    Keys::new(sink)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn window_shortcuts_from_page_keys() {
        let cmd = if cfg!(target_os = "macos") {
            COMMAND
        } else {
            CONTROL
        };
        assert_eq!(shortcut(b'T' as i32, cmd), Some(Shortcut::NewTab));
        assert_eq!(
            shortcut(b'T' as i32, cmd | SHIFT),
            Some(Shortcut::ReopenTab)
        );
        assert_eq!(shortcut(b'L' as i32, cmd), Some(Shortcut::Address));
        assert_eq!(shortcut(0x75, 0), Some(Shortcut::Address));
        assert_eq!(shortcut(0x09, CONTROL), Some(Shortcut::NextTab));
        assert_eq!(shortcut(0x09, CONTROL | SHIFT), Some(Shortcut::PrevTab));
        assert_eq!(shortcut(0xBB, cmd), Some(Shortcut::ZoomIn));
        assert_eq!(shortcut(0x25, ALT), Some(Shortcut::Back));
        assert_eq!(shortcut(0x1B, 0), Some(Shortcut::Escape));
        // Typing, editing and the clipboard stay the page's.
        assert_eq!(shortcut(b'A' as i32, 0), None);
        assert_eq!(shortcut(b'C' as i32, cmd), None);
        assert_eq!(shortcut(b'V' as i32, cmd), None);
        assert_eq!(shortcut(0x09, 0), None);
        assert_eq!(shortcut(0x20, CONTROL), None);
    }
}
