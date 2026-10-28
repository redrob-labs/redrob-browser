//! Redrob Browser window.
//!
//! First cut: one tab, a toolbar with back, forward, reload and an address
//! field, and the page drawn from frames the engine paints. Input inside the
//! page area goes to the engine as CDP input events.

mod cdp;
mod engine;

use std::sync::mpsc;

use cdp::{Command, Update};
use egui::{pos2, Color32, Key, Rect, Sense, TextureHandle, TextureOptions};

fn main() -> anyhow::Result<()> {
    let engine = engine::Engine::start()?;
    let start_url = std::env::args().nth(1).unwrap_or_else(|| "about:blank".to_string());

    let options = eframe::NativeOptions {
        viewport: egui::ViewportBuilder::default()
            .with_title("Redrob Browser")
            .with_inner_size([1280.0, 860.0]),
        ..Default::default()
    };
    let ws_url = engine.ws_url.clone();
    let result = eframe::run_native(
        "Redrob Browser",
        options,
        Box::new(move |cc| {
            let ctx = cc.egui_ctx.clone();
            let (cmd_tx, cmd_rx) = tokio::sync::mpsc::unbounded_channel();
            let (upd_tx, upd_rx) = mpsc::channel();
            std::thread::spawn(move || {
                let rt = tokio::runtime::Builder::new_multi_thread().enable_all().build().expect("tokio runtime");
                let errors = upd_tx.clone();
                rt.block_on(async move {
                    if let Err(e) = cdp::run(ws_url, cmd_rx, upd_tx, move || ctx.request_repaint()).await {
                        let _ = errors.send(Update::Error(e.to_string()));
                    }
                });
            });
            if start_url != "about:blank" {
                let _ = cmd_tx.send(Command::Navigate(start_url.clone()));
            }
            Ok(Box::new(Window {
                commands: cmd_tx,
                updates: upd_rx,
                page: None,
                address: start_url,
                title: String::new(),
                error: None,
                last_size: (0, 0, 0.0),
            }))
        }),
    );
    drop(engine);
    result.map_err(|e| anyhow::anyhow!("{e}"))
}

struct Window {
    commands: tokio::sync::mpsc::UnboundedSender<Command>,
    updates: mpsc::Receiver<Update>,
    page: Option<TextureHandle>,
    address: String,
    title: String,
    error: Option<String>,
    last_size: (u32, u32, f32),
}

impl Window {
    fn send(&self, c: Command) {
        let _ = self.commands.send(c);
    }

    fn drain_updates(&mut self, ctx: &egui::Context) {
        while let Ok(u) = self.updates.try_recv() {
            match u {
                Update::Frame { width, height, rgba } => {
                    let image = egui::ColorImage::from_rgba_unmultiplied([width as usize, height as usize], &rgba);
                    match &mut self.page {
                        Some(t) => t.set(image, TextureOptions::LINEAR),
                        None => self.page = Some(ctx.load_texture("page", image, TextureOptions::LINEAR)),
                    }
                }
                Update::Url(url) => self.address = url,
                Update::Title(t) => {
                    self.title = t;
                    let title = if self.title.is_empty() {
                        "Redrob Browser".to_string()
                    } else {
                        format!("{} - Redrob Browser", self.title)
                    };
                    ctx.send_viewport_cmd(egui::ViewportCommand::Title(title));
                }
                Update::Error(e) => self.error = Some(e),
            }
        }
    }
}

impl eframe::App for Window {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.drain_updates(&ctx);

        egui::Panel::top("toolbar").show_inside(ui, |ui| {
            ui.horizontal(|ui| {
                if ui.button("<").on_hover_text("Back").clicked() {
                    self.send(Command::Back);
                }
                if ui.button(">").on_hover_text("Forward").clicked() {
                    self.send(Command::Forward);
                }
                if ui.button("R").on_hover_text("Reload").clicked() {
                    self.send(Command::Reload);
                }
                let field = ui.add(
                    egui::TextEdit::singleline(&mut self.address)
                        .desired_width(f32::INFINITY)
                        .hint_text("Search or enter address"),
                );
                if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                    self.send(Command::Navigate(to_url(&self.address)));
                }
            });
            if let Some(e) = &self.error {
                ui.colored_label(Color32::RED, e);
            }
        });

        egui::CentralPanel::default().show_inside(ui, |ui| {
            let (rect, response) = ui.allocate_exact_size(ui.available_size(), Sense::click_and_drag());
            let scale = ctx.pixels_per_point();
            let size = (rect.width().round() as u32, rect.height().round() as u32, scale);
            if size != self.last_size && size.0 > 0 && size.1 > 0 {
                self.last_size = size;
                self.send(Command::Resize { width: size.0, height: size.1, scale });
            }
            if let Some(tex) = &self.page {
                let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
                ui.painter().image(tex.id(), rect, uv, Color32::WHITE);
            }
            if response.hovered() || response.has_focus() || response.is_pointer_button_down_on() {
                if response.clicked() || response.drag_started() {
                    response.request_focus();
                }
                self.forward_input(ui, rect, response.has_focus());
            }
        });
    }
}

impl Window {
    fn forward_input(&self, ui: &egui::Ui, rect: Rect, focused: bool) {
        let events = ui.input(|i| i.events.clone());
        for ev in events {
            match ev {
                egui::Event::PointerMoved(p) if rect.contains(p) => {
                    let (x, y) = local(rect, p);
                    self.send(Command::Mouse { kind: "mouseMoved", x, y, button: "none", clicks: 0, modifiers: 0 });
                }
                egui::Event::PointerButton { pos, button, pressed, modifiers } if rect.contains(pos) => {
                    let (x, y) = local(rect, pos);
                    let kind = if pressed { "mousePressed" } else { "mouseReleased" };
                    self.send(Command::Mouse {
                        kind,
                        x,
                        y,
                        button: button_name(button),
                        clicks: 1,
                        modifiers: mods(modifiers),
                    });
                }
                egui::Event::MouseWheel { delta, modifiers, unit, .. } => {
                    let Some(p) = ui.input(|i| i.pointer.hover_pos()) else { continue };
                    if !rect.contains(p) {
                        continue;
                    }
                    let (x, y) = local(rect, p);
                    let step = match unit {
                        egui::MouseWheelUnit::Point => 1.0,
                        egui::MouseWheelUnit::Line => 40.0,
                        egui::MouseWheelUnit::Page => rect.height(),
                    };
                    // egui reports wheel-up as positive; CDP scrolls down on positive deltaY.
                    self.send(Command::Wheel { x, y, dx: -delta.x * step, dy: -delta.y * step, modifiers: mods(modifiers) });
                }
                egui::Event::Text(t) if focused => self.send(Command::Text(t)),
                egui::Event::Key { key, pressed, modifiers, .. } if focused => {
                    if let Some((name, code, vk)) = key_info(key) {
                        self.send(Command::Key {
                            down: pressed,
                            key: name.to_string(),
                            code: code.to_string(),
                            vk,
                            modifiers: mods(modifiers),
                        });
                    }
                }
                _ => {}
            }
        }
    }
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

/// Address field text to a URL: a URL as typed, a bare host gets https, anything else is a search.
fn to_url(input: &str) -> String {
    let s = input.trim();
    if s.contains("://") || s.starts_with("about:") {
        return s.to_string();
    }
    if !s.contains(' ') && s.contains('.') {
        return format!("https://{s}");
    }
    let q: String = s
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    format!("https://duckduckgo.com/html/?q={q}")
}
