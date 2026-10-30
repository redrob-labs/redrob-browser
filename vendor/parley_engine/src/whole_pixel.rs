// Copyright 2026 the Parley Authors
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! Fonts whose glyph advances are rounded to whole pixels.
//!
//! Chromium on Linux shapes downloaded web fonts without subpixel
//! positioning, so their glyph advances are whole pixels, while system fonts
//! keep fractional advances. An embedder marks the blobs of its web fonts
//! here; [`crate::ShapedText`] then rounds each glyph advance of runs in
//! those fonts. Marks are counted: a blob registered by several font
//! collections stays marked until every one of them unmarks it.

use std::collections::HashMap;
use std::sync::RwLock;

static MARKED: RwLock<Option<HashMap<u64, u32>>> = RwLock::new(None);

/// Shape the font blob with this id (`Blob::id`) with whole-pixel glyph
/// advances, until a matching [`unmark_whole_pixel_advances`].
pub fn mark_whole_pixel_advances(blob_id: u64) {
    if blob_id == 0 {
        return;
    }
    if let Ok(mut marked) = MARKED.write() {
        *marked.get_or_insert_with(HashMap::new).entry(blob_id).or_insert(0) += 1;
    }
}

/// Release one mark of this blob (a font collection holding it went away).
pub fn unmark_whole_pixel_advances(blob_id: u64) {
    if blob_id == 0 {
        return;
    }
    if let Ok(mut marked) = MARKED.write() {
        if let Some(map) = marked.as_mut() {
            if let Some(count) = map.get_mut(&blob_id) {
                *count -= 1;
                if *count == 0 {
                    map.remove(&blob_id);
                }
            }
        }
    }
}

/// Whether the blob with this id shapes with whole-pixel advances.
pub fn is_whole_pixel(blob_id: u64) -> bool {
    blob_id != 0
        && MARKED
            .read()
            .ok()
            .is_some_and(|marked| marked.as_ref().is_some_and(|map| map.contains_key(&blob_id)))
}

/// Hinted advance widths in px of `glyphs` at `size`, as FreeType's light
/// autohinter reports them (`FT_LOAD_TARGET_LIGHT`, the hinting Chromium
/// uses on Linux under fontconfig's hintslight): Source Sans Pro SemiBold
/// "t" at 18px is 7 (its linear advance 6.498 rounds to 6). `NAN` for a
/// glyph the hinter cannot load.
pub fn hinted_advances(
    data: &[u8],
    index: u32,
    blob_id: u64,
    size: f32,
    coords: &[skrifa::instance::NormalizedCoord],
    glyphs: impl Iterator<Item = u32>,
) -> std::vec::Vec<f32> {
    use skrifa::outline::{DrawSettings, Engine, HintingInstance, HintingOptions, SmoothMode, Target};
    use skrifa::MetadataProvider as _;
    use std::cell::RefCell;
    use std::collections::HashMap;
    type Key = (u64, u32, u32, std::vec::Vec<i16>);
    std::thread_local! {
        static CACHE: RefCell<HashMap<Key, (Option<HintingInstance>, HashMap<u32, f32>)>> =
            RefCell::new(HashMap::new());
    }
    let glyphs: std::vec::Vec<u32> = glyphs.collect();
    let Ok(font) = skrifa::FontRef::from_index(data, index) else {
        return glyphs.iter().map(|_| f32::NAN).collect();
    };
    let outlines = font.outline_glyphs();
    let key: Key = (
        blob_id,
        index,
        size.to_bits(),
        coords.iter().map(|c| c.to_bits()).collect(),
    );
    CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if cache.len() > 256 {
            cache.clear();
        }
        let (instance, advances) = cache.entry(key).or_insert_with(|| {
            let options = HintingOptions {
                engine: Engine::Auto(None),
                target: Target::Smooth {
                    mode: SmoothMode::Light,
                    symmetric_rendering: false,
                    preserve_linear_metrics: false,
                },
            };
            let instance = HintingInstance::new(
                &outlines,
                skrifa::prelude::Size::new(size),
                coords,
                options,
            )
            .ok();
            (instance, HashMap::new())
        });
        glyphs
            .iter()
            .map(|&gid| {
                if let Some(&advance) = advances.get(&gid) {
                    return advance;
                }
                let advance = instance
                    .as_ref()
                    .and_then(|instance| {
                        let glyph = outlines.get(skrifa::GlyphId::new(gid))?;
                        let mut pen = skrifa::outline::pen::NullPen;
                        glyph
                            .draw(DrawSettings::hinted(instance, false), &mut pen)
                            .ok()?
                            .advance_width
                    })
                    .unwrap_or(f32::NAN);
                advances.insert(gid, advance);
                advance
            })
            .collect()
    })
}
