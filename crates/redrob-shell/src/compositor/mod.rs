//! The page layer: Chromium's frames for each tab as egui textures.
//!
//! CEF hands every tab's page (and an open popup widget, such as a
//! `<select>` list) as pixels or as a GPU texture (cef/osr.rs). [`Gpu`]
//! keeps one wgpu texture per tab and layer on the window's device, uploads
//! only the rows that changed, and registers it with egui so the window
//! draws it as an image at 1:1 physical pixels.

use std::collections::HashMap;

use eframe::egui_wgpu;
use eframe::wgpu;
use egui::{pos2, vec2, Rect};

use crate::cef::osr::{self, Layer, SharedView};
use crate::model::TabId;

struct Texture {
    texture: Option<wgpu::Texture>,
    id: egui::TextureId,
    width: u32,
    height: u32,
    serial: u64,
}

/// What to draw for a tab: its page, and its popup widget with where it goes.
pub struct Frame {
    pub page: Option<(egui::TextureId, (u32, u32))>,
    pub popup: Option<(egui::TextureId, Rect)>,
}

/// One for all windows: textures live as long as their tab.
pub struct Gpu {
    state: egui_wgpu::RenderState,
    pages: HashMap<(TabId, bool), Texture>,
}

impl Gpu {
    pub fn new(state: &egui_wgpu::RenderState) -> Result<Self, String> {
        Ok(Self {
            state: state.clone(),
            pages: HashMap::new(),
        })
    }

    /// The device and queue CEF imports accelerated frames into.
    pub fn device(&self) -> osr::Gpu {
        osr::Gpu {
            device: self.state.device.clone(),
            queue: self.state.queue.clone(),
        }
    }

    /// The tab's newest frame, uploaded.
    pub fn frame(&mut self, tab: TabId, view: &SharedView) -> Frame {
        let mut v = osr::lock(view);
        let page = self.layer(tab, false, &mut v.page);
        let popup = match v.popup_rect {
            Some([x, y, w, h]) if w > 0 && h > 0 => {
                self.layer(tab, true, &mut v.popup).map(|(id, _)| {
                    (
                        id,
                        Rect::from_min_size(pos2(x as f32, y as f32), vec2(w as f32, h as f32)),
                    )
                })
            }
            _ => None,
        };
        Frame { page, popup }
    }

    fn layer(
        &mut self,
        tab: TabId,
        popup: bool,
        layer: &mut Layer,
    ) -> Option<(egui::TextureId, (u32, u32))> {
        if layer.width == 0 || layer.height == 0 {
            return None;
        }
        let key = (tab, popup);
        let device = &self.state.device;
        // A frame CEF gave as a texture: show that texture.
        if let Some(texture) = layer.texture.take() {
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            let mut renderer = self.state.renderer.write();
            match self.pages.get_mut(&key) {
                Some(t) => {
                    renderer.update_egui_texture_from_wgpu_texture(
                        device,
                        &view,
                        wgpu::FilterMode::Nearest,
                        t.id,
                    );
                    t.texture = Some(texture);
                    t.width = layer.width;
                    t.height = layer.height;
                    t.serial = layer.serial;
                }
                None => {
                    let id =
                        renderer.register_native_texture(device, &view, wgpu::FilterMode::Nearest);
                    self.pages.insert(
                        key,
                        Texture {
                            texture: Some(texture),
                            id,
                            width: layer.width,
                            height: layer.height,
                            serial: layer.serial,
                        },
                    );
                }
            }
            return Some((self.pages[&key].id, (layer.width, layer.height)));
        }
        if layer.pixels.is_empty() {
            return self.pages.get(&key).map(|t| (t.id, (t.width, t.height)));
        }
        let fits = self.pages.get(&key).is_some_and(|t| {
            t.texture.as_ref().is_some_and(|x| {
                x.width() == layer.width
                    && x.height() == layer.height
                    && x.format() == wgpu::TextureFormat::Bgra8Unorm
            })
        });
        if !fits {
            let texture = device.create_texture(&wgpu::TextureDescriptor {
                label: Some("redrob-page"),
                size: wgpu::Extent3d {
                    width: layer.width,
                    height: layer.height,
                    depth_or_array_layers: 1,
                },
                mip_level_count: 1,
                sample_count: 1,
                dimension: wgpu::TextureDimension::D2,
                format: wgpu::TextureFormat::Bgra8Unorm,
                usage: wgpu::TextureUsages::TEXTURE_BINDING | wgpu::TextureUsages::COPY_DST,
                view_formats: &[],
            });
            let view = texture.create_view(&wgpu::TextureViewDescriptor::default());
            let mut renderer = self.state.renderer.write();
            let id = match self.pages.get(&key) {
                Some(t) => {
                    renderer.update_egui_texture_from_wgpu_texture(
                        device,
                        &view,
                        wgpu::FilterMode::Nearest,
                        t.id,
                    );
                    t.id
                }
                // Drawn 1:1 in physical pixels, so nearest keeps text sharp.
                None => renderer.register_native_texture(device, &view, wgpu::FilterMode::Nearest),
            };
            self.pages.insert(
                key,
                Texture {
                    texture: Some(texture),
                    id,
                    width: layer.width,
                    height: layer.height,
                    serial: 0,
                },
            );
            layer.dirty = Some((0, layer.height));
        }
        let t = self.pages.get_mut(&key)?;
        if let (Some((top, bottom)), Some(texture)) = (layer.dirty.take(), t.texture.as_ref()) {
            let row = layer.width as usize * 4;
            let rows = bottom.min(layer.height).saturating_sub(top);
            if rows > 0 {
                self.state.queue.write_texture(
                    wgpu::TexelCopyTextureInfo {
                        texture,
                        mip_level: 0,
                        origin: wgpu::Origin3d { x: 0, y: top, z: 0 },
                        aspect: wgpu::TextureAspect::All,
                    },
                    &layer.pixels[top as usize * row..(top + rows) as usize * row],
                    wgpu::TexelCopyBufferLayout {
                        offset: 0,
                        bytes_per_row: Some(row as u32),
                        rows_per_image: Some(rows),
                    },
                    wgpu::Extent3d {
                        width: layer.width,
                        height: rows,
                        depth_or_array_layers: 1,
                    },
                );
            }
        }
        t.serial = layer.serial;
        Some((t.id, (t.width, t.height)))
    }

    /// The tab closed: free its textures.
    pub fn release_tab(&mut self, tab: TabId) {
        for popup in [false, true] {
            if let Some(t) = self.pages.remove(&(tab, popup)) {
                self.state.renderer.write().free_texture(&t.id);
            }
        }
    }
}

/// The link under the pointer, in a bubble at the bottom of the page.
pub fn status_bubble(ui: &egui::Ui, page: Rect, link: &str, pointer: Option<egui::Pos2>) {
    let p = *crate::theme::palette(ui);
    let font = egui::FontId::proportional(12.0);
    let max_w = (page.width() / 3.0).max(240.0).min(page.width() - 8.0);
    let galley = ui
        .painter()
        .layout(link.to_string(), font, p.ink_primary, f32::INFINITY);
    let pad = vec2(8.0, 4.0);
    let w = (galley.size().x + pad.x * 2.0).min(max_w);
    let h = galley.size().y + pad.y * 2.0;
    let mut bubble = Rect::from_min_size(pos2(page.left(), page.bottom() - h), vec2(w, h));
    if pointer.is_some_and(|q| bubble.expand(8.0).contains(q)) {
        bubble = bubble.translate(vec2(page.width() - w, 0.0));
    }
    let painter = ui.painter().with_clip_rect(page);
    painter.rect(
        bubble,
        egui::CornerRadius {
            nw: 0,
            ne: 4,
            sw: 0,
            se: 0,
        },
        p.surface_raised,
        egui::Stroke::new(1.0, p.border_subtle),
        egui::StrokeKind::Inside,
    );
    let text = bubble.shrink2(pad);
    painter
        .with_clip_rect(text.intersect(page))
        .galley(text.min, galley, p.ink_primary);
}
