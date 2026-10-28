//! The drawing surface the painter talks to (docs/GPU-PAINT.md, phase B).
//!
//! Every primitive paint emits goes through [`Canvas`]: fill or stroke a path,
//! draw an image, push and pop a clip made of paths, push and pop a layer with
//! opacity and blend. [`TinySkiaCanvas`] is the CPU rasterizer. It makes the
//! same tiny-skia calls the call sites made before this trait existed, so the
//! output is unchanged.
//!
//! Clips stay tiny-skia [`Mask`]s at the call sites. They are built through
//! [`new_mask`] and the [`ClipMask`] methods so that, with the `display-list`
//! feature, a recording knows which paths each mask was made from.

use tiny_skia::{
    BlendMode, Color, FillRule, FilterQuality, GradientStop, LinearGradient, Mask, Paint, Path,
    PathBuilder, Pixmap, PixmapPaint, PixmapRef, Point, RadialGradient, Rect, SpreadMode, Stroke,
    Transform,
};

/// One path of a clip. A clip made of several paths is their intersection.
#[derive(Clone, Debug)]
pub struct ClipPath {
    pub path: Path,
    pub fill_rule: FillRule,
    pub anti_alias: bool,
    pub transform: Transform,
}

/// Where a gradient runs, in the arguments tiny-skia's constructors take.
#[derive(Clone, Copy, Debug)]
pub enum GradientShape {
    Linear {
        start: Point,
        end: Point,
    },
    /// Two-point conical gradient, the general form of a radial gradient.
    Radial {
        start: Point,
        start_radius: f32,
        end: Point,
        end_radius: f32,
    },
}

/// A gradient paint kept as its parameters. tiny-skia's shaders hide theirs,
/// so a gradient that must survive into a display list is passed this way.
#[derive(Clone, Debug)]
pub struct Gradient {
    pub shape: GradientShape,
    /// Offset in 0..=1 and straight (not premultiplied) RGBA.
    pub stops: Vec<(f32, [u8; 4])>,
    pub spread: SpreadMode,
    /// Gradient space to user space.
    pub transform: Transform,
}

impl Gradient {
    /// The tiny-skia paint for this gradient. `None` where tiny-skia's
    /// constructor returns `None` (no stops, degenerate geometry): nothing is
    /// painted then.
    pub fn paint(&self, anti_alias: bool) -> Option<Paint<'static>> {
        let stops: Vec<GradientStop> = self
            .stops
            .iter()
            .map(|&(offset, c)| GradientStop::new(offset, Color::from_rgba8(c[0], c[1], c[2], c[3])))
            .collect();
        let shader = match self.shape {
            GradientShape::Linear { start, end } => {
                LinearGradient::new(start, end, stops, self.spread, self.transform)?
            }
            GradientShape::Radial {
                start,
                start_radius,
                end,
                end_radius,
            } => RadialGradient::new(
                start,
                start_radius,
                end,
                end_radius,
                stops,
                self.spread,
                self.transform,
            )?,
        };
        let mut paint = Paint::default();
        paint.shader = shader;
        paint.anti_alias = anti_alias;
        Some(paint)
    }
}

/// The drawing calls paint makes. Arguments follow tiny-skia's own methods so
/// a call site reads the same as before; `mask` is the call site's clip, and
/// anything pushed with [`Canvas::push_clip`] applies on top of it.
pub trait Canvas {
    fn fill_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        fill_rule: FillRule,
        transform: Transform,
        mask: Option<&Mask>,
    );

    /// Fill with a gradient given by its parameters.
    fn fill_gradient(
        &mut self,
        path: &Path,
        gradient: &Gradient,
        anti_alias: bool,
        fill_rule: FillRule,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        if let Some(paint) = gradient.paint(anti_alias) {
            self.fill_path(path, &paint, fill_rule, transform, mask);
        }
    }

    fn fill_rect(&mut self, rect: Rect, paint: &Paint, transform: Transform, mask: Option<&Mask>) {
        let path = PathBuilder::from_rect(rect);
        self.fill_path(&path, paint, FillRule::Winding, transform, mask);
    }

    fn stroke_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        stroke: &Stroke,
        transform: Transform,
        mask: Option<&Mask>,
    );

    /// Draw `image` with its origin at (`x`, `y`), then `transform`, the way
    /// tiny-skia's `draw_pixmap` does.
    fn draw_image(
        &mut self,
        x: i32,
        y: i32,
        image: PixmapRef<'_>,
        paint: &PixmapPaint,
        transform: Transform,
        mask: Option<&Mask>,
    );

    /// Clip later drawing to the intersection of `paths` (and of any clip
    /// already pushed).
    fn push_clip(&mut self, paths: &[ClipPath]);
    fn pop_clip(&mut self);

    /// Draw into a group that is composited with `opacity` and `blend` on pop.
    fn push_layer(&mut self, opacity: f32, blend: BlendMode);
    fn pop_layer(&mut self);
}

struct Layer {
    pixmap: Option<Pixmap>,
    opacity: f32,
    blend: BlendMode,
}

/// [`Canvas`] over a tiny-skia [`Pixmap`].
pub struct TinySkiaCanvas<'a> {
    target: &'a mut Pixmap,
    /// Each entry is the intersection of every clip pushed so far.
    clips: Vec<Option<Mask>>,
    layers: Vec<Layer>,
}

impl<'a> TinySkiaCanvas<'a> {
    pub fn new(target: &'a mut Pixmap) -> Self {
        Self {
            target,
            clips: Vec::new(),
            layers: Vec::new(),
        }
    }

    /// Run one raw tiny-skia call on the current surface with the call site's
    /// mask combined with the pushed clip.
    fn with_mask<R>(
        &mut self,
        mask: Option<&Mask>,
        draw: impl FnOnce(&mut Pixmap, Option<&Mask>) -> R,
    ) -> R {
        let surface: &mut Pixmap = match self.layers.iter_mut().rev().find_map(|l| l.pixmap.as_mut()) {
            Some(layer) => layer,
            None => &mut *self.target,
        };
        let pushed = self.clips.last().and_then(Option::as_ref);
        match (mask, pushed) {
            (Some(mask), Some(pushed)) => {
                let combined = intersect_masks(mask, pushed);
                draw(surface, Some(&combined))
            }
            (mask, None) => draw(surface, mask),
            (None, pushed) => draw(surface, pushed),
        }
    }
}

/// Byte-wise product of two masks, rounded the same way paint's own
/// `intersect_clip_masks` rounds. Masks of different sizes keep `a`.
fn intersect_masks(a: &Mask, b: &Mask) -> Mask {
    let mut out = a.clone();
    if a.width() == b.width() && a.height() == b.height() {
        for (x, y) in out.data_mut().iter_mut().zip(b.data()) {
            *x = ((*x as u16 * *y as u16 + 127) / 255) as u8;
        }
    }
    out
}

impl Canvas for TinySkiaCanvas<'_> {
    fn fill_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        fill_rule: FillRule,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        self.with_mask(mask, |surface, mask| {
            surface.fill_path(path, paint, fill_rule, transform, mask)
        });
    }

    fn fill_gradient(
        &mut self,
        path: &Path,
        gradient: &Gradient,
        anti_alias: bool,
        fill_rule: FillRule,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        let Some(paint) = gradient.paint(anti_alias) else {
            return;
        };
        self.with_mask(mask, |surface, mask| {
            surface.fill_path(path, &paint, fill_rule, transform, mask)
        });
    }

    fn fill_rect(&mut self, rect: Rect, paint: &Paint, transform: Transform, mask: Option<&Mask>) {
        // tiny-skia has its own rect fast path; keep it.
        self.with_mask(mask, |surface, mask| surface.fill_rect(rect, paint, transform, mask));
    }

    fn stroke_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        stroke: &Stroke,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        self.with_mask(mask, |surface, mask| {
            surface.stroke_path(path, paint, stroke, transform, mask)
        });
    }

    fn draw_image(
        &mut self,
        x: i32,
        y: i32,
        image: PixmapRef<'_>,
        paint: &PixmapPaint,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        self.with_mask(mask, |surface, mask| {
            surface.draw_pixmap(x, y, image, paint, transform, mask)
        });
    }

    fn push_clip(&mut self, paths: &[ClipPath]) {
        let (width, height) = (self.target.width(), self.target.height());
        let previous = self.clips.last().and_then(Option::as_ref);
        let mut built: Option<Mask> = None;
        for clip in paths {
            match built.as_mut() {
                Some(mask) => {
                    mask.intersect_path(&clip.path, clip.fill_rule, clip.anti_alias, clip.transform)
                }
                None => {
                    let Some(mut mask) = Mask::new(width, height) else {
                        continue;
                    };
                    mask.fill_path(&clip.path, clip.fill_rule, clip.anti_alias, clip.transform);
                    built = Some(mask);
                }
            }
        }
        let next = match (built, previous) {
            (Some(mask), Some(previous)) => Some(intersect_masks(&mask, previous)),
            (Some(mask), None) => Some(mask),
            (None, previous) => previous.cloned(),
        };
        self.clips.push(next);
    }

    fn pop_clip(&mut self) {
        self.clips.pop();
    }

    fn push_layer(&mut self, opacity: f32, blend: BlendMode) {
        let pixmap = Pixmap::new(self.target.width(), self.target.height());
        self.layers.push(Layer {
            pixmap,
            opacity,
            blend,
        });
    }

    fn pop_layer(&mut self) {
        let Some(layer) = self.layers.pop() else {
            return;
        };
        let Some(pixmap) = layer.pixmap else {
            return;
        };
        let paint = PixmapPaint {
            opacity: layer.opacity,
            blend_mode: layer.blend,
            quality: FilterQuality::Nearest,
        };
        self.with_mask(None, |surface, mask| {
            surface.draw_pixmap(0, 0, pixmap.as_ref(), &paint, Transform::identity(), mask)
        });
    }
}

/// `pixmap.canvas()` gives the [`Canvas`] for a pixmap at any call site,
/// owned or borrowed.
pub trait PixmapCanvas {
    fn canvas(&mut self) -> TinySkiaCanvas<'_>;
}

impl PixmapCanvas for Pixmap {
    fn canvas(&mut self) -> TinySkiaCanvas<'_> {
        TinySkiaCanvas::new(self)
    }
}

/// A new, empty (fully clipping) mask.
pub fn new_mask(width: u32, height: u32) -> Option<Mask> {
    Mask::new(width, height)
}

/// A copy of `mask` that keeps what it was built from.
pub fn clone_mask(mask: &Mask) -> Mask {
    mask.clone()
}

/// `first` becomes the intersection of `first` and `second`.
pub fn intersect_mask_into(first: &mut Mask, second: &Mask) {
    for (a, b) in first.data_mut().iter_mut().zip(second.data()) {
        *a = ((*a as u16 * *b as u16 + 127) / 255) as u8;
    }
}

/// Mask building that a recording can follow. Each method does what the
/// tiny-skia method of the same name without `clip_` does.
pub trait ClipMask {
    fn clip_fill_path(&mut self, path: &Path, fill_rule: FillRule, anti_alias: bool, transform: Transform);
    fn clip_intersect_path(
        &mut self,
        path: &Path,
        fill_rule: FillRule,
        anti_alias: bool,
        transform: Transform,
    );
    fn clip_invert(&mut self);
}

impl ClipMask for Mask {
    fn clip_fill_path(&mut self, path: &Path, fill_rule: FillRule, anti_alias: bool, transform: Transform) {
        self.fill_path(path, fill_rule, anti_alias, transform);
    }

    fn clip_intersect_path(
        &mut self,
        path: &Path,
        fill_rule: FillRule,
        anti_alias: bool,
        transform: Transform,
    ) {
        self.intersect_path(path, fill_rule, anti_alias, transform);
    }

    fn clip_invert(&mut self) {
        self.invert();
    }
}

/// Code that writes pixels itself (glyph blits) runs inside this, so a
/// recording can capture what it wrote as an image.
pub fn direct_pixels<R>(pixmap: &mut Pixmap, draw: impl FnOnce(&mut Pixmap) -> R) -> R {
    draw(pixmap)
}

/// `layer` is an offscreen group (opacity or transform) that paint will
/// composite into its parent with `draw_image`.
pub fn begin_layer(_layer: &Pixmap) {}

/// `root` is the surface of a whole paint, already cleared to `color`.
pub fn begin_root(_root: &Pixmap, _color: [u8; 4]) {}
