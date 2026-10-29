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

fn local_name(tree: &DomTree, id: NodeId) -> Option<String> {
    tree.with_node(id, |node| {
        node.as_element().map(|element| element.local.as_ref().to_string())
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
    !preserves && tree.text_content(id).chars().all(char::is_whitespace)
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
    for child in rendered_children(tree, id) {
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
            if inline_contains_block(tree, child, styles) {
                return true;
            }
            continue;
        }
        if !crate::is_inline_level_box(style) {
            return true;
        }
    }
    false
}

fn level(
    tree: &DomTree,
    piece: Piece,
    parent_style: Option<&crate::LayoutStyle>,
    styles: &HashMap<NodeId, crate::LayoutStyle>,
) -> Level {
    match piece {
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
    fn splice(
        tree: &DomTree,
        children: &[NodeId],
        styles: &HashMap<NodeId, crate::LayoutStyle>,
        out: &mut Vec<Piece>,
    ) {
        for &child in children {
            match styles.get(&child) {
                Some(style) if style.display_contents && style.display != crate::Display::None => {
                    if style.before_pseudo.is_some() {
                        out.push(Piece::Pseudo(child, GeneratedBoxKind::Before));
                    }
                    splice(tree, &rendered_children(tree, child), styles, out);
                    if style.after_pseudo.is_some() {
                        out.push(Piece::Pseudo(child, GeneratedBoxKind::After));
                    }
                }
                _ => out.push(Piece::Dom(child)),
            }
        }
    }
    splice(tree, children, styles, &mut out);
    if with_pseudos && pseudo_style(styles, host, GeneratedBoxKind::After).is_some() {
        out.push(Piece::Pseudo(host, GeneratedBoxKind::After));
    }
    out
}

/// Everything `build` threads through box construction.
pub(super) struct BuildCx<'a> {
    pub(super) tree: &'a DomTree,
    pub(super) taffy_tree: &'a mut TaffyTree<usize>,
    pub(super) id_map: &'a mut HashMap<taffy::NodeId, NodeId>,
    pub(super) words: &'a mut HashMap<taffy::NodeId, (NodeId, String)>,
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
            self.words,
            self.engine,
            self.ifc_items,
            self.styles,
        )
    }

    /// A box for a `::before`/`::after` that generates its own box (block,
    /// inline-block, float). Its text forms an inline formatting context.
    pub(super) fn build_generated_box(&mut self, host: NodeId, kind: GeneratedBoxKind) -> Option<taffy::NodeId> {
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
        if matches!(name.as_str(), "input" | "select" | "textarea" | "button")
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
        for &piece in pieces {
            let level = level(self.tree, piece, parent_style, self.styles);
            match (piece, level) {
                (_, Level::Skip) => {}
                (Piece::Dom(id), Level::Space) => items.push(Item::Text(id)),
                (Piece::Dom(id), Level::Inline) if is_text(self.tree, id) => {
                    items.push(Item::Text(id))
                }
                (Piece::Dom(id), Level::Inline) => {
                    let style = self.styles.get(&id).cloned().unwrap_or_default();
                    if local_name(self.tree, id).as_deref() == Some("br") {
                        // The element still needs a rect.
                        items.push(Item::Break(id));
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
                        self.collect(&pieces, Some(&style), items);
                        items.push(Item::SpanEnd);
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
                        if let Some(text) = style.before_content.as_deref().filter(|t| !t.is_empty())
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
                (Piece::Dom(_), _) => {}
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
    let pieces = flow_pieces(cx.tree, id, dom_children, cx.styles, true);
    // Segment into maximal runs of non-block pieces.
    enum Segment {
        Run(Vec<Piece>),
        Block(Piece),
    }
    let mut segments: Vec<Segment> = Vec::new();
    for piece in pieces {
        match level(cx.tree, piece, Some(style), cx.styles) {
            Level::Skip => {}
            Level::Block => segments.push(Segment::Block(piece)),
            _ => match segments.last_mut() {
                Some(Segment::Run(run)) => run.push(piece),
                _ => segments.push(Segment::Run(vec![piece])),
            },
        }
    }
    let run_has_inline = |cx: &BuildCx<'_>, run: &[Piece]| {
        run.iter()
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
                    cx.words,
                    cx.engine,
                    cx.ifc_items,
                    cx.styles,
                );
                if style.legacy_center {
                    let has_default_horizontal_margins = cx.styles.get(&child).is_some_and(|child| {
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
