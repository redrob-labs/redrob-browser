//! The tab strip, as Chrome's: tabs share the width up to 220pt each, the
//! active one joins the toolbar below it; tab groups show as a colored
//! chip before their tabs, with a line under them, and collapse to the
//! chip. Tabs and groups are dragged within the strip here; out of it and
//! into other windows' strips the browser runs the drag (browser.rs).

use egui::{Color32, CornerRadius, Rect, Sense, Stroke, Vec2};

use crate::browser::{DragItem, DragStart, StripLayout};
use crate::i18n::t;
use crate::model::{GroupColor, GroupId};
use crate::theme::{self, size, Icon};
use crate::{internal, popup, Window, NEW_TAB};

/// Where the first tab starts: macOS draws its traffic lights over the
/// strip's left end.
pub const TAB_STRIP_LEFT: f32 = if cfg!(target_os = "macos") {
    76.0
} else {
    size::SPACE_2
};

/// How far below the strip's top the tabs start.
pub const TAB_TOP: f32 = 6.0;

/// The strip's height.
const HEIGHT: f32 = 40.0;

/// Room between a group's chip and what is next to it.
const CHIP_GAP: f32 = 4.0;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
enum Item {
    Chip(GroupId),
    Tab(usize),
}

/// What a click in the strip asks for, done after drawing it.
#[derive(Default)]
struct Act {
    select: Option<usize>,
    close: Option<usize>,
    move_out: Option<usize>,
    new_tab_right: Option<usize>,
    new_group: Option<usize>,
    add_to_group: Option<(usize, GroupId)>,
    remove_from_group: Option<usize>,
    toggle: Option<GroupId>,
    rename: Option<GroupId>,
    recolor: Option<(GroupId, GroupColor)>,
    ungroup: Option<GroupId>,
    close_group: Option<GroupId>,
    group_new_tab: Option<GroupId>,
    group_out: Option<GroupId>,
    new_tab: bool,
}

/// The group's color in this theme.
pub fn group_color(color: GroupColor, dark: bool) -> Color32 {
    let [r, g, b] = color.rgb(dark);
    Color32::from_rgb(r, g, b)
}

/// The text on a group's chip.
fn chip_ink(dark: bool) -> Color32 {
    if dark {
        Color32::from_rgb(0x20, 0x21, 0x24)
    } else {
        Color32::WHITE
    }
}

fn group_name(title: &str) -> &str {
    if title.is_empty() {
        t("Unnamed group")
    } else {
        title
    }
}

impl Window {
    pub(super) fn tab_bar(&mut self, ui: &mut egui::Ui) {
        let p = *theme::palette(ui);
        let dark = ui.visuals().dark_mode;
        // The strip is the title bar: drag it to move the window, double-click to maximize.
        let (strip, drag) = ui.allocate_exact_size(
            Vec2::new(ui.available_width(), HEIGHT),
            Sense::click_and_drag(),
        );
        let strip_fill = if self.incognito {
            p.surface_raised
        } else {
            p.surface_sunken
        };
        ui.painter().rect_filled(strip, 0.0, strip_fill);
        if drag.drag_started_by(egui::PointerButton::Primary) {
            ui.ctx().send_viewport_cmd(egui::ViewportCommand::StartDrag);
        }
        let maximized = ui.ctx().input(|i| i.viewport().maximized.unwrap_or(false));
        if drag.double_clicked() {
            ui.ctx()
                .send_viewport_cmd(egui::ViewportCommand::Maximized(!maximized));
        }
        let plus_side = 28.0;
        let captions = if cfg!(target_os = "macos") {
            0.0
        } else {
            self.caption_buttons(ui, strip, maximized)
        };
        let badge = if self.incognito {
            self.incognito_badge(ui, strip, captions)
        } else {
            0.0
        };
        let full = strip;
        let strip = Rect::from_min_max(
            strip.min,
            egui::pos2(strip.right() - captions - badge, strip.bottom()),
        );
        let left = strip.left() + TAB_STRIP_LEFT;
        let top = strip.top() + TAB_TOP;
        let count = self.model.tabs.len();

        // What shows, in order: each group's chip before its tabs, and the
        // tabs not hidden in a collapsed group.
        let mut items = Vec::new();
        let mut prev = None;
        for (i, tab) in self.model.tabs.iter().enumerate() {
            if tab.group.is_some() && tab.group != prev {
                if let Some(g) = tab.group {
                    items.push(Item::Chip(g));
                }
            }
            prev = tab.group;
            if self.model.tab_shown(i) {
                items.push(Item::Tab(i));
            }
        }
        let font = egui::FontId::proportional(12.5);
        let chip_width = |ui: &egui::Ui, g: GroupId, renaming: bool| -> f32 {
            if renaming {
                return 140.0;
            }
            let title = self.model.group(g).map(|g| g.title.as_str()).unwrap_or("");
            if title.is_empty() {
                return 22.0;
            }
            let w = ui
                .painter()
                .layout_no_wrap(theme::elide(title, 24), font.clone(), p.ink_primary)
                .size()
                .x;
            w + 20.0
        };
        let renaming = self.renaming.as_ref().map(|(g, _)| *g);
        let widths: Vec<f32> = items
            .iter()
            .map(|it| match it {
                Item::Chip(g) => chip_width(ui, *g, renaming == Some(*g)) + CHIP_GAP,
                Item::Tab(_) => 0.0,
            })
            .collect();
        let chips: f32 = widths.iter().sum();
        let shown_tabs = items.iter().filter(|i| matches!(i, Item::Tab(_))).count();
        let room =
            (strip.width() - TAB_STRIP_LEFT - size::SPACE_2 - plus_side - size::SPACE_1 - chips)
                .max(0.0);
        let width = (room / shown_tabs.max(1) as f32).clamp(48.0, 220.0);
        let item_width = |k: usize| match items[k] {
            Item::Chip(_) => widths[k],
            Item::Tab(_) => width,
        };
        // Each item's place at rest.
        let mut rest = Vec::with_capacity(items.len());
        let mut x = left;
        for k in 0..items.len() {
            rest.push(x);
            x += item_width(k);
        }
        let end = x;

        // A drag in this strip: the item under the pointer, one step at a
        // time towards it.
        let view = self.drag_view.filter(|v| match v.item {
            DragItem::Tab(id) => self.model.index_of(id).is_some(),
            DragItem::Group(g) => self.model.group(g).is_some(),
        });
        let dragged_items: Vec<usize> = match view.map(|v| v.item) {
            Some(DragItem::Tab(id)) => {
                let i = self.model.index_of(id);
                items
                    .iter()
                    .position(|it| Some(*it) == i.map(Item::Tab))
                    .into_iter()
                    .collect()
            }
            Some(DragItem::Group(g)) => items
                .iter()
                .enumerate()
                .filter(|(_, it)| match it {
                    Item::Chip(c) => *c == g,
                    Item::Tab(i) => self.model.tabs[*i].group == Some(g),
                })
                .map(|(k, _)| k)
                .collect(),
            None => Vec::new(),
        };
        // Where the dragged item(s) draw: from the pointer, kept in the strip.
        let drag_x = view.and_then(|v| {
            let first = *dragged_items.first()?;
            let span: f32 = dragged_items.iter().map(|k| item_width(*k)).sum();
            let x = (v.x - v.grab).clamp(left, (end - span).max(left));
            Some((first, x, span))
        });
        if let (Some(v), Some((first, _, span))) = (view, drag_x) {
            // Steps follow the pointer itself: at the strip's ends the item
            // stops, but what it is pulled past still moves.
            let x = v.x - v.grab;
            self.drag_step(&items, &rest, &dragged_items, first, x, span, width, v.item);
        }

        // The strip as drawn, for drops from other windows.
        let dragged_set: Vec<usize> = dragged_items.clone();
        self.strip_layout = StripLayout {
            rect: Rect::from_min_max(full.min, egui::pos2(strip.right(), full.bottom())),
            left: TAB_STRIP_LEFT,
            slots: items
                .iter()
                .enumerate()
                .filter(|(k, _)| !dragged_set.contains(k))
                .map(|(k, it)| {
                    let c = rest[k] + item_width(k) / 2.0;
                    let idx = match it {
                        Item::Tab(i) => *i,
                        Item::Chip(g) => self.model.group_range(*g).map_or(0, |r| r.start),
                    };
                    (c, idx)
                })
                .collect(),
        };

        let mut act = Act::default();
        // Draw the dragged items last, over what they slide across.
        let mut order: Vec<usize> = (0..items.len())
            .filter(|k| !dragged_items.contains(k))
            .collect();
        order.extend(dragged_items.iter().copied());
        let groups_here: Vec<(GroupId, String, GroupColor)> = self
            .model
            .groups
            .iter()
            .map(|g| (g.id, g.title.clone(), g.color))
            .collect();
        for k in order {
            let item = items[k];
            let id = ui.id().with(match item {
                Item::Chip(g) => ("chip", g),
                Item::Tab(i) => ("tab", self.model.tabs[i].id),
            });
            let target_x = match drag_x {
                Some((first, x, _)) if dragged_items.contains(&k) => {
                    let offset: f32 = dragged_items
                        .iter()
                        .take_while(|j| **j != k)
                        .map(|j| item_width(*j))
                        .sum();
                    let _ = first;
                    ui.ctx()
                        .animate_value_with_time(id.with("x"), x + offset, 0.0)
                }
                _ => ui
                    .ctx()
                    .animate_value_with_time(id.with("x"), rest[k], 0.12),
            };
            if target_x > strip.right() - plus_side {
                continue;
            }
            match item {
                Item::Chip(g) => {
                    let w = item_width(k) - CHIP_GAP;
                    let rect = Rect::from_min_size(
                        egui::pos2(target_x, top + 4.0),
                        Vec2::new(w, strip.bottom() - top - 10.0),
                    );
                    self.chip(ui, id, rect, g, dark, &mut act);
                }
                Item::Tab(i) => {
                    let rect = Rect::from_min_size(
                        egui::pos2(target_x, top),
                        Vec2::new(width, strip.bottom() - top),
                    );
                    self.tab(ui, id, rect, i, count, dark, &groups_here, &mut act);
                }
            }
        }
        let plus_x = (end + size::SPACE_1).min(strip.right() - plus_side - size::SPACE_1);
        let plus_rect = Rect::from_min_size(
            egui::pos2(plus_x, strip.center().y - plus_side / 2.0 + 3.0),
            Vec2::splat(plus_side),
        );
        let mut plus_ui = ui.new_child(egui::UiBuilder::new().max_rect(plus_rect));
        act.new_tab =
            theme::icon_button_sized(&mut plus_ui, Icon::Plus, t("New tab"), plus_side, true)
                .clicked();
        self.strip_act(act);
    }

    /// One step of the dragged tab or group towards where the pointer has
    /// it: past a neighbor's middle it swaps with it; at a group's edge it
    /// joins or leaves the group first (Chrome's rules).
    #[allow(clippy::too_many_arguments)]
    fn drag_step(
        &mut self,
        items: &[Item],
        rest: &[f32],
        dragged: &[usize],
        first: usize,
        x: f32,
        span: f32,
        width: f32,
        what: DragItem,
    ) {
        let last = *dragged.last().unwrap_or(&first);
        let center = x + span / 2.0;
        let mid = |k: usize| {
            let w = match items[k] {
                Item::Tab(_) => width,
                Item::Chip(_) => rest.get(k + 1).copied().unwrap_or(rest[k] + 22.0) - rest[k],
            };
            rest[k] + w / 2.0
        };
        let right_of = |k: usize| rest.get(k + 1).copied().unwrap_or(rest[k] + width);
        match what {
            DragItem::Tab(id) => {
                let Some(i) = self.model.index_of(id) else {
                    return;
                };
                let own = self.model.tabs[i].group;
                let prev = first.checked_sub(1).map(|k| items[k]);
                let next = items.get(first + 1).copied();
                if let Some(pk) = first.checked_sub(1) {
                    match prev {
                        Some(Item::Tab(j)) => {
                            let gl = self.model.tabs[j].group;
                            if gl == own && center < mid(pk) {
                                self.model.move_tab(i, j);
                                return;
                            }
                            if gl != own && own.is_none() && center < right_of(pk) {
                                // Into the group on its left, at its end.
                                self.model.tabs[i].group = gl;
                                return;
                            }
                        }
                        Some(Item::Chip(g)) if center < mid(pk) => {
                            if own == Some(g) {
                                // Out of its group, before the chip.
                                self.model.tabs[i].group = None;
                                self.model.prune_groups();
                                return;
                            }
                            // Past a collapsed group, before it.
                            if let Some(r) = self.model.group_range(g) {
                                self.model.move_tab(i, r.start);
                            }
                            return;
                        }
                        _ => {}
                    }
                }
                if let Some(nk) = Some(first + 1).filter(|k| *k < items.len()) {
                    match next {
                        Some(Item::Tab(j)) => {
                            let gr = self.model.tabs[j].group;
                            if gr == own && center > mid(nk) {
                                self.model.move_tab(i, j);
                                return;
                            }
                            if gr != own && own.is_some() && center > right_of(first) {
                                // Out of its group at its end.
                                self.model.tabs[i].group = None;
                                self.model.prune_groups();
                                return;
                            }
                        }
                        Some(Item::Chip(g)) => {
                            if own.is_some() && center > right_of(first) {
                                self.model.tabs[i].group = None;
                                self.model.prune_groups();
                                return;
                            }
                            if own.is_none() && center > mid(nk) {
                                let collapsed = self.model.group(g).is_some_and(|x| x.collapsed);
                                if collapsed {
                                    // Past a collapsed group, after it.
                                    if let Some(r) = self.model.group_range(g) {
                                        self.model.move_tab(i, r.end - 1);
                                    }
                                } else {
                                    // Into the group, as its first tab.
                                    self.model.tabs[i].group = Some(g);
                                }
                                return;
                            }
                        }
                        None => {}
                    }
                } else if own.is_some() && center > right_of(first) {
                    // The group's last tab, pulled past the strip's end.
                    self.model.tabs[i].group = None;
                    self.model.prune_groups();
                }
            }
            DragItem::Group(g) => {
                let Some(r) = self.model.group_range(g) else {
                    return;
                };
                let len = r.len();
                // The neighboring unit: an ungrouped tab, or a whole group.
                let unit_at = |k: usize| -> Option<(usize, usize, f32, f32)> {
                    // (first strip index, end strip index, left x, right x)
                    match items[k] {
                        Item::Tab(j) => match self.model.tabs[j].group {
                            None => Some((j, j + 1, rest[k], rest[k] + width)),
                            Some(h) => {
                                let r = self.model.group_range(h)?;
                                let ks: Vec<usize> = (0..items.len())
                                    .filter(|q| match items[*q] {
                                        Item::Chip(c) => c == h,
                                        Item::Tab(t) => self.model.tabs[t].group == Some(h),
                                    })
                                    .collect();
                                let l = rest[*ks.first()?];
                                let rr = right_of(*ks.last()?);
                                Some((r.start, r.end, l, rr))
                            }
                        },
                        Item::Chip(h) => {
                            let r = self.model.group_range(h)?;
                            let ks: Vec<usize> = (0..items.len())
                                .filter(|q| match items[*q] {
                                    Item::Chip(c) => c == h,
                                    Item::Tab(t) => self.model.tabs[t].group == Some(h),
                                })
                                .collect();
                            let l = rest[*ks.first()?];
                            let rr = right_of(*ks.last()?);
                            Some((r.start, r.end, l, rr))
                        }
                    }
                };
                // A group is wider than what it passes: its leading edge
                // past the neighbor's middle moves it.
                if let Some((s, _, l, rr)) = first.checked_sub(1).and_then(unit_at) {
                    if x < (l + rr) / 2.0 {
                        self.model.move_group(g, s);
                        return;
                    }
                }
                if let Some((_, e, l, rr)) = Some(last + 1)
                    .filter(|k| *k < items.len())
                    .and_then(unit_at)
                {
                    if x + span > (l + rr) / 2.0 {
                        self.model.move_group(g, e - len);
                    }
                }
            }
        }
    }

    /// A group's chip: click to collapse or expand, drag to move the group,
    /// right-click for its editor.
    fn chip(
        &mut self,
        ui: &mut egui::Ui,
        id: egui::Id,
        rect: Rect,
        g: GroupId,
        dark: bool,
        act: &mut Act,
    ) {
        let Some(group) = self.model.group(g).cloned() else {
            return;
        };
        let fill = group_color(group.color, dark);
        let ink = chip_ink(dark);
        if let Some(mut text) = self
            .renaming
            .as_ref()
            .filter(|(rg, _)| *rg == g)
            .map(|(_, s)| s.clone())
        {
            ui.painter()
                .rect_filled(rect, CornerRadius::same(size::RADIUS_SM), fill);
            let edit_id = id.with("rename");
            let mut child =
                ui.new_child(egui::UiBuilder::new().max_rect(rect.shrink2(Vec2::new(6.0, 2.0))));
            let r = child.add(
                egui::TextEdit::singleline(&mut text)
                    .id(edit_id)
                    .hint_text(t("Name this group"))
                    .frame(egui::Frame::NONE)
                    .text_color(ink)
                    .desired_width(rect.width() - 12.0),
            );
            if !r.has_focus() && !r.lost_focus() {
                r.request_focus();
            }
            let done = r.lost_focus() || ui.ctx().input(|i| i.key_pressed(egui::Key::Enter));
            if done {
                let title = text.trim().to_string();
                if let Some(x) = self.model.group_mut(g) {
                    x.title = title;
                }
                self.renaming = None;
                self.session_dirty = true;
            } else {
                self.renaming = Some((g, text));
            }
            return;
        }
        let r = ui.interact(rect, id, Sense::click_and_drag());
        if r.drag_started_by(egui::PointerButton::Primary) {
            // Where the press was, not where the drag was noticed.
            let at = ui.input(|i| i.pointer.press_origin());
            let grab = at
                .or(r.interact_pointer_pos())
                .map_or(Vec2::ZERO, |p| p - rect.min)
                + Vec2::new(0.0, 4.0);
            self.drag_start = Some(DragStart {
                item: DragItem::Group(g),
                grab,
            });
        }
        let shade = if r.hovered() { 0.85 } else { 1.0 };
        ui.painter().rect_filled(
            rect,
            CornerRadius::same(size::RADIUS_SM),
            fill.gamma_multiply(shade),
        );
        if group.title.is_empty() {
            ui.painter()
                .circle_filled(rect.center(), 5.0, ink.gamma_multiply(0.9));
        } else {
            ui.painter().text(
                egui::pos2(rect.left() + 10.0, rect.center().y),
                egui::Align2::LEFT_CENTER,
                theme::elide(&group.title, 24),
                egui::FontId::proportional(12.5),
                ink,
            );
        }
        let tip = if group.collapsed {
            t("Expand group")
        } else {
            t("Collapse group")
        };
        let r = popup::tip(r, tip);
        if r.clicked() {
            act.toggle = Some(g);
        }
        popup::context_menu(&r, |ui| {
            ui.horizontal_wrapped(|ui| {
                ui.spacing_mut().item_spacing.x = 4.0;
                for c in GroupColor::ALL {
                    let (cr, cresp) = ui.allocate_exact_size(Vec2::splat(22.0), Sense::click());
                    let col = group_color(c, dark);
                    ui.painter().circle_filled(cr.center(), 9.0, col);
                    if c == group.color {
                        ui.painter().circle_stroke(
                            cr.center(),
                            10.5,
                            Stroke::new(1.5, ui.visuals().text_color()),
                        );
                    }
                    if popup::tip(cresp, t(c.name())).clicked() {
                        act.recolor = Some((g, c));
                    }
                }
            });
            ui.separator();
            if ui.button(t("Name group")).clicked() {
                act.rename = Some(g);
                ui.close();
            }
            if ui.button(t("New tab in group")).clicked() {
                act.group_new_tab = Some(g);
                ui.close();
            }
            if ui.button(t("Ungroup")).clicked() {
                act.ungroup = Some(g);
                ui.close();
            }
            if ui.button(t("Close group")).clicked() {
                act.close_group = Some(g);
                ui.close();
            }
            let all = self
                .model
                .group_range(g)
                .is_some_and(|r| r.len() == self.model.tabs.len());
            if ui
                .add_enabled(!all, egui::Button::new(t("Move group to new window")))
                .clicked()
            {
                act.group_out = Some(g);
                ui.close();
            }
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn tab(
        &mut self,
        ui: &mut egui::Ui,
        id: egui::Id,
        rect: Rect,
        i: usize,
        count: usize,
        dark: bool,
        groups: &[(GroupId, String, GroupColor)],
        act: &mut Act,
    ) {
        let p = *theme::palette(ui);
        let tab = &self.model.tabs[i];
        let tab_id = tab.id;
        let group = tab.group;
        let (loading, agent, url) = (tab.loading, tab.agent, tab.url.clone());
        let mut label = tab.label().to_string();
        if label.is_empty() {
            label = t("New tab").to_string();
        }
        // Every window is on the one relay, so agent tabs move too.
        let detachable = count > 1;
        let r = ui.interact(rect, id, Sense::click_and_drag());
        if r.drag_started_by(egui::PointerButton::Primary) {
            // Where the press was, not where the drag was noticed.
            let at = ui.input(|i| i.pointer.press_origin());
            let grab = at
                .or(r.interact_pointer_pos())
                .map_or(Vec2::ZERO, |q| q - rect.min);
            self.drag_start = Some(DragStart {
                item: DragItem::Tab(tab_id),
                grab,
            });
            act.select = Some(i);
        }
        let active = i == self.model.active;
        let painter = ui.painter_at(rect.expand2(Vec2::new(8.0, 0.0)));
        let top_round = CornerRadius {
            nw: size::RADIUS_MD,
            ne: size::RADIUS_MD,
            sw: 0,
            se: 0,
        };
        if active {
            painter.rect_filled(rect, top_round, p.surface_base);
        } else if r.hovered() {
            painter.rect_filled(
                rect.shrink2(Vec2::new(2.0, 3.0)),
                CornerRadius::same(size::RADIUS_SM),
                p.surface_raised,
            );
        } else if i + 1 != self.model.active && i + 1 < self.model.tabs.len() {
            painter.vline(
                rect.right(),
                rect.y_range().shrink(9.0),
                Stroke::new(1.0, p.border_subtle),
            );
        }
        // A grouped tab has its group's color along its bottom, as in Chrome.
        if let Some(c) = group.and_then(|g| self.model.group(g)).map(|g| g.color) {
            let line = Rect::from_min_max(
                egui::pos2(rect.left() + 2.0, rect.bottom() - 3.0),
                egui::pos2(rect.right() - 2.0, rect.bottom() - 1.0),
            );
            painter.rect_filled(line, CornerRadius::same(1), group_color(c, dark));
        }
        // Icon: a spinner while loading, the sparkle for agent tabs, else a globe.
        let icon_rect = Rect::from_center_size(
            egui::pos2(rect.left() + 18.0, rect.center().y),
            Vec2::splat(16.0),
        );
        if loading {
            egui::Spinner::new()
                .size(14.0)
                .color(p.ink_brand)
                .paint_at(ui, icon_rect);
        } else if agent {
            Icon::Sparkle.paint(ui, icon_rect, p.ink_brand);
        } else if internal::is_internal(&url) || url == NEW_TAB {
            Icon::Sparkle.paint(ui, icon_rect, p.ink_secondary);
        } else {
            Icon::Globe.paint(ui, icon_rect, p.ink_muted);
        }
        let show_close = active || r.hovered();
        let close_rect = Rect::from_center_size(
            egui::pos2(rect.right() - 16.0, rect.center().y),
            Vec2::splat(20.0),
        );
        let text_left = icon_rect.right() + 8.0;
        let text_right = if show_close {
            close_rect.left() - 4.0
        } else {
            rect.right() - 10.0
        };
        if text_right - text_left > 12.0 {
            let ink = if active {
                p.ink_primary
            } else {
                p.ink_secondary
            };
            let galley =
                ui.painter()
                    .layout(label, egui::FontId::proportional(12.5), ink, f32::INFINITY);
            let clip = Rect::from_x_y_ranges(text_left..=text_right, rect.y_range());
            let tp = ui.painter_at(clip);
            tp.galley(
                egui::pos2(text_left, rect.center().y - galley.size().y / 2.0),
                galley.clone(),
                ink,
            );
            if galley.size().x > clip.width() {
                // Fade the cut end into the tab instead of an ellipsis.
                let bg = if active {
                    p.surface_base
                } else if r.hovered() {
                    p.surface_raised
                } else {
                    p.surface_sunken
                };
                let fade = Rect::from_x_y_ranges(
                    (text_right - 18.0)..=text_right,
                    rect.y_range().shrink(6.0),
                );
                let mut mesh = egui::Mesh::default();
                mesh.colored_vertex(fade.left_top(), bg.gamma_multiply(0.0));
                mesh.colored_vertex(fade.right_top(), bg);
                mesh.colored_vertex(fade.right_bottom(), bg);
                mesh.colored_vertex(fade.left_bottom(), bg.gamma_multiply(0.0));
                mesh.add_triangle(0, 1, 2);
                mesh.add_triangle(0, 2, 3);
                tp.add(mesh);
            }
        }
        if show_close {
            let cr = ui.interact(close_rect, id.with("close"), Sense::click());
            if cr.hovered() {
                painter.rect_filled(
                    close_rect,
                    CornerRadius::same(size::RADIUS_XS),
                    p.border_subtle,
                );
            }
            Icon::Close.paint(
                ui,
                close_rect.shrink(4.0),
                if cr.hovered() {
                    p.ink_primary
                } else {
                    p.ink_secondary
                },
            );
            if popup::tip(cr, t("Close tab")).clicked() {
                act.close = Some(i);
            }
        }
        let r = popup::tip(r, &url);
        if r.clicked() {
            act.select = Some(i);
        }
        if r.middle_clicked() {
            act.close = Some(i);
        }
        popup::context_menu(&r, |ui| {
            if ui.button(t("New tab to the right")).clicked() {
                act.new_tab_right = Some(i);
                ui.close();
            }
            ui.separator();
            if groups.iter().all(|(g, ..)| Some(*g) == group) {
                if ui.button(t("Add tab to new group")).clicked() {
                    act.new_group = Some(i);
                    ui.close();
                }
            } else {
                popup::submenu(ui, t("Add tab to group"), |ui| {
                    if ui.button(t("New group")).clicked() {
                        act.new_group = Some(i);
                        ui.close();
                    }
                    for (g, title, color) in groups {
                        if Some(*g) == group {
                            continue;
                        }
                        let r = ui
                            .horizontal(|ui| {
                                // A dot in the group's color, then its name.
                                let (dot, _) =
                                    ui.allocate_exact_size(Vec2::new(14.0, 26.0), Sense::hover());
                                ui.painter().circle_filled(
                                    dot.center(),
                                    5.0,
                                    group_color(*color, dark),
                                );
                                ui.add(
                                    egui::Button::new(group_name(title))
                                        .frame(false)
                                        .min_size(Vec2::new(ui.available_width(), 26.0)),
                                )
                            })
                            .inner;
                        if r.clicked() {
                            act.add_to_group = Some((i, *g));
                            ui.close();
                        }
                    }
                });
            }
            if group.is_some() && ui.button(t("Remove from group")).clicked() {
                act.remove_from_group = Some(i);
                ui.close();
            }
            ui.separator();
            if ui
                .add_enabled(detachable, egui::Button::new(t("Move to new window")))
                .clicked()
            {
                act.move_out = Some(i);
                ui.close();
            }
            if ui.button(t("Close tab")).clicked() {
                act.close = Some(i);
                ui.close();
            }
        });
    }

    fn strip_act(&mut self, a: Act) {
        if let Some(i) = a.move_out {
            self.move_to_new_window(i, None);
        } else if a.new_tab {
            self.open_tab(NEW_TAB, true);
        } else if let Some(i) = a.close {
            self.close_tab(i);
        } else if let Some(i) = a.select {
            self.select_tab(i);
        }
        if let Some(i) = a.new_tab_right {
            self.model.active = i;
            self.open_tab(NEW_TAB, true);
        }
        if let Some(i) = a.new_group {
            if let Some(g) = self.model.new_group(&[i]) {
                // Chrome opens the new group's editor: name it right away.
                self.renaming = Some((g, String::new()));
                self.take_keyboard = true;
            }
            self.session_dirty = true;
        }
        if let Some((i, g)) = a.add_to_group {
            self.model.add_to_group(i, g);
            if let Some(x) = self.model.group_mut(g) {
                x.collapsed = false;
            }
            self.session_dirty = true;
        }
        if let Some(i) = a.remove_from_group {
            self.model.remove_from_group(i);
            self.session_dirty = true;
        }
        if let Some(g) = a.toggle {
            self.toggle_group(g);
        }
        if let Some(g) = a.rename {
            let title = self
                .model
                .group(g)
                .map(|x| x.title.clone())
                .unwrap_or_default();
            self.renaming = Some((g, title));
            self.take_keyboard = true;
        }
        if let Some((g, c)) = a.recolor {
            if let Some(x) = self.model.group_mut(g) {
                x.color = c;
            }
            self.session_dirty = true;
        }
        if let Some(g) = a.ungroup {
            self.model.ungroup(g);
            self.session_dirty = true;
        }
        if let Some(g) = a.close_group {
            self.close_group(g);
        }
        if let Some(g) = a.group_new_tab {
            if let Some(r) = self.model.group_range(g) {
                // After the group's last tab, which it then joins.
                self.model.active = r.end - 1;
                self.open_tab(NEW_TAB, true);
            }
        }
        if let Some(g) = a.group_out {
            self.move_group_to_new_window(g);
        }
    }
}
