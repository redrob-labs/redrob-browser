//! Spatial tree resolution: maps every spatial node to viewport space for
//! the current scroll offsets, and builds each node's scroll clip chain.
//!
//! The mapping follows WebRender:
//! - `Reference { transform, projective }`: `world = parent_world * transform`.
//!   A `projective` 4x4 is kept beside the affine `world` ([`SpatialMap::projective`]);
//!   the rasterizer draws that node's subtree flat and projects it.
//! - `Scroll { frame, offset, .. }`: children are in the parent's space,
//!   moved by the scroll offset: `world = parent_world * translate(-offset)`.
//!   `frame` (in the parent's space) clips the node and all descendants.
//! - `Sticky { frame, .. }`: children are in the parent's space, moved by
//!   [`redrob_scene::sticky_offset`] against the nearest scroll frame's
//!   visible rect expressed in the parent's space. Without a scroll ancestor
//!   the viewport is used.
//! - A node with no parent hangs off `ROOT_SPATIAL`; an unknown node (or a
//!   frame that omits `ROOT_SPATIAL`) resolves to identity.
//!
//! Scroll offsets come from the caller's map, keyed by the Scroll node's
//! `node` (DOM node id, 0 for the document). A scroller missing from the map,
//! or one whose `offset_changed_by_page` is set, uses the frame's `offset`.
//! Offsets are clamped to `0..=content - frame size`.

use std::collections::HashMap;

use redrob_scene::{
    sticky_offset, Frame, HitRegion, Rect, SpatialId, SpatialKind, SpatialNode, ROOT_SPATIAL,
};
use vello_cpu::kurbo::{self, Affine, Point, RoundedRect, RoundedRectRadii, Shape};

/// One scroll frame's clip: `rect` in the space given by `transform`
/// (the scroller's parent space mapped to viewport CSS px).
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct ScrollClip {
    pub transform: Affine,
    pub rect: Rect,
    /// The next scroll frame further out, if any.
    pub outer: Option<SpatialId>,
}

#[derive(Clone, Copy, Debug)]
struct Resolved {
    world: Affine,
    /// Nearest scroll frame at or above this node.
    scroll: Option<SpatialId>,
}

const IDENTITY: Resolved = Resolved {
    world: Affine::IDENTITY,
    scroll: None,
};

/// Resolved spatial tree for one frame and one set of scroll offsets.
#[derive(Clone, Debug)]
pub struct SpatialMap {
    resolved: HashMap<SpatialId, Resolved>,
    clips: HashMap<SpatialId, ScrollClip>,
    offsets: HashMap<SpatialId, (f32, f32)>,
    viewport: Rect,
    /// Reference nodes with a projective matrix, and each node's outermost
    /// projective ancestor-or-self.
    projective: HashMap<SpatialId, [f32; 16]>,
    projective_root: HashMap<SpatialId, SpatialId>,
    /// Per projective node: the affine through the projected corners of
    /// the bounds of its own items (see [`SpatialMap::flattened_transform`]).
    projective_fit: HashMap<SpatialId, Affine>,
}

/// The affine through the projections of three corners of `r` under the
/// x, y, w part of row-major 4x4 `m`.
fn affine_fit(m: &[f32; 16], r: kurbo::Rect) -> Option<Affine> {
    let m = m.map(f64::from);
    let project = |x: f64, y: f64| {
        let w = m[12] * x + m[13] * y + m[15];
        (w > 1e-9).then(|| {
            (
                (m[0] * x + m[1] * y + m[3]) / w,
                (m[4] * x + m[5] * y + m[7]) / w,
            )
        })
    };
    let (w, h) = (r.width().max(1e-6), r.height().max(1e-6));
    let p0 = project(r.x0, r.y0)?;
    let p1 = project(r.x1, r.y0)?;
    let p2 = project(r.x0, r.y1)?;
    let (a, b) = ((p1.0 - p0.0) / w, (p1.1 - p0.1) / w);
    let (c, d) = ((p2.0 - p0.0) / h, (p2.1 - p0.1) / h);
    let e = p0.0 - a * r.x0 - c * r.y0;
    let f = p0.1 - b * r.x0 - d * r.y0;
    Some(Affine::new([a, b, c, d, e, f]))
}

pub fn to_kurbo_affine(a: [f32; 6]) -> Affine {
    Affine::new(a.map(f64::from))
}

pub fn to_kurbo_rect(r: Rect) -> kurbo::Rect {
    kurbo::Rect::new(
        r.x as f64,
        r.y as f64,
        (r.x + r.w) as f64,
        (r.y + r.h) as f64,
    )
}

fn from_kurbo_rect(r: kurbo::Rect) -> Rect {
    Rect {
        x: r.x0 as f32,
        y: r.y0 as f32,
        w: (r.x1 - r.x0) as f32,
        h: (r.y1 - r.y0) as f32,
    }
}

/// Rounded rect shape with CSS corner order (tl, tr, br, bl).
pub fn rounded(rect: Rect, radii: [f32; 4]) -> RoundedRect {
    let r = radii.map(|v| v.max(0.0) as f64);
    RoundedRect::from_rect(
        to_kurbo_rect(rect),
        RoundedRectRadii::new(r[0], r[1], r[2], r[3]),
    )
}

fn invertible(a: &Affine) -> bool {
    a.determinant().abs() > 1e-12
}

impl SpatialMap {
    pub fn new(frame: &Frame, scroll: &HashMap<u64, (f32, f32)>) -> Self {
        let nodes: HashMap<SpatialId, &SpatialNode> =
            frame.spatial.iter().map(|n| (n.id, n)).collect();
        let mut map = SpatialMap {
            resolved: HashMap::with_capacity(nodes.len()),
            clips: HashMap::new(),
            offsets: HashMap::new(),
            projective: HashMap::new(),
            projective_root: HashMap::new(),
            projective_fit: HashMap::new(),
            viewport: Rect {
                x: 0.0,
                y: 0.0,
                w: frame.viewport.0,
                h: frame.viewport.1,
            },
        };
        let mut visiting = Vec::new();
        for id in nodes.keys() {
            map.resolve(*id, &nodes, scroll, &mut visiting);
        }
        for node in &frame.spatial {
            if let SpatialKind::Reference {
                projective: Some(matrix),
                ..
            } = &node.kind
            {
                map.projective.insert(node.id, *matrix);
            }
        }
        if !map.projective.is_empty() {
            for id in nodes.keys() {
                let mut outer = None;
                let mut current = Some(*id);
                let mut steps = 0;
                while let Some(node) = current {
                    if map.projective.contains_key(&node) {
                        outer = Some(node);
                    }
                    steps += 1;
                    if steps > nodes.len() {
                        break;
                    }
                    current = nodes.get(&node).and_then(|n| n.parent);
                }
                if let Some(outer) = outer {
                    map.projective_root.insert(*id, outer);
                }
            }
            let mut bounds: HashMap<SpatialId, kurbo::Rect> = HashMap::new();
            for di in &frame.items {
                if !map.projective.contains_key(&di.spatial) {
                    continue;
                }
                let r = match &di.item {
                    redrob_scene::Item::Rect { rect, .. }
                    | redrob_scene::Item::RoundedRect { rect, .. }
                    | redrob_scene::Item::BoxShadow { rect, .. }
                    | redrob_scene::Item::LinearGradient { rect, .. }
                    | redrob_scene::Item::RadialGradient { rect, .. }
                    | redrob_scene::Item::External { rect, .. } => to_kurbo_rect(*rect),
                    redrob_scene::Item::Image { dest, .. } => to_kurbo_rect(*dest),
                    _ => continue,
                };
                bounds
                    .entry(di.spatial)
                    .and_modify(|b| *b = b.union(r))
                    .or_insert(r);
            }
            for (id, m) in &map.projective {
                let r = bounds
                    .get(id)
                    .copied()
                    .unwrap_or(kurbo::Rect::new(0.0, 0.0, 100.0, 100.0));
                if let Some(fit) = affine_fit(m, r) {
                    map.projective_fit.insert(*id, fit);
                }
            }
        }
        map
    }

    /// `transform` with every projective node replaced by the affine
    /// through its projected item bounds: for a compositor that cannot
    /// draw projectively.
    pub fn flattened_transform(&self, id: SpatialId) -> Affine {
        let world = self.transform(id);
        let Some(plane) = self.projective_root(id) else {
            return world;
        };
        let Some(fit) = self.projective_fit.get(&plane) else {
            return world;
        };
        let wp = self.transform(plane);
        if !invertible(&wp) {
            return world;
        }
        wp * *fit * wp.inverse() * world
    }

    /// The projective 4x4 of a Reference node, if it has one.
    pub fn projective(&self, id: SpatialId) -> Option<&[f32; 16]> {
        self.projective.get(&id)
    }

    /// The outermost projective Reference at or above `id`.
    pub fn projective_root(&self, id: SpatialId) -> Option<SpatialId> {
        self.projective_root.get(&id).copied()
    }

    fn resolve(
        &mut self,
        id: SpatialId,
        nodes: &HashMap<SpatialId, &SpatialNode>,
        scroll: &HashMap<u64, (f32, f32)>,
        visiting: &mut Vec<SpatialId>,
    ) -> Resolved {
        if let Some(r) = self.resolved.get(&id) {
            return *r;
        }
        let Some(node) = nodes.get(&id) else {
            return IDENTITY;
        };
        if visiting.contains(&id) {
            // A cycle in the tree: break it at identity.
            return IDENTITY;
        }
        visiting.push(id);
        let parent_id = match node.parent {
            Some(p) => Some(p),
            None if id != ROOT_SPATIAL => Some(ROOT_SPATIAL),
            None => None,
        };
        let parent = match parent_id {
            Some(p) => self.resolve(p, nodes, scroll, visiting),
            None => IDENTITY,
        };
        let pw = parent.world;
        let out = match &node.kind {
            SpatialKind::Reference { transform, .. } => Resolved {
                world: pw * to_kurbo_affine(*transform),
                scroll: parent.scroll,
            },
            SpatialKind::Scroll {
                frame,
                content,
                offset,
                offset_changed_by_page,
                node: dom,
            } => {
                let raw = if *offset_changed_by_page {
                    *offset
                } else {
                    scroll.get(dom).copied().unwrap_or(*offset)
                };
                let max_x = (content.0 - frame.w).max(0.0);
                let max_y = (content.1 - frame.h).max(0.0);
                let ox = if raw.0.is_finite() {
                    raw.0.clamp(0.0, max_x)
                } else {
                    0.0
                };
                let oy = if raw.1.is_finite() {
                    raw.1.clamp(0.0, max_y)
                } else {
                    0.0
                };
                self.offsets.insert(id, (ox, oy));
                self.clips.insert(
                    id,
                    ScrollClip {
                        transform: pw,
                        rect: *frame,
                        outer: parent.scroll,
                    },
                );
                Resolved {
                    world: pw * Affine::translate((-ox as f64, -oy as f64)),
                    scroll: Some(id),
                }
            }
            SpatialKind::Sticky {
                frame,
                margins,
                vertical_range,
                horizontal_range,
            } => {
                // The scroll frame's visible rect, in the scroller's content space.
                let (vp, vp_world) = match parent.scroll {
                    Some(s) => {
                        let clip = self.clips[&s];
                        let (ox, oy) = self.offsets[&s];
                        let world = self
                            .resolved
                            .get(&s)
                            .map(|r| r.world)
                            .unwrap_or(Affine::IDENTITY);
                        (
                            Rect {
                                x: clip.rect.x + ox,
                                y: clip.rect.y + oy,
                                ..clip.rect
                            },
                            world,
                        )
                    }
                    None => (self.viewport, Affine::IDENTITY),
                };
                let (dx, dy) = if invertible(&pw) {
                    let to_parent = pw.inverse() * vp_world;
                    let vp_parent =
                        from_kurbo_rect(to_parent.transform_rect_bbox(to_kurbo_rect(vp)));
                    sticky_offset(
                        *frame,
                        *margins,
                        *vertical_range,
                        *horizontal_range,
                        vp_parent,
                    )
                } else {
                    (0.0, 0.0)
                };
                Resolved {
                    world: pw * Affine::translate((dx as f64, dy as f64)),
                    scroll: parent.scroll,
                }
            }
        };
        visiting.pop();
        self.resolved.insert(id, out);
        out
    }

    /// Local-to-viewport transform of a spatial node (CSS px).
    pub fn transform(&self, id: SpatialId) -> Affine {
        self.resolved
            .get(&id)
            .map(|r| r.world)
            .unwrap_or(Affine::IDENTITY)
    }

    /// Same as [`Self::transform`], as `[sx, ky, kx, sy, tx, ty]`.
    pub fn transform_array(&self, id: SpatialId) -> [f32; 6] {
        self.transform(id).as_coeffs().map(|v| v as f32)
    }

    /// The offset in effect for a Scroll node (after clamping).
    pub fn scroll_offset(&self, id: SpatialId) -> Option<(f32, f32)> {
        self.offsets.get(&id).copied()
    }

    /// Nearest scroll frame at or above `id`.
    pub fn scroller_of(&self, id: SpatialId) -> Option<SpatialId> {
        self.resolved.get(&id).and_then(|r| r.scroll)
    }

    pub fn clip(&self, scroller: SpatialId) -> Option<&ScrollClip> {
        self.clips.get(&scroller)
    }

    /// Scroll clips that apply to content of `id`, innermost first.
    pub fn clip_chain(&self, id: SpatialId) -> impl Iterator<Item = &ScrollClip> {
        let mut next = self.scroller_of(id);
        std::iter::from_fn(move || {
            let c = self.clips.get(&next?)?;
            next = c.outer;
            Some(c)
        })
    }

    /// Whether a viewport point is inside every scroll clip of `id`.
    pub fn visible(&self, id: SpatialId, point: Point) -> bool {
        self.clip_chain(id).all(|c| {
            invertible(&c.transform)
                && to_kurbo_rect(c.rect).contains(c.transform.inverse() * point)
        })
    }

    /// Front-most hit region under a viewport point (CSS px).
    pub fn hit_test<'a>(&self, frame: &'a Frame, point: (f32, f32)) -> Option<&'a HitRegion> {
        let p = Point::new(point.0 as f64, point.1 as f64);
        if !to_kurbo_rect(self.viewport).contains(p) {
            return None;
        }
        frame.hits.iter().rev().find(|h| {
            let world = self.transform(h.spatial);
            if !invertible(&world) || !self.visible(h.spatial, p) {
                return false;
            }
            let local = world.inverse() * p;
            if let Some(c) = h.clip {
                if !to_kurbo_rect(c).contains(local) {
                    return false;
                }
            }
            if h.radii.iter().all(|r| *r <= 0.0) {
                to_kurbo_rect(h.rect).contains(local)
            } else {
                rounded(h.rect, h.radii).contains(local)
            }
        })
    }
}

/// Front-most hit region under `point` (viewport CSS px) for the given
/// scroll offsets. Same mapping as [`crate::rasterize`].
pub fn hit_test<'a>(
    frame: &'a Frame,
    scroll: &HashMap<u64, (f32, f32)>,
    point: (f32, f32),
) -> Option<&'a HitRegion> {
    SpatialMap::new(frame, scroll).hit_test(frame, point)
}
