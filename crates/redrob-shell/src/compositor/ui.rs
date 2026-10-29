//! The compositor's egui side: cursor, link status bubble, scrollbars.

use egui::{pos2, vec2, Color32, CursorIcon, Rect, Sense};
use redrob_scene::Cursor;

use super::hit::Hover;
use super::spatial::Resolved;
use super::state::TabScene;

/// The OS cursor for what is under the pointer.
pub fn cursor_icon(hover: Option<&Hover>) -> CursorIcon {
    let Some(h) = hover else {
        return CursorIcon::Default;
    };
    use CursorIcon as I;
    match h.cursor {
        Cursor::Auto if h.link.is_some() => I::PointingHand,
        Cursor::Auto if h.is_text => I::Text,
        Cursor::Auto | Cursor::Default => I::Default,
        Cursor::Pointer => I::PointingHand,
        Cursor::Text => I::Text,
        Cursor::VerticalText => I::VerticalText,
        Cursor::Wait => I::Wait,
        Cursor::Progress => I::Progress,
        Cursor::Help => I::Help,
        Cursor::Crosshair => I::Crosshair,
        Cursor::Move => I::Move,
        Cursor::Grab => I::Grab,
        Cursor::Grabbing => I::Grabbing,
        Cursor::NotAllowed => I::NotAllowed,
        Cursor::NoDrop => I::NoDrop,
        Cursor::ContextMenu => I::ContextMenu,
        Cursor::Cell => I::Cell,
        Cursor::Copy => I::Copy,
        Cursor::Alias => I::Alias,
        Cursor::ZoomIn => I::ZoomIn,
        Cursor::ZoomOut => I::ZoomOut,
        Cursor::ColResize => I::ResizeColumn,
        Cursor::RowResize => I::ResizeRow,
        Cursor::EResize => I::ResizeEast,
        Cursor::NResize => I::ResizeNorth,
        Cursor::NeResize => I::ResizeNorthEast,
        Cursor::NwResize => I::ResizeNorthWest,
        Cursor::SResize => I::ResizeSouth,
        Cursor::SeResize => I::ResizeSouthEast,
        Cursor::SwResize => I::ResizeSouthWest,
        Cursor::WResize => I::ResizeWest,
        Cursor::EwResize => I::ResizeHorizontal,
        Cursor::NsResize => I::ResizeVertical,
        Cursor::NeswResize => I::ResizeNeSw,
        Cursor::NwseResize => I::ResizeNwSe,
        Cursor::AllScroll => I::AllScroll,
        Cursor::None => I::None,
    }
}

/// The hovered link's address at the page area's bottom-left, as Chrome
/// shows it. Moves to the right when the pointer is over it.
pub fn status_bubble(ui: &egui::Ui, page: Rect, link: &str, pointer: Option<egui::Pos2>) {
    let p = *crate::theme::palette(ui);
    let font = egui::FontId::proportional(12.0);
    let max_w = (page.width() / 3.0).max(240.0).min(page.width() - 8.0);
    let galley = ui
        .painter()
        .layout(link.to_string(), font, p.ink_primary, f32::INFINITY);
    let pad = vec2(8.0, 4.0);
    let w = (galley.size().x + pad.x * 2.0).min(max_w);
    let h = galley.size().y + pad.y * 2.0;
    let mut bubble = Rect::from_min_size(pos2(page.left(), page.bottom() - h), vec2(w, h));
    if pointer.is_some_and(|q| bubble.expand(8.0).contains(q)) {
        bubble = bubble.translate(vec2(page.width() - w, 0.0));
    }
    let painter = ui.painter().with_clip_rect(page);
    painter.rect(
        bubble,
        egui::CornerRadius {
            nw: 0,
            ne: 4,
            sw: 0,
            se: 0,
        },
        p.surface_raised,
        egui::Stroke::new(1.0, p.border_subtle),
        egui::StrokeKind::Inside,
    );
    let text = bubble.shrink2(pad);
    painter
        .with_clip_rect(text.intersect(page))
        .galley(text.min, galley, p.ink_primary);
}

const BAR: f32 = 10.0;
const MIN_THUMB: f32 = 24.0;

/// One scrollbar: its track and thumb in page-area CSS px.
struct Bar {
    node: u64,
    vertical: bool,
    track: Rect,
    thumb: Rect,
    pos: f32,
    max: f32,
}

fn bars(page: &TabScene, res: &Resolved) -> Vec<Bar> {
    let Some(frame) = &page.frame else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for s in page.scrollers() {
        let Some(r) = res.scroll_rect(frame, s.index) else {
            continue;
        };
        // Hidden when the scroll frame is itself scrolled out of sight.
        let view = vello::kurbo::Rect::new(
            0.0,
            0.0,
            f64::from(res.viewport.0),
            f64::from(res.viewport.1),
        );
        let clipped = res
            .parent
            .get(s.index)
            .copied()
            .flatten()
            .and_then(|p| res.clip_scroll[p])
            .and_then(|c| res.scroll_rect(frame, c))
            .map_or(view, |c| c.intersect(view));
        let r = r.intersect(clipped);
        if r.width() < f64::from(BAR) * 2.0 || r.height() < f64::from(BAR) * 2.0 {
            continue;
        }
        let r = Rect::from_min_max(
            pos2(r.x0 as f32, r.y0 as f32),
            pos2(r.x1 as f32, r.y1 as f32),
        );
        let pos = page.pos(&s);
        let both = s.max.0 > 0.0 && s.max.1 > 0.0;
        let corner = if both { BAR } else { 0.0 };
        if s.max.1 > 0.0 {
            let track = Rect::from_min_max(
                pos2(r.right() - BAR, r.top()),
                pos2(r.right(), r.bottom() - corner),
            );
            let len = (track.height() * s.frame.h / (s.frame.h + s.max.1)).max(MIN_THUMB);
            let top = track.top() + (track.height() - len) * (pos.1 / s.max.1).clamp(0.0, 1.0);
            out.push(Bar {
                node: s.node,
                vertical: true,
                track,
                thumb: Rect::from_min_size(pos2(track.left(), top), vec2(BAR, len)),
                pos: pos.1,
                max: s.max.1,
            });
        }
        if s.max.0 > 0.0 {
            let track = Rect::from_min_max(
                pos2(r.left(), r.bottom() - BAR),
                pos2(r.right() - corner, r.bottom()),
            );
            let len = (track.width() * s.frame.w / (s.frame.w + s.max.0)).max(MIN_THUMB);
            let left = track.left() + (track.width() - len) * (pos.0 / s.max.0).clamp(0.0, 1.0);
            out.push(Bar {
                node: s.node,
                vertical: false,
                track,
                thumb: Rect::from_min_size(pos2(left, track.top()), vec2(len, BAR)),
                pos: pos.0,
                max: s.max.0,
            });
        }
    }
    out
}

/// Draw overlay scrollbars over the page area at `origin` and let the
/// person drag them or click their track. Returns the bar rectangles
/// (window coordinates), whose pointer input must not reach the page.
pub fn scrollbars(
    ui: &egui::Ui,
    page_rect: Rect,
    page: &mut TabScene,
    res: &Resolved,
) -> Vec<Rect> {
    let origin = page_rect.min.to_vec2();
    let mut taken = Vec::new();
    let painter = ui.painter().with_clip_rect(page_rect);
    let dark = ui.visuals().dark_mode;
    for bar in bars(page, res) {
        let track = bar.track.translate(origin);
        let thumb = bar.thumb.translate(origin);
        taken.push(track);
        let id = ui.id().with(("redrob-scrollbar", bar.node, bar.vertical));
        let r = ui.interact(track, id, Sense::click_and_drag());
        let active = r.hovered() || r.dragged();
        if r.dragged() {
            let d = r.drag_delta();
            let (moved, room) = if bar.vertical {
                (d.y, track.height() - thumb.height())
            } else {
                (d.x, track.width() - thumb.width())
            };
            if room > 0.0 {
                let to = bar.pos + moved * bar.max / room;
                let cur = page.offset_of(bar.node);
                let to = if bar.vertical {
                    (cur.0, to)
                } else {
                    (to, cur.1)
                };
                page.scroll_node_to(bar.node, to, false);
            }
        } else if r.clicked() {
            // A click on the track pages toward the click, as Chrome does.
            if let Some(p) = r.interact_pointer_pos().filter(|p| !thumb.contains(*p)) {
                let before = if bar.vertical {
                    p.y < thumb.top()
                } else {
                    p.x < thumb.left()
                };
                let page_len = if bar.vertical {
                    track.height() * bar.max / (track.height() - thumb.height()).max(1.0)
                } else {
                    track.width() * bar.max / (track.width() - thumb.width()).max(1.0)
                };
                let step = (page_len * 0.875).max(40.0);
                let to = bar.pos + if before { -step } else { step };
                let cur = page.offset_of(bar.node);
                let to = if bar.vertical {
                    (cur.0, to)
                } else {
                    (to, cur.1)
                };
                page.scroll_node_to(bar.node, to, true);
            }
        }
        if active {
            let back = if dark {
                Color32::from_white_alpha(24)
            } else {
                Color32::from_black_alpha(18)
            };
            painter.rect_filled(track, 0.0, back);
        }
        let alpha = if r.dragged() {
            170
        } else if active {
            140
        } else {
            100
        };
        let fill = if dark {
            Color32::from_white_alpha(alpha)
        } else {
            Color32::from_black_alpha(alpha)
        };
        painter.rect_filled(thumb.shrink(2.0), 3.0, fill);
    }
    taken
}

impl TabScene {
    /// The current offset of scroller `node`.
    fn offset_of(&self, node: u64) -> (f32, f32) {
        self.scroll.offset(node).unwrap_or((0.0, 0.0))
    }
}
