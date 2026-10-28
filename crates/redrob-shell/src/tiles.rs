//! Tile cache: the document is painted in 512 x 512 CSS-pixel tiles kept as
//! GPU textures, so scrolling moves textures instead of repainting the page.
//! See docs/GPU-PAINT.md, phase A.

use std::collections::{HashMap, HashSet};

use egui::{pos2, vec2, Color32, Rect, TextureHandle, TextureOptions};

pub const TILE: f32 = 512.0;

#[derive(Clone, Copy, PartialEq, Eq, Hash, Debug)]
pub struct TileKey {
    pub tx: i32,
    pub ty: i32,
}

#[derive(Default)]
pub struct TileCache {
    tiles: HashMap<TileKey, (u64, TextureHandle)>,
    pending: HashSet<(TileKey, u64)>,
    /// Bumped whenever page pixels may have changed. A tile painted at an
    /// older generation stays on screen until its replacement arrives.
    pub generation: u64,
}

impl TileCache {
    pub fn invalidate(&mut self) {
        self.generation += 1;
        self.pending.clear();
    }

    /// A new document: nothing from the old one may stay on screen.
    pub fn clear(&mut self) {
        self.tiles.clear();
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
            let fresh = self.tiles.get(&k).is_some_and(|(g, _)| *g == generation);
            if !fresh && self.pending.insert((k, generation)) {
                out.push(k);
            }
        }
        out
    }

    pub fn insert(&mut self, ctx: &egui::Context, key: TileKey, generation: u64, image: egui::ColorImage) {
        self.pending.remove(&(key, generation));
        match self.tiles.get_mut(&key) {
            Some((g, _)) if *g > generation => {}
            Some((g, tex)) => {
                *g = generation;
                tex.set(image, TextureOptions::LINEAR);
            }
            None => {
                let tex = ctx.load_texture(format!("tile-{}-{}", key.tx, key.ty), image, TextureOptions::LINEAR);
                self.tiles.insert(key, (generation, tex));
            }
        }
    }

    /// Draw every cached tile that overlaps `rect`, offset by the scroll position.
    pub fn paint(&self, painter: &egui::Painter, rect: Rect, scroll: (f32, f32)) {
        let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
        let painter = painter.with_clip_rect(rect);
        for (key, (_, tex)) in &self.tiles {
            let min = rect.min + vec2(key.tx as f32 * TILE - scroll.0, key.ty as f32 * TILE - scroll.1);
            let tile = Rect::from_min_size(min, vec2(TILE, TILE));
            if tile.intersects(rect) {
                painter.image(tex.id(), tile, uv, Color32::WHITE);
            }
        }
    }
}
