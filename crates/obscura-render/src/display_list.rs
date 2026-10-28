//! Recording paint as a display list (docs/GPU-PAINT.md, phase B step 2).
//!
//! [`record`] runs a paint with a [`RecordingCanvas`] listening. Every call
//! [`crate::canvas::TinySkiaCanvas`] makes on the recorded surface is copied
//! here as an [`Op`]: paths as move/line/quad/cubic/close verbs, solid and
//! linear/radial gradient brushes, clips as the paths their masks were built
//! from, opacity and transform groups as layers, and images as RGBA.
//!
//! What cannot be kept as vectors is rasterized on the CPU and enters the
//! list as an image: glyph blits ([`crate::canvas::direct_pixels`]), pattern
//! fills, hairline strokes, and anything clipped by a mask whose paths are
//! unknown. The CPU paint still runs while recording; only its pixels inside
//! `direct_pixels` can differ by rounding, because they are composited from an
//! intermediate image there.

use std::cell::{Cell, RefCell};
use std::collections::HashMap;
use std::hash::{DefaultHasher, Hash, Hasher};

use serde::{Deserialize, Serialize};
use tiny_skia::{
    BlendMode, FillRule, FilterQuality, LineCap, LineJoin, Mask, Paint, Path, PathSegment, Pixmap,
    PixmapPaint, PixmapRef, Shader, SpreadMode, Stroke, Transform,
};

use crate::canvas::{Canvas, ClipPath, Gradient, GradientShape};

/// `[sx, ky, kx, sy, tx, ty]`, the order of `tiny_skia::Transform::from_row`
/// and of `kurbo::Affine::new`: x' = sx*x + kx*y + tx, y' = ky*x + sy*y + ty.
pub type Affine = [f32; 6];

pub const IDENTITY: Affine = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

/// One recorded paint. Coordinates are device pixels of a `width` x `height`
/// surface; a client draws it at another size by scaling.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct DisplayList {
    pub width: u32,
    pub height: u32,
    pub ops: Vec<Op>,
    /// Images referenced by [`Op::Image`], stored once each.
    pub images: Vec<Image>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
pub enum Op {
    Fill {
        path: Vec<Verb>,
        brush: Brush,
        rule: Rule,
        transform: Affine,
    },
    Stroke {
        path: Vec<Verb>,
        brush: Brush,
        style: StrokeStyle,
        transform: Affine,
    },
    /// Draw `images[image]` with its top-left at the origin of `transform`.
    Image {
        image: usize,
        transform: Affine,
        opacity: f32,
        /// Bilinear or better sampling; nearest otherwise.
        smooth: bool,
    },
    /// Clip to the intersection of `clips` until the matching `PopClip`.
    PushClip { clips: Vec<ClipShape> },
    PopClip,
    /// Group until the matching `PopLayer`, then composite it.
    PushLayer { opacity: f32, blend: Blend },
    PopLayer,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum Verb {
    M(f32, f32),
    L(f32, f32),
    Q(f32, f32, f32, f32),
    C(f32, f32, f32, f32, f32, f32),
    Z,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Rule {
    NonZero,
    EvenOdd,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Brush {
    /// Straight (not premultiplied) RGBA in 0..=1.
    Solid { color: [f32; 4] },
    Linear {
        start: [f32; 2],
        end: [f32; 2],
        stops: Vec<Stop>,
        extend: Extend,
        /// Gradient space to user space.
        transform: Affine,
    },
    /// Two-point conical gradient.
    Radial {
        start: [f32; 2],
        start_radius: f32,
        end: [f32; 2],
        end_radius: f32,
        stops: Vec<Stop>,
        extend: Extend,
        transform: Affine,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct Stop {
    pub offset: f32,
    /// Straight RGBA.
    pub color: [u8; 4],
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Extend {
    Pad,
    Repeat,
    Reflect,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize)]
pub struct StrokeStyle {
    pub width: f32,
    pub miter_limit: f32,
    pub cap: Cap,
    pub join: Join,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Cap {
    Butt,
    Round,
    Square,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Join {
    Miter,
    MiterClip,
    Round,
    Bevel,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ClipShape {
    pub path: Vec<Verb>,
    pub rule: Rule,
    pub transform: Affine,
}

/// CSS blend modes plus the Porter-Duff operators tiny-skia offers.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Blend {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
    Clear,
    Copy,
    Dest,
    DestOver,
    SrcIn,
    DestIn,
    SrcOut,
    DestOut,
    SrcAtop,
    DestAtop,
    Xor,
    Plus,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct Image {
    pub width: u32,
    pub height: u32,
    /// tiny-skia pixels are premultiplied; every recorded image is.
    pub premultiplied: bool,
    /// `width * height * 4` bytes, base64 in JSON.
    #[serde(with = "base64_bytes")]
    pub rgba: Vec<u8>,
}

mod base64_bytes {
    use base64::Engine as _;

    pub fn serialize<S: serde::Serializer>(bytes: &[u8], serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&base64::engine::general_purpose::STANDARD.encode(bytes))
    }

    pub fn deserialize<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
        let text = <String as serde::Deserialize>::deserialize(deserializer)?;
        base64::engine::general_purpose::STANDARD
            .decode(text)
            .map_err(serde::de::Error::custom)
    }
}

// ---------------------------------------------------------------------------
// Conversions

fn affine(t: Transform) -> Affine {
    [t.sx, t.ky, t.kx, t.sy, t.tx, t.ty]
}

/// `a` after `b`.
pub fn concat(a: &Affine, b: &Affine) -> Affine {
    let [asx, aky, akx, asy, atx, aty] = *a;
    let [bsx, bky, bkx, bsy, btx, bty] = *b;
    [
        asx * bsx + akx * bky,
        aky * bsx + asy * bky,
        asx * bkx + akx * bsy,
        aky * bkx + asy * bsy,
        asx * btx + akx * bty + atx,
        aky * btx + asy * bty + aty,
    ]
}

fn verbs(path: &Path) -> Vec<Verb> {
    path.segments()
        .map(|segment| match segment {
            PathSegment::MoveTo(p) => Verb::M(p.x, p.y),
            PathSegment::LineTo(p) => Verb::L(p.x, p.y),
            PathSegment::QuadTo(a, b) => Verb::Q(a.x, a.y, b.x, b.y),
            PathSegment::CubicTo(a, b, c) => Verb::C(a.x, a.y, b.x, b.y, c.x, c.y),
            PathSegment::Close => Verb::Z,
        })
        .collect()
}

fn rule(fill_rule: FillRule) -> Rule {
    match fill_rule {
        FillRule::Winding => Rule::NonZero,
        FillRule::EvenOdd => Rule::EvenOdd,
    }
}

fn clip_shape(clip: &ClipPath) -> ClipShape {
    ClipShape {
        path: verbs(&clip.path),
        rule: rule(clip.fill_rule),
        transform: affine(clip.transform),
    }
}

fn solid(paint: &Paint) -> Option<Brush> {
    match &paint.shader {
        Shader::SolidColor(c) => Some(Brush::Solid {
            color: [c.red(), c.green(), c.blue(), c.alpha()],
        }),
        _ => None,
    }
}

fn extend(spread: SpreadMode) -> Extend {
    match spread {
        SpreadMode::Pad => Extend::Pad,
        SpreadMode::Repeat => Extend::Repeat,
        SpreadMode::Reflect => Extend::Reflect,
    }
}

/// `paint` is `gradient.paint(..)`: tiny-skia folds one-stop and degenerate
/// gradients into a solid color, and the list follows it.
fn gradient_brush(gradient: &Gradient, paint: &Paint) -> Brush {
    if let Some(brush) = solid(paint) {
        return brush;
    }
    let stops = gradient
        .stops
        .iter()
        .map(|&(offset, color)| Stop { offset, color })
        .collect();
    let transform = affine(gradient.transform);
    match gradient.shape {
        GradientShape::Linear { start, end } => Brush::Linear {
            start: [start.x, start.y],
            end: [end.x, end.y],
            stops,
            extend: extend(gradient.spread),
            transform,
        },
        GradientShape::Radial {
            start,
            start_radius,
            end,
            end_radius,
        } => Brush::Radial {
            start: [start.x, start.y],
            start_radius,
            end: [end.x, end.y],
            end_radius,
            stops,
            extend: extend(gradient.spread),
            transform,
        },
    }
}

fn stroke_style(stroke: &Stroke) -> StrokeStyle {
    StrokeStyle {
        width: stroke.width,
        miter_limit: stroke.miter_limit,
        cap: match stroke.line_cap {
            LineCap::Butt => Cap::Butt,
            LineCap::Round => Cap::Round,
            LineCap::Square => Cap::Square,
        },
        join: match stroke.line_join {
            LineJoin::Miter => Join::Miter,
            LineJoin::MiterClip => Join::MiterClip,
            LineJoin::Round => Join::Round,
            LineJoin::Bevel => Join::Bevel,
        },
    }
}

fn blend(mode: BlendMode) -> Blend {
    match mode {
        BlendMode::SourceOver => Blend::Normal,
        BlendMode::Clear => Blend::Clear,
        BlendMode::Source => Blend::Copy,
        BlendMode::Destination => Blend::Dest,
        BlendMode::DestinationOver => Blend::DestOver,
        BlendMode::SourceIn => Blend::SrcIn,
        BlendMode::DestinationIn => Blend::DestIn,
        BlendMode::SourceOut => Blend::SrcOut,
        BlendMode::DestinationOut => Blend::DestOut,
        BlendMode::SourceAtop => Blend::SrcAtop,
        BlendMode::DestinationAtop => Blend::DestAtop,
        BlendMode::Xor => Blend::Xor,
        BlendMode::Plus => Blend::Plus,
        // Channel-wise product, alpha included; multiply is the closest mode.
        BlendMode::Modulate => Blend::Multiply,
        BlendMode::Screen => Blend::Screen,
        BlendMode::Overlay => Blend::Overlay,
        BlendMode::Darken => Blend::Darken,
        BlendMode::Lighten => Blend::Lighten,
        BlendMode::ColorDodge => Blend::ColorDodge,
        BlendMode::ColorBurn => Blend::ColorBurn,
        BlendMode::HardLight => Blend::HardLight,
        BlendMode::SoftLight => Blend::SoftLight,
        BlendMode::Difference => Blend::Difference,
        BlendMode::Exclusion => Blend::Exclusion,
        BlendMode::Multiply => Blend::Multiply,
        BlendMode::Hue => Blend::Hue,
        BlendMode::Saturation => Blend::Saturation,
        BlendMode::Color => Blend::Color,
        BlendMode::Luminosity => Blend::Luminosity,
    }
}

fn map_op(op: &mut Op, t: &Affine) {
    match op {
        Op::Fill { transform, .. } | Op::Stroke { transform, .. } | Op::Image { transform, .. } => {
            *transform = concat(t, transform);
        }
        Op::PushClip { clips } => {
            for clip in clips {
                clip.transform = concat(t, &clip.transform);
            }
        }
        Op::PopClip | Op::PushLayer { .. } | Op::PopLayer => {}
    }
}

fn surface_id(pixmap: &Pixmap) -> usize {
    pixmap.data().as_ptr() as usize
}

fn mask_id(mask: &Mask) -> usize {
    mask.data().as_ptr() as usize
}

/// A cheap check that a registry entry still describes the mask living at
/// its address, since a freed mask's address can be reused by another.
fn fingerprint(mask: &Mask) -> u64 {
    let data = mask.data();
    let mut hasher = DefaultHasher::new();
    (mask.width(), mask.height()).hash(&mut hasher);
    let step = (data.len() / 257).max(1);
    let mut i = 0;
    while i < data.len() {
        data[i].hash(&mut hasher);
        i += step;
    }
    hasher.finish()
}

// ---------------------------------------------------------------------------
// Recorder

/// What a mask is made of, as far as the recording knows.
#[derive(Clone, Debug)]
pub(crate) enum MaskShapes {
    /// Freshly created: clips everything away.
    Empty,
    /// The intersection of these paths.
    Paths(Vec<ClipShape>),
    /// Built some other way (union, invert, raw bytes).
    Unknown,
}

struct MaskEntry {
    shapes: MaskShapes,
    version: u64,
    fingerprint: u64,
}

struct Frame {
    target: usize,
    width: u32,
    height: u32,
    ops: Vec<Op>,
    /// The mask (address, version) whose clip is open at the end of `ops`, so
    /// consecutive draws under one mask share one PushClip.
    open_clip: Option<(usize, u64)>,
}

impl Frame {
    fn close_clip(&mut self) {
        if self.open_clip.take().is_some() {
            self.ops.push(Op::PopClip);
        }
    }
}

enum ClipState {
    None,
    Shapes((usize, u64), Vec<ClipShape>),
    Empty,
    Unknown,
}

/// The [`Canvas`] that records. Frame 0 is the paint's surface; frames above
/// it are offscreen groups that paint composites back with `draw_image`.
pub struct RecordingCanvas {
    frames: Vec<Frame>,
    images: Vec<Image>,
    image_ids: HashMap<u64, usize>,
    masks: HashMap<usize, MaskEntry>,
    next_version: u64,
    scratch: Option<Pixmap>,
}

impl RecordingCanvas {
    fn new() -> Self {
        Self {
            frames: Vec::new(),
            images: Vec::new(),
            image_ids: HashMap::new(),
            masks: HashMap::new(),
            next_version: 0,
            scratch: None,
        }
    }

    fn finish(mut self) -> Option<DisplayList> {
        if self.frames.is_empty() {
            return None;
        }
        self.frames.truncate(1);
        let mut root = self.frames.pop()?;
        root.close_clip();
        Some(DisplayList {
            width: root.width,
            height: root.height,
            ops: root.ops,
            images: self.images,
        })
    }

    fn frame_index(&self, target: usize) -> Option<usize> {
        self.frames.iter().rposition(|frame| frame.target == target)
    }

    /// Make `target` the current frame. Frames above it were abandoned (their
    /// paint returned early) and are dropped.
    fn focus(&mut self, target: usize) -> bool {
        match self.frame_index(target) {
            Some(index) => {
                self.frames.truncate(index + 1);
                true
            }
            None => false,
        }
    }

    fn frame(&mut self) -> Option<&mut Frame> {
        self.frames.last_mut()
    }

    fn lookup_mask(&self, mask: &Mask) -> (MaskShapes, u64) {
        match self.masks.get(&mask_id(mask)) {
            Some(entry) if entry.fingerprint == fingerprint(mask) => {
                (entry.shapes.clone(), entry.version)
            }
            _ => (MaskShapes::Unknown, 0),
        }
    }

    fn store_mask(&mut self, mask: &Mask, shapes: MaskShapes) {
        self.next_version += 1;
        self.masks.insert(
            mask_id(mask),
            MaskEntry {
                shapes,
                version: self.next_version,
                fingerprint: fingerprint(mask),
            },
        );
    }

    fn clip_state(&self, mask: Option<&Mask>) -> ClipState {
        let Some(mask) = mask else {
            return ClipState::None;
        };
        match self.lookup_mask(mask) {
            (MaskShapes::Empty, _) => ClipState::Empty,
            (MaskShapes::Paths(shapes), version) => ClipState::Shapes((mask_id(mask), version), shapes),
            (MaskShapes::Unknown, _) => ClipState::Unknown,
        }
    }

    /// Append `op` under `mask`, or rasterize it with `raster` when the
    /// mask's paths are unknown.
    fn emit(
        &mut self,
        mask: Option<&Mask>,
        op: Op,
        raster: impl FnOnce(&mut Pixmap, Option<&Mask>),
    ) {
        match self.clip_state(mask) {
            ClipState::Empty => {}
            ClipState::Unknown => self.rasterize(mask, raster),
            ClipState::None => {
                if let Some(frame) = self.frame() {
                    frame.close_clip();
                    frame.ops.push(op);
                }
            }
            ClipState::Shapes(key, clips) => {
                if let Some(frame) = self.frame() {
                    if frame.open_clip != Some(key) {
                        frame.close_clip();
                        frame.ops.push(Op::PushClip { clips });
                        frame.open_clip = Some(key);
                    }
                    frame.ops.push(op);
                }
            }
        }
    }

    fn push_unclipped(&mut self, op: Op) {
        if let Some(frame) = self.frame() {
            frame.close_clip();
            frame.ops.push(op);
        }
    }

    fn take_scratch(&mut self, width: u32, height: u32) -> Option<Pixmap> {
        match self.scratch.take() {
            Some(scratch) if scratch.width() == width && scratch.height() == height => Some(scratch),
            _ => Pixmap::new(width, height),
        }
    }

    /// Draw on the CPU into a transparent surface the size of the current
    /// frame and append the touched pixels as one image.
    fn rasterize(&mut self, mask: Option<&Mask>, raster: impl FnOnce(&mut Pixmap, Option<&Mask>)) {
        let Some((width, height)) = self.frames.last().map(|f| (f.width, f.height)) else {
            return;
        };
        let Some(mut scratch) = self.take_scratch(width, height) else {
            return;
        };
        raster(&mut scratch, mask);
        if let Some((op, _)) = self.capture(&mut scratch) {
            self.push_unclipped(op);
        }
        self.scratch = Some(scratch);
    }

    /// Cut the non-transparent part out of `scratch` as an image op, clear it
    /// back to transparent, and return the op with the cut-out's origin.
    fn capture(&mut self, scratch: &mut Pixmap) -> Option<(Op, (u32, u32, u32, u32))> {
        let width = scratch.width();
        let height = scratch.height();
        let (mut x0, mut y0, mut x1, mut y1) = (width, height, 0u32, 0u32);
        for (index, pixel) in scratch.pixels().iter().enumerate() {
            if pixel.alpha() != 0 {
                let x = index as u32 % width;
                let y = index as u32 / width;
                x0 = x0.min(x);
                y0 = y0.min(y);
                x1 = x1.max(x + 1);
                y1 = y1.max(y + 1);
            }
        }
        if x0 >= x1 || y0 >= y1 {
            return None;
        }
        let (w, h) = (x1 - x0, y1 - y0);
        let mut rgba = Vec::with_capacity((w * h * 4) as usize);
        let stride = width as usize * 4;
        let data = scratch.data_mut();
        for y in y0..y1 {
            let start = y as usize * stride + x0 as usize * 4;
            let end = start + w as usize * 4;
            rgba.extend_from_slice(&data[start..end]);
            data[start..end].fill(0);
        }
        let image = self.intern_image(Image {
            width: w,
            height: h,
            premultiplied: true,
            rgba,
        });
        let op = Op::Image {
            image,
            transform: [1.0, 0.0, 0.0, 1.0, x0 as f32, y0 as f32],
            opacity: 1.0,
            smooth: false,
        };
        Some((op, (x0, y0, w, h)))
    }

    fn intern_image(&mut self, image: Image) -> usize {
        let mut hasher = DefaultHasher::new();
        (image.width, image.height).hash(&mut hasher);
        image.rgba.hash(&mut hasher);
        let key = hasher.finish();
        if let Some(&index) = self.image_ids.get(&key) {
            return index;
        }
        let index = self.images.len();
        self.images.push(image);
        self.image_ids.insert(key, index);
        index
    }

    #[allow(clippy::too_many_arguments)]
    fn composite_layer(
        &mut self,
        mut layer: Frame,
        x: i32,
        y: i32,
        image: PixmapRef<'_>,
        paint: &PixmapPaint,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        layer.close_clip();
        let t = affine(transform.pre_translate(x as f32, y as f32));
        let mut ops = layer.ops;
        if t != IDENTITY {
            for op in &mut ops {
                map_op(op, &t);
            }
        }
        let grouped = paint.opacity < 1.0 || paint.blend_mode != BlendMode::SourceOver;
        let group_op = Op::PushLayer {
            opacity: paint.opacity,
            blend: blend(paint.blend_mode),
        };
        match self.clip_state(mask) {
            ClipState::Empty => {}
            ClipState::Unknown => self.rasterize(mask, |surface, mask| {
                surface.draw_pixmap(x, y, image, paint, transform, mask)
            }),
            state => {
                let Some(frame) = self.frame() else {
                    return;
                };
                match state {
                    ClipState::Shapes(key, clips) => {
                        if frame.open_clip != Some(key) {
                            frame.close_clip();
                            frame.ops.push(Op::PushClip { clips });
                            frame.open_clip = Some(key);
                        }
                    }
                    _ => frame.close_clip(),
                }
                if grouped {
                    frame.ops.push(group_op);
                }
                frame.ops.extend(ops);
                if grouped {
                    frame.ops.push(Op::PopLayer);
                }
            }
        }
    }
}

impl Canvas for RecordingCanvas {
    fn fill_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        fill_rule: FillRule,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        let raster = |surface: &mut Pixmap, mask: Option<&Mask>| {
            surface.fill_path(path, paint, fill_rule, transform, mask)
        };
        match solid(paint) {
            Some(brush) if paint.blend_mode == BlendMode::SourceOver => {
                let op = Op::Fill {
                    path: verbs(path),
                    brush,
                    rule: rule(fill_rule),
                    transform: affine(transform),
                };
                self.emit(mask, op, raster);
            }
            _ => self.rasterize(mask, raster),
        }
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
        let op = Op::Fill {
            path: verbs(path),
            brush: gradient_brush(gradient, &paint),
            rule: rule(fill_rule),
            transform: affine(transform),
        };
        self.emit(mask, op, |surface, mask| {
            surface.fill_path(path, &paint, fill_rule, transform, mask)
        });
    }

    fn stroke_path(
        &mut self,
        path: &Path,
        paint: &Paint,
        stroke: &Stroke,
        transform: Transform,
        mask: Option<&Mask>,
    ) {
        let raster = |surface: &mut Pixmap, mask: Option<&Mask>| {
            surface.stroke_path(path, paint, stroke, transform, mask)
        };
        // Hairlines (width 0) are one device pixel whatever the transform;
        // keep tiny-skia's exact look.
        let brush = solid(paint).filter(|_| {
            paint.blend_mode == BlendMode::SourceOver && stroke.width > 0.0
        });
        let Some(brush) = brush else {
            self.rasterize(mask, raster);
            return;
        };
        // Dash on the CPU, the way tiny-skia does, and record the dashes.
        let dashed;
        let outline = match &stroke.dash {
            Some(dash) => {
                let resolution = tiny_skia::PathStroker::compute_resolution_scale(&transform);
                match path.dash(dash, resolution) {
                    Some(path) => {
                        dashed = path;
                        &dashed
                    }
                    None => return,
                }
            }
            None => path,
        };
        let op = Op::Stroke {
            path: verbs(outline),
            brush,
            style: stroke_style(stroke),
            transform: affine(transform),
        };
        self.emit(mask, op, raster);
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
        let index = self.intern_image(Image {
            width: image.width(),
            height: image.height(),
            premultiplied: true,
            rgba: image.data().to_vec(),
        });
        let image_op = Op::Image {
            image: index,
            transform: affine(transform.pre_translate(x as f32, y as f32)),
            opacity: paint.opacity,
            smooth: paint.quality != FilterQuality::Nearest,
        };
        let raster = |surface: &mut Pixmap, mask: Option<&Mask>| {
            surface.draw_pixmap(x, y, image, paint, transform, mask)
        };
        if paint.blend_mode == BlendMode::SourceOver {
            self.emit(mask, image_op, raster);
        } else {
            // Wrap the image in a blend group; the group carries the clip.
            match self.clip_state(mask) {
                ClipState::None => {
                    self.push_unclipped(Op::PushLayer {
                        opacity: 1.0,
                        blend: blend(paint.blend_mode),
                    });
                    self.push_unclipped(image_op);
                    self.push_unclipped(Op::PopLayer);
                }
                _ => self.rasterize(mask, raster),
            }
        }
    }

    fn push_clip(&mut self, paths: &[ClipPath]) {
        let clips = paths.iter().map(clip_shape).collect();
        self.push_unclipped(Op::PushClip { clips });
    }

    fn pop_clip(&mut self) {
        self.push_unclipped(Op::PopClip);
    }

    fn push_layer(&mut self, opacity: f32, blend_mode: BlendMode) {
        self.push_unclipped(Op::PushLayer {
            opacity,
            blend: blend(blend_mode),
        });
    }

    fn pop_layer(&mut self) {
        self.push_unclipped(Op::PopLayer);
    }
}

// ---------------------------------------------------------------------------
// The thread's active recording, and the hooks canvas.rs calls.

thread_local! {
    static ACTIVE: Cell<bool> = const { Cell::new(false) };
    static RECORDER: RefCell<Option<RecordingCanvas>> = const { RefCell::new(None) };
}

fn with_recorder<R>(f: impl FnOnce(&mut RecordingCanvas) -> R) -> Option<R> {
    if !ACTIVE.with(Cell::get) {
        return None;
    }
    RECORDER.with(|recorder| {
        let mut recorder = recorder.try_borrow_mut().ok()?;
        recorder.as_mut().map(f)
    })
}

/// Run `paint` and record what it draws on the first surface it marks with
/// [`crate::canvas::begin_root`]. Returns `None` for the list when nothing
/// was marked, or when a recording was already running on this thread.
pub fn record<R>(paint: impl FnOnce() -> R) -> (R, Option<DisplayList>) {
    if ACTIVE.with(Cell::get) {
        return (paint(), None);
    }
    struct Reset;
    impl Drop for Reset {
        fn drop(&mut self) {
            ACTIVE.with(|active| active.set(false));
            RECORDER.with(|recorder| {
                if let Ok(mut recorder) = recorder.try_borrow_mut() {
                    recorder.take();
                }
            });
        }
    }
    RECORDER.with(|recorder| *recorder.borrow_mut() = Some(RecordingCanvas::new()));
    ACTIVE.with(|active| active.set(true));
    let reset = Reset;
    let result = paint();
    let recorder = RECORDER.with(|recorder| recorder.borrow_mut().take());
    drop(reset);
    (result, recorder.and_then(RecordingCanvas::finish))
}

/// Copy one call made on `target` into the recording when `target` is a
/// recorded surface.
pub(crate) fn tee(target: &Pixmap, call: impl FnOnce(&mut RecordingCanvas)) {
    with_recorder(|recorder| {
        if recorder.focus(surface_id(target)) {
            call(recorder);
        }
    });
}

/// `draw_image` onto `target`. Compositing a recorded group back into its
/// parent becomes that group's ops; any other image is recorded as one.
pub(crate) fn tee_draw_image(
    target: &Pixmap,
    x: i32,
    y: i32,
    image: PixmapRef<'_>,
    paint: &PixmapPaint,
    transform: Transform,
    mask: Option<&Mask>,
) {
    with_recorder(|recorder| {
        let target_id = surface_id(target);
        let source_id = image.data().as_ptr() as usize;
        let Some(parent) = recorder.frame_index(target_id) else {
            // A recorded group drawn somewhere unrecorded leaves the recording.
            if let Some(index) = recorder.frame_index(source_id).filter(|&i| i > 0) {
                recorder.frames.truncate(index);
            }
            return;
        };
        match recorder.frame_index(source_id).filter(|&index| index > parent) {
            Some(index) => {
                let layer = recorder.frames.remove(index);
                recorder.frames.truncate(parent + 1);
                recorder.composite_layer(layer, x, y, image, paint, transform, mask);
            }
            None => {
                recorder.frames.truncate(parent + 1);
                recorder.draw_image(x, y, image, paint, transform, mask);
            }
        }
    });
}

pub(crate) fn begin_root(root: &Pixmap, color: [u8; 4]) {
    with_recorder(|recorder| {
        if !recorder.frames.is_empty() {
            return;
        }
        let (width, height) = (root.width(), root.height());
        let mut ops = Vec::new();
        if color[3] != 0 {
            let (w, h) = (width as f32, height as f32);
            ops.push(Op::Fill {
                path: vec![Verb::M(0.0, 0.0), Verb::L(w, 0.0), Verb::L(w, h), Verb::L(0.0, h), Verb::Z],
                brush: Brush::Solid {
                    color: color.map(|c| c as f32 / 255.0),
                },
                rule: Rule::NonZero,
                transform: IDENTITY,
            });
        }
        recorder.frames.push(Frame {
            target: surface_id(root),
            width,
            height,
            ops,
            open_clip: None,
        });
    });
}

pub(crate) fn begin_layer(layer: &Pixmap) {
    with_recorder(|recorder| {
        if recorder.frames.is_empty() {
            return;
        }
        recorder.frames.push(Frame {
            target: surface_id(layer),
            width: layer.width(),
            height: layer.height(),
            ops: Vec::new(),
            open_clip: None,
        });
    });
}

/// A transparent surface for [`crate::canvas::direct_pixels`] to write into
/// instead of `target`, when `target` is recorded.
pub(crate) fn direct_scratch(target: &Pixmap) -> Option<Pixmap> {
    with_recorder(|recorder| {
        if !recorder.focus(surface_id(target)) {
            return None;
        }
        recorder.take_scratch(target.width(), target.height())
    })
    .flatten()
}

/// Composite what the direct writer put in `scratch` onto `target` and record it.
pub(crate) fn direct_finish(target: &mut Pixmap, scratch: Pixmap) {
    let mut scratch = Some(scratch);
    let captured = with_recorder(|recorder| {
        let mut surface = scratch.take()?;
        let captured = recorder.capture(&mut surface);
        recorder.scratch = Some(surface);
        let (op, rect) = captured?;
        let index = match &op {
            Op::Image { image, .. } => *image,
            _ => return None,
        };
        let pixels = recorder.images[index].rgba.clone();
        recorder.push_unclipped(op);
        Some((pixels, rect))
    })
    .flatten();
    if let Some(surface) = scratch {
        // The recording went away mid-write: keep the pixels.
        target.draw_pixmap(
            0,
            0,
            surface.as_ref(),
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
        return;
    }
    let Some((pixels, (x, y, w, h))) = captured else {
        return;
    };
    if let Some(image) = PixmapRef::from_bytes(&pixels, w, h) {
        target.draw_pixmap(
            x as i32,
            y as i32,
            image,
            &PixmapPaint::default(),
            Transform::identity(),
            None,
        );
    }
}

pub(crate) fn mask_shapes(mask: &Mask) -> Option<MaskShapes> {
    with_recorder(|recorder| recorder.lookup_mask(mask).0)
}

pub(crate) fn set_mask_shapes(mask: &Mask, shapes: MaskShapes) {
    with_recorder(|recorder| recorder.store_mask(mask, shapes));
}

pub(crate) fn clip_shape_of(
    path: &Path,
    fill_rule: FillRule,
    transform: Transform,
) -> ClipShape {
    ClipShape {
        path: verbs(path),
        rule: rule(fill_rule),
        transform: affine(transform),
    }
}
