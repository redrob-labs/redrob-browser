//! The spatial tree mapped to the page area for one frame.
//!
//! Conventions (as WebRender): a `Reference` node maps its children through
//! `transform`; a `Scroll` node shifts its children by minus its offset and
//! clips them to `frame` (in its parent's space); a `Sticky` node shifts its
//! children by `redrob_scene::sticky_offset` against the viewport of its
//! nearest scroll frame. Children of `Scroll` and `Sticky` nodes keep their
//! parent's coordinates otherwise, so layout positions pass through as they are.

use std::collections::HashMap;

use redrob_scene::{Frame, SpatialId, SpatialKind, ROOT_SCROLL};
use vello::kurbo::{Affine, Point, Rect};

pub fn affine(t: &redrob_scene::Affine) -> Affine {
    Affine::new(t.map(f64::from))
}

pub fn rect(r: &redrob_scene::Rect) -> Rect {
    let (x, y) = (f64::from(r.x), f64::from(r.y));
    Rect::new(x, y, x + f64::from(r.w), y + f64::from(r.h))
}

fn scene_rect(r: Rect) -> redrob_scene::Rect {
    redrob_scene::Rect {
        x: r.x0 as f32,
        y: r.y0 as f32,
        w: r.width() as f32,
        h: r.height() as f32,
    }
}

/// Node index of every spatial id in a frame.
pub fn index(frame: &Frame) -> HashMap<SpatialId, usize> {
    frame
        .spatial
        .iter()
        .enumerate()
        .map(|(i, n)| (n.id, i))
        .collect()
}

/// Every spatial node of one frame, mapped to page-area CSS pixels.
#[derive(Default)]
pub struct Resolved {
    /// Local to page-area transform, per node (index into `Frame::spatial`).
    pub world: Vec<Affine>,
    /// The innermost scroll frame (node index) clipping content in this
    /// node, the node itself included; the root scroll frame is the page
    /// area and is left out.
    pub clip_scroll: Vec<Option<usize>>,
    pub parent: Vec<Option<usize>>,
    /// Page-area CSS size the frame was resolved for.
    pub viewport: (f32, f32),
}

impl Resolved {
    /// The scroll frames clipping content of node `i`, outermost first.
    pub fn clip_chain(&self, i: usize) -> Vec<usize> {
        let mut chain = Vec::new();
        let mut at = self.clip_scroll.get(i).copied().flatten();
        while let Some(s) = at {
            if chain.contains(&s) {
                break;
            }
            chain.push(s);
            at = self.parent[s].and_then(|p| self.clip_scroll[p]);
        }
        chain.reverse();
        chain
    }

    /// The clip of scroll node `s`: its parent's transform and its frame.
    pub fn scroll_clip(&self, frame: &Frame, s: usize) -> Option<(Affine, Rect)> {
        let SpatialKind::Scroll { frame: f, .. } = &frame.spatial.get(s)?.kind else {
            return None;
        };
        let parent = self.parent[s].map_or(Affine::IDENTITY, |p| self.world[p]);
        Some((parent, rect(f)))
    }

    /// Whether page point `p` is inside every scroll frame clipping node `i`.
    pub fn visible_at(&self, frame: &Frame, i: usize, p: Point) -> bool {
        self.clip_chain(i).into_iter().all(|s| {
            self.scroll_clip(frame, s).is_some_and(|(t, r)| {
                invert(t).is_some_and(|inv| r.contains(inv * p))
            })
        })
    }

    /// Scroll frame `s` as a page-area rectangle (its bounding box).
    pub fn scroll_rect(&self, frame: &Frame, s: usize) -> Option<Rect> {
        self.scroll_clip(frame, s)
            .map(|(t, r)| t.transform_rect_bbox(r))
    }
}

pub fn invert(t: Affine) -> Option<Affine> {
    let det = t.determinant();
    (det.is_finite() && det.abs() > 1e-12).then(|| t.inverse())
}

/// Map every node of `frame` to the page area. `offset` gives the live
/// offset of a scroll node (the window owns them).
pub fn resolve(
    frame: &Frame,
    index: &HashMap<SpatialId, usize>,
    viewport: (f32, f32),
    offset: &dyn Fn(usize) -> (f32, f32),
) -> Resolved {
    let n = frame.spatial.len();
    let parent = frame
        .spatial
        .iter()
        .enumerate()
        .map(|(i, s)| {
            s.parent
                .and_then(|p| index.get(&p).copied())
                .filter(|p| *p != i)
        })
        .collect();
    let mut r = Resolved {
        world: vec![Affine::IDENTITY; n],
        clip_scroll: vec![None; n],
        parent,
        viewport,
    };
    let mut state = vec![0u8; n]; // 0 new, 1 visiting, 2 done
    for i in 0..n {
        visit(frame, &mut r, &mut state, offset, i);
    }
    r
}

fn visit(
    frame: &Frame,
    r: &mut Resolved,
    state: &mut [u8],
    offset: &dyn Fn(usize) -> (f32, f32),
    i: usize,
) {
    if state[i] != 0 {
        // Done, or a cycle in a broken tree: leave it at identity.
        return;
    }
    state[i] = 1;
    let parent = r.parent[i];
    if let Some(p) = parent {
        visit(frame, r, state, offset, p);
    }
    let pw = parent.map_or(Affine::IDENTITY, |p| r.world[p]);
    let pclip = parent.and_then(|p| r.clip_scroll[p]);
    let node = &frame.spatial[i];
    let (world, clip) = match &node.kind {
        SpatialKind::Reference { transform } => (pw * affine(transform), pclip),
        SpatialKind::Scroll { .. } => {
            let (x, y) = offset(i);
            let world = pw * Affine::translate((-f64::from(x), -f64::from(y)));
            let clip = if node.id == ROOT_SCROLL { pclip } else { Some(i) };
            (world, clip)
        }
        SpatialKind::Sticky {
            frame: f,
            margins,
            vertical_range,
            horizontal_range,
        } => {
            let viewport = nearest_scroll(frame, r, parent)
                .and_then(|s| r.scroll_rect(frame, s))
                .unwrap_or_else(|| {
                    Rect::new(0.0, 0.0, f64::from(r.viewport.0), f64::from(r.viewport.1))
                });
            let (dx, dy) = match invert(pw) {
                Some(inv) => redrob_scene::sticky_offset(
                    *f,
                    *margins,
                    *vertical_range,
                    *horizontal_range,
                    scene_rect(inv.transform_rect_bbox(viewport)),
                ),
                None => (0.0, 0.0),
            };
            (
                pw * Affine::translate((f64::from(dx), f64::from(dy))),
                pclip,
            )
        }
    };
    r.world[i] = world;
    r.clip_scroll[i] = clip;
    state[i] = 2;
}

/// The nearest scroll node at or above `from`.
fn nearest_scroll(frame: &Frame, r: &Resolved, mut from: Option<usize>) -> Option<usize> {
    let mut steps = 0;
    while let Some(i) = from {
        if matches!(frame.spatial[i].kind, SpatialKind::Scroll { .. }) {
            return Some(i);
        }
        steps += 1;
        if steps > frame.spatial.len() {
            return None;
        }
        from = r.parent[i];
    }
    None
}
