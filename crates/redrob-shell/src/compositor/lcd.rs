//! LCD text in the window (`redrob_scene_raster::lcd_text`).
//!
//! The planned text items are left out of the vello scene. vello renders
//! the rest into a scratch texture, which is copied into the page texture;
//! then one quad per run blends the run's coverage (the same `run_mask`
//! the CPU rasterizer composites) over the copy, reading the pixels under
//! it from the scratch texture: Skia's LCD16 blend where they are opaque,
//! grayscale source-over where they are not.

use std::collections::HashSet;

use eframe::wgpu;
use redrob_scene::{DisplayItem, FontId};
use redrob_scene_raster::lcd_text::{self, FontRef, GlyphCache, LcdPlan, LcdView, NotAxisAligned};
use vello::kurbo::{Affine, Rect};

use super::spatial::Resolved;
use super::state::TabScene;

/// The window's spatial mapping, for the planner.
pub struct WindowView<'a> {
    pub page: &'a TabScene,
    pub res: &'a Resolved,
    pub base: Affine,
    pub size: (u32, u32),
}

fn axis_aligned(a: &Affine) -> bool {
    let c = a.as_coeffs();
    (c[1].abs() < 1e-6 && c[2].abs() < 1e-6) || (c[0].abs() < 1e-6 && c[3].abs() < 1e-6)
}

impl WindowView<'_> {
    fn node(&self, i: usize) -> Option<usize> {
        let frame = self.page.frame.as_ref()?;
        self.page.index.get(&frame.items.get(i)?.spatial).copied()
    }
}

impl LcdView for WindowView<'_> {
    fn items(&self) -> &[DisplayItem] {
        self.page.frame.as_ref().map_or(&[], |f| &f.items)
    }
    fn device(&self, i: usize) -> Option<Affine> {
        Some(self.base * *self.res.world.get(self.node(i)?)?)
    }
    fn scroll_clip(&self, i: usize) -> Result<Option<Rect>, NotAxisAligned> {
        let (Some(node), Some(frame)) = (self.node(i), self.page.frame.as_ref()) else {
            return Ok(None);
        };
        let mut acc: Option<Rect> = None;
        for s in self.res.clip_chain(node) {
            if let Some((t, r)) = self.res.scroll_clip(frame, s) {
                let xf = self.base * t;
                if !axis_aligned(&xf) {
                    return Err(NotAxisAligned);
                }
                let r = xf.transform_rect_bbox(r);
                acc = Some(acc.map_or(r, |a| a.intersect(r)));
            }
        }
        Ok(acc)
    }
    fn font(&self, id: FontId) -> Option<FontRef<'_>> {
        if let Some(font) = self.page.fonts.get(&id) {
            return Some(FontRef {
                data: font.data.data(),
                index: font.index,
                coords: &[],
            });
        }
        let (base, coords) = self.page.instances.get(&id)?;
        let font = self.page.fonts.get(base)?;
        Some(FontRef {
            data: font.data.data(),
            index: font.index,
            coords,
        })
    }
    fn screen(&self) -> Rect {
        Rect::new(0.0, 0.0, f64::from(self.size.0), f64::from(self.size.1))
    }
}

/// Side of the per-frame coverage atlas.
const ATLAS: u32 = 2048;

const SHADER: &str = r#"
struct Run { rect: vec4<i32>, atlas: vec4<i32>, clip: vec4<i32> };
@group(0) @binding(0) var under: texture_2d<f32>;
@group(0) @binding(1) var masks: texture_2d<f32>;
@group(0) @binding(2) var<storage, read> runs: array<Run>;
@group(0) @binding(3) var<uniform> view: vec4<f32>;

struct VOut { @builtin(position) pos: vec4<f32>, @location(0) @interpolate(flat) run: u32 };

@vertex fn vs(@builtin(vertex_index) v: u32, @builtin(instance_index) i: u32) -> VOut {
    var corners = array<vec2<f32>, 6>(
        vec2(0.0, 0.0), vec2(1.0, 0.0), vec2(0.0, 1.0),
        vec2(0.0, 1.0), vec2(1.0, 0.0), vec2(1.0, 1.0));
    let r = runs[i].rect;
    let p = vec2<f32>(r.xy) + corners[v] * vec2<f32>(r.zw);
    var out: VOut;
    out.pos = vec4(p.x / view.x * 2.0 - 1.0, 1.0 - p.y / view.y * 2.0, 0.0, 1.0);
    out.run = i;
    return out;
}

@fragment fn fs(in: VOut) -> @location(0) vec4<f32> {
    let run = runs[in.run];
    let px = vec2<i32>(floor(in.pos.xy));
    let c = run.clip;
    if (px.x < c.x || px.y < c.y || px.x >= c.z || px.y >= c.w) { discard; }
    let m = vec4<i32>(round(textureLoad(masks, run.atlas.xy + (px - run.rect.xy), 0) * 255.0));
    if (all(m == vec4<i32>(0))) { discard; }
    let d = vec4<i32>(round(textureLoad(under, px, 0) * 255.0));
    let color = vec4<i32>(round(unpack4x8unorm(bitcast<u32>(run.atlas.z)) * 255.0));
    if (d.a == 255) {
        let o = d.rgb + (((color.rgb - d.rgb) * m.rgb) >> vec3<u32>(5u));
        return vec4<f32>(vec3<f32>(o) / 255.0, 1.0);
    }
    // Grayscale source-over in premultiplied 8 bit, as the CPU paint;
    // the texture holds straight alpha.
    let a = m.a;
    let inv = 255 - a;
    let dp = d.rgb * d.a / 255;
    let oa = a + d.a * inv / 255;
    let op = min(color.rgb * a / 255 + dp * inv / 255, vec3<i32>(oa));
    if (oa == 0) { return vec4<f32>(0.0); }
    return vec4<f32>(vec3<f32>(op * 255 / oa) / 255.0, f32(oa) / 255.0);
}
"#;

/// The GPU side: pipeline, the coverage atlas and the scratch texture.
pub struct LcdPass {
    pipeline: wgpu::RenderPipeline,
    layout: wgpu::BindGroupLayout,
    atlas: wgpu::Texture,
    atlas_view: wgpu::TextureView,
    under: Option<(wgpu::Texture, wgpu::TextureView)>,
    uniform: wgpu::Buffer,
    pub cache: GlyphCache,
}

/// A prepared frame: the plan and the run quads.
pub struct Prepared {
    pub plan: LcdPlan,
    quads: Vec<[i32; 12]>,
}

impl Prepared {
    pub fn skip(&self) -> &HashSet<usize> {
        &self.plan.skip
    }
}

impl LcdPass {
    pub fn new(device: &wgpu::Device) -> Self {
        let module = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("redrob-lcd-text"),
            source: wgpu::ShaderSource::Wgsl(SHADER.into()),
        });
        let texture_entry = |binding| wgpu::BindGroupLayoutEntry {
            binding,
            visibility: wgpu::ShaderStages::FRAGMENT,
            ty: wgpu::BindingType::Texture {
                sample_type: wgpu::TextureSampleType::Float { filterable: false },
                view_dimension: wgpu::TextureViewDimension::D2,
                multisampled: false,
            },
            count: None,
        };
        let layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            label: Some("redrob-lcd-text"),
            entries: &[
                texture_entry(0),
                texture_entry(1),
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::VERTEX_FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::VERTEX,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
        });
        let pipeline_layout = device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
            label: Some("redrob-lcd-text"),
            bind_group_layouts: &[Some(&layout)],
            immediate_size: 0,
        });
        let pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("redrob-lcd-text"),
            layout: Some(&pipeline_layout),
            vertex: wgpu::VertexState {
                module: &module,
                entry_point: Some("vs"),
                compilation_options: Default::default(),
                buffers: &[],
            },
            primitive: wgpu::PrimitiveState::default(),
            depth_stencil: None,
            multisample: wgpu::MultisampleState::default(),
            fragment: Some(wgpu::FragmentState {
                module: &module,
                entry_point: Some("fs"),
                compilation_options: Default::default(),
                targets: &[Some(wgpu::ColorTargetState {
                    format: wgpu::TextureFormat::Rgba8Unorm,
                    blend: None,
                    write_mask: wgpu::ColorWrites::ALL,
                })],
            }),
            multiview_mask: None,
            cache: None,
        });
        let atlas = device.create_texture(&wgpu::TextureDescriptor {
            label: Some("redrob-lcd-atlas"),
            size: wgpu::Extent3d {
                width: ATLAS,
                height: ATLAS,
                depth_or_array_layers: 1,
            },
            mip_level_count: 1,
            sample_count: 1,
            dimension: wgpu::TextureDimension::D2,
            format: wgpu::TextureFormat::Rgba8Unorm,
            usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
            view_formats: &[],
        });
        let atlas_view = atlas.create_view(&Default::default());
        let uniform = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("redrob-lcd-view"),
            size: 16,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        Self {
            pipeline,
            layout,
            atlas,
            atlas_view,
            under: None,
            uniform,
            cache: GlyphCache::new(),
        }
    }

    /// Plan the frame and upload its run coverage. None when nothing draws
    /// with LCD coverage (vello draws all text) or the atlas cannot hold it.
    pub fn prepare(&mut self, queue: &wgpu::Queue, view: &WindowView<'_>) -> Option<Prepared> {
        if !redrob_scene_raster::lcd_text_enabled() {
            return None;
        }
        let plan = lcd_text::plan(view, &mut self.cache);
        if plan.runs.is_empty() {
            return None;
        }
        let (w, h) = (view.size.0 as i32, view.size.1 as i32);
        // Shelf packing, one frame at a time.
        let (mut x, mut y, mut shelf) = (0i32, 0i32, 0i32);
        let mut quads = Vec::with_capacity(plan.runs.len());
        for run in &plan.runs {
            let Some(mask) = lcd_text::run_mask(run, w, h) else {
                continue;
            };
            if mask.width > ATLAS as i32 {
                return None;
            }
            if x + mask.width > ATLAS as i32 {
                x = 0;
                y += shelf;
                shelf = 0;
            }
            if y + mask.height > ATLAS as i32 {
                return None;
            }
            let bytes: Vec<u8> = mask.data.iter().flatten().copied().collect();
            queue.write_texture(
                wgpu::TexelCopyTextureInfo {
                    texture: &self.atlas,
                    mip_level: 0,
                    origin: wgpu::Origin3d {
                        x: x as u32,
                        y: y as u32,
                        z: 0,
                    },
                    aspect: wgpu::TextureAspect::All,
                },
                &bytes,
                wgpu::TexelCopyBufferLayout {
                    offset: 0,
                    bytes_per_row: Some(mask.width as u32 * 4),
                    rows_per_image: Some(mask.height as u32),
                },
                wgpu::Extent3d {
                    width: mask.width as u32,
                    height: mask.height as u32,
                    depth_or_array_layers: 1,
                },
            );
            let color = u32::from_le_bytes(run.color) as i32;
            let [cx0, cy0, cx1, cy1] = run.clip.unwrap_or([0, 0, w, h]);
            quads.push([
                mask.x,
                mask.y,
                mask.width,
                mask.height,
                x,
                y,
                color,
                0,
                cx0,
                cy0,
                cx1,
                cy1,
            ]);
            x += mask.width;
            shelf = shelf.max(mask.height);
        }
        Some(Prepared { plan, quads })
    }

    /// The texture vello renders into before the LCD text is blended.
    pub fn under(&mut self, device: &wgpu::Device, width: u32, height: u32) -> &wgpu::TextureView {
        let fits = self
            .under
            .as_ref()
            .is_some_and(|(t, _)| t.width() == width && t.height() == height);
        if !fits {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("redrob-lcd-under"),
                size: wgpu::Extent3d {
                    width,
                    height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Rgba8Unorm,
                usage: wgpu::TextureUsages::STORAGE_BINDING
                    | wgpu::TextureUsages::TEXTURE_BINDING
                    | wgpu::TextureUsages::COPY_SRC,
                view_formats: &[],
            });
            let view = texture.create_view(&Default::default());
            self.under = Some((texture, view));
        }
        &self.under.as_ref().expect("just made").1
    }

    /// Copy the vello output into `target` and blend the runs over it.
    pub fn blend(
        &self,
        device: &wgpu::Device,
        queue: &wgpu::Queue,
        prepared: &Prepared,
        target: &wgpu::Texture,
        target_view: &wgpu::TextureView,
    ) {
        let Some((under, under_view)) = &self.under else {
            return;
        };
        let (width, height) = (target.width(), target.height());
        let size: Vec<u8> = [width as f32, height as f32, 0.0, 0.0]
            .iter()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        queue.write_buffer(&self.uniform, 0, &size);
        let data: Vec<u8> = prepared
            .quads
            .iter()
            .flatten()
            .flat_map(|v| v.to_le_bytes())
            .collect();
        let buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("redrob-lcd-runs"),
            size: data.len().max(48) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        queue.write_buffer(&buffer, 0, &data);
        let bind = device.create_bind_group(&wgpu::BindGroupDescriptor {
            label: Some("redrob-lcd-text"),
            layout: &self.layout,
            entries: &[
                wgpu::BindGroupEntry {
                    binding: 0,
                    resource: wgpu::BindingResource::TextureView(under_view),
                },
                wgpu::BindGroupEntry {
                    binding: 1,
                    resource: wgpu::BindingResource::TextureView(&self.atlas_view),
                },
                wgpu::BindGroupEntry {
                    binding: 2,
                    resource: buffer.as_entire_binding(),
                },
                wgpu::BindGroupEntry {
                    binding: 3,
                    resource: self.uniform.as_entire_binding(),
                },
            ],
        });
        let mut encoder = device.create_command_encoder(&wgpu::CommandEncoderDescriptor {
            label: Some("redrob-lcd-text"),
        });
        encoder.copy_texture_to_texture(
            under.as_image_copy(),
            target.as_image_copy(),
            wgpu::Extent3d {
                width,
                height,
                depth_or_array_layers: 1,
            },
        );
        {
            let mut pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("redrob-lcd-text"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: target_view,
                    depth_slice: None,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Load,
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                timestamp_writes: None,
                occlusion_query_set: None,
                multiview_mask: None,
            });
            pass.set_pipeline(&self.pipeline);
            pass.set_bind_group(0, &bind, &[]);
            pass.draw(0..6, 0..prepared.quads.len() as u32);
        }
        queue.submit([encoder.finish()]);
    }
}
