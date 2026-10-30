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
