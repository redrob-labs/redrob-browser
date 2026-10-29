//! egui input to CDP input: pointer, wheel, keys and text inside the page area.

use egui::{Key, Rect};

use crate::cdp::Op;
use crate::compositor::ScrollKey;

/// One wheel step for the window to scroll by, at a page point.
pub struct Wheel {
    pub at: (f32, f32),
    pub delta: (f32, f32),
    /// Notches and pages ease; touchpad pixels move at once.
    pub smooth: bool,
}

/// Page-area input: CDP operations for the page, and what the window
/// itself scrolls (compositor/scroll.rs).
#[derive(Default)]
pub struct PageInput {
    pub ops: Vec<Op>,
    pub wheel: Vec<Wheel>,
    /// Where a button went down, so keys scroll the box there.
    pub pressed_at: Option<(f32, f32)>,
}

pub fn page_ops(
    events: &[egui::Event],
    hover: Option<egui::Pos2>,
    rect: Rect,
    focused: bool,
) -> PageInput {
    let mut input = PageInput::default();
    let ops = &mut input.ops;
    for ev in events {
        match ev {
            egui::Event::PointerMoved(p) if rect.contains(*p) => {
                let (x, y) = local(rect, *p);
                ops.push(Op::Mouse {
                    kind: "mouseMoved",
                    x,
                    y,
                    button: "none",
                    clicks: 0,
                    modifiers: 0,
                });
            }
            egui::Event::PointerButton {
                pos,
                button,
                pressed,
                modifiers,
            } if rect.contains(*pos) => {
                let (x, y) = local(rect, *pos);
                if *pressed {
                    input.pressed_at = Some((x, y));
                }
                let kind = if *pressed {
                    "mousePressed"
                } else {
                    "mouseReleased"
                };
                ops.push(Op::Mouse {
                    kind,
                    x,
                    y,
                    button: button_name(*button),
                    clicks: 1,
                    modifiers: mods(*modifiers),
                });
            }
            egui::Event::MouseWheel {
                delta,
                modifiers,
                unit,
                ..
            } => {
                let Some(p) = hover else { continue };
                if !rect.contains(p) || modifiers.command {
                    continue;
                }
                let (x, y) = local(rect, p);
                let step = match unit {
                    egui::MouseWheelUnit::Point => 1.0,
                    egui::MouseWheelUnit::Line => 40.0,
                    egui::MouseWheelUnit::Page => rect.height(),
                };
                // egui reports wheel-up as positive; CDP scrolls down on positive deltaY.
                let (dx, dy) = (-delta.x * step, -delta.y * step);
                input.wheel.push(Wheel {
                    at: (x, y),
                    delta: (dx, dy),
                    smooth: *unit != egui::MouseWheelUnit::Point,
                });
                ops.push(Op::Wheel {
                    x,
                    y,
                    dx,
                    dy,
                    modifiers: mods(*modifiers),
                });
            }
            egui::Event::Text(t) if focused => ops.push(Op::Text(t.clone())),
            egui::Event::Paste(t) if focused => ops.push(Op::Text(t.clone())),
            egui::Event::Key {
                key,
                pressed,
                modifiers,
                ..
            } if focused => {
                if let Some((name, code, vk)) = key_info(*key) {
                    ops.push(Op::Key {
                        down: *pressed,
                        key: name.to_string(),
                        code: code.to_string(),
                        vk,
                        modifiers: mods(*modifiers),
                    });
                }
                // The page gets the key first; the window scrolls only when
                // no text field has focus (cdp.rs asks the page).
                let plain = !(modifiers.ctrl || modifiers.alt || modifiers.mac_cmd);
                if *pressed && plain {
                    if let Some(k) = ScrollKey::from_key(*key, modifiers.shift) {
                        ops.push(Op::ScrollKey(k));
                    }
                }
            }
            _ => {}
        }
    }
    input
}

fn local(rect: Rect, p: egui::Pos2) -> (f32, f32) {
    (p.x - rect.left(), p.y - rect.top())
}

fn button_name(b: egui::PointerButton) -> &'static str {
    match b {
        egui::PointerButton::Primary => "left",
        egui::PointerButton::Secondary => "right",
        egui::PointerButton::Middle => "middle",
        egui::PointerButton::Extra1 => "back",
        egui::PointerButton::Extra2 => "forward",
    }
}

/// CDP modifier bits: Alt=1, Ctrl=2, Meta=4, Shift=8.
fn mods(m: egui::Modifiers) -> u32 {
    (m.alt as u32) | ((m.ctrl as u32) << 1) | ((m.mac_cmd as u32) << 2) | ((m.shift as u32) << 3)
}

/// Keys that carry no text. Printable characters arrive as `Event::Text`.
fn key_info(k: Key) -> Option<(&'static str, &'static str, u32)> {
    Some(match k {
        Key::Enter => ("Enter", "Enter", 13),
        Key::Backspace => ("Backspace", "Backspace", 8),
        Key::Tab => ("Tab", "Tab", 9),
        Key::Escape => ("Escape", "Escape", 27),
        Key::Delete => ("Delete", "Delete", 46),
        Key::ArrowLeft => ("ArrowLeft", "ArrowLeft", 37),
        Key::ArrowUp => ("ArrowUp", "ArrowUp", 38),
        Key::ArrowRight => ("ArrowRight", "ArrowRight", 39),
        Key::ArrowDown => ("ArrowDown", "ArrowDown", 40),
        Key::Home => ("Home", "Home", 36),
        Key::End => ("End", "End", 35),
        Key::PageUp => ("PageUp", "PageUp", 33),
        Key::PageDown => ("PageDown", "PageDown", 34),
        _ => return None,
    })
}
