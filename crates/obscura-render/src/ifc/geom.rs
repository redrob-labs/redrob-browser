//! Geometry of inline content after layout: inline element fragments, text
//! node fragments, `<br>` boxes, caret positions and hit testing.

use obscura_dom::tree::NodeId;
use parley::PositionedLayoutItem;

use super::{BoxKind, Ifc, SpanOwner};
use crate::dom::GeneratedBoxKind;
use crate::Rect;

/// Fragments of one IFC in document coordinates.
#[derive(Default)]
pub(crate) struct Fragments {
    /// Per line border boxes of each non-atomic inline element.
    pub(crate) elements: Vec<(NodeId, Rect)>,
    /// Per line border boxes of inline `::before`/`::after` boxes.
    pub(crate) pseudos: Vec<(NodeId, GeneratedBoxKind, Rect)>,
    /// Per line font boxes of each text node, with the text on that line.
    pub(crate) texts: Vec<(NodeId, Rect, String)>,
    /// The box of each `<br>`.
    pub(crate) breaks: Vec<(NodeId, Rect)>,
}

/// One positioned piece of a line: a glyph run, an inline box or an edge.
#[derive(Clone, Debug)]
struct Piece {
    /// The innermost span the piece belongs to.
    span: Option<u32>,
    /// The piece is the start (`Some(true)`) or end edge of `span`.
    edge: Option<bool>,
    x0: f32,
    x1: f32,
    baseline: f32,
    /// Text of a glyph run: (text node, byte range, ascent, descent).
    text: Option<(NodeId, std::ops::Range<usize>, f32, f32)>,
    /// The run preserves white space (pre-wrap, break-spaces): spaces that
    /// hang at a line end still belong to its inline box, as in Chrome.
    preserves: bool,
}

impl Ifc {
    /// Whether `span` is `ancestor` or inside it; returns the child of
    /// `ancestor` on the way (or `None` when `span == ancestor`).
    fn child_toward(&self, span: Option<u32>, ancestor: u32) -> Option<Option<u32>> {
        let mut current = span;
        let mut child = None;
        while let Some(index) = current {
            if index == ancestor {
                return Some(child);
            }
            child = Some(index);
            current = self.spans.get(index as usize).and_then(|span| span.parent);
        }
        None
    }

    /// The x extents (and baseline) of the client rects of every span in
    /// `line_spans` on one line, keyed by span index.
    ///
    /// A non-culled span has one rect: the extent of its content on the line
    /// (its own start/end edges where present). A culled span has one rect
    /// per run of its own content plus the rects of its child inlines. The
    /// spans are resolved deepest first with each piece's ancestor chain
    /// precomputed, so the work is (spans x pieces) with no recursion
    /// however deeply the inlines nest.
    fn line_span_rects(
        &self,
        pieces: &[Piece],
        line_spans: &[u32],
        depths: &[usize],
    ) -> std::collections::HashMap<u32, Vec<(f32, f32, f32)>> {
        // chain[p] = piece p's span and its ancestors, innermost first.
        let chains: Vec<Vec<u32>> = pieces
            .iter()
            .map(|piece| {
                let mut chain = Vec::new();
                let mut current = piece.span;
                while let Some(index) = current {
                    chain.push(index);
                    current = self.spans.get(index as usize).and_then(|span| span.parent);
                }
                chain
            })
            .collect();
        // Some(None): the piece is the span's own content; Some(Some(c)):
        // it is inside child span c; None: outside the span.
        let toward = |p: usize, span: u32| -> Option<Option<u32>> {
            let chain = &chains[p];
            let depth = *depths.get(span as usize)?;
            let position = chain.len().checked_sub(depth + 1)?;
            (chain.get(position) == Some(&span))
                .then(|| position.checked_sub(1).map(|child| chain[child]))
        };
        let mut order: Vec<u32> = line_spans.to_vec();
        order.sort_by_key(|span| {
            std::cmp::Reverse(depths.get(*span as usize).copied().unwrap_or(0))
        });
        let mut memo: std::collections::HashMap<u32, Vec<(f32, f32, f32)>> =
            std::collections::HashMap::new();
        for span in order {
            let culled = self.spans.get(span as usize).is_some_and(|s| s.culled);
            let rects = if !culled {
                let mut extent: Option<(f32, f32, f32)> = None;
                let (mut start, mut end) = (None, None);
                for (p, piece) in pieces.iter().enumerate() {
                    let Some(child) = toward(p, span) else {
                        continue;
                    };
                    if child.is_none() {
                        match piece.edge {
                            Some(true) => start = Some(piece.x0),
                            Some(false) => end = Some(piece.x1),
                            None => {}
                        }
                    }
                    extent = Some(match extent {
                        Some((a, b, base)) => (a.min(piece.x0), b.max(piece.x1), base),
                        None => (piece.x0, piece.x1, piece.baseline),
                    });
                }
                extent
                    .map(|(a, b, base)| (start.unwrap_or(a), end.unwrap_or(b), base))
                    .into_iter()
                    .collect()
            } else {
                let mut out = Vec::new();
                let mut current: Option<(f32, f32, f32)> = None;
                let mut empty_at: Option<(f32, f32)> = None;
                let mut p = 0;
                while p < pieces.len() {
                    let piece = &pieces[p];
                    match toward(p, span) {
                        None => {
                            if let Some(segment) = current.take() {
                                out.push(segment);
                            }
                            p += 1;
                        }
                        Some(None) => {
                            if piece.edge.is_some() {
                                empty_at.get_or_insert((piece.x0.max(piece.x1), piece.baseline));
                            } else {
                                current = Some(match current {
                                    Some((a, b, base)) => (a.min(piece.x0), b.max(piece.x1), base),
                                    None => (piece.x0, piece.x1, piece.baseline),
                                });
                            }
                            p += 1;
                        }
                        Some(Some(child)) => {
                            if let Some(segment) = current.take() {
                                out.push(segment);
                            }
                            if let Some(rects) = memo.get(&child) {
                                out.extend(rects.iter().copied());
                            }
                            while p < pieces.len() && toward(p, span) == Some(Some(child)) {
                                p += 1;
                            }
                        }
                    }
                }
                if let Some(segment) = current.take() {
                    out.push(segment);
                }
                if out.is_empty() {
                    if let Some((x, baseline)) = empty_at {
                        out.push((x, x, baseline));
                    }
                }
                out
            };
            memo.insert(span, rects);
        }
        memo
    }

    /// Depth of every span below the IFC root (a top-level span is 0).
    fn span_depths(&self) -> Vec<usize> {
        let mut depths = vec![usize::MAX; self.spans.len()];
        for index in 0..self.spans.len() {
            // Walk up to the first span with a known depth.
            let mut path = Vec::new();
            let mut current = Some(index as u32);
            let mut base = None;
            while let Some(span) = current {
                let i = span as usize;
                if i >= depths.len() {
                    break;
                }
                if depths[i] != usize::MAX {
                    base = Some(depths[i]);
                    break;
                }
                path.push(i);
                current = self.spans[i].parent;
            }
            let mut depth = base.map_or(0, |d| d + 1);
            if base.is_none() {
                // `path` ends at a top-level span.
                for &i in path.iter().rev() {
                    depths[i] = depth;
                    depth += 1;
                }
            } else {
                for &i in path.iter().rev() {
                    depths[i] = depth;
                    depth += 1;
                }
            }
        }
        depths
    }

    /// Every fragment of this IFC, with the content box at `origin`.
    pub(crate) fn fragments(&self, origin: (f32, f32)) -> Fragments {
        let mut out = Fragments::default();
        let layout = self.final_layout();
        let (root_ascent, root_descent) = layout
            .root_span_metrics()
            .map(|metrics| (metrics.ascent, metrics.descent))
            .unwrap_or((14.0, 4.0));
        let mut placed: std::collections::HashSet<u32> = std::collections::HashSet::new();
        let depths = self.span_depths();
        let line_count = layout.len();
        for (line_index, line) in layout.lines().enumerate() {
            let metrics = *line.metrics();
            // After a forced break, a last line holding only collapsed
            // whitespace (`<br><span>\n</span>`) is no line box: Chrome puts
            // its inline boxes at the end of the previous line box, empty.
            let trailing_empty = line_index + 1 == line_count
                && line_index > 0
                && layout
                    .get(line_index - 1)
                    .is_some_and(|prev| prev.break_reason() == parley::BreakReason::Explicit);
            let mut pieces: Vec<Piece> = Vec::new();
            for item in line.items() {
                match item {
                    PositionedLayoutItem::GlyphRun(run) => {
                        let Some(paint) = self.paints.get(run.style().brush.0 as usize) else {
                            continue;
                        };
                        let font = run.run().font_metrics();
                        pieces.push(Piece {
                            preserves: matches!(
                                run.style().white_space_collapse(),
                                parley::WhiteSpaceCollapse::Preserve
                                    | parley::WhiteSpaceCollapse::BreakSpaces
                            ),
                            span: paint.span,
                            edge: None,
                            x0: run.offset(),
                            x1: run.offset() + run.advance(),
                            baseline: run.baseline(),
                            text: paint.text_node.map(|node| {
                                (
                                    node,
                                    run.run().text_range(),
                                    font.ascent.round(),
                                    font.descent.round(),
                                )
                            }),
                        });
                    }
                    PositionedLayoutItem::InlineBox(ibox) => {
                        let Some(info) = self.boxes.get(ibox.id as usize) else {
                            continue;
                        };
                        let baseline = ibox.y + ibox.height;
                        match info.kind {
                            BoxKind::Edge { span, start } => {
                                let margin = self
                                    .spans
                                    .get(span as usize)
                                    .map(|s| if start { s.start.margin } else { s.end.margin })
                                    .unwrap_or(0.0);
                                let (x0, x1) = if start {
                                    (ibox.x + margin, ibox.x + ibox.width)
                                } else {
                                    (ibox.x, ibox.x + ibox.width - margin)
                                };
                                pieces.push(Piece {
                                    preserves: false,
                                    span: Some(span),
                                    edge: Some(start),
                                    x0,
                                    x1,
                                    baseline,
                                    text: None,
                                });
                            }
                            BoxKind::Atomic { .. } => pieces.push(Piece {
                                preserves: false,
                                span: info.parent_span,
                                edge: None,
                                x0: ibox.x,
                                x1: ibox.x + ibox.width,
                                // The enclosing span's fragment stands on the
                                // line's baseline, wherever vertical-align
                                // puts the box (Chrome: an <a> around a
                                // middle-aligned image has a text-height
                                // fragment at the line's baseline).
                                baseline: metrics.baseline,
                                text: None,
                            }),
                            BoxKind::Break { node } => {
                                let (ascent, descent) = info
                                    .parent_span
                                    .and_then(|span| self.spans.get(span as usize))
                                    .map(|span| (span.ascent, span.descent))
                                    .unwrap_or((root_ascent, root_descent));
                                let offset = info
                                    .parent_span
                                    .and_then(|span| self.spans.get(span as usize))
                                    .map(|span| span.relative)
                                    .unwrap_or((0.0, 0.0));
                                out.breaks.push((
                                    node,
                                    Rect {
                                        x: origin.0 + ibox.x + offset.0,
                                        y: origin.1 + baseline - ascent + offset.1,
                                        width: 0.0,
                                        height: ascent + descent,
                                    },
                                ));
                            }
                            _ => {}
                        }
                    }
                }
            }
            // Whitespace that hangs at the end of the line belongs to no
            // fragment.
            let mut hanging = metrics.hanging_advance;
            let mut trims = vec![0.0f32; pieces.len()];
            for (index, piece) in pieces.iter_mut().enumerate().rev() {
                if hanging <= 0.0 {
                    break;
                }
                if piece.edge.is_some() {
                    continue;
                }
                if piece.text.is_none() || piece.preserves {
                    break;
                }
                let trim = hanging.min(piece.x1 - piece.x0);
                piece.x1 -= trim;
                trims[index] = trim;
                hanging -= trim;
            }
            // Chromium removes that whitespace instead of hanging it, so the
            // inline edges after it close up against the content (an empty
            // span after "x " at the end of a right-aligned line sits at the
            // x's end; a span around "x " is as wide as the x).
            if layout.is_rtl() == false {
                let mut shift = 0.0f32;
                for (index, piece) in pieces.iter_mut().enumerate() {
                    if trims[index] == 0.0 {
                        piece.x0 -= shift;
                        piece.x1 -= shift;
                    }
                    shift += trims[index];
                }
            }

            // Spans on this line, each with its ancestors, in first-seen order.
            let mut line_spans: Vec<u32> = Vec::new();
            let mut seen: std::collections::HashSet<u32> = std::collections::HashSet::new();
            for piece in &pieces {
                let mut current = piece.span;
                while let Some(index) = current {
                    if !seen.insert(index) {
                        // Its ancestors are already on the list.
                        break;
                    }
                    line_spans.push(index);
                    current = self.spans.get(index as usize).and_then(|span| span.parent);
                }
            }
            let trailing_empty = trailing_empty
                && line.text_range().start >= line.text_range().end
                && pieces
                    .iter()
                    .all(|piece| piece.edge.is_some() && piece.x1 - piece.x0 <= 0.0);
            let mut line_rects = self.line_span_rects(&pieces, &line_spans, &depths);
            for index in line_spans {
                let Some(span) = self.spans.get(index as usize) else {
                    continue;
                };
                placed.insert(index);
                for (x0, x1, baseline) in line_rects.remove(&index).unwrap_or_default() {
                    if trailing_empty {
                        let rect = Rect {
                            x: origin.0 + x0 + span.relative.0,
                            y: origin.1 + metrics.block_min_coord + span.relative.1,
                            width: 0.0,
                            height: 0.0,
                        };
                        match span.owner {
                            SpanOwner::Element(node) => out.elements.push((node, rect)),
                            SpanOwner::Pseudo(host, kind) => out.pseudos.push((host, kind, rect)),
                        }
                        continue;
                    }
                    let rect = Rect {
                        x: origin.0 + x0 + span.relative.0,
                        y: origin.1 + baseline - span.ascent - span.block_start + span.relative.1,
                        width: (x1 - x0).max(0.0),
                        height: span.ascent + span.descent + span.block_start + span.block_end,
                    };
                    match span.owner {
                        SpanOwner::Element(node) => out.elements.push((node, rect)),
                        SpanOwner::Pseudo(host, kind) => out.pseudos.push((host, kind, rect)),
                    }
                }
            }

            // Text nodes: one font box per line.
            let mut texts: Vec<(
                NodeId,
                f32,
                f32,
                f32,
                f32,
                f32,
                std::ops::Range<usize>,
                (f32, f32),
            )> = Vec::new();
            for piece in &pieces {
                let Some((node, range, ascent, descent)) = piece.text.clone() else {
                    continue;
                };
                let offset = piece
                    .span
                    .and_then(|span| self.spans.get(span as usize))
                    .map(|span| span.relative)
                    .unwrap_or((0.0, 0.0));
                match texts.iter_mut().find(|entry| entry.0 == node) {
                    Some(entry) => {
                        entry.1 = entry.1.min(piece.x0);
                        entry.2 = entry.2.max(piece.x1);
                        entry.6.start = entry.6.start.min(range.start);
                        entry.6.end = entry.6.end.max(range.end);
                    }
                    None => texts.push((
                        node,
                        piece.x0,
                        piece.x1,
                        piece.baseline,
                        ascent,
                        descent,
                        range,
                        offset,
                    )),
                }
            }
            for (node, x0, x1, baseline, ascent, descent, range, offset) in texts {
                let text = self.text.get(range).unwrap_or_default().to_string();
                out.texts.push((
                    node,
                    Rect {
                        x: origin.0 + x0 + offset.0,
                        y: origin.1 + baseline - ascent + offset.1,
                        width: (x1 - x0).max(0.0),
                        height: ascent + descent,
                    },
                    text,
                ));
            }
        }
        // A span with no content on any line (an empty inline, or one in an
        // IFC that formed no line box) still has a zero-width box at the
        // start of the first line, on the strut's baseline.
        let baseline = layout
            .lines()
            .next()
            .map(|line| line.metrics().baseline)
            .unwrap_or(root_ascent);
        for (index, span) in self.spans.iter().enumerate() {
            if placed.contains(&(index as u32)) {
                continue;
            }
            let rect = Rect {
                x: origin.0 + span.start.margin + span.relative.0,
                y: origin.1 + baseline - span.ascent - span.block_start + span.relative.1,
                width: (span.start.border
                    + span.start.padding
                    + span.end.border
                    + span.end.padding)
                    .max(0.0),
                height: span.ascent + span.descent + span.block_start + span.block_end,
            };
            match span.owner {
                SpanOwner::Element(node) => out.elements.push((node, rect)),
                SpanOwner::Pseudo(host, kind) => out.pseudos.push((host, kind, rect)),
            }
        }
        out
    }

    /// The DOM position (text node and UTF-16 offset) nearest to `point`,
    /// relative to the IFC's content box, with the squared distance.
    pub(crate) fn caret_from_point(&self, x: f32, y: f32) -> Option<(NodeId, usize, f32)> {
        let layout = self.final_layout();
        let mut best: Option<(NodeId, usize, f32)> = None;
        for line in layout.lines() {
            let metrics = *line.metrics();
            let dy = if y < metrics.block_min_coord {
                metrics.block_min_coord - y
            } else if y > metrics.block_max_coord {
                y - metrics.block_max_coord
            } else {
                0.0
            };
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                let Some(node) = self
                    .paints
                    .get(run.style().brush.0 as usize)
                    .and_then(|paint| paint.text_node)
                else {
                    continue;
                };
                let mut cursor = run.offset();
                for cluster in run.run().visual_clusters() {
                    let advance = cluster.advance();
                    let range = cluster.text_range();
                    for (byte, edge) in [(range.start, cursor), (range.end, cursor + advance)] {
                        let dx = (edge - x).abs();
                        let distance = dx * dx + dy * dy * 4.0;
                        if best.is_none_or(|(_, _, d)| distance < d) {
                            if let Some(offset) = self.dom_offset(node, byte) {
                                best = Some((node, offset, distance));
                            }
                        }
                    }
                    cursor += advance;
                }
            }
        }
        best
    }

    /// The caret rectangle (relative to the content box) for UTF-16 offset
    /// `offset` in text node `node`.
    pub(crate) fn caret_rect(&self, node: NodeId, offset: usize) -> Option<Rect> {
        let byte = self.layout_byte(node, offset)?;
        let layout = self.final_layout();
        for line in layout.lines() {
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                let paint = self.paints.get(run.style().brush.0 as usize)?;
                if paint.text_node != Some(node) {
                    continue;
                }
                let range = run.run().text_range();
                if byte < range.start || byte > range.end {
                    continue;
                }
                let mut cursor = run.offset();
                for cluster in run.run().visual_clusters() {
                    let cluster_range = cluster.text_range();
                    if byte <= cluster_range.start {
                        break;
                    }
                    cursor += cluster.advance();
                }
                let font = run.run().font_metrics();
                let ascent = font.ascent.round();
                let descent = font.descent.round();
                return Some(Rect {
                    x: cursor,
                    y: run.baseline() - ascent,
                    width: 1.0,
                    height: ascent + descent,
                });
            }
        }
        None
    }

    /// The UTF-16 offset in text node `node` of layout text byte `byte`.
    fn dom_offset(&self, node: NodeId, byte: usize) -> Option<usize> {
        let range = self.texts.iter().find(|range| range.node == node)?;
        let byte = byte.clamp(range.start, range.end);
        let laid = self.text.get(range.start..byte)?;
        Some(laid.chars().map(char::len_utf16).sum())
    }

    /// The layout text byte of UTF-16 offset `offset` in text node `node`.
    fn layout_byte(&self, node: NodeId, offset: usize) -> Option<usize> {
        let range = self.texts.iter().find(|range| range.node == node)?;
        let text = self.text.get(range.start..range.end)?;
        let mut units = 0;
        for (byte, ch) in text.char_indices() {
            if units >= offset {
                return Some(range.start + byte);
            }
            units += ch.len_utf16();
        }
        Some(range.end)
    }

    /// Client rects (content-box relative) of the UTF-16 range
    /// `start..end` of text node `node`: one per line it occupies.
    pub(crate) fn text_range_rects(&self, node: NodeId, start: usize, end: usize) -> Vec<Rect> {
        let (Some(b0), Some(b1)) = (self.layout_byte(node, start), self.layout_byte(node, end))
        else {
            return Vec::new();
        };
        let mut out = Vec::new();
        for line in self.final_layout().lines() {
            let mut extent: Option<(f32, f32, f32, f32, f32, (f32, f32))> = None;
            for item in line.items() {
                let PositionedLayoutItem::GlyphRun(run) = item else {
                    continue;
                };
                let Some(paint) = self.paints.get(run.style().brush.0 as usize) else {
                    continue;
                };
                if paint.text_node != Some(node) {
                    continue;
                }
                let font = run.run().font_metrics();
                let mut cursor = run.offset();
                for cluster in run.run().visual_clusters() {
                    let range = cluster.text_range();
                    let advance = cluster.advance();
                    if range.start < b1 && range.end > b0 {
                        let (x0, x1) = (cursor, cursor + advance);
                        extent = Some(match extent {
                            Some((a, b, base, asc, desc, offset)) => {
                                (a.min(x0), b.max(x1), base, asc, desc, offset)
                            }
                            None => (
                                x0,
                                x1,
                                run.baseline(),
                                font.ascent.round(),
                                font.descent.round(),
                                paint.offset,
                            ),
                        });
                    }
                    cursor += advance;
                }
            }
            if let Some((x0, x1, baseline, ascent, descent, offset)) = extent {
                out.push(Rect {
                    x: x0 + offset.0,
                    y: baseline - ascent + offset.1,
                    width: x1 - x0,
                    height: ascent + descent,
                });
            }
        }
        out
    }

    /// Whether this IFC lays out text node `node`.
    pub(crate) fn contains_text(&self, node: NodeId) -> bool {
        self.texts.iter().any(|range| range.node == node)
    }
}
