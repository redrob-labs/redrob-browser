//! Content keys for subtrees, so cache entries can carry the state they were computed in.
//!
//! A node's subtree key hashes its style, the embedder's content key (what its measure function
//! depends on), whether it is an inline root, and its children's subtree keys in order. A layout
//! result depends on nothing else besides its `LayoutInput` and float context, so an entry
//! computed under one key stays valid whenever the subtree has that key again: a style that is
//! set and then restored, or an unchanged subtree of a rebuilt tree that copied the old cache.

use crate::style::{CompactLength, Style};
use core::fmt::Write;

/// A 64-bit mixing hasher for subtree keys
pub(crate) struct KeyHasher(u64);

impl KeyHasher {
    /// A hasher in its initial state
    pub(crate) fn new() -> Self {
        Self(0x243f_6a88_85a3_08d3)
    }

    /// Mix in a `u64`
    #[inline]
    pub(crate) fn write(&mut self, value: u64) {
        self.0 = (self.0 ^ value).wrapping_mul(0x9e37_79b9_7f4a_7c15);
        self.0 ^= self.0 >> 29;
    }

    /// Mix in an `f32` by its bits
    #[inline]
    fn write_f32(&mut self, value: f32) {
        self.write(u64::from(value.to_bits()));
    }

    /// Mix in an optional `f32`
    #[inline]
    fn write_opt_f32(&mut self, value: Option<f32>) {
        match value {
            Some(value) => {
                self.write(1);
                self.write_f32(value);
            }
            None => self.write(0),
        }
    }

    /// Mix in a compact length: its tag and its value (the handle of a `calc()`)
    #[inline]
    fn write_length(&mut self, value: CompactLength) {
        let tag = value.tag();
        self.write(tag as u64);
        #[cfg(feature = "calc")]
        if value.is_calc() {
            self.write(value.calc_value() as usize as u64);
            return;
        }
        self.write_f32(value.value());
    }

    /// The hash
    pub(crate) fn finish(&self) -> u64 {
        self.0
    }
}

impl Write for KeyHasher {
    fn write_str(&mut self, text: &str) -> core::fmt::Result {
        for chunk in text.as_bytes().chunks(8) {
            let mut bytes = [0u8; 8];
            bytes[..chunk.len()].copy_from_slice(chunk);
            self.write(u64::from_le_bytes(bytes) ^ ((chunk.len() as u64) << 56));
        }
        Ok(())
    }
}

/// Whether `style` holds a `calc()` handle. A handle names an expression whose value can change
/// without the style changing, so a style holding one is never trusted to be the same as before.
#[cfg(feature = "calc")]
pub(crate) fn style_uses_calc(style: &Style) -> bool {
    let lengths = [
        style.size.width.into_raw(),
        style.size.height.into_raw(),
        style.min_size.width.into_raw(),
        style.min_size.height.into_raw(),
        style.max_size.width.into_raw(),
        style.max_size.height.into_raw(),
        style.inset.left.into_raw(),
        style.inset.right.into_raw(),
        style.inset.top.into_raw(),
        style.inset.bottom.into_raw(),
        style.margin.left.into_raw(),
        style.margin.right.into_raw(),
        style.margin.top.into_raw(),
        style.margin.bottom.into_raw(),
        style.padding.left.into_raw(),
        style.padding.right.into_raw(),
        style.padding.top.into_raw(),
        style.padding.bottom.into_raw(),
        style.border.left.into_raw(),
        style.border.right.into_raw(),
        style.border.top.into_raw(),
        style.border.bottom.into_raw(),
    ];
    if lengths.iter().any(|length| length.is_calc()) {
        return true;
    }
    #[cfg(any(feature = "flexbox", feature = "grid"))]
    if style.gap.width.into_raw().is_calc() || style.gap.height.into_raw().is_calc() {
        return true;
    }
    #[cfg(feature = "flexbox")]
    if style.flex_basis.into_raw().is_calc() {
        return true;
    }
    #[cfg(feature = "grid")]
    {
        let track = |track: &crate::style::TrackSizingFunction| {
            track.min.into_raw().is_calc() || track.max.into_raw().is_calc()
        };
        let template = |component: &crate::style::GridTemplateComponent<_>| match component {
            crate::style::GridTemplateComponent::Single(single) => track(single),
            crate::style::GridTemplateComponent::Repeat(repeat) => repeat.tracks.iter().any(track),
        };
        if style.grid_template_rows.iter().any(template)
            || style.grid_template_columns.iter().any(template)
            || style.grid_auto_rows.iter().any(track)
            || style.grid_auto_columns.iter().any(track)
        {
            return true;
        }
    }
    false
}

/// Every `calc()` handle of `style`, by raw value
#[cfg(feature = "calc")]
fn calc_handles(style: &Style, out: &mut Vec<u64>) {
    let mut push = |raw: crate::style::CompactLength| {
        if raw.is_calc() {
            out.push(raw.calc_value() as usize as u64);
        }
    };
    for value in [
        style.size.width.into_raw(),
        style.size.height.into_raw(),
        style.min_size.width.into_raw(),
        style.min_size.height.into_raw(),
        style.max_size.width.into_raw(),
        style.max_size.height.into_raw(),
        style.inset.left.into_raw(),
        style.inset.right.into_raw(),
        style.inset.top.into_raw(),
        style.inset.bottom.into_raw(),
        style.margin.left.into_raw(),
        style.margin.right.into_raw(),
        style.margin.top.into_raw(),
        style.margin.bottom.into_raw(),
        style.padding.left.into_raw(),
        style.padding.right.into_raw(),
        style.padding.top.into_raw(),
        style.padding.bottom.into_raw(),
        style.border.left.into_raw(),
        style.border.right.into_raw(),
        style.border.top.into_raw(),
        style.border.bottom.into_raw(),
    ] {
        push(value);
    }
    #[cfg(any(feature = "flexbox", feature = "grid"))]
    {
        push(style.gap.width.into_raw());
        push(style.gap.height.into_raw());
    }
    #[cfg(feature = "flexbox")]
    push(style.flex_basis.into_raw());
    #[cfg(feature = "grid")]
    {
        let mut track = |track: &crate::style::TrackSizingFunction| {
            push(track.min.into_raw());
            push(track.max.into_raw());
        };
        for component in style.grid_template_rows.iter().chain(&style.grid_template_columns) {
            match component {
                crate::style::GridTemplateComponent::Single(single) => track(single),
                crate::style::GridTemplateComponent::Repeat(repeat) => repeat.tracks.iter().for_each(&mut track),
            }
        }
        style.grid_auto_rows.iter().chain(&style.grid_auto_columns).for_each(track);
    }
}

/// Whether every `calc()` handle of `new` is also one of `old`'s: a style change that brings no
/// handle the node did not already hold (a pass that edits other fields of a cloned style). A
/// handle stays alive while a style holds it, so results computed under it stay valid.
#[cfg(feature = "calc")]
pub(crate) fn calc_handles_kept(old: &Style, new: &Style) -> bool {
    if !style_uses_calc(new) {
        return true;
    }
    let (mut old_handles, mut new_handles) = (Vec::new(), Vec::new());
    calc_handles(old, &mut old_handles);
    calc_handles(new, &mut new_handles);
    new_handles.iter().all(|handle| old_handles.contains(handle))
}

/// Without the `calc` feature no style holds a handle
#[cfg(not(feature = "calc"))]
pub(crate) fn calc_handles_kept(_old: &Style, _new: &Style) -> bool {
    true
}

/// Whether `style` holds a `calc()` handle (never without the `calc` feature)
#[cfg(not(feature = "calc"))]
pub(crate) fn style_uses_calc(_style: &Style) -> bool {
    false
}

/// A hash of every field of `style`
pub(crate) fn style_key(style: &Style) -> u64 {
    let mut hash = KeyHasher::new();
    hash.write(style.display as u64);
    hash.write(
        u64::from(style.item_is_table)
            | u64::from(style.establishes_bfc) << 1
            | u64::from(style.item_is_replaced) << 2
            | u64::from(style.item_aspect_ratio_is_intrinsic) << 3
            | u64::from(style.intrinsic_size_containment.width) << 4
            | u64::from(style.intrinsic_size_containment.height) << 5,
    );
    hash.write(style.box_sizing as u64);
    hash.write(style.direction as u64);
    hash.write(style.overflow.x as u64);
    hash.write(style.overflow.y as u64);
    hash.write_f32(style.scrollbar_width);
    #[cfg(feature = "float_layout")]
    {
        hash.write(style.float as u64);
        hash.write(style.clear as u64);
        if let Some(shape) = &style.shape_outside {
            let _ = write!(hash, "{shape:?}");
        }
    }
    hash.write(style.position as u64);
    for side in [style.inset.left, style.inset.right, style.inset.top, style.inset.bottom] {
        hash.write_length(side.into_raw());
    }
    for size in [style.size, style.min_size, style.max_size] {
        hash.write_length(size.width.into_raw());
        hash.write_length(size.height.into_raw());
    }
    hash.write_opt_f32(style.aspect_ratio);
    for side in [style.margin.left, style.margin.right, style.margin.top, style.margin.bottom] {
        hash.write_length(side.into_raw());
    }
    for edges in [style.padding, style.border] {
        for side in [edges.left, edges.right, edges.top, edges.bottom] {
            hash.write_length(side.into_raw());
        }
    }
    #[cfg(any(feature = "flexbox", feature = "grid"))]
    {
        for align in [style.align_items, style.align_self] {
            match align {
                Some(align) => hash.write(1 + align.keyword as u64 * 4 + align.safety as u64),
                None => hash.write(0),
            }
        }
        hash.write_length(style.gap.width.into_raw());
        hash.write_length(style.gap.height.into_raw());
    }
    #[cfg(feature = "grid")]
    for align in [style.justify_items, style.justify_self] {
        match align {
            Some(align) => hash.write(1 + align.keyword as u64 * 4 + align.safety as u64),
            None => hash.write(0),
        }
    }
    #[cfg(any(feature = "flexbox", feature = "grid", feature = "block_layout"))]
    match style.align_content {
        Some(align) => hash.write(1 + align.keyword as u64 * 4 + align.safety as u64),
        None => hash.write(0),
    }
    #[cfg(any(feature = "flexbox", feature = "grid"))]
    match style.justify_content {
        Some(align) => hash.write(1 + align.keyword as u64 * 4 + align.safety as u64),
        None => hash.write(0),
    }
    #[cfg(feature = "block_layout")]
    hash.write(style.text_align as u64);
    #[cfg(feature = "flexbox")]
    {
        hash.write(style.flex_direction as u64);
        hash.write(style.flex_wrap as u64);
        hash.write_length(style.flex_basis.into_raw());
        hash.write_f32(style.flex_grow);
        hash.write_f32(style.flex_shrink);
    }
    #[cfg(feature = "grid")]
    {
        hash.write(style.grid_auto_flow as u64);
        // Grid templates, areas, names and placements are rare; their debug form is exact.
        let default = Style::DEFAULT;
        if !style.grid_template_rows.is_empty() {
            let _ = write!(hash, "r{:?}", style.grid_template_rows);
        }
        if !style.grid_template_columns.is_empty() {
            let _ = write!(hash, "c{:?}", style.grid_template_columns);
        }
        if !style.grid_auto_rows.is_empty() {
            let _ = write!(hash, "ar{:?}", style.grid_auto_rows);
        }
        if !style.grid_auto_columns.is_empty() {
            let _ = write!(hash, "ac{:?}", style.grid_auto_columns);
        }
        if !style.grid_template_areas.is_empty() {
            let _ = write!(hash, "a{:?}", style.grid_template_areas);
        }
        if !style.grid_template_column_names.is_empty() {
            let _ = write!(hash, "cn{:?}", style.grid_template_column_names);
        }
        if !style.grid_template_row_names.is_empty() {
            let _ = write!(hash, "rn{:?}", style.grid_template_row_names);
        }
        if style.grid_row != default.grid_row {
            let _ = write!(hash, "gr{:?}", style.grid_row);
        }
        if style.grid_column != default.grid_column {
            let _ = write!(hash, "gc{:?}", style.grid_column);
        }
    }
    hash.finish()
}
