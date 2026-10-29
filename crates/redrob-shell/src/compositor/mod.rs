//! The window's GPU compositor (docs/COMPOSITOR.md).
//!
//! The engine sends each tab's display list, spatial tree and hit regions
//! over the scene channel (`redrob_scene::SceneMsg`). The window keeps the
//! current frame per tab ([`TabScene`]), owns every scroll offset, resolves
//! sticky and fixed boxes, and every egui frame builds a vello scene and
//! renders it into one wgpu texture ([`Gpu`]) shown in the page area.
//! Hovering looks the cursor and the link up in the hit regions; nothing
//! about scrolling or hovering waits for the engine.

mod channel;
mod hit;
mod paint;
mod scroll;
mod spatial;
mod state;
mod ui;

use std::time::{Duration, Instant};

use eframe::egui_wgpu;
use eframe::wgpu;
use vello::peniko::Color;

pub use channel::{connect, Incoming};
pub use paint::External;
pub use scroll::ScrollKey;
pub use spatial::Resolved;
pub use state::TabScene;
pub use ui::{cursor_icon, scrollbars, status_bubble};

/// `REDROB_SCENE_FILE=<path>`: every web tab shows the scene in this file
/// (JSON or framed bincode `SceneMsg`s) instead of the engine's. For working
/// on the compositor without an engine that sends scenes.
pub const DEBUG_FILE_ENV: &str = "REDROB_SCENE_FILE";
/// `REDROB_SCENE_TRACE=<path>`: one line per rendered frame (times, root
/// scroll offset, sticky node positions), for measuring the compositor.
pub const TRACE_ENV: &str = "REDROB_SCENE_TRACE";

struct Target {
    _texture: wgpu::Texture,
    view: wgpu::TextureView,
    id: egui::TextureId,
    width: u32,
    height: u32,
}

/// What the last render drew, so an unchanged page is not rendered again.
#[derive(PartialEq, Clone, Copy)]
struct Drawn {
    tab: u64,
    version: u64,
    width: u32,
    height: u32,
    externals: u64,
}

/// vello on the window's own wgpu device, drawing into one texture.
pub struct Gpu {
    state: egui_wgpu::RenderState,
    renderer: vello::Renderer,
    scene: vello::Scene,
    target: Option<Target>,
    drawn: Option<Drawn>,
    trace: Option<std::fs::File>,
    last_render: Option<Instant>,
    pub stats: Stats,
}

/// Timings of the last rendered frame.
#[derive(Default, Clone, Copy, Debug)]
pub struct Stats {
    pub build: Duration,
    pub render: Duration,
    /// Submit to raster done on the GPU; measured only with the trace on.
    pub gpu: Duration,
    pub frames: u64,
}

impl Gpu {
    pub fn new(state: &egui_wgpu::RenderState) -> Result<Self, String> {
        let renderer = vello::Renderer::new(
            &state.device,
            vello::RendererOptions {
                use_cpu: false,
                antialiasing_support: vello::AaSupport::area_only(),
                num_init_threads: None,
                pipeline_cache: None,
            },
        )
        .map_err(|e| e.to_string())?;
        let trace = std::env::var_os(TRACE_ENV).and_then(|p| {
            std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(p)
                .ok()
        });
        Ok(Self {
            state: state.clone(),
            renderer,
            scene: vello::Scene::new(),
            target: None,
            drawn: None,
            trace,
            last_render: None,
            stats: Stats::default(),
        })
    }

    fn target(&mut self, width: u32, height: u32) -> Option<&Target> {
        let fits = self
            .target
            .as_ref()
            .is_some_and(|t| t.width == width && t.height == height);
        if !fits {
            if let Some(old) = self.target.take() {
                self.state.renderer.write().free_texture(&old.id);
            }
            let texture = self.state.device.create_texture(&wgpu::TextureDescriptor {
                label: Some("redrob-page"),
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
            // Drawn 1:1 in physical pixels, so nearest keeps text sharp.
            let id = self.state.renderer.write().register_native_texture(
                &self.state.device,
                &view,
                wgpu::FilterMode::Nearest,
            );
            self.target = Some(Target {
                _texture: texture,
                view,
                id,
                width,
                height,
            });
        }
        self.target.as_ref()
    }

    /// Draw `tab`'s page into the page texture at `scale` physical pixels
    /// per CSS pixel and return the texture. Renders only when something
    /// changed since the last call; `externals` gives video frames.
    pub fn draw(
        &mut self,
        tab: u64,
        page: &mut TabScene,
        res: &Resolved,
        size: (f32, f32),
        scale: f32,
        externals: &mut dyn FnMut(u64) -> Option<External>,
    ) -> Option<egui::TextureId> {
        let limit = self.state.device.limits().max_texture_dimension_2d;
        let width = ((size.0 * scale).round() as u32).clamp(1, limit);
        let height = ((size.1 * scale).round() as u32).clamp(1, limit);
        let mut frames = Vec::new();
        let mut serials = 0u64;
        for key in page.externals() {
            let frame = externals(*key);
            if let Some(f) = &frame {
                serials = serials.wrapping_mul(31).wrapping_add(f.serial ^ key);
            }
            frames.push((*key, frame));
        }
        let drawn = Drawn {
            tab,
            version: page.version(),
            width,
            height,
            externals: serials,
        };
        if self.drawn == Some(drawn) {
            return self.target.as_ref().map(|t| t.id);
        }
        let started = Instant::now();
        self.scene.reset();
        paint::build(&mut self.scene, page, res, size, scale, &frames);
        let built = Instant::now();
        let params = vello::RenderParams {
            base_color: Color::TRANSPARENT,
            width,
            height,
            antialiasing_method: vello::AaConfig::Area,
        };
        let target = self.target(width, height)?;
        let (view, id) = (target.view.clone(), target.id);
        if let Err(e) = self.renderer.render_to_texture(
            &self.state.device,
            &self.state.queue,
            &self.scene,
            &view,
            &params,
        ) {
            eprintln!("redrob-browser: page render failed: {e}");
            self.drawn = None;
            return None;
        }
        let done = Instant::now();
        if self.trace.is_some() {
            // Measuring only: wait for the GPU so the time covers the raster.
            let _ = self.state.device.poll(wgpu::PollType::Wait {
                submission_index: None,
                timeout: Some(Duration::from_secs(2)),
            });
            self.stats.gpu = Instant::now() - built;
        }
        self.stats.build = built - started;
        self.stats.render = done - built;
        self.stats.frames += 1;
        self.drawn = Some(drawn);
        page.presented();
        if self.trace.is_some() {
            self.trace_frame(page, res, done);
        }
        self.last_render = Some(done);
        Some(id)
    }

    fn trace_frame(&mut self, page: &TabScene, res: &Resolved, now: Instant) {
        use std::io::Write as _;
        let interval = self
            .last_render
            .map_or(0.0, |t| (now - t).as_secs_f64() * 1000.0);
        let root = page.root_offset();
        let sticky: Vec<String> = page
            .sticky_positions(res)
            .into_iter()
            .map(|(x, y)| format!("{x:.2},{y:.2}"))
            .collect();
        let line = format!(
            "frame={} epoch={} build_ms={:.3} render_ms={:.3} gpu_ms={:.3} interval_ms={:.2} root={:.2},{:.2} sticky={}\n",
            self.stats.frames,
            page.epoch(),
            self.stats.build.as_secs_f64() * 1000.0,
            self.stats.render.as_secs_f64() * 1000.0,
            self.stats.gpu.as_secs_f64() * 1000.0,
            interval,
            root.0,
            root.1,
            sticky.join(";"),
        );
        if let Some(f) = &mut self.trace {
            let _ = f.write_all(line.as_bytes());
        }
    }
}
