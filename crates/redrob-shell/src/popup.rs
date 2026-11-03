//! What the window shows over the page area: menus, the address bar's
//! suggestions, the page's context menu, tooltips and the link status
//! bubble. A tab dragged out of the strip is a window of its own that
//! follows the pointer (browser.rs).
//!
//! The page is a native child window (docs/CEF.md), so nothing egui paints
//! in the window can cover it. As in Chrome, each of these is a small window
//! of its own: an egui viewport without a frame, above the browser window,
//! which on X11 the window manager does not manage (override-redirect) and
//! so never takes the keyboard from the window or the page.
//!
//! Chrome keeps its omnibox popup and menu widgets alive, and so does the
//! window: one popup window per [`Slot`], made in the window's first
//! frames and kept off screen while nothing shows in it. Opening one then
//! moves a window that already has its GPU surface, instead of creating an
//! OS window and a swapchain on the first letter typed.

use crate::theme::{self, Icon};
use egui::{
    Context, Id, Pos2, Rect, Response, Sense, Ui, UiBuilder, Vec2, ViewportBuilder, ViewportId,
};

/// Where the window's inner area starts on screen, in points.
pub fn screen_origin(ctx: &Context) -> Pos2 {
    ctx.input(|i| i.viewport().inner_rect)
        .map_or(Pos2::ZERO, |r| r.min)
}

/// A point of this window's area, on screen.
pub fn to_screen(ctx: &Context, p: Pos2) -> Pos2 {
    p + screen_origin(ctx).to_vec2()
}

/// The popup windows of a browser window, one each. Those that cannot be
/// open together share one: menus (one open at a time), prompts.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub enum Slot {
    Suggestions,
    Menu,
    /// The side menu at this depth of the open menu (0 opens from the menu
    /// itself, 1 from that side menu, ...). The first two are kept made;
    /// deeper ones are made when a folder that deep opens.
    Side(u8),
    /// The page's context menu, which Chromium opens.
    PageMenu,
    /// A permission or "open with another app" prompt.
    Prompt,
    Tip,
    Status,
    /// The zoom level, for a moment after it changes.
    Badge,
}

impl Slot {
    /// In the order they are made: the address bar's first.
    const ALL: [Slot; 9] = [
        Slot::Suggestions,
        Slot::Menu,
        Slot::Tip,
        Slot::Side(0),
        Slot::Side(1),
        Slot::PageMenu,
        Slot::Status,
        Slot::Badge,
        Slot::Prompt,
    ];

    /// Clicks go through it (tooltips, bubbles).
    fn passthrough(self) -> bool {
        matches!(self, Slot::Tip | Slot::Status | Slot::Badge)
    }

    /// This slot's window for the browser window whose pass this is.
    fn viewport(self, ctx: &Context) -> ViewportId {
        ViewportId::from_hash_of(("redrob-popup", ctx.viewport_id(), self))
    }

    /// Everything about the window but its place and size: the same for
    /// every frame, as a change of most of it makes eframe recreate it.
    fn builder(self) -> ViewportBuilder {
        ViewportBuilder::default()
            .with_title("Redrob Browser")
            .with_decorations(false)
            .with_resizable(false)
            .with_taskbar(false)
            .with_active(false)
            .with_always_on_top()
            .with_override_redirect(true)
            .with_window_type(if self.passthrough() {
                egui::X11WindowType::Tooltip
            } else {
                egui::X11WindowType::PopupMenu
            })
            .with_mouse_passthrough(self.passthrough())
    }
}

/// Off screen rather than hidden: showing a window on Windows and macOS
/// gives it the keyboard.
const PARKED: Pos2 = egui::pos2(-30000.0, -30000.0);

/// What the window knows of one slot's window.
#[derive(Clone, Copy, Default)]
struct SlotState {
    /// The pass it last showed something in, and what (its id).
    shown: Option<(u64, Id)>,
    /// Passes it has shown that in a row.
    age: u32,
    /// What it shows now waits off screen until measured.
    measuring: bool,
    /// The window exists (made or shown once).
    made: bool,
    /// The size it was last given.
    size: Option<Vec2>,
    /// Passes left in which its parked window is asked to paint, so eframe
    /// makes its GPU surface before it is first needed.
    warm: u8,
}

fn state_id(ctx: &Context, slot: Slot) -> Id {
    Id::new(("redrob-popup-state", slot.viewport(ctx)))
}

fn state(ctx: &Context, slot: Slot) -> SlotState {
    let id = state_id(ctx, slot);
    ctx.data(|d| d.get_temp(id)).unwrap_or_default()
}

fn set_state(ctx: &Context, slot: Slot, s: SlotState) {
    let id = state_id(ctx, slot);
    ctx.data_mut(|d| d.insert_temp(id, s));
}

/// Where the popup being drawn has its top-left on screen (popups do not
/// nest, so there is one).
fn drawing_at_id() -> Id {
    Id::new("redrob-popup-drawing-at")
}

/// Show `add` in `slot`'s window with its top-left at `at` (on screen, in
/// points), sized to what it draws, at most `max_width` wide. `id` names
/// what it shows: its size is remembered by it.
pub fn show<R>(
    ctx: &Context,
    slot: Slot,
    id: Id,
    at: Pos2,
    max_width: f32,
    add: impl FnOnce(&mut Ui) -> R,
) -> R {
    let size_id = id.with("size");
    let known: Option<Vec2> = ctx.data(|d| d.get_temp(size_id));
    let pass = ctx.cumulative_pass_nr();
    let mut st = state(ctx, slot);
    // Shown last pass too (whatever it showed): it stays where it is, and
    // a change of size happens in place.
    let continued = st.shown.is_some_and(|(last, _)| last + 1 >= pass);
    let size = known
        .or(st.size.filter(|_| continued))
        .unwrap_or(Vec2::new(max_width.min(200.0), 24.0));
    // On the screen: moved left or up where it would leave it.
    let at = match ctx.input(|i| i.viewport().monitor_size) {
        Some(m) => egui::pos2(
            at.x.min(m.x - size.x).max(0.0),
            if at.y + size.y > m.y {
                (at.y - size.y).max(0.0)
            } else {
                at.y
            },
        ),
        None => at,
    };
    // Something not measured yet spends its first two frames off screen:
    // the first measures what it draws, the second draws it at that size.
    // Shown in place at once, it came up at a guessed size and grew a frame
    // later (eframe resizes a window after drawing it), its unpainted part
    // flashing over the page. Once measured, it opens in place.
    if continued {
        st.age = st
            .age
            .saturating_add(u32::from(st.shown.map(|s| s.0) != Some(pass)));
    } else {
        st.age = 0;
        st.measuring = known.is_none() || !st.made;
    }
    if st.measuring && st.age >= 2 {
        st.measuring = false;
    }
    st.shown = Some((pass, id));
    st.size = Some(size);
    st.made = true;
    set_state(ctx, slot, st);
    let at = if st.measuring {
        ctx.request_repaint();
        PARKED
    } else {
        at
    };
    let builder = slot
        .builder()
        .with_position(at.round())
        .with_inner_size(size);
    let parent = ctx.viewport_id();
    let mut add = Some(add);
    let started = std::time::Instant::now();
    ctx.data_mut(|d| d.insert_temp(drawing_at_id(), at));
    let mut drawn = 0.0;
    let r = ctx.show_viewport_immediate(slot.viewport(ctx), builder, |ui, _| {
        let t = std::time::Instant::now();
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
        drawn = t.elapsed().as_secs_f64() * 1000.0;
        r.inner
    });
    if crate::trace::on() {
        eprintln!(
            "redrob-browser: popup {slot:?} frame {}: {:.1} ms ({drawn:.1} ms laying out)",
            st.age,
            started.elapsed().as_secs_f64() * 1000.0
        );
    }
    r.expect("the popup's contents ran")
}

/// Call last in the window's pass: the slots that showed nothing this pass
/// keep their window, off screen. A slot's window is made the first time
/// through here, one per pass, so none is made while the person types.
fn park(ctx: &Context) {
    // Viewports drawn inside the window: nothing to keep.
    if ctx.embed_viewports() {
        return;
    }
    let pass = ctx.cumulative_pass_nr();
    let mut made_one = false;
    for slot in Slot::ALL {
        let mut st = state(ctx, slot);
        if st.shown.is_some_and(|(last, _)| last == pass) {
            continue;
        }
        if !st.made {
            if made_one {
                ctx.request_repaint();
                continue;
            }
            made_one = true;
            st.made = true;
            crate::cdp::trace(format_args!("popup {slot:?}: window made, parked"));
            st.warm = 3;
        }
        let viewport = slot.viewport(ctx);
        let mut builder = slot.builder().with_position(PARKED);
        if st.size.is_none() {
            // Small until it shows something: a parked window still
            // paints, and the first thing shown is measured anyway.
            builder = builder.with_inner_size(Vec2::new(240.0, 120.0));
        }
        ctx.show_viewport_deferred(viewport, builder, |_, _| {});
        if st.warm > 0 {
            st.warm -= 1;
            ctx.request_repaint_of(viewport);
            ctx.request_repaint();
        }
        set_state(ctx, slot, st);
    }
    // Then what they draw first: their icons.
    let warmed = Id::new("redrob-popup-icons-warm");
    if !made_one && !ctx.data(|d| d.get_temp::<bool>(warmed).unwrap_or(false)) {
        ctx.data_mut(|d| d.insert_temp(warmed, true));
        crate::trace::time("icons warmed", || Icon::warm(ctx));
        // And the letters of the sizes they write in, so the first row
        // drawn does not grow the font atlas glyph by glyph.
        crate::trace::time("glyphs warmed", || {
            let ascii: String = (' '..='~').collect();
            ctx.fonts_mut(|f| {
                for size in [12.0, 13.0, 14.0] {
                    let _ = f.layout_no_wrap(
                        ascii.clone(),
                        egui::FontId::proportional(size),
                        egui::Color32::WHITE,
                    );
                }
            });
        });
    }
}

/// Which menu of this window is open: one at a time, as in Chrome.
fn open_id() -> Id {
    Id::new("redrob-open-menu")
}

/// An open side menu: its key, its top-left past its parent's right edge,
/// and the parent's left edge (it opens there where the screen ends).
type Side = (Id, Pos2, f32);

/// The open side menus of the open menu, outermost first: the one at `i`
/// opened from a row of the one at `i - 1` (of the menu itself for 0).
fn side_id() -> Id {
    Id::new("redrob-open-side-menus")
}

fn sides(ctx: &Context) -> Vec<Side> {
    ctx.data(|d| d.get_temp::<Vec<Side>>(side_id()))
        .unwrap_or_default()
}

fn set_sides(ctx: &Context, s: Vec<Side>) {
    ctx.data_mut(|d| d.insert_temp(side_id(), s));
}

/// The depth of the menu being drawn: 0 for the menu, `i + 1` for the side
/// menu at `i`.
fn depth_id() -> Id {
    Id::new("redrob-menu-drawing-depth")
}

fn depth(ctx: &Context) -> usize {
    ctx.data(|d| d.get_temp::<usize>(depth_id())).unwrap_or(0)
}

/// The keyboard's place in the open menus, as Chrome's: the highlighted
/// row of each depth, and the depth the arrows move in.
#[derive(Clone, Default)]
struct Nav {
    level: usize,
    index: Vec<Option<usize>>,
    /// Rows each depth drew last pass, for the arrows to wrap around.
    rows: Vec<usize>,
    /// Rows drawn so far this pass, per depth.
    drawn: Vec<usize>,
    /// The highlight follows the keyboard, not the pointer, until it moves.
    keyboard: bool,
    /// Enter was pressed: the highlighted row runs this pass.
    activate: bool,
    /// Right arrow: the highlighted row opens its side menu this pass.
    open: bool,
}

fn nav_id() -> Id {
    Id::new("redrob-menu-nav")
}

fn nav(ctx: &Context) -> Nav {
    ctx.data(|d| d.get_temp::<Nav>(nav_id()))
        .unwrap_or_default()
}

fn set_nav(ctx: &Context, n: Nav) {
    ctx.data_mut(|d| d.insert_temp(nav_id(), n));
}

fn grow<T: Clone + Default>(v: &mut Vec<T>, len: usize) {
    if v.len() < len {
        v.resize(len, T::default());
    }
}

/// Start drawing the menu at depth `d`: its rows are counted from 0.
fn begin(ctx: &Context, d: usize) {
    ctx.data_mut(|data| data.insert_temp(depth_id(), d));
    let mut n = nav(ctx);
    grow(&mut n.drawn, d + 1);
    n.drawn[d] = 0;
    set_nav(ctx, n);
}

/// Done drawing the menu at depth `d`.
fn end(ctx: &Context, d: usize) {
    let mut n = nav(ctx);
    grow(&mut n.drawn, d + 1);
    grow(&mut n.rows, d + 1);
    n.rows[d] = n.drawn[d];
    set_nav(ctx, n);
    ctx.data_mut(|data| data.insert_temp(depth_id(), 0usize));
}

/// The keys of the open menu, read from the window's input before the
/// menus are drawn (the menus' own windows never get the keyboard):
/// Up and Down move the highlight, Right or Enter open a side menu, Left
/// closes one, Enter runs the row. Escape is [`escape`].
pub fn keys(ctx: &Context) {
    if !any_open(ctx) {
        return;
    }
    use egui::{Key, Modifiers};
    // Counted: keys pressed fast can arrive in one pass.
    let [downs, ups, rights, lefts, enters] = ctx.input_mut(|i| {
        [
            Key::ArrowDown,
            Key::ArrowUp,
            Key::ArrowRight,
            Key::ArrowLeft,
            Key::Enter,
        ]
        .map(|k| i.count_and_consume_key(Modifiers::NONE, k))
    });
    let (down, up, right, left, enter) = (downs > 0, ups > 0, rights > 0, lefts > 0, enters > 0);
    let mut n = nav(ctx);
    let open = sides(ctx).len();
    n.level = n.level.min(open);
    n.activate = false;
    n.open = false;
    if !(down || up || right || left || enter) {
        set_nav(ctx, n);
        return;
    }
    n.keyboard = true;
    let l = n.level;
    grow(&mut n.index, l + 1);
    grow(&mut n.rows, l + 1);
    let rows = n.rows[l];
    if rows > 0 {
        for _ in 0..downs {
            n.index[l] = Some(n.index[l].map_or(0, |i| (i + 1) % rows));
        }
        for _ in 0..ups {
            n.index[l] = Some(n.index[l].map_or(rows - 1, |i| (i + rows - 1) % rows));
        }
    }
    if left && l > 0 {
        let mut s = sides(ctx);
        s.truncate(l - 1);
        set_sides(ctx, s);
        n.index.truncate(l);
        n.level = l - 1;
    }
    n.open = right;
    n.activate = enter;
    set_nav(ctx, n);
    ctx.request_repaint();
}

/// Escape: closes the innermost side menu, else the menu. True when it
/// closed a side menu only.
pub fn escape(ctx: &Context) -> bool {
    let mut s = sides(ctx);
    if s.pop().is_none() {
        return false;
    }
    let len = s.len();
    set_sides(ctx, s);
    let mut n = nav(ctx);
    n.level = n.level.min(len);
    n.index.truncate(n.level + 1);
    set_nav(ctx, n);
    ctx.request_repaint();
    true
}

/// What a row of a menu does this pass.
pub struct Act {
    r: Response,
    run: bool,
}

impl Act {
    /// Clicked, or Enter pressed while it is highlighted.
    pub fn clicked(&self) -> bool {
        self.r.clicked() || self.run
    }
}

/// The pointer is over `r` and moving: only that opens or closes a side
/// menu, so one the keyboard opened, or Escape closed, stays as it is
/// under a pointer at rest.
/// The pointer moved in this window this pass (entering it counts; egui's
/// own `is_moving` needs two samples, so a jump onto a row reads as still).
pub fn pointer_moved(ui: &Ui) -> bool {
    ui.input(|i| {
        i.events
            .iter()
            .any(|e| matches!(e, egui::Event::PointerMoved(_)))
    })
}

fn moved_onto(ui: &Ui, r: &Response) -> bool {
    r.hovered() && pointer_moved(ui)
}

/// Count a row of the menu being drawn and say whether the keyboard has it:
/// (highlighted, Enter runs it, Right opens it).
fn nav_row(ui: &Ui, r: &Response) -> (bool, bool, bool) {
    let ctx = ui.ctx();
    let d = depth(ctx);
    let mut n = nav(ctx);
    grow(&mut n.drawn, d + 1);
    grow(&mut n.index, d + 1);
    let index = n.drawn[d];
    n.drawn[d] += 1;
    if r.hovered() && (pointer_moved(ui) || ui.input(|i| i.pointer.any_pressed())) {
        n.keyboard = false;
        n.level = d;
        n.index[d] = Some(index);
    }
    let mine = n.index[d] == Some(index) && n.level == d;
    let lit = if n.keyboard {
        n.index[d] == Some(index) && n.level >= d
    } else {
        r.hovered()
    };
    let run = mine && n.activate;
    let open = mine && n.open;
    if run {
        n.activate = false;
    }
    if open {
        n.open = false;
    }
    set_nav(ctx, n);
    (lit, run, open)
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
    ctx.data_mut(|d| {
        d.remove::<Id>(Id::new("redrob-open-submenu"));
        d.remove::<Vec<Side>>(side_id());
        d.remove::<Nav>(nav_id());
    });
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
    close_on_leave(ctx, page_focused);
    park(ctx);
}

fn close_on_leave(ctx: &Context, page_focused: bool) {
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
    let r = ui.scope_builder(UiBuilder::new().closable(), |ui| {
        let r = add(ui);
        (r, ui.should_close())
    });
    let (r, close) = r.inner;
    if close {
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
    let c = ctx.clone();
    show(&ctx, Slot::Menu, id, at, width, |ui| {
        ui.set_width(width - 12.0);
        begin(&c, 0);
        closable(&c, ui, add);
        end(&c, 0);
    });
}

/// A right-click menu for `r`, at the pointer.
pub fn context_menu(r: &Response, add: impl FnOnce(&mut Ui)) {
    let ctx = r.ctx.clone();
    let id = r.id.with("context-menu");
    let at_id = id.with("at");
    if r.secondary_clicked() {
        let p = r.interact_pointer_pos().unwrap_or(r.rect.left_bottom());
        // Not inside data_mut: to_screen reads the context too.
        let at = to_screen(&ctx, p);
        ctx.data_mut(|d| d.insert_temp(at_id, at));
        set_open(&ctx, Some(id));
        toggled(&ctx);
    }
    if !is_open(&ctx, id) {
        return;
    }
    let at: Pos2 = ctx.data(|d| d.get_temp(at_id)).unwrap_or_default();
    let c = ctx.clone();
    show(&ctx, Slot::Menu, id, at, 260.0, |ui| {
        ui.set_min_width(180.0);
        closable(&c, ui, add)
    });
}

/// A menu at `at` (on screen) shown while `open`: the page's context menu,
/// whose opening Chromium reports. Returns what `add` returns.
pub fn menu_at<R>(ctx: &Context, id: Id, at: Pos2, add: impl FnOnce(&mut Ui) -> R) -> R {
    show(ctx, Slot::PageMenu, id, at, 280.0, |ui| {
        ui.set_min_width(200.0);
        add(ui)
    })
}

/// An item of a menu that opens `add` under it, inside the same menu.
pub fn submenu(ui: &mut Ui, label: &str, add: impl FnOnce(&mut Ui)) {
    let ctx = ui.ctx().clone();
    let sub_id = Id::new("redrob-open-submenu");
    let id = ui.id().with(("submenu", label));
    let open = ctx.data(|d| d.get_temp::<Id>(sub_id)) == Some(id);
    let (r, ..) = row(
        ui,
        Glyph::None,
        label,
        "",
        Some(if open {
            Icon::ChevronDown
        } else {
            Icon::ChevronRight
        }),
        false,
        false,
    );
    if r.clicked() || (r.hovered() && !open) {
        ctx.data_mut(|d| {
            if open && r.clicked() {
                d.remove::<Id>(sub_id);
            } else {
                d.insert_temp(sub_id, id);
            }
        });
        ctx.request_repaint();
    }
    if open {
        ui.indent(id, add);
    }
}

/// Height of a menu row, as Chrome's.
pub const ROW: f32 = 32.0;
/// Room for a row's icon, shown or not: every label starts at the same x.
const ICON_SLOT: f32 = 16.0;
const PAD: f32 = 12.0;

/// What sits in a row's icon slot.
#[derive(Clone, Copy)]
pub enum Glyph {
    None,
    Icon(Icon),
    /// An image of its own (an extension's icon), drawn untinted.
    Image(egui::TextureId),
    /// A tab group's colour, as a dot.
    Dot(egui::Color32),
}

impl From<Option<Icon>> for Glyph {
    fn from(i: Option<Icon>) -> Self {
        i.map_or(Glyph::None, Glyph::Icon)
    }
}

/// One menu row: an icon slot (empty for [`Glyph::None`]), the label, then
/// a muted shortcut or a chevron at the right edge. `checked` marks the
/// current choice with a check in the icon slot. A `nav` row is one the
/// keyboard moves through: returns whether Enter runs it and Right opens it.
fn row(
    ui: &mut Ui,
    glyph: Glyph,
    label: &str,
    shortcut: &str,
    end: Option<Icon>,
    checked: bool,
    nav: bool,
) -> (Response, bool, bool) {
    let p = *theme::palette(ui);
    let (rect, r) = ui.allocate_exact_size(Vec2::new(ui.available_width(), ROW), Sense::click());
    let (lit, run, open) = if nav {
        nav_row(ui, &r)
    } else {
        (r.hovered(), false, false)
    };
    if !ui.is_rect_visible(rect) {
        return (r, run, open);
    }
    if lit {
        ui.painter().rect_filled(
            rect,
            egui::CornerRadius::same(theme::size::RADIUS_SM),
            p.surface_sunken,
        );
    }
    let icon_rect = Rect::from_center_size(
        egui::pos2(rect.left() + PAD + ICON_SLOT / 2.0, rect.center().y),
        Vec2::splat(ICON_SLOT),
    );
    let glyph = if checked {
        Glyph::Icon(Icon::Check)
    } else {
        glyph
    };
    match glyph {
        Glyph::None => {}
        Glyph::Icon(icon) => icon.paint(
            ui,
            icon_rect,
            if checked {
                p.ink_brand
            } else {
                p.ink_secondary
            },
        ),
        Glyph::Image(tex) => {
            egui::Image::new((tex, Vec2::splat(ICON_SLOT))).paint_at(ui, icon_rect);
        }
        Glyph::Dot(c) => {
            ui.painter().circle_filled(icon_rect.center(), 5.0, c);
        }
    }
    let painter = ui.painter_at(rect);
    let mut right = rect.right() - PAD;
    if let Some(end) = end {
        let r = Rect::from_center_size(egui::pos2(right - 7.0, rect.center().y), Vec2::splat(14.0));
        end.paint(ui, r, p.ink_muted);
        right = r.left() - 8.0;
    } else if !shortcut.is_empty() {
        let g = painter.layout_no_wrap(
            shortcut.to_string(),
            egui::FontId::proportional(12.0),
            p.ink_muted,
        );
        let x = right - g.size().x;
        painter.galley(
            egui::pos2(x, rect.center().y - g.size().y / 2.0),
            g,
            p.ink_muted,
        );
        right = x - 12.0;
    }
    let x = icon_rect.right() + PAD;
    // One line, cut with "…" before it reaches the shortcut or chevron.
    let mut job = egui::text::LayoutJob::simple_singleline(
        label.to_owned(),
        egui::FontId::proportional(13.0),
        p.ink_primary,
    );
    job.wrap = egui::text::TextWrapping::truncate_at_width((right - x).max(0.0));
    let g = painter.layout_job(job);
    painter.galley(
        egui::pos2(x, rect.center().y - g.size().y / 2.0),
        g,
        p.ink_primary,
    );
    (r, run, open)
}

/// A menu item: an icon slot, the label and its shortcut, right-aligned.
/// Hovering it closes the side menus opened from its menu, as in Chrome.
pub fn item(ui: &mut Ui, icon: impl Into<Glyph>, label: &str, shortcut: &str) -> Act {
    let (r, run, _) = row(ui, icon.into(), label, shortcut, None, false, true);
    if moved_onto(ui, &r) {
        close_side(ui.ctx());
    }
    Act { r, run }
}

/// Where a row's label starts: past its icon slot.
pub const LABEL_X: f32 = PAD + ICON_SLOT + PAD;

/// A row that only says something (who is signed in, a list's heading),
/// muted.
pub fn note(ui: &mut Ui, icon: Option<Icon>, text: &str) {
    let p = *theme::palette(ui);
    // Wrapped to the menu's width: a long note grows taller, not clipped.
    let wrap = (ui.available_width() - LABEL_X - PAD).max(40.0);
    let galley = ui.painter().layout(
        text.to_owned(),
        egui::FontId::proportional(12.0),
        p.ink_muted,
        wrap,
    );
    let h = (galley.size().y + ROW - 12.0).max(ROW);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), h), Sense::hover());
    if let Some(icon) = icon {
        icon.paint(
            ui,
            Rect::from_center_size(
                egui::pos2(rect.left() + PAD + ICON_SLOT / 2.0, rect.center().y),
                Vec2::splat(ICON_SLOT),
            ),
            p.ink_muted,
        );
    }
    let top = rect.center().y - galley.size().y / 2.0;
    ui.painter()
        .galley(egui::pos2(rect.left() + LABEL_X, top), galley, p.ink_muted);
}

/// An item of a side menu marking the current choice, with a shortcut at
/// its end (the key that picks it).
pub fn choice_with(ui: &mut Ui, label: &str, current: bool, shortcut: &str) -> Act {
    let (r, run, _) = row(ui, Glyph::None, label, shortcut, None, current, true);
    if moved_onto(ui, &r) {
        close_side(ui.ctx());
    }
    Act { r, run }
}

/// The keys of the open side menus, outermost first.
pub fn open_sides(ctx: &Context) -> Vec<Id> {
    sides(ctx).into_iter().map(|(k, ..)| k).collect()
}

/// Close the side menus opened from the menu being drawn (another of its
/// rows is hovered).
pub fn close_side(ctx: &Context) {
    let d = depth(ctx);
    let mut s = sides(ctx);
    if s.len() > d {
        s.truncate(d);
        set_sides(ctx, s);
        let mut n = nav(ctx);
        n.level = n.level.min(d);
        set_nav(ctx, n);
        ctx.request_repaint();
    }
}

/// A menu item whose side menu `key` opens beside it while it is hovered
/// or clicked, or with Right or Enter; the window draws that menu with
/// [`side_menu`], from its own pass (eframe draws a window opened from a
/// popup's pass, but never hands it its clicks).
pub fn side_item(ui: &mut Ui, key: Id, icon: impl Into<Glyph>, label: &str) {
    let ctx = ui.ctx().clone();
    let d = depth(&ctx);
    let (r, run, right) = row(
        ui,
        icon.into(),
        label,
        "",
        Some(Icon::ChevronRight),
        false,
        true,
    );
    let mut s = sides(&ctx);
    let open = s.get(d).map(|(k, ..)| *k) == Some(key);
    if open {
        ui.painter().rect_filled(
            r.rect,
            egui::CornerRadius::same(theme::size::RADIUS_SM),
            theme::palette(ui).surface_sunken.gamma_multiply(0.6),
        );
    }
    let keyboard = run || right;
    if (moved_onto(ui, &r) || r.clicked() || keyboard) && !open {
        let origin: Pos2 = ctx
            .data(|d| d.get_temp(drawing_at_id()))
            .unwrap_or_default();
        // Its first row level with this one, past the menu's edge.
        let at = origin + Vec2::new(r.rect.right() + 8.0, r.rect.top());
        let left = origin.x + r.rect.left() - 8.0;
        s.truncate(d);
        s.push((key, at, left));
        set_sides(&ctx, s);
        ctx.request_repaint();
    }
    if keyboard {
        // The keyboard goes into it, on its first row.
        let mut n = nav(&ctx);
        n.level = d + 1;
        grow(&mut n.index, d + 2);
        n.index[d + 1] = Some(0);
        set_nav(&ctx, n);
    }
}

/// The side menu `key`, while its item opened it.
pub fn side_menu(ctx: &Context, key: Id, width: f32, add: impl FnOnce(&mut Ui)) {
    let s = sides(ctx);
    let Some(i) = s.iter().position(|(k, ..)| *k == key) else {
        return;
    };
    if !any_open(ctx) {
        return;
    }
    let (_, mut at, _) = s[i];
    // Its window is `width` plus the frame's 1 point border on each side.
    const BORDER: f32 = 2.0;
    let mut width = width;
    if let Some(m) = ctx.input(|i| i.viewport().monitor_size) {
        let (x, w) = place_side(&s[..=i], m.x, width + BORDER);
        at.x = x;
        width = w - BORDER;
    }
    // Taller than the screen below its row: moved up, as far as the top,
    // and scrolled when taller than the screen.
    let screen_h = ctx
        .input(|i| i.viewport().monitor_size)
        .map_or(4000.0, |m| m.y);
    let known: Option<Vec2> = ctx.data(|d| d.get_temp(key.with("size")));
    if let Some(size) = known {
        at.y = at.y.min(screen_h - size.y).max(0.0);
    }
    let c = ctx.clone();
    let slot = Slot::Side(i.min(u8::MAX as usize) as u8);
    show(ctx, slot, key, at, width, |ui| {
        ui.set_width(width - 12.0);
        ui.spacing_mut().item_spacing.y = 0.0;
        egui::ScrollArea::vertical()
            .max_height(screen_h - 16.0)
            .show(ui, |ui| {
                ui.spacing_mut().item_spacing.y = 0.0;
                begin(&c, i + 1);
                closable(&c, ui, add);
                end(&c, i + 1);
            });
    });
}

/// Where the last of `chain` goes, `w` wide on a screen `screen` wide:
/// its x and its width. Each entry records the row that opened the next
/// menu (its right edge + 8 and left edge - 8), so `chain` spans every
/// open menu it must not cover. It keeps its parent's direction, as
/// Chrome cascades; else takes the other side; else the side with more
/// free room, narrowed (its labels end in "…"). Only a screen too narrow
/// for even that puts it over an ancestor.
fn place_side(chain: &[Side], screen: f32, w: f32) -> (f32, f32) {
    const MIN: f32 = 180.0;
    const EPS: f32 = 0.5;
    let Some(&(_, at, left)) = chain.last() else {
        return (0.0, w);
    };
    let right_x = at.x;
    // Every open menu's x span, its frame included.
    let spans: Vec<(f32, f32)> = chain.iter().map(|&(_, a, l)| (l, a.x)).collect();
    let room_right = spans
        .iter()
        .filter(|s| s.1 > right_x + EPS)
        .map(|s| s.0.max(right_x))
        .fold(screen, f32::min)
        - right_x;
    let room_left = left
        - spans
            .iter()
            .filter(|s| s.0 < left - EPS)
            .map(|s| s.1.min(left))
            .fold(0.0, f32::max);
    // The parent went left of its own parent: keep going left.
    let leftward = chain.len() >= 2 && {
        let (p, gp) = (spans[chain.len() - 1], spans[chain.len() - 2]);
        p.0 < gp.0
    };
    let fits_right = room_right >= w;
    let fits_left = room_left >= w;
    match (leftward, fits_right, fits_left) {
        (false, true, _) | (true, true, false) => (right_x, w),
        (_, _, true) => (left - w, w),
        _ if room_right.max(room_left) >= MIN => {
            if room_right >= room_left {
                (right_x, room_right)
            } else {
                (left - room_left, room_left)
            }
        }
        // No free room anywhere: beside its parent on the screen's wider
        // side, over an older menu.
        _ => {
            let r = (screen - right_x).max(0.0);
            let l = left.max(0.0);
            if w <= r {
                (right_x, w)
            } else if w <= l {
                (left - w, w)
            } else if l > r {
                (0.0, l)
            } else {
                (right_x, r)
            }
        }
    }
}

/// A separator between a menu's groups.
pub fn separator(ui: &mut Ui) {
    let p = theme::palette(ui);
    let (rect, _) = ui.allocate_exact_size(Vec2::new(ui.available_width(), 9.0), Sense::hover());
    ui.painter().hline(
        rect.x_range(),
        rect.center().y,
        egui::Stroke::new(1.0, p.border_subtle),
    );
}

/// Hover text for `r` in a window of its own (it may reach over the page).
pub fn tip(r: Response, text: &str) -> Response {
    if text.is_empty() || !r.hovered() || any_open(&r.ctx) {
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
    show(&ctx, Slot::Tip, r.id.with("tip"), at, 420.0, |ui| {
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
    // Remembered by its text: another link opens measured, not in place
    // at the last one's size.
    let id = Id::new(("redrob-status", text.as_str()));
    let size = ctx.data(|d| d.get_temp::<Vec2>(id.with("size")));
    if let Some(s) = size {
        ctx.data_mut(|d| d.insert_temp(size_id, s));
    }
    show(ctx, Slot::Status, id, at, page.width() * 0.6, |ui| {
        ui.label(egui::RichText::new(text).size(12.0));
    });
}

#[cfg(test)]
mod place_tests {
    use super::*;

    fn side(left: f32, right: f32) -> Side {
        (Id::new(left as i32), egui::pos2(right, 0.0), left)
    }

    #[test]
    fn cascades_left_past_every_ancestor() {
        // Menu at the screen's right edge (1100..1400): Bookmarks opens left
        // of it, then a folder opens left of Bookmarks, not back over the
        // menu.
        let menu = side(1092.0, 1408.0);
        let (x1, _) = place_side(&[menu], 1420.0, 300.0);
        assert_eq!(x1, 792.0);
        let bm = side(x1, x1 + 300.0);
        let (x2, w2) = place_side(&[menu, bm], 1420.0, 300.0);
        assert_eq!((x2, w2), (492.0, 300.0));
    }

    #[test]
    fn narrow_screen_shrinks_instead_of_covering() {
        // 640 wide: menu 320..640, Bookmarks 0..312; the folder has no
        // free room, so it may only cover an ancestor as a last resort,
        // but with room on the right it stays right.
        let menu = side(312.0, 648.0);
        let (x1, w1) = place_side(&[menu], 640.0, 320.0);
        assert!(x1 + w1 <= 312.5);
        let free = place_side(&[side(400.0, 700.0)], 1920.0, 300.0);
        assert_eq!(free, (700.0, 300.0));
    }
}
