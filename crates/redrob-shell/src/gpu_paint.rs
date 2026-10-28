//! GPU raster for page tiles (docs/GPU-PAINT.md, phase B step 5).
//!
//! With the `gpu` feature the window asks the engine for each tile's display
//! list (`Page.redrobDisplayList`) instead of a PNG, replays it into a vello
//! `Scene`, and renders that into a wgpu texture egui draws. vello 0.11 uses
//! wgpu 30, the same wgpu as egui-wgpu 0.36, so the scene renders on the
//! window's own device. When the engine has no display lists, or vello cannot
//! start on this GPU, tiles stay PNG captures.
//!
//! The types below read the JSON that `obscura_render::display_list`
//! writes; the field and tag names are that format.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};

use eframe::egui_wgpu;
use eframe::wgpu;
use serde::Deserialize;
use vello::kurbo::{Affine, BezPath, Cap as KCap, Join as KJoin, Rect, Stroke};
use vello::peniko::{
    BlendMode, Blob, Brush, Color, Compose, Extend as PExtend, Fill, Gradient, ImageAlphaType,
    ImageBrush, ImageData, ImageFormat, ImageQuality, Mix,
};

static ENABLED: AtomicBool = AtomicBool::new(false);
static UNSUPPORTED: AtomicBool = AtomicBool::new(false);

/// Whether tile requests should ask for display lists.
pub fn lists_wanted() -> bool {
    ENABLED.load(Ordering::Relaxed) && !UNSUPPORTED.load(Ordering::Relaxed)
}

/// The engine answered that it has no display lists: stop asking.
pub fn lists_unsupported() {
    UNSUPPORTED.store(true, Ordering::Relaxed);
}

pub fn parse(value: serde_json::Value) -> Option<DisplayList> {
    serde_json::from_value(value).ok()
}

#[derive(Deserialize)]
pub struct DisplayList {
    pub width: u32,
    pub height: u32,
    ops: Vec<Op>,
    images: Vec<ListImage>,
}

#[derive(Deserialize)]
#[serde(tag = "op", rename_all = "camelCase")]
enum Op {
    Fill {
        path: Vec<Verb>,
        brush: ListBrush,
        rule: Rule,
        transform: [f32; 6],
    },
    Stroke {
        path: Vec<Verb>,
        brush: ListBrush,
        style: StrokeStyle,
        transform: [f32; 6],
    },
    Image {
        image: usize,
        transform: [f32; 6],
        opacity: f32,
        smooth: bool,
    },
    PushClip {
        clips: Vec<ClipShape>,
    },
    PopClip,
    PushLayer {
        opacity: f32,
        blend: Blend,
    },
    PopLayer,
}

#[derive(Deserialize, Clone, Copy)]
enum Verb {
    M(f32, f32),
    L(f32, f32),
    Q(f32, f32, f32, f32),
    C(f32, f32, f32, f32, f32, f32),
    Z,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Rule {
    NonZero,
    EvenOdd,
}

#[derive(Deserialize)]
#[serde(tag = "type", rename_all = "camelCase")]
enum ListBrush {
    Solid {
        color: [f32; 4],
    },
    Linear {
        start: [f32; 2],
        end: [f32; 2],
        stops: Vec<Stop>,
        extend: Extend,
        transform: [f32; 6],
    },
    Radial {
        start: [f32; 2],
        start_radius: f32,
        end: [f32; 2],
        end_radius: f32,
        stops: Vec<Stop>,
        extend: Extend,
        transform: [f32; 6],
    },
}

#[derive(Deserialize, Clone, Copy)]
struct Stop {
    offset: f32,
    color: [u8; 4],
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Extend {
    Pad,
    Repeat,
    Reflect,
}

#[derive(Deserialize, Clone, Copy)]
struct StrokeStyle {
    width: f32,
    miter_limit: f32,
    cap: Cap,
    join: Join,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Cap {
    Butt,
    Round,
    Square,
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Join {
    Miter,
    MiterClip,
    Round,
    Bevel,
}

#[derive(Deserialize)]
struct ClipShape {
    path: Vec<Verb>,
    rule: Rule,
    transform: [f32; 6],
}

#[derive(Deserialize, Clone, Copy)]
#[serde(rename_all = "camelCase")]
enum Blend {
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

#[derive(Deserialize)]
struct ListImage {
    width: u32,
    height: u32,
    premultiplied: bool,
    #[serde(deserialize_with = "base64_bytes")]
    rgba: Vec<u8>,
}

fn base64_bytes<'de, D: serde::Deserializer<'de>>(deserializer: D) -> Result<Vec<u8>, D::Error> {
    use base64::Engine as _;
    let text = String::deserialize(deserializer)?;
    base64::engine::general_purpose::STANDARD
        .decode(text)
        .map_err(serde::de::Error::custom)
}

// ---------------------------------------------------------------------------
// Replay

fn affine(t: &[f32; 6]) -> Affine {
    Affine::new(t.map(f64::from))
}

fn bez_path(verbs: &[Verb]) -> BezPath {
    let p = |x: f32, y: f32| (f64::from(x), f64::from(y));
    let mut path = BezPath::new();
    for verb in verbs {
        match *verb {
            Verb::M(x, y) => path.move_to(p(x, y)),
            Verb::L(x, y) => path.line_to(p(x, y)),
            Verb::Q(x1, y1, x, y) => path.quad_to(p(x1, y1), p(x, y)),
            Verb::C(x1, y1, x2, y2, x, y) => path.curve_to(p(x1, y1), p(x2, y2), p(x, y)),
            Verb::Z => path.close_path(),
        }
    }
    path
}

fn fill_rule(rule: Rule) -> Fill {
    match rule {
        Rule::NonZero => Fill::NonZero,
        Rule::EvenOdd => Fill::EvenOdd,
    }
}

fn extend(extend: Extend) -> PExtend {
    match extend {
        Extend::Pad => PExtend::Pad,
        Extend::Repeat => PExtend::Repeat,
        Extend::Reflect => PExtend::Reflect,
    }
}

fn stops(stops: &[Stop]) -> Vec<(f32, Color)> {
    stops
        .iter()
        .map(|s| {
            (
                s.offset,
                Color::from_rgba8(s.color[0], s.color[1], s.color[2], s.color[3]),
            )
        })
        .collect()
}

/// The brush and its brush-space-to-user-space transform.
fn brush(brush: &ListBrush) -> (Brush, Option<Affine>) {
    match brush {
        ListBrush::Solid { color } => (Brush::Solid(Color::new(*color)), None),
        ListBrush::Linear {
            start,
            end,
            stops: s,
            extend: e,
            transform,
        } => {
            let gradient = Gradient::new_linear(
                (f64::from(start[0]), f64::from(start[1])),
                (f64::from(end[0]), f64::from(end[1])),
            )
            .with_stops(stops(s).as_slice())
            .with_extend(extend(*e));
            (Brush::Gradient(gradient), Some(affine(transform)))
        }
        ListBrush::Radial {
            start,
            start_radius,
            end,
            end_radius,
            stops: s,
            extend: e,
            transform,
        } => {
            let gradient = Gradient::new_two_point_radial(
                (f64::from(start[0]), f64::from(start[1])),
                *start_radius,
                (f64::from(end[0]), f64::from(end[1])),
                *end_radius,
            )
            .with_stops(stops(s).as_slice())
            .with_extend(extend(*e));
            (Brush::Gradient(gradient), Some(affine(transform)))
        }
    }
}

fn stroke(style: &StrokeStyle) -> Stroke {
    Stroke::new(f64::from(style.width))
        .with_miter_limit(f64::from(style.miter_limit))
        .with_caps(match style.cap {
            Cap::Butt => KCap::Butt,
            Cap::Round => KCap::Round,
            Cap::Square => KCap::Square,
        })
        .with_join(match style.join {
            Join::Miter | Join::MiterClip => KJoin::Miter,
            Join::Round => KJoin::Round,
            Join::Bevel => KJoin::Bevel,
        })
}

fn blend_mode(blend: Blend) -> BlendMode {
    let mix = |mix: Mix| BlendMode::new(mix, Compose::SrcOver);
    let compose = |compose: Compose| BlendMode::new(Mix::Normal, compose);
    match blend {
        Blend::Normal => mix(Mix::Normal),
        Blend::Multiply => mix(Mix::Multiply),
        Blend::Screen => mix(Mix::Screen),
        Blend::Overlay => mix(Mix::Overlay),
        Blend::Darken => mix(Mix::Darken),
        Blend::Lighten => mix(Mix::Lighten),
        Blend::ColorDodge => mix(Mix::ColorDodge),
        Blend::ColorBurn => mix(Mix::ColorBurn),
        Blend::HardLight => mix(Mix::HardLight),
        Blend::SoftLight => mix(Mix::SoftLight),
        Blend::Difference => mix(Mix::Difference),
        Blend::Exclusion => mix(Mix::Exclusion),
        Blend::Hue => mix(Mix::Hue),
        Blend::Saturation => mix(Mix::Saturation),
        Blend::Color => mix(Mix::Color),
        Blend::Luminosity => mix(Mix::Luminosity),
        Blend::Clear => compose(Compose::Clear),
        Blend::Copy => compose(Compose::Copy),
        Blend::Dest => compose(Compose::Dest),
        Blend::DestOver => compose(Compose::DestOver),
        Blend::SrcIn => compose(Compose::SrcIn),
        Blend::DestIn => compose(Compose::DestIn),
        Blend::SrcOut => compose(Compose::SrcOut),
        Blend::DestOut => compose(Compose::DestOut),
        Blend::SrcAtop => compose(Compose::SrcAtop),
        Blend::DestAtop => compose(Compose::DestAtop),
        Blend::Xor => compose(Compose::Xor),
        Blend::Plus => compose(Compose::Plus),
    }
}

fn image_brushes(images: &[ListImage]) -> Vec<Option<ImageBrush>> {
    images
        .iter()
        .map(|image| {
            let expected = image.width as usize * image.height as usize * 4;
            if image.width == 0 || image.height == 0 || image.rgba.len() != expected {
                return None;
            }
            Some(ImageBrush::new(ImageData {
                data: Blob::from(image.rgba.clone()),
                format: ImageFormat::Rgba8,
                alpha_type: if image.premultiplied {
                    ImageAlphaType::AlphaPremultiplied
                } else {
                    ImageAlphaType::Alpha
                },
                width: image.width,
                height: image.height,
            }))
        })
        .collect()
}

/// Encode `list` into `scene`. Push and pop ops nest; a clip of several paths
/// becomes one clip layer per path, popped together.
fn replay(scene: &mut vello::Scene, list: &DisplayList) {
    let images = image_brushes(&list.images);
    let bounds = Rect::new(0.0, 0.0, f64::from(list.width), f64::from(list.height));
    // Each entry: how many vello layers one PushClip/PushLayer opened.
    let mut open: Vec<usize> = Vec::new();
    fn close(scene: &mut vello::Scene, open: &mut Vec<usize>) {
        for _ in 0..open.pop().unwrap_or(0) {
            scene.pop_layer();
        }
    }
    for op in &list.ops {
        match op {
            Op::Fill {
                path,
                brush: b,
                rule,
                transform,
            } => {
                let (b, brush_transform) = brush(b);
                scene.fill(
                    fill_rule(*rule),
                    affine(transform),
                    &b,
                    brush_transform,
                    &bez_path(path),
                );
            }
            Op::Stroke {
                path,
                brush: b,
                style,
                transform,
            } => {
                let (b, brush_transform) = brush(b);
                scene.stroke(
                    &stroke(style),
                    affine(transform),
                    &b,
                    brush_transform,
                    &bez_path(path),
                );
            }
            Op::Image {
                image,
                transform,
                opacity,
                smooth,
            } => {
                if let Some(Some(image)) = images.get(*image) {
                    let quality = if *smooth {
                        ImageQuality::Medium
                    } else {
                        ImageQuality::Low
                    };
                    let image = image
                        .clone()
                        .with_alpha(opacity.clamp(0.0, 1.0))
                        .with_quality(quality);
                    scene.draw_image(&image, affine(transform));
                }
            }
            Op::PushClip { clips } => {
                for clip in clips {
                    scene.push_clip_layer(
                        fill_rule(clip.rule),
                        affine(&clip.transform),
                        &bez_path(&clip.path),
                    );
                }
                open.push(clips.len());
            }
            Op::PushLayer { opacity, blend } => {
                scene.push_layer(
                    Fill::NonZero,
                    blend_mode(*blend),
                    *opacity,
                    Affine::IDENTITY,
                    &bounds,
                );
                open.push(1);
            }
            Op::PopClip | Op::PopLayer => close(scene, &mut open),
        }
    }
    while !open.is_empty() {
        close(scene, &mut open);
    }
}

// ---------------------------------------------------------------------------
// Rendering

struct TileTexture {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    width: u32,
    height: u32,
}

/// Renders display lists into textures registered with egui.
pub struct GpuPainter {
    state: egui_wgpu::RenderState,
    renderer: vello::Renderer,
    scene: vello::Scene,
    textures: HashMap<egui::TextureId, TileTexture>,
}

impl GpuPainter {
    /// `None` when vello cannot start on this device; tiles then stay PNGs.
    pub fn new(state: &egui_wgpu::RenderState) -> Option<Self> {
        let renderer = vello::Renderer::new(
            &state.device,
            vello::RendererOptions {
                use_cpu: false,
                antialiasing_support: vello::AaSupport::area_only(),
                num_init_threads: None,
                pipeline_cache: None,
            },
        );
        let renderer = match renderer {
            Ok(renderer) => renderer,
            Err(e) => {
                eprintln!("redrob-browser: GPU raster unavailable, using captured tiles: {e}");
                return None;
            }
        };
        ENABLED.store(true, Ordering::Relaxed);
        Some(Self {
            state: state.clone(),
            renderer,
            scene: vello::Scene::new(),
            textures: HashMap::new(),
        })
    }

    fn create(&mut self, width: u32, height: u32) -> egui::TextureId {
        let texture = self.state.device.create_texture(&wgpu::TextureDescriptor {
            label: Some("redrob-tile"),
            size: wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            // vello writes Rgba8Unorm storage; egui-wgpu samples native textures in it.
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::TEXTURE_BINDING,
            view_formats: &[],
        });
        let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
        let id = self.state.renderer.write().register_native_texture(
            &self.state.device,
            &view,
            wgpu::FilterMode::Linear,
        );
        self.textures.insert(
            id,
            TileTexture {
                _texture: texture,
                view,
                width,
                height,
            },
        );
        id
    }

    /// Render `list` and return the texture holding it. `reuse` is the tile's
    /// previous texture: drawn into again when the size matches, freed once a
    /// replacement has rendered otherwise.
    pub fn render(
        &mut self,
        list: &DisplayList,
        reuse: Option<egui::TextureId>,
    ) -> Option<egui::TextureId> {
        let (width, height) = (list.width, list.height);
        let limit = self.state.device.limits().max_texture_dimension_2d;
        if width == 0 || height == 0 || width > limit || height > limit {
            return None;
        }
        self.scene.reset();
        replay(&mut self.scene, list);
        let reused = reuse.filter(|id| {
            self.textures
                .get(id)
                .is_some_and(|t| t.width == width && t.height == height)
        });
        let id = match reused {
            Some(id) => id,
            None => self.create(width, height),
        };
        let view = &self.textures.get(&id)?.view;
        let params = vello::RenderParams {
            base_color: Color::TRANSPARENT,
            width,
            height,
            antialiasing_method: vello::AaConfig::Area,
        };
        let rendered = self.renderer.render_to_texture(
            &self.state.device,
            &self.state.queue,
            &self.scene,
            view,
            &params,
        );
        if let Err(e) = rendered {
            eprintln!("redrob-browser: GPU tile raster failed: {e}");
            if reused.is_none() {
                self.release(id);
            }
            return None;
        }
        if let (None, Some(old)) = (reused, reuse) {
            self.release(old);
        }
        Some(id)
    }

    pub fn release(&mut self, id: egui::TextureId) {
        if self.textures.remove(&id).is_some() {
            self.state.renderer.write().free_texture(&id);
        }
    }
}
