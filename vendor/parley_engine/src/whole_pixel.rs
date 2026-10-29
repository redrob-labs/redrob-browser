// Copyright 2026 the Parley Authors
// SPDX-License-Identifier: Apache-2.0 OR MIT

//! Fonts whose glyph advances are rounded to whole pixels.
//!
//! Chromium on Linux shapes downloaded web fonts without subpixel
//! positioning, so their glyph advances are whole pixels, while system fonts
//! keep fractional advances. An embedder marks the blobs of its web fonts
//! here; [`crate::ShapedText`] then rounds each glyph advance of runs in
//! those fonts.

use core::sync::atomic::{AtomicUsize, Ordering};

const SLOTS: usize = 64;

/// Blob ids marked for whole-pixel advances (0 = empty slot).
static MARKED: [core::sync::atomic::AtomicU64; SLOTS] =
    [const { core::sync::atomic::AtomicU64::new(0) }; SLOTS];
static NEXT: AtomicUsize = AtomicUsize::new(0);

/// Shape the font blob with this id (`Blob::id`) with whole-pixel glyph
/// advances. Blob ids are unique for the process; the table keeps the most
/// recent 64 marks.
pub fn mark_whole_pixel_advances(blob_id: u64) {
    if blob_id == 0 || is_whole_pixel(blob_id) {
        return;
    }
    let slot = NEXT.fetch_add(1, Ordering::Relaxed) % SLOTS;
    MARKED[slot].store(blob_id, Ordering::Relaxed);
}

/// Whether the blob with this id shapes with whole-pixel advances.
pub fn is_whole_pixel(blob_id: u64) -> bool {
    blob_id != 0
        && MARKED
            .iter()
            .any(|slot| slot.load(Ordering::Relaxed) == blob_id)
}
