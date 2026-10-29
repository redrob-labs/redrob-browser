//! The spatial tree mapped to the page area for one frame.
//!
//! The mapping itself is `redrob_scene_raster::SpatialMap` (WebRender style,
//! the same one agent screenshots use): a `Reference` node maps through its
//! transform; a `Scroll` node shifts its children by minus its offset and
//! clips them to `frame`; a `Sticky` node shifts them by
//! `redrob_scene::sticky_offset` against its nearest scroll frame. This module
//! indexes that result by node position for the paint and scroll code.

use std::collections::HashMap;

use redrob_scene::{Frame, SpatialId, ROOT_SCROLL};
use redrob_scene_raster::SpatialMap;
use vello::kurbo::{Affine, Point, Rect};

pub fn affine(t: &redrob_scene::Affine) -> Affine {
    Affine::new(t.map(f64::from))
}

pub fn rect(r: &redrob_scene::Rect) -> Rect {
    let (x, y) = (f64::from(r.x), f64::from(r.y));
    Rect::new(x, y, x + f64::from(r.w), y + f64::from(r.h))
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
    /// Per scroll node: its clip, as its parent's transform and its frame.
    pub(super) clips: Vec<Option<(Affine, Rect)>>,
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
    pub fn scroll_clip(&self, _frame: &Frame, s: usize) -> Option<(Affine, Rect)> {
        self.clips.get(s).copied().flatten()
    }

    /// Whether page point `p` is inside every scroll frame clipping node `i`.
    pub fn visible_at(&self, frame: &Frame, i: usize, p: Point) -> bool {
        self.clip_chain(i).into_iter().all(|s| {
            self.scroll_clip(frame, s)
                .is_some_and(|(t, r)| invert(t).is_some_and(|inv| r.contains(inv * p)))
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

/// Map every node of `frame` to the page area with the window's scroll
/// offsets (by scroll node DOM id).
pub fn resolve(
    frame: &Frame,
    index: &HashMap<SpatialId, usize>,
    viewport: (f32, f32),
    offsets: &HashMap<u64, (f32, f32)>,
) -> Resolved {
    let map = SpatialMap::new(frame, offsets);
    let n = frame.spatial.len();
    let at = |id: SpatialId| index.get(&id).copied();
    let parent = frame
        .spatial
        .iter()
        .enumerate()
        .map(|(i, s)| s.parent.and_then(at).filter(|p| *p != i))
        .collect();
    let mut r = Resolved {
        world: Vec::with_capacity(n),
        clip_scroll: Vec::with_capacity(n),
        parent,
        clips: Vec::with_capacity(n),
        viewport,
    };
    for node in &frame.spatial {
        r.world.push(map.transform(node.id));
        r.clip_scroll.push(
            map.scroller_of(node.id)
                .filter(|s| *s != ROOT_SCROLL)
                .and_then(at),
        );
        r.clips.push(
            map.clip(node.id)
                .map(|c| (c.transform, rect(&c.rect))),
        );
    }
    r
}
