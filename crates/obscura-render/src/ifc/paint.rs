//! Painting inline formatting contexts: Parley glyph runs rasterized with
//! swash into the CPU pixmap, or recorded as scene glyph runs.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use obscura_dom::tree::NodeId;
use parley::PositionedLayoutItem;
use swash::scale::{image::Content, image::Image, Render, ScaleContext, Source, StrikeWith};
use swash::zeno::{Angle, Format, Transform, Vector};

use super::Ifc;
use crate::paint::lcd::LcdGlyph;
use crate::{LayoutStyle, Rect};

type ClipTextFill = (f32, Vec<([u8; 4], Option<f32>)>);

/// The `background-clip: text` fill of an element, when its text is
/// transparent.
fn clip_text_fill(style: &LayoutStyle) -> Option<ClipTextFill> {
    if !style.background_clip_text {
        return None;
    }
    if style.color.map(|c| c[3] != 0).unwrap_or(true) {
        return None;
    }
    if let Some(g) = &style.background_gradient {
        if g.1.len() >= 2 {
            return Some(g.clone());
        }
    }
    let bg = style.background_color.filter(|c| c[3] != 0)?;
    Some((180.0, vec![(bg, Some(0.0)), (bg, Some(1.0))]))
}

/// Sample a CSS linear gradient at `(x, y)` inside a `w` x `h` box.
fn sample_gradient(fill: &ClipTextFill, x: f32, y: f32, w: f32, h: f32) -> [u8; 4] {
    let (angle, stops) = fill;
    match stops.len() {
        0 => return [0, 0, 0, 255],
        1 => return stops[0].0,
        _ => {}
    }
    let rad = angle.to_radians();
    let (dx, dy) = (rad.sin(), -rad.cos());
    let (w, h) = (w.max(1.0), h.max(1.0));
    let len = (w * dx).abs() + (h * dy).abs();
    let t = if len <= 0.0 {
        0.5
    } else {
        (((x - w / 2.0) * dx + (y - h / 2.0) * dy) / len + 0.5).clamp(0.0, 1.0)
    };
    let n = stops.len();
    let pos = |i: usize| {
        stops[i]
            .1
            .unwrap_or(i as f32 / (n as f32 - 1.0))
            .clamp(0.0, 1.0)
    };
    let mut lo = 0usize;
    while lo + 1 < n && pos(lo + 1) < t {
        lo += 1;
    }
    let hi = (lo + 1).min(n - 1);
    let (p0, p1) = (pos(lo), pos(hi));
    let f = if (p1 - p0).abs() < 1e-6 {
        0.0
    } else {
        ((t - p0) / (p1 - p0)).clamp(0.0, 1.0)
    };
    let (c0, c1) = (stops[lo].0, stops[hi].0);
    let lerp = |a: u8, b: u8| {
        (a as f32 + (b as f32 - a as f32) * f)
            .round()
            .clamp(0.0, 255.0) as u8
    };
    [
        lerp(c0[0], c1[0]),
        lerp(c0[1], c1[1]),
        lerp(c0[2], c1[2]),
        lerp(c0[3], c1[3]),
    ]
}

/// Quarter-pixel horizontal subpixel bins, as cosmic-text used.
fn subpixel(pos: f32) -> (i32, u8) {
    let floor = pos.floor();
    let fract = pos - floor;
    let bin = (fract * 4.0).round() as i32;
    if bin == 4 {
        (floor as i32 + 1, 0)
    } else {
        (floor as i32, bin as u8)
    }
}

#[derive(Clone, PartialEq, Eq, Hash)]
struct GlyphKey {
    font: u64,
    index: u32,
    glyph: u16,
    size_bits: u32,
    x_bin: u8,
    coords: u64,
    embolden: bool,
    skew_bits: u32,
    /// Linear part of the glyph transform (vertical text), as bits.
    matrix: [u32; 4],
}

/// Rasterized glyph cache shared by every IFC of a layout.
#[derive(Default)]
pub(crate) struct GlyphRaster {
    context: ScaleContext,
    images: HashMap<GlyphKey, Option<Image>>,
    lcd: HashMap<GlyphKey, Option<LcdGlyph>>,
}

impl GlyphRaster {
    /// The LCD (subpixel) mask of an outline glyph, or None for a glyph
    /// without an outline (bitmap and color glyphs take the gray path).
    #[allow(clippy::too_many_arguments)]
    fn lcd_image(
        &mut self,
        font: &parley::FontData,
        glyph: u16,
        size: f32,
        x_bin: u8,
        coords: &[i16],
        embolden: bool,
        skew: f32,
        matrix: [f32; 4],
    ) -> Option<&LcdGlyph> {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        coords.hash(&mut hasher);
        let key = GlyphKey {
            font: font.data.id(),
            index: font.index,
            glyph,
            size_bits: size.to_bits(),
            x_bin,
            coords: hasher.finish(),
            embolden,
            skew_bits: skew.to_bits(),
            matrix: matrix.map(f32::to_bits),
        };
        let context = &mut self.context;
        self.lcd
            .entry(key)
            .or_insert_with(|| {
                let font_ref = swash::FontRef::from_index(font.data.as_ref(), font.index as usize)?;
                let mut scaler = context
                    .builder(font_ref)
                    .size(size)
                    .hint(true)
                    .normalized_coords(coords.iter().copied())
                    .build();
                if scaler.has_color_outlines() || !scaler.has_outlines() {
                    return None;
                }
                let mut render = Render::new(&[Source::Outline]);
                // Three samples per pixel horizontally; the subpixel
                // position moves the outline in thirds of those samples.
                // A turned glyph (vertical text) is turned first, so its
                // samples stay along the device's horizontal subpixel axis,
                // as Skia rasterizes LCD text under a 90 degree matrix.
                let mut transform = Transform::scale(3.0, 1.0);
                if matrix != IDENTITY_LINEAR {
                    // `matrix` is in y-down page space; outlines are y-up.
                    let [a, b, c, d] = matrix;
                    // swash composes `then` as "this after that".
                    transform = transform.then(&Transform::new(a, -b, -c, d, 0.0, 0.0));
                }
                if skew != 0.0 {
                    transform =
                        Transform::skew(Angle::from_degrees(skew), Angle::from_degrees(0.0))
                            .then(&transform);
                }
                render
                    .format(Format::Alpha)
                    .transform(Some(transform))
                    .offset(Vector::new(x_bin as f32 * 0.75, 0.0));
                if embolden {
                    render.embolden(size / 24.0);
                }
                let image = render.render(&mut scaler, glyph)?;
                if image.content != Content::Mask {
                    return None;
                }
                Some(LcdGlyph::from_subpixels(
                    &image.data,
                    image.placement.width as usize,
                    image.placement.height as usize,
                    image.placement.left,
                    -image.placement.top,
                ))
            })
            .as_ref()
    }

    #[allow(clippy::too_many_arguments)]
    fn image(
        &mut self,
        font: &parley::FontData,
        glyph: u16,
        size: f32,
        x_bin: u8,
        coords: &[i16],
        embolden: bool,
        skew: f32,
        matrix: [f32; 4],
    ) -> Option<&Image> {
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        coords.hash(&mut hasher);
        let key = GlyphKey {
            font: font.data.id(),
            index: font.index,
            glyph,
            size_bits: size.to_bits(),
            x_bin,
            coords: hasher.finish(),
            embolden,
            skew_bits: skew.to_bits(),
            matrix: matrix.map(f32::to_bits),
        };
        let context = &mut self.context;
        self.images
            .entry(key)
            .or_insert_with(|| {
                let font_ref = swash::FontRef::from_index(font.data.as_ref(), font.index as usize)?;
                let mut scaler = context
                    .builder(font_ref)
                    .size(size)
                    .hint(true)
                    .normalized_coords(coords.iter().copied())
                    .build();
                let mut render = Render::new(&[
                    Source::ColorOutline(0),
                    Source::ColorBitmap(StrikeWith::BestFit),
                    Source::Outline,
                ]);
                render
                    .format(Format::Alpha)
                    .offset(Vector::new(x_bin as f32 / 4.0, 0.0));
                if embolden {
                    render.embolden(size / 24.0);
                }
                let mut transform = (skew != 0.0)
                    .then(|| Transform::skew(Angle::from_degrees(skew), Angle::from_degrees(0.0)));
                if matrix != IDENTITY_LINEAR {
                    // `matrix` is in y-down page space; outlines are y-up.
                    let [a, b, c, d] = matrix;
                    let turn = Transform::new(a, -b, -c, d, 0.0, 0.0);
                    transform = Some(match transform {
                        Some(skew) => skew.then(&turn),
                        None => turn,
                    });
                }
                render.transform(transform);
                render.render(&mut scaler, glyph)
            })
            .as_ref()
    }
}

/// One positioned glyph run, flattened out of the Parley layout.
struct PaintRun {
    paint: usize,
    font: parley::FontData,
    size: f32,
    coords: Vec<i16>,
    embolden: bool,
    skew: f32,
    glyphs: Vec<(u16, f32, f32)>,
    x0: f32,
    x1: f32,
    baseline: f32,
    line_top: f32,
    line_bottom: f32,
    underline_offset: f32,
    underline_size: f32,
    strikethrough_offset: f32,
    ascent: f32,
    /// Index of the line the run is on, and that line's right edge.
    line: usize,
    line_end: f32,
    /// How the run is drawn in a vertical root.
    orient: Orient,
    /// The font's ascent as a fraction of its ascent + descent: where an
    /// upright glyph's baseline sits below the top of its em box.
    em_ascent: f32,
    /// The font's ascent and descent (px).
    font_ascent: f32,
    font_descent: f32,
}

/// `[a, b, c, d]` of a 2D linear map: (x, y) -> (a x + c y, b x + d y).
const IDENTITY_LINEAR: [f32; 4] = [1.0, 0.0, 0.0, 1.0];

/// How a glyph run of a vertical root is drawn (CSS Writing Modes 4 5.1).
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Orient {
    /// Turned with the line (sideways, and Latin in `mixed`).
    Rotated,
    /// Upright on the vertical line, at its laid-out advance (CJK in
    /// `mixed`).
    Upright,
    /// `text-orientation: upright`: every glyph upright, stacked by the
    /// font's ascent + descent, its baseline the ascent below the top
    /// (HarfBuzz's vertical metrics for a font without vmtx, as Chrome).
    Stacked,
    /// `text-combine-upright: all`: set horizontally within 1em, upright.
    Combine,
}

/// Whether `c` stands upright in `text-orientation: mixed` (Unicode
/// Vertical_Orientation U or Tu: CJK, kana, Hangul, fullwidth forms).
fn upright_char(c: char) -> bool {
    matches!(c as u32,
        0x1100..=0x11FF
        | 0x2E80..=0x2FFF
        | 0x3000..=0x303F
        | 0x3040..=0x31FF
        | 0x3200..=0x4DBF
        | 0x4E00..=0x9FFF
        | 0xA960..=0xA97F
        | 0xAC00..=0xD7FF
        | 0xF900..=0xFAFF
        | 0xFE10..=0xFE1F
        | 0xFE30..=0xFE4F
        | 0xFF01..=0xFF60
        | 0xFFE0..=0xFFE6
        | 0x1F000..=0x1FAFF
        | 0x20000..=0x3FFFF)
}

/// The orientation of a run of `text` with this paint in `ifc`.
fn orient(ifc: &Ifc, paint: usize, text: &str) -> Orient {
    let Some(paint) = ifc.paints.get(paint) else {
        return Orient::Rotated;
    };
    if !ifc.params.vertical {
        return Orient::Rotated;
    }
    if matches!(
        ifc.params.writing_mode,
        crate::WritingMode::SidewaysRl | crate::WritingMode::SidewaysLr
    ) {
        return Orient::Rotated;
    }
    if paint.combine {
        return Orient::Combine;
    }
    match paint.orientation {
        crate::TextOrientation::Sideways => Orient::Rotated,
        crate::TextOrientation::Upright => Orient::Stacked,
        crate::TextOrientation::Mixed => match text.chars().find(|c| !c.is_whitespace()) {
            Some(c) if upright_char(c) => Orient::Upright,
            _ => Orient::Rotated,
        },
    }
}

/// A 2D affine `[a, b, c, d, e, f]`: (x, y) -> (a x + c y + e, b x + d y + f).
type Affine2 = [f32; 6];

fn apply(m: &Affine2, x: f32, y: f32) -> (f32, f32) {
    (m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5])
}

/// One glyph to draw: id, pen position (page CSS px) and the linear part
/// of its transform.
type Placed = (u16, f32, f32, [f32; 4]);

fn runs(ifc: &Ifc) -> Vec<PaintRun> {
    let mut out = Vec::new();
    for (line_index, line) in ifc.final_layout().lines().enumerate() {
        let metrics = *line.metrics();
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(run) = item else {
                continue;
            };
            let parley_run = run.run();
            let synthesis = parley_run.synthesis();
            let font_metrics = parley_run.font_metrics();
            let paint = run.style().brush.0 as usize;
            let run_orient = orient(
                ifc,
                paint,
                ifc.text.get(parley_run.text_range()).unwrap_or(""),
            );
            let em_ascent = {
                let total = font_metrics.ascent + font_metrics.descent;
                if total > 0.0 {
                    font_metrics.ascent / total
                } else {
                    0.88
                }
            };
            let (dx, dy) = ifc
                .paints
                .get(paint)
                .map(|paint| paint.offset)
                .unwrap_or((0.0, 0.0));
            let glyphs: Vec<(u16, f32, f32)> = run
                .positioned_glyphs()
                .map(|glyph| (glyph.id as u16, glyph.x + dx, glyph.y + dy))
                .collect();
            out.push(PaintRun {
                paint,
                font: parley_run.font().clone(),
                size: parley_run.font_size(),
                coords: parley_run
                    .normalized_coords()
                    .iter()
                    .map(|c| c.to_bits())
                    .collect(),
                embolden: synthesis.embolden(),
                skew: synthesis.skew().unwrap_or(0.0),
                glyphs,
                x0: run.offset() + dx,
                x1: run.offset() + run.advance() + dx,
                baseline: run.baseline() + dy,
                line_top: metrics.block_min_coord + dy,
                line_bottom: metrics.block_max_coord + dy,
                underline_offset: font_metrics.underline_offset,
                underline_size: font_metrics.underline_size,
                strikethrough_offset: font_metrics.strikethrough_offset,
                ascent: font_metrics.ascent,
                line: line_index,
                line_end: metrics.inline_max_coord,
                orient: run_orient,
                em_ascent,
                font_ascent: font_metrics.ascent,
                font_descent: font_metrics.descent,
            });
        }
    }
    out
}

/// Apply `-webkit-line-clamp` and `text-overflow: ellipsis`: drop the lines
/// after the clamp and the glyphs the marker replaces, and add the marker.
fn truncate(ifc: &Ifc, mut runs: Vec<PaintRun>) -> Vec<PaintRun> {
    let Some(marker) = ifc.marker.as_ref() else {
        return runs;
    };
    let marker_runs = runs_of_layout(ifc, marker);
    let marker_width: f32 = marker_runs.iter().map(|run| run.x1 - run.x0).sum();
    let mut lines: Vec<usize> = runs.iter().map(|run| run.line).collect();
    lines.dedup();
    // The clamped line, when more lines follow it.
    let clamp_line = ifc
        .params
        .line_clamp
        .filter(|limit| *limit > 0 && lines.len() > *limit)
        .map(|limit| lines[limit - 1]);
    if let Some(last) = clamp_line {
        runs.retain(|run| run.line <= last);
    }
    // The line the marker goes on, and where.
    let content_end = |line: usize| {
        runs.iter()
            .filter(|run| run.line == line)
            .map(|run| run.x1)
            .fold(0.0f32, f32::max)
    };
    let line_end = |line: usize| {
        runs.iter()
            .find(|run| run.line == line)
            .map(|run| run.line_end)
            .unwrap_or(0.0)
    };
    let target = match clamp_line {
        Some(line) => Some((line, content_end(line).min(line_end(line) - marker_width))),
        None if ifc.params.ellipsis => lines
            .iter()
            .copied()
            .find(|line| content_end(*line) > line_end(*line) + 0.01)
            .map(|line| (line, (line_end(line) - marker_width).max(0.0))),
        None => None,
    };
    let Some((line, marker_x)) = target else {
        return runs;
    };
    let mut baseline = 0.0;
    for run in runs.iter_mut().filter(|run| run.line == line) {
        baseline = run.baseline;
        let mut kept = Vec::new();
        for (index, &(glyph, gx, gy)) in run.glyphs.iter().enumerate() {
            // Keep glyphs that end before the marker.
            let end = run
                .glyphs
                .get(index + 1)
                .map(|next| next.1)
                .unwrap_or(run.x1);
            if end <= marker_x + 0.01 {
                kept.push((glyph, gx, gy));
            }
        }
        run.glyphs = kept;
        run.x1 = run.x1.min(marker_x);
    }
    for mut run in marker_runs {
        let dx = marker_x - run.x0;
        let dy = baseline - run.baseline;
        run.glyphs = run
            .glyphs
            .iter()
            .map(|&(glyph, x, y)| (glyph, x + dx, y + dy))
            .collect();
        run.x0 += dx;
        run.x1 += dx;
        run.baseline += dy;
        run.line = line;
        runs.push(run);
    }
    runs
}

/// The paint runs of a separately shaped layout (the truncation marker).
fn runs_of_layout(ifc: &Ifc, layout: &parley::Layout<super::Brush>) -> Vec<PaintRun> {
    let mut out = Vec::new();
    for line in layout.lines() {
        let metrics = *line.metrics();
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(run) = item else {
                continue;
            };
            let parley_run = run.run();
            let font_metrics = parley_run.font_metrics();
            let synthesis = parley_run.synthesis();
            out.push(PaintRun {
                paint: 0,
                font: parley_run.font().clone(),
                size: parley_run.font_size(),
                coords: parley_run
                    .normalized_coords()
                    .iter()
                    .map(|c| c.to_bits())
                    .collect(),
                embolden: synthesis.embolden(),
                skew: synthesis.skew().unwrap_or(0.0),
                glyphs: run
                    .positioned_glyphs()
                    .map(|glyph| (glyph.id as u16, glyph.x, glyph.y))
                    .collect(),
                x0: run.offset(),
                x1: run.offset() + run.advance(),
                baseline: run.baseline(),
                line_top: metrics.block_min_coord,
                line_bottom: metrics.block_max_coord,
                underline_offset: font_metrics.underline_offset,
                underline_size: font_metrics.underline_size,
                strikethrough_offset: font_metrics.strikethrough_offset,
                ascent: font_metrics.ascent,
                line: 0,
                line_end: metrics.inline_max_coord,
                orient: Orient::Rotated,
                em_ascent: 0.88,
                font_ascent: font_metrics.ascent,
                font_descent: font_metrics.descent,
            });
        }
    }
    let _ = ifc;
    out
}

/// Decoration strokes of one run: (x0, x1, y, thickness, color).
fn decorations(ifc: &Ifc, run: &PaintRun, color: [u8; 4]) -> Vec<(f32, f32, f32, f32, [u8; 4])> {
    let Some(paint) = ifc.paints.get(run.paint) else {
        return Vec::new();
    };
    let thickness = run.underline_size.max(1.0).round().max(1.0);
    let mut out = Vec::new();
    if paint.underline {
        let offset = (-run.underline_offset).max(1.0).round();
        out.push((run.x0, run.x1, run.baseline + offset, thickness, color));
    }
    if paint.overline {
        out.push((run.x0, run.x1, run.baseline - run.ascent, thickness, color));
    }
    if paint.line_through {
        let offset = if run.strikethrough_offset != 0.0 {
            run.strikethrough_offset
        } else {
            run.size * 0.3
        };
        out.push((
            run.x0,
            run.x1,
            (run.baseline - offset).round(),
            thickness,
            color,
        ));
    }
    out
}

/// Whether the text of paint `paint` should not paint at all.
fn invisible(ifc: &Ifc, paint: usize, styles: &HashMap<NodeId, LayoutStyle>) -> bool {
    ifc.paints
        .get(paint)
        .and_then(|paint| styles.get(&paint.owner))
        .is_some_and(|style| style.effectively_invisible)
}

/// The scene font id of a Parley font, with its variation axes applied.
#[cfg(feature = "scene")]
fn scene_font(font: &parley::FontData, coords: &[i16]) -> u64 {
    let base = crate::paint::scene::blob_font_id(font);
    if coords.iter().all(|coord| *coord == 0) {
        return base;
    }
    let Some(font_ref) = swash::FontRef::from_index(font.data.as_ref(), font.index as usize) else {
        return base;
    };
    let axes: Vec<([u8; 4], f32)> = font_ref
        .variations()
        .zip(coords.iter())
        .map(|(axis, coord)| {
            let normalized = *coord as f32 / 16384.0;
            let value = if normalized >= 0.0 {
                axis.default_value() + normalized * (axis.max_value() - axis.default_value())
            } else {
                axis.default_value() + normalized * (axis.default_value() - axis.min_value())
            };
            (axis.tag().to_be_bytes(), value)
        })
        .collect();
    crate::paint::scene::font_instance_id(base, &axes)
}

impl Ifc {
    /// For a vertical root, the map from the run's laid-out (horizontal)
    /// coordinates to page coordinates, with the content box at (ox, oy):
    /// `vertical-rl`/`sideways-rl` turn the lines 90 degrees clockwise with
    /// the first line at the right; `vertical-lr` stacks them from the left
    /// (each line still turned clockwise); `sideways-lr` turns them
    /// counterclockwise. None for horizontal text.
    fn vertical_frame(&self, run: &PaintRun, ox: f32, oy: f32) -> Option<Affine2> {
        if !self.params.vertical {
            return None;
        }
        let (inline, block) = self.logical_size;
        let block = if block > 0.0 {
            block
        } else {
            self.final_layout().height()
        };
        Some(match self.params.writing_mode {
            crate::WritingMode::VerticalRl | crate::WritingMode::SidewaysRl => {
                [0.0, 1.0, -1.0, 0.0, ox + block, oy]
            }
            crate::WritingMode::VerticalLr => {
                [0.0, 1.0, -1.0, 0.0, ox + run.line_top + run.line_bottom, oy]
            }
            crate::WritingMode::SidewaysLr => {
                let inline = if inline > 0.0 {
                    inline
                } else {
                    self.final_layout().width()
                };
                [0.0, -1.0, 1.0, 0.0, ox, oy + inline]
            }
        })
    }

    /// The glyphs of `run` as drawn, with the content box at (ox, oy).
    fn placed(&self, run: &PaintRun, ox: f32, oy: f32) -> Vec<Placed> {
        let Some(frame) = self.vertical_frame(run, ox, oy) else {
            return run
                .glyphs
                .iter()
                .map(|&(glyph, x, y)| (glyph, ox + x, oy + y, IDENTITY_LINEAR))
                .collect();
        };
        let linear = [frame[0], frame[1], frame[2], frame[3]];
        let center = (run.line_top + run.line_bottom) / 2.0;
        // The vertical line's center, across the line.
        let (line_x, _) = apply(&frame, 0.0, center);
        let baseline_drop = run.em_ascent * run.size;
        match run.orient {
            Orient::Rotated => run
                .glyphs
                .iter()
                .map(|&(glyph, x, y)| {
                    let (px, py) = apply(&frame, x, y);
                    (glyph, px, py, linear)
                })
                .collect(),
            Orient::Upright => run
                .glyphs
                .iter()
                .enumerate()
                .map(|(index, &(glyph, x, _))| {
                    let next = run.glyphs.get(index + 1).map_or(run.x1, |next| next.1);
                    let advance = (next - x).max(0.0);
                    let (_, top) = apply(&frame, x, center);
                    (
                        glyph,
                        line_x - advance / 2.0,
                        top + baseline_drop,
                        IDENTITY_LINEAR,
                    )
                })
                .collect(),
            Orient::Stacked => {
                // Chrome advances by whole pixels here.
                let step = (run.font_ascent + run.font_descent).round();
                let mut inline = run.x0;
                run.glyphs
                    .iter()
                    .enumerate()
                    .map(|(index, &(glyph, x, _))| {
                        let next = run.glyphs.get(index + 1).map_or(run.x1, |next| next.1);
                        let advance = (next - x).max(0.0);
                        let (_, top) = apply(&frame, inline, center);
                        if advance > 0.0 {
                            inline += step;
                        }
                        let drop = run.font_ascent;
                        (glyph, line_x - advance / 2.0, top + drop, IDENTITY_LINEAR)
                    })
                    .collect()
            }
            Orient::Combine => {
                let width = (run.x1 - run.x0).max(0.0);
                let scale = if width > run.size && width > 0.0 {
                    run.size / width
                } else {
                    1.0
                };
                let (_, middle) = apply(&frame, (run.x0 + run.x1) / 2.0, center);
                let top = middle - run.size / 2.0;
                run.glyphs
                    .iter()
                    .map(|&(glyph, x, _)| {
                        (
                            glyph,
                            line_x - width * scale / 2.0 + (x - run.x0) * scale,
                            top + baseline_drop,
                            [scale, 0.0, 0.0, 1.0],
                        )
                    })
                    .collect()
            }
        }
    }

    /// Paint the glyphs and text decorations of this IFC into `pixmap`, with
    /// its content box at `origin` (CSS px) and the surface's `offset`.
    #[allow(clippy::too_many_arguments)]
    pub(crate) fn paint(
        &self,
        raster: &mut GlyphRaster,
        styles: &HashMap<NodeId, LayoutStyle>,
        pixmap: &mut tiny_skia::Pixmap,
        origin: (f32, f32),
        offset: (f32, f32),
        clip: Option<Rect>,
        clip_mask: Option<&tiny_skia::Mask>,
        raster_scale: f32,
        print_economy: bool,
    ) {
        #[cfg(feature = "scene")]
        if crate::display_list::skip_raster(pixmap)
            && self.scene_paint(styles, pixmap, origin, offset, clip, clip_mask)
        {
            return;
        }
        crate::canvas::direct_pixels(pixmap, |pixmap| {
            self.paint_pixels(
                raster,
                styles,
                pixmap,
                origin,
                offset,
                clip,
                clip_mask,
                raster_scale,
                print_economy,
            )
        });
    }

    #[allow(clippy::too_many_arguments)]
    fn paint_pixels(
        &self,
        raster: &mut GlyphRaster,
        styles: &HashMap<NodeId, LayoutStyle>,
        pixmap: &mut tiny_skia::Pixmap,
        origin: (f32, f32),
        offset: (f32, f32),
        clip: Option<Rect>,
        clip_mask: Option<&tiny_skia::Mask>,
        raster_scale: f32,
        print_economy: bool,
    ) {
        let ox = (origin.0 + offset.0) * raster_scale;
        let oy = (origin.1 + offset.1) * raster_scale;
        let pw = pixmap.width() as i32;
        let ph = pixmap.height() as i32;
        let clip_bounds = clip.map(|c| {
            (
                c.x * raster_scale,
                c.y * raster_scale,
                (c.x + c.width) * raster_scale,
                (c.y + c.height) * raster_scale,
            )
        });
        let runs = truncate(self, runs(self));
        if runs.is_empty() {
            return;
        }
        // Cull runs whose line is entirely outside the surface.
        let visible = |run: &PaintRun| {
            if self.params.vertical {
                return true;
            }
            let top = oy + (run.line_top - run.size * 4.0) * raster_scale;
            let bottom = oy + (run.line_bottom + run.size * 4.0) * raster_scale;
            bottom >= 0.0 && top <= ph as f32
        };
        // Gradient bounds per clip-text fill.
        let mut fill_bounds: HashMap<u32, (f32, f32, f32, f32)> = HashMap::new();
        for run in &runs {
            if let Some(fill) = self.paints.get(run.paint).and_then(|paint| paint.clip_fill) {
                let bounds = (run.x0, run.line_top, run.x1, run.line_bottom);
                fill_bounds
                    .entry(fill)
                    .and_modify(|b| {
                        b.0 = b.0.min(bounds.0);
                        b.1 = b.1.min(bounds.1);
                        b.2 = b.2.max(bounds.2);
                        b.3 = b.3.max(bounds.3);
                    })
                    .or_insert(bounds);
            }
        }
        let fills: HashMap<u32, ClipTextFill> = fill_bounds
            .keys()
            .filter_map(|fill| {
                let owner = self.paints.get(*fill as usize)?.owner;
                Some((*fill, clip_text_fill(styles.get(&owner)?)?))
            })
            .collect();

        let pixels = pixmap.pixels_mut();
        // `lcd`: per-channel gamma-corrected coverage, blended as Skia's
        // LCD16 on opaque pixels and as its channel average elsewhere.
        let mut blend = |px: i32, py: i32, rgba: [u8; 4], coverage: u32, lcd: Option<[u8; 3]>| {
            if let Some((cx0, cy0, cx1, cy1)) = clip_bounds {
                if (px as f32) < cx0
                    || (px as f32) >= cx1
                    || (py as f32) < cy0
                    || (py as f32) >= cy1
                {
                    return;
                }
            }
            if px < 0 || px >= pw || py < 0 || py >= ph {
                return;
            }
            let idx = (py * pw + px) as usize;
            let mask_alpha = clip_mask
                .and_then(|mask| mask.data().get(idx))
                .copied()
                .unwrap_or(255) as u32;
            let dst = pixels[idx];
            if let Some(mask) = lcd {
                if dst.alpha() == 255 {
                    let alpha = rgba[3] as u32 * mask_alpha / 255;
                    let [r, g, b] = crate::paint::lcd::blend_lcd(
                        [rgba[0], rgba[1], rgba[2]],
                        alpha,
                        mask,
                        [dst.red(), dst.green(), dst.blue()],
                    );
                    pixels[idx] =
                        tiny_skia::PremultipliedColorU8::from_rgba(r, g, b, 255).unwrap_or(dst);
                    return;
                }
            }
            let a = rgba[3] as u32 * coverage / 255 * mask_alpha / 255;
            if a == 0 {
                return;
            }
            let inv = 255 - a;
            let out_a = a + dst.alpha() as u32 * inv / 255;
            let out_r = rgba[0] as u32 * a / 255 + dst.red() as u32 * inv / 255;
            let out_g = rgba[1] as u32 * a / 255 + dst.green() as u32 * inv / 255;
            let out_b = rgba[2] as u32 * a / 255 + dst.blue() as u32 * inv / 255;
            pixels[idx] = tiny_skia::PremultipliedColorU8::from_rgba(
                out_r.min(out_a) as u8,
                out_g.min(out_a) as u8,
                out_b.min(out_a) as u8,
                out_a as u8,
            )
            .unwrap_or(dst);
        };

        let mut strokes = Vec::new();
        for run in &runs {
            if !visible(run) || invisible(self, run.paint, styles) {
                continue;
            }
            let Some(paint) = self.paints.get(run.paint) else {
                continue;
            };
            let fill = paint
                .clip_fill
                .and_then(|fill| Some((fills.get(&fill)?, *fill_bounds.get(&fill)?)));
            let mut color = paint.color;
            if print_economy {
                if fill.is_some() {
                    continue;
                }
                color = crate::paint::print_economy_color(color);
            }
            if color[3] == 0 && fill.is_none() {
                continue;
            }
            let frame = self.vertical_frame(run, 0.0, 0.0);
            strokes.extend(
                decorations(self, run, color)
                    .into_iter()
                    .map(|stroke| (stroke, frame)),
            );
            let size = run.size * raster_scale;
            let lcd_tables = crate::paint::lcd::lcd_preblend(color);
            let gray_table = crate::paint::lcd::gray_preblend(color);
            let placed = self.placed(run, origin.0 + offset.0, origin.1 + offset.1);
            for &(glyph, gx, gy, matrix) in &placed {
                let (x, x_bin) = subpixel(gx * raster_scale);
                let y = (gy * raster_scale).round() as i32;
                if fill.is_none() {
                    if let Some(image) = raster.lcd_image(
                        &run.font,
                        glyph,
                        size,
                        x_bin,
                        &run.coords,
                        run.embolden,
                        run.skew,
                        matrix,
                    ) {
                        let left = x + image.left;
                        let top = y + image.top;
                        for row in 0..image.height {
                            for col in 0..image.width {
                                let c = image.data[(row * image.width + col) as usize];
                                if c == [0, 0, 0] {
                                    continue;
                                }
                                let mask = [
                                    lcd_tables[0][c[0] as usize],
                                    lcd_tables[1][c[1] as usize],
                                    lcd_tables[2][c[2] as usize],
                                ];
                                let gray = (c[0] as u32 + c[1] as u32 + c[2] as u32) / 3;
                                let coverage = gray_table[gray as usize] as u32;
                                blend(left + col, top + row, color, coverage, Some(mask));
                            }
                        }
                        continue;
                    }
                }
                let Some(image) = raster.image(
                    &run.font,
                    glyph,
                    size,
                    x_bin,
                    &run.coords,
                    run.embolden,
                    run.skew,
                    matrix,
                ) else {
                    continue;
                };
                let left = x + image.placement.left;
                let top = y - image.placement.top;
                let width = image.placement.width as i32;
                let height = image.placement.height as i32;
                match image.content {
                    Content::Mask => {
                        for row in 0..height {
                            for col in 0..width {
                                let coverage = image.data[(row * width + col) as usize] as u32;
                                if coverage == 0 {
                                    continue;
                                }
                                let (px, py) = (left + col, top + row);
                                let rgba = match fill {
                                    Some((fill, (x0, y0, x1, y1))) => {
                                        let mut sampled = sample_gradient(
                                            fill,
                                            (px as f32 + 0.5 - ox) / raster_scale - x0,
                                            (py as f32 + 0.5 - oy) / raster_scale - y0,
                                            x1 - x0,
                                            y1 - y0,
                                        );
                                        sampled[3] = 255;
                                        sampled
                                    }
                                    None => color,
                                };
                                blend(px, py, rgba, coverage, None);
                            }
                        }
                    }
                    Content::Color => {
                        for row in 0..height {
                            for col in 0..width {
                                let i = ((row * width + col) * 4) as usize;
                                let rgba = [
                                    image.data[i],
                                    image.data[i + 1],
                                    image.data[i + 2],
                                    color[3].max(if fill.is_some() { 255 } else { 0 }),
                                ];
                                let coverage = image.data[i + 3] as u32;
                                if coverage == 0 {
                                    continue;
                                }
                                blend(left + col, top + row, rgba, coverage, None);
                            }
                        }
                    }
                    Content::SubpixelMask => {}
                }
            }
        }
        for ((x0, x1, y, thickness, color), frame) in strokes {
            if color[3] == 0 {
                continue;
            }
            if let Some(frame) = frame {
                // A turned stroke: an axis-aligned rect in page space.
                let t = thickness.round().max(1.0);
                let (ax, ay) = apply(&frame, x0, y);
                let (bx, by) = apply(&frame, x1, y + t);
                let (left, right) = (ax.min(bx), ax.max(bx));
                let (top, bottom) = (ay.min(by), ay.max(by));
                for py in (oy + top * raster_scale) as i32..(oy + bottom * raster_scale) as i32 {
                    for px in (ox + left * raster_scale) as i32..(ox + right * raster_scale) as i32
                    {
                        blend(px, py, color, 255, None);
                    }
                }
                continue;
            }
            let t = (thickness * raster_scale).round().max(1.0) as i32;
            let py0 = (oy + y * raster_scale) as i32;
            for dt in 0..t {
                for px in (ox + x0 * raster_scale) as i32..(ox + x1 * raster_scale) as i32 {
                    blend(px, py0 + dt, color, 255, None);
                }
            }
        }
    }

    /// Record the glyph runs, decorations and text hit regions for the GPU
    /// compositor. False when the IFC cannot be expressed that way (a
    /// `background-clip: text` fill or an unknown clip).
    #[cfg(feature = "scene")]
    fn scene_paint(
        &self,
        styles: &HashMap<NodeId, LayoutStyle>,
        pixmap: &tiny_skia::Pixmap,
        origin: (f32, f32),
        offset: (f32, f32),
        clip: Option<Rect>,
        clip_mask: Option<&tiny_skia::Mask>,
    ) -> bool {
        use crate::display_list::{emit_scene_marker, emit_scene_op, scene_clip_known, Op};
        if !scene_clip_known(clip_mask) {
            return false;
        }
        let runs = truncate(self, runs(self));
        if runs.iter().any(|run| {
            self.paints
                .get(run.paint)
                .is_some_and(|paint| paint.clip_fill.is_some())
        }) {
            return false;
        }
        let clip = clip.map(|c| [c.x, c.y, c.width, c.height]);
        let (ox, oy) = (origin.0 + offset.0, origin.1 + offset.1);
        let default_owner = crate::display_list::current_node();
        let mut strokes = Vec::new();
        // One hit region per text owner per run.
        let mut hits: Vec<(u64, f32, f32, f32, f32, Affine2)> = Vec::new();
        for run in &runs {
            if invisible(self, run.paint, styles) {
                continue;
            }
            let Some(paint) = self.paints.get(run.paint) else {
                continue;
            };
            let owner = paint
                .text_node
                .map(|node| node.index() as u64 + 1)
                .unwrap_or(default_owner);
            // Vertical text: hit regions and decorations are the run's
            // laid-out rects under the vertical frame.
            let frame = self.vertical_frame(run, ox, oy);
            let frame_transform = frame.unwrap_or([1.0, 0.0, 0.0, 1.0, ox, oy]);
            hits.push((
                owner,
                run.x0,
                run.line_top,
                run.x1 - run.x0,
                run.line_bottom - run.line_top,
                frame_transform,
            ));
            if paint.color[3] == 0 {
                continue;
            }
            strokes.extend(
                decorations(self, run, paint.color)
                    .into_iter()
                    .map(|stroke| (stroke, frame_transform)),
            );
            let font = scene_font(&run.font, &run.coords);
            let color = paint.color.map(|c| c as f32 / 255.0);
            let skew = if run.skew != 0.0 {
                -run.skew.to_radians().tan()
            } else {
                0.0
            };
            let glyph_op = |glyphs: Vec<(u32, f32, f32)>, transform| Op::Glyphs {
                font,
                size: run.size,
                color,
                glyphs,
                synthetic_bold: run.embolden,
                skew,
                transform,
            };
            match (frame, run.orient) {
                (Some(frame), Orient::Rotated) => {
                    let glyphs = run
                        .glyphs
                        .iter()
                        .map(|&(glyph, x, y)| (glyph as u32, x, y))
                        .collect();
                    emit_scene_op(pixmap, clip_mask, clip, glyph_op(glyphs, frame));
                }
                (Some(_), Orient::Combine) => {
                    // Placed glyphs share one horizontal scale.
                    let placed = self.placed(run, ox, oy);
                    let Some(&(_, x0, y0, [scale, ..])) = placed.first() else {
                        continue;
                    };
                    let glyphs = placed
                        .iter()
                        .map(|&(glyph, x, y, _)| (glyph as u32, (x - x0) / scale, y - y0))
                        .collect();
                    let transform = [scale, 0.0, 0.0, 1.0, x0, y0];
                    emit_scene_op(pixmap, clip_mask, clip, glyph_op(glyphs, transform));
                }
                _ => {
                    let glyphs = self
                        .placed(run, ox, oy)
                        .into_iter()
                        .map(|(glyph, x, y, _)| (glyph as u32, x, y))
                        .collect();
                    let op = glyph_op(glyphs, crate::display_list::IDENTITY);
                    emit_scene_op(pixmap, clip_mask, clip, op);
                }
            }
        }
        for ((x0, x1, y, thickness, color), transform) in strokes {
            if color[3] == 0 || x1 <= x0 {
                continue;
            }
            let (x, y, w, h) = (x0, y, x1 - x0, thickness.max(1.0).round());
            let op = Op::Fill {
                path: vec![
                    crate::display_list::Verb::M(x, y),
                    crate::display_list::Verb::L(x + w, y),
                    crate::display_list::Verb::L(x + w, y + h),
                    crate::display_list::Verb::L(x, y + h),
                    crate::display_list::Verb::Z,
                ],
                brush: crate::display_list::Brush::Solid {
                    color: color.map(|c| c as f32 / 255.0),
                },
                rule: crate::display_list::Rule::NonZero,
                transform,
            };
            emit_scene_op(pixmap, clip_mask, clip, op);
        }
        for (node, x, y, w, h, transform) in hits {
            if w <= 0.0 || h <= 0.0 {
                continue;
            }
            emit_scene_marker(
                pixmap,
                Op::Hit {
                    node,
                    rect: [x, y, w, h],
                    radii: [0.0; 4],
                    clip,
                    text: true,
                    transform,
                },
            );
        }
        true
    }

    /// Per line, its ink rectangle in document coordinates and a fingerprint
    /// of everything it paints (glyphs, fonts, colors, decorations), for
    /// paint damage tracking.
    pub(crate) fn line_fingerprints(&self) -> Vec<(Rect, u64)> {
        let runs = truncate(self, runs(self));
        let mut lines: Vec<(Rect, std::collections::hash_map::DefaultHasher)> = Vec::new();
        for run in &runs {
            while lines.len() <= run.line {
                lines.push((
                    Rect {
                        x: 0.0,
                        y: 0.0,
                        width: 0.0,
                        height: 0.0,
                    },
                    std::collections::hash_map::DefaultHasher::new(),
                ));
            }
            let (rect, hasher) = &mut lines[run.line];
            let pad = run.size;
            let ink = Rect {
                x: self.origin.0 + run.x0 - pad,
                y: self.origin.1 + run.line_top - pad,
                width: run.x1 - run.x0 + 2.0 * pad,
                height: run.line_bottom - run.line_top + 2.0 * pad,
            };
            *rect = if rect.width == 0.0 && rect.height == 0.0 {
                ink
            } else {
                rect.union(&ink)
            };
            run.font.data.id().hash(hasher);
            run.font.index.hash(hasher);
            run.size.to_bits().hash(hasher);
            run.coords.hash(hasher);
            run.embolden.hash(hasher);
            if let Some(paint) = self.paints.get(run.paint) {
                paint.color.hash(hasher);
                (paint.underline, paint.overline, paint.line_through).hash(hasher);
                paint.clip_fill.hash(hasher);
            }
            for &(glyph, x, y) in &run.glyphs {
                glyph.hash(hasher);
                (self.origin.0 + x).to_bits().hash(hasher);
                (self.origin.1 + y).to_bits().hash(hasher);
            }
        }
        lines
            .into_iter()
            .map(|(rect, hasher)| (rect, hasher.finish()))
            .collect()
    }

    /// Ink rectangles of each line (content-box relative) for damage
    /// tracking: (line top, line bottom, x0, x1).
    pub(crate) fn line_boxes(&self) -> Vec<Rect> {
        self.final_layout()
            .lines()
            .map(|line| {
                let metrics = line.metrics();
                Rect {
                    x: metrics.inline_min_coord + metrics.offset,
                    y: metrics.block_min_coord,
                    width: metrics.advance,
                    height: metrics.block_max_coord - metrics.block_min_coord,
                }
            })
            .collect()
    }
}
