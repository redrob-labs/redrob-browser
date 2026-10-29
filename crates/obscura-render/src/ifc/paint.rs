//! Painting inline formatting contexts: Parley glyph runs rasterized with
//! swash into the CPU pixmap, or recorded as scene glyph runs.

use std::collections::HashMap;
use std::hash::{Hash, Hasher};

use obscura_dom::tree::NodeId;
use parley::PositionedLayoutItem;
use swash::scale::{image::Content, image::Image, Render, ScaleContext, Source, StrikeWith};
use swash::zeno::{Angle, Format, Transform, Vector};

use super::Ifc;
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
}

/// Rasterized glyph cache shared by every IFC of a layout.
#[derive(Default)]
pub(crate) struct GlyphRaster {
    context: ScaleContext,
    images: HashMap<GlyphKey, Option<Image>>,
}

impl GlyphRaster {
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
                if skew != 0.0 {
                    render.transform(Some(Transform::skew(
                        Angle::from_degrees(skew),
                        Angle::from_degrees(0.0),
                    )));
                }
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
}

fn runs(ifc: &Ifc) -> Vec<PaintRun> {
    let mut out = Vec::new();
    for line in ifc.final_layout().lines() {
        let metrics = *line.metrics();
        for item in line.items() {
            let PositionedLayoutItem::GlyphRun(run) = item else {
                continue;
            };
            let parley_run = run.run();
            let synthesis = parley_run.synthesis();
            let font_metrics = parley_run.font_metrics();
            let paint = run.style().brush.0 as usize;
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
                coords: parley_run.normalized_coords().iter().map(|c| c.to_bits()).collect(),
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
            });
        }
    }
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
        out.push((run.x0, run.x1, (run.baseline - offset).round(), thickness, color));
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
        let runs = runs(self);
        if runs.is_empty() {
            return;
        }
        // Cull runs whose line is entirely outside the surface.
        let visible = |run: &PaintRun| {
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
        let mut blend = |px: i32, py: i32, rgba: [u8; 4], coverage: u32| {
            if let Some((cx0, cy0, cx1, cy1)) = clip_bounds {
                if (px as f32) < cx0 || (px as f32) >= cx1 || (py as f32) < cy0 || (py as f32) >= cy1 {
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
            let a = rgba[3] as u32 * coverage / 255 * mask_alpha / 255;
            if a == 0 {
                return;
            }
            let dst = pixels[idx];
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
            strokes.extend(decorations(self, run, color));
            let size = run.size * raster_scale;
            for &(glyph, gx, gy) in &run.glyphs {
                let (x, x_bin) = subpixel(ox + gx * raster_scale);
                let y = (oy + gy * raster_scale).round() as i32;
                let Some(image) =
                    raster.image(&run.font, glyph, size, x_bin, &run.coords, run.embolden, run.skew)
                else {
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
                                blend(px, py, rgba, coverage);
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
                                blend(left + col, top + row, rgba, coverage);
                            }
                        }
                    }
                    Content::SubpixelMask => {}
                }
            }
        }
        for (x0, x1, y, thickness, color) in strokes {
            if color[3] == 0 {
                continue;
            }
            let t = (thickness * raster_scale).round().max(1.0) as i32;
            let py0 = (oy + y * raster_scale) as i32;
            for dt in 0..t {
                for px in (ox + x0 * raster_scale) as i32..(ox + x1 * raster_scale) as i32 {
                    blend(px, py0 + dt, color, 255);
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
        let runs = runs(self);
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
        let mut hits: Vec<(u64, f32, f32, f32, f32)> = Vec::new();
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
            hits.push((
                owner,
                run.x0,
                run.line_top,
                run.x1 - run.x0,
                run.line_bottom - run.line_top,
            ));
            if paint.color[3] == 0 {
                continue;
            }
            strokes.extend(decorations(self, run, paint.color));
            let op = Op::Glyphs {
                font: scene_font(&run.font, &run.coords),
                size: run.size,
                color: paint.color.map(|c| c as f32 / 255.0),
                glyphs: run
                    .glyphs
                    .iter()
                    .map(|&(glyph, x, y)| (glyph as u32, ox + x, oy + y))
                    .collect(),
                synthetic_bold: run.embolden,
                skew: if run.skew != 0.0 {
                    -run.skew.to_radians().tan()
                } else {
                    0.0
                },
                transform: crate::display_list::IDENTITY,
            };
            emit_scene_op(pixmap, clip_mask, clip, op);
        }
        for (x0, x1, y, thickness, color) in strokes {
            if color[3] == 0 || x1 <= x0 {
                continue;
            }
            let (x, y, w, h) = (ox + x0, oy + y, x1 - x0, thickness.max(1.0).round());
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
                transform: crate::display_list::IDENTITY,
            };
            emit_scene_op(pixmap, clip_mask, clip, op);
        }
        for (node, x, y, w, h) in hits {
            if w <= 0.0 || h <= 0.0 {
                continue;
            }
            emit_scene_marker(
                pixmap,
                Op::Hit {
                    node,
                    rect: [ox + x, oy + y, w, h],
                    radii: [0.0; 4],
                    clip,
                    text: true,
                    transform: crate::display_list::IDENTITY,
                },
            );
        }
        true
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
