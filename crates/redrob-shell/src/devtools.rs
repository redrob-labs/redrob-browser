//! Built-in developer tools: Console, Elements and Network for the active
//! tab, drawn by the window and fed by CDP events. A full DevTools front end
//! can also attach to any tab through the relay (docs/DEVTOOLS.md).

use serde_json::Value;

use crate::cdp::Op;
use crate::i18n::{t, tf};

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

/// Computed and inline style of one node, for the Elements panel.
pub struct Styles {
    pub node: i64,
    pub computed: Vec<(String, String)>,
    pub inline: Vec<(String, String)>,
}

impl Styles {
    /// From CSS.getComputedStyleForNode and CSS.getMatchedStylesForNode replies.
    pub fn from_cdp(node: i64, computed: &Value, matched: &Value) -> Self {
        let computed: Vec<(String, String)> = computed["computedStyle"]
            .as_array()
            .map(|a| a.iter().map(|p| (str_of(&p["name"]), str_of(&p["value"]))).collect())
            .unwrap_or_default();
        let inline: Vec<(String, String)> = matched["inlineStyle"]["cssProperties"]
            .as_array()
            .map(|a| {
                a.iter()
                    .map(|p| {
                        let mut v = str_of(&p["value"]);
                        if p["important"].as_bool() == Some(true) {
                            v.push_str(" !important");
                        }
                        (str_of(&p["name"]), v)
                    })
                    .collect()
            })
            .unwrap_or_default();
        Styles { node, computed, inline }
    }
}

fn str_of(v: &Value) -> String {
    v.as_str().unwrap_or_default().to_string()
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
    /// The node chosen in the Elements panel and its styles once they arrive.
    pub selected: Option<i64>,
    pub styles: Option<Styles>,
    pub style_filter: String,
    /// A DOM.getBoxModel model drawn over the page; set by Overlay.redrobHighlight.
    pub highlight: Option<Value>,
    /// The next click in the page selects an element instead of reaching it.
    pub picking: bool,
    /// The node under the pointer in the tree, last sent as a highlight.
    hover: Option<i64>,
    want_styles: Option<i64>,
    want_dom: bool,
    /// Open the tree down to the selected node and scroll to it.
    reveal: bool,
    /// The release that follows a pick press must not reach the page either.
    swallow_release: bool,
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
        self.selected = None;
        self.styles = None;
        self.highlight = None;
        self.picking = false;
        self.hover = None;
        self.reveal = false;
    }

    /// The page reported an element under the pick click.
    pub fn picked(&mut self, node: i64) {
        self.panel = Panel::Elements;
        self.select(node);
        self.reveal = true;
        let known = self.dom.as_ref().is_some_and(|d| path_to(d, node, &mut Vec::new()));
        if !known {
            // The element is newer than the tree on screen.
            self.dom = None;
            self.want_dom = true;
        }
    }

    fn select(&mut self, node: i64) {
        self.selected = Some(node);
        self.styles = None;
        self.want_styles = Some(node);
    }

    pub fn set_styles(&mut self, styles: Styles) {
        if self.selected == Some(styles.node) {
            self.styles = Some(styles);
        }
    }

    pub fn set_highlight(&mut self, model: Value) {
        self.highlight = if model.is_null() { None } else { Some(model) };
    }
}

/// What the person asked for this frame.
#[derive(Default)]
pub struct Actions {
    pub evaluate: Option<String>,
    pub refresh_dom: bool,
    pub close: bool,
    /// Ask for this node's computed and inline style.
    pub styles_for: Option<i64>,
    /// Highlight this node on the page, or clear the highlight.
    pub highlight: Option<Option<i64>>,
}

pub fn ui(ui: &mut egui::Ui, s: &mut State) -> Actions {
    let mut act = Actions::default();
    if let Some(node) = s.want_styles.take() {
        act.styles_for = Some(node);
    }
    if std::mem::take(&mut s.want_dom) {
        act.refresh_dom = true;
    }
    ui.horizontal(|ui| {
        ui.selectable_value(&mut s.panel, Panel::Console, t("Console"));
        if ui.selectable_value(&mut s.panel, Panel::Elements, t("Elements")).clicked() && s.dom.is_none() {
            act.refresh_dom = true;
        }
        ui.selectable_value(&mut s.panel, Panel::Network, t("Network"));
        ui.with_layout(egui::Layout::right_to_left(egui::Align::Center), |ui| {
            if ui.small_button(t("Close")).clicked() {
                act.close = true;
            }
        });
    });
    ui.separator();
    let mut hovered = None;
    match s.panel {
        Panel::Console => console(ui, s, &mut act),
        Panel::Elements => hovered = elements(ui, s, &mut act),
        Panel::Network => network(ui, s),
    }
    // While picking, the pointer over the page drives the highlight instead.
    if !s.picking && hovered != s.hover {
        s.hover = hovered;
        act.highlight = Some(hovered);
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

/// Per-frame bookkeeping while the tree is drawn.
struct Tree {
    selected: Option<i64>,
    /// Ancestors to force open, when revealing the selected node.
    open: Vec<i64>,
    reveal: bool,
    clicked: Option<i64>,
    hovered: Option<i64>,
}

/// Returns the node under the pointer in the tree.
fn elements(ui: &mut egui::Ui, s: &mut State, act: &mut Actions) -> Option<i64> {
    ui.horizontal(|ui| {
        if ui.small_button(t("Refresh")).clicked() {
            act.refresh_dom = true;
        }
        let pick = ui
            .selectable_label(s.picking, t("Pick an element"))
            .on_hover_text(t("Click an element in the page to select it"));
        if pick.clicked() {
            s.picking = !s.picking;
            if !s.picking {
                act.highlight = Some(None);
            }
        }
    });
    let mut tree = Tree { selected: s.selected, open: Vec::new(), reveal: false, clicked: None, hovered: None };
    if s.reveal {
        if let (Some(root), Some(node)) = (&s.dom, s.selected) {
            tree.reveal = path_to(root, node, &mut tree.open);
            s.reveal = false;
        }
    }
    let tree_height = if s.selected.is_some() { (ui.available_height() * 0.55).max(80.0) } else { ui.available_height() };
    egui::ScrollArea::both()
        .id_salt("elements")
        .max_height(tree_height)
        .auto_shrink([false, false])
        .show(ui, |ui| match &s.dom {
            Some(root) => node(ui, root, 0, &mut tree),
            None => {
                ui.weak(t("Loading the document tree..."));
            }
        });
    if let Some(id) = tree.clicked {
        s.select(id);
        act.styles_for = s.want_styles.take();
    }
    if s.selected.is_some() {
        ui.separator();
        styles(ui, s);
    }
    tree.hovered
}

/// Ancestors of `target` (and `target` itself) in a DOM.getDocument tree.
fn path_to(n: &Value, target: i64, out: &mut Vec<i64>) -> bool {
    let id = n["nodeId"].as_i64().unwrap_or(-1);
    if id == target {
        out.push(id);
        return true;
    }
    if let Some(children) = n["children"].as_array() {
        for c in children {
            if path_to(c, target, out) {
                out.push(id);
                return true;
            }
        }
    }
    false
}

fn node(ui: &mut egui::Ui, n: &Value, depth: usize, tree: &mut Tree) {
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
            let id = n["nodeId"].as_i64().unwrap_or(0);
            if children.is_empty() {
                row(ui, label, id, tree);
            } else {
                let uid = ui.make_persistent_id(("dom", id));
                let mut state = egui::collapsing_header::CollapsingState::load_with_default_open(ui.ctx(), uid, depth < 3);
                if tree.reveal && tree.open.contains(&id) {
                    state.set_open(true);
                }
                let header = state.show_header(ui, |ui| row(ui, label, id, tree));
                header.body(|ui| {
                    for c in children {
                        node(ui, c, depth + 1, tree);
                    }
                });
            }
        }
    }
}

/// One selectable element row: click selects it, hover highlights it on the page.
fn row(ui: &mut egui::Ui, label: String, id: i64, tree: &mut Tree) {
    let r = ui.selectable_label(tree.selected == Some(id), egui::RichText::new(label).monospace());
    if r.clicked() {
        tree.clicked = Some(id);
    }
    if r.hovered() {
        tree.hovered = Some(id);
    }
    if tree.reveal && tree.selected == Some(id) {
        r.scroll_to_me(Some(egui::Align::Center));
    }
}

fn styles(ui: &mut egui::Ui, s: &mut State) {
    ui.add(egui::TextEdit::singleline(&mut s.style_filter).desired_width(f32::INFINITY).hint_text(t("Filter")));
    let Some(st) = &s.styles else {
        ui.weak(t("Loading styles..."));
        return;
    };
    let filter = s.style_filter.trim().to_lowercase();
    let keep = |(k, v): &&(String, String)| filter.is_empty() || k.to_lowercase().contains(&filter) || v.to_lowercase().contains(&filter);
    egui::ScrollArea::vertical().id_salt("styles").auto_shrink([false, false]).show(ui, |ui| {
        ui.strong(t("Inline style"));
        let inline: Vec<&(String, String)> = st.inline.iter().filter(keep).collect();
        if inline.is_empty() {
            ui.weak(t("No inline style"));
        } else {
            property_grid(ui, "inline-style", &inline);
        }
        ui.add_space(6.0);
        ui.strong(t("Computed"));
        let computed: Vec<&(String, String)> = st.computed.iter().filter(keep).collect();
        property_grid(ui, "computed-style", &computed);
    });
}

fn property_grid(ui: &mut egui::Ui, id: &str, props: &[&(String, String)]) {
    egui::Grid::new(id).striped(true).num_columns(2).show(ui, |ui| {
        for (k, v) in props {
            ui.label(egui::RichText::new(k.as_str()).monospace().color(ui.visuals().weak_text_color()));
            let shown: String = v.chars().take(160).collect();
            ui.label(egui::RichText::new(shown).monospace()).on_hover_text(v.as_str());
            ui.end_row();
        }
    });
}

/// Page input while picking: the pointer highlights what it is over and the
/// first left click selects that element; none of it reaches the page.
/// Escape cancels. `active` is false when the tools are closed.
pub fn pick_input(s: &mut State, events: &mut Vec<egui::Event>, rect: egui::Rect, active: bool) -> Vec<Op> {
    if !active {
        s.picking = false;
    }
    let mut ops = Vec::new();
    if !s.picking && !s.swallow_release {
        return ops;
    }
    let local = |p: egui::Pos2| (p.x - rect.left(), p.y - rect.top());
    events.retain(|ev| match ev {
        egui::Event::PointerMoved(p) if s.picking && rect.contains(*p) => {
            let (x, y) = local(*p);
            ops.push(Op::PickAt { x, y, commit: false });
            false
        }
        egui::Event::PointerButton { pos, button: egui::PointerButton::Primary, pressed: true, .. }
            if s.picking && rect.contains(*pos) =>
        {
            let (x, y) = local(*pos);
            ops.push(Op::PickAt { x, y, commit: true });
            s.picking = false;
            s.swallow_release = true;
            false
        }
        egui::Event::PointerButton { button: egui::PointerButton::Primary, pressed: false, .. } if s.swallow_release => {
            s.swallow_release = false;
            false
        }
        egui::Event::Key { key: egui::Key::Escape, pressed: true, .. } if s.picking => {
            s.picking = false;
            ops.push(Op::Highlight(None));
            false
        }
        _ => true,
    });
    ops
}

/// Draw a DOM.getBoxModel model over the page area the way Chrome colours it:
/// margin orange, border yellow, padding green, content blue. Quads are in
/// viewport CSS pixels, which are points in this window.
pub fn paint_highlight(painter: &egui::Painter, rect: egui::Rect, model: &Value) {
    let quad = |k: &str| -> Option<egui::Rect> {
        let q: Vec<f32> = model[k].as_array()?.iter().filter_map(|v| v.as_f64().map(|n| n as f32)).collect();
        if q.len() < 8 {
            return None;
        }
        let xs = [q[0], q[2], q[4], q[6]];
        let ys = [q[1], q[3], q[5], q[7]];
        let min = egui::pos2(xs.iter().cloned().fold(f32::INFINITY, f32::min), ys.iter().cloned().fold(f32::INFINITY, f32::min));
        let max = egui::pos2(xs.iter().cloned().fold(f32::NEG_INFINITY, f32::max), ys.iter().cloned().fold(f32::NEG_INFINITY, f32::max));
        Some(egui::Rect::from_min_max(min, max).translate(rect.min.to_vec2()))
    };
    let (Some(content), Some(padding), Some(border), Some(margin)) =
        (quad("content"), quad("padding"), quad("border"), quad("margin"))
    else {
        return;
    };
    let painter = painter.with_clip_rect(rect);
    let c = egui::Color32::from_rgba_unmultiplied;
    ring(&painter, margin, border, c(246, 178, 107, 102));
    ring(&painter, border, padding, c(255, 229, 153, 102));
    ring(&painter, padding, content, c(147, 196, 125, 102));
    painter.rect_filled(content, 0.0, c(111, 168, 220, 110));
}

/// Fill the band between an outer box and the inner box it contains.
fn ring(painter: &egui::Painter, outer: egui::Rect, inner: egui::Rect, color: egui::Color32) {
    let inner = inner.intersect(outer);
    let bands = [
        egui::Rect::from_min_max(outer.min, egui::pos2(outer.max.x, inner.min.y)),
        egui::Rect::from_min_max(egui::pos2(outer.min.x, inner.max.y), outer.max),
        egui::Rect::from_min_max(egui::pos2(outer.min.x, inner.min.y), egui::pos2(inner.min.x, inner.max.y)),
        egui::Rect::from_min_max(egui::pos2(inner.max.x, inner.min.y), egui::pos2(outer.max.x, inner.max.y)),
    ];
    for b in bands {
        if b.width() > 0.0 && b.height() > 0.0 {
            painter.rect_filled(b, 0.0, color);
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
    ui.weak(tf("{0} requests", &[&s.net.len()]));
    egui::ScrollArea::both().id_salt("network").auto_shrink([false, false]).show(ui, |ui| {
        egui::Grid::new("net").striped(true).num_columns(4).show(ui, |ui| {
            ui.strong(t("Status"));
            ui.strong(t("Method"));
            ui.strong(t("Type"));
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
