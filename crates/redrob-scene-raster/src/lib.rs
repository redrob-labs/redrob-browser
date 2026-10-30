//! CPU rasterizer for `redrob_scene` frames.
//!
//! Draws a [`Frame`] with vello_cpu using the same spatial mapping, sticky
//! formula, clips and paint model as the window's GPU compositor, so an
//! agent screenshot (`Page.captureScreenshot`) matches what a person sees.
//! [`hit_test`] uses the same mapping, so the window can reuse it.
//!
//! Item semantics this crate fixes (the GPU compositor follows them):
//! - Gradient `start`/`end`/`center` are in the item's local space, like
//!   `rect`. A radial gradient with `radius = (rx, ry)` is a circle of
//!   radius `rx` scaled by `ry / rx` vertically around `center`. Stops are
//!   interpolated in premultiplied sRGB; the gradient pads past its ends.
//! - `BoxShadow.blur` is the CSS blur radius (Gaussian sigma = blur / 2).
//!   An outer shadow is not painted under its own box; an inset one is
//!   painted only inside it. Blurred corners use the largest radius.
//! - `Text.skew` is the horizontal shear factor of `Affine::skew(skew, 0)`
//!   applied to each glyph in y-down space, as Skia: -0.25 is fake italic
//!   (tops lean right). `synthetic_bold` grows outlines by
//!   [`synthetic_bold_amount`] on each side. Glyphs are not hinted.
//! - `PushLayer.transform` is expressed in the layer item's local space and
//!   applies to everything inside the layer, including scroll clips.
//! - Scroll frame clips apply to every item of the scroller and its
//!   descendants; `PushClip`/`PushClipPath` are in their item's space.
//! - Unbalanced `PopClip`/`PopLayer` are ignored; open ones close at the end.
//! - A `Reference` with a `projective` 4x4: the contiguous run of items in
//!   its subtree is drawn flat in its local plane, then projected onto the
//!   frame with perspective-correct sampling; points the matrix maps behind
//!   the viewer are not drawn.

mod resources;
mod spatial;

use std::collections::HashMap;
use std::sync::Arc;

use glifo::FontEmbolden;
use redrob_scene::{
    BlendMode, Brush, DisplayItem, Frame, GradientStop, Item, Rect, SpatialId, Verb,
};
use vello_cpu::color::{AlphaColor, Srgb};
use vello_cpu::kurbo::{self, Affine, BezPath, Diagonal2, Point, Shape};
use vello_cpu::peniko::{
    self, ColorStop, ColorStops, Compose, Extend, Fill, Gradient, ImageAlphaType, ImageQuality,
    ImageSampler, LinearGradientPosition, Mix, RadialGradientPosition,
};
use vello_cpu::{Image, ImageSource, PixelMetadata, Pixmap, RenderContext, Resources};

pub use resources::ResourceStore;
pub use spatial::{hit_test, rounded, to_kurbo_affine, to_kurbo_rect, ScrollClip, SpatialMap};

/// Straight (not premultiplied) RGBA8, row-major.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RgbaImage {
    pub width: u32,
    pub height: u32,
    pub data: Vec<u8>,
}

impl RgbaImage {
    pub fn pixel(&self, x: u32, y: u32) -> [u8; 4] {
        let i = (y as usize * self.width as usize + x as usize) * 4;
        [
            self.data[i],
            self.data[i + 1],
            self.data[i + 2],
            self.data[i + 3],
        ]
    }
}

/// Encode as PNG (8-bit RGBA).
pub fn to_png(img: &RgbaImage) -> Vec<u8> {
    let meta = PixelMetadata {
        may_have_transparency: true,
        alpha_type: ImageAlphaType::Alpha,
    };
    let pm = Pixmap::from_parts(img.data.clone(), img.width as u16, img.height as u16, meta);
    pm.into_png().expect("png encoding into memory")
}

/// Outline expansion for `synthetic_bold`, in CSS px at `size`: half of
/// Skia's fake-bold stroke (size/24 at 9px down to size/32 at 36px).
pub fn synthetic_bold_amount(size: f32) -> f32 {
    let t = ((size - 9.0) / 27.0).clamp(0.0, 1.0);
    let ratio = 1.0 / 24.0 + (1.0 / 32.0 - 1.0 / 24.0) * t;
    size * ratio / 2.0
}

/// Pixel size of the image `rasterize` returns for `clip` at `scale`.
pub fn output_size(clip: Rect, scale: f32) -> (u16, u16) {
    let side = |v: f32| {
        let px = (v * scale).ceil();
        if px.is_finite() {
            px.clamp(1.0, u16::MAX as f32) as u16
        } else {
            1
        }
    };
    (side(clip.w), side(clip.h))
}

/// Rasterize `frame` for the viewport region `clip` (CSS px) at `scale`
/// device px per CSS px, with the given scroll offsets (keyed by the Scroll
/// node's DOM `node`; missing ones use the frame's offset).
pub fn rasterize(
    frame: &Frame,
    resources: &ResourceStore,
    scroll: &HashMap<u64, (f32, f32)>,
    clip: Rect,
    scale: f32,
) -> RgbaImage {
    let map = SpatialMap::new(frame, scroll);
    let (w, h) = output_size(clip, scale);
    let scale = if scale.is_finite() && scale > 0.0 {
        scale as f64
    } else {
        1.0
    };
    let root = Affine::scale(scale) * Affine::translate((-clip.x as f64, -clip.y as f64));
    let mut ctx = RenderContext::new(w, h);
    let mut glyphs = resources.glyphs.lock().unwrap_or_else(|e| e.into_inner());
    {
        let mut p = Painter {
            ctx: &mut ctx,
            res: resources,
            glyphs: &mut glyphs,
            map: &map,
            root,
            screen: kurbo::Rect::new(0.0, 0.0, w as f64, h as f64),
            layer_xf: Affine::IDENTITY,
            layers: Vec::new(),
            user_clips: 0,
            scroll_clip: None,
        };
        p.background(frame.background);
        let items = &frame.items;
        let mut i = 0;
        while i < items.len() {
            if let Some(plane) = map.projective_root(items[i].spatial) {
                let start = i;
                while i < items.len() && map.projective_root(items[i].spatial) == Some(plane) {
                    i += 1;
                }
                p.projected(&items[start..i], plane);
                continue;
            }
            p.item(&items[i]);
            i += 1;
        }
        p.finish();
    }
    ctx.flush();
    let mut pm = Pixmap::new(w, h);
    ctx.render(&mut pm, &mut glyphs);
    RgbaImage {
        width: w as u32,
        height: h as u32,
        data: pm.take_rgba8(ImageAlphaType::Alpha),
    }
}

fn color(c: [f32; 4]) -> AlphaColor<Srgb> {
    let f = |v: f32| {
        if v.is_finite() {
            v.clamp(0.0, 1.0)
        } else {
            0.0
        }
    };
    AlphaColor::new([f(c[0]), f(c[1]), f(c[2]), f(c[3])])
}

fn path(verbs: &[Verb]) -> BezPath {
    let mut p = BezPath::new();
    let pt = |x: f32, y: f32| Point::new(x as f64, y as f64);
    let mut open = false;
    for v in verbs {
        match *v {
            Verb::M(x, y) => {
                p.move_to(pt(x, y));
                open = true;
            }
            Verb::L(x, y) if open => p.line_to(pt(x, y)),
            Verb::Q(a, b, x, y) if open => p.quad_to(pt(a, b), pt(x, y)),
            Verb::C(a, b, c, d, x, y) if open => p.curve_to(pt(a, b), pt(c, d), pt(x, y)),
            Verb::Z if open => p.close_path(),
            // A segment before any move-to starts a subpath at its end point.
            Verb::L(x, y) | Verb::Q(_, _, x, y) | Verb::C(_, _, _, _, x, y) => {
                p.move_to(pt(x, y));
                open = true;
            }
            Verb::Z => {}
        }
    }
    p
}

fn stops(list: &[GradientStop]) -> ColorStops {
    let v: Vec<ColorStop> = list
        .iter()
        .map(|s| ColorStop::from((s.offset.clamp(0.0, 1.0), color(s.color))))
        .collect();
    ColorStops::from(&v[..])
}

fn blend(b: BlendMode) -> peniko::BlendMode {
    let mix = match b {
        BlendMode::Normal => Mix::Normal,
        BlendMode::Multiply => Mix::Multiply,
        BlendMode::Screen => Mix::Screen,
        BlendMode::Overlay => Mix::Overlay,
        BlendMode::Darken => Mix::Darken,
        BlendMode::Lighten => Mix::Lighten,
        BlendMode::ColorDodge => Mix::ColorDodge,
        BlendMode::ColorBurn => Mix::ColorBurn,
        BlendMode::HardLight => Mix::HardLight,
        BlendMode::SoftLight => Mix::SoftLight,
        BlendMode::Difference => Mix::Difference,
        BlendMode::Exclusion => Mix::Exclusion,
        BlendMode::Hue => Mix::Hue,
        BlendMode::Saturation => Mix::Saturation,
        BlendMode::Color => Mix::Color,
        BlendMode::Luminosity => Mix::Luminosity,
    };
    peniko::BlendMode::new(mix, Compose::SrcOver)
}

fn inflate(r: Rect, by: f32) -> Rect {
    Rect {
        x: r.x - by,
        y: r.y - by,
        w: r.w + 2.0 * by,
        h: r.h + 2.0 * by,
    }
}

fn offset(r: Rect, d: (f32, f32)) -> Rect {
    Rect {
        x: r.x + d.0,
        y: r.y + d.1,
        ..r
    }
}

fn is_axis_aligned(a: &Affine) -> bool {
    let c = a.as_coeffs();
    c[1].abs() < 1e-9 && c[2].abs() < 1e-9
}

fn empty(r: &kurbo::Rect) -> bool {
    !(r.x1 > r.x0 && r.y1 > r.y0)
}

/// Gaussian kernel reach used by vello_cpu's blurred rect.
const BLUR_REACH: f32 = 2.5;

struct Painter<'a> {
    ctx: &'a mut RenderContext,
    res: &'a ResourceStore,
    glyphs: &'a mut Resources,
    map: &'a SpatialMap,
    root: Affine,
    screen: kurbo::Rect,
    /// Extra transform from the open layers (identity without layer transforms).
    layer_xf: Affine,
    layers: Vec<Affine>,
    user_clips: usize,
    /// The scroll clip chain currently pushed on top of the clip stack:
    /// (scroller, number of clip entries pushed).
    scroll_clip: Option<(SpatialId, usize)>,
}

type Homography = [[f64; 3]; 3];

fn mul3(a: &Homography, b: &Homography) -> Homography {
    let mut out = [[0.0; 3]; 3];
    for (r, row) in out.iter_mut().enumerate() {
        for (c, cell) in row.iter_mut().enumerate() {
            *cell = (0..3).map(|k| a[r][k] * b[k][c]).sum();
        }
    }
    out
}

fn affine3(a: &Affine) -> Homography {
    let c = a.as_coeffs();
    [[c[0], c[2], c[4]], [c[1], c[3], c[5]], [0.0, 0.0, 1.0]]
}

fn inv3(h: &Homography) -> Option<Homography> {
    let det = h[0][0] * (h[1][1] * h[2][2] - h[1][2] * h[2][1])
        - h[0][1] * (h[1][0] * h[2][2] - h[1][2] * h[2][0])
        + h[0][2] * (h[1][0] * h[2][1] - h[1][1] * h[2][0]);
    if !det.is_finite() || det.abs() < 1e-14 {
        return None;
    }
    let i = 1.0 / det;
    Some([
        [
            (h[1][1] * h[2][2] - h[1][2] * h[2][1]) * i,
            (h[0][2] * h[2][1] - h[0][1] * h[2][2]) * i,
            (h[0][1] * h[1][2] - h[0][2] * h[1][1]) * i,
        ],
        [
            (h[1][2] * h[2][0] - h[1][0] * h[2][2]) * i,
            (h[0][0] * h[2][2] - h[0][2] * h[2][0]) * i,
            (h[0][2] * h[1][0] - h[0][0] * h[1][2]) * i,
        ],
        [
            (h[1][0] * h[2][1] - h[1][1] * h[2][0]) * i,
            (h[0][1] * h[2][0] - h[0][0] * h[2][1]) * i,
            (h[0][0] * h[1][1] - h[0][1] * h[1][0]) * i,
        ],
    ])
}

fn apply3(h: &Homography, x: f64, y: f64) -> Option<(f64, f64)> {
    let w = h[2][0] * x + h[2][1] * y + h[2][2];
    if !w.is_finite() || w <= 1e-9 {
        return None;
    }
    Some((
        (h[0][0] * x + h[0][1] * y + h[0][2]) / w,
        (h[1][0] * x + h[1][1] * y + h[1][2]) / w,
    ))
}

/// Largest side of the flat layer a projected plane is drawn into.
const MAX_PLANE_SIDE: f64 = 4096.0;

impl Painter<'_> {
    /// Draw `items` (the subtree of projective Reference `plane`) flat in the
    /// plane's local space, then project that layer onto the frame.
    fn projected(&mut self, items: &[DisplayItem], plane: SpatialId) {
        let Some(m) = self.map.projective(plane).copied() else {
            for di in items {
                self.item(di);
            }
            return;
        };
        let m = m.map(f64::from);
        let local: Homography = [
            [m[0], m[1], m[3]],
            [m[4], m[5], m[7]],
            [m[12], m[13], m[15]],
        ];
        // plane local -> device px.
        let world = self.root * self.layer_xf * self.map.transform(plane);
        let to_device = mul3(&affine3(&world), &local);
        let Some(from_device) = inv3(&to_device) else {
            return;
        };
        // The part of the plane the screen shows.
        let (sw, sh) = (self.screen.x1, self.screen.y1);
        let corners: Vec<(f64, f64)> = [(0.0, 0.0), (sw, 0.0), (0.0, sh), (sw, sh)]
            .iter()
            .filter_map(|(x, y)| apply3(&from_device, *x, *y))
            .collect();
        let half = MAX_PLANE_SIDE / 2.0;
        let (mut x0, mut y0, mut x1, mut y1) = (-half, -half, half, half);
        if corners.len() == 4 {
            x0 = corners
                .iter()
                .map(|c| c.0)
                .fold(f64::MAX, f64::min)
                .max(-half);
            y0 = corners
                .iter()
                .map(|c| c.1)
                .fold(f64::MAX, f64::min)
                .max(-half);
            x1 = corners
                .iter()
                .map(|c| c.0)
                .fold(f64::MIN, f64::max)
                .min(half);
            y1 = corners
                .iter()
                .map(|c| c.1)
                .fold(f64::MIN, f64::max)
                .min(half);
        }
        // Local layer resolution: the plane's largest device scale, capped.
        let scale = {
            let c = world.as_coeffs();
            (c[0].hypot(c[1])).max(c[2].hypot(c[3])).clamp(0.25, 4.0)
        };
        let lw = ((x1 - x0) * scale).ceil().clamp(1.0, MAX_PLANE_SIDE) as u16;
        let lh = ((y1 - y0) * scale).ceil().clamp(1.0, MAX_PLANE_SIDE) as u16;
        if x1 <= x0 || y1 <= y0 {
            return;
        }
        let sx = lw as f64 / (x1 - x0);
        let sy = lh as f64 / (y1 - y0);
        // Flat pass: device(s) = layer_root * inv(world_plane) * world(s).
        let layer_root = Affine::scale_non_uniform(sx, sy) * Affine::translate((-x0, -y0));
        let mut ctx = RenderContext::new(lw, lh);
        {
            let mut sub = Painter {
                ctx: &mut ctx,
                res: self.res,
                glyphs: &mut *self.glyphs,
                map: self.map,
                root: layer_root,
                screen: kurbo::Rect::new(0.0, 0.0, lw as f64, lh as f64),
                layer_xf: self.map.transform(plane).inverse(),
                layers: Vec::new(),
                user_clips: 0,
                scroll_clip: None,
            };
            for di in items {
                sub.item(di);
            }
            sub.finish();
        }
        ctx.flush();
        let mut flat = Pixmap::new(lw, lh);
        ctx.render(&mut flat, self.glyphs);
        // layer px -> plane -> device.
        let layer_to_plane: Homography =
            [[1.0 / sx, 0.0, x0], [0.0, 1.0 / sy, y0], [0.0, 0.0, 1.0]];
        let h = mul3(&to_device, &layer_to_plane);
        let Some(hi) = inv3(&h) else {
            return;
        };
        // Device bbox of the projected layer.
        let (fw, fh) = (lw as f64, lh as f64);
        let projected: Vec<(f64, f64)> = [(0.0, 0.0), (fw, 0.0), (0.0, fh), (fw, fh)]
            .iter()
            .filter_map(|(x, y)| apply3(&h, *x, *y))
            .collect();
        let (mut bx0, mut by0, mut bx1, mut by1) = (0.0, 0.0, sw, sh);
        if projected.len() == 4 {
            bx0 = projected
                .iter()
                .map(|c| c.0)
                .fold(f64::MAX, f64::min)
                .floor()
                .max(0.0);
            by0 = projected
                .iter()
                .map(|c| c.1)
                .fold(f64::MAX, f64::min)
                .floor()
                .max(0.0);
            bx1 = projected
                .iter()
                .map(|c| c.0)
                .fold(f64::MIN, f64::max)
                .ceil()
                .min(sw);
            by1 = projected
                .iter()
                .map(|c| c.1)
                .fold(f64::MIN, f64::max)
                .ceil()
                .min(sh);
        }
        if bx1 <= bx0 || by1 <= by0 {
            return;
        }
        let (ow, oh) = ((bx1 - bx0) as u16, (by1 - by0) as u16);
        let mut out = Pixmap::new(ow, oh);
        let src = flat.data_as_u8_slice();
        let (iw, ih) = (lw as i64, lh as i64);
        let fetch = |x: i64, y: i64| -> [f32; 4] {
            if x < 0 || y < 0 || x >= iw || y >= ih {
                return [0.0; 4];
            }
            let i = ((y * iw + x) * 4) as usize;
            [
                src[i] as f32,
                src[i + 1] as f32,
                src[i + 2] as f32,
                src[i + 3] as f32,
            ]
        };
        {
            let dst = out.data_as_u8_slice_mut();
            for y in 0..oh as usize {
                for x in 0..ow as usize {
                    let (px, py) = (bx0 + x as f64 + 0.5, by0 + y as f64 + 0.5);
                    let w = hi[2][0] * px + hi[2][1] * py + hi[2][2];
                    if w.abs() < 1e-12 {
                        continue;
                    }
                    let u = (hi[0][0] * px + hi[0][1] * py + hi[0][2]) / w - 0.5;
                    let v = (hi[1][0] * px + hi[1][1] * py + hi[1][2]) / w - 0.5;
                    let front = h[2][0] * (u + 0.5) + h[2][1] * (v + 0.5) + h[2][2];
                    if front <= 1e-9 || u < -1.0 || v < -1.0 || u > fw || v > fh {
                        continue;
                    }
                    let (ix, iy) = (u.floor() as i64, v.floor() as i64);
                    let (tx, ty) = ((u - ix as f64) as f32, (v - iy as f64) as f32);
                    let (a, b, c, d) = (
                        fetch(ix, iy),
                        fetch(ix + 1, iy),
                        fetch(ix, iy + 1),
                        fetch(ix + 1, iy + 1),
                    );
                    let o = (y * ow as usize + x) * 4;
                    for k in 0..4 {
                        let top = a[k] + (b[k] - a[k]) * tx;
                        let bottom = c[k] + (d[k] - c[k]) * tx;
                        dst[o + k] = (top + (bottom - top) * ty).round().clamp(0.0, 255.0) as u8;
                    }
                }
            }
        }
        out.set_may_have_transparency(true);
        let dest = kurbo::Rect::new(bx0, by0, bx1, by1);
        if !self.enter(plane, dest) {
            return;
        }
        self.ctx.set_transform(Affine::IDENTITY);
        self.ctx.set_paint(Image {
            image: ImageSource::Pixmap(Arc::new(out)),
            sampler: ImageSampler {
                x_extend: Extend::Pad,
                y_extend: Extend::Pad,
                quality: ImageQuality::Low,
                alpha: 1.0,
            },
        });
        self.ctx.set_paint_transform(Affine::translate((bx0, by0)));
        self.ctx.fill_rect(&dest);
        self.ctx.reset_paint_transform();
    }

    fn background(&mut self, bg: [f32; 4]) {
        if bg[3] <= 0.0 {
            return;
        }
        self.ctx.set_transform(Affine::IDENTITY);
        self.ctx.set_paint(color(bg));
        self.ctx.fill_rect(&self.screen);
    }

    fn device(&self, spatial: SpatialId) -> Affine {
        self.root * self.layer_xf * self.map.transform(spatial)
    }

    fn pop_scroll_clip(&mut self) {
        if let Some((_, n)) = self.scroll_clip.take() {
            for _ in 0..n {
                self.ctx.pop_clip();
            }
        }
    }

    /// Device-space intersection of the scroll clip chain of `spatial`:
    /// Ok(None) = no clip, Ok(Some(r)) = axis-aligned rect, Err(()) = not
    /// axis-aligned (must push each clip as a path).
    fn chain_rect(&self, spatial: SpatialId) -> Result<Option<kurbo::Rect>, ()> {
        let mut acc: Option<kurbo::Rect> = None;
        for c in self.map.clip_chain(spatial) {
            let xf = self.root * self.layer_xf * c.transform;
            if !is_axis_aligned(&xf) {
                return Err(());
            }
            let r = xf.transform_rect_bbox(to_kurbo_rect(c.rect));
            acc = Some(match acc {
                Some(a) => a.intersect(r),
                None => r,
            });
        }
        Ok(acc)
    }

    /// Prepare scroll clipping for a draw item whose device bbox is `bbox`.
    /// Returns false when the item is fully clipped away.
    fn enter(&mut self, spatial: SpatialId, bbox: kurbo::Rect) -> bool {
        let bbox = bbox.intersect(self.screen);
        if empty(&bbox) {
            return false;
        }
        let scroller = self.map.scroller_of(spatial);
        let chain = self.chain_rect(spatial);
        let needed = match (&chain, scroller) {
            (_, None) | (Ok(None), _) => None,
            (Ok(Some(r)), Some(s)) => {
                let inter = r.intersect(bbox);
                if empty(&inter) {
                    return false;
                }
                // Fully inside: no clip needed for this item.
                if inter == bbox {
                    None
                } else {
                    Some(s)
                }
            }
            (Err(()), Some(s)) => Some(s),
        };
        match (needed, self.scroll_clip) {
            (None, Some((cur, _))) if Some(cur) != scroller => self.pop_scroll_clip(),
            (Some(s), Some((cur, _))) if cur == s => {}
            (Some(s), _) => {
                self.pop_scroll_clip();
                let n = match chain {
                    Ok(Some(r)) => {
                        self.ctx.set_transform(Affine::IDENTITY);
                        self.ctx.push_clip_rect(&r);
                        1
                    }
                    _ => {
                        let mut n = 0;
                        let clips: Vec<ScrollClip> =
                            self.map.clip_chain(spatial).copied().collect();
                        for c in clips {
                            self.ctx
                                .set_transform(self.root * self.layer_xf * c.transform);
                            self.ctx.push_clip_rect(&to_kurbo_rect(c.rect));
                            n += 1;
                        }
                        n
                    }
                };
                self.scroll_clip = Some((s, n));
            }
            _ => {}
        }
        true
    }

    fn item(&mut self, di: &DisplayItem) {
        let xf = self.device(di.spatial);
        match &di.item {
            Item::Rect { rect, color: c } => {
                let r = to_kurbo_rect(*rect);
                if c[3] <= 0.0 || !self.enter(di.spatial, xf.transform_rect_bbox(r)) {
                    return;
                }
                self.ctx.set_transform(xf);
                self.ctx.set_paint(color(*c));
                self.ctx.fill_rect(&r);
            }
            Item::RoundedRect {
                rect,
                radii,
                color: c,
            } => {
                if c[3] <= 0.0
                    || !self.enter(di.spatial, xf.transform_rect_bbox(to_kurbo_rect(*rect)))
                {
                    return;
                }
                self.ctx.set_transform(xf);
                self.ctx.set_paint(color(*c));
                self.ctx.fill_path(&rounded(*rect, *radii).to_path(0.1));
            }
            Item::Path {
                verbs,
                brush,
                even_odd,
                transform,
            } => {
                let p = path(verbs);
                let xf = xf * to_kurbo_affine(*transform);
                let Brush::Solid(c) = brush;
                if c[3] <= 0.0
                    || p.is_empty()
                    || !self.enter(di.spatial, xf.transform_rect_bbox(p.bounding_box()))
                {
                    return;
                }
                self.ctx.set_transform(xf);
                self.ctx.set_paint(color(*c));
                self.ctx.set_fill_rule(if *even_odd {
                    Fill::EvenOdd
                } else {
                    Fill::NonZero
                });
                self.ctx.fill_path(&p);
                self.ctx.set_fill_rule(Fill::NonZero);
            }
            Item::Stroke {
                verbs,
                color: c,
                width,
                transform,
            } => {
                let p = path(verbs);
                let xf = xf * to_kurbo_affine(*transform);
                let bbox = p.bounding_box().inflate(*width as f64, *width as f64);
                if c[3] <= 0.0
                    || *width <= 0.0
                    || p.is_empty()
                    || !self.enter(di.spatial, xf.transform_rect_bbox(bbox))
                {
                    return;
                }
                self.ctx.set_transform(xf);
                self.ctx.set_paint(color(*c));
                self.ctx.set_stroke(kurbo::Stroke::new(*width as f64));
                self.ctx.stroke_path(&p);
            }
            Item::LinearGradient {
                rect,
                start,
                end,
                stops: s,
            } => {
                let r = to_kurbo_rect(*rect);
                if s.is_empty() || !self.enter(di.spatial, xf.transform_rect_bbox(r)) {
                    return;
                }
                self.ctx.set_transform(xf);
                if s.len() == 1 || start == end {
                    self.ctx.set_paint(color(s[s.len() - 1].color));
                } else {
                    self.ctx.set_paint(Gradient {
                        kind: LinearGradientPosition {
                            start: Point::new(start.0 as f64, start.1 as f64),
                            end: Point::new(end.0 as f64, end.1 as f64),
                        }
                        .into(),
                        stops: stops(s),
                        extend: Extend::Pad,
                        ..Default::default()
                    });
                }
                self.ctx.fill_rect(&r);
            }
            Item::RadialGradient {
                rect,
                center,
                radius,
                stops: s,
            } => {
                let r = to_kurbo_rect(*rect);
                if s.is_empty() || !self.enter(di.spatial, xf.transform_rect_bbox(r)) {
                    return;
                }
                self.ctx.set_transform(xf);
                if s.len() == 1 || radius.0 <= 0.0 || radius.1 <= 0.0 {
                    self.ctx.set_paint(color(s[s.len() - 1].color));
                    self.ctx.fill_rect(&r);
                } else {
                    let c = Point::new(center.0 as f64, center.1 as f64);
                    self.ctx.set_paint(Gradient {
                        kind: RadialGradientPosition {
                            start_center: c,
                            start_radius: 0.0,
                            end_center: c,
                            end_radius: radius.0,
                        }
                        .into(),
                        stops: stops(s),
                        extend: Extend::Pad,
                        ..Default::default()
                    });
                    let sy = (radius.1 / radius.0) as f64;
                    self.ctx.set_paint_transform(
                        Affine::translate(c.to_vec2())
                            * Affine::scale_non_uniform(1.0, sy)
                            * Affine::translate(-c.to_vec2()),
                    );
                    self.ctx.fill_rect(&r);
                    self.ctx.reset_paint_transform();
                }
            }
            Item::BoxShadow {
                rect,
                radii,
                color: c,
                blur,
                offset: off,
                spread,
                inset,
            } => self.box_shadow(
                di.spatial, xf, *rect, *radii, *c, *blur, *off, *spread, *inset,
            ),
            Item::Image {
                image,
                dest,
                src,
                smooth,
            } => {
                let Some(pm) = self.res.image(*image).cloned() else {
                    return;
                };
                self.image(di.spatial, xf, pm, *dest, *src, *smooth);
            }
            Item::External { key, rect } => {
                let Some(pm) = self.res.external(*key).cloned() else {
                    return;
                };
                let src = Rect {
                    x: 0.0,
                    y: 0.0,
                    w: pm.width() as f32,
                    h: pm.height() as f32,
                };
                self.image(di.spatial, xf, pm, *rect, src, true);
            }
            Item::Text {
                font,
                size,
                color: c,
                glyphs,
                synthetic_bold,
                skew,
            } => {
                let Some(((fd, upem), coords)) = self
                    .res
                    .font_with_coords(*font)
                    .map(|(f, c)| (f.clone(), c.to_vec()))
                else {
                    return;
                };
                if glyphs.is_empty() || *size <= 0.0 || c[3] <= 0.0 {
                    return;
                }
                let (mut x0, mut y0, mut x1, mut y1) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
                for g in glyphs {
                    x0 = x0.min(g.x);
                    y0 = y0.min(g.y);
                    x1 = x1.max(g.x);
                    y1 = y1.max(g.y);
                }
                // Glyph extents are unknown here; two ems around the origins
                // covers ascent, descent, advance and skew.
                let m = 2.0 * size + skew.abs() * size;
                let bbox = kurbo::Rect::new(
                    (x0 - m) as f64,
                    (y0 - m) as f64,
                    (x1 + m) as f64,
                    (y1 + m) as f64,
                );
                if !self.enter(di.spatial, xf.transform_rect_bbox(bbox)) {
                    return;
                }
                self.ctx.set_transform(xf);
                self.ctx.set_paint(color(*c));
                let mut run = self
                    .ctx
                    .glyph_run(self.glyphs, &fd)
                    .font_size(*size)
                    .hint(false);
                if !coords.is_empty() {
                    run = run.normalized_coords(&coords);
                }
                if *skew != 0.0 {
                    run = run.glyph_transform(Affine::skew(*skew as f64, 0.0));
                }
                if *synthetic_bold {
                    // Unhinted outlines are expanded in font units.
                    let a = (synthetic_bold_amount(*size) / *size * upem) as f64;
                    run = run.font_embolden(FontEmbolden::new(Diagonal2 { xx: a, yy: a }));
                }
                let _ = run.fill_glyphs(glyphs.iter().map(|g| vello_cpu::Glyph {
                    id: g.id,
                    x: g.x,
                    y: g.y,
                }));
            }
            Item::PushClip { rect, radii } => {
                self.pop_scroll_clip();
                self.ctx.set_transform(xf);
                if radii.iter().all(|r| *r <= 0.0) {
                    self.ctx.push_clip_rect(&to_kurbo_rect(*rect));
                } else {
                    self.ctx
                        .push_clip_path(&rounded(*rect, *radii).to_path(0.1));
                }
                self.user_clips += 1;
            }
            Item::PushClipPath { verbs, even_odd } => {
                self.pop_scroll_clip();
                self.ctx.set_transform(xf);
                self.ctx.set_fill_rule(if *even_odd {
                    Fill::EvenOdd
                } else {
                    Fill::NonZero
                });
                self.ctx.push_clip_path(&path(verbs));
                self.ctx.set_fill_rule(Fill::NonZero);
                self.user_clips += 1;
            }
            Item::PopClip => {
                if self.user_clips > 0 {
                    self.pop_scroll_clip();
                    self.ctx.pop_clip();
                    self.user_clips -= 1;
                }
            }
            Item::PushLayer {
                opacity,
                blend: b,
                transform,
            } => {
                self.pop_scroll_clip();
                self.ctx.set_transform(Affine::IDENTITY);
                let op = if opacity.is_finite() {
                    opacity.clamp(0.0, 1.0)
                } else {
                    1.0
                };
                self.ctx
                    .push_layer(None, Some(blend(*b)), Some(op), None, None);
                self.layers.push(self.layer_xf);
                let t = to_kurbo_affine(*transform);
                if t != Affine::IDENTITY {
                    let wl = self.map.transform(di.spatial);
                    if wl.determinant().abs() > 1e-12 {
                        self.layer_xf = self.layer_xf * wl * t * wl.inverse();
                    }
                }
            }
            Item::PopLayer => {
                if let Some(prev) = self.layers.pop() {
                    self.pop_scroll_clip();
                    self.ctx.pop_layer();
                    self.layer_xf = prev;
                }
            }
        }
    }

    fn image(
        &mut self,
        spatial: SpatialId,
        xf: Affine,
        pm: Arc<Pixmap>,
        dest: Rect,
        src: Rect,
        smooth: bool,
    ) {
        if dest.w <= 0.0 || dest.h <= 0.0 || src.w <= 0.0 || src.h <= 0.0 {
            return;
        }
        let r = to_kurbo_rect(dest);
        if !self.enter(spatial, xf.transform_rect_bbox(r)) {
            return;
        }
        self.ctx.set_transform(xf);
        self.ctx.set_paint(Image {
            image: ImageSource::Pixmap(pm),
            sampler: ImageSampler {
                x_extend: Extend::Pad,
                y_extend: Extend::Pad,
                quality: if smooth {
                    ImageQuality::Medium
                } else {
                    ImageQuality::Low
                },
                alpha: 1.0,
            },
        });
        self.ctx.set_paint_transform(
            Affine::translate((dest.x as f64, dest.y as f64))
                * Affine::scale_non_uniform((dest.w / src.w) as f64, (dest.h / src.h) as f64)
                * Affine::translate((-src.x as f64, -src.y as f64)),
        );
        self.ctx.fill_rect(&r);
        self.ctx.reset_paint_transform();
    }

    #[allow(clippy::too_many_arguments)]
    fn box_shadow(
        &mut self,
        spatial: SpatialId,
        xf: Affine,
        rect: Rect,
        radii: [f32; 4],
        c: [f32; 4],
        blur: f32,
        off: (f32, f32),
        spread: f32,
        inset: bool,
    ) {
        if c[3] <= 0.0 {
            return;
        }
        let blur = if blur.is_finite() { blur.max(0.0) } else { 0.0 };
        let sigma = blur / 2.0;
        let reach = BLUR_REACH * sigma;
        let grow = |r: [f32; 4], by: f32| r.map(|v| if v > 0.0 { (v + by).max(0.0) } else { 0.0 });
        let max_r = |r: [f32; 4]| r.iter().copied().fold(0.0f32, f32::max);
        let box_path = rounded(rect, radii).to_path(0.1);
        if !inset {
            let shadow = offset(inflate(rect, spread), off);
            if shadow.w <= 0.0 || shadow.h <= 0.0 {
                return;
            }
            let reach_rect = inflate(shadow, reach + 1.0);
            if !self.enter(spatial, xf.transform_rect_bbox(to_kurbo_rect(reach_rect))) {
                return;
            }
            self.ctx.set_transform(xf);
            // Clip out the box itself: (everything) minus (box).
            let mut clip = to_kurbo_rect(reach_rect)
                .union(to_kurbo_rect(rect))
                .inflate(1.0, 1.0)
                .to_path(0.1);
            clip.extend(box_path.iter());
            self.ctx.set_fill_rule(Fill::EvenOdd);
            self.ctx.push_clip_path(&clip);
            self.ctx.set_fill_rule(Fill::NonZero);
            self.ctx.set_paint(color(c));
            let sr = grow(radii, spread);
            if sigma <= 0.0 {
                self.ctx.fill_path(&rounded(shadow, sr).to_path(0.1));
            } else {
                self.ctx
                    .fill_blurred_rounded_rect(&to_kurbo_rect(shadow), max_r(sr), sigma, false);
            }
            self.ctx.pop_clip();
        } else {
            if !self.enter(spatial, xf.transform_rect_bbox(to_kurbo_rect(rect))) {
                return;
            }
            self.ctx.set_transform(xf);
            self.ctx.push_clip_path(&box_path);
            self.ctx.set_paint(color(c));
            let inner = offset(inflate(rect, -spread), off);
            let outer = to_kurbo_rect(rect).inflate(1.0, 1.0);
            if inner.w <= 0.0 || inner.h <= 0.0 {
                self.ctx.fill_rect(&outer);
            } else {
                let ir = grow(radii, -spread);
                // Area outside the inner shape (or outside its blur reach).
                let mut ring = outer
                    .union(to_kurbo_rect(inflate(inner, reach)))
                    .to_path(0.1);
                if sigma <= 0.0 {
                    ring.extend(rounded(inner, ir).to_path(0.1).iter());
                } else {
                    ring.extend(to_kurbo_rect(inflate(inner, reach)).to_path(0.1).iter());
                }
                self.ctx.set_fill_rule(Fill::EvenOdd);
                self.ctx.fill_path(&ring);
                self.ctx.set_fill_rule(Fill::NonZero);
                if sigma > 0.0 {
                    self.ctx.fill_blurred_rounded_rect(
                        &to_kurbo_rect(inner),
                        max_r(ir),
                        sigma,
                        true,
                    );
                }
            }
            self.ctx.pop_clip();
        }
    }

    fn finish(&mut self) {
        self.pop_scroll_clip();
        while self.layers.pop().is_some() {
            self.ctx.pop_layer();
        }
        for _ in 0..self.user_clips {
            self.ctx.pop_clip();
        }
        self.user_clips = 0;
    }
}
