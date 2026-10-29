//! Geometry of inline content after layout: inline element fragments, text
//! node fragments, `<br>` boxes, caret positions and hit testing.

use std::collections::HashMap;

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

    /// The x extents of span `span`'s client rects on one line.
    fn span_line_rects(&self, pieces: &[Piece], span: u32) -> Vec<(f32, f32, f32)> {
        let culled = self.spans.get(span as usize).is_some_and(|s| s.culled);
        if !culled {
            let mut extent: Option<(f32, f32, f32)> = None;
            let mut start = None;
            let mut end = None;
            for piece in pieces {
                if self.child_toward(piece.span, span).is_none() {
                    continue;
                }
                if piece.span == Some(span) {
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
            return extent
                .map(|(a, b, base)| (start.unwrap_or(a), end.unwrap_or(b), base))
                .into_iter()
                .collect();
        }
        // A culled inline: one rect per run of its own content, plus the
        // rects of its child inlines.
        let mut out = Vec::new();
        let mut current: Option<(f32, f32, f32)> = None;
        let mut index = 0;
        let mut empty_at: Option<(f32, f32)> = None;
        while index < pieces.len() {
            let piece = &pieces[index];
            match self.child_toward(piece.span, span) {
                None => {
                    if let Some(segment) = current.take() {
                        out.push(segment);
                    }
                    index += 1;
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
                    index += 1;
                }
                Some(Some(child)) => {
                    if let Some(segment) = current.take() {
                        out.push(segment);
                    }
                    out.extend(self.span_line_rects(pieces, child));
                    while index < pieces.len()
                        && self.child_toward(pieces[index].span, child).is_some()
                    {
                        index += 1;
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
    }

    /// Every fragment of this IFC, with the content box at `origin`.
    pub(crate) fn fragments(&self, origin: (f32, f32)) -> Fragments {
        let mut out = Fragments::default();
        let layout = self.final_layout();
        let (root_ascent, root_descent) = layout
            .root_span_metrics()
            .map(|metrics| (metrics.ascent, metrics.descent))
            .unwrap_or((14.0, 4.0));
        for line in layout.lines() {
            let metrics = *line.metrics();
            let mut pieces: Vec<Piece> = Vec::new();
            for item in line.items() {
                match item {
                    PositionedLayoutItem::GlyphRun(run) => {
                        let Some(paint) = self.paints.get(run.style().brush.0 as usize) else {
                            continue;
                        };
                        let font = run.run().font_metrics();
                        pieces.push(Piece {
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
                                    span: Some(span),
                                    edge: Some(start),
                                    x0,
                                    x1,
                                    baseline,
                                    text: None,
                                });
                            }
                            BoxKind::Atomic { .. } => pieces.push(Piece {
                                span: info.parent_span,
                                edge: None,
                                x0: ibox.x,
                                x1: ibox.x + ibox.width,
                                baseline,
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
            for piece in pieces.iter_mut().rev() {
                if hanging <= 0.0 {
                    break;
                }
                if piece.edge.is_some() {
                    continue;
                }
                if piece.text.is_none() {
                    break;
                }
                let trim = hanging.min(piece.x1 - piece.x0);
                piece.x1 -= trim;
                hanging -= trim;
            }

            // Spans on this line, outermost first.
            let mut line_spans: Vec<u32> = Vec::new();
            for piece in &pieces {
                let mut current = piece.span;
                while let Some(index) = current {
                    if !line_spans.contains(&index) {
                        line_spans.push(index);
                    }
                    current = self.spans.get(index as usize).and_then(|span| span.parent);
                }
            }
            for index in line_spans {
                let Some(span) = self.spans.get(index as usize) else {
                    continue;
                };
                for (x0, x1, baseline) in self.span_line_rects(&pieces, index) {
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
            let mut texts: Vec<(NodeId, f32, f32, f32, f32, f32, std::ops::Range<usize>, (f32, f32))> =
                Vec::new();
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

    /// Whether this IFC lays out text node `node`.
    pub(crate) fn contains_text(&self, node: NodeId) -> bool {
        self.texts.iter().any(|range| range.node == node)
    }
}
