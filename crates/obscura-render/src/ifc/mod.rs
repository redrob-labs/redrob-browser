//! Inline formatting contexts (CSS 2.2 §9.4.2), laid out with Parley.
//!
//! Portions derived from Blitz (https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0.
//!
//! A block container whose in-flow children are all inline-level (text,
//! inline elements, atomic inline boxes) is one inline formatting context
//! (IFC). Block-level children among inline content get anonymous block
//! wrappers, one IFC each (`dom::build`). An IFC is a Taffy node marked as an
//! inline root: Taffy calls [`layout::compute_inline_layout`] for it, which
//! lays out its inline boxes (atomic inlines, floats, out-of-flow boxes, the
//! node's Taffy children), breaks lines one at a time into the space the
//! block formatting context's floats leave (`find_content_slot`) and places
//! floats with `place_floated_box`, as Blitz does.
//!
//! - [`build`]: DOM subtree -> Parley text, style spans and inline boxes.
//! - [`layout`]: the Taffy inline layout function.
//! - [`geom`]: fragments of inline elements and text nodes, `<br>`, caret.
//! - `paint`: glyph runs for the raster and scene paint paths.

pub(crate) mod build;
pub mod fonts;
pub(crate) mod geom;
pub(crate) mod layout;
#[cfg(feature = "paint")]
pub(crate) mod paint;
#[cfg(all(test, feature = "paint"))]
mod tests;

use std::cell::RefCell;

use obscura_dom::tree::NodeId;

/// Taffy node contexts with this bit set name an IFC in the [`IfcStore`].
pub(crate) const IFC_CONTEXT_BIT: usize = 1usize << (usize::BITS - 2);

/// The Parley brush: an index into [`Ifc::paints`].
#[derive(Clone, Copy, PartialEq, Eq, Default, Debug)]
pub(crate) struct Brush(pub(crate) u32);

/// How one stretch of text paints, and which DOM nodes own it.
#[derive(Clone, Debug)]
pub(crate) struct TextPaint {
    pub(crate) color: [u8; 4],
    pub(crate) underline: bool,
    pub(crate) overline: bool,
    pub(crate) line_through: bool,
    /// The text node the glyphs come from (`None` for generated content).
    pub(crate) text_node: Option<NodeId>,
    /// The innermost inline element span containing the text.
    pub(crate) span: Option<u32>,
    /// `background-clip: text` fill of the nearest element that has one.
    pub(crate) clip_fill: Option<u32>,
    /// The element whose `visibility`/opacity decide whether this text paints.
    pub(crate) owner: NodeId,
    /// Accumulated `position: relative` offset of the enclosing spans.
    pub(crate) offset: (f32, f32),
    /// `text-orientation` of the text (vertical roots only).
    pub(crate) orientation: crate::TextOrientation,
    /// `text-combine-upright: all`.
    pub(crate) combine: bool,
}

/// Margin, border and padding of one inline-axis side of an inline element.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub(crate) struct InlineEdge {
    pub(crate) margin: f32,
    pub(crate) border: f32,
    pub(crate) padding: f32,
}

impl InlineEdge {
    pub(crate) fn advance(self) -> f32 {
        self.margin + self.border + self.padding
    }
}

/// What generated an inline element span.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) enum SpanOwner {
    Element(NodeId),
    Pseudo(NodeId, crate::dom::GeneratedBoxKind),
}

/// A non-atomic inline element (or inline `::before`/`::after`).
#[derive(Clone, Debug)]
pub(crate) struct Span {
    pub(crate) owner: SpanOwner,
    pub(crate) parent: Option<u32>,
    pub(crate) start: InlineEdge,
    pub(crate) end: InlineEdge,
    /// Block-axis border + padding above and below the font box.
    pub(crate) block_start: f32,
    pub(crate) block_end: f32,
    /// Grid-fitted ascent and descent of the span's first available font.
    pub(crate) ascent: f32,
    pub(crate) descent: f32,
    /// Accumulated `position: relative` offset of the span and its
    /// ancestor spans (applies to its fragments and content).
    pub(crate) relative: (f32, f32),
    /// `top`, `right`, `bottom`, `left` of a `position: relative` span,
    /// resolved against the IFC's content box at layout.
    pub(crate) inset: Option<[Option<crate::Dimension>; 4]>,
    /// The span's font size, for font-relative insets.
    pub(crate) font_size: f32,
    /// Chromium "culls" an inline box that has no decoration of its own and
    /// the same font metrics as its parent: it has no fragment of its own,
    /// and its client rects are those of its content.
    pub(crate) culled: bool,
}

/// Where an atomic inline box sits relative to the line's baseline.
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum BaselineSource {
    /// `inline-block` with visible overflow: the baseline of its last line box.
    LastLine,
    /// inline-flex/grid, form controls: their first baseline.
    FirstLine,
    /// Replaced elements and boxes without a line: the bottom margin edge.
    MarginBottom,
    /// Buttons: their first line, else the bottom of their content box.
    Button,
    /// A text input or closed select without line boxes: the baseline of
    /// its label centred in the content box (grid-fitted font ascent and
    /// descent).
    Control { ascent: f32, descent: f32 },
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) enum BoxKind {
    Atomic {
        baseline: BaselineSource,
    },
    Float,
    OutOfFlow,
    /// The start or end edge of span `span`.
    Edge {
        span: u32,
        start: bool,
    },
    /// A `<br>`, placed just before its forced break.
    Break {
        node: NodeId,
    },
}

#[derive(Clone, Copy, Debug)]
pub(crate) struct IfcBox {
    pub(crate) kind: BoxKind,
    /// The Taffy node of an atomic, floated or out-of-flow box.
    pub(crate) node: Option<taffy::NodeId>,
    /// The DOM element of an atomic, floated or out-of-flow box.
    pub(crate) dom: Option<NodeId>,
    /// The inline element span the box is in.
    pub(crate) parent_span: Option<u32>,
}

/// One text node's stretch of the IFC text.
#[derive(Clone, Copy, Debug)]
pub(crate) struct TextRange {
    pub(crate) node: NodeId,
    /// Byte range in [`Ifc::text`].
    pub(crate) start: usize,
    pub(crate) end: usize,
}

/// Root-style properties the line layout needs.
#[derive(Clone, Debug)]
pub(crate) struct RootParams {
    pub(crate) align: parley::Alignment,
    pub(crate) justify: bool,
    pub(crate) text_indent: crate::Dimension,
    pub(crate) direction_rtl: bool,
    /// Lines are laid out even when there is no content (a list item with a
    /// marker, an empty text control).
    pub(crate) has_marker: bool,
    /// Vertically center the line boxes in a taller box (buttons).
    pub(crate) center_block: bool,
    /// `-webkit-line-clamp` of a legacy vertical `-webkit-box`: only this
    /// many lines count towards the height and paint, the last with a marker.
    pub(crate) line_clamp: Option<usize>,
    /// The vertical writing mode (with `vertical`).
    pub(crate) writing_mode: crate::WritingMode,
    /// `text-overflow: ellipsis` with clipped inline overflow.
    pub(crate) ellipsis: bool,
    /// `text-wrap-style: balance`.
    pub(crate) balance: bool,
    /// An orthogonal vertical writing-mode root: its lines run top to
    /// bottom, so its block size is its text's inline extent and its
    /// inline-axis width is the line box height.
    pub(crate) vertical: bool,
}

/// One inline formatting context.
pub(crate) struct Ifc {
    /// The element whose style is the root inline style: the container, or
    /// for an anonymous block the element that holds it.
    pub(crate) root: NodeId,
    /// The IFC is an anonymous block wrapper (no DOM element of its own).
    pub(crate) anonymous: bool,
    /// The IFC's Taffy node.
    pub(crate) node: Option<taffy::NodeId>,
    pub(crate) text: String,
    pub(crate) layout: parley::Layout<Brush>,
    /// The layout of the latest final (PerformLayout) pass, kept when a later
    /// measuring pass re-breaks `layout` at a different width.
    pub(crate) final_layout: Option<parley::Layout<Brush>>,
    /// `layout` holds the lines of the latest final pass.
    pub(crate) layout_is_final: bool,
    pub(crate) paints: Vec<TextPaint>,
    pub(crate) spans: Vec<Span>,
    pub(crate) boxes: Vec<IfcBox>,
    pub(crate) texts: Vec<TextRange>,
    pub(crate) params: RootParams,
    /// Content-box offset from the border box after the final layout:
    /// (left border + padding, top border + padding + align offset).
    pub(crate) content_offset: (f32, f32),
    /// Whether the IFC has any text or in-flow inline box.
    pub(crate) has_content: bool,
    /// Content-box origin in document coordinates (set after layout).
    pub(crate) origin: (f32, f32),
    /// Content-box size of the final layout in the IFC's own (logical)
    /// axes: inline extent, block extent.
    pub(crate) logical_size: (f32, f32),
    /// Clip of the root's ancestors (and its own overflow), screen space.
    pub(crate) clip: Option<crate::Rect>,
    /// The shaped "…" marker of a clamped or ellipsized IFC.
    pub(crate) marker: Option<parley::Layout<Brush>>,
}

impl Ifc {
    /// The lines of the final layout.
    pub(crate) fn final_layout(&self) -> &parley::Layout<Brush> {
        self.final_layout.as_ref().unwrap_or(&self.layout)
    }
}

/// Every IFC of one document layout, plus the fonts that shaped them.
pub(crate) struct IfcStore {
    pub(crate) ifcs: Vec<Option<Box<Ifc>>>,
    pub(crate) fonts: Option<fonts::Fonts>,
    pub(crate) layout_context: parley::LayoutContext<Brush>,
    /// The IFCs are lent to the thread's active layout.
    active: bool,
    /// Root element -> its IFCs, in document order (filled after layout).
    pub(crate) by_node: std::collections::HashMap<NodeId, Vec<usize>>,
    #[cfg(feature = "paint")]
    pub(crate) raster: paint::GlyphRaster,
}

impl Default for IfcStore {
    fn default() -> Self {
        Self {
            ifcs: Vec::new(),
            fonts: None,
            layout_context: parley::LayoutContext::new(),
            active: false,
            by_node: Default::default(),
            #[cfg(feature = "paint")]
            raster: Default::default(),
        }
    }
}

impl IfcStore {
    pub(crate) fn new(web_fonts: &[fonts::WebFont], load_emoji: bool) -> Self {
        let mut store = Self::default();
        store.fonts = Some(fonts::Fonts::take(web_fonts, load_emoji));
        store
    }

    pub(crate) fn get(&self, index: usize) -> Option<&Ifc> {
        self.ifcs.get(index).and_then(|ifc| ifc.as_deref())
    }

    pub(crate) fn get_mut(&mut self, index: usize) -> Option<&mut Ifc> {
        self.ifcs.get_mut(index).and_then(|ifc| ifc.as_deref_mut())
    }

    pub(crate) fn len(&self) -> usize {
        self.ifcs.len()
    }

    /// Lay out `text` in `style` outside the box tree (the generated text of
    /// a positioned pseudo-element its host paints), at `width` or its
    /// max-content width. Returns the IFC and its (width, height).
    pub(crate) fn standalone(
        &mut self,
        tree: &obscura_dom::tree::DomTree,
        styles: &std::collections::HashMap<NodeId, crate::LayoutStyle>,
        owner: NodeId,
        style: &crate::LayoutStyle,
        text: &str,
        width: Option<f32>,
    ) -> Option<(usize, f32, f32)> {
        let params = build::root_params(style, false, false);
        let index = self.create(
            tree,
            styles,
            owner,
            style,
            false,
            &[build::Item::GeneratedText(text.to_string())],
            params,
        )?;
        let ifc = self.get_mut(index)?;
        ifc.layout.break_all_lines(width);
        ifc.layout.align(
            ifc.params.align,
            parley::AlignmentOptions {
                align_when_overflowing: false,
                last_line_alignment: None,
            },
        );
        ifc.layout_is_final = true;
        let height = ifc
            .layout
            .lines()
            .map(|line| line.metrics().block_max_coord)
            .fold(0.0f32, f32::max);
        Some((index, ifc.layout.width(), height))
    }

    /// Make the IFCs available to Taffy's inline layout function until
    /// [`Self::deactivate`].
    pub(crate) fn activate(&mut self) {
        let ifcs = std::mem::take(&mut self.ifcs);
        ACTIVE.with(|active| active.borrow_mut().push(ifcs));
        self.active = true;
    }

    /// Take the IFCs back after layout.
    pub(crate) fn deactivate(&mut self) {
        if !std::mem::take(&mut self.active) {
            return;
        }
        if let Some(ifcs) = ACTIVE.with(|active| active.borrow_mut().pop()) {
            self.ifcs = ifcs;
        }
    }
}

impl Drop for IfcStore {
    fn drop(&mut self) {
        self.deactivate();
        if let Some(fonts) = self.fonts.take() {
            fonts.give_back();
        }
    }
}

thread_local! {
    /// The IFCs of the layouts running on this thread (innermost last).
    static ACTIVE: RefCell<Vec<Vec<Option<Box<Ifc>>>>> = const { RefCell::new(Vec::new()) };
}

/// Take IFC `index` of the active layout out of the store for the duration
/// of `f` (so that nested IFCs inside its inline boxes can be laid out
/// meanwhile), then put it back.
pub(crate) fn with_active_ifc<R>(index: usize, f: impl FnOnce(&mut Ifc) -> R) -> Option<R> {
    let mut ifc = ACTIVE.with(|active| {
        let mut active = active.borrow_mut();
        active.last_mut()?.get_mut(index)?.take()
    })?;
    let result = f(&mut ifc);
    ACTIVE.with(|active| {
        let mut active = active.borrow_mut();
        if let Some(slot) = active.last_mut().and_then(|ifcs| ifcs.get_mut(index)) {
            *slot = Some(ifc);
        }
    });
    Some(result)
}
