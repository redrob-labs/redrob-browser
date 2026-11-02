//! egui input in the page area, as CEF input events.
//!
//! [`to_ops`] turns one frame's egui events into `cdp::Op`s; [`apply`]
//! sends an op to a tab's browser. Keys carry the Windows virtual key code
//! Chromium reads on every platform and the platform's own key code (XKB
//! keycode, Windows scan code, macOS virtual key) it derives the DOM `code`
//! from. Text arrives as character events, IME composition as composition
//! updates, and drags the page starts are run inside the page area.

use std::cell::RefCell;
use std::path::PathBuf;
use std::time::{Duration, Instant};

use cef::{
    sys, Browser, CefString, CompositionUnderline, DragData, DragOperationsMask, ImplBrowser,
    ImplBrowserHost, ImplDragData, ImplFrame, KeyEvent, MouseEvent, Range,
};
use egui::{Key, Modifiers, PointerButton, Pos2, Rect};

use crate::cdp::Op;

pub const SHIFT: u32 = 1 << 1;
pub const CONTROL: u32 = 1 << 2;
pub const ALT: u32 = 1 << 3;
pub const LEFT_BUTTON: u32 = 1 << 4;
pub const MIDDLE_BUTTON: u32 = 1 << 5;
pub const RIGHT_BUTTON: u32 = 1 << 6;
pub const COMMAND: u32 = 1 << 7;
pub const PRECISE: u32 = 1 << 14;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum MouseKind {
    Move,
    Down,
    Up,
    Leave,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Button {
    Left,
    Middle,
    Right,
}

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum KeyKind {
    Down,
    Up,
    Char,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Ime {
    Preedit(String),
    Commit(String),
    Cancel,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Edit {
    Copy,
    Cut,
    Paste,
    SelectAll,
    Undo,
    Redo,
}

/// What the page area remembers between frames: buttons held (Chromium
/// wants them on every move, or text selection by dragging breaks), the
/// last click for double and triple clicks, and wheel fractions.
#[derive(Default)]
pub struct State {
    buttons: u32,
    last_click: Option<(Instant, Pos2, PointerButton, u32)>,
    wheel_rest: (f32, f32),
    inside: bool,
    files_over: bool,
}

/// Page-area egui events as ops for the page. `hover` is the pointer;
/// `focused` whether the page area has keyboard focus.
pub fn to_ops(
    state: &mut State,
    events: &[egui::Event],
    hover: Option<Pos2>,
    rect: Rect,
    focused: bool,
) -> Vec<Op> {
    let mut ops = Vec::new();
    let local = |p: Pos2| (p.x - rect.left(), p.y - rect.top());
    for ev in events {
        match ev {
            egui::Event::PointerMoved(p) => {
                let inside = rect.contains(*p);
                // A held button keeps the page's drag going outside the area.
                if inside || state.buttons != 0 {
                    let (x, y) = local(*p);
                    ops.push(mouse(MouseKind::Move, x, y, Button::Left, 0, state.buttons));
                } else if state.inside {
                    let (x, y) = local(*p);
                    ops.push(mouse(MouseKind::Leave, x, y, Button::Left, 0, 0));
                }
                state.inside = inside;
            }
            egui::Event::PointerGone if state.inside => {
                state.inside = false;
                ops.push(mouse(MouseKind::Leave, -1.0, -1.0, Button::Left, 0, 0));
            }
            egui::Event::PointerButton {
                pos,
                button,
                pressed,
                modifiers,
            } => {
                if *pressed && !rect.contains(*pos) {
                    continue;
                }
                let (x, y) = local(*pos);
                let held = held_flag(*button);
                let Some(b) = cef_button(*button) else {
                    // Back and forward buttons go back and forward.
                    if *pressed {
                        ops.push(if *button == PointerButton::Extra1 {
                            Op::Back
                        } else {
                            Op::Forward
                        });
                    }
                    continue;
                };
                if !*pressed && state.buttons & held == 0 {
                    continue;
                }
                let clicks = if *pressed {
                    let n = match state.last_click {
                        Some((at, p, last, n))
                            if last == *button
                                && at.elapsed() < Duration::from_millis(500)
                                && p.distance(*pos) < 5.0 =>
                        {
                            n % 3 + 1
                        }
                        _ => 1,
                    };
                    state.last_click = Some((Instant::now(), *pos, *button, n));
                    state.buttons |= held;
                    n
                } else {
                    state.buttons &= !held;
                    state.last_click.map_or(1, |c| c.3)
                };
                let kind = if *pressed {
                    MouseKind::Down
                } else {
                    MouseKind::Up
                };
                ops.push(mouse(
                    kind,
                    x,
                    y,
                    b,
                    clicks,
                    mods(*modifiers) | state.buttons,
                ));
            }
            egui::Event::MouseWheel {
                delta,
                modifiers,
                unit,
                ..
            } => {
                let Some(p) = hover else { continue };
                // Ctrl+wheel zooms the window, not the page (main.rs).
                if !rect.contains(p) || modifiers.command {
                    continue;
                }
                let (x, y) = local(p);
                let (step, precise) = match unit {
                    egui::MouseWheelUnit::Point => (1.0, true),
                    // Chromium's pixels per wheel notch on Linux and Windows.
                    egui::MouseWheelUnit::Line => (53.0, false),
                    egui::MouseWheelUnit::Page => (rect.height(), false),
                };
                let mut dx = delta.x * step + state.wheel_rest.0;
                let mut dy = delta.y * step + state.wheel_rest.1;
                // Shift turns a vertical wheel sideways, as in Chrome.
                if modifiers.shift && dx == 0.0 {
                    std::mem::swap(&mut dx, &mut dy);
                }
                let (ix, iy) = (dx.trunc(), dy.trunc());
                state.wheel_rest = (dx - ix, dy - iy);
                if ix == 0.0 && iy == 0.0 {
                    continue;
                }
                ops.push(Op::Wheel {
                    x,
                    y,
                    dx: ix,
                    dy: iy,
                    modifiers: mods(*modifiers) | state.buttons | if precise { PRECISE } else { 0 },
                });
            }
            egui::Event::Text(t) if focused => ops.push(Op::Text(t.clone())),
            egui::Event::Ime(ime) if focused => match ime {
                egui::ImeEvent::Preedit { text, .. } if text.is_empty() => {
                    ops.push(Op::Ime(Ime::Cancel))
                }
                egui::ImeEvent::Preedit { text, .. } => {
                    ops.push(Op::Ime(Ime::Preedit(text.clone())))
                }
                egui::ImeEvent::Commit(text) => ops.push(Op::Ime(Ime::Commit(text.clone()))),
                _ => {}
            },
            // macOS edits through the menu commands, not key events.
            egui::Event::Copy if focused && cfg!(target_os = "macos") => {
                ops.push(Op::Edit(Edit::Copy))
            }
            egui::Event::Cut if focused && cfg!(target_os = "macos") => {
                ops.push(Op::Edit(Edit::Cut))
            }
            egui::Event::Paste(_) if focused && cfg!(target_os = "macos") => {
                ops.push(Op::Edit(Edit::Paste))
            }
            egui::Event::Key {
                key,
                physical_key,
                pressed,
                repeat,
                modifiers,
            } if focused => {
                if cfg!(target_os = "macos") && modifiers.mac_cmd && *pressed {
                    let edit = match key {
                        Key::A => Some(Edit::SelectAll),
                        Key::Z if modifiers.shift => Some(Edit::Redo),
                        Key::Z => Some(Edit::Undo),
                        _ => None,
                    };
                    if let Some(e) = edit {
                        ops.push(Op::Edit(e));
                        continue;
                    }
                }
                let Some(vk) = windows_key_code(*key) else {
                    continue;
                };
                let native = native_key_code(physical_key.unwrap_or(*key), *repeat, !*pressed);
                let m = mods(*modifiers) | state.buttons;
                ops.push(Op::Key {
                    kind: if *pressed { KeyKind::Down } else { KeyKind::Up },
                    windows_key_code: vk,
                    native_key_code: native,
                    character: 0,
                    modifiers: m,
                });
                // Enter types a line break (and submits forms) through its
                // character, which egui does not send as text.
                if *pressed && *key == Key::Enter {
                    ops.push(Op::Key {
                        kind: KeyKind::Char,
                        windows_key_code: 13,
                        native_key_code: native,
                        character: 13,
                        modifiers: m,
                    });
                }
            }
            _ => {}
        }
    }
    ops
}

/// Files dragged from the desktop over the page area, and dropped on it.
pub fn file_drops(
    state: &mut State,
    ctx: &egui::Context,
    hover: Option<Pos2>,
    rect: Rect,
) -> Vec<Op> {
    let (hovered, dropped) = ctx.input(|i| {
        (
            i.raw
                .hovered_files
                .iter()
                .filter_map(|f| f.path.clone())
                .collect::<Vec<PathBuf>>(),
            i.raw
                .dropped_files
                .iter()
                .map(|f| f.path().to_path_buf())
                .filter(|p| !p.as_os_str().is_empty())
                .collect::<Vec<PathBuf>>(),
        )
    });
    let mut ops = Vec::new();
    let at = hover
        .filter(|p| rect.contains(*p))
        .map(|p| (p.x - rect.left(), p.y - rect.top()));
    if !dropped.is_empty() {
        if let Some((x, y)) = at {
            ops.push(Op::DropFiles {
                x,
                y,
                files: dropped,
                drop: true,
            });
        }
        state.files_over = false;
    } else if !hovered.is_empty() {
        if let Some((x, y)) = at {
            ops.push(Op::DropFiles {
                x,
                y,
                files: hovered,
                drop: false,
            });
            state.files_over = true;
        }
    } else if state.files_over {
        state.files_over = false;
        ops.push(Op::DragLeave);
    }
    ops
}

fn mouse(kind: MouseKind, x: f32, y: f32, button: Button, clicks: u32, modifiers: u32) -> Op {
    Op::Mouse {
        kind,
        x,
        y,
        button,
        clicks,
        modifiers,
    }
}

fn cef_button(b: PointerButton) -> Option<Button> {
    match b {
        PointerButton::Primary => Some(Button::Left),
        PointerButton::Middle => Some(Button::Middle),
        PointerButton::Secondary => Some(Button::Right),
        PointerButton::Extra1 | PointerButton::Extra2 => None,
    }
}

fn held_flag(b: PointerButton) -> u32 {
    match b {
        PointerButton::Primary => LEFT_BUTTON,
        PointerButton::Middle => MIDDLE_BUTTON,
        PointerButton::Secondary => RIGHT_BUTTON,
        _ => 0,
    }
}

/// CEF event flags for egui modifiers.
pub fn mods(m: Modifiers) -> u32 {
    let mut f = 0;
    if m.shift {
        f |= SHIFT;
    }
    if m.ctrl {
        f |= CONTROL;
    }
    if m.alt {
        f |= ALT;
    }
    if m.mac_cmd {
        f |= COMMAND;
    }
    f
}

/// A drag the page started (a link, an image, a draggable element), run
/// inside the page area until the button comes up.
struct Drag {
    browser: i32,
    ops: DragOperationsMask,
}

thread_local! {
    static DRAG: RefCell<Option<Drag>> = const { RefCell::new(None) };
}

/// The page began dragging at view point `at` (osr.rs `start_dragging`).
pub fn start_drag(
    browser: &mut Browser,
    data: &mut DragData,
    ops: DragOperationsMask,
    at: (i32, i32),
) {
    let Some(host) = browser.host() else { return };
    let mut data = ImplDragData::clone(data).unwrap_or_else(|| Clone::clone(data));
    let event = MouseEvent {
        x: at.0,
        y: at.1,
        modifiers: LEFT_BUTTON,
    };
    host.drag_target_drag_enter(Some(&mut data), Some(&event), ops);
    DRAG.with_borrow_mut(|d| {
        *d = Some(Drag {
            browser: browser.identifier(),
            ops,
        })
    });
}

/// Send `op` to the page in `browser`.
pub fn apply(browser: &Browser, op: Op) {
    let Some(host) = browser.host() else { return };
    match op {
        Op::Mouse {
            kind,
            x,
            y,
            button,
            clicks,
            modifiers,
        } => {
            let event = MouseEvent {
                x: x.round() as i32,
                y: y.round() as i32,
                modifiers,
            };
            let dragging = DRAG.with_borrow(|d| d.as_ref().map(|d| (d.browser, d.ops)));
            if let Some((id, ops)) = dragging.filter(|d| d.0 == browser.identifier()) {
                match kind {
                    MouseKind::Move => host.drag_target_drag_over(Some(&event), ops),
                    MouseKind::Up | MouseKind::Leave => {
                        let _ = id;
                        if kind == MouseKind::Up {
                            host.drag_target_drop(Some(&event));
                        } else {
                            host.drag_target_drag_leave();
                        }
                        let none = sys::cef_drag_operations_mask_t::DRAG_OPERATION_NONE;
                        let op = if kind == MouseKind::Up {
                            ops
                        } else {
                            none.into()
                        };
                        host.drag_source_ended_at(event.x, event.y, op);
                        host.drag_source_system_drag_ended();
                        DRAG.with_borrow_mut(|d| *d = None);
                    }
                    MouseKind::Down => {}
                }
                return;
            }
            let b = match button {
                Button::Left => sys::cef_mouse_button_type_t::MBT_LEFT,
                Button::Middle => sys::cef_mouse_button_type_t::MBT_MIDDLE,
                Button::Right => sys::cef_mouse_button_type_t::MBT_RIGHT,
            };
            match kind {
                MouseKind::Move => host.send_mouse_move_event(Some(&event), 0),
                MouseKind::Leave => host.send_mouse_move_event(Some(&event), 1),
                MouseKind::Down | MouseKind::Up => host.send_mouse_click_event(
                    Some(&event),
                    b.into(),
                    (kind == MouseKind::Up) as _,
                    clicks.max(1) as _,
                ),
            }
        }
        Op::Wheel {
            x,
            y,
            dx,
            dy,
            modifiers,
        } => {
            let event = MouseEvent {
                x: x.round() as i32,
                y: y.round() as i32,
                modifiers,
            };
            host.send_mouse_wheel_event(Some(&event), dx as i32, dy as i32);
        }
        Op::Key {
            kind,
            windows_key_code,
            native_key_code,
            character,
            modifiers,
        } => {
            let type_ = match kind {
                KeyKind::Down => sys::cef_key_event_type_t::KEYEVENT_RAWKEYDOWN,
                KeyKind::Up => sys::cef_key_event_type_t::KEYEVENT_KEYUP,
                KeyKind::Char => sys::cef_key_event_type_t::KEYEVENT_CHAR,
            };
            let event = KeyEvent {
                size: std::mem::size_of::<KeyEvent>(),
                type_: type_.into(),
                modifiers,
                windows_key_code,
                native_key_code,
                is_system_key: (modifiers & ALT != 0 && !cfg!(target_os = "macos")) as _,
                character,
                unmodified_character: character,
                focus_on_editable_field: 0,
            };
            host.send_key_event(Some(&event));
        }
        Op::Text(text) => {
            for unit in text.encode_utf16() {
                let event = KeyEvent {
                    size: std::mem::size_of::<KeyEvent>(),
                    type_: sys::cef_key_event_type_t::KEYEVENT_CHAR.into(),
                    modifiers: 0,
                    windows_key_code: unit as i32,
                    native_key_code: 0,
                    is_system_key: 0,
                    character: unit,
                    unmodified_character: unit,
                    focus_on_editable_field: 0,
                };
                host.send_key_event(Some(&event));
            }
        }
        Op::Ime(Ime::Preedit(text)) => {
            let len = text.encode_utf16().count() as u32;
            let underline = CompositionUnderline {
                size: std::mem::size_of::<CompositionUnderline>(),
                range: Range { from: 0, to: len },
                color: 0xFF00_0000,
                background_color: 0,
                thick: 0,
                style: sys::cef_composition_underline_style_t::CEF_CUS_SOLID.into(),
            };
            let invalid = Range {
                from: u32::MAX,
                to: u32::MAX,
            };
            let caret = Range { from: len, to: len };
            host.ime_set_composition(
                Some(&CefString::from(text.as_str())),
                Some(&[underline]),
                Some(&invalid),
                Some(&caret),
            );
        }
        Op::Ime(Ime::Commit(text)) => {
            let invalid = Range {
                from: u32::MAX,
                to: u32::MAX,
            };
            host.ime_commit_text(Some(&CefString::from(text.as_str())), Some(&invalid), 0);
        }
        Op::Ime(Ime::Cancel) => host.ime_cancel_composition(),
        Op::Edit(e) => {
            if let Some(frame) = browser.focused_frame().or_else(|| browser.main_frame()) {
                match e {
                    Edit::Copy => frame.copy(),
                    Edit::Cut => frame.cut(),
                    Edit::Paste => frame.paste(),
                    Edit::SelectAll => frame.select_all(),
                    Edit::Undo => frame.undo(),
                    Edit::Redo => frame.redo(),
                }
            }
        }
        Op::Focus(on) => host.set_focus(on as _),
        Op::DropFiles { x, y, files, drop } => {
            let event = MouseEvent {
                x: x.round() as i32,
                y: y.round() as i32,
                modifiers: 0,
            };
            let all = sys::cef_drag_operations_mask_t::DRAG_OPERATION_EVERY;
            let entered = DRAG.with_borrow(|d| {
                d.as_ref()
                    .is_some_and(|d| d.browser == browser.identifier())
            });
            if !entered {
                let Some(mut data) = cef::drag_data_create() else {
                    return;
                };
                for f in &files {
                    let name = f
                        .file_name()
                        .map(|n| n.to_string_lossy().into_owned())
                        .unwrap_or_default();
                    data.add_file(
                        Some(&CefString::from(f.to_string_lossy().as_ref())),
                        Some(&CefString::from(name.as_str())),
                    );
                }
                host.drag_target_drag_enter(Some(&mut data), Some(&event), all.into());
                DRAG.with_borrow_mut(|d| {
                    *d = Some(Drag {
                        browser: browser.identifier(),
                        ops: all.into(),
                    })
                });
            } else {
                host.drag_target_drag_over(Some(&event), all.into());
            }
            if drop {
                host.drag_target_drop(Some(&event));
                DRAG.with_borrow_mut(|d| *d = None);
            }
        }
        Op::DragLeave => {
            host.drag_target_drag_leave();
            DRAG.with_borrow_mut(|d| *d = None);
        }
        _ => {}
    }
}

/// Windows virtual key codes, which Chromium reads on every platform.
fn windows_key_code(k: Key) -> Option<i32> {
    use Key::*;
    Some(match k {
        Backspace => 0x08,
        Tab => 0x09,
        Enter => 0x0D,
        ShiftLeft | ShiftRight => 0x10,
        ControlLeft | ControlRight => 0x11,
        AltLeft | AltRight => 0x12,
        Escape => 0x1B,
        Space => 0x20,
        PageUp => 0x21,
        PageDown => 0x22,
        End => 0x23,
        Home => 0x24,
        ArrowLeft => 0x25,
        ArrowUp => 0x26,
        ArrowRight => 0x27,
        ArrowDown => 0x28,
        Insert => 0x2D,
        Delete => 0x2E,
        Num0 => 0x30,
        Num1 => 0x31,
        Num2 => 0x32,
        Num3 => 0x33,
        Num4 => 0x34,
        Num5 => 0x35,
        Num6 => 0x36,
        Num7 => 0x37,
        Num8 => 0x38,
        Num9 => 0x39,
        A => 0x41,
        B => 0x42,
        C => 0x43,
        D => 0x44,
        E => 0x45,
        F => 0x46,
        G => 0x47,
        H => 0x48,
        I => 0x49,
        J => 0x4A,
        K => 0x4B,
        L => 0x4C,
        M => 0x4D,
        N => 0x4E,
        O => 0x4F,
        P => 0x50,
        Q => 0x51,
        R => 0x52,
        S => 0x53,
        T => 0x54,
        U => 0x55,
        V => 0x56,
        W => 0x57,
        X => 0x58,
        Y => 0x59,
        Z => 0x5A,
        SuperLeft => 0x5B,
        SuperRight => 0x5C,
        F1 => 0x70,
        F2 => 0x71,
        F3 => 0x72,
        F4 => 0x73,
        F5 => 0x74,
        F6 => 0x75,
        F7 => 0x76,
        F8 => 0x77,
        F9 => 0x78,
        F10 => 0x79,
        F11 => 0x7A,
        F12 => 0x7B,
        Semicolon | Colon => 0xBA,
        Equals | Plus => 0xBB,
        Comma => 0xBC,
        Minus => 0xBD,
        Period => 0xBE,
        Slash | Questionmark => 0xBF,
        Backtick => 0xC0,
        OpenBracket | OpenCurlyBracket => 0xDB,
        Backslash | Pipe => 0xDC,
        CloseBracket | CloseCurlyBracket => 0xDD,
        Quote => 0xDE,
        IntlBackslash => 0xE2,
        BrowserBack => 0xA6,
        _ => return None,
    })
}

/// The key's position on a US keyboard as Linux evdev / PC set-1 scan
/// codes (the same numbers for the main block), and whether Windows calls
/// it an extended key.
fn scan_code(k: Key) -> Option<(i32, bool)> {
    use Key::*;
    Some(match k {
        Escape => (1, false),
        Num1 => (2, false),
        Num2 => (3, false),
        Num3 => (4, false),
        Num4 => (5, false),
        Num5 => (6, false),
        Num6 => (7, false),
        Num7 => (8, false),
        Num8 => (9, false),
        Num9 => (10, false),
        Num0 => (11, false),
        Minus => (12, false),
        Equals | Plus => (13, false),
        Backspace => (14, false),
        Tab => (15, false),
        Q => (16, false),
        W => (17, false),
        E => (18, false),
        R => (19, false),
        T => (20, false),
        Y => (21, false),
        U => (22, false),
        I => (23, false),
        O => (24, false),
        P => (25, false),
        OpenBracket | OpenCurlyBracket => (26, false),
        CloseBracket | CloseCurlyBracket => (27, false),
        Enter => (28, false),
        ControlLeft => (29, false),
        A => (30, false),
        S => (31, false),
        D => (32, false),
        F => (33, false),
        G => (34, false),
        H => (35, false),
        J => (36, false),
        K => (37, false),
        L => (38, false),
        Semicolon | Colon => (39, false),
        Quote => (40, false),
        Backtick => (41, false),
        ShiftLeft => (42, false),
        Backslash | Pipe => (43, false),
        Z => (44, false),
        X => (45, false),
        C => (46, false),
        V => (47, false),
        B => (48, false),
        N => (49, false),
        M => (50, false),
        Comma => (51, false),
        Period => (52, false),
        Slash | Questionmark => (53, false),
        ShiftRight => (54, false),
        AltLeft => (56, false),
        Space => (57, false),
        F1 => (59, false),
        F2 => (60, false),
        F3 => (61, false),
        F4 => (62, false),
        F5 => (63, false),
        F6 => (64, false),
        F7 => (65, false),
        F8 => (66, false),
        F9 => (67, false),
        F10 => (68, false),
        IntlBackslash => (86, false),
        F11 => (87, false),
        F12 => (88, false),
        // Set-1 extended codes; evdev numbers these apart (below).
        ControlRight => (0x1D, true),
        AltRight => (0x38, true),
        Home => (0x47, true),
        ArrowUp => (0x48, true),
        PageUp => (0x49, true),
        ArrowLeft => (0x4B, true),
        ArrowRight => (0x4D, true),
        End => (0x4F, true),
        ArrowDown => (0x50, true),
        PageDown => (0x51, true),
        Insert => (0x52, true),
        Delete => (0x53, true),
        SuperLeft => (0x5B, true),
        SuperRight => (0x5C, true),
        _ => return None,
    })
}

/// Linux evdev numbers of the keys Windows calls extended.
fn evdev_extended(k: Key) -> Option<i32> {
    use Key::*;
    Some(match k {
        ControlRight => 97,
        AltRight => 100,
        Home => 102,
        ArrowUp => 103,
        PageUp => 104,
        ArrowLeft => 105,
        ArrowRight => 106,
        End => 107,
        ArrowDown => 108,
        PageDown => 109,
        Insert => 110,
        Delete => 111,
        SuperLeft => 125,
        SuperRight => 126,
        _ => return None,
    })
}

/// macOS virtual key codes (`kVK_*`).
fn mac_key_code(k: Key) -> Option<i32> {
    use Key::*;
    Some(match k {
        A => 0x00,
        S => 0x01,
        D => 0x02,
        F => 0x03,
        H => 0x04,
        G => 0x05,
        Z => 0x06,
        X => 0x07,
        C => 0x08,
        V => 0x09,
        IntlBackslash => 0x0A,
        B => 0x0B,
        Q => 0x0C,
        W => 0x0D,
        E => 0x0E,
        R => 0x0F,
        Y => 0x10,
        T => 0x11,
        Num1 => 0x12,
        Num2 => 0x13,
        Num3 => 0x14,
        Num4 => 0x15,
        Num6 => 0x16,
        Num5 => 0x17,
        Equals | Plus => 0x18,
        Num9 => 0x19,
        Num7 => 0x1A,
        Minus => 0x1B,
        Num8 => 0x1C,
        Num0 => 0x1D,
        CloseBracket | CloseCurlyBracket => 0x1E,
        O => 0x1F,
        U => 0x20,
        OpenBracket | OpenCurlyBracket => 0x21,
        I => 0x22,
        P => 0x23,
        Enter => 0x24,
        L => 0x25,
        J => 0x26,
        Quote => 0x27,
        K => 0x28,
        Semicolon | Colon => 0x29,
        Backslash | Pipe => 0x2A,
        Comma => 0x2B,
        Slash | Questionmark => 0x2C,
        N => 0x2D,
        M => 0x2E,
        Period => 0x2F,
        Tab => 0x30,
        Space => 0x31,
        Backtick => 0x32,
        Backspace => 0x33,
        Escape => 0x35,
        SuperRight => 0x36,
        SuperLeft => 0x37,
        ShiftLeft => 0x38,
        AltLeft => 0x3A,
        ControlLeft => 0x3B,
        ShiftRight => 0x3C,
        AltRight => 0x3D,
        ControlRight => 0x3E,
        F5 => 0x60,
        F6 => 0x61,
        F7 => 0x62,
        F3 => 0x63,
        F8 => 0x64,
        F9 => 0x65,
        F11 => 0x67,
        F10 => 0x6D,
        F12 => 0x6F,
        Insert => 0x72,
        Home => 0x73,
        PageUp => 0x74,
        Delete => 0x75,
        F4 => 0x76,
        End => 0x77,
        F2 => 0x78,
        PageDown => 0x79,
        F1 => 0x7A,
        ArrowLeft => 0x7B,
        ArrowRight => 0x7C,
        ArrowDown => 0x7D,
        ArrowUp => 0x7E,
        _ => return None,
    })
}

/// The platform's own code for the physical key: an XKB keycode on Linux,
/// a WM_KEYDOWN lParam on Windows, a virtual key code on macOS.
fn native_key_code(k: Key, repeat: bool, up: bool) -> i32 {
    if cfg!(target_os = "macos") {
        return mac_key_code(k).unwrap_or(0);
    }
    let Some((scan, extended)) = scan_code(k) else {
        return 0;
    };
    if cfg!(windows) {
        let mut l = 1 | (scan << 16);
        if extended {
            l |= 1 << 24;
        }
        if repeat {
            l |= 1 << 30;
        }
        if up {
            l |= (1 << 30) | (1 << 31);
        }
        return l;
    }
    let evdev = if extended {
        evdev_extended(k).unwrap_or(0)
    } else {
        scan
    };
    if evdev == 0 {
        0
    } else {
        evdev + 8
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn letters_carry_their_virtual_and_xkb_codes() {
        assert_eq!(windows_key_code(Key::A), Some(0x41));
        if cfg!(target_os = "linux") {
            // XKB: evdev KEY_A (30) + 8.
            assert_eq!(native_key_code(Key::A, false, false), 38);
            // KEY_LEFT (105) + 8.
            assert_eq!(native_key_code(Key::ArrowLeft, false, false), 113);
        }
    }

    #[test]
    fn a_double_click_counts_two() {
        let rect = Rect::from_min_size(Pos2::ZERO, egui::vec2(100.0, 100.0));
        let mut st = State::default();
        let press = |pressed| egui::Event::PointerButton {
            pos: egui::pos2(10.0, 10.0),
            button: PointerButton::Primary,
            pressed,
            modifiers: Modifiers::default(),
        };
        let events = [press(true), press(false), press(true), press(false)];
        let ops = to_ops(&mut st, &events, None, rect, true);
        let clicks: Vec<u32> = ops
            .iter()
            .filter_map(|o| match o {
                Op::Mouse { clicks, .. } => Some(*clicks),
                _ => None,
            })
            .collect();
        assert_eq!(clicks, vec![1, 1, 2, 2]);
    }
}
