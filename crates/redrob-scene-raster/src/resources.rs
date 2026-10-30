//! Images and fonts sent by id on the scene channel.

use std::collections::HashMap;
use std::sync::{Arc, Mutex};

use redrob_scene::{FontId, ImageId, Resource};
use vello_cpu::peniko::{Blob, FontData, ImageAlphaType};
use vello_cpu::{PixelMetadata, Pixmap};

/// Client-side cache of scene resources, as the window keeps on the GPU.
pub struct ResourceStore {
    images: HashMap<ImageId, Arc<Pixmap>>,
    fonts: HashMap<FontId, (FontData, f32)>,
    /// Variable-font instances: base font and normalized coordinates.
    instances: HashMap<FontId, (FontId, Vec<i16>)>,
    externals: HashMap<u64, Arc<Pixmap>>,
    /// vello_cpu's glyph caches, reused across rasterizations.
    pub(crate) glyphs: Mutex<vello_cpu::Resources>,
    /// LCD glyph masks (`crate::lcd_text`).
    pub(crate) lcd: Mutex<crate::lcd_text::GlyphCache>,
}

impl Default for ResourceStore {
    fn default() -> Self {
        Self::new()
    }
}

impl std::fmt::Debug for ResourceStore {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("ResourceStore")
            .field("images", &self.images.len())
            .field("fonts", &self.fonts.len())
            .field("externals", &self.externals.len())
            .finish()
    }
}

/// Premultiplied RGBA8 into a pixmap; None when the size is out of range.
fn pixmap(width: u32, height: u32, rgba: Vec<u8>) -> Option<Arc<Pixmap>> {
    let (w, h) = (u16::try_from(width).ok()?, u16::try_from(height).ok()?);
    if w == 0 || h == 0 || rgba.len() != w as usize * h as usize * 4 {
        return None;
    }
    let meta = PixelMetadata {
        may_have_transparency: true,
        alpha_type: ImageAlphaType::AlphaPremultiplied,
    };
    Some(Arc::new(Pixmap::from_parts(rgba, w, h, meta)))
}

impl ResourceStore {
    pub fn new() -> Self {
        Self {
            images: HashMap::new(),
            fonts: HashMap::new(),
            instances: HashMap::new(),
            externals: HashMap::new(),
            glyphs: Mutex::new(vello_cpu::Resources::new()),
            lcd: Mutex::new(crate::lcd_text::GlyphCache::new()),
        }
    }

    /// Apply one `Resource` message. Malformed images (size mismatch, or a
    /// side over 65535 px) are ignored, so items that use them draw nothing.
    pub fn apply(&mut self, res: Resource) {
        match res {
            Resource::Image {
                id,
                width,
                height,
                rgba,
            } => match pixmap(width, height, rgba) {
                Some(p) => {
                    self.images.insert(id, p);
                }
                None => {
                    self.images.remove(&id);
                }
            },
            Resource::Font { id, data, index } => {
                use skrifa::raw::TableProvider;
                let upem = skrifa::FontRef::from_index(&data, index)
                    .ok()
                    .and_then(|f| f.head().ok().map(|h| h.units_per_em()))
                    .filter(|u| *u > 0)
                    .unwrap_or(1000);
                self.fonts.insert(
                    id,
                    (FontData::new(Blob::new(Arc::new(data)), index), upem as f32),
                );
            }
            Resource::FontInstance { id, font, axes } => {
                let Some((data, _)) = self.fonts.get(&font) else {
                    return;
                };
                let coords = skrifa::FontRef::from_index(data.data.as_ref(), data.index)
                    .map(|face| {
                        use skrifa::MetadataProvider;
                        face.axes()
                            .location(
                                axes.iter()
                                    .map(|(tag, value)| (skrifa::Tag::new(tag), *value)),
                            )
                            .coords()
                            .iter()
                            .map(|coord| coord.to_bits())
                            .collect()
                    })
                    .unwrap_or_default();
                self.instances.insert(id, (font, coords));
            }
            Resource::DropImage(id) => {
                self.images.remove(&id);
            }
            Resource::DropFont(id) => {
                self.fonts.remove(&id);
                self.instances.remove(&id);
            }
        }
    }

    pub fn apply_all(&mut self, list: impl IntoIterator<Item = Resource>) {
        for r in list {
            self.apply(r);
        }
    }

    /// Content for an `Item::External` region (a video frame or canvas the
    /// window fills itself), premultiplied RGBA8. Without one the region is
    /// left as painted beneath it.
    pub fn set_external(&mut self, key: u64, width: u32, height: u32, rgba: Vec<u8>) {
        match pixmap(width, height, rgba) {
            Some(p) => {
                self.externals.insert(key, p);
            }
            None => {
                self.externals.remove(&key);
            }
        }
    }

    pub fn remove_external(&mut self, key: u64) {
        self.externals.remove(&key);
    }

    pub fn has_image(&self, id: ImageId) -> bool {
        self.images.contains_key(&id)
    }

    pub fn has_font(&self, id: FontId) -> bool {
        self.fonts.contains_key(&id)
    }

    pub(crate) fn image(&self, id: ImageId) -> Option<&Arc<Pixmap>> {
        self.images.get(&id)
    }

    pub(crate) fn external(&self, key: u64) -> Option<&Arc<Pixmap>> {
        self.externals.get(&key)
    }

    /// The font and its units per em.
    /// A font or a variable-font instance: the file and its normalized
    /// coordinates (empty for the default instance).
    pub(crate) fn font_with_coords(&self, id: FontId) -> Option<(&(FontData, f32), &[i16])> {
        if let Some(font) = self.fonts.get(&id) {
            return Some((font, &[]));
        }
        let (base, coords) = self.instances.get(&id)?;
        Some((self.fonts.get(base)?, coords.as_slice()))
    }
}
