//! Display items to a vello scene.
//!
//! Items are in paint order. Each is drawn with its spatial node's
//! transform; content of nested scroll frames is clipped to them by clip
//! layers the compositor opens around runs of drawing items, so the
//! engine's own push/pop items always nest correctly around them.

use redrob_scene::{BlendMode as SBlend, Brush as SBrush, GradientStop, Item};
use vello::kurbo::{Affine, Diagonal2, Rect, RoundedRect, RoundedRectRadii, Stroke};
use vello::peniko::{
    BlendMode, Color, Compose, Fill, Gradient, ImageBrush, ImageData, ImageQuality, Mix,
};
use vello::{FontEmbolden, Scene};

use super::spatial::{self, Resolved};
use super::state::{path, TabScene};

/// A frame of an `External` item (a playing video), straight RGBA.
#[derive(Clone)]
pub struct External {
    pub image: ImageData,
    /// Changes with every new frame.
    pub serial: u64,
}

fn color(c: [f32; 4]) -> Color {
    Color::new(c)
}

fn rounded(r: Rect, radii: [f32; 4]) -> RoundedRect {
    let [tl, tr, br, bl] = radii.map(f64::from);
    RoundedRect::from_rect(r, RoundedRectRadii::new(tl, tr, br, bl))
}

fn blend(b: SBlend) -> BlendMode {
    let mix = match b {
        SBlend::Normal => Mix::Normal,
        SBlend::Multiply => Mix::Multiply,
        SBlend::Screen => Mix::Screen,
        SBlend::Overlay => Mix::Overlay,
        SBlend::Darken => Mix::Darken,
        SBlend::Lighten => Mix::Lighten,
    };
    BlendMode::new(mix, Compose::SrcOver)
}

fn stops(stops: &[GradientStop]) -> Vec<(f32, Color)> {
    stops
        .iter()
        .map(|s| (s.offset.clamp(0.0, 1.0), color(s.color)))
        .collect()
}

/// How many vello layers one engine push opened (0 for an unmatched pop).
struct Layers {
    /// Per engine push: layers it opened.
    pushed: Vec<u32>,
    /// Scroll clips open around the current run of drawing items, and the
    /// innermost clipping scroll node they are for.
    run: Option<(Option<usize>, u32)>,
}

impl Layers {
    fn close_run(&mut self, scene: &mut Scene) {
        if let Some((_, n)) = self.run.take() {
            for _ in 0..n {
                scene.pop_layer();
            }
        }
    }
}

/// Build the scene of `page` for a page area of `size` CSS px drawn at
/// `scale` physical px per CSS px.
pub fn build(
    scene: &mut Scene,
    page: &TabScene,
    res: &Resolved,
    size: (f32, f32),
    scale: f32,
    externals: &[(u64, Option<External>)],
) {
    let Some(frame) = &page.frame else { return };
    let base = Affine::scale(f64::from(scale));
    let view = Rect::new(0.0, 0.0, f64::from(size.0), f64::from(size.1));
    let bg = frame.background;
    let bg = if bg[3] <= 0.0 { [1.0, 1.0, 1.0, 1.0] } else { bg };
    scene.fill(Fill::NonZero, base, color(bg), None, &view);

    let mut layers = Layers {
        pushed: Vec::new(),
        run: None,
    };
    for (n, d) in frame.items.iter().enumerate() {
        let Some(&node) = page.index.get(&d.spatial) else {
            continue;
        };
        let world = res.world[node];
        let t = base * world;
        let drawing = page.bounds.get(n).copied().flatten();
        if let Some(local) = drawing {
            // Off the page area: nothing to draw.
            if !world.transform_rect_bbox(local).overlaps(view) {
                continue;
            }
            let clip = res.clip_scroll[node];
            if layers.run.as_ref().is_none_or(|(c, _)| *c != clip) {
                layers.close_run(scene);
                let chain = res.clip_chain(node);
                for s in &chain {
                    if let Some((pt, r)) = res.scroll_clip(frame, *s) {
                        scene.push_clip_layer(Fill::NonZero, base * pt, &r);
                    }
                }
                layers.run = Some((clip, chain.len() as u32));
            }
        } else {
            layers.close_run(scene);
        }
        match &d.item {
            Item::Rect { rect, color: c } => {
                scene.fill(Fill::NonZero, t, color(*c), None, &spatial::rect(rect));
            }
            Item::RoundedRect {
                rect,
                radii,
                color: c,
            } => {
                scene.fill(
                    Fill::NonZero,
                    t,
                    color(*c),
                    None,
                    &rounded(spatial::rect(rect), *radii),
                );
            }
            Item::Path {
                verbs,
                brush: SBrush::Solid(c),
                even_odd,
                transform,
            } => {
                let rule = if *even_odd { Fill::EvenOdd } else { Fill::NonZero };
                scene.fill(rule, t * spatial::affine(transform), color(*c), None, &path(verbs));
            }
            Item::Stroke {
                verbs,
                color: c,
                width,
                transform,
            } => {
                scene.stroke(
                    &Stroke::new(f64::from(*width)),
                    t * spatial::affine(transform),
                    color(*c),
                    None,
                    &path(verbs),
                );
            }
            Item::LinearGradient {
                rect,
                start,
                end,
                stops: s,
            } => {
                let g = Gradient::new_linear(
                    (f64::from(start.0), f64::from(start.1)),
                    (f64::from(end.0), f64::from(end.1)),
                )
                .with_stops(stops(s).as_slice());
                scene.fill(Fill::NonZero, t, &g, None, &spatial::rect(rect));
            }
            Item::RadialGradient {
                rect,
                center,
                radius,
                stops: s,
            } => {
                let (rx, ry) = (radius.0.max(1e-3), radius.1.max(1e-3));
                let c = (f64::from(center.0), f64::from(center.1));
                // A unit circle stretched to the ellipse.
                let g = Gradient::new_radial((0.0, 0.0), 1.0).with_stops(stops(s).as_slice());
                let brush_t =
                    Affine::translate(c) * Affine::scale_non_uniform(f64::from(rx), f64::from(ry));
                scene.fill(Fill::NonZero, t, &g, Some(brush_t), &spatial::rect(rect));
            }
            Item::BoxShadow {
                rect,
                radii,
                color: c,
                blur,
                offset,
                spread,
                inset,
            } => box_shadow(scene, t, rect, *radii, *c, *blur, *offset, *spread, *inset),
            Item::Image {
                image,
                dest,
                src,
                smooth,
            } => {
                let Some(data) = page.images.get(image) else {
                    continue;
                };
                let src = if src.w > 0.0 && src.h > 0.0 {
                    *src
                } else {
                    redrob_scene::Rect {
                        x: 0.0,
                        y: 0.0,
                        w: data.width as f32,
                        h: data.height as f32,
                    }
                };
                let quality = if *smooth {
                    ImageQuality::Medium
                } else {
                    ImageQuality::Low
                };
                draw_image(scene, t, data, src, spatial::rect(dest), quality);
            }
            Item::Text {
                font,
                size,
                color: c,
                glyphs,
                synthetic_bold,
                skew,
            } => {
                let Some(font) = page.fonts.get(font) else {
                    continue;
                };
                if glyphs.is_empty() || *size <= 0.0 {
                    continue;
                }
                let mut run = scene
                    .draw_glyphs(font)
                    .transform(t)
                    .font_size(*size)
                    .brush(color(*c));
                if *skew != 0.0 {
                    run = run.glyph_transform(Some(Affine::skew(f64::from(*skew), 0.0)));
                }
                if *synthetic_bold {
                    let e = f64::from(*size) / 48.0;
                    run = run.font_embolden(FontEmbolden::new(Diagonal2::new(e, e)));
                }
                run.draw(
                    Fill::NonZero,
                    glyphs.iter().map(|g| vello::Glyph {
                        id: g.id,
                        x: g.x,
                        y: g.y,
                    }),
                );
            }
            Item::External { key, rect } => {
                let r = spatial::rect(rect);
                scene.fill(Fill::NonZero, t, Color::BLACK, None, &r);
                let frame = externals
                    .iter()
                    .find(|(k, _)| k == key)
                    .and_then(|(_, f)| f.as_ref());
                if let Some(f) = frame {
                    let (w, h) = (f.image.width as f64, f.image.height as f64);
                    let fit = (r.width() / w).min(r.height() / h);
                    let shown = Rect::from_center_size(r.center(), (w * fit, h * fit));
                    let src = redrob_scene::Rect {
                        x: 0.0,
                        y: 0.0,
                        w: w as f32,
                        h: h as f32,
                    };
                    draw_image(scene, t, &f.image, src, shown, ImageQuality::Medium);
                }
            }
            Item::PushClip { rect, radii } => {
                scene.push_clip_layer(Fill::NonZero, t, &rounded(spatial::rect(rect), *radii));
                layers.pushed.push(1);
            }
            Item::PushClipPath { verbs, even_odd } => {
                let rule = if *even_odd { Fill::EvenOdd } else { Fill::NonZero };
                scene.push_clip_layer(rule, t, &path(verbs));
                layers.pushed.push(1);
            }
            Item::PushLayer {
                opacity,
                blend: b,
                transform,
            } => {
                // The layer covers everything; its content is clipped by its items.
                let all = Rect::new(-1e7, -1e7, 1e7, 1e7);
                scene.push_layer(
                    Fill::NonZero,
                    blend(*b),
                    opacity.clamp(0.0, 1.0),
                    t * spatial::affine(transform),
                    &all,
                );
                layers.pushed.push(1);
            }
            Item::PopClip | Item::PopLayer => {
                for _ in 0..layers.pushed.pop().unwrap_or(0) {
                    scene.pop_layer();
                }
            }
        }
    }
    layers.close_run(scene);
    while let Some(n) = layers.pushed.pop() {
        for _ in 0..n {
            scene.pop_layer();
        }
    }
}

/// `src` of `data` (image pixels) drawn into `dest` (local space).
fn draw_image(
    scene: &mut Scene,
    t: Affine,
    data: &ImageData,
    src: redrob_scene::Rect,
    dest: Rect,
    quality: ImageQuality,
) {
    if src.w <= 0.0 || src.h <= 0.0 || dest.width() <= 0.0 || dest.height() <= 0.0 {
        return;
    }
    let brush = ImageBrush::new(data.clone()).with_quality(quality);
    let brush_t = Affine::translate((dest.x0, dest.y0))
        * Affine::scale_non_uniform(
            dest.width() / f64::from(src.w),
            dest.height() / f64::from(src.h),
        )
        * Affine::translate((-f64::from(src.x), -f64::from(src.y)));
    scene.fill(Fill::NonZero, t, &brush, Some(brush_t), &dest);
}

/// CSS `box-shadow`: an outer shadow shows only outside the box; an inset
/// one only inside it.
#[allow(clippy::too_many_arguments)]
fn box_shadow(
    scene: &mut Scene,
    t: Affine,
    rect: &redrob_scene::Rect,
    radii: [f32; 4],
    c: [f32; 4],
    blur: f32,
    offset: (f32, f32),
    spread: f32,
    inset: bool,
) {
    let r = spatial::rect(rect);
    let radius = f64::from(radii.iter().sum::<f32>() / 4.0);
    let std_dev = f64::from(blur.max(0.0)) / 2.0;
    let spread = f64::from(spread);
    let off = (f64::from(offset.0), f64::from(offset.1));
    let shape = rounded(r, radii);
    if !inset {
        let shadow = Rect::new(r.x0 + off.0, r.y0 + off.1, r.x1 + off.0, r.y1 + off.1)
            .inflate(spread, spread);
        if shadow.width() <= 0.0 || shadow.height() <= 0.0 {
            return;
        }
        // Everything but the box itself.
        let mut outside = vello::kurbo::BezPath::new();
        let far = shadow.inflate(std_dev * 3.0 + 1.0, std_dev * 3.0 + 1.0).union(r);
        use vello::kurbo::Shape as _;
        outside.extend(far.path_elements(0.1));
        outside.extend(shape.path_elements(0.1));
        scene.push_clip_layer(Fill::EvenOdd, t, &outside);
        let radius = (radius + spread).max(0.0);
        if std_dev > 0.0 {
            scene.draw_blurred_rounded_rect(t, shadow, color(c), radius, std_dev);
        } else {
            scene.fill(
                Fill::NonZero,
                t,
                color(c),
                None,
                &RoundedRect::from_rect(shadow, radius),
            );
        }
        scene.pop_layer();
    } else {
        let hole = Rect::new(r.x0 + off.0, r.y0 + off.1, r.x1 + off.0, r.y1 + off.1)
            .inflate(-spread, -spread);
        scene.push_clip_layer(Fill::NonZero, t, &shape);
        scene.fill(Fill::NonZero, t, color(c), None, &r);
        if hole.width() > 0.0 && hole.height() > 0.0 {
            // Cut the lit middle out of the shadow color.
            scene.push_layer(
                Fill::NonZero,
                BlendMode::new(Mix::Normal, Compose::DestOut),
                1.0,
                t,
                &r,
            );
            let radius = (radius - spread).max(0.0);
            if std_dev > 0.0 {
                scene.draw_blurred_rounded_rect(t, hole, Color::BLACK, radius, std_dev);
            } else {
                scene.fill(
                    Fill::NonZero,
                    t,
                    Color::BLACK,
                    None,
                    &RoundedRect::from_rect(hole, radius),
                );
            }
            scene.pop_layer();
        }
        scene.pop_layer();
    }
}
