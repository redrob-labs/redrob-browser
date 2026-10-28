//! Built-in developer tools: Console, Elements and Network for the active
//! tab, drawn by the window and fed by CDP events. A full DevTools front end
//! can also attach to any tab through the relay (docs/DEVTOOLS.md).

use serde_json::Value;

#[derive(Clone, Copy, PartialEq, Eq, Default)]
pub enum Panel {
    #[default]
    Console,
    Elements,
    Network,
}

pub struct NetRow {
    pub id: String,
    pub method: String,
    pub url: String,
    pub status: Option<u16>,
    pub mime: String,
}

#[derive(Default)]
pub struct State {
    pub panel: Panel,
    /// (level, text). Levels: log, info, warning, error, debug, result, input.
    pub console: Vec<(String, String)>,
    pub input: String,
    pub net: Vec<NetRow>,
    pub dom: Option<Value>,
    /// Network is enabled for this tab only while the tools have been opened.
    pub network_on: bool,
}

const KEEP: usize = 2000;

impl State {
    pub fn log(&mut self, level: &str, text: String) {
        self.console.push((level.to_string(), text));
        if self.console.len() > KEEP {
            self.console.drain(..self.console.len() - KEEP);
        }
    }

    pub fn request(&mut self, id: String, method: String, url: String) {
        self.net.push(NetRow { id, method, url, status: None, mime: String::new() });
        if self.net.len() > KEEP {
            self.net.drain(..self.net.len() - KEEP);
        }
    }

    pub fn response(&mut self, id: &str, status: u16, mime: String) {
        if let Some(r) = self.net.iter_mut().rev().find(|r| r.id == id) {
            r.status = Some(status);
            r.mime = mime;
        }
    }

    /// A new document: requests and the DOM view belong to the old one.
    pub fn navigated(&mut self) {
        self.net.clear();
        self.dom = None;
    }
}

/// What the person asked for this frame.
#[derive(Default)]
pub struct Actions {
    pub evaluate: Option<String>,
    pub refresh_dom: bool,
    pub close: bool,
}

pub fn ui(ui: &mut egui::Ui, s: &mut State) -> Actions {
    let mut act = Actions::default();
    ui.horizontal(|ui| {
        ui.selectable_value(&mut s.panel, Panel::Console, "Console");
        if ui.selectable_value(&mut s.panel, Panel::Elements, "Elements").clicked() && s.dom.is_none() {
            act.refresh_dom = true;
        }
        ui.selectable_value(&mut s.panel, Panel::Network, "Network");
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui.small_button("Close").clicked() {
                act.close = true;
            }
        });
    });
    ui.separator();
    match s.panel {
        Panel::Console => console(ui, s, &mut act),
        Panel::Elements => elements(ui, s, &mut act),
        Panel::Network => network(ui, s),
    }
    act
}

fn console(ui: &mut egui::Ui, s: &mut State, act: &mut Actions) {
    let input_height = 28.0;
    egui::ScrollArea::vertical()
        .id_salt("console")
        .max_height(ui.available_height() - input_height)
        .stick_to_bottom(true)
        .auto_shrink([false, false])
        .show(ui, |ui| {
            for (level, text) in &s.console {
                let color = match level.as_str() {
                    "error" => egui::Color32::from_rgb(0xd9, 0x30, 0x25),
                    "warning" => egui::Color32::from_rgb(0xb0, 0x7a, 0x00),
                    "input" => ui.visuals().weak_text_color(),
                    _ => ui.visuals().text_color(),
                };
                let prefix = match level.as_str() {
                    "input" => "> ",
                    "result" => "< ",
                    _ => "",
                };
                ui.colored_label(color, egui::RichText::new(format!("{prefix}{text}")).monospace());
            }
        });
    ui.horizontal(|ui| {
        let r = ui.add(egui::TextEdit::singleline(&mut s.input).desired_width(f32::INFINITY).hint_text("JavaScript"));
        if r.lost_focus() && ui.input(|i| i.key_pressed(egui::Key::Enter)) && !s.input.trim().is_empty() {
            let expr = std::mem::take(&mut s.input);
            s.log("input", expr.clone());
            act.evaluate = Some(expr);
            r.request_focus();
        }
    });
}

fn elements(ui: &mut egui::Ui, s: &mut State, act: &mut Actions) {
    if ui.small_button("Refresh").clicked() {
        act.refresh_dom = true;
    }
    egui::ScrollArea::both().id_salt("elements").auto_shrink([false, false]).show(ui, |ui| match &s.dom {
        Some(root) => node(ui, root, 0),
        None => {
            ui.weak("Loading the document tree...");
        }
    });
}

fn node(ui: &mut egui::Ui, n: &Value, depth: usize) {
    let kind = n["nodeType"].as_u64().unwrap_or(0);
    let children: Vec<&Value> = n["children"].as_array().map(|c| c.iter().collect()).unwrap_or_default();
    match kind {
        // Text: show non-blank text inline.
        3 => {
            let t = n["nodeValue"].as_str().unwrap_or("").trim();
            if !t.is_empty() {
                let shown: String = t.chars().take(200).collect();
                ui.label(egui::RichText::new(format!("\"{shown}\"")).monospace());
            }
        }
        // Comment.
        8 => {
            ui.weak(egui::RichText::new(format!("<!--{}-->", n["nodeValue"].as_str().unwrap_or(""))).monospace());
        }
        _ => {
            let label = open_tag(n);
            if children.is_empty() {
                ui.label(egui::RichText::new(label).monospace());
            } else {
                let id = n["nodeId"].as_i64().unwrap_or(0);
                egui::CollapsingHeader::new(egui::RichText::new(label).monospace())
                    .id_salt(("dom", id))
                    .default_open(depth < 3)
                    .show(ui, |ui| {
                        for c in children {
                            node(ui, c, depth + 1);
                        }
                    });
            }
        }
    }
}

fn open_tag(n: &Value) -> String {
    let name = n["nodeName"].as_str().unwrap_or("").to_lowercase();
    if name.starts_with('#') {
        return name;
    }
    let mut out = format!("<{name}");
    if let Some(attrs) = n["attributes"].as_array() {
        for pair in attrs.chunks(2) {
            let k = pair[0].as_str().unwrap_or("");
            let v = pair.get(1).and_then(Value::as_str).unwrap_or("");
            let v: String = v.chars().take(80).collect();
            out.push_str(&format!(" {k}=\"{v}\""));
        }
    }
    out.push('>');
    out
}

fn network(ui: &mut egui::Ui, s: &State) {
    ui.weak(format!("{} requests", s.net.len()));
    egui::ScrollArea::both().id_salt("network").auto_shrink([false, false]).show(ui, |ui| {
        egui::Grid::new("net").striped(true).num_columns(4).show(ui, |ui| {
            ui.strong("Status");
            ui.strong("Method");
            ui.strong("Type");
            ui.strong("URL");
            ui.end_row();
            for r in &s.net {
                let status = r.status.map(|c| c.to_string()).unwrap_or_else(|| "...".to_string());
                let color = match r.status {
                    Some(c) if c >= 400 => egui::Color32::from_rgb(0xd9, 0x30, 0x25),
                    _ => ui.visuals().text_color(),
                };
                ui.colored_label(color, status);
                ui.label(&r.method);
                ui.label(&r.mime);
                let url: String = r.url.chars().take(160).collect();
                ui.label(url).on_hover_text(&r.url);
                ui.end_row();
            }
        });
    });
}
