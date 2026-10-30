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

use std::collections::HashMap;
use std::time::{Duration, Instant};

use eframe::egui_wgpu;
use eframe::wgpu;
use vello::peniko::Color;

pub use channel::{connect, Incoming};
pub use paint::External;
pub use scroll::ScrollKey;
pub use spatial::Resolved;
pub use state::{TabScene, WheelPlan};
pub use ui::{cursor_icon, scrollbars, status_bubble};

/// `REDROB_SCENE_FILE=<path>`: every web tab shows the scene in this file
/// (JSON or framed bincode `SceneMsg`s) instead of the engine's. For working
/// on the compositor without an engine that sends scenes.
pub const DEBUG_FILE_ENV: &str = "REDROB_SCENE_FILE";
/// `REDROB_SCENE_TRACE=<path>`: one line per rendered frame (times, root
/// scroll offset, sticky node positions), for measuring the compositor.
pub const TRACE_ENV: &str = "REDROB_SCENE_TRACE";

/// Whether `REDROB_SCENE_TRACE` is set (then every window pass is logged).
pub fn tracing() -> bool {
    static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ON.get_or_init(|| std::env::var_os(TRACE_ENV).is_some())
}

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

/// vello on the window's own wgpu device. One `Gpu` serves every window;
/// each window (a `slot`) draws into its own texture, since all windows are
/// painted before any of them is presented.
pub struct Gpu {
    state: egui_wgpu::RenderState,
    renderer: vello::Renderer,
    scene: vello::Scene,
    targets: HashMap<u64, Target>,
    /// The texture backdrops are read back from.
    scratch: Option<(wgpu::Texture, wgpu::TextureView)>,
    drawn: HashMap<u64, Drawn>,
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
            targets: HashMap::new(),
            scratch: None,
            drawn: HashMap::new(),
            trace,
            last_render: None,
            stats: Stats::default(),
        })
    }

    /// `backdrop-filter`: for each `Backdrop` item, render the items before
    /// it (earlier backdrops included) into a scratch texture, read its
    /// device box back and filter it on the CPU with the same code as
    /// screenshots (`redrob_scene::filter`).
    fn backdrops(
        &mut self,
        page: &TabScene,
        res: &Resolved,
        size: (f32, f32),
        scale: f32,
        frames: &[(u64, Option<External>)],
        params: &vello::RenderParams,
    ) -> HashMap<usize, paint::Patch> {
        let mut patches = HashMap::new();
        let Some(frame) = &page.frame else {
            return patches;
        };
        let wanted: Vec<usize> = frame
            .items
            .iter()
            .enumerate()
            .filter(|(_, d)| matches!(d.item, redrob_scene::Item::Backdrop { .. }))
            .map(|(i, _)| i)
            .collect();
        for i in wanted {
            let redrob_scene::Item::Backdrop { rect, filters, .. } = &frame.items[i].item else {
                continue;
            };
            self.scene.reset();
            let Some(device) =
                paint::build(&mut self.scene, page, res, size, scale, frames, i, &patches)
            else {
                continue;
            };
            let (w, h) = (params.width as f64, params.height as f64);
            let bbox = device
                .transform_rect_bbox(spatial::rect(rect))
                .intersect(vello::kurbo::Rect::new(0.0, 0.0, w, h));
            let (x0, y0) = (bbox.x0.round().max(0.0), bbox.y0.round().max(0.0));
            let (x1, y1) = (bbox.x1.round().min(w), bbox.y1.round().min(h));
            if x1 <= x0 || y1 <= y0 {
                continue;
            }
            let region = (x0 as u32, y0 as u32, (x1 - x0) as u32, (y1 - y0) as u32);
            let Some(mut rgba) = self.render_region(params, region) else {
                continue;
            };
            let c = device.as_coeffs();
            let scale = (c[0] * c[3] - c[1] * c[2]).abs().sqrt() as f32;
            let (rw, rh) = (region.2 as usize, region.3 as usize);
            redrob_scene::filter::apply_filters(&mut rgba, rw, rh, filters, scale);
            patches.insert(
                i,
                paint::Patch {
                    image: vello::peniko::ImageData {
                        data: vello::peniko::Blob::from(rgba),
                        format: vello::peniko::ImageFormat::Rgba8,
                        alpha_type: vello::peniko::ImageAlphaType::AlphaPremultiplied,
                        width: region.2,
                        height: region.3,
                    },
                    origin: (x0, y0),
                },
            );
        }
        patches
    }

    /// Render `self.scene` into the scratch texture and read `region`
    /// (x, y, w, h device px) back as premultiplied RGBA8.
    fn render_region(
        &mut self,
        params: &vello::RenderParams,
        region: (u32, u32, u32, u32),
    ) -> Option<Vec<u8>> {
        let device = self.state.device.clone();
        let fits = self
            .scratch
            .as_ref()
            .is_some_and(|(t, _)| t.width() == params.width && t.height() == params.height);
        if !fits {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("redrob-backdrop"),
                size: wgpu::Extent3d {
                    width: params.width,
                    height: params.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::STORAGE_BINDING | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            self.scratch = Some((texture, view));
        }
        let (texture, view) = self.scratch.as_ref()?;
        if let Err(e) =
            self.renderer
                .render_to_texture(&device, &self.state.queue, &self.scene, view, params)
        {
            eprintln!("redrob-browser: backdrop render failed: {e}");
            return None;
        }
        let (x, y, w, h) = region;
        let row = (w * 4).div_ceil(wgpu::COPY_BYTES_PER_ROW_ALIGNMENT)
            * wgpu::COPY_BYTES_PER_ROW_ALIGNMENT;
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("redrob-backdrop-read"),
            size: u64::from(row) * u64::from(h),
            usage: wgpu::BufferUsages::COPY_DST | wgpu::BufferUsages::MAP_READ,
            mapped_at_creation: false,
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("redrob-backdrop-read"),
        });
        encoder.copy_texture_to_buffer(
            wgpu::TexelCopyTextureInfo {
                texture,
                mip_level: 0,
                origin: wgpu::Origin3d { x, y, z: 0 },
                aspect: wgpu::TextureAspect::All,
            },
            wgpu::TexelCopyBufferInfo {
                buffer: &buffer,
                layout: wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(row),
                    rows_per_image: Some(h),
                },
            },
            wgpu::Extent3d {
                width: w,
                height: h,
                depth_or_array_layers: 1,
            },
        );
        self.state.queue.submit([encoder.finish()]);
        let slice = buffer.slice(..);
        let (tx, rx) = std::sync::mpsc::channel();
        slice.map_async(wgpu::MapMode::Read, move |r| {
            let _ = tx.send(r);
        });
        let _ = device.poll(wgpu::PollType::Wait {
            submission_index: None,
            timeout: Some(Duration::from_secs(2)),
        });
        rx.recv_timeout(Duration::from_secs(2)).ok()?.ok()?;
        let mut out = Vec::with_capacity((w * h * 4) as usize);
        {
            let mapped = slice.get_mapped_range().ok()?;
            for r in 0..h as usize {
                let start = r * row as usize;
                out.extend_from_slice(&mapped[start..start + w as usize * 4]);
            }
        }
        buffer.unmap();
        // vello stores straight alpha; the filters take premultiplied.
        for px in out.as_chunks_mut::<4>().0 {
            let a = u16::from(px[3]);
            for c in &mut px[..3] {
                *c = ((u16::from(*c) * a + 127) / 255) as u8;
            }
        }
        Some(out)
    }

    fn target(&mut self, slot: u64, width: u32, height: u32) -> Option<&Target> {
        let fits = self
            .targets
            .get(&slot)
            .is_some_and(|t| t.width == width && t.height == height);
        if !fits {
            if let Some(old) = self.targets.remove(&slot) {
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
            self.targets.insert(
                slot,
                Target {
                    _texture: texture,
                    view,
                    id,
                    width,
                    height,
                },
            );
        }
        self.targets.get(&slot)
    }

    /// Window `slot` closed: free its texture.
    pub fn release(&mut self, slot: u64) {
        self.drawn.remove(&slot);
        if let Some(old) = self.targets.remove(&slot) {
            self.state.renderer.write().free_texture(&old.id);
        }
    }

    /// Draw `tab`'s page into window `slot`'s texture at `scale` physical
    /// pixels per CSS pixel and return the texture. Renders only when
    /// something changed since that window last drew; `externals` gives
    /// video frames.
    #[allow(clippy::too_many_arguments)]
    pub fn draw(
        &mut self,
        slot: u64,
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
        if self.drawn.get(&slot) == Some(&drawn) {
            return self.targets.get(&slot).map(|t| t.id);
        }
        let started = Instant::now();
        let params = vello::RenderParams {
            base_color: Color::TRANSPARENT,
            width,
            height,
            antialiasing_method: vello::AaConfig::Area,
        };
        let patches = self.backdrops(page, res, size, scale, &frames, &params);
        self.scene.reset();
        let all = page.frame.as_ref().map_or(0, |f| f.items.len());
        paint::build(
            &mut self.scene,
            page,
            res,
            size,
            scale,
            &frames,
            all,
            &patches,
        );
        let built = Instant::now();
        let target = self.target(slot, width, height)?;
        let (view, id) = (target.view.clone(), target.id);
        if let Err(e) = self.renderer.render_to_texture(
            &self.state.device,
            &self.state.queue,
            &self.scene,
            &view,
            &params,
        ) {
            eprintln!("redrob-browser: page render failed: {e}");
            self.drawn.remove(&slot);
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
        self.drawn.insert(slot, drawn);
        page.presented();
        if self.trace.is_some() {
            self.trace_frame(slot, page, res, done);
        }
        self.last_render = Some(done);
        Some(id)
    }

    fn trace_frame(&mut self, slot: u64, page: &TabScene, res: &Resolved, now: Instant) {
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
            "window={} frame={} epoch={} build_ms={:.3} render_ms={:.3} gpu_ms={:.3} interval_ms={:.2} root={:.2},{:.2} sticky={}\n",
            slot,
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
