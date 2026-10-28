//! Redrob Browser window.
//!
//! Tabs, a toolbar with back, forward, reload, an address field with
//! suggestions and a bookmark star, and a bookmarks bar. Each tab's page is
//! drawn as cached tiles the engine paints; input inside the page area goes
//! to the engine as CDP input events.

mod agent_bridge;
mod cdp;
mod engine;
mod import_chrome;
mod input;
mod model;
mod profile;
mod relay;
mod tiles;
mod vault;

use std::sync::mpsc;

use cdp::{Command, Event, Op, Update};
use egui::{Color32, Key, Modifiers, Sense};
use model::{Model, SuggestionKind, Tab, TabId};
use tiles::TileCache;

const NEW_TAB: &str = "about:blank";

fn main() -> anyhow::Result<()> {
    let profile = match profile::Profile::open_default() {
        Ok(p) => Some(p),
        Err(e) => {
            eprintln!("redrob-browser: profile unavailable, nothing will be saved: {e}");
            None
        }
    };
    let storage = profile
        .as_ref()
        .map(|p| p.engine_dir())
        .unwrap_or_else(|| std::env::temp_dir().join("redrob-browser-engine"));
    let engine = engine::Engine::start(&storage)?;
    // `redrob-browser tab ...` and agents find this window's CDP relay here;
    // cdp::run writes it once the relay is listening.
    let endpoint_file = storage.join("ws-endpoint");
    let relay_file = endpoint_file.clone();
    let start_url = std::env::args().nth(1);

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
                    if let Err(e) = cdp::run(ws_url, relay_file, cmd_rx, upd_tx, move || ctx.request_repaint()).await {
                        let _ = errors.send(Update { tab: 0, event: Event::Error(e.to_string()) });
                    }
                });
            });
            let (agent_tx, agent_rx) = mpsc::channel();
            let mut model = Model::default();
            let mut restore = (Vec::new(), 0);
            if let Some(p) = &profile {
                if let Err(e) = p.load(&mut model) {
                    eprintln!("redrob-browser: could not read bookmarks and history: {e}");
                }
                restore = p.load_session().unwrap_or_default();
            }
            let mut window = Window {
                commands: cmd_tx,
                updates: upd_rx,
                model,
                profile,
                last_session_save: std::time::Instant::now(),
                show_downloads: false,
                vault: None,
                pending_save: None,
                agent_tx,
                agent_rx,
                notice: None,
                address: String::new(),
                editing: false,
                focus_address: false,
                error: None,
                last_size: (0, 0, 0.0),
                address_id: egui::Id::new("address"),
            };
            if let Some(p) = &window.profile {
                match vault::Vault::open(&p.dir) {
                    Ok(v) => window.vault = Some(v),
                    Err(e) => eprintln!("redrob-browser: password vault unavailable: {e}"),
                }
            }
            window.restore(restore.0, restore.1);
            match start_url {
                Some(url) => window.open_tab(&model::to_url(&url), true),
                None if window.model.tabs.is_empty() => window.open_tab(NEW_TAB, true),
                None => {}
            }
            Ok(Box::new(window))
        }),
    );
    let _ = std::fs::remove_file(&endpoint_file);
    drop(engine);
    result.map_err(|e| anyhow::anyhow!("{e}"))
}

/// Write a file only its owner can read: the CDP address is a key to every tab.
fn write_private(path: &std::path::Path, text: &str) {
    let mut options = std::fs::OpenOptions::new();
    options.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }
    if let Ok(mut f) = options.open(path) {
        use std::io::Write;
        let _ = f.write_all(text.as_bytes());
    }
}

struct Window {
    commands: tokio::sync::mpsc::UnboundedSender<Command>,
    updates: mpsc::Receiver<Update>,
    model: Model,
    profile: Option<profile::Profile>,
    last_session_save: std::time::Instant,
    show_downloads: bool,
    vault: Option<vault::Vault>,
    /// A sign-in the person just made, waiting for "save this password?".
    pending_save: Option<(String, String, zeroize::Zeroizing<String>)>,
    agent_tx: mpsc::Sender<String>,
    agent_rx: mpsc::Receiver<String>,
    /// A one-line result shown under the toolbar, such as an import summary.
    notice: Option<String>,
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

    /// Reopen the tabs from the last session in their order.
    fn restore(&mut self, tabs: Vec<profile::SavedTab>, active: usize) {
        for saved in tabs {
            let id = self.model.alloc_id();
            let mut tab = Tab::new(id, &saved.url);
            tab.title = saved.title;
            tab.loading = true;
            self.model.tabs.push(tab);
            self.op(id, Op::Open(saved.url));
        }
        if !self.model.tabs.is_empty() {
            self.model.active = active.min(self.model.tabs.len() - 1);
            self.activated();
        }
    }

    fn save_bookmarks(&mut self) {
        if let Some(p) = &mut self.profile {
            if let Err(e) = p.save_bookmarks(&self.model.bookmarks) {
                self.error = Some(format!("Could not save bookmarks: {e}"));
            }
        }
    }

    fn save_session(&mut self) {
        self.last_session_save = std::time::Instant::now();
        if let Some(p) = &mut self.profile {
            let _ = p.save_session(&self.model);
        }
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
            if let Event::Download { guid, url, filename, state, path, bytes } = event {
                self.on_download(model::DownloadItem { guid, url, filename, state, path, bytes });
                continue;
            }
            if let Event::LoginSubmitted { origin, username, password } = event {
                self.offer_save(tab, origin, username, password);
                continue;
            }
            if let Event::Opened { url, opener } = &event {
                let mut t = Tab::new(tab, url);
                t.loading = true;
                // A tab no page opened came from outside the window: an agent.
                t.agent = opener.is_none();
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
                Event::Filled(outcome) => {
                    if outcome != "filled" {
                        self.notice = Some("No sign-in form on this page.".to_string());
                    }
                }
                Event::Opened { .. } | Event::Download { .. } | Event::LoginSubmitted { .. } => {}
            }
            let url_now = t.url.clone();
            if let Some((url, title)) = visited {
                self.model.record_visit(&url, &title);
                if let Some(p) = &self.profile {
                    let _ = p.record_visit(&url, &title);
                }
            }
            if let Some((url, title)) = titled {
                self.model.set_history_title(&url, &title);
                if let Some(p) = &self.profile {
                    let _ = p.set_history_title(&url, &title);
                }
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

    fn on_download(&mut self, item: model::DownloadItem) {
        let finished = item.state != "inProgress";
        match self.model.downloads.iter_mut().find(|d| d.guid == item.guid) {
            Some(d) => {
                d.state = item.state.clone();
                d.bytes = item.bytes;
                if !item.path.is_empty() {
                    d.path = item.path.clone();
                }
                if !item.url.is_empty() {
                    d.url = item.url.clone();
                }
            }
            None => self.model.downloads.push(item.clone()),
        }
        self.show_downloads = true;
        if finished {
            if let (Some(p), Some(d)) = (&self.profile, self.model.downloads.iter().find(|d| d.guid == item.guid)) {
                let _ = p.record_download(d);
            }
        }
    }

    fn downloads_panel(&mut self, ui: &mut egui::Ui) {
        ui.horizontal(|ui| {
            ui.strong("Downloads");
            if ui.small_button("Close").clicked() {
                self.show_downloads = false;
            }
        });
        for d in self.model.downloads.iter().rev().take(6) {
            ui.horizontal(|ui| {
                let state = match d.state.as_str() {
                    "completed" => "Done",
                    "canceled" => "Failed",
                    _ => "Downloading",
                };
                ui.label(format!("{}  {}  {} KB", d.filename, state, d.bytes / 1024));
                if !d.path.is_empty() {
                    ui.weak(&d.path);
                }
            });
        }
    }

    fn import_from(&mut self, source: &import_chrome::Source) {
        let Some(profile) = &mut self.profile else {
            self.notice = Some("Import needs a profile, and none could be opened.".to_string());
            return;
        };
        let scratch = profile.dir.join("import-tmp");
        let result = import_chrome::import(source, &scratch);
        let _ = std::fs::remove_dir(&scratch);
        let imported = match result {
            Ok(i) => i,
            Err(e) => {
                self.notice = Some(format!("Could not import from {}: {e}", source.name));
                return;
            }
        };
        let mut added = 0;
        for b in imported.bookmarks {
            if !self.model.bookmarks.iter().any(|x| x.url == b.url) {
                self.model.bookmarks.push(b);
                added += 1;
            }
        }
        let history = imported.history.len();
        let saved = profile.save_bookmarks(&self.model.bookmarks).and_then(|_| profile.import_history(&imported.history));
        if let Err(e) = saved {
            self.notice = Some(format!("Could not save the import: {e}"));
            return;
        }
        let _ = profile.load(&mut self.model);
        self.notice = Some(format!("Imported {added} bookmarks and {history} history entries from {}.", source.name));
    }

    /// The key button: saved logins for this site, filled by the person's click.
    fn key_button(&mut self, ui: &mut egui::Ui, url: &str) {
        let (Some(v), Some(origin)) = (&self.vault, vault::origin_of(url)) else { return };
        let logins = v.logins_for(&origin);
        if logins.is_empty() {
            return;
        }
        let mut fill = None;
        ui.menu_button("Key", |ui| {
            for l in &logins {
                if ui.button(format!("Sign in as {}", l.username)).clicked() {
                    fill = Some(l.id);
                    ui.close();
                }
            }
        });
        let Some(id) = fill else { return };
        let Some(tab) = self.active_id() else { return };
        // The person's own click is also the vault unlock on platforms
        // without a device authenticator.
        if let Some(v) = &mut self.vault {
            v.unlock();
            match v.secret_for_fill(id, &origin, vault::Actor::Person) {
                Ok((username, password)) => self.op(tab, Op::FillLogin { username, password }),
                Err(e) => self.notice = Some(format!("Could not use the saved login: {e}")),
            }
        }
    }

    /// Offer to save a sign-in, but only for the tab's own committed site: a
    /// page cannot plant a login for another origin.
    fn offer_save(&mut self, tab: TabId, origin: String, username: String, password: zeroize::Zeroizing<String>) {
        let Some(v) = &self.vault else { return };
        let Some(t) = self.model.tabs.iter().find(|t| t.id == tab) else { return };
        if t.agent || vault::origin_of(&t.url).as_deref() != Some(origin.as_str()) || v.never_save(&origin) {
            return;
        }
        self.pending_save = Some((origin, username, password));
    }

    fn save_bar(&mut self, ui: &mut egui::Ui) {
        let Some((origin, username, _)) = &self.pending_save else { return };
        let exists = self.vault.as_ref().is_some_and(|v| v.has_login(origin, username));
        let who = if username.is_empty() { String::new() } else { format!(" for {username}") };
        let question = if exists {
            format!("Update the saved password{who} on {origin}?")
        } else {
            format!("Save the password{who} on {origin}?")
        };
        let mut choice = 0;
        ui.horizontal(|ui| {
            ui.label(question);
            if ui.button(if exists { "Update" } else { "Save" }).clicked() {
                choice = 1;
            }
            if ui.button("Not now").clicked() {
                choice = 2;
            }
            if ui.button("Never for this site").clicked() {
                choice = 3;
            }
        });
        if choice == 0 {
            return;
        }
        let Some((origin, username, password)) = self.pending_save.take() else { return };
        let Some(v) = &self.vault else { return };
        let result = match choice {
            1 => v.save(&origin, &username, &password),
            3 => v.set_never_save(&origin),
            _ => Ok(()),
        };
        if let Err(e) = result {
            self.notice = Some(format!("Could not save the password: {e}"));
        }
    }

    fn import_passwords(&mut self, logins: anyhow::Result<Vec<import_chrome::ImportedLogin>>, skipped: usize, from: &str) {
        let Some(v) = &self.vault else {
            self.notice = Some("The password vault is not available on this system.".to_string());
            return;
        };
        match logins {
            Ok(list) => {
                let mut saved = 0;
                for (origin, username, password) in &list {
                    if v.save(origin, username, password).is_ok() {
                        saved += 1;
                    }
                }
                let extra = if skipped > 0 { format!(" {skipped} could not be opened; import a CSV export for those.") } else { String::new() };
                self.notice = Some(format!("Imported {saved} passwords from {from}.{extra}"));
            }
            Err(e) => self.notice = Some(format!("Could not import passwords: {e}")),
        }
    }

    /// `> ...` in the address bar: hand the prompt to Redrob Code.
    fn ask_agent(&mut self, prompt: String) {
        self.editing = false;
        if prompt.is_empty() {
            return;
        }
        let (url, title) = self.model.active_tab().map(|t| (t.url.clone(), t.title.clone())).unwrap_or_default();
        self.address = if url == NEW_TAB { String::new() } else { url.clone() };
        let server = self
            .profile
            .as_ref()
            .and_then(|p| p.setting("agent_server"))
            .unwrap_or_else(|| agent_bridge::DEFAULT_SERVER.to_string());
        let tx = self.agent_tx.clone();
        std::thread::spawn(move || {
            let msg = match agent_bridge::send_prompt(&server, &prompt, &url, &title) {
                Ok(_) => "Sent to Redrob Code.".to_string(),
                Err(e) => format!("Could not reach the agent: {e}"),
            };
            let _ = tx.send(msg);
        });
        self.notice = Some("Sending to Redrob Code...".to_string());
    }

    fn menu(&mut self, ui: &mut egui::Ui) {
        ui.menu_button("Menu", |ui| {
            if ui.button("New tab").clicked() {
                self.open_tab(NEW_TAB, true);
                ui.close();
            }
            if ui.button("Downloads").clicked() {
                self.show_downloads = true;
                ui.close();
            }
            ui.separator();
            let sources = import_chrome::sources();
            if sources.is_empty() {
                ui.weak("No Chrome, Chromium, Edge or Brave profile found");
            }
            for s in &sources {
                if ui.button(format!("Import from {}", s.name)).clicked() {
                    self.import_from(s);
                    ui.close();
                }
                if s.profile.join("Login Data").exists() && ui.button(format!("Import passwords from {}", s.name)).clicked() {
                    let scratch = self.profile.as_ref().map(|p| p.dir.join("import-tmp")).unwrap_or_else(std::env::temp_dir);
                    let (logins, skipped) = match import_chrome::import_passwords(s, &scratch) {
                        Ok((l, n)) => (Ok(l), n),
                        Err(e) => (Err(e), 0),
                    };
                    self.import_passwords(logins, skipped, s.name);
                    ui.close();
                }
            }
            // Chrome's "Export passwords" writes this file to the Downloads folder.
            let csv = profile::downloads_dir().join("Chrome Passwords.csv");
            if csv.exists() && ui.button("Import passwords from Chrome Passwords.csv").clicked() {
                let logins = import_chrome::import_passwords_csv(&csv);
                self.import_passwords(logins, 0, "the CSV file");
                ui.close();
            }
        });
    }

    fn toggle_bookmark(&mut self) {
        if let Some((url, title)) = self.model.active_tab().map(|t| (t.url.clone(), t.title.clone())) {
            self.model.toggle_bookmark(&url, &title);
            self.save_bookmarks();
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
            let field_width = ui.available_width() - 140.0;
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
                if let Some(prompt) = self.address.trim().strip_prefix('>') {
                    self.ask_agent(prompt.trim().to_string());
                } else {
                    go = Some(model::to_url(&self.address));
                }
            }
            if field.lost_focus() && ui.input(|i| i.key_pressed(Key::Escape)) {
                self.editing = false;
                self.address = if url == NEW_TAB { String::new() } else { url.clone() };
            }
            if ui.button(star).on_hover_text("Bookmark this page").clicked() {
                self.toggle_bookmark();
            }
            self.key_button(ui, &url);
            self.menu(ui);
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
            self.save_bookmarks();
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
    fn on_exit(&mut self) {
        self.save_session();
    }

    fn ui(&mut self, ui: &mut egui::Ui, _frame: &mut eframe::Frame) {
        let ctx = ui.ctx().clone();
        self.drain_updates(&ctx);
        while let Ok(msg) = self.agent_rx.try_recv() {
            self.notice = Some(msg);
        }
        self.shortcuts(&ctx);
        // A crash must not lose the open tabs.
        if self.last_session_save.elapsed() > std::time::Duration::from_secs(30) {
            self.save_session();
        }

        egui::Panel::top("chrome").show_inside(ui, |ui| {
            self.tab_bar(ui);
            self.toolbar(ui);
            self.bookmarks_bar(ui);
            self.save_bar(ui);
            if let Some(e) = &self.error {
                ui.colored_label(Color32::RED, e);
            }
            if let Some(n) = self.notice.clone() {
                ui.horizontal(|ui| {
                    ui.label(n);
                    if ui.small_button("OK").clicked() {
                        self.notice = None;
                    }
                });
            }
        });

        if self.show_downloads && !self.model.downloads.is_empty() {
            egui::Panel::bottom("downloads").show_inside(ui, |ui| self.downloads_panel(ui));
        }

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
