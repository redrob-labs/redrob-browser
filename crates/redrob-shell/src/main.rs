//! Redrob Browser window.
//!
//! Tabs, a toolbar with back, forward, reload, an address field with
//! suggestions and a bookmark star, and a bookmarks bar. Each tab's page is
//! drawn as cached tiles the engine paints; input inside the page area goes
//! to the engine as CDP input events.

mod cdp;
mod engine;
mod input;
mod model;
mod tiles;

use std::sync::mpsc;

use cdp::{Command, Event, Op, Update};
use egui::{Color32, Key, Modifiers, Sense};
use model::{Model, SuggestionKind, Tab, TabId};
use tiles::TileCache;

const NEW_TAB: &str = "about:blank";

fn main() -> anyhow::Result<()> {
    let engine = engine::Engine::start()?;
    let start_url = std::env::args().nth(1).unwrap_or_else(|| NEW_TAB.to_string());

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
                        let _ = errors.send(Update { tab: 0, event: Event::Error(e.to_string()) });
                    }
                });
            });
            let mut window = Window {
                commands: cmd_tx,
                updates: upd_rx,
                model: Model::default(),
                address: String::new(),
                editing: false,
                focus_address: false,
                error: None,
                last_size: (0, 0, 0.0),
                address_id: egui::Id::new("address"),
            };
            window.open_tab(&start_url, true);
            Ok(Box::new(window))
        }),
    );
    drop(engine);
    result.map_err(|e| anyhow::anyhow!("{e}"))
}

struct Window {
    commands: tokio::sync::mpsc::UnboundedSender<Command>,
    updates: mpsc::Receiver<Update>,
    model: Model,
    /// Address field text; follows the active tab's URL unless the person is typing.
    address: String,
    editing: bool,
    focus_address: bool,
    error: Option<String>,
    last_size: (u32, u32, f32),
    address_id: egui::Id,
}

impl Window {
    fn op(&self, tab: TabId, op: Op) {
        let _ = self.commands.send(Command::Tab(tab, op));
    }

    fn active_id(&self) -> Option<TabId> {
        self.model.active_tab().map(|t| t.id)
    }

    fn open_tab(&mut self, url: &str, activate: bool) {
        let id = self.model.alloc_id();
        self.model.insert_tab(Tab::new(id, url), activate);
        self.op(id, Op::Open(url.to_string()));
        if activate {
            self.activated();
            if url == NEW_TAB {
                self.focus_address = true;
            }
        }
    }

    fn close_tab(&mut self, index: usize) {
        if let Some(id) = self.model.close_tab(index) {
            self.op(id, Op::Close);
        }
        if self.model.tabs.is_empty() {
            self.open_tab(NEW_TAB, true);
        } else {
            self.activated();
        }
    }

    fn select_tab(&mut self, index: usize) {
        if index < self.model.tabs.len() && index != self.model.active {
            self.model.active = index;
            self.activated();
        }
    }

    /// The active tab changed: follow it in the address field and the engine.
    fn activated(&mut self) {
        self.editing = false;
        if let Some(t) = self.model.active_tab() {
            self.address = if t.url == NEW_TAB { String::new() } else { t.url.clone() };
            self.op(t.id, Op::Activate);
        }
    }

    fn navigate(&mut self, url: String) {
        self.editing = false;
        if let Some(id) = self.active_id() {
            self.address = url.clone();
            self.op(id, Op::Navigate(url));
        }
    }

    fn drain_updates(&mut self, ctx: &egui::Context) {
        while let Ok(Update { tab, event }) = self.updates.try_recv() {
            if let Event::Opened { url, opener } = &event {
                let mut t = Tab::new(tab, url);
                t.loading = true;
                if let Some(i) = opener.and_then(|o| self.model.index_of(o)) {
                    self.model.active = i;
                }
                self.model.insert_tab(t, true);
                self.activated();
                continue;
            }
            let active = self.active_id() == Some(tab);
            let mut visited = None;
            let mut titled = None;
            let Some(t) = self.model.tab_mut(tab) else {
                if let Event::Error(e) = event {
                    self.error = Some(e);
                }
                continue;
            };
            match event {
                Event::Tile { key, generation, image } => t.tiles.insert(ctx, key, generation, image),
                Event::Invalidate => t.tiles.invalidate(),
                Event::Navigated(url) => {
                    t.url = url.clone();
                    t.title.clear();
                    t.tiles.clear();
                    t.scroll = (0.0, 0.0);
                    visited = Some((url, String::new()));
                }
                Event::UrlChanged(url) => {
                    t.url = url.clone();
                    visited = Some((url, t.title.clone()));
                }
                Event::Scroll { x, y, width, height } => {
                    t.scroll = (x, y);
                    t.content = (width, height);
                }
                Event::Title(title) => {
                    t.title = title.clone();
                    titled = Some((t.url.clone(), title));
                }
                Event::Loading(l) => t.loading = l,
                Event::Error(e) => {
                    t.loading = false;
                    self.error = Some(e);
                }
                Event::Opened { .. } => {}
            }
            let url_now = t.url.clone();
            if let Some((url, title)) = visited {
                self.model.record_visit(&url, &title);
            }
            if let Some((url, title)) = titled {
                self.model.set_history_title(&url, &title);
            }
            if active && !self.editing {
                self.address = if url_now == NEW_TAB { String::new() } else { url_now };
            }
        }
        let title = match self.model.active_tab().map(|t| t.label().to_string()) {
            Some(l) if !l.is_empty() => format!("{l} - Redrob Browser"),
            _ => "Redrob Browser".to_string(),
        };
        ctx.send_viewport_cmd(egui::ViewportCommand::Title(title));
    }

    /// Browser shortcuts, taken before the page sees the keys.
    fn shortcuts(&mut self, ctx: &egui::Context) {
        let cmd = Modifiers::COMMAND;
        let shift = Modifiers::COMMAND | Modifiers::SHIFT;
        let (new, close, reopen, address, bookmark, reload, next, prev, back, fwd) = ctx.input_mut(|i| {
            (
                i.consume_key(cmd, Key::T),
                i.consume_key(cmd, Key::W),
                i.consume_key(shift, Key::T),
                i.consume_key(cmd, Key::L),
                i.consume_key(cmd, Key::D),
                i.consume_key(cmd, Key::R) || i.consume_key(Modifiers::NONE, Key::F5),
                i.consume_key(Modifiers::CTRL, Key::Tab) || i.consume_key(cmd, Key::PageDown),
                i.consume_key(Modifiers::CTRL | Modifiers::SHIFT, Key::Tab) || i.consume_key(cmd, Key::PageUp),
                i.consume_key(Modifiers::ALT, Key::ArrowLeft),
                i.consume_key(Modifiers::ALT, Key::ArrowRight),
            )
        });
        let n = self.model.tabs.len();
        if new {
            self.open_tab(NEW_TAB, true);
        }
        if close {
            self.close_tab(self.model.active);
        }
        if reopen {
            if let Some((url, _)) = self.model.closed.pop() {
                self.open_tab(&url, true);
            }
        }
        if address {
            self.focus_address = true;
        }
        if bookmark {
            self.toggle_bookmark();
        }
        if reload {
            if let Some(id) = self.active_id() {
                self.op(id, Op::Reload);
            }
        }
        if next && n > 1 {
            self.select_tab((self.model.active + 1) % n);
        }
        if prev && n > 1 {
            self.select_tab((self.model.active + n - 1) % n);
        }
        if back || fwd {
            if let Some(id) = self.active_id() {
                self.op(id, if back { Op::Back } else { Op::Forward });
            }
        }
        // Ctrl+Shift+PageUp/PageDown move the active tab left or right.
        let (left, right) = ctx.input_mut(|i| (i.consume_key(shift, Key::PageUp), i.consume_key(shift, Key::PageDown)));
        let a = self.model.active;
        if left && a > 0 {
            self.model.move_tab(a, a - 1);
        }
        if right && a + 1 < n {
            self.model.move_tab(a, a + 1);
        }
    }

    fn toggle_bookmark(&mut self) {
        if let Some((url, title)) = self.model.active_tab().map(|t| (t.url.clone(), t.title.clone())) {
            self.model.toggle_bookmark(&url, &title);
        }
    }

    fn tab_bar(&mut self, ui: &mut egui::Ui) {
        let mut select = None;
        let mut close = None;
        let mut new_tab = false;
        ui.horizontal(|ui| {
            egui::ScrollArea::horizontal().id_salt("tabs").show(ui, |ui| {
                ui.horizontal(|ui| {
                    for (i, t) in self.model.tabs.iter().enumerate() {
                        let mut label: String = t.label().chars().take(24).collect();
                        if label.is_empty() {
                            label = "New tab".to_string();
                        }
                        if t.loading {
                            label = format!("... {label}");
                        }
                        if t.agent {
                            label = format!("[AI] {label}");
                        }
                        let r = ui.selectable_label(i == self.model.active, label).on_hover_text(&t.url);
                        if r.clicked() {
                            select = Some(i);
                        }
                        if r.middle_clicked() {
                            close = Some(i);
                        }
                        if ui.small_button("x").on_hover_text("Close tab").clicked() {
                            close = Some(i);
                        }
                    }
                    if ui.small_button("+").on_hover_text("New tab").clicked() {
                        new_tab = true;
                    }
                });
            });
        });
        if new_tab {
            self.open_tab(NEW_TAB, true);
        } else if let Some(i) = close {
            self.close_tab(i);
        } else if let Some(i) = select {
            self.select_tab(i);
        }
    }

    fn toolbar(&mut self, ui: &mut egui::Ui) {
        let id = self.active_id();
        let loading = self.model.active_tab().is_some_and(|t| t.loading);
        let url = self.model.active_tab().map(|t| t.url.clone()).unwrap_or_default();
        let mut go: Option<String> = None;
        ui.horizontal(|ui| {
            if ui.button("<").on_hover_text("Back").clicked() {
                if let Some(id) = id {
                    self.op(id, Op::Back);
                }
            }
            if ui.button(">").on_hover_text("Forward").clicked() {
                if let Some(id) = id {
                    self.op(id, Op::Forward);
                }
            }
            let (glyph, tip) = if loading { ("X", "Stop") } else { ("R", "Reload") };
            if ui.button(glyph).on_hover_text(tip).clicked() {
                if let Some(id) = id {
                    self.op(id, if loading { Op::Stop } else { Op::Reload });
                }
            }
            let star = if self.model.is_bookmarked(&url) { "★" } else { "☆" };
            let field_width = ui.available_width() - 40.0;
            let field = ui.add(
                egui::TextEdit::singleline(&mut self.address)
                    .id(self.address_id)
                    .desired_width(field_width)
                    .hint_text("Search or enter address"),
            );
            if self.focus_address {
                self.focus_address = false;
                field.request_focus();
                self.editing = true;
            }
            if field.changed() {
                self.editing = true;
            }
            if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Enter)) {
                go = Some(model::to_url(&self.address));
            }
            if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Escape)) {
                self.editing = false;
                self.address = if url == NEW_TAB { String::new() } else { url.clone() };
            }
            if ui.button(star).on_hover_text("Bookmark this page").clicked() {
                self.toggle_bookmark();
            }
        });

        // Suggestions under the address field while the person types.
        if self.editing && ui.memory(|m| m.has_focus(self.address_id)) {
            for s in self.model.suggest(&self.address, 8) {
                let tag = match s.kind {
                    SuggestionKind::Bookmark => "Bookmark",
                    SuggestionKind::History => "History",
                    SuggestionKind::Search => "Search",
                    SuggestionKind::Typed => "",
                };
                let text = if s.title.is_empty() { s.url.clone() } else { format!("{}  -  {}", s.title, s.url) };
                if ui.selectable_label(false, format!("{tag}: {text}")).clicked() {
                    go = Some(s.url);
                }
            }
        }
        if let Some(url) = go {
            self.navigate(url);
        }
    }

    fn bookmarks_bar(&mut self, ui: &mut egui::Ui) {
        if self.model.bookmarks.is_empty() {
            return;
        }
        let mut go = None;
        let mut go_new_tab = None;
        let mut remove = None;
        ui.horizontal_wrapped(|ui| {
            for (i, b) in self.model.bookmarks.iter().enumerate().filter(|(_, b)| b.folder.is_empty()) {
                let label: String = if b.title.is_empty() { b.url.clone() } else { b.title.clone() };
                let label: String = label.chars().take(20).collect();
                let r = ui.small_button(label).on_hover_text(&b.url);
                if r.clicked() {
                    go = Some(b.url.clone());
                }
                if r.middle_clicked() {
                    go_new_tab = Some(b.url.clone());
                }
                r.context_menu(|ui| {
                    if ui.button("Open in new tab").clicked() {
                        go_new_tab = Some(b.url.clone());
                        ui.close();
                    }
                    if ui.button("Remove").clicked() {
                        remove = Some(i);
                        ui.close();
                    }
                });
            }
        });
        if let Some(i) = remove {
            self.model.bookmarks.remove(i);
        }
        if let Some(url) = go_new_tab {
            self.open_tab(&url, false);
        }
        if let Some(url) = go {
            self.navigate(url);
        }
    }
}

impl eframe::App for Window {
    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.drain_updates(&ctx);
        self.shortcuts(&ctx);

        egui::Panel::top("chrome").show_inside(ui, |ui| {
            self.tab_bar(ui);
            self.toolbar(ui);
            self.bookmarks_bar(ui);
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
                let _ = self.commands.send(Command::Resize { width: size.0, height: size.1, scale });
            }
            ui.painter().rect_filled(rect, 0.0, Color32::WHITE);
            if self.model.tabs.is_empty() {
                return;
            }
            let tab_index = self.model.active;
            let wanted = {
                let t = &mut self.model.tabs[tab_index];
                t.tiles.paint(ui.painter(), rect, t.scroll);
                let keys = TileCache::visible(t.scroll, (rect.width(), rect.height()), t.content);
                (t.id, t.tiles.wanted(&keys), t.tiles.generation)
            };
            if !wanted.1.is_empty() {
                self.op(wanted.0, Op::Tiles { keys: wanted.1, generation: wanted.2 });
            }

            if response.clicked() || response.drag_started() {
                response.request_focus();
                self.editing = false;
            }
            let focused = response.has_focus();
            if response.hovered() || focused || response.is_pointer_button_down_on() {
                let events = ui.input(|i| i.events.clone());
                let hover = ui.input(|i| i.pointer.hover_pos());
                let (ops, wheel) = input::page_ops(&events, hover, rect, focused);
                let t = &mut self.model.tabs[tab_index];
                if wheel != (0.0, 0.0) {
                    // Move the tiles now; the page's reply corrects this if an
                    // inner box took the scroll instead of the document.
                    let max_x = (t.content.0 - rect.width()).max(0.0);
                    let max_y = (t.content.1 - rect.height()).max(0.0);
                    t.scroll = ((t.scroll.0 + wheel.0).clamp(0.0, max_x), (t.scroll.1 + wheel.1).clamp(0.0, max_y));
                }
                let id = t.id;
                for op in ops {
                    self.op(id, op);
                }
            }
        });
    }
}
