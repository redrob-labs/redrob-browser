//! Hit testing against the frame's hit regions, front to back.

use redrob_scene::{Cursor, HitRegion};
use vello::kurbo::{Point, Rect};

use super::spatial::{self, invert, Resolved};
use super::state::TabScene;

/// What the pointer is over.
#[derive(Clone, Debug, PartialEq)]
pub struct Hover {
    pub node: u64,
    pub cursor: Cursor,
    pub is_text: bool,
    pub link: Option<String>,
}

impl TabScene {
    /// The front-most hit region at page point `p`.
    pub(super) fn hit_index(&self, res: &Resolved, p: Point) -> Option<usize> {
        let frame = self.frame.as_ref()?;
        let (vw, vh) = res.viewport;
        if p.x < 0.0 || p.y < 0.0 || p.x > f64::from(vw) || p.y > f64::from(vh) {
            return None;
        }
        frame
            .hits
            .iter()
            .enumerate()
            .rev()
            .find(|(_, h)| self.region_contains(res, h, p))
            .map(|(i, _)| i)
    }

    fn region_contains(&self, res: &Resolved, h: &HitRegion, p: Point) -> bool {
        let Some(frame) = &self.frame else {
            return false;
        };
        let Some(&i) = self.index.get(&h.spatial) else {
            return false;
        };
        let Some(inv) = res.world.get(i).copied().and_then(invert) else {
            return false;
        };
        let local = inv * p;
        if !in_rounded(spatial::rect(&h.rect), h.radii, local) {
            return false;
        }
        if let Some(c) = &h.clip {
            if !spatial::rect(c).contains(local) {
                return false;
            }
        }
        res.visible_at(frame, i, p)
    }

    /// What is under page point `at` (CSS px from the page area's corner).
    pub fn hover(&self, res: &Resolved, at: (f32, f32)) -> Option<Hover> {
        let i = self.hit_index(res, Point::new(f64::from(at.0), f64::from(at.1)))?;
        let h = &self.frame.as_ref()?.hits[i];
        Some(Hover {
            node: h.node,
            cursor: h.cursor,
            is_text: h.is_text,
            link: h.link.clone(),
        })
    }
}

/// Whether `p` is inside `r` with corner radii `[tl, tr, br, bl]`.
fn in_rounded(r: Rect, radii: [f32; 4], p: Point) -> bool {
    if !(p.x >= r.x0 && p.x < r.x1 && p.y >= r.y0 && p.y < r.y1) {
        return false;
    }
    let corner = |cx: f64, cy: f64, rad: f32| {
        let rad = f64::from(rad);
        rad <= 0.0 || (p.x - cx).hypot(p.y - cy) <= rad
    };
    let [tl, tr, br, bl] = radii;
    let (x0, y0, x1, y1) = (r.x0, r.y0, r.x1, r.y1);
    let in_tl = p.x < x0 + f64::from(tl) && p.y < y0 + f64::from(tl);
    let in_tr = p.x > x1 - f64::from(tr) && p.y < y0 + f64::from(tr);
    let in_br = p.x > x1 - f64::from(br) && p.y > y1 - f64::from(br);
    let in_bl = p.x < x0 + f64::from(bl) && p.y > y1 - f64::from(bl);
    !(in_tl && !corner(x0 + f64::from(tl), y0 + f64::from(tl), tl)
        || in_tr && !corner(x1 - f64::from(tr), y0 + f64::from(tr), tr)
        || in_br && !corner(x1 - f64::from(br), y1 - f64::from(br), br)
        || in_bl && !corner(x0 + f64::from(bl), y1 - f64::from(bl), bl))
}
