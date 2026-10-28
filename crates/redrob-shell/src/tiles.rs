//! Tile cache: the document is painted in 512 x 512 CSS-pixel tiles kept as
//! GPU textures, so scrolling moves textures instead of repainting the page.
//! See docs/GPU-PAINT.md, phase A.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use egui::{pos2, vec2, Color32, Rect, TextureHandle, TextureOptions};

pub const TILE: f32 = 512.0;

/// Tiles asked of the engine at once. The engine works one CDP call at a time,
/// so a whole screen of queued tiles made clicks, keys and scrolls wait behind
/// a second or more of painting; two keeps it busy and input next in line.
const IN_FLIGHT: usize = 2;
/// A tile the engine never answered stops holding a slot after this long.
const IN_FLIGHT_TIMEOUT: Duration = Duration::from_secs(3);
/// Damage wider or taller than this many tiles repaints everything instead.
const MAX_DAMAGE_TILES: i64 = 256;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct TileKey {
    pub tx: i32,
    pub ty: i32,
}

#[derive(Default)]
pub struct TileCache {
    tiles: HashMap<TileKey, (u64, TextureHandle)>,
    /// The newest generation each tile has been asked for.
    pending: HashMap<TileKey, u64>,
    /// Tiles rendered on the GPU (`gpu` feature), as egui native textures.
    #[cfg(feature = "gpu")]
    native: HashMap<TileKey, (u64, egui::TextureId)>,
    /// Native textures no longer shown, for the GPU painter to free.
    #[cfg(feature = "gpu")]
    released: Vec<egui::TextureId>,
    /// Bumped whenever page pixels may have changed. A stale tile stays on
    /// screen until its replacement arrives.
    pub generation: u64,
    /// Every tile painted before this generation is stale.
    full: u64,
    /// A tile painted before its entry here is stale: the engine reported
    /// damage over it (`Page.screencastFrame` `damage`).
    dirty: HashMap<TileKey, u64>,
    in_flight: usize,
    last_request: Option<Instant>,
}

impl TileCache {
    /// Anything on the page may have changed: every tile is stale.
    pub fn invalidate(&mut self) {
        self.generation += 1;
        self.full = self.generation;
        self.dirty.clear();
    }

    /// Only these document rects (CSS px: x, y, width, height) changed:
    /// tiles they touch are stale, every other tile stays as it is.
    pub fn invalidate_rects(&mut self, rects: &[[f32; 4]]) {
        if rects.is_empty() {
            return;
        }
        let mut keys = Vec::new();
        for &[x, y, w, h] in rects {
            if !(x.is_finite() && y.is_finite() && w.is_finite() && h.is_finite()) {
                return self.invalidate();
            }
            if w <= 0.0 || h <= 0.0 {
                continue;
            }
            let x0 = ((x / TILE).floor() as i64).max(0);
            let y0 = ((y / TILE).floor() as i64).max(0);
            let x1 = ((x + w) / TILE).ceil() as i64;
            let y1 = ((y + h) / TILE).ceil() as i64;
            if x1 - x0 > MAX_DAMAGE_TILES || y1 - y0 > MAX_DAMAGE_TILES {
                return self.invalidate();
            }
            for ty in y0..y1 {
                for tx in x0..x1 {
                    keys.push(TileKey {
                        tx: tx as i32,
                        ty: ty as i32,
                    });
                }
            }
        }
        if keys.is_empty() {
            return;
        }
        self.generation += 1;
        for k in keys {
            self.dirty.insert(k, self.generation);
        }
    }

    /// The oldest generation a tile may have been painted at to be current.
    fn required(&self, key: &TileKey) -> u64 {
        self.full.max(self.dirty.get(key).copied().unwrap_or(0))
    }

    /// A new document: nothing from the old one may stay on screen.
    pub fn clear(&mut self) {
        self.tiles.clear();
        #[cfg(feature = "gpu")]
        self.released
            .extend(self.native.drain().map(|(_, (_, id))| id));
        self.invalidate();
    }

    /// Tiles covering the viewport plus one row below, so a short scroll is already painted.
    pub fn visible(scroll: (f32, f32), view: (f32, f32), content: (f32, f32)) -> Vec<TileKey> {
        let max_x = (content.0.max(view.0) / TILE).ceil() as i32;
        let max_y = (content.1.max(view.1) / TILE).ceil() as i32;
        let x0 = (scroll.0 / TILE).floor() as i32;
        let y0 = (scroll.1 / TILE).floor() as i32;
        let x1 = ((scroll.0 + view.0) / TILE).ceil() as i32;
        let y1 = ((scroll.1 + view.1) / TILE).ceil() as i32 + 1;
        let mut keys = Vec::new();
        for ty in y0.max(0)..y1.min(max_y.max(1)) {
            for tx in x0.max(0)..x1.min(max_x.max(1)) {
                keys.push(TileKey { tx, ty });
            }
        }
        keys
    }

    /// Of `keys`, the ones to request now: missing or stale, and not already asked for.
    pub fn wanted(&mut self, keys: &[TileKey]) -> Vec<TileKey> {
        let generation = self.generation;
        let mut out = Vec::new();
        for &k in keys {
            let required = self.required(&k);
            let fresh = self.tiles.get(&k).is_some_and(|(g, _)| *g >= required);
            #[cfg(feature = "gpu")]
            let fresh = fresh || self.native.get(&k).is_some_and(|(g, _)| *g >= required);
            let asked = self.pending.get(&k).is_some_and(|g| *g >= required);
            if !fresh && !asked {
                out.push(k);
            }
        }
        if self
            .last_request
            .is_some_and(|t| t.elapsed() > IN_FLIGHT_TIMEOUT)
        {
            self.in_flight = 0;
        }
        out.truncate(IN_FLIGHT.saturating_sub(self.in_flight));
        for &k in &out {
            self.pending.insert(k, generation);
        }
        if !out.is_empty() {
            self.in_flight += out.len();
            self.last_request = Some(Instant::now());
        }
        out
    }

    /// The engine answered a request, with pixels or without.
    fn answered(&mut self) {
        self.in_flight = self.in_flight.saturating_sub(1);
    }

    /// The engine could not paint `key`; it is asked for again later.
    pub fn failed(&mut self, key: TileKey, generation: u64) {
        self.forget_request(key, generation);
        self.answered();
    }

    /// The request for `key` at `generation` is answered; a newer one stays.
    fn forget_request(&mut self, key: TileKey, generation: u64) {
        if self.pending.get(&key).is_some_and(|g| *g <= generation) {
            self.pending.remove(&key);
        }
    }

    pub fn insert(
        &mut self,
        ctx: &egui::Context,
        key: TileKey,
        generation: u64,
        image: egui::ColorImage,
    ) {
        self.forget_request(key, generation);
        self.answered();
        #[cfg(feature = "gpu")]
        if let Some((g, id)) = self.native.get(&key).copied() {
            if g > generation {
                return;
            }
            self.native.remove(&key);
            self.released.push(id);
        }
        match self.tiles.get_mut(&key) {
            Some((g, _)) if *g > generation => {}
            Some((g, tex)) => {
                *g = generation;
                tex.set(image, TextureOptions::LINEAR);
            }
            None => {
                let tex = ctx.load_texture(
                    format!("tile-{}-{}", key.tx, key.ty),
                    image,
                    TextureOptions::LINEAR,
                );
                self.tiles.insert(key, (generation, tex));
            }
        }
    }

    /// For a GPU-rendered tile at `generation`: `None` when a newer tile is
    /// already shown, else the tile's current native texture to draw into again.
    #[cfg(feature = "gpu")]
    pub fn native_slot(
        &mut self,
        key: TileKey,
        generation: u64,
    ) -> Option<Option<egui::TextureId>> {
        self.forget_request(key, generation);
        if self.tiles.get(&key).is_some_and(|(g, _)| *g > generation) {
            return None;
        }
        match self.native.get(&key) {
            Some((g, _)) if *g > generation => None,
            Some((_, id)) => Some(Some(*id)),
            None => Some(None),
        }
    }

    /// Show a GPU-rendered tile. It replaces any PNG tile at `key`.
    #[cfg(feature = "gpu")]
    pub fn insert_native(&mut self, key: TileKey, generation: u64, id: egui::TextureId) {
        self.forget_request(key, generation);
        self.answered();
        self.tiles.remove(&key);
        if let Some((_, old)) = self.native.insert(key, (generation, id)) {
            if old != id {
                self.released.push(old);
            }
        }
    }

    #[cfg(feature = "gpu")]
    pub fn take_released(&mut self) -> Vec<egui::TextureId> {
        std::mem::take(&mut self.released)
    }

    /// Draw every cached tile that overlaps `rect`, offset by the scroll position.
    pub fn paint(&self, painter: &egui::Painter, rect: Rect, scroll: (f32, f32)) {
        let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
        let painter = painter.with_clip_rect(rect);
        for (key, (_, tex)) in &self.tiles {
            let min = rect.min
                + vec2(
                    key.tx as f32 * TILE - scroll.0,
                    key.ty as f32 * TILE - scroll.1,
                );
            let tile = Rect::from_min_size(min, vec2(TILE, TILE));
            if tile.intersects(rect) {
                painter.image(tex.id(), tile, uv, Color32::WHITE);
            }
        }
        #[cfg(feature = "gpu")]
        for (key, (_, id)) in &self.native {
            let min = rect.min
                + vec2(
                    key.tx as f32 * TILE - scroll.0,
                    key.ty as f32 * TILE - scroll.1,
                );
            let tile = Rect::from_min_size(min, vec2(TILE, TILE));
            if tile.intersects(rect) {
                painter.image(*id, tile, uv, Color32::WHITE);
            }
        }
    }
}
