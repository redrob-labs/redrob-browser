//! The prepared render's derived geometry (viewport-fixed ownership, root
//! scrolling overflow, the scroll tree and sticky constraints), recomputed
//! only where a retained layout changed.
//!
//! Every pass here is a function of each node's style, rect, accumulated
//! transform, translate and inherited overflow clip, and of the same values
//! of its ancestors. `resolve_clip_rects` already walks a retained layout only
//! where one of those changed: a node it does not reach has a whole subtree
//! whose inputs, and whose ancestors' styles and inherited clips, are the
//! ones the previous layout had. Each pass here therefore keeps the previous
//! layout's per-node results of an unreached subtree, recomputes the reached
//! nodes, and walks a whole subtree again when what a reached node hands its
//! children changed. Without a previous layout every node counts as reached,
//! which is the from-scratch computation.

use super::{
    current_flat_tree, is_viewport_overflow_source, rendered_children_ref, rendered_parent,
    resolved_own_translate, DerivedLayoutState, DomLayout, OverflowClip, ScrollContainer, ScrollId,
    ScrollTree, StickyFrame, StickyLayout,
};
use crate::{HashSet, Rect};
use obscura_dom::tree::{DomTree, NodeId};

/// Per-node results of one derived-geometry computation beyond what the
/// prepared render keeps, by node index.
#[derive(Default)]
pub(crate) struct DerivedMemo {
    viewport: (f32, f32),
    /// `viewport_fixed_nodes` state bits.
    fixed_state: Vec<u8>,
    /// The rightmost and bottommost root scrolling overflow of each subtree.
    extent: Vec<(f32, f32)>,
    /// The scroll tree's local scrolling overflow of each boxed subtree.
    overflow_bounds: Vec<Option<Rect>>,
    nearest_scrollport: Vec<Option<(NodeId, bool)>>,
    nearest_sticky: Vec<Option<NodeId>>,
    inherited_clip_sticky: Vec<Option<NodeId>>,
}

/// What a prepared render derived, handed to the next retained layout.
pub(crate) struct PreviousDerived {
    pub(crate) memo: DerivedMemo,
    pub(crate) viewport_fixed: HashSet<NodeId>,
    pub(crate) scroll_tree: ScrollTree,
    pub(crate) sticky: StickyLayout,
}

/// The previous derived geometry and where the layout since changed.
pub(crate) struct DerivedSeed {
    pub(crate) previous: PreviousDerived,
    /// By node index: the node or its subtree may have changed (closed under
    /// ancestors). A node outside it has a subtree identical to before.
    pub(crate) changed: Vec<bool>,
    /// Nodes the previous layout rendered and this one does not.
    pub(crate) removed: Vec<NodeId>,
}

/// Which nodes a computation recomputes.
struct Reach<'a> {
    changed: Option<&'a [bool]>,
}

impl Reach<'_> {
    fn reached(&self, id: NodeId) -> bool {
        self.changed
            .is_none_or(|changed| changed.get(id.index()).copied().unwrap_or(true))
    }
}

fn slot<T: Copy>(values: &[T], id: NodeId) -> Option<T> {
    values.get(id.index()).copied()
}

fn put<T>(values: &mut [T], id: NodeId, value: T) {
    if let Some(slot) = values.get_mut(id.index()) {
        *slot = value;
    }
}

fn resized<T: Clone>(mut values: Vec<T>, len: usize, fill: T) -> Vec<T> {
    values.resize(len, fill);
    values
}

const FIXED: u8 = 1;
const HAS_FIXED_CB: u8 = 2;

impl DomLayout {
    /// `derived_layout_state`, recomputing only where `seed` says this layout
    /// differs from the one it took the previous results from. Also returns
    /// what the next retained layout needs to do the same.
    pub(crate) fn derived_layout_state_retained(
        &self,
        tree: &DomTree,
        viewport: (f32, f32),
        seed: Option<DerivedSeed>,
    ) -> (DerivedLayoutState, DerivedMemo) {
        let seed = seed.filter(|seed| seed.previous.memo.viewport == viewport);
        let (previous, changed, removed) = match seed {
            Some(seed) => (Some(seed.previous), Some(seed.changed), seed.removed),
            None => (None, None, Vec::new()),
        };
        let reach = Reach {
            changed: changed.as_deref(),
        };
        let all = Reach { changed: None };
        let (mut memo, previous_fixed, previous_scroll, previous_sticky) = match previous {
            Some(previous) => (
                previous.memo,
                Some(previous.viewport_fixed),
                Some(previous.scroll_tree),
                Some(previous.sticky),
            ),
            None => (DerivedMemo::default(), None, None, None),
        };
        memo.viewport = viewport;
        let slots = tree.node_slot_count();

        // Viewport-fixed ownership.
        let old_fixed_state = std::mem::take(&mut memo.fixed_state);
        let mut fixed_state = resized(old_fixed_state.clone(), slots, 0);
        let mut viewport_fixed = previous_fixed.unwrap_or_default();
        for id in &removed {
            viewport_fixed.remove(id);
            put(&mut fixed_state, *id, 0);
        }
        for child in rendered_children_ref(tree, tree.document()).iter().copied() {
            self.visit_fixed(
                tree,
                child,
                &reach,
                false,
                &old_fixed_state,
                &mut fixed_state,
                &mut viewport_fixed,
            );
        }
        memo.fixed_state = fixed_state;

        // Root scrolling overflow.
        let mut extent = resized(
            std::mem::take(&mut memo.extent),
            slots,
            (f32::NEG_INFINITY, f32::NEG_INFINITY),
        );
        for id in &removed {
            put(&mut extent, *id, (f32::NEG_INFINITY, f32::NEG_INFINITY));
        }
        let mut right = viewport.0.max(0.0);
        let mut bottom = viewport.1.max(0.0);
        if let Some(root) = super::document_element(tree) {
            let (r, b) = self.visit_extent(tree, root, None, &viewport_fixed, &reach, &mut extent);
            right = right.max(r);
            bottom = bottom.max(b);
        }
        memo.extent = extent;
        let content_size = (right.ceil(), bottom.ceil());

        // Scroll tree, from scratch when the set of scroll containers changed.
        let overflow_bounds = std::mem::take(&mut memo.overflow_bounds);
        let incremental = previous_scroll.and_then(|scroll_tree| {
            self.scroll_tree_retained(
                tree,
                viewport,
                content_size,
                &viewport_fixed,
                &reach,
                &removed,
                scroll_tree,
                overflow_bounds,
            )
        });
        let scroll_was_incremental = incremental.is_some();
        let (scroll_tree, overflow_bounds) = match incremental {
            Some(result) => result,
            None => self
                .scroll_tree_retained(
                    tree,
                    viewport,
                    content_size,
                    &viewport_fixed,
                    &all,
                    &[],
                    ScrollTree::default(),
                    Vec::new(),
                )
                .expect("a scroll tree from scratch"),
        };
        memo.overflow_bounds = overflow_bounds;

        // Sticky constraints; owners follow the scroll tree, so a scroll tree
        // from scratch takes them from scratch too.
        let (sticky_reach, previous_sticky) = if scroll_was_incremental {
            (&reach, previous_sticky)
        } else {
            (&all, None)
        };
        let sticky = self.sticky_retained(
            tree,
            viewport,
            content_size,
            &scroll_tree,
            sticky_reach,
            &removed,
            previous_sticky,
            &mut memo,
        );

        (
            DerivedLayoutState {
                content_size,
                viewport_fixed,
                sticky,
                scroll_tree,
            },
            memo,
        )
    }

    /// `viewport_fixed_nodes` for `id`'s subtree.
    #[allow(clippy::too_many_arguments)]
    fn visit_fixed(
        &self,
        tree: &DomTree,
        id: NodeId,
        reach: &Reach,
        force: bool,
        old: &[u8],
        state: &mut [u8],
        fixed: &mut HashSet<NodeId>,
    ) {
        if !force && !reach.reached(id) {
            return;
        }
        let parent_state = rendered_parent(tree, id)
            .and_then(|parent| slot(state, parent))
            .unwrap_or(0);
        let parent_is_fixed = parent_state & FIXED != 0;
        let ancestor_has_fixed_cb = parent_state & HAS_FIXED_CB != 0;
        let style = self.styles.get(&id);
        let starts_viewport_fixed =
            style.is_some_and(|style| style.position_fixed && !ancestor_has_fixed_cb);
        let mut own = 0;
        if parent_is_fixed || starts_viewport_fixed {
            fixed.insert(id);
            own |= FIXED;
        } else {
            fixed.remove(&id);
        }
        let establishes_fixed_cb = style.is_some_and(|style| style.containing_block_triggers != 0);
        if ancestor_has_fixed_cb || establishes_fixed_cb {
            own |= HAS_FIXED_CB;
        }
        put(state, id, own);
        let force = force || slot(old, id) != Some(own);
        for child in rendered_children_ref(tree, id).iter().copied() {
            self.visit_fixed(tree, child, reach, force, old, state, fixed);
        }
    }

    /// `accumulate_scrolling_overflow` for `id`'s subtree: its rightmost and
    /// bottommost contribution.
    fn visit_extent(
        &self,
        tree: &DomTree,
        id: NodeId,
        inherited_clip: Option<OverflowClip>,
        fixed: &HashSet<NodeId>,
        reach: &Reach,
        extent: &mut [(f32, f32)],
    ) -> (f32, f32) {
        if !reach.reached(id) {
            return slot(extent, id).unwrap_or((f32::NEG_INFINITY, f32::NEG_INFINITY));
        }
        let mut right = f32::NEG_INFINITY;
        let mut bottom = f32::NEG_INFINITY;
        if fixed.contains(&id) {
            put(extent, id, (right, bottom));
            return (right, bottom);
        }
        let translated = self.rects.get(&id).map(|rect| {
            self.transforms
                .get(&id)
                .copied()
                .map(|transform| transform.map_rect(*rect))
                .unwrap_or(*rect)
        });
        if let Some(overflow) = translated {
            let visible = if let Some(ref clip) = inherited_clip {
                clip.intersect_rect(&overflow)
            } else {
                Some(overflow)
            };
            if let Some(overflow) = visible {
                right = right.max(overflow.x + overflow.width);
                bottom = bottom.max(overflow.y + overflow.height);
            }
        }
        let child_clip = match (self.styles.get(&id), self.rects.get(&id)) {
            (Some(style), Some(rect))
                if style.overflow_hidden && !is_viewport_overflow_source(id, &self.styles) =>
            {
                let (tx, ty) = self.translates.get(&id).copied().unwrap_or((0.0, 0.0));
                let own = OverflowClip::for_box(rect, style, tx, ty);
                Some(match inherited_clip {
                    Some(clip) => clip.intersect(own),
                    None => own,
                })
            }
            _ => inherited_clip,
        };
        for child in rendered_children_ref(tree, id).iter().copied() {
            let (r, b) = self.visit_extent(tree, child, child_clip.clone(), fixed, reach, extent);
            right = right.max(r);
            bottom = bottom.max(b);
        }
        put(extent, id, (right, bottom));
        (right, bottom)
    }

    /// `scroll_tree`, keeping `previous`'s entries of unreached subtrees.
    /// `None` when the scroll containers are not the ones `previous` had.
    #[allow(clippy::too_many_arguments)]
    fn scroll_tree_retained(
        &self,
        tree: &DomTree,
        viewport: (f32, f32),
        root_content_size: (f32, f32),
        viewport_fixed: &HashSet<NodeId>,
        reach: &Reach,
        removed: &[NodeId],
        previous: ScrollTree,
        overflow_bounds: Vec<Option<Rect>>,
    ) -> Option<(ScrollTree, Vec<Option<Rect>>)> {
        let flat = current_flat_tree(tree);
        let node_capacity = flat
            .walk
            .iter()
            .map(|id| id.index())
            .max()
            .map_or(0, |max| max + 1);
        let from_scratch = reach.changed.is_none();
        let removed_containers: Vec<ScrollId> = removed
            .iter()
            .filter_map(|id| slot(&previous.node_container, *id).flatten())
            .collect();
        let old_owner = previous.movement_owner;
        let mut node_container = resized(previous.node_container, node_capacity, None);
        let mut movement_owner = resized(old_owner.clone(), node_capacity, None);
        let mut node_content_size = resized(previous.node_content_size, node_capacity, None);
        let mut overflow_bounds = resized(overflow_bounds, node_capacity, None);
        for id in removed {
            put(&mut node_container, *id, None);
            put(&mut movement_owner, *id, None);
            put(&mut node_content_size, *id, None);
            put(&mut overflow_bounds, *id, None);
        }
        let mut containers = previous.containers;
        let root_container = ScrollContainer {
            node: None,
            parent: None,
            client_size: viewport,
            content_size: root_content_size,
            max_offset: (
                crate::quantized_scroll_range(root_content_size.0, viewport.0, 1.0),
                crate::quantized_scroll_range(root_content_size.1, viewport.1, 1.0),
            ),
        };
        match containers.first_mut() {
            Some(first) => *first = root_container,
            None => containers.push(root_container),
        }

        let root = flat
            .walk
            .iter()
            .copied()
            .find(|id| tree.borrow_node(*id).is_some_and(|node| node.is_element()));
        let mut reached = Vec::new();
        if let Some(root) = root {
            let mut walk = ScrollAssign {
                laid: self,
                tree,
                viewport_fixed,
                reach,
                from_scratch,
                old_owner: &old_owner,
                containers: &mut containers,
                node_container: &mut node_container,
                movement_owner: &mut movement_owner,
                reached: &mut reached,
                lost: Vec::new(),
                topology_changed: false,
            };
            for sid in removed_containers {
                walk.lose(sid);
            }
            walk.assign(root, Some(ScrollId::ROOT), false).ok()?;
            if walk.topology_changed {
                let mut position = vec![u32::MAX; tree.node_slot_count()];
                for (index, id) in flat.walk.iter().enumerate() {
                    put(&mut position, *id, index as u32);
                }
                walk.renumber(&position).ok()?;
            }
        } else if !removed_containers.is_empty() {
            return None;
        }

        // Local scrolling overflow, children before parents.
        let order: Box<dyn Iterator<Item = &NodeId>> = if from_scratch {
            Box::new(flat.walk.iter().rev())
        } else {
            Box::new(reached.iter().rev())
        };
        for &id in order {
            self.scroll_overflow_node(tree, id, &mut overflow_bounds, &mut node_content_size);
        }
        for container in containers.iter_mut().skip(1) {
            container.content_size = container
                .node
                .and_then(|node| node_content_size.get(node.index()).copied().flatten())
                .unwrap_or(container.client_size);
            container.max_offset = (
                crate::quantized_scroll_range(
                    container.content_size.0,
                    container.client_size.0,
                    1.0,
                ),
                crate::quantized_scroll_range(
                    container.content_size.1,
                    container.client_size.1,
                    1.0,
                ),
            );
        }
        Some((
            ScrollTree {
                containers,
                node_container,
                node_content_size,
                movement_owner,
            },
            overflow_bounds,
        ))
    }

    /// One node of `scroll_tree`'s reverse overflow pass.
    fn scroll_overflow_node(
        &self,
        tree: &DomTree,
        id: NodeId,
        overflow_bounds: &mut [Option<Rect>],
        node_content_size: &mut [Option<(f32, f32)>],
    ) {
        let rect = self.rects.get(&id).copied();
        let style = self.styles.get(&id);
        if rect.is_none()
            && !style.is_some_and(|style| {
                style.display_contents && style.display != crate::Display::None
            })
        {
            put(overflow_bounds, id, None);
            put(node_content_size, id, None);
            return;
        }
        let visual = |rect: Rect| {
            self.transforms
                .get(&id)
                .copied()
                .map(|transform| transform.map_rect(rect))
                .unwrap_or(rect)
        };
        let padding_rect = rect.map(|rect| {
            style.map_or(rect, |style| Rect {
                x: rect.x + style.border.left,
                y: rect.y + style.border.top,
                width: (rect.width - style.border.left - style.border.right).max(0.0),
                height: (rect.height - style.border.top - style.border.bottom).max(0.0),
            })
        });
        let visual_padding = padding_rect.map(visual);
        let mut local = visual_padding;
        if style.is_some_and(|style| {
            style.overflow_scroll_container && !style.overflow_propagated_to_viewport
        }) {
            if let Some(grid) = self.grid_overflow.get(&id).copied() {
                let grid = visual(grid);
                local = Some(local.map_or(grid, |local| local.union(&grid)));
            }
        }
        for child in rendered_children_ref(tree, id).iter().copied() {
            let Some(child_overflow) = overflow_bounds.get(child.index()).copied().flatten() else {
                continue;
            };
            let contribution = if let Some(style) = self.styles.get(&child).filter(|style| {
                style.overflow_hidden
                    && !style.overflow_propagated_to_viewport
                    && !style.display_contents
            }) {
                let border_box = self
                    .rects
                    .get(&child)
                    .copied()
                    .map(|rect| {
                        self.transforms
                            .get(&child)
                            .copied()
                            .map(|transform| transform.map_rect(rect))
                            .unwrap_or(rect)
                    })
                    .unwrap_or(child_overflow);
                let x0 = if style.clips_overflow_x() {
                    border_box.x
                } else {
                    child_overflow.x
                };
                let x1 = if style.clips_overflow_x() {
                    border_box.x + border_box.width
                } else {
                    child_overflow.x + child_overflow.width
                };
                let y0 = if style.clips_overflow_y() {
                    border_box.y
                } else {
                    child_overflow.y
                };
                let y1 = if style.clips_overflow_y() {
                    border_box.y + border_box.height
                } else {
                    child_overflow.y + child_overflow.height
                };
                Rect {
                    x: x0,
                    y: y0,
                    width: (x1 - x0).max(0.0),
                    height: (y1 - y0).max(0.0),
                }
            } else {
                child_overflow
            };
            local = Some(local.map_or(contribution, |local| local.union(&contribution)));
        }
        put(overflow_bounds, id, local);
        let (Some(local), Some(visual_padding)) = (local, visual_padding) else {
            put(node_content_size, id, None);
            return;
        };
        let mut content = (
            (local.x + local.width - visual_padding.x).max(visual_padding.width),
            (local.y + local.height - visual_padding.y).max(visual_padding.height),
        );
        if let Some(style) = style.filter(|style| style.overflow_scroll_container) {
            if content.0 > visual_padding.width {
                content.0 += style.padding.right;
            }
            if content.1 > visual_padding.height {
                content.1 += style.padding.bottom;
            }
        }
        put(
            node_content_size,
            id,
            Some(
                if style.is_some_and(|style| style.ignores_used_box_sizes()) {
                    (0.0, 0.0)
                } else {
                    content
                },
            ),
        );
    }

    /// `sticky_layout_with_geometry`, keeping `previous`'s owners of
    /// unreached subtrees.
    #[allow(clippy::too_many_arguments)]
    fn sticky_retained(
        &self,
        tree: &DomTree,
        viewport: (f32, f32),
        content: (f32, f32),
        scroll_tree: &ScrollTree,
        reach: &Reach,
        removed: &[NodeId],
        previous: Option<StickyLayout>,
        memo: &mut DerivedMemo,
    ) -> StickyLayout {
        let from_scratch = previous.is_none() || reach.changed.is_none();
        let slots = tree.node_slot_count();
        let (mut layout, old_scrollport, old_sticky, old_clip) = match previous {
            Some(previous) if !from_scratch => (
                StickyLayout {
                    frames: Vec::new(),
                    owners: previous.owners,
                    clip_owners: previous.clip_owners,
                    compatibility_scroll_tree: None,
                },
                std::mem::take(&mut memo.nearest_scrollport),
                std::mem::take(&mut memo.nearest_sticky),
                std::mem::take(&mut memo.inherited_clip_sticky),
            ),
            _ => (StickyLayout::default(), Vec::new(), Vec::new(), Vec::new()),
        };
        // The sticky boxes of the previous computation.
        let previous_frames: Vec<NodeId> = old_sticky
            .iter()
            .enumerate()
            .filter_map(|(index, sticky)| sticky.filter(|id| id.index() == index))
            .collect();
        let mut nearest_scrollport = resized(
            old_scrollport.clone(),
            scroll_tree.movement_owner.len(),
            None,
        );
        let mut nearest_sticky = resized(old_sticky.clone(), slots, None);
        let mut inherited_clip_sticky = resized(old_clip.clone(), slots, None);
        for id in removed {
            layout.owners.remove(id);
            layout.clip_owners.remove(id);
            put(&mut nearest_scrollport, *id, None);
            put(&mut nearest_sticky, *id, None);
            put(&mut inherited_clip_sticky, *id, None);
        }
        let all = Reach { changed: None };
        let mut walk = StickyWalk {
            laid: self,
            tree,
            scroll_tree,
            reach: if from_scratch { &all } else { reach },
            old_scrollport: &old_scrollport,
            old_sticky: &old_sticky,
            old_clip: &old_clip,
            nearest_scrollport: &mut nearest_scrollport,
            nearest_sticky: &mut nearest_sticky,
            inherited_clip_sticky: &mut inherited_clip_sticky,
            owners: &mut layout.owners,
            clip_owners: &mut layout.clip_owners,
            sticky: Vec::new(),
        };
        for child in rendered_children_ref(tree, tree.document()).iter().copied() {
            walk.visit(child, false);
        }
        let mut sticky = std::mem::take(&mut walk.sticky);
        if !from_scratch {
            // Frames of unreached sticky boxes still follow their (possibly
            // changed) containing blocks and the content size: rebuild all,
            // in rendered preorder.
            let flat = current_flat_tree(tree);
            sticky.extend(previous_frames);
            sticky.retain(|id| {
                flat.contains(*id) && nearest_sticky.get(id.index()).copied().flatten() == Some(*id)
            });
            sticky.sort_unstable_by_key(|id| id.index());
            sticky.dedup();
            if sticky.len() > 1 {
                let mut position = vec![u32::MAX; slots];
                for (index, id) in flat.walk.iter().enumerate() {
                    put(&mut position, *id, index as u32);
                }
                sticky.sort_by_key(|id| slot(&position, *id).unwrap_or(u32::MAX));
            }
        }
        let root_containing = Rect {
            x: 0.0,
            y: 0.0,
            width: content.0,
            height: content.1,
        };
        let root_font_size = tree
            .query_selector("html")
            .ok()
            .flatten()
            .and_then(|root| self.styles.get(&root).and_then(|style| style.font_size))
            .unwrap_or(16.0);
        for id in sticky {
            let parent = rendered_parent(tree, id);
            let parent_sticky = parent
                .and_then(|parent| nearest_sticky.get(parent.index()).copied())
                .flatten();
            let Some(scroll_owner) = slot(&scroll_tree.movement_owner, id).flatten() else {
                continue;
            };
            let (Some(style), Some(rect)) = (self.styles.get(&id), self.rects.get(&id).copied())
            else {
                continue;
            };
            layout.frames.push(self.sticky_frame(
                tree,
                id,
                parent,
                parent_sticky,
                scroll_owner,
                scroll_tree,
                style,
                rect,
                viewport,
                root_containing,
                root_font_size,
            ));
        }
        memo.nearest_scrollport = nearest_scrollport;
        memo.nearest_sticky = nearest_sticky;
        memo.inherited_clip_sticky = inherited_clip_sticky;
        layout
    }

    #[allow(clippy::too_many_arguments)]
    fn sticky_frame(
        &self,
        tree: &DomTree,
        id: NodeId,
        parent: Option<NodeId>,
        parent_sticky: Option<NodeId>,
        scroll_owner: ScrollId,
        scroll_tree: &ScrollTree,
        style: &crate::LayoutStyle,
        rect: Rect,
        viewport: (f32, f32),
        root_containing: Rect,
        root_font_size: f32,
    ) -> StickyFrame {
        let scrollport_node = scroll_tree.containers[scroll_owner.index()].node;
        let (tx, ty) = self.translates.get(&id).copied().unwrap_or((0.0, 0.0));
        let (own_tx, own_ty) = resolved_own_translate(style, &rect, 16.0, viewport);
        let normal = Rect {
            x: rect.x + tx - own_tx,
            y: rect.y + ty - own_ty,
            ..rect
        };
        let content_box = |candidate: NodeId, style: &crate::LayoutStyle, rect: Rect| {
            let (ctx, cty) = self
                .translates
                .get(&candidate)
                .copied()
                .unwrap_or((0.0, 0.0));
            Rect {
                x: rect.x + ctx + style.border.left + style.padding.left,
                y: rect.y + cty + style.border.top + style.padding.top,
                width: (rect.width
                    - style.border.left
                    - style.border.right
                    - style.padding.left
                    - style.padding.right)
                    .max(0.0),
                height: (rect.height
                    - style.border.top
                    - style.border.bottom
                    - style.padding.top
                    - style.padding.bottom)
                    .max(0.0),
            }
        };
        let mut containing = None;
        let mut containing_node = None;
        let mut ancestor = parent;
        while let Some(candidate) = ancestor {
            if let (Some(candidate_style), Some(candidate_rect)) = (
                self.styles.get(&candidate),
                self.rects.get(&candidate).copied(),
            ) {
                if candidate_style.display != crate::Display::Inline
                    && !candidate_style.display_contents
                {
                    containing = Some(content_box(candidate, candidate_style, candidate_rect));
                    containing_node = Some(candidate);
                    break;
                }
            }
            ancestor = rendered_parent(tree, candidate);
        }
        let scrollport = scrollport_node
            .and_then(|node| {
                let style = self.styles.get(&node)?;
                let rect = self.rects.get(&node).copied()?;
                Some(content_box(node, style, rect))
            })
            .unwrap_or(Rect {
                x: 0.0,
                y: 0.0,
                width: viewport.0,
                height: viewport.1,
            });
        StickyFrame {
            id,
            parent_sticky,
            scroll_owner,
            scrollport_node,
            scrollport,
            normal,
            containing: containing.unwrap_or(root_containing),
            containing_is_scrollport: containing_node == scrollport_node,
            margin: style.margin,
            inset: style.inset,
            inset_expressions: style.inset_expressions.clone(),
            font_size: style.font_size.unwrap_or(16.0),
            root_font_size,
            rtl_inline: style.direction == Some(taffy::Direction::Rtl),
        }
    }
}

/// The owner walk of `scroll_tree_retained`.
struct ScrollAssign<'a> {
    laid: &'a DomLayout,
    tree: &'a DomTree,
    viewport_fixed: &'a HashSet<NodeId>,
    reach: &'a Reach<'a>,
    from_scratch: bool,
    old_owner: &'a [Option<ScrollId>],
    containers: &'a mut Vec<ScrollContainer>,
    node_container: &'a mut Vec<Option<ScrollId>>,
    movement_owner: &'a mut Vec<Option<ScrollId>>,
    reached: &'a mut Vec<NodeId>,
    /// By container number: the container went.
    lost: Vec<bool>,
    /// A container came or went, so the numbers are no longer in rendered
    /// preorder.
    topology_changed: bool,
}

impl ScrollAssign<'_> {
    fn lose(&mut self, sid: ScrollId) {
        if self.lost.len() <= sid.index() {
            self.lost.resize(sid.index() + 1, false);
        }
        self.lost[sid.index()] = true;
        self.topology_changed = true;
    }

    /// Number the containers in rendered preorder again, as a computation
    /// from scratch does. `Err` when a node still names a container that went.
    fn renumber(&mut self, position: &[u32]) -> Result<(), ()> {
        let lost = |sid: usize| self.lost.get(sid).copied().unwrap_or(false);
        let mut live: Vec<usize> = (1..self.containers.len())
            .filter(|&sid| !lost(sid))
            .collect();
        live.sort_by_key(|&sid| {
            self.containers[sid]
                .node
                .and_then(|node| slot(position, node))
                .unwrap_or(u32::MAX)
        });
        let mut map = vec![u32::MAX; self.containers.len()];
        map[0] = 0;
        for (index, &sid) in live.iter().enumerate() {
            map[sid] = index as u32 + 1;
        }
        let remap = |id: Option<ScrollId>| -> Result<Option<ScrollId>, ()> {
            match id {
                None => Ok(None),
                Some(id) => match map.get(id.index()).copied() {
                    Some(new) if new != u32::MAX => Ok(Some(ScrollId(new))),
                    _ => Err(()),
                },
            }
        };
        let mut containers = Vec::with_capacity(live.len() + 1);
        containers.push(self.containers[0]);
        for &sid in &live {
            let mut container = self.containers[sid];
            container.parent = remap(container.parent)?;
            containers.push(container);
        }
        for entry in self.node_container.iter_mut() {
            *entry = remap(*entry)?;
        }
        for entry in self.movement_owner.iter_mut() {
            *entry = remap(*entry)?;
        }
        *self.containers = containers;
        Ok(())
    }

    fn assign(
        &mut self,
        id: NodeId,
        inherited_owner: Option<ScrollId>,
        force: bool,
    ) -> Result<(), ()> {
        if !force && !self.reach.reached(id) {
            return Ok(());
        }
        self.reached.push(id);
        let fixed = self.viewport_fixed.contains(&id);
        let parent_fixed = rendered_parent(self.tree, id)
            .is_some_and(|parent| self.viewport_fixed.contains(&parent));
        let starts_viewport_fixed = fixed && !parent_fixed;
        let owner = if starts_viewport_fixed {
            None
        } else {
            inherited_owner
        };
        put(self.movement_owner, id, owner);

        let laid = self.laid;
        let style = laid.styles.get(&id);
        let rect = laid.rects.get(&id).copied();
        let affine = laid
            .transforms
            .get(&id)
            .is_some_and(|transform| !transform.is_translation());
        let establishes = style.is_some_and(|style| {
            style.overflow_scroll_container
                && !style.overflow_propagated_to_viewport
                && !style.display_contents
        }) && rect.is_some()
            && !affine;
        let child_owner = if establishes {
            let style = style.expect("scroll container style");
            let rect = rect.expect("scroll container rect");
            let client = (
                (rect.width - style.border.left - style.border.right).max(0.0),
                (rect.height - style.border.top - style.border.bottom).max(0.0),
            );
            let container = ScrollContainer {
                node: Some(id),
                parent: owner,
                client_size: client,
                content_size: client,
                max_offset: (0.0, 0.0),
            };
            let kept = slot(self.node_container, id)
                .flatten()
                .filter(|_| !self.from_scratch);
            let sid = match kept {
                Some(sid) => {
                    *self.containers.get_mut(sid.index()).ok_or(())? = container;
                    sid
                }
                None => {
                    // A new container takes the next number for now (see
                    // `ScrollAssign::renumber`).
                    let sid = ScrollId(self.containers.len() as u32);
                    self.containers.push(container);
                    self.topology_changed |= !self.from_scratch;
                    sid
                }
            };
            put(self.node_container, id, Some(sid));
            Some(sid)
        } else {
            if let Some(sid) = slot(self.node_container, id).flatten() {
                self.lose(sid);
                put(self.node_container, id, None);
            }
            owner
        };
        let force = force || slot(self.old_owner, id) != Some(owner);
        for child in rendered_children_ref(self.tree, id).iter().copied() {
            self.assign(child, child_owner, force)?;
        }
        Ok(())
    }
}

/// The preorder walk of `sticky_retained`.
struct StickyWalk<'a> {
    laid: &'a DomLayout,
    tree: &'a DomTree,
    scroll_tree: &'a ScrollTree,
    reach: &'a Reach<'a>,
    old_scrollport: &'a [Option<(NodeId, bool)>],
    old_sticky: &'a [Option<NodeId>],
    old_clip: &'a [Option<NodeId>],
    nearest_scrollport: &'a mut Vec<Option<(NodeId, bool)>>,
    nearest_sticky: &'a mut Vec<Option<NodeId>>,
    inherited_clip_sticky: &'a mut Vec<Option<NodeId>>,
    owners: &'a mut crate::HashMap<NodeId, NodeId>,
    clip_owners: &'a mut crate::HashMap<NodeId, NodeId>,
    /// Reached sticky boxes that get a frame, in preorder.
    sticky: Vec<NodeId>,
}

impl StickyWalk<'_> {
    fn visit(&mut self, id: NodeId, force: bool) {
        if !force && !self.reach.reached(id) {
            return;
        }
        self.owners.remove(&id);
        self.clip_owners.remove(&id);
        self.visit_own(id);
        let force = force
            || slot(self.old_scrollport, id) != slot(self.nearest_scrollport, id)
            || slot(self.old_sticky, id) != slot(self.nearest_sticky, id)
            || slot(self.old_clip, id) != slot(self.inherited_clip_sticky, id);
        for child in rendered_children_ref(self.tree, id).iter().copied() {
            self.visit(child, force);
        }
    }

    fn visit_own(&mut self, id: NodeId) {
        let laid = self.laid;
        let parent = rendered_parent(self.tree, id);
        let inherited_scrollport = parent
            .and_then(|parent| self.nearest_scrollport.get(parent.index()).copied())
            .flatten();
        let style = laid.styles.get(&id);
        let establishes_authored_scrollport = style.is_some_and(|style| {
            style.overflow_scroll_container
                && !is_viewport_overflow_source(id, &laid.styles)
                && !style.display_contents
        }) && laid.rects.contains_key(&id);
        let descendants_scrollport = if establishes_authored_scrollport {
            Some((
                id,
                self.scroll_tree
                    .node_container
                    .get(id.index())
                    .copied()
                    .flatten()
                    .is_some(),
            ))
        } else {
            inherited_scrollport
        };
        put(self.nearest_scrollport, id, descendants_scrollport);
        let parent_sticky = parent
            .and_then(|parent| self.nearest_sticky.get(parent.index()).copied())
            .flatten();
        let inherited_clip = parent.and_then(|parent| {
            let parent_style = laid.styles.get(&parent);
            if parent_style.is_some_and(|style| style.overflow_hidden) {
                self.nearest_sticky.get(parent.index()).copied().flatten()
            } else {
                self.inherited_clip_sticky
                    .get(parent.index())
                    .copied()
                    .flatten()
            }
        });
        if let Some(owner) = inherited_clip {
            self.clip_owners.insert(id, owner);
        }
        put(self.inherited_clip_sticky, id, inherited_clip);

        let Some(scroll_owner) = slot(&self.scroll_tree.movement_owner, id).flatten() else {
            put(self.nearest_sticky, id, None);
            return;
        };
        let scrollport_node = self.scroll_tree.containers[scroll_owner.index()].node;
        let supported_scroll_owner = match inherited_scrollport {
            Some((authored, true)) => scrollport_node == Some(authored),
            Some((_authored, false)) => false,
            None => scrollport_node.is_none(),
        };
        let supported_coordinate_space = parent
            .and_then(|parent| laid.transforms.get(&parent))
            .is_none_or(|transform| transform.is_translation());
        let is_sticky = style.is_some_and(|style| {
            style.position_sticky
                && style.inset.iter().any(Option::is_some)
                && supported_scroll_owner
                && supported_coordinate_space
        });
        if !is_sticky {
            put(self.nearest_sticky, id, parent_sticky);
            if let Some(owner) = parent_sticky {
                self.owners.insert(id, owner);
            }
            return;
        }
        if style.is_none() || !laid.rects.contains_key(&id) {
            put(self.nearest_sticky, id, parent_sticky);
            return;
        }
        self.sticky.push(id);
        self.owners.insert(id, id);
        put(self.nearest_sticky, id, Some(id));
    }
}
