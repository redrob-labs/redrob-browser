//! 3D transforms in the CPU paint (CSS Transforms 2).
//!
//! A box whose accumulated 4x4 transform is projective, or a
//! `preserve-3d` box with such descendants, is painted as a 3D rendering
//! context: each plane (the box, and every block-level child reached
//! through `preserve-3d` parents) is painted flat into its own layer, culled
//! when its back faces the viewer and `backface-visibility` is hidden,
//! sorted back to front by depth, and drawn through its homography with
//! perspective-correct sampling.

use obscura_dom::tree::{DomTree, NodeId};
use tiny_skia::Pixmap;

use crate::Mat4;

/// A 3x3 homography `(x, y, 1) -> (X w, Y w, w)`.
pub(crate) type Homography = [[f64; 3]; 3];

/// The accumulated transform of a box: its 4x4 when layout kept one, else
/// its affine, else identity.
pub(crate) fn accumulated(laid: &crate::DomLayout, id: NodeId) -> Mat4 {
    if let Some(matrix) = laid.projective_transforms.get(&id) {
        return *matrix;
    }
    laid.transforms
        .get(&id)
        .map_or(Mat4::IDENTITY, |affine| Mat4::from_affine(*affine))
}

/// The plane part of a 4x4: rows and columns x, y, w.
pub(crate) fn homography(m: &Mat4) -> Homography {
    let m = &m.m;
    let pick = |r: usize, c: usize| m[r][c] as f64;
    [
        [pick(0, 0), pick(0, 1), pick(0, 3)],
        [pick(1, 0), pick(1, 1), pick(1, 3)],
        [pick(3, 0), pick(3, 1), pick(3, 3)],
    ]
}

fn is_projective(h: &Homography) -> bool {
    let scale = h[2][2].abs().max(1e-12);
    h[2][0].abs() / scale > 1e-7 || h[2][1].abs() / scale > 1e-7
}

/// General 4x4 inverse (cofactors), or None when singular.
pub(crate) fn invert(m: &Mat4) -> Option<Mat4> {
    let a: Vec<f64> = m.m.iter().flatten().map(|v| *v as f64).collect();
    let mut inv = [0f64; 16];
    inv[0] = a[5] * a[10] * a[15] - a[5] * a[11] * a[14] - a[9] * a[6] * a[15]
        + a[9] * a[7] * a[14]
        + a[13] * a[6] * a[11]
        - a[13] * a[7] * a[10];
    inv[4] = -a[4] * a[10] * a[15] + a[4] * a[11] * a[14] + a[8] * a[6] * a[15]
        - a[8] * a[7] * a[14]
        - a[12] * a[6] * a[11]
        + a[12] * a[7] * a[10];
    inv[8] = a[4] * a[9] * a[15] - a[4] * a[11] * a[13] - a[8] * a[5] * a[15]
        + a[8] * a[7] * a[13]
        + a[12] * a[5] * a[11]
        - a[12] * a[7] * a[9];
    inv[12] = -a[4] * a[9] * a[14] + a[4] * a[10] * a[13] + a[8] * a[5] * a[14]
        - a[8] * a[6] * a[13]
        - a[12] * a[5] * a[10]
        + a[12] * a[6] * a[9];
    inv[1] = -a[1] * a[10] * a[15] + a[1] * a[11] * a[14] + a[9] * a[2] * a[15]
        - a[9] * a[3] * a[14]
        - a[13] * a[2] * a[11]
        + a[13] * a[3] * a[10];
    inv[5] = a[0] * a[10] * a[15] - a[0] * a[11] * a[14] - a[8] * a[2] * a[15]
        + a[8] * a[3] * a[14]
        + a[12] * a[2] * a[11]
        - a[12] * a[3] * a[10];
    inv[9] = -a[0] * a[9] * a[15] + a[0] * a[11] * a[13] + a[8] * a[1] * a[15]
        - a[8] * a[3] * a[13]
        - a[12] * a[1] * a[11]
        + a[12] * a[3] * a[9];
    inv[13] = a[0] * a[9] * a[14] - a[0] * a[10] * a[13] - a[8] * a[1] * a[14]
        + a[8] * a[2] * a[13]
        + a[12] * a[1] * a[10]
        - a[12] * a[2] * a[9];
    inv[2] = a[1] * a[6] * a[15] - a[1] * a[7] * a[14] - a[5] * a[2] * a[15]
        + a[5] * a[3] * a[14]
        + a[13] * a[2] * a[7]
        - a[13] * a[3] * a[6];
    inv[6] = -a[0] * a[6] * a[15] + a[0] * a[7] * a[14] + a[4] * a[2] * a[15]
        - a[4] * a[3] * a[14]
        - a[12] * a[2] * a[7]
        + a[12] * a[3] * a[6];
    inv[10] = a[0] * a[5] * a[15] - a[0] * a[7] * a[13] - a[4] * a[1] * a[15]
        + a[4] * a[3] * a[13]
        + a[12] * a[1] * a[7]
        - a[12] * a[3] * a[5];
    inv[14] = -a[0] * a[5] * a[14] + a[0] * a[6] * a[13] + a[4] * a[1] * a[14]
        - a[4] * a[2] * a[13]
        - a[12] * a[1] * a[6]
        + a[12] * a[2] * a[5];
    inv[3] = -a[1] * a[6] * a[11] + a[1] * a[7] * a[10] + a[5] * a[2] * a[11]
        - a[5] * a[3] * a[10]
        - a[9] * a[2] * a[7]
        + a[9] * a[3] * a[6];
    inv[7] = a[0] * a[6] * a[11] - a[0] * a[7] * a[10] - a[4] * a[2] * a[11]
        + a[4] * a[3] * a[10]
        + a[8] * a[2] * a[7]
        - a[8] * a[3] * a[6];
    inv[11] = -a[0] * a[5] * a[11] + a[0] * a[7] * a[9] + a[4] * a[1] * a[11]
        - a[4] * a[3] * a[9]
        - a[8] * a[1] * a[7]
        + a[8] * a[3] * a[5];
    inv[15] = a[0] * a[5] * a[10] - a[0] * a[6] * a[9] - a[4] * a[1] * a[10]
        + a[4] * a[2] * a[9]
        + a[8] * a[1] * a[6]
        - a[8] * a[2] * a[5];
    let det = a[0] * inv[0] + a[1] * inv[4] + a[2] * inv[8] + a[3] * inv[12];
    if !det.is_finite() || det.abs() < 1e-18 {
        return None;
    }
    let mut out = Mat4::IDENTITY;
    for (i, value) in inv.iter().enumerate() {
        out.m[i / 4][i % 4] = (value / det) as f32;
    }
    Some(out)
}

fn is_block_level(style: &crate::LayoutStyle) -> bool {
    style.display != crate::Display::Inline || style.is_inline_block
}

/// The planes of `root`'s 3D rendering context in tree order, each with
/// whether it is painted without its children (a `preserve-3d` plane,
/// whose block-level children are planes of their own).
pub(crate) fn context_planes(
    tree: &DomTree,
    laid: &crate::DomLayout,
    root: NodeId,
) -> Vec<(NodeId, bool)> {
    let mut out = Vec::new();
    let mut stack = vec![root];
    while let Some(id) = stack.pop() {
        let preserve = laid.styles.get(&id).is_some_and(|style| style.preserve_3d);
        out.push((id, preserve));
        if preserve {
            let children: Vec<NodeId> = crate::dom::rendered_children(tree, id)
                .into_iter()
                .filter(|child| laid.styles.get(child).is_some_and(is_block_level))
                .collect();
            stack.extend(children.into_iter().rev());
        }
    }
    out
}

/// The children a `preserve-3d` plane leaves to their own planes.
pub(crate) fn plane_children(tree: &DomTree, laid: &crate::DomLayout, id: NodeId) -> Vec<NodeId> {
    crate::dom::rendered_children(tree, id)
        .into_iter()
        .filter(|child| laid.styles.get(child).is_some_and(is_block_level))
        .collect()
}

fn qualifies(tree: &DomTree, laid: &crate::DomLayout, id: NodeId) -> bool {
    let projective = |id: NodeId| {
        laid.projective_transforms
            .get(&id)
            .is_some_and(|matrix| is_projective(&homography(matrix)))
    };
    if projective(id) {
        return true;
    }
    laid.styles.get(&id).is_some_and(|style| style.preserve_3d)
        && context_planes(tree, laid, id)
            .into_iter()
            .any(|(plane, _)| plane != id && laid.projective_transforms.contains_key(&plane))
}

/// Whether `id` roots a 3D rendering context the paint must project: it
/// qualifies, and no ancestor reached through `preserve-3d` parents does.
pub(crate) fn is_context_root(tree: &DomTree, laid: &crate::DomLayout, id: NodeId) -> bool {
    if !laid.projective_transforms.contains_key(&id)
        && !laid.styles.get(&id).is_some_and(|style| style.preserve_3d)
    {
        return false;
    }
    let mut parent = crate::dom::rendered_parent(tree, id);
    while let Some(ancestor) = parent {
        if !laid
            .styles
            .get(&ancestor)
            .is_some_and(|style| style.preserve_3d)
        {
            break;
        }
        if qualifies(tree, laid, ancestor) {
            return false;
        }
        parent = crate::dom::rendered_parent(tree, ancestor);
    }
    qualifies(tree, laid, id)
}

/// Map `(x, y)` through `h`, or None behind the viewer.
pub(crate) fn map(h: &Homography, x: f64, y: f64) -> Option<(f64, f64)> {
    let w = h[2][0] * x + h[2][1] * y + h[2][2];
    if !w.is_finite() || w <= 1e-9 {
        return None;
    }
    Some((
        (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
        (h[1][0] * x + h[1][1] * y + h[1][2]) / w,
    ))
}

pub(crate) fn multiply(a: &Homography, b: &Homography) -> Homography {
    let mut out = [[0.0; 3]; 3];
    for (row, cells) in out.iter_mut().enumerate() {
        for (col, cell) in cells.iter_mut().enumerate() {
            *cell = (0..3).map(|k| a[row][k] * b[k][col]).sum();
        }
    }
    out
}

/// A plane homography as a row-major 4x4 (z row and column identity).
pub(crate) fn to_4x4(h: &Homography) -> [f32; 16] {
    let f = |v: f64| v as f32;
    [
        f(h[0][0]),
        f(h[0][1]),
        0.0,
        f(h[0][2]),
        f(h[1][0]),
        f(h[1][1]),
        0.0,
        f(h[1][2]),
        0.0,
        0.0,
        1.0,
        0.0,
        f(h[2][0]),
        f(h[2][1]),
        0.0,
        f(h[2][2]),
    ]
}

pub(crate) fn translation(x: f64, y: f64) -> Homography {
    [[1.0, 0.0, x], [0.0, 1.0, y], [0.0, 0.0, 1.0]]
}

fn invert3(h: &Homography) -> Option<Homography> {
    let det = h[0][0] * (h[1][1] * h[2][2] - h[1][2] * h[2][1])
        - h[0][1] * (h[1][0] * h[2][2] - h[1][2] * h[2][0])
        + h[0][2] * (h[1][0] * h[2][1] - h[1][1] * h[2][0]);
    if !det.is_finite() || det.abs() < 1e-14 {
        return None;
    }
    let inv = 1.0 / det;
    Some([
        [
            (h[1][1] * h[2][2] - h[1][2] * h[2][1]) * inv,
            (h[0][2] * h[2][1] - h[0][1] * h[2][2]) * inv,
            (h[0][1] * h[1][2] - h[0][2] * h[1][1]) * inv,
        ],
        [
            (h[1][2] * h[2][0] - h[1][0] * h[2][2]) * inv,
            (h[0][0] * h[2][2] - h[0][2] * h[2][0]) * inv,
            (h[0][2] * h[1][0] - h[0][0] * h[1][2]) * inv,
        ],
        [
            (h[1][0] * h[2][1] - h[1][1] * h[2][0]) * inv,
            (h[0][1] * h[2][0] - h[0][0] * h[2][1]) * inv,
            (h[0][0] * h[1][1] - h[0][1] * h[1][0]) * inv,
        ],
    ])
}

/// Draw `src` onto `dst` through `h` (src pixel space -> dst pixel space),
/// source-over, sampling bilinearly at the perspective-correct source
/// point of each destination pixel centre. `clip` is a dst-sized mask.
pub(crate) fn draw_projective(
    dst: &mut Pixmap,
    src: &Pixmap,
    h: &Homography,
    clip: Option<&tiny_skia::Mask>,
) {
    let Some(inverse) = invert3(h) else {
        return;
    };
    let (sw, sh) = (src.width() as f64, src.height() as f64);
    let corners = [(0.0, 0.0), (sw, 0.0), (0.0, sh), (sw, sh)];
    let (dw, dh) = (dst.width() as i64, dst.height() as i64);
    let (mut x0, mut y0, mut x1, mut y1) = (0i64, 0i64, dw, dh);
    let projected: Vec<_> = corners.iter().filter_map(|(x, y)| map(h, *x, *y)).collect();
    if projected.len() == 4 {
        x0 = projected
            .iter()
            .map(|p| p.0)
            .fold(f64::MAX, f64::min)
            .floor() as i64;
        y0 = projected
            .iter()
            .map(|p| p.1)
            .fold(f64::MAX, f64::min)
            .floor() as i64;
        x1 = projected
            .iter()
            .map(|p| p.0)
            .fold(f64::MIN, f64::max)
            .ceil() as i64
            + 1;
        y1 = projected
            .iter()
            .map(|p| p.1)
            .fold(f64::MIN, f64::max)
            .ceil() as i64
            + 1;
    }
    let (x0, y0) = (x0.max(0), y0.max(0));
    let (x1, y1) = (x1.min(dw), y1.min(dh));
    if x1 <= x0 || y1 <= y0 {
        return;
    }
    let width = src.width() as i64;
    let height = src.height() as i64;
    let pixels = src.pixels();
    let fetch = |x: i64, y: i64| -> [f32; 4] {
        if x < 0 || y < 0 || x >= width || y >= height {
            return [0.0; 4];
        }
        let p = pixels[(y * width + x) as usize];
        [
            p.red() as f32,
            p.green() as f32,
            p.blue() as f32,
            p.alpha() as f32,
        ]
    };
    let mask = clip.map(|mask| mask.data());
    let out = dst.pixels_mut();
    for y in y0..y1 {
        for x in x0..x1 {
            let (px, py) = (x as f64 + 0.5, y as f64 + 0.5);
            let w = inverse[2][0] * px + inverse[2][1] * py + inverse[2][2];
            if w.abs() < 1e-12 {
                continue;
            }
            let u = (inverse[0][0] * px + inverse[0][1] * py + inverse[0][2]) / w - 0.5;
            let v = (inverse[1][0] * px + inverse[1][1] * py + inverse[1][2]) / w - 0.5;
            // The forward map must put this source point in front of the
            // viewer.
            let fw = h[2][0] * (u + 0.5) + h[2][1] * (v + 0.5) + h[2][2];
            if fw <= 1e-9 || u < -1.0 || v < -1.0 || u > sw || v > sh {
                continue;
            }
            let (ix, iy) = (u.floor() as i64, v.floor() as i64);
            let (fx, fy) = ((u - ix as f64) as f32, (v - iy as f64) as f32);
            let (a, b, c, d) = (
                fetch(ix, iy),
                fetch(ix + 1, iy),
                fetch(ix, iy + 1),
                fetch(ix + 1, iy + 1),
            );
            let mut s = [0f32; 4];
            for k in 0..4 {
                let top = a[k] + (b[k] - a[k]) * fx;
                let bottom = c[k] + (d[k] - c[k]) * fx;
                s[k] = top + (bottom - top) * fy;
            }
            let index = (y * dw + x) as usize;
            let coverage = mask.map_or(1.0, |mask| mask[index] as f32 / 255.0);
            let alpha = s[3] * coverage;
            if alpha <= 0.0 {
                continue;
            }
            let dp = out[index];
            let inv = 1.0 - alpha / 255.0;
            let blend = |src: f32, dst: u8| {
                (src * coverage + dst as f32 * inv)
                    .round()
                    .clamp(0.0, 255.0)
            };
            let a8 = blend(s[3], dp.alpha());
            let r8 = blend(s[0], dp.red()).min(a8);
            let g8 = blend(s[1], dp.green()).min(a8);
            let b8 = blend(s[2], dp.blue()).min(a8);
            if let Some(color) =
                tiny_skia::PremultipliedColorU8::from_rgba(r8 as u8, g8 as u8, b8 as u8, a8 as u8)
            {
                out[index] = color;
            }
        }
    }
}

thread_local! {
    /// Subtrees the current paint pass leaves to other 3D planes.
    static EXCLUDED: std::cell::RefCell<std::collections::HashSet<NodeId>> =
        std::cell::RefCell::new(std::collections::HashSet::new());
}

pub(crate) fn is_excluded(id: NodeId) -> bool {
    EXCLUDED.with(|set| {
        let set = set.borrow();
        !set.is_empty() && set.contains(&id)
    })
}

/// Exclude `roots` and their subtrees; returns what was added, to restore.
pub(crate) fn exclude(tree: &DomTree, roots: &[NodeId]) -> Vec<NodeId> {
    let mut added = Vec::new();
    EXCLUDED.with(|set| {
        let mut set = set.borrow_mut();
        for &root in roots {
            for id in std::iter::once(root).chain(crate::dom::rendered_descendants(tree, root)) {
                if set.insert(id) {
                    added.push(id);
                }
            }
        }
    });
    added
}

pub(crate) fn restore(added: Vec<NodeId>) {
    EXCLUDED.with(|set| {
        let mut set = set.borrow_mut();
        for id in added {
            set.remove(&id);
        }
    });
}
