//! One tab's current frame, its resources and its scroll offsets.

use std::collections::HashMap;

use redrob_scene::{
    ClientMsg, FontId, Frame, ImageId, Item, SpatialId, SpatialKind, ROOT_SCROLL,
};
use tokio::sync::mpsc::UnboundedSender;
use vello::kurbo::{BezPath, Rect, Shape as _};
use vello::peniko::{FontData, ImageData};

use super::channel::{Incoming, Prepared};
use super::scroll::Scrolls;
use super::spatial::{self, Resolved};

#[derive(Default)]
pub struct TabScene {
    pub(super) frame: Option<Frame>,
    pub(super) index: HashMap<SpatialId, usize>,
    /// Local-space bounds of each item, for culling; None for push/pop.
    pub(super) bounds: Vec<Option<Rect>>,
    externals: Vec<u64>,
    pub(super) images: HashMap<ImageId, ImageData>,
    pub(super) fonts: HashMap<FontId, FontData>,
    pub(super) scroll: Scrolls,
    link: Option<UnboundedSender<ClientMsg>>,
    /// The newest epoch reported as presented.
    presented: u64,
    /// Bumped on every change that alters what is drawn.
    version: u64,
    /// Why there is no scene from the engine, if it said.
    pub error: Option<String>,
}

impl TabScene {
    /// A tab's scene; with `REDROB_SCENE_FILE` set, loaded from that file.
    pub fn new() -> Self {
        let mut s = Self::default();
        if let Some(path) = std::env::var_os(super::DEBUG_FILE_ENV) {
            match super::channel::load_file(std::path::Path::new(&path)) {
                Ok(msgs) => msgs.into_iter().for_each(|m| s.apply(m)),
                Err(e) => s.error = Some(e),
            }
        }
        s
    }

    pub fn debug_file() -> bool {
        std::env::var_os(super::DEBUG_FILE_ENV).is_some()
    }

    pub fn has_frame(&self) -> bool {
        self.frame.is_some()
    }

    pub fn epoch(&self) -> u64 {
        self.frame.as_ref().map_or(0, |f| f.epoch)
    }

    pub fn version(&self) -> u64 {
        self.version
    }

    pub(super) fn changed(&mut self) {
        self.version = self.version.wrapping_add(1);
    }

    /// The engine's end of the channel, once attached.
    pub fn set_link(&mut self, link: UnboundedSender<ClientMsg>) {
        self.link = Some(link);
        self.error = None;
        self.presented = 0;
    }

    pub(super) fn send(&self, msg: ClientMsg) {
        if let Some(l) = &self.link {
            let _ = l.send(msg);
        }
    }

    /// `External` keys in the current frame (video elements).
    pub fn externals(&self) -> &[u64] {
        &self.externals
    }

    /// The frame on screen was drawn: tell the engine (flow control).
    pub(super) fn presented(&mut self) {
        let epoch = self.epoch();
        if self.frame.is_some() && epoch != self.presented {
            self.presented = epoch;
            self.send(ClientMsg::Presented { epoch });
        }
    }

    /// A different document: scroll positions start over. Its first frame
    /// may already be here (the scene channel can beat the CDP event).
    pub fn navigated(&mut self) {
        self.scroll = Scrolls::default();
        self.spatial_changed();
        self.changed();
    }

    pub fn apply(&mut self, msg: Incoming) {
        match msg {
            Incoming::Resources(list) => {
                for r in list {
                    match r {
                        Prepared::Image(id, data) => {
                            self.images.insert(id, data);
                        }
                        Prepared::Font(id, data) => {
                            self.fonts.insert(id, data);
                        }
                        Prepared::DropImage(id) => {
                            self.images.remove(&id);
                        }
                        Prepared::DropFont(id) => {
                            self.fonts.remove(&id);
                        }
                    }
                }
            }
            Incoming::Frame(frame) => {
                self.frame = Some(*frame);
                self.items_changed();
                self.spatial_changed();
            }
            Incoming::Delta(d) => {
                let Some(frame) = self.frame.as_mut() else {
                    return;
                };
                frame.epoch = d.epoch;
                if let Some(v) = d.viewport {
                    frame.viewport = v;
                }
                if let Some(b) = d.background {
                    frame.background = b;
                }
                if let Some(h) = d.hits {
                    frame.hits = h;
                }
                let items = d.items.is_some();
                if let Some(i) = d.items {
                    frame.items = i;
                }
                let spatial = d.spatial.is_some();
                if let Some(s) = d.spatial {
                    frame.spatial = s;
                }
                if items {
                    self.items_changed();
                }
                if spatial {
                    self.spatial_changed();
                }
            }
            Incoming::Closed(reason) => {
                self.link = None;
                self.error = Some(reason);
            }
        }
        self.changed();
    }

    fn items_changed(&mut self) {
        let Some(frame) = &self.frame else { return };
        self.bounds = frame.items.iter().map(|d| item_bounds(&d.item)).collect();
        self.externals = frame
            .items
            .iter()
            .filter_map(|d| match d.item {
                Item::External { key, .. } => Some(key),
                _ => None,
            })
            .collect();
        self.externals.sort_unstable();
        self.externals.dedup();
    }

    /// New spatial nodes: index them and take offsets the page set.
    fn spatial_changed(&mut self) {
        let Some(frame) = &mut self.frame else { return };
        self.index = spatial::index(frame);
        for node in &mut frame.spatial {
            if let SpatialKind::Scroll {
                frame: f,
                content,
                offset,
                offset_changed_by_page,
                node,
            } = &mut node.kind
            {
                let max = max_offset(f, *content);
                self.scroll.adopt(*node, *offset, *offset_changed_by_page, max);
                // Taken: from now on the window's offset is the live one.
                *offset_changed_by_page = false;
            }
        }
    }

    /// Map the spatial tree for a page area of `viewport` CSS px.
    pub fn resolve(&self, viewport: (f32, f32)) -> Resolved {
        match &self.frame {
            Some(frame) => spatial::resolve(frame, &self.index, viewport, self.scroll.offsets()),
            None => Resolved {
                viewport,
                ..Default::default()
            },
        }
    }

    /// The document scroller's offset.
    pub fn root_offset(&self) -> (f32, f32) {
        let Some(frame) = &self.frame else {
            return (0.0, 0.0);
        };
        self.index
            .get(&ROOT_SCROLL)
            .and_then(|i| match &frame.spatial[*i].kind {
                SpatialKind::Scroll { node, offset, .. } => {
                    Some(self.scroll.offset(*node).unwrap_or(*offset))
                }
                _ => None,
            })
            .unwrap_or((0.0, 0.0))
    }

    /// Page-area rectangles (x, y, w, h) of `External` items, by key.
    pub fn external_rects(&self, res: &Resolved) -> Vec<(u64, [f32; 4])> {
        let Some(frame) = &self.frame else {
            return Vec::new();
        };
        frame
            .items
            .iter()
            .filter_map(|d| match &d.item {
                Item::External { key, rect } => {
                    let world = res.world.get(*self.index.get(&d.spatial)?)?;
                    let r = world.transform_rect_bbox(spatial::rect(rect));
                    Some((*key, [r.x0 as f32, r.y0 as f32, r.width() as f32, r.height() as f32]))
                }
                _ => None,
            })
            .collect()
    }

    /// Page-area position of each sticky node's frame (for the trace).
    pub fn sticky_positions(&self, res: &Resolved) -> Vec<(f32, f32)> {
        let Some(frame) = &self.frame else {
            return Vec::new();
        };
        frame
            .spatial
            .iter()
            .enumerate()
            .filter_map(|(i, n)| match &n.kind {
                SpatialKind::Sticky { frame: f, .. } => {
                    let p = *res.world.get(i)? * vello::kurbo::Point::new(f64::from(f.x), f64::from(f.y));
                    Some((p.x as f32, p.y as f32))
                }
                _ => None,
            })
            .collect()
    }
}

pub(super) fn max_offset(frame: &redrob_scene::Rect, content: (f32, f32)) -> (f32, f32) {
    ((content.0 - frame.w).max(0.0), (content.1 - frame.h).max(0.0))
}

pub(super) fn path(verbs: &[redrob_scene::Verb]) -> BezPath {
    use redrob_scene::Verb;
    let p = |x: f32, y: f32| (f64::from(x), f64::from(y));
    let mut path = BezPath::new();
    let mut open = false;
    for verb in verbs {
        match *verb {
            Verb::M(x, y) => {
                path.move_to(p(x, y));
                open = true;
            }
            // kurbo panics on a segment with no current point.
            _ if !open => {}
            Verb::L(x, y) => path.line_to(p(x, y)),
            Verb::Q(x1, y1, x, y) => path.quad_to(p(x1, y1), p(x, y)),
            Verb::C(x1, y1, x2, y2, x, y) => path.curve_to(p(x1, y1), p(x2, y2), p(x, y)),
            Verb::Z => {
                path.close_path();
                open = false;
            }
        }
    }
    path
}

/// Conservative local-space bounds of a drawing item.
fn item_bounds(item: &Item) -> Option<Rect> {
    let r = match item {
        Item::Rect { rect, .. }
        | Item::RoundedRect { rect, .. }
        | Item::LinearGradient { rect, .. }
        | Item::RadialGradient { rect, .. }
        | Item::External { rect, .. } => spatial::rect(rect),
        Item::Image { dest, .. } => spatial::rect(dest),
        Item::BoxShadow {
            rect,
            blur,
            offset,
            spread,
            inset,
            ..
        } => {
            let r = spatial::rect(rect);
            if *inset {
                r
            } else {
                let grow = f64::from(spread.max(0.0) + blur.max(0.0) * 1.5 + 1.0);
                r.with_origin((r.x0 + f64::from(offset.0), r.y0 + f64::from(offset.1)))
                    .inflate(grow, grow)
                    .union(r)
            }
        }
        Item::Path {
            verbs, transform, ..
        } => spatial::affine(transform).transform_rect_bbox(path(verbs).bounding_box()),
        Item::Stroke {
            verbs,
            transform,
            width,
            ..
        } => {
            let w = f64::from(*width);
            spatial::affine(transform)
                .transform_rect_bbox(path(verbs).bounding_box().inflate(w, w))
        }
        Item::Text {
            size, glyphs, skew, ..
        } => {
            let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            for g in glyphs {
                x0 = x0.min(g.x);
                y0 = y0.min(g.y);
                x1 = x1.max(g.x);
                y1 = y1.max(g.y);
            }
            if glyphs.is_empty() {
                return Some(Rect::ZERO);
            }
            let s = f64::from(*size) * (1.5 + f64::from(skew.abs()));
            Rect::new(f64::from(x0), f64::from(y0), f64::from(x1), f64::from(y1))
                .inflate(s * 1.5, s)
        }
        Item::PushClip { .. }
        | Item::PushClipPath { .. }
        | Item::PopClip
        | Item::PushLayer { .. }
        | Item::PopLayer => return None,
    };
    let finite = r.x0.is_finite() && r.y0.is_finite() && r.x1.is_finite() && r.y1.is_finite();
    // An item with no usable bounds is never culled.
    Some(if finite { r } else { Rect::new(-1e9, -1e9, 1e9, 1e9) })
}
