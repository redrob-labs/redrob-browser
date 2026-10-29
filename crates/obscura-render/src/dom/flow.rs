//! Box construction for flow content: inline formatting contexts and the
//! anonymous block boxes that wrap inline content among block-level boxes.
//!
//! Portions derived from Blitz (https://github.com/DioxusLabs/blitz), MIT OR Apache-2.0
//! (`blitz-dom/src/layout/construct.rs`).

use std::collections::HashMap;

use obscura_dom::tree::{DomTree, NodeId};
use taffy::TaffyTree;

use super::{
    build, rendered_children, GeneratedBoxBuild, GeneratedBoxKind, IfcRegistry, SetStyleIfChanged,
};
use crate::ifc::build::Item;
use crate::ifc::{BaselineSource, SpanOwner, IFC_CONTEXT_BIT};

/// One child of a flow container, in box-construction order.
#[derive(Clone, Copy, Debug)]
pub(super) enum Piece {
    Dom(NodeId),
    Pseudo(NodeId, GeneratedBoxKind),
    /// The start of a decorated inline that contains a block, spliced into
    /// its container's flow (block-in-inline): (element, its inline-start
    /// edge is in this run, its inline-end edge is in this run).
    Open(NodeId, bool, bool),
    /// The end of the innermost `Open` in the same run: (element, whether
    /// the element really ends here rather than at a block that splits it).
    Close(NodeId, bool),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Level {
    /// Generates no box.
    Skip,
    /// Collapsible whitespace text.
    Space,
    /// Inline-level content (text, inline elements, atomic inlines, `<br>`).
    Inline,
    Float,
    OutOfFlow,
    /// A block-level box.
    Block,
}

pub(super) fn pseudo_style(
    styles: &HashMap<NodeId, crate::LayoutStyle>,
    host: NodeId,
    kind: GeneratedBoxKind,
) -> Option<&crate::LayoutStyle> {
    let host = styles.get(&host)?;
    match kind {
        GeneratedBoxKind::Before => host.before_pseudo.as_deref(),
        GeneratedBoxKind::After => host.after_pseudo.as_deref(),
    }
}

fn is_text(tree: &DomTree, id: NodeId) -> bool {
    tree.borrow_node(id)
        .is_some_and(|node| matches!(node.data, obscura_dom::tree::NodeData::Text { .. }))
}

pub(super) fn local_name(tree: &DomTree, id: NodeId) -> Option<String> {
    tree.with_node(id, |node| {
        node.as_element()
            .map(|element| element.local.as_ref().to_string())
    })
    .flatten()
}

/// Whether a text node's whitespace collapses away entirely.
fn is_collapsible_whitespace(
    tree: &DomTree,
    id: NodeId,
    parent_style: Option<&crate::LayoutStyle>,
) -> bool {
    let preserves = parent_style.is_some_and(|style| {
        matches!(
            style.white_space,
            Some(
                crate::WhiteSpace::Pre
                    | crate::WhiteSpace::PreWrap
                    | crate::WhiteSpace::BreakSpaces
                    | crate::WhiteSpace::PreLine
            )
        )
    });
    !preserves && crate::ifc::build::is_css_whitespace(&tree.text_content(id))
}

/// Whether an element is an atomic inline-level box: replaced elements,
/// form controls, inline-block/flex/grid.
fn is_atomic(tree: &DomTree, id: NodeId, style: &crate::LayoutStyle) -> bool {
    style.is_inline_block
        || style.is_replaced_box
        || local_name(tree, id).is_some_and(|name| crate::inline::is_replaced(&name))
}

/// Whether a non-atomic inline element contains an in-flow block-level box,
/// in which case it is laid out as a block box (an approximation of the CSS
/// block-in-inline split).
fn inline_contains_block(
    tree: &DomTree,
    id: NodeId,
    styles: &HashMap<NodeId, crate::LayoutStyle>,
) -> bool {
    // An explicit stack: page-controlled nesting must not grow the native
    // stack.
    let mut stack = vec![id];
    while let Some(node) = stack.pop() {
        for child in rendered_children(tree, node) {
            let Some(style) = styles.get(&child) else {
                continue;
            };
            if style.display == crate::Display::None
                || style.float.is_some()
                || matches!(style.position, Some(taffy::Position::Absolute))
            {
                continue;
            }
            if style.display_contents
                || (style.display == crate::Display::Inline && !is_atomic(tree, child, style))
            {
                stack.push(child);
                continue;
            }
            if !crate::is_inline_level_box(style) {
                return true;
            }
        }
    }
    false
}

/// A non-atomic inline that contains a block-level box and draws nothing of
/// its own (no box edges, background, offset or generated content). CSS
/// splits it around the block; since none of its fragments paints or takes
/// space, its children can join the parent's flow directly (its rect is the
/// union of theirs). Splicing such wrappers keeps box construction flat
/// however deeply a page nests them.
fn is_transparent_block_wrapper(
    tree: &DomTree,
    id: NodeId,
    style: &crate::LayoutStyle,
    styles: &HashMap<NodeId, crate::LayoutStyle>,
) -> bool {
    let zero = |edges: &crate::Edges| {
        edges.top == 0.0 && edges.right == 0.0 && edges.bottom == 0.0 && edges.left == 0.0
    };
    style.display == crate::Display::Inline
        && !style.display_contents
        && !is_atomic(tree, id, style)
        && style.float.is_none()
        && style.position.is_none()
        && zero(&style.margin)
        && zero(&style.padding)
        && zero(&style.border)
        && style.background_color.is_none_or(|color| color[3] == 0)
        && style.background_gradient.is_none()
        && style.background_gradient_layers.is_empty()
        && style.background_image.is_none()
        && style.before_pseudo.is_none()
        && style.after_pseudo.is_none()
        && style.opacity.is_none_or(|opacity| opacity >= 1.0)
        && local_name(tree, id).is_some_and(|name| name != "br")
        && inline_contains_block(tree, id, styles)
}

/// A non-atomic inline with decoration (padding, border, background...)
/// that contains a block: split around the block like a transparent one.
fn is_decorated_block_wrapper(
    tree: &DomTree,
    id: NodeId,
    style: &crate::LayoutStyle,
    styles: &HashMap<NodeId, crate::LayoutStyle>,
) -> bool {
    style.display == crate::Display::Inline
        && !style.display_contents
        && !is_atomic(tree, id, style)
        && style.float.is_none()
        && style.position.is_none()
        && local_name(tree, id).is_some_and(|name| name != "br")
        && inline_contains_block(tree, id, styles)
}

fn level(
    tree: &DomTree,
    piece: Piece,
    parent_style: Option<&crate::LayoutStyle>,
    styles: &HashMap<NodeId, crate::LayoutStyle>,
) -> Level {
    match piece {
        Piece::Open(..) | Piece::Close(..) => Level::Inline,
        Piece::Pseudo(host, kind) => {
            let Some(style) = pseudo_style(styles, host, kind) else {
                return Level::Skip;
            };
            if style.display == crate::Display::None {
                return Level::Skip;
            }
            if matches!(style.position, Some(taffy::Position::Absolute)) {
                // Positioned pseudo boxes are painted from their host.
                return Level::Skip;
            }
            if style.float.is_some() {
                return Level::Float;
            }
            if crate::is_inline_level_box(style) {
                if style.before_content.as_deref().is_none_or(str::is_empty)
                    && !super::pseudo_requires_generated_box(style, style.before_content.as_deref())
                {
                    return Level::Skip;
                }
                Level::Inline
            } else {
                Level::Block
            }
        }
        Piece::Dom(id) => {
            let Some(node) = tree.borrow_node(id) else {
                return Level::Skip;
            };
            if matches!(node.data, obscura_dom::tree::NodeData::Text { .. }) {
                drop(node);
                return if is_collapsible_whitespace(tree, id, parent_style) {
                    Level::Space
                } else {
                    Level::Inline
                };
            }
            if !node.is_element() {
                return Level::Skip;
            }
            drop(node);
            let Some(style) = styles.get(&id) else {
                return Level::Skip;
            };
            if style.display == crate::Display::None {
                return Level::Skip;
            }
            if matches!(style.position, Some(taffy::Position::Absolute)) {
                return Level::OutOfFlow;
            }
            if style.float.is_some() {
                return Level::Float;
            }
            if local_name(tree, id).as_deref() == Some("br") {
                return Level::Inline;
            }
            if crate::is_inline_level_box(style) {
                if style.display == crate::Display::Inline
                    && !is_atomic(tree, id, style)
                    && inline_contains_block(tree, id, styles)
                {
                    return Level::Block;
                }
                return Level::Inline;
            }
            Level::Block
        }
    }
}

/// The pieces of a flow container: its `::before`, its children (with
/// `display: contents` spliced in) and its `::after`.
pub(super) fn flow_pieces(
    tree: &DomTree,
    host: NodeId,
    children: &[NodeId],
    styles: &HashMap<NodeId, crate::LayoutStyle>,
    with_pseudos: bool,
) -> Vec<Piece> {
    let mut out = Vec::new();
    if with_pseudos && pseudo_style(styles, host, GeneratedBoxKind::Before).is_some() {
        out.push(Piece::Pseudo(host, GeneratedBoxKind::Before));
    }
    splice_pieces(tree, children, styles, None, &mut out);
    if with_pseudos && pseudo_style(styles, host, GeneratedBoxKind::After).is_some() {
        out.push(Piece::Pseudo(host, GeneratedBoxKind::After));
    }
    out
}

/// Expand `display: contents` children (and, with `wrappers`, transparent
/// block-in-inline wrappers, recorded there) into `out`, in tree order,
/// with an explicit stack.
fn splice_pieces(
    tree: &DomTree,
    children: &[NodeId],
    styles: &HashMap<NodeId, crate::LayoutStyle>,
    mut wrappers: Option<&mut Vec<NodeId>>,
    out: &mut Vec<Piece>,
) {
    enum Work {
        Node(NodeId),
        Emit(Piece),
    }
    let mut stack: Vec<Work> = children
        .iter()
        .rev()
        .map(|&child| Work::Node(child))
        .collect();
    while let Some(work) = stack.pop() {
        let child = match work {
            Work::Emit(piece) => {
                out.push(piece);
                continue;
            }
            Work::Node(child) => child,
        };
        match styles.get(&child) {
            Some(style) if style.display_contents && style.display != crate::Display::None => {
                if style.after_pseudo.is_some() {
                    stack.push(Work::Emit(Piece::Pseudo(child, GeneratedBoxKind::After)));
                }
                for grandchild in rendered_children(tree, child).into_iter().rev() {
                    stack.push(Work::Node(grandchild));
                }
                if style.before_pseudo.is_some() {
                    stack.push(Work::Emit(Piece::Pseudo(child, GeneratedBoxKind::Before)));
                }
            }
            Some(style)
                if wrappers.is_some()
                    && is_transparent_block_wrapper(tree, child, style, styles) =>
            {
                if let Some(list) = wrappers.as_deref_mut() {
                    list.push(child);
                }
                for grandchild in rendered_children(tree, child).into_iter().rev() {
                    stack.push(Work::Node(grandchild));
                }
            }
            // A decorated inline around a block is split around it as
            // well (CSS 2 9.2.1.1): its inline content keeps the span (and
            // its edges on the first and last fragment), the block becomes
            // a sibling block of the container's flow.
            Some(style)
                if wrappers.is_some() && is_decorated_block_wrapper(tree, child, style, styles) =>
            {
                if let Some(list) = wrappers.as_deref_mut() {
                    list.push(child);
                }
                stack.push(Work::Emit(Piece::Close(child, true)));
                if style.after_pseudo.is_some() {
                    stack.push(Work::Emit(Piece::Pseudo(child, GeneratedBoxKind::After)));
                }
                for grandchild in rendered_children(tree, child).into_iter().rev() {
                    stack.push(Work::Node(grandchild));
                }
                if style.before_pseudo.is_some() {
                    stack.push(Work::Emit(Piece::Pseudo(child, GeneratedBoxKind::Before)));
                }
                stack.push(Work::Emit(Piece::Open(child, true, true)));
            }
            _ => out.push(Piece::Dom(child)),
        }
    }
}

/// Everything `build` threads through box construction.
pub(super) struct BuildCx<'a> {
    pub(super) tree: &'a DomTree,
    pub(super) taffy_tree: &'a mut TaffyTree<usize>,
    pub(super) id_map: &'a mut HashMap<taffy::NodeId, NodeId>,
    pub(super) engine: &'a mut crate::inline::TextEngine,
    pub(super) ifc_items: &'a mut IfcRegistry,
    pub(super) styles: &'a HashMap<NodeId, crate::LayoutStyle>,
}

impl BuildCx<'_> {
    fn build_element(&mut self, id: NodeId) -> Option<taffy::NodeId> {
        build(
            self.tree,
            id,
            self.taffy_tree,
            self.id_map,
            self.engine,
            self.ifc_items,
            self.styles,
        )
    }

    /// A box for a `::before`/`::after` that generates its own box (block,
    /// inline-block, float). Its text forms an inline formatting context.
    pub(super) fn build_generated_box(
        &mut self,
        host: NodeId,
        kind: GeneratedBoxKind,
    ) -> Option<taffy::NodeId> {
        let pseudo = pseudo_style(self.styles, host, kind)?.clone();
        let mut taffy_style = crate::to_taffy_style(&pseudo);
        taffy_style.display = match pseudo.display {
            crate::Display::Flex => taffy::Display::Flex,
            crate::Display::Grid => taffy::Display::Grid,
            _ => taffy::Display::Block,
        };
        // Clearfix pseudos use display:table only to generate an empty block
        // formatting box; Taffy's same-BFC block clear path handles them.
        if pseudo.is_table_box {
            taffy_style.item_is_table = false;
        }
        let content = pseudo
            .before_content
            .as_deref()
            .filter(|text| !text.is_empty() && !(pseudo.is_table_box && text.trim().is_empty()))
            .map(str::to_string);
        // A table shrinks to fit its content: an empty generated table is
        // 0px wide (Chrome), not as wide as a block.
        if pseudo.is_table_box && content.is_none() && pseudo.width == crate::Dimension::Auto {
            taffy_style.size.width = taffy::Dimension::length(0.0);
        }
        let node = self.taffy_tree.new_leaf(taffy_style).ok()?;
        if let Some(text) = content {
            let params = crate::ifc::build::root_params(&pseudo, false, false);
            if let Some(index) = self.ifc_items.ifc.create(
                self.tree,
                self.styles,
                host,
                &pseudo,
                false,
                &[Item::GeneratedText(text)],
                params,
            ) {
                self.attach_ifc(node, index);
            }
        }
        self.ifc_items
            .generated
            .push(GeneratedBoxBuild { host, kind, node });
        Some(node)
    }

    /// Make `node` the inline root of IFC `index`.
    fn attach_ifc(&mut self, node: taffy::NodeId, index: usize) {
        let _ = self
            .taffy_tree
            .set_node_context(node, Some(index | IFC_CONTEXT_BIT));
        let _ = self.taffy_tree.set_inline_root(node, true);
        if let Some(ifc) = self.ifc_items.ifc.get_mut(index) {
            ifc.node = Some(node);
        }
        self.ifc_items.ifc_nodes.push(index);
    }

    fn baseline_source(&self, id: NodeId, style: &crate::LayoutStyle) -> BaselineSource {
        let name = local_name(self.tree, id).unwrap_or_default();
        if style.has_replaced_sizing
            || matches!(
                name.as_str(),
                "img" | "svg" | "canvas" | "video" | "iframe" | "embed" | "object" | "audio"
            )
        {
            return BaselineSource::MarginBottom;
        }
        if name == "button" {
            return BaselineSource::Button;
        }
        // A textarea is a scroll container: its inline-block baseline is the
        // bottom margin edge.
        if name == "textarea" {
            return BaselineSource::MarginBottom;
        }
        if matches!(name.as_str(), "input" | "select") && style.display != crate::Display::Flex {
            let (ascent, descent) = crate::inline::fitted_font_ascent_descent(style);
            return BaselineSource::Control { ascent, descent };
        }
        if matches!(name.as_str(), "input" | "select")
            || matches!(style.display, crate::Display::Flex | crate::Display::Grid)
        {
            return BaselineSource::FirstLine;
        }
        if style.overflow_hidden {
            return BaselineSource::MarginBottom;
        }
        BaselineSource::LastLine
    }

    /// Collect the IFC items of `pieces`, building their atomic, floated and
    /// out-of-flow boxes.
    fn collect(
        &mut self,
        pieces: &[Piece],
        parent_style: Option<&crate::LayoutStyle>,
        items: &mut Vec<Item>,
    ) {
        // An explicit work stack: nested inline elements must not grow the
        // native stack however deeply a page nests them.
        enum Work {
            Piece(Piece, usize),
            SpanEnd,
        }
        let mut parents: Vec<Option<crate::LayoutStyle>> = vec![parent_style.cloned()];
        let mut stack: Vec<Work> = pieces
            .iter()
            .rev()
            .map(|&piece| Work::Piece(piece, 0))
            .collect();
        while let Some(work) = stack.pop() {
            let (piece, parent) = match work {
                Work::SpanEnd => {
                    items.push(Item::SpanEnd);
                    continue;
                }
                Work::Piece(piece, parent) => (piece, parent),
            };
            let level = level(self.tree, piece, parents[parent].as_ref(), self.styles);
            match (piece, level) {
                (Piece::Open(owner, start, end), _) => {
                    items.push(Item::SplitSpanStart(owner, start, end));
                }
                (Piece::Close(..), _) => items.push(Item::SpanEnd),
                (_, Level::Skip) => {}
                (Piece::Dom(id), Level::Space) => items.push(Item::Text(id)),
                (Piece::Dom(id), Level::Inline) if is_text(self.tree, id) => {
                    items.push(Item::Text(id))
                }
                (Piece::Dom(id), Level::Inline) => {
                    let style = self.styles.get(&id).cloned().unwrap_or_default();
                    let name = local_name(self.tree, id);
                    if name.as_deref() == Some("br") {
                        // The element still needs a rect.
                        items.push(Item::Break(id));
                    } else if name.as_deref() == Some("wbr") {
                        // A line break opportunity with no box of its own.
                        items.push(Item::GeneratedText("\u{200B}".to_string()));
                    } else if is_atomic(self.tree, id, &style) {
                        if let Some(node) = self.build_element(id) {
                            items.push(Item::Atomic {
                                dom: Some(id),
                                node,
                                baseline: self.baseline_source(id, &style),
                            });
                        }
                    } else {
                        items.push(Item::SpanStart(SpanOwner::Element(id)));
                        let children = rendered_children(self.tree, id);
                        let pieces = flow_pieces(self.tree, id, &children, self.styles, true);
                        parents.push(Some(style));
                        let index = parents.len() - 1;
                        stack.push(Work::SpanEnd);
                        for &piece in pieces.iter().rev() {
                            stack.push(Work::Piece(piece, index));
                        }
                    }
                }
                (Piece::Dom(id), Level::Float) => {
                    if let Some(node) = self.build_element(id) {
                        items.push(Item::Float {
                            dom: Some(id),
                            node,
                        });
                    }
                }
                (Piece::Dom(id), Level::OutOfFlow) => {
                    if let Some(node) = self.build_element(id) {
                        items.push(Item::OutOfFlow {
                            dom: Some(id),
                            node,
                        });
                    }
                }
                (Piece::Dom(id), Level::Block) => {
                    // A block box inside inline content (only reached for
                    // content that `level` classified inline at the top):
                    // lay it out as an atomic box.
                    if let Some(node) = self.build_element(id) {
                        items.push(Item::Atomic {
                            dom: Some(id),
                            node,
                            baseline: BaselineSource::LastLine,
                        });
                    }
                }
                (Piece::Pseudo(host, kind), Level::Inline) => {
                    let Some(style) = pseudo_style(self.styles, host, kind).cloned() else {
                        continue;
                    };
                    if style.is_inline_block {
                        if let Some(node) = self.build_generated_box(host, kind) {
                            items.push(Item::Atomic {
                                dom: None,
                                node,
                                baseline: BaselineSource::LastLine,
                            });
                        }
                    } else {
                        items.push(Item::SpanStart(SpanOwner::Pseudo(host, kind)));
                        if let Some(text) =
                            style.before_content.as_deref().filter(|t| !t.is_empty())
                        {
                            items.push(Item::GeneratedText(text.to_string()));
                        }
                        items.push(Item::SpanEnd);
                    }
                }
                (Piece::Pseudo(host, kind), Level::Float) => {
                    if let Some(node) = self.build_generated_box(host, kind) {
                        items.push(Item::Float { dom: None, node });
                    }
                }
                (Piece::Pseudo(host, kind), Level::Block) => {
                    if let Some(node) = self.build_generated_box(host, kind) {
                        items.push(Item::Atomic {
                            dom: None,
                            node,
                            baseline: BaselineSource::LastLine,
                        });
                    }
                }
                (Piece::Pseudo(..), _) => {}
            }
        }
    }

    /// Create the IFC of `items` rooted at `root` (with `root_style`).
    fn create_ifc(
        &mut self,
        root: NodeId,
        root_style: &crate::LayoutStyle,
        anonymous: bool,
        items: &[Item],
    ) -> Option<usize> {
        let is_li = local_name(self.tree, root).as_deref() == Some("li");
        let has_marker = !anonymous
            && is_li
            && !matches!(root_style.list_style, Some(crate::ListStyle::None) | None);
        let is_button = !anonymous && local_name(self.tree, root).as_deref() == Some("button");
        let params = crate::ifc::build::root_params(root_style, has_marker, is_button);
        self.ifc_items.ifc.create(
            self.tree,
            self.styles,
            root,
            root_style,
            anonymous,
            items,
            params,
        )
    }
}

/// The Taffy children of a flow container.
pub(super) struct FlowChildren {
    /// The container itself is the root of this IFC.
    pub(super) own_ifc: Option<usize>,
    pub(super) children: Vec<taffy::NodeId>,
}

/// Build the children of a block container: one IFC for the container itself
/// when all its in-flow content is inline-level (and `can_be_inline_root`),
/// else block-level boxes with anonymous IFC blocks around runs of inline
/// content.
pub(super) fn build_flow_children(
    cx: &mut BuildCx<'_>,
    id: NodeId,
    style: &crate::LayoutStyle,
    dom_children: &[NodeId],
    can_be_inline_root: bool,
) -> FlowChildren {
    let mut pieces = Vec::new();
    if pseudo_style(cx.styles, id, GeneratedBoxKind::Before).is_some() {
        pieces.push(Piece::Pseudo(id, GeneratedBoxKind::Before));
    }
    splice_pieces(
        cx.tree,
        dom_children,
        cx.styles,
        Some(&mut cx.ifc_items.transparent_wrappers),
        &mut pieces,
    );
    if pseudo_style(cx.styles, id, GeneratedBoxKind::After).is_some() {
        pieces.push(Piece::Pseudo(id, GeneratedBoxKind::After));
    }
    // Segment into maximal runs of non-block pieces.
    enum Segment {
        Run(Vec<Piece>),
        Block(Piece),
    }
    let mut segments: Vec<Segment> = Vec::new();
    // Split decorated inlines open at a block: close them at the end of the
    // run before it and reopen them (without their start edge) after it.
    let mut open: Vec<NodeId> = Vec::new();
    for piece in pieces {
        match piece {
            Piece::Open(owner, ..) => open.push(owner),
            Piece::Close(..) => {
                open.pop();
            }
            _ => {}
        }
        match level(cx.tree, piece, Some(style), cx.styles) {
            Level::Skip => {}
            Level::Block => {
                if !open.is_empty() {
                    if let Some(Segment::Run(run)) = segments.last_mut() {
                        for &owner in open.iter().rev() {
                            run.push(Piece::Close(owner, false));
                        }
                    }
                }
                segments.push(Segment::Block(piece));
                if !open.is_empty() {
                    segments.push(Segment::Run(
                        open.iter()
                            .map(|&owner| Piece::Open(owner, false, true))
                            .collect(),
                    ));
                }
            }
            _ => match segments.last_mut() {
                Some(Segment::Run(run)) => run.push(piece),
                _ => segments.push(Segment::Run(vec![piece])),
            },
        }
    }
    // An Open whose element does not close in the same run has no end edge
    // there.
    for segment in &mut segments {
        let Segment::Run(run) = segment else {
            continue;
        };
        let mut stack: Vec<usize> = Vec::new();
        let mut closed = vec![false; run.len()];
        for index in 0..run.len() {
            match run[index] {
                Piece::Open(..) => stack.push(index),
                Piece::Close(_, real) => {
                    if let Some(open_index) = stack.pop() {
                        closed[open_index] = real;
                    }
                }
                _ => {}
            }
        }
        for (index, piece) in run.iter_mut().enumerate() {
            if let Piece::Open(owner, start, _) = *piece {
                *piece = Piece::Open(owner, start, closed[index]);
            }
        }
    }
    // A Close the segmentation added after a block may now be the real
    // close of a reopened span: the reopened run ends where the element
    // ends, so its Close keeps the end edge (already the default above).
    // A split inline's fragment with a non-zero edge is content (it makes
    // a line box, CSS 2 10.8); one without is not.
    let has_edge = |cx: &BuildCx<'_>, piece: &Piece| match *piece {
        Piece::Open(owner, start, end) => cx.styles.get(&owner).is_some_and(|style| {
            let left = style.padding.left + style.border.left + style.margin.left;
            let right = style.padding.right + style.border.right + style.margin.right;
            (start && left != 0.0) || (end && right != 0.0)
        }),
        _ => true,
    };
    let run_has_inline = |cx: &BuildCx<'_>, run: &[Piece]| {
        run.iter()
            .filter(|piece| !matches!(piece, Piece::Close(..)) && has_edge(cx, piece))
            .any(|piece| level(cx.tree, *piece, Some(style), cx.styles) == Level::Inline)
    };

    // All inline: the container is the IFC.
    if can_be_inline_root && segments.len() == 1 {
        if let Segment::Run(run) = &segments[0] {
            if run_has_inline(cx, run) {
                let mut items = Vec::new();
                cx.collect(run, Some(style), &mut items);
                let children = item_nodes(&items);
                let own_ifc = cx.create_ifc(id, style, false, &items);
                return FlowChildren { own_ifc, children };
            }
        }
    }

    let mut children = Vec::new();
    for segment in segments {
        match segment {
            Segment::Block(Piece::Dom(child)) => {
                let built = super::build_any(
                    cx.tree,
                    child,
                    cx.taffy_tree,
                    cx.id_map,
                    cx.engine,
                    cx.ifc_items,
                    cx.styles,
                );
                if style.legacy_center {
                    let has_default_horizontal_margins =
                        cx.styles.get(&child).is_some_and(|child| {
                            child.margin.left == 0.0
                                && child.margin.right == 0.0
                                && !child.margin_auto[1]
                                && !child.margin_auto[3]
                        });
                    if has_default_horizontal_margins {
                        for node in &built {
                            if let Ok(current) = cx.taffy_tree.style(*node) {
                                let mut centered = current.clone();
                                centered.margin.left = taffy::style::LengthPercentageAuto::auto();
                                centered.margin.right = taffy::style::LengthPercentageAuto::auto();
                                let _ = cx.taffy_tree.set_style_if_changed(*node, centered);
                            }
                        }
                    }
                }
                children.extend(built);
            }
            Segment::Block(Piece::Pseudo(host, kind)) => {
                children.extend(cx.build_generated_box(host, kind));
            }
            Segment::Block(Piece::Open(..) | Piece::Close(..)) => {}
            Segment::Run(run) => {
                if run_has_inline(cx, &run) {
                    let mut items = Vec::new();
                    cx.collect(&run, Some(style), &mut items);
                    let boxes = item_nodes(&items);
                    let Ok(node) = cx.taffy_tree.new_with_children(
                        taffy::Style {
                            display: taffy::Display::Block,
                            direction: style.direction.unwrap_or(taffy::Direction::Ltr),
                            ..Default::default()
                        },
                        &boxes,
                    ) else {
                        continue;
                    };
                    if let Some(index) = cx.create_ifc(id, style, true, &items) {
                        cx.attach_ifc(node, index);
                    }
                    children.push(node);
                } else {
                    // Floats and out-of-flow boxes between block boxes are
                    // block-level children of the container.
                    for piece in run {
                        match piece {
                            Piece::Dom(child) => {
                                if is_text(cx.tree, child) {
                                    continue;
                                }
                                if let Some(node) = cx.build_element(child) {
                                    children.push(node);
                                }
                            }
                            Piece::Pseudo(host, kind) => {
                                children.extend(cx.build_generated_box(host, kind));
                            }
                            Piece::Open(..) | Piece::Close(..) => {}
                        }
                    }
                }
            }
        }
    }
    FlowChildren {
        own_ifc: None,
        children,
    }
}

/// The Taffy nodes of the boxes among IFC items, in order.
fn item_nodes(items: &[Item]) -> Vec<taffy::NodeId> {
    items
        .iter()
        .filter_map(|item| match item {
            Item::Atomic { node, .. } | Item::Float { node, .. } | Item::OutOfFlow { node, .. } => {
                Some(*node)
            }
            _ => None,
        })
        .collect()
}

/// An anonymous IFC block for a run of text inside a flex or grid container
/// (CSS wraps each contiguous run of text in an anonymous item).
pub(super) fn build_text_run_item(
    cx: &mut BuildCx<'_>,
    parent: NodeId,
    run: &[NodeId],
) -> Option<taffy::NodeId> {
    let parent_style = cx.styles.get(&parent)?.clone();
    let items: Vec<Item> = run.iter().map(|&text| Item::Text(text)).collect();
    let node = cx
        .taffy_tree
        .new_leaf(taffy::Style {
            display: taffy::Display::Block,
            direction: parent_style.direction.unwrap_or(taffy::Direction::Ltr),
            ..Default::default()
        })
        .ok()?;
    let index = cx.create_ifc(parent, &parent_style, true, &items)?;
    cx.attach_ifc(node, index);
    Some(node)
}
