//! fcitx5's input context over D-Bus (`org.fcitx.Fcitx.InputContext1`),
//! with the composition drawn by the program (ime.rs).

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::{self, Receiver};
use std::sync::{Mutex, OnceLock};
use std::time::Instant;

use egui::{Event, ImeEvent, Key, Modifiers, ViewportId};
use zbus::blocking::{Connection, MessageIterator};
use zbus::message::Type as MessageType;
use zbus::zvariant::{OwnedObjectPath, OwnedValue};

const SERVICE: &str = "org.fcitx.Fcitx5";
const IM_PATH: &str = "/org/freedesktop/portal/inputmethod";
const IM_IFACE: &str = "org.fcitx.Fcitx.InputMethod1";
const IC_IFACE: &str = "org.fcitx.Fcitx.InputContext1";

// Capability flags (fcitx-utils/capabilityflags.h): the program shows the
// preedit, with formatting, and key events keep their order.
const CAP_PREEDIT: u64 = 1 << 1;
const CAP_FORMATTED_PREEDIT: u64 = 1 << 4;
const CAP_KEY_EVENT_ORDER_FIX: u64 = 1 << 37;

// What ProcessKeyEventBatch returns besides "handled" (dbusfrontend.cpp).
const BATCHED_COMMIT_STRING: u32 = 0;
const BATCHED_PREEDIT: u32 = 1;
const BATCHED_FORWARD_KEY: u32 = 2;
const BATCHED_DELETE_SURROUNDING: u32 = 3;

// X11 modifier masks.
const SHIFT_MASK: u32 = 1;
const CONTROL_MASK: u32 = 1 << 2;
const MOD1_MASK: u32 = 1 << 3;

static IME: OnceLock<Mutex<Fcitx>> = OnceLock::new();

/// What fcitx5 says on its own (after a click, a focus change), in order,
/// with the replies to the window's calls between them.
enum Incoming {
    Signal(zbus::Message),
    Reply(u32),
}

struct Fcitx {
    conn: Connection,
    ic: OwnedObjectPath,
    incoming: Receiver<Incoming>,
    /// Each viewport's focused text target from its last pass: the caret,
    /// in screen pixels.
    targets: HashMap<ViewportId, [i32; 4]>,
    /// The viewport whose text target fcitx5 has focus for.
    owner: Option<ViewportId>,
    /// The caret fcitx5 was last told.
    rect: Option<[i32; 4]>,
    /// Keys whose press fcitx5 took: their release goes to it as well.
    swallowed: HashSet<Key>,
    /// Drop what fcitx5 sends until the reply to this call: it belongs to
    /// the target that lost focus.
    discard_until: Option<u32>,
    epoch: Instant,
}

/// Turn winit's XIM off and use fcitx5 over D-Bus, when fcitx5 runs on X11.
pub fn init() {
    if std::env::var("REDROB_IME").as_deref() == Ok("xim") {
        return;
    }
    let wayland = std::env::var_os("WAYLAND_DISPLAY").is_some_and(|v| !v.is_empty())
        && std::env::var("WINIT_UNIX_BACKEND").as_deref() != Ok("x11");
    if wayland {
        // winit's text-input-v3 carries the preedit there.
        return;
    }
    // XIM would hand every key to fcitx5 first and keep the composition in
    // its popup: off before winit opens it.
    let before = std::env::var_os("XMODIFIERS");
    std::env::set_var("XMODIFIERS", "@im=none");
    match Fcitx::connect() {
        Ok(f) => {
            eprintln!("redrob-browser: input method: fcitx5 over D-Bus, composing in place");
            let _ = IME.set(Mutex::new(f));
        }
        Err(e) => {
            match before {
                Some(v) => std::env::set_var("XMODIFIERS", v),
                None => std::env::remove_var("XMODIFIERS"),
            }
            if std::env::var("XMODIFIERS").is_ok_and(|v| v.contains("fcitx")) {
                eprintln!("redrob-browser: input method: fcitx5 not reachable over D-Bus ({e}), using XIM");
            }
        }
    }
}

fn ime() -> Option<std::sync::MutexGuard<'static, Fcitx>> {
    IME.get()
        .map(|m| m.lock().unwrap_or_else(|e| e.into_inner()))
}

pub fn before_pass(ctx: &egui::Context, focused: bool) {
    let Some(mut f) = ime() else { return };
    let viewport = ctx.viewport_id();
    let target = f.targets.get(&viewport).copied().filter(|_| focused);
    let mut out = Vec::new();
    match (target, f.owner) {
        (Some(rect), owner) => {
            if owner != Some(viewport) {
                f.focus_in(viewport);
            }
            f.set_rect(rect);
        }
        (None, Some(owner)) if owner == viewport => f.focus_out(),
        _ => {}
    }
    if f.owner == Some(viewport) {
        out.extend(f.drain());
    } else {
        // Nothing here may compose: drop what came for an old target.
        let _ = f.drain();
    }
    let active = f.owner == Some(viewport);
    let events = ctx.input_mut(|i| std::mem::take(&mut i.events));
    let mut skip_text = false;
    for ev in events {
        match &ev {
            Event::Key {
                key,
                physical_key,
                pressed,
                repeat,
                modifiers,
            } if active => {
                skip_text = false;
                if !*pressed && f.swallowed.remove(key) {
                    out.extend(f.key(*key, *physical_key, *modifiers, true, *repeat).1);
                    continue;
                }
                let (handled, produced) =
                    f.key(*key, *physical_key, *modifiers, !*pressed, *repeat);
                out.extend(produced);
                if handled {
                    if *pressed {
                        f.swallowed.insert(*key);
                        // The character the key would type is fcitx5's now.
                        skip_text = true;
                    }
                    continue;
                }
                out.push(ev);
            }
            Event::Text(_) if skip_text => skip_text = false,
            _ => {
                skip_text = false;
                out.push(ev);
            }
        }
    }
    ctx.input_mut(|i| i.events = out);
}

pub fn after_pass(ctx: &egui::Context, focused: bool) {
    let Some(mut f) = ime() else { return };
    let viewport = ctx.viewport_id();
    let caret = ctx.output(|o| o.ime.as_ref().map(|i| i.cursor_rect));
    let target = caret.filter(|_| focused).map(|r| {
        // Screen pixels: the window's place on screen plus the caret in it.
        let (origin, native) = ctx.input(|i| {
            let v = i.viewport();
            (
                v.inner_rect.map_or(egui::Pos2::ZERO, |r| r.min),
                v.native_pixels_per_point.unwrap_or(1.0),
            )
        });
        let ppp = ctx.pixels_per_point();
        [
            (origin.x * native + r.min.x * ppp).round() as i32,
            (origin.y * native + r.min.y * ppp).round() as i32,
            (r.width() * ppp).round().max(1.0) as i32,
            (r.height() * ppp).round().max(1.0) as i32,
        ]
    });
    match target {
        Some(t) => {
            f.targets.insert(viewport, t);
            // A target appeared: its next pass sends it keys; run that soon
            // rather than at the next input.
            if f.owner != Some(viewport) {
                ctx.request_repaint();
            } else {
                f.set_rect(t);
            }
        }
        None => {
            f.targets.remove(&viewport);
            if f.owner == Some(viewport) {
                f.focus_out();
            }
        }
    }
}

impl Fcitx {
    fn connect() -> zbus::Result<Self> {
        let conn = Connection::session()?;
        let hints: Vec<(&str, &str)> = vec![("program", "redrob-browser"), ("display", "x11:")];
        let reply = conn.call_method(
            Some(SERVICE),
            IM_PATH,
            Some(IM_IFACE),
            "CreateInputContext",
            &(hints,),
        )?;
        let (ic, _uuid): (OwnedObjectPath, Vec<u8>) = reply.body().deserialize()?;
        let caps = CAP_PREEDIT | CAP_FORMATTED_PREEDIT | CAP_KEY_EVENT_ORDER_FIX;
        conn.call_method(
            Some(SERVICE),
            ic.as_str(),
            Some(IC_IFACE),
            "SetCapability",
            &(caps,),
        )?;
        let (tx, incoming) = mpsc::channel();
        let messages = MessageIterator::from(&conn);
        let path = ic.clone();
        std::thread::Builder::new()
            .name("fcitx5".into())
            .spawn(move || {
                for m in messages.flatten() {
                    let header = m.header();
                    let item = match m.message_type() {
                        MessageType::Signal
                            if header.path().is_some_and(|p| p.as_str() == path.as_str()) =>
                        {
                            Incoming::Signal(m.clone())
                        }
                        MessageType::MethodReturn | MessageType::Error => {
                            match header.reply_serial() {
                                Some(s) => Incoming::Reply(s.get()),
                                None => continue,
                            }
                        }
                        _ => continue,
                    };
                    if tx.send(item).is_err() {
                        return;
                    }
                }
            })
            .map_err(|e| zbus::Error::Failure(e.to_string()))?;
        Ok(Self {
            conn,
            ic,
            incoming,
            targets: HashMap::new(),
            owner: None,
            rect: None,
            swallowed: HashSet::new(),
            discard_until: None,
            epoch: Instant::now(),
        })
    }

    fn call<B>(&self, method: &str, body: &B) -> Option<zbus::Message>
    where
        B: serde::Serialize + zbus::zvariant::DynamicType,
    {
        self.conn
            .call_method(
                Some(SERVICE),
                self.ic.as_str(),
                Some(IC_IFACE),
                method,
                body,
            )
            .ok()
    }

    fn focus_in(&mut self, viewport: ViewportId) {
        if self.owner.is_some() {
            self.focus_out();
        }
        self.owner = Some(viewport);
        self.rect = None;
        self.call("FocusIn", &());
    }

    /// The target lost focus: the composition stays in it as it is (egui
    /// and Chromium both keep it), and fcitx5 starts over.
    fn focus_out(&mut self) {
        self.owner = None;
        self.swallowed.clear();
        if let Some(reply) = self.call("Reset", &()) {
            self.discard_until = Some(reply.primary_header().serial_num().get());
        }
        self.call("FocusOut", &());
    }

    fn set_rect(&mut self, rect: [i32; 4]) {
        if self.rect == Some(rect) {
            return;
        }
        self.rect = Some(rect);
        self.call("SetCursorRect", &(rect[0], rect[1], rect[2], rect[3]));
    }

    /// What fcitx5 sent on its own since the last pass, as IME events.
    fn drain(&mut self) -> Vec<Event> {
        let mut out = Vec::new();
        while let Ok(item) = self.incoming.try_recv() {
            match item {
                Incoming::Reply(serial) => {
                    if self.discard_until == Some(serial) {
                        self.discard_until = None;
                    }
                }
                Incoming::Signal(_) if self.discard_until.is_some() => {}
                Incoming::Signal(m) => {
                    let member = m.header().member().map(|m| m.to_string());
                    let body = m.body();
                    let event = match member.as_deref() {
                        Some("CommitString") => body.deserialize::<String>().ok().map(commit),
                        Some("UpdateFormattedPreedit") => body
                            .deserialize::<(Vec<(String, i32)>, i32)>()
                            .ok()
                            .map(|(segments, _)| preedit(&segments)),
                        Some("DeleteSurroundingText") => body
                            .deserialize::<(i32, u32)>()
                            .ok()
                            .map(|(offset, size)| delete_surrounding(offset, size)),
                        _ => None,
                    };
                    out.extend(event);
                }
            }
        }
        out
    }

    /// Hand a key to fcitx5: whether it took it, and what it produced.
    fn key(
        &mut self,
        key: Key,
        physical: Option<Key>,
        modifiers: Modifiers,
        release: bool,
        repeat: bool,
    ) -> (bool, Vec<Event>) {
        let Some(sym) = keysym(key, modifiers.shift) else {
            return (false, Vec::new());
        };
        let code = crate::cef::input::xkb_keycode(physical.unwrap_or(key)).unwrap_or(0) as u32;
        let mut state = 0;
        if modifiers.shift {
            state |= SHIFT_MASK;
        }
        if modifiers.ctrl {
            state |= CONTROL_MASK;
        }
        if modifiers.alt {
            state |= MOD1_MASK;
        }
        let _ = repeat;
        let time = self.epoch.elapsed().as_millis() as u32;
        // Earlier messages first, so commits keep their order.
        let mut out = self.drain();
        let Some(reply) = self.call("ProcessKeyEventBatch", &(sym, code, state, release, time))
        else {
            return (false, out);
        };
        let Ok((events, handled)) = reply.body().deserialize::<(Vec<(u32, OwnedValue)>, bool)>()
        else {
            return (false, out);
        };
        for (kind, value) in events {
            let event = match kind {
                BATCHED_COMMIT_STRING => String::try_from(value).ok().map(commit),
                BATCHED_PREEDIT => <(Vec<(String, i32)>, i32)>::try_from(value)
                    .ok()
                    .map(|(segments, _)| preedit(&segments)),
                BATCHED_DELETE_SURROUNDING => <(i32, u32)>::try_from(value)
                    .ok()
                    .map(|(offset, size)| delete_surrounding(offset, size)),
                // A key fcitx5 gives back: typed as its character.
                BATCHED_FORWARD_KEY => <(u32, u32, bool)>::try_from(value)
                    .ok()
                    .filter(|(_, _, release)| !release)
                    .and_then(|(sym, _, _)| char_of(sym))
                    .map(|c| Event::Text(c.to_string())),
                _ => None,
            };
            out.extend(event);
        }
        (handled, out)
    }
}

fn commit(text: String) -> Event {
    Event::Ime(ImeEvent::Commit(text))
}

/// The preedit as one text; Chromium and egui underline all of it.
fn preedit(segments: &[(String, i32)]) -> Event {
    let text: String = segments.iter().map(|(s, _)| s.as_str()).collect();
    Event::Ime(ImeEvent::Preedit {
        text,
        active_range_chars: None,
    })
}

fn delete_surrounding(offset: i32, size: u32) -> Event {
    let before = offset.min(0).unsigned_abs() as usize;
    Event::Ime(ImeEvent::DeleteSurrounding {
        before_chars: before,
        after_chars: (size as usize).saturating_sub(before),
    })
}

/// The character an X keysym types, for keys fcitx5 forwards.
fn char_of(sym: u32) -> Option<char> {
    match sym {
        0x20..=0x7e | 0xa0..=0xff => char::from_u32(sym),
        0x0100_0000..=0x0110_ffff => char::from_u32(sym - 0x0100_0000),
        _ => None,
    }
}

/// The X keysym for an egui key on a US layout. egui names the logical key
/// for letters and the symbols it knows, and falls back to the physical key
/// (`Num2` for `@`), which Shift turns into its symbol here.
pub(crate) fn keysym(key: Key, shift: bool) -> Option<u32> {
    use Key::*;
    let ascii = |c: char| Some(c as u32);
    match key {
        A | B | C | D | E | F | G | H | I | J | K | L | M | N | O | P | Q | R | S | T | U | V
        | W | X | Y | Z => {
            let c = key.name().chars().next()?;
            ascii(if shift { c } else { c.to_ascii_lowercase() })
        }
        Num0 | Num1 | Num2 | Num3 | Num4 | Num5 | Num6 | Num7 | Num8 | Num9 => {
            let d = key.name().chars().next()?;
            let shifted = b")!@#$%^&*("[d.to_digit(10)? as usize] as char;
            ascii(if shift { shifted } else { d })
        }
        Space => ascii(' '),
        Minus => ascii(if shift { '_' } else { '-' }),
        Equals => ascii(if shift { '+' } else { '=' }),
        Plus => ascii('+'),
        OpenBracket => ascii(if shift { '{' } else { '[' }),
        CloseBracket => ascii(if shift { '}' } else { ']' }),
        OpenCurlyBracket => ascii('{'),
        CloseCurlyBracket => ascii('}'),
        Backslash => ascii(if shift { '|' } else { '\\' }),
        Pipe => ascii('|'),
        Semicolon => ascii(if shift { ':' } else { ';' }),
        Colon => ascii(':'),
        Quote => ascii(if shift { '"' } else { '\'' }),
        Comma => ascii(if shift { '<' } else { ',' }),
        Period => ascii(if shift { '>' } else { '.' }),
        Slash => ascii(if shift { '?' } else { '/' }),
        Questionmark => ascii('?'),
        Exclamationmark => ascii('!'),
        Backtick => ascii(if shift { '~' } else { '`' }),
        Backspace => Some(0xff08),
        Tab => Some(0xff09),
        Enter => Some(0xff0d),
        Escape => Some(0xff1b),
        Delete => Some(0xffff),
        Insert => Some(0xff63),
        Home => Some(0xff50),
        ArrowLeft => Some(0xff51),
        ArrowUp => Some(0xff52),
        ArrowRight => Some(0xff53),
        ArrowDown => Some(0xff54),
        PageUp => Some(0xff55),
        PageDown => Some(0xff56),
        End => Some(0xff57),
        F1 => Some(0xffbe),
        F2 => Some(0xffbf),
        F3 => Some(0xffc0),
        F4 => Some(0xffc1),
        F5 => Some(0xffc2),
        F6 => Some(0xffc3),
        F7 => Some(0xffc4),
        F8 => Some(0xffc5),
        F9 => Some(0xffc6),
        F10 => Some(0xffc7),
        F11 => Some(0xffc8),
        F12 => Some(0xffc9),
        ShiftLeft => Some(0xffe1),
        ShiftRight => Some(0xffe2),
        ControlLeft => Some(0xffe3),
        ControlRight => Some(0xffe4),
        AltLeft => Some(0xffe9),
        AltRight => Some(0xffea),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keys_carry_the_keysyms_hangul_reads() {
        // Two-set Hangul: r is ㄱ, R (Shift) is ㄲ.
        assert_eq!(keysym(Key::R, false), Some(b'r' as u32));
        assert_eq!(keysym(Key::R, true), Some(b'R' as u32));
        assert_eq!(keysym(Key::Num2, true), Some(b'@' as u32));
        assert_eq!(keysym(Key::Num2, false), Some(b'2' as u32));
        assert_eq!(keysym(Key::Backspace, false), Some(0xff08));
        assert_eq!(keysym(Key::F9, false), Some(0xffc6));
    }

    #[test]
    fn preedit_segments_join_and_surrounding_deletes_split() {
        let Event::Ime(ImeEvent::Preedit { text, .. }) =
            preedit(&[("한".into(), 8), ("ㄱ".into(), 8)])
        else {
            panic!("not a preedit");
        };
        assert_eq!(text, "한ㄱ");
        let Event::Ime(ImeEvent::DeleteSurrounding {
            before_chars,
            after_chars,
        }) = delete_surrounding(-1, 2)
        else {
            panic!("not a deletion");
        };
        assert_eq!((before_chars, after_chars), (1, 1));
        assert_eq!(char_of(0x0100_d55c), Some('한'));
    }
}
