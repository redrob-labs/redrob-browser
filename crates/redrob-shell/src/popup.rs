//! What the window shows over the page area: menus, the address bar's
//! suggestions, the page's context menu, tooltips, the link status bubble
//! and the tab being dragged out.
//!
//! The page is a native child window (docs/CEF.md), so nothing egui paints
//! in the window can cover it. As in Chrome, each of these is a small window
//! of its own: an egui viewport without a frame, above the browser window,
//! which on X11 the window manager does not manage (override-redirect) and
//! so never takes the keyboard from the window or the page.

use egui::{Context, Id, Pos2, Rect, Response, Ui, UiBuilder, Vec2, ViewportBuilder, ViewportId};

/// Where the window's inner area starts on screen, in points.
pub fn screen_origin(ctx: &Context) -> Pos2 {
    ctx.input(|i| i.viewport().inner_rect)
        .map_or(Pos2::ZERO, |r| r.min)
}

/// A point of this window's area, on screen.
pub fn to_screen(ctx: &Context, p: Pos2) -> Pos2 {
    p + screen_origin(ctx).to_vec2()
}

/// Show `add` in a popup window with its top-left at `at` (on screen, in
/// points), sized to what it draws, at most `max_width` wide.
/// `passthrough`: clicks go through it (tooltips, bubbles).
pub fn show<R>(
    ctx: &Context,
    id: Id,
    at: Pos2,
    max_width: f32,
    passthrough: bool,
    add: impl FnOnce(&mut Ui) -> R,
) -> R {
    let size_id = id.with("size");
    let size: Vec2 = ctx
        .data(|d| d.get_temp(size_id))
        .unwrap_or(Vec2::new(max_width.min(200.0), 24.0));
    let builder = ViewportBuilder::default()
        .with_title("Redrob Browser")
        .with_decorations(false)
        .with_resizable(false)
        .with_taskbar(false)
        .with_active(false)
        .with_always_on_top()
        .with_override_redirect(true)
        .with_window_type(if passthrough {
            egui::X11WindowType::Tooltip
        } else {
            egui::X11WindowType::PopupMenu
        })
        .with_mouse_passthrough(passthrough)
        .with_position(at.round())
        .with_inner_size(size);
    let parent = ctx.viewport_id();
    let mut add = Some(add);
    ctx.show_viewport_immediate(ViewportId::from_hash_of(id), builder, |ui, _| {
        let room = Rect::from_min_size(Pos2::ZERO, Vec2::new(max_width, 4000.0));
        let mut child = ui.new_child(UiBuilder::new().max_rect(room));
        let frame = egui::Frame::popup(child.style())
            .shadow(egui::Shadow::NONE)
            .corner_radius(0);
        let r = frame.show(&mut child, |ui| add.take().map(|f| f(ui)));
        let used = r.response.rect.size().ceil();
        if (used - size).abs().max_elem() > 0.5 {
            ui.ctx().data_mut(|d| d.insert_temp(size_id, used));
            ui.ctx().request_repaint_of(parent);
        }
        r.inner
    })
    .expect("the popup's contents ran")
}

/// Which menu of this window is open: one at a time, as in Chrome.
fn open_id() -> Id {
    Id::new("redrob-open-menu")
}

fn is_open(ctx: &Context, id: Id) -> bool {
    ctx.data(|d| d.get_temp::<Id>(open_id())) == Some(id)
}

fn set_open(ctx: &Context, id: Option<Id>) {
    ctx.data_mut(|d| match id {
        Some(id) => {
            d.insert_temp(open_id(), id);
        }
        None => {
            d.remove::<Id>(open_id());
        }
    });
    ctx.data_mut(|d| d.remove::<Id>(Id::new("redrob-open-submenu")));
}

/// Close this window's open menu (a click elsewhere, Escape, the page took
/// the keyboard).
pub fn close_menus(ctx: &Context) {
    set_open(ctx, None);
}

/// Whether a menu of this window is open.
pub fn any_open(ctx: &Context) -> bool {
    ctx.data(|d| d.get_temp::<Id>(open_id())).is_some()
}

fn toggled_id() -> Id {
    Id::new("redrob-menu-toggled")
}

fn toggled(ctx: &Context) {
    ctx.data_mut(|d| d.insert_temp(toggled_id(), true));
}

/// Call last in the window's pass. A click in the window that opened no
/// menu closes the open one, and so does leaving for another program (no
/// window of this one has the keyboard, and the page does not either).
pub fn end_frame(ctx: &Context, page_focused: bool) {
    let toggled = ctx.data_mut(|d| d.remove_temp::<bool>(toggled_id()).unwrap_or(false));
    if !any_open(ctx) {
        return;
    }
    let clicked = ctx.input(|i| i.pointer.any_click());
    let ours_focused = ctx.input(|i| i.raw.viewports.values().any(|v| v.focused == Some(true)));
    // The keyboard moves between the page and the chrome asynchronously:
    // only a while without it counts as leaving.
    let since_id = Id::new("redrob-unfocused-since");
    let now = ctx.input(|i| i.time);
    let away = if ours_focused || page_focused {
        ctx.data_mut(|d| d.remove::<f64>(since_id));
        false
    } else {
        let since = ctx.data_mut(|d| *d.get_temp_mut_or_insert_with(since_id, || now));
        ctx.request_repaint_after(std::time::Duration::from_millis(300));
        now - since > 0.25
    };
    if (clicked && !toggled) || away {
        close_menus(ctx);
    }
}

/// Run `add` inside a Ui whose `ui.close()` closes the menu.
fn closable<R>(ctx: &Context, ui: &mut Ui, add: impl FnOnce(&mut Ui) -> R) -> R {
    let mut inner = ui.new_child(UiBuilder::new().closable());
    let r = add(&mut inner);
    if inner.should_close() {
        close_menus(ctx);
    }
    r
}

/// A menu under the button `r`, opened and closed by clicking it. `right`:
/// its right edge lines up with the button's (the toolbar's end).
pub fn menu(r: &Response, width: f32, right: bool, add: impl FnOnce(&mut Ui)) {
    let ctx = r.ctx.clone();
    let id = r.id.with("menu");
    if r.clicked() {
        set_open(&ctx, (!is_open(&ctx, id)).then_some(id));
        toggled(&ctx);
    }
    if !is_open(&ctx, id) {
        return;
    }
    let x = if right {
        r.rect.right() - width
    } else {
        r.rect.left()
    };
    let at = to_screen(&ctx, egui::pos2(x, r.rect.bottom() + 2.0));
    ctx.data_mut(|d| d.insert_temp(Id::new("redrob-menu-at"), at));
    let c = ctx.clone();
    show(&ctx, id, at, width, false, |ui| {
        ui.set_width(width - 12.0);
        closable(&c, ui, add)
    });
}

/// A right-click menu for `r`, at the pointer.
pub fn context_menu(r: &Response, add: impl FnOnce(&mut Ui)) {
    let ctx = r.ctx.clone();
    let id = r.id.with("context-menu");
    let at_id = id.with("at");
    if r.secondary_clicked() {
        let p = r.interact_pointer_pos().unwrap_or(r.rect.left_bottom());
        ctx.data_mut(|d| d.insert_temp(at_id, to_screen(&ctx, p)));
        set_open(&ctx, Some(id));
        toggled(&ctx);
    }
    if !is_open(&ctx, id) {
        return;
    }
    let at: Pos2 = ctx.data(|d| d.get_temp(at_id)).unwrap_or_default();
    let c = ctx.clone();
    show(&ctx, id, at, 260.0, false, |ui| {
        ui.set_min_width(180.0);
        closable(&c, ui, add)
    });
}

/// A menu at `at` (on screen) shown while `open`: the page's context menu,
/// whose opening Chromium reports. Returns what `add` returns.
pub fn menu_at<R>(ctx: &Context, id: Id, at: Pos2, add: impl FnOnce(&mut Ui) -> R) -> R {
    show(ctx, id, at, 280.0, false, |ui| {
        ui.set_min_width(200.0);
        add(ui)
    })
}

/// An item of a menu that opens `add` beside it while the pointer is on it
/// or in it.
pub fn submenu(ui: &mut Ui, label: &str, add: impl FnOnce(&mut Ui)) {
    let ctx = ui.ctx().clone();
    let sub_id = Id::new("redrob-open-submenu");
    let id = ui.id().with(("submenu", label));
    let r = ui.add(
        egui::Button::new(format!("{label}  ›"))
            .frame(false)
            .min_size(Vec2::new(ui.available_width(), 28.0)),
    );
    if r.hovered() || r.clicked() {
        ctx.data_mut(|d| d.insert_temp(sub_id, id));
    }
    if ctx.data(|d| d.get_temp::<Id>(sub_id)) != Some(id) {
        return;
    }
    // The menu's own window is where `ui` draws; its top-left on screen is
    // where the menu was put.
    let origin = ui
        .ctx()
        .input(|i| i.viewport().inner_rect.map(|r| r.min))
        .unwrap_or_default();
    let at = origin + r.rect.right_top().to_vec2() + Vec2::new(4.0, -6.0);
    let c = ctx.clone();
    // Shown from the menu's own pass: a window of its own beside it.
    show(&ctx, id, at, 320.0, false, |ui| {
        ui.set_min_width(200.0);
        closable(&c, ui, add)
    });
}

/// Hover text for `r` in a window of its own (it may reach over the page).
pub fn tip(r: Response, text: &str) -> Response {
    if text.is_empty() || !r.hovered() {
        return r;
    }
    let ctx = r.ctx.clone();
    let delay = 0.5;
    let still = ctx.input(|i| i.pointer.time_since_last_movement());
    if still < delay {
        ctx.request_repaint_after(std::time::Duration::from_secs_f32(delay - still + 0.02));
        return r;
    }
    let Some(p) = ctx.pointer_latest_pos() else {
        return r;
    };
    let at = to_screen(&ctx, p + Vec2::new(12.0, 18.0));
    show(&ctx, r.id.with("tip"), at, 420.0, true, |ui| {
        ui.label(text);
    });
    r
}

/// The link under the pointer, at the page area's bottom-left, as Chrome
/// shows it.
pub fn status(ctx: &Context, page: Rect, link: &str) {
    let text = crate::theme::elide(link, 120);
    let size_id = Id::new("redrob-status").with("size");
    let h: f32 = ctx
        .data(|d| d.get_temp::<Vec2>(size_id))
        .map_or(24.0, |s| s.y);
    let at = to_screen(ctx, egui::pos2(page.left(), page.bottom() - h));
    show(
        ctx,
        Id::new("redrob-status"),
        at,
        page.width() * 0.6,
        true,
        |ui| {
            ui.label(egui::RichText::new(text).size(12.0));
        },
    );
}

/// Something that follows the pointer (a tab dragged out of the strip).
pub fn ghost(ctx: &Context, id: Id, at: Pos2, add: impl FnOnce(&mut Ui)) {
    show(ctx, id, to_screen(ctx, at), 260.0, true, add);
}
