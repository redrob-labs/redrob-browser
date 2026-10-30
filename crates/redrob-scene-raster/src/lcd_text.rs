//! LCD (subpixel) text for scene frames, as Chrome draws text on Linux and
//! as the engine's CPU paint does (`redrob_scene::lcd`).
//!
//! vello draws glyphs as grayscale fills. Text that Skia would draw with
//! LCD coverage is instead planned here ([`plan`]): its glyphs are
//! rasterized with the CPU paint's coverage (hinted outlines at 3x
//! horizontal resolution, quarter-pixel x bins, FreeType's LCD filter), the
//! item is left out of the vello scene, and the masks are blended onto the
//! rendered frame with Skia's gamma tables and LCD16 blend ([`composite`],
//! or the window's GPU pass). Where the frame under a glyph pixel is not
//! opaque the glyph blends with grayscale coverage, as Skia does for text
//! on a transparent layer.
//!
//! Text stays grayscale (drawn by vello) when Skia would not use LCD:
//! inside an opacity, blend or transformed layer, under a rounded or path
//! clip, under a non-translation transform (rotated, skewed or projected
//! text), with a translucent color, or with color glyphs (emoji). Planned
//! text is composited after the whole frame, so text that a later item
//! paints over also stays in the vello scene, keeping the paint order.

use std::collections::{HashMap, HashSet};
use std::hash::{Hash, Hasher};
use std::sync::Arc;

use redrob_scene::lcd::{gray_preblend, lcd_preblend, LcdGlyph};
use redrob_scene::{DisplayItem, FontId, Item, Verb};
use swash::scale::{Render, ScaleContext, Source};
use swash::zeno::{Angle, Format, Transform, Vector};
use vello_cpu::kurbo::{self, Affine};

/// What one rasterized glyph is, by its inputs.
#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct GlyphKey {
    pub font: u64,
    pub glyph: u16,
    pub size_bits: u32,
    pub x_bin: u8,
    pub embolden: bool,
    pub skew_bits: u32,
}

/// Rasterized LCD masks, shared across frames.
#[derive(Default)]
pub struct GlyphCache {
    context: ScaleContext,
    /// None: no outline mask (color or bitmap glyph).
    masks: HashMap<GlyphKey, Option<Arc<LcdGlyph>>>,
}

/// Quarter-pixel horizontal subpixel bins (the CPU paint's).
pub fn subpixel(pos: f32) -> (i32, u8) {
    let floor = pos.floor();
    let bin = ((pos - floor) * 4.0).round() as i32;
    if bin == 4 {
        (floor as i32 + 1, 0)
    } else {
        (floor as i32, bin as u8)
    }
}

/// A font as the planner reads it: file bytes, face index and normalized
/// variation coordinates.
pub struct FontRef<'a> {
    pub data: &'a [u8],
    pub index: u32,
    pub coords: &'a [i16],
}

impl GlyphCache {
    pub fn new() -> Self {
        Self::default()
    }

    /// The LCD mask of `glyph` at `size` device px, or None for a glyph
    /// without an outline. Same parameters as the CPU paint.
    #[allow(clippy::too_many_arguments)]
    pub fn mask(
        &mut self,
        font_id: u64,
        font: &FontRef<'_>,
        glyph: u16,
        size: f32,
        x_bin: u8,
        embolden: bool,
        skew_degrees: f32,
    ) -> Option<Arc<LcdGlyph>> {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        font_id.hash(&mut hasher);
        font.coords.hash(&mut hasher);
        let key = GlyphKey {
            font: hasher.finish(),
            glyph,
            size_bits: size.to_bits(),
            x_bin,
            embolden,
            skew_bits: skew_degrees.to_bits(),
        };
        let context = &mut self.context;
        self.masks
            .entry(key)
            .or_insert_with(|| {
                let font_ref = swash::FontRef::from_index(font.data, font.index as usize)?;
                let mut scaler = context
                    .builder(font_ref)
                    .size(size)
                    .hint(true)
                    .normalized_coords(font.coords.iter().copied())
                    .build();
                if scaler.has_color_outlines() || !scaler.has_outlines() {
                    return None;
                }
                let mut render = Render::new(&[Source::Outline]);
                let mut transform = Transform::scale(3.0, 1.0);
                if skew_degrees != 0.0 {
                    transform = Transform::skew(
                        Angle::from_degrees(skew_degrees),
                        Angle::from_degrees(0.0),
                    )
                    .then(&transform);
                }
                render
                    .format(Format::Alpha)
                    .transform(Some(transform))
                    .offset(Vector::new(x_bin as f32 * 0.75, 0.0));
                if embolden {
                    render.embolden(size / 24.0);
                }
                // An empty outline (a space) renders nothing: an empty mask.
                let Some(image) = render.render(&mut scaler, glyph) else {
                    return Some(Arc::new(LcdGlyph::from_subpixels(&[], 0, 0, 0, 0)));
                };
                if image.content != swash::scale::image::Content::Mask {
                    return None;
                }
                Some(Arc::new(LcdGlyph::from_subpixels(
                    &image.data,
                    image.placement.width as usize,
                    image.placement.height as usize,
                    image.placement.left,
                    -image.placement.top,
                )))
            })
            .clone()
    }
}

/// One glyph to blend: its mask's top-left pixel and the mask.
#[derive(Clone)]
pub struct PlacedGlyph {
    pub x: i32,
    pub y: i32,
    pub mask: Arc<LcdGlyph>,
}

/// One text item drawn with LCD coverage.
#[derive(Clone)]
pub struct LcdRun {
    pub item: usize,
    /// Straight RGBA8.
    pub color: [u8; 4],
    /// Device pixel clip (x0, y0, x1, y1), exclusive ends.
    pub clip: Option<[i32; 4]>,
    pub glyphs: Vec<PlacedGlyph>,
}

/// The text items of a frame drawn with LCD coverage.
#[derive(Clone, Default)]
pub struct LcdPlan {
    pub runs: Vec<LcdRun>,
    /// Item indices to leave out of the vello scene.
    pub skip: HashSet<usize>,
}

/// A scroll clip that is not an axis-aligned device rectangle.
#[derive(Clone, Copy, Debug)]
pub struct NotAxisAligned;

/// What the planner needs from a rasterizer's spatial mapping.
pub trait LcdView {
    fn items(&self) -> &[DisplayItem];
    /// Local to device transform of item `i` (open layer transforms not
    /// included); None when the item is not drawn.
    fn device(&self, i: usize) -> Option<Affine>;
    /// Device bounding box of the scroll clips of item `i`: Ok(None) none,
    /// Err when one is not axis-aligned.
    fn scroll_clip(&self, i: usize) -> Result<Option<kurbo::Rect>, NotAxisAligned>;
    /// Whether item `i` is drawn through a projective plane.
    fn projective(&self, _i: usize) -> bool {
        false
    }
    fn font(&self, id: FontId) -> Option<FontRef<'_>>;
    /// Device px of the output.
    fn screen(&self) -> kurbo::Rect;
}

fn to_rect(r: redrob_scene::Rect) -> kurbo::Rect {
    kurbo::Rect::new(
        r.x as f64,
        r.y as f64,
        (r.x + r.w) as f64,
        (r.y + r.h) as f64,
    )
}

fn verbs_bounds(verbs: &[Verb]) -> Option<kurbo::Rect> {
    let mut out: Option<kurbo::Rect> = None;
    let mut add = |x: f32, y: f32| {
        let p = kurbo::Rect::new(x as f64, y as f64, x as f64, y as f64);
        out = Some(out.map_or(p, |r| r.union(p)));
    };
    for v in verbs {
        match *v {
            Verb::M(x, y) | Verb::L(x, y) => add(x, y),
            Verb::Q(a, b, x, y) => {
                add(a, b);
                add(x, y);
            }
            Verb::C(a, b, c, d, x, y) => {
                add(a, b);
                add(c, d);
                add(x, y);
            }
            Verb::Z => {}
        }
    }
    out
}

fn affine(a: &redrob_scene::Affine) -> Affine {
    Affine::new(a.map(|v| v as f64))
}

/// Local bounds of what a drawing item can paint; None for push/pop items
/// and items that paint nothing.
fn item_bounds(item: &Item) -> Option<kurbo::Rect> {
    Some(match item {
        Item::Rect { rect, color } | Item::RoundedRect { rect, color, .. } => {
            if color[3] <= 0.0 {
                return None;
            }
            to_rect(*rect)
        }
        Item::LinearGradient { rect, .. }
        | Item::RadialGradient { rect, .. }
        | Item::External { rect, .. }
        | Item::Backdrop { rect, .. } => to_rect(*rect),
        Item::Image { dest, .. } => to_rect(*dest),
        Item::BoxShadow {
            rect,
            blur,
            offset,
            spread,
            ..
        } => {
            let r = to_rect(*rect);
            let grow = (spread.max(0.0) + blur.max(0.0) * 1.5 + 1.0) as f64;
            r.union(
                r.with_origin((r.x0 + offset.0 as f64, r.y0 + offset.1 as f64))
                    .inflate(grow, grow),
            )
        }
        Item::Path {
            verbs, transform, ..
        } => affine(transform).transform_rect_bbox(verbs_bounds(verbs)?),
        Item::Stroke {
            verbs,
            width,
            transform,
            ..
        } => {
            let w = (*width as f64).max(1.0);
            affine(transform).transform_rect_bbox(verbs_bounds(verbs)?.inflate(w, w))
        }
        Item::Text {
            glyphs, size, skew, ..
        } => {
            let mut r: Option<kurbo::Rect> = None;
            for g in glyphs {
                let p = kurbo::Rect::new(g.x as f64, g.y as f64, g.x as f64, g.y as f64);
                r = Some(r.map_or(p, |a| a.union(p)));
            }
            // Glyph extents from the origins: ascent above, descent below,
            // the last advance (and skew) to the right.
            let (size, skew) = (*size as f64, skew.abs() as f64);
            let r = r?;
            kurbo::Rect::new(
                r.x0 - 0.3 * size - skew * size,
                r.y0 - 1.2 * size,
                r.x1 + 1.5 * size + skew * size,
                r.y1 + 0.5 * size,
            )
        }
        Item::PushClip { .. }
        | Item::PushClipPath { .. }
        | Item::PopClip
        | Item::PushLayer { .. }
        | Item::PopLayer => return None,
    })
}

enum Push {
    /// A device-space rectangular clip.
    Rect(kurbo::Rect),
    /// A rounded or path clip.
    Shape,
    /// A layer; true when it has its own transform.
    Layer(bool),
}

/// Pick the text items of the frame that draw with LCD coverage, and
/// rasterize their glyphs.
pub fn plan(view: &dyn LcdView, cache: &mut GlyphCache) -> LcdPlan {
    let items = view.items();
    let screen = view.screen();
    let mut stack: Vec<Push> = Vec::new();
    // Per item: a planned run, or the device box it may paint (vello).
    let mut runs: Vec<Option<LcdRun>> = Vec::with_capacity(items.len());
    let mut painted: Vec<Option<kurbo::Rect>> = Vec::with_capacity(items.len());
    for (i, di) in items.iter().enumerate() {
        let device = view.device(i);
        let in_layer = stack.iter().any(|p| matches!(p, Push::Layer(_)));
        let in_transformed_layer = stack.iter().any(|p| matches!(p, Push::Layer(true)));
        let rect_clip = stack
            .iter()
            .try_fold(None::<kurbo::Rect>, |acc, p| match p {
                Push::Rect(r) => Some(Some(acc.map_or(*r, |a| a.intersect(*r)))),
                Push::Shape => None,
                Push::Layer(_) => Some(acc),
            });
        match &di.item {
            Item::PushClip { rect, radii } => {
                stack.push(match device {
                    Some(xf)
                        if radii.iter().all(|r| *r <= 0.0)
                            && !in_transformed_layer
                            && is_axis_aligned(&xf) =>
                    {
                        Push::Rect(xf.transform_rect_bbox(to_rect(*rect)))
                    }
                    _ => Push::Shape,
                });
            }
            Item::PushClipPath { .. } => stack.push(Push::Shape),
            Item::PushLayer { transform, .. } => {
                stack.push(Push::Layer(*transform != [1.0, 0.0, 0.0, 1.0, 0.0, 0.0]))
            }
            Item::PopClip | Item::PopLayer => {
                stack.pop();
            }
            _ => {}
        }
        let clipped = |r: kurbo::Rect| -> kurbo::Rect {
            let mut r = r.intersect(screen);
            if let Some(Some(c)) = rect_clip {
                r = r.intersect(c);
            }
            if let Ok(Some(c)) = view.scroll_clip(i) {
                r = r.intersect(c);
            }
            r
        };
        let bounds = item_bounds(&di.item).map(|local| match device {
            Some(xf) if !in_transformed_layer && !view.projective(i) => {
                clipped(xf.transform_rect_bbox(local))
            }
            _ => screen,
        });
        let run = match (&di.item, device) {
            (
                Item::Text {
                    font,
                    size,
                    color,
                    glyphs,
                    synthetic_bold,
                    skew,
                },
                Some(xf),
            ) if !in_layer && !view.projective(i) && color[3] > 0.0 => {
                let c = xf.as_coeffs();
                let scale = c[0];
                let translation = c[1] == 0.0 && c[2] == 0.0 && c[0] == c[3] && scale > 0.0;
                let clip = match (rect_clip, view.scroll_clip(i)) {
                    (Some(a), Ok(b)) => Ok(match (a, b) {
                        (Some(a), Some(b)) => Some(a.intersect(b)),
                        (a, b) => a.or(b),
                    }),
                    _ => Err(NotAxisAligned),
                };
                match (translation, clip, view.font(*font)) {
                    (true, Ok(clip), Some(font_ref)) => {
                        let device_size = *size * scale as f32;
                        let skew_degrees = if *skew != 0.0 {
                            (-*skew).atan().to_degrees()
                        } else {
                            0.0
                        };
                        let mut placed = Vec::with_capacity(glyphs.len());
                        let mut ok = device_size > 0.0;
                        for g in glyphs {
                            if !ok {
                                break;
                            }
                            let p = xf * kurbo::Point::new(g.x as f64, g.y as f64);
                            let (x, x_bin) = subpixel(p.x as f32);
                            let y = (p.y as f32).round() as i32;
                            match cache.mask(
                                font.0,
                                &font_ref,
                                g.id as u16,
                                device_size,
                                x_bin,
                                *synthetic_bold,
                                skew_degrees,
                            ) {
                                Some(mask) => {
                                    if mask.width > 0 && mask.height > 0 {
                                        placed.push(PlacedGlyph {
                                            x: x + mask.left,
                                            y: y + mask.top,
                                            mask,
                                        });
                                    }
                                }
                                None => ok = false,
                            }
                        }
                        ok.then(|| LcdRun {
                            item: i,
                            color: color.map(|v| (v.clamp(0.0, 1.0) * 255.0).round() as u8),
                            clip: clip.map(|r| {
                                [
                                    r.x0.round() as i32,
                                    r.y0.round() as i32,
                                    r.x1.round() as i32,
                                    r.y1.round() as i32,
                                ]
                            }),
                            glyphs: placed,
                        })
                    }
                    _ => None,
                }
            }
            _ => None,
        };
        painted.push(bounds);
        runs.push(run);
    }
    // Later items vello paints over a run keep it in the vello scene.
    let mut out = LcdPlan::default();
    let mut above: Vec<kurbo::Rect> = Vec::new();
    for i in (0..items.len()).rev() {
        if let Some(run) = runs[i].take() {
            let ink = run.glyphs.iter().fold(None::<kurbo::Rect>, |acc, g| {
                let r = kurbo::Rect::new(
                    g.x as f64,
                    g.y as f64,
                    (g.x + g.mask.width) as f64,
                    (g.y + g.mask.height) as f64,
                );
                Some(acc.map_or(r, |a| a.union(r)))
            });
            let Some(ink) = ink else {
                // Nothing to draw (spaces).
                out.skip.insert(i);
                continue;
            };
            let covered = above
                .iter()
                .any(|r| r.x0 < ink.x1 && ink.x0 < r.x1 && r.y0 < ink.y1 && ink.y0 < r.y1);
            if !covered {
                out.skip.insert(i);
                out.runs.push(run);
                continue;
            }
            // vello draws it: its ink is what it paints.
            above.push(ink);
            continue;
        }
        if let Some(r) = painted[i] {
            if r.width() > 0.0 && r.height() > 0.0 {
                above.push(r);
            }
        }
    }
    out.runs.reverse();
    out
}

fn is_axis_aligned(a: &Affine) -> bool {
    let c = a.as_coeffs();
    (c[1].abs() < 1e-6 && c[2].abs() < 1e-6) || (c[0].abs() < 1e-6 && c[3].abs() < 1e-6)
}

/// One run's coverage, ready to blend: per pixel the LCD channel weights
/// in 1/32 (Skia's LCD16 blend scale, the text alpha applied) and the
/// grayscale coverage (0..=255, alpha applied). Overlapping glyph masks of
/// the run combine as `1 - (1 - a)(1 - b)`, which is what blending them one
/// after the other in the same color does.
pub struct RunMask {
    pub x: i32,
    pub y: i32,
    pub width: i32,
    pub height: i32,
    /// [r, g, b] in 0..=32, gray in 0..=255.
    pub data: Vec<[u8; 4]>,
}

/// The coverage of `run`, clipped to its clip and to `width` x `height`.
pub fn run_mask(run: &LcdRun, width: i32, height: i32) -> Option<RunMask> {
    let [cx0, cy0, cx1, cy1] = run.clip.unwrap_or([0, 0, width, height]);
    let (cx0, cy0, cx1, cy1) = (cx0.max(0), cy0.max(0), cx1.min(width), cy1.min(height));
    let mut x0 = i32::MAX;
    let mut y0 = i32::MAX;
    let mut x1 = i32::MIN;
    let mut y1 = i32::MIN;
    for g in &run.glyphs {
        x0 = x0.min(g.x);
        y0 = y0.min(g.y);
        x1 = x1.max(g.x + g.mask.width);
        y1 = y1.max(g.y + g.mask.height);
    }
    let (x0, y0, x1, y1) = (x0.max(cx0), y0.max(cy0), x1.min(cx1), y1.min(cy1));
    if x1 <= x0 || y1 <= y0 {
        return None;
    }
    let (w, h) = (x1 - x0, y1 - y0);
    let mut data = vec![[0u8; 4]; (w * h) as usize];
    let lcd = lcd_preblend(run.color);
    let gray = gray_preblend(run.color);
    let alpha = run.color[3] as u32;
    for g in &run.glyphs {
        let m = &g.mask;
        for row in 0..m.height {
            let py = g.y + row;
            if py < y0 || py >= y1 {
                continue;
            }
            for col in 0..m.width {
                let px = g.x + col;
                if px < x0 || px >= x1 {
                    continue;
                }
                let c = m.data[(row * m.width + col) as usize];
                if c == [0, 0, 0] {
                    continue;
                }
                let out = &mut data[((py - y0) * w + px - x0) as usize];
                for k in 0..3 {
                    let v = lcd[k][c[k] as usize] as u32 >> 3;
                    let mut v = v + (v >> 4);
                    if alpha < 255 {
                        v = (v * (alpha + 1)) >> 8;
                    }
                    let old = out[k] as u32;
                    out[k] = (32 - ((32 - old) * (32 - v) + 16) / 32) as u8;
                }
                let coverage =
                    gray[((c[0] as u32 + c[1] as u32 + c[2] as u32) / 3) as usize] as u32;
                let v = alpha * coverage / 255;
                let old = out[3] as u32;
                out[3] = (255 - ((255 - old) * (255 - v) + 127) / 255) as u8;
            }
        }
    }
    Some(RunMask {
        x: x0,
        y: y0,
        width: w,
        height: h,
        data,
    })
}

/// Blend the planned runs onto premultiplied RGBA8 `pixels` (`width` x
/// `height`), in order: LCD on opaque pixels, grayscale elsewhere.
pub fn composite(pixels: &mut [u8], width: usize, height: usize, plan: &LcdPlan) {
    if pixels.len() != width * height * 4 {
        return;
    }
    for run in &plan.runs {
        let Some(mask) = run_mask(run, width as i32, height as i32) else {
            continue;
        };
        for row in 0..mask.height {
            for col in 0..mask.width {
                let m = mask.data[(row * mask.width + col) as usize];
                if m == [0; 4] {
                    continue;
                }
                let i = (((mask.y + row) as usize) * width + (mask.x + col) as usize) * 4;
                blend_pixel(&mut pixels[i..i + 4], run.color, m);
            }
        }
    }
}

/// One run-mask pixel onto a premultiplied pixel: Skia's LCD16 blend on
/// an opaque pixel, grayscale source-over elsewhere. The window's GPU pass
/// does the same arithmetic.
pub fn blend_pixel(dst: &mut [u8], color: [u8; 4], m: [u8; 4]) {
    if dst[3] == 255 {
        for k in 0..3 {
            let (s, d) = (color[k] as i32, dst[k] as i32);
            dst[k] = (d + (((s - d) * m[k] as i32) >> 5)) as u8;
        }
        return;
    }
    let a = m[3] as u32;
    if a == 0 {
        return;
    }
    let inv = 255 - a;
    let out_a = a + dst[3] as u32 * inv / 255;
    for k in 0..3 {
        let v = color[k] as u32 * a / 255 + dst[k] as u32 * inv / 255;
        dst[k] = v.min(out_a) as u8;
    }
    dst[3] = out_a as u8;
}

#[cfg(test)]
mod tests {
    use super::*;

    fn glyph(x: i32, value: u8) -> PlacedGlyph {
        PlacedGlyph {
            x,
            y: 0,
            mask: Arc::new(LcdGlyph {
                left: 0,
                top: 0,
                width: 3,
                height: 1,
                data: vec![[value, value / 2, value / 3]; 3],
            }),
        }
    }

    fn plan_of(runs: Vec<LcdRun>) -> LcdPlan {
        LcdPlan {
            runs,
            skip: HashSet::new(),
        }
    }

    /// A run's combined mask blends like its glyphs one after the other,
    /// which is what the CPU paint does (to rounding).
    #[test]
    fn run_mask_matches_sequential_glyph_blends() {
        let run = LcdRun {
            item: 0,
            color: [20, 40, 200, 255],
            clip: None,
            glyphs: vec![glyph(0, 200), glyph(2, 150)],
        };
        let mut combined = vec![255u8; 6 * 4];
        composite(&mut combined, 6, 1, &plan_of(vec![run.clone()]));
        let mut sequential = vec![255u8; 6 * 4];
        for g in &run.glyphs {
            let one = LcdRun {
                glyphs: vec![g.clone()],
                ..run.clone()
            };
            composite(&mut sequential, 6, 1, &plan_of(vec![one]));
        }
        for (a, b) in combined.iter().zip(&sequential) {
            assert!(a.abs_diff(*b) <= 2, "{combined:?} vs {sequential:?}");
        }
        // The LCD channels differ (subpixel coverage); alpha stays opaque.
        assert_ne!(combined[0], combined[2]);
        assert_eq!(combined[3], 255);
        // On a transparent pixel the run blends grayscale.
        let mut clear = vec![0u8; 6 * 4];
        composite(&mut clear, 6, 1, &plan_of(vec![run]));
        assert!(clear[3] > 0 && clear[3] < 255);
    }
}
