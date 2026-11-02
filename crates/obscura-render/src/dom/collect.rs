//! Box geometry read from the layout tree, kept from one layout to the next.
//!
//! Every box keeps what it was read as: its rect, its unrounded location and
//! size relative to its parent box, and the parent's absolute origin it was
//! placed at. A later layout reads only the boxes whose layout (or child
//! list) Taffy reports changed (`TaffyTree::layout_changed_since`); a subtree
//! that only moved, because a box before it changed size, is moved by the
//! difference of its parent's origin without reading the tree. The absolute
//! values are derived from the relative ones and the new origin, so a moved
//! box is never laid out or read again.

use super::{HashMap, Rect, TaffyTree};
use obscura_dom::tree::NodeId;

/// Blink converts CSS lengths to LayoutUnits by truncation (13.9px is
/// 13.890625); the epsilon keeps float noise on exact values.
fn snap(value: f32) -> f32 {
    (value * 64.0 + 1e-3).floor() / 64.0
}

/// A key with a dense slot index (a Taffy node's slot in its slot map, a DOM
/// node's index): `Slots` keeps values in a vector by it.
trait SlotKey: Copy + PartialEq {
    fn slot(self) -> usize;
}

impl SlotKey for taffy::NodeId {
    fn slot(self) -> usize {
        // The slot map key's low half is the slot index.
        (u64::from(self) & 0xffff_ffff) as usize
    }
}

impl SlotKey for NodeId {
    fn slot(self) -> usize {
        self.index()
    }
}

/// A map from slot keys to values, by slot index (a key that reuses a slot
/// replaces the old key's value).
struct Slots<K, T> {
    entries: Vec<Option<(K, T)>>,
}

impl<K: SlotKey, T> Default for Slots<K, T> {
    fn default() -> Self {
        Self {
            entries: Vec::new(),
        }
    }
}

impl<K: SlotKey, T> Slots<K, T> {
    fn get(&self, key: &K) -> Option<&T> {
        match self.entries.get(key.slot()) {
            Some(Some((stored, value))) if stored == key => Some(value),
            _ => None,
        }
    }

    fn get_mut(&mut self, key: &K) -> Option<&mut T> {
        match self.entries.get_mut(key.slot()) {
            Some(Some((stored, value))) if stored == key => Some(value),
            _ => None,
        }
    }

    fn contains_key(&self, key: &K) -> bool {
        self.get(key).is_some()
    }

    fn insert(&mut self, key: K, value: T) -> Option<T> {
        let slot = key.slot();
        if slot >= self.entries.len() {
            self.entries.resize_with(slot + 1, || None);
        }
        match self.entries[slot].replace((key, value)) {
            Some((stored, old)) if stored == key => Some(old),
            _ => None,
        }
    }

    fn remove(&mut self, key: &K) -> Option<T> {
        let entry = self.entries.get_mut(key.slot())?;
        match entry {
            Some((stored, _)) if stored == key => entry.take().map(|(_, value)| value),
            _ => None,
        }
    }
}

#[derive(Clone, Copy)]
struct Frag {
    /// The parent's absolute origin, rounded and unrounded, the box was
    /// read at.
    origin: (f32, f32),
    origin_unrounded: (f32, f32),
    /// The box's absolute rounded rect, and its rounded location relative
    /// to the parent.
    rect: Rect,
    location: (f32, f32),
    /// Its unrounded location (relative to the parent) and size.
    location_unrounded: (f32, f32),
    size_unrounded: (f32, f32),
    dom: Option<NodeId>,
}

impl Frag {
    fn absolute_unrounded(&self) -> (f32, f32) {
        (
            self.origin_unrounded.0 + self.location_unrounded.0,
            self.origin_unrounded.1 + self.location_unrounded.1,
        )
    }
}

/// The per-element geometry a layout reads from its boxes (each element's
/// value is its last box's in tree order).
#[derive(Default)]
pub(crate) struct BoxGeometry {
    pub(crate) rects: HashMap<NodeId, Rect>,
    pub(crate) grid_overflow: HashMap<NodeId, Rect>,
    pub(crate) grid_tracks: HashMap<NodeId, (Vec<f32>, Vec<f32>)>,
    /// Each element's unrounded border box snapped to 1/64 px, and its
    /// size, where they are within a pixel of the rounded rect and differ
    /// from it (see `collect_fractional_rects` for the cell tolerance).
    pub(crate) fractional_rects: HashMap<NodeId, Rect>,
    pub(crate) fractional_sizes: HashMap<NodeId, (f32, f32)>,
}

/// What the previous layout read, by box.
pub(crate) struct Collected {
    /// The layout sequence number the boxes were read at.
    seq: u64,
    root: taffy::NodeId,
    initial_cb_x: f32,
    frags: Slots<taffy::NodeId, Frag>,
    children: Slots<taffy::NodeId, Vec<taffy::NodeId>>,
    /// The box each element's values come from.
    winners: Slots<NodeId, taffy::NodeId>,
    /// How many boxes each element has.
    box_counts: Slots<NodeId, u32>,
    pub(crate) geometry: BoxGeometry,
}

/// What a read did (for the timing line).
#[derive(Default, Debug)]
pub(crate) struct CollectStats {
    pub(crate) read: usize,
    pub(crate) moved: usize,
    pub(crate) dropped: usize,
    pub(crate) full: bool,
}

struct Reader<'a> {
    taffy: &'a TaffyTree<usize>,
    id_map: &'a HashMap<taffy::NodeId, NodeId>,
    cells: &'a dyn Fn(NodeId) -> bool,
    seq: u64,
    state: &'a mut Collected,
    stats: CollectStats,
    /// The incremental read cannot tell which box of an element comes last.
    conflict: bool,
    /// Elements whose box was dropped while it gave their values.
    orphans: Vec<NodeId>,
}

impl Collected {
    fn new(root: taffy::NodeId, initial_cb_x: f32) -> Self {
        Self {
            seq: 0,
            root,
            initial_cb_x,
            frags: Slots::default(),
            children: Slots::default(),
            winners: Slots::default(),
            box_counts: Slots::default(),
            geometry: BoxGeometry::default(),
        }
    }

    /// The absolute rounded rect `node` was read at, when it is in the tree.
    pub(crate) fn rect_of(&self, node: taffy::NodeId) -> Option<Rect> {
        self.frags.get(&node).map(|frag| frag.rect)
    }

    /// The absolute unrounded origin of `node`'s border box (the initial
    /// containing block's x included).
    pub(crate) fn unrounded_origin_of(&self, node: taffy::NodeId) -> Option<(f32, f32)> {
        self.frags.get(&node).map(Frag::absolute_unrounded)
    }
}

/// Read the box geometry of the tree under `root`, from `previous` where it
/// is still current. `cells` names the table cells (a wider tolerance for
/// their fractional rects).
pub(crate) fn collect(
    taffy: &mut TaffyTree<usize>,
    root: taffy::NodeId,
    initial_cb_x: f32,
    id_map: &HashMap<taffy::NodeId, NodeId>,
    cells: &dyn Fn(NodeId) -> bool,
    previous: Option<Collected>,
) -> (Collected, CollectStats) {
    let removed = taffy.take_removed();
    let incremental = previous
        .as_ref()
        .is_some_and(|state| state.initial_cb_x == initial_cb_x);
    if crate::prof::enabled() {
        eprintln!(
            "[timing] collect previous={} incremental={incremental}",
            previous.is_some()
        );
    }
    let mut state = match previous {
        Some(state) if incremental => state,
        _ => Collected::new(root, initial_cb_x),
    };
    let stats = if incremental {
        let seq = state.seq;
        let mut reader = Reader {
            taffy,
            id_map,
            cells,
            seq,
            state: &mut state,
            stats: CollectStats::default(),
            conflict: false,
            orphans: Vec::new(),
        };
        reader.state.root = root;
        for node in removed {
            reader.drop_frag(node);
        }
        reader.visit(root, (initial_cb_x, 0.0), (initial_cb_x, 0.0));
        reader.settle_orphans();
        if reader.conflict {
            if crate::prof::enabled() {
                eprintln!("[timing] collect conflict after {:?}", reader.stats);
            }
            None
        } else {
            Some(reader.stats)
        }
    } else {
        None
    };
    let stats = match stats {
        Some(stats) => stats,
        None => {
            state = Collected::new(root, initial_cb_x);
            let mut reader = Reader {
                taffy,
                id_map,
                cells,
                seq: 0,
                state: &mut state,
                stats: CollectStats {
                    full: true,
                    ..CollectStats::default()
                },
                conflict: false,
                orphans: Vec::new(),
            };
            reader.visit(root, (initial_cb_x, 0.0), (initial_cb_x, 0.0));
            reader.stats
        }
    };
    state.seq = taffy.layout_seq();
    taffy.advance_layout_seq();
    (state, stats)
}

impl Reader<'_> {
    fn visit(&mut self, node: taffy::NodeId, origin: (f32, f32), origin_unrounded: (f32, f32)) {
        let full = self.stats.full;
        let (own, subtree) = if full {
            (true, true)
        } else {
            self.taffy.layout_changed_since(node, self.seq)
        };
        if let Some(frag) = self.state.frags.get(&node).copied() {
            if !subtree {
                if frag.origin != origin || frag.origin_unrounded != origin_unrounded {
                    self.shift(node, origin, origin_unrounded);
                }
                return;
            }
        }
        self.stats.read += 1;
        let Ok(layout) = self.taffy.layout(node) else {
            return;
        };
        let unrounded = *self.taffy.unrounded_layout(node);
        let rect = Rect {
            x: origin.0 + layout.location.x,
            y: origin.1 + layout.location.y,
            width: layout.size.width,
            height: layout.size.height,
        };
        let frag = Frag {
            origin,
            origin_unrounded,
            rect,
            location: (layout.location.x, layout.location.y),
            location_unrounded: (unrounded.location.x, unrounded.location.y),
            size_unrounded: (unrounded.size.width, unrounded.size.height),
            dom: self.id_map.get(&node).copied(),
        };
        if self.state.frags.insert(node, frag).is_none() {
            if let Some(dom) = frag.dom {
                let count = self.state.box_counts.get(&dom).copied().unwrap_or(0);
                self.state.box_counts.insert(dom, count + 1);
            }
        }
        if let Some(dom) = frag.dom {
            if self.wins(dom, node) {
                self.write(dom, node, &frag);
                self.write_grid(dom, node, layout);
            }
        }
        let kids = self.taffy.child_slice(node);
        if full || own || !self.state.children.contains_key(&node) {
            let same = self
                .state
                .children
                .get(&node)
                .is_some_and(|old| old.as_slice() == kids);
            if !same {
                if let Some(old) = self.state.children.insert(node, kids.to_vec()) {
                    for child in old {
                        if !kids.contains(&child) {
                            self.detached(child);
                        }
                    }
                }
            }
        }
        let next = (rect.x, rect.y);
        let next_unrounded = frag.absolute_unrounded();
        for &child in kids {
            self.visit(child, next, next_unrounded);
        }
    }

    /// Whether `node`'s values become `dom`'s: it is the element's only
    /// box, or the one after the element's other box in tree order (nested
    /// boxes: the inner one).
    fn wins(&mut self, dom: NodeId, node: taffy::NodeId) -> bool {
        if self.stats.full {
            self.state.winners.insert(dom, node);
            return true;
        }
        match self.state.winners.get(&dom).copied() {
            None => {
                self.state.winners.insert(dom, node);
                true
            }
            Some(winner) if winner == node => true,
            Some(winner) if !self.taffy.contains(winner) => {
                self.state.winners.insert(dom, node);
                true
            }
            Some(winner) => {
                if self.is_ancestor(winner, node) {
                    self.state.winners.insert(dom, node);
                    true
                } else if self.is_ancestor(node, winner) {
                    false
                } else {
                    self.conflict = true;
                    false
                }
            }
        }
    }

    fn is_ancestor(&self, ancestor: taffy::NodeId, node: taffy::NodeId) -> bool {
        let mut current = self.taffy.parent(node);
        while let Some(id) = current {
            if id == ancestor {
                return true;
            }
            current = self.taffy.parent(id);
        }
        false
    }

    fn write(&mut self, dom: NodeId, _node: taffy::NodeId, frag: &Frag) {
        let geometry = &mut self.state.geometry;
        geometry.rects.insert(dom, frag.rect);
        let (x, y) = frag.absolute_unrounded();
        let fractional = Rect {
            x: snap(x),
            y: snap(y),
            width: snap(frag.size_unrounded.0),
            height: snap(frag.size_unrounded.1),
        };
        let rounded = frag.rect;
        let tolerance = if (self.cells)(dom) { 2.0 } else { 1.0 };
        let close = (fractional.x - rounded.x).abs() < tolerance
            && (fractional.y - rounded.y).abs() < tolerance
            && (fractional.width - rounded.width).abs() < tolerance
            && (fractional.height - rounded.height).abs() < tolerance;
        if close && fractional != rounded {
            geometry.fractional_rects.insert(dom, fractional);
        } else {
            geometry.fractional_rects.remove(&dom);
        }
        let (width, height) = (fractional.width, fractional.height);
        let close = (width - rounded.width).abs() < 1.0 && (height - rounded.height).abs() < 1.0;
        if close && (width != rounded.width || height != rounded.height) {
            geometry.fractional_sizes.insert(dom, (width, height));
        } else {
            geometry.fractional_sizes.remove(&dom);
        }
    }

    fn write_grid(&mut self, dom: NodeId, node: taffy::NodeId, layout: &taffy::Layout) {
        let geometry = &mut self.state.geometry;
        if let taffy::tree::DetailedLayoutInfo::Grid(info) = self.taffy.detailed_layout_info(node) {
            geometry
                .grid_tracks
                .insert(dom, (info.columns.sizes.clone(), info.rows.sizes.clone()));
            let right = info.columns.end_offset;
            let bottom = info.rows.end_offset;
            let rect = geometry.rects.get(&dom).copied().unwrap_or_default();
            if right + layout.padding.right > layout.size.width - layout.border.right
                || bottom + layout.padding.bottom > layout.size.height - layout.border.bottom
            {
                geometry.grid_overflow.insert(
                    dom,
                    Rect {
                        x: rect.x,
                        y: rect.y,
                        width: right,
                        height: bottom,
                    },
                );
            } else {
                geometry.grid_overflow.remove(&dom);
            }
        } else {
            geometry.grid_tracks.remove(&dom);
            geometry.grid_overflow.remove(&dom);
        }
    }

    /// Move the subtree of `node`, unchanged since it was read, to its
    /// parent's new origin: each box's absolute values are derived again from
    /// its kept relative ones, top down, exactly as a read derives them.
    fn shift(&mut self, node: taffy::NodeId, origin: (f32, f32), origin_unrounded: (f32, f32)) {
        let mut stack = vec![(node, origin, origin_unrounded)];
        while let Some((id, origin, origin_unrounded)) = stack.pop() {
            let Some(frag) = self.state.frags.get_mut(&id) else {
                continue;
            };
            self.stats.moved += 1;
            frag.origin = origin;
            frag.origin_unrounded = origin_unrounded;
            frag.rect.x = origin.0 + frag.location.0;
            frag.rect.y = origin.1 + frag.location.1;
            let frag = *frag;
            if let Some(dom) = frag.dom {
                if self.state.winners.get(&dom) == Some(&id) {
                    self.write(dom, id, &frag);
                    if let Some(overflow) = self.state.geometry.grid_overflow.get_mut(&dom) {
                        overflow.x = frag.rect.x;
                        overflow.y = frag.rect.y;
                    }
                }
            }
            if let Some(kids) = self.state.children.get(&id) {
                let next = (frag.rect.x, frag.rect.y);
                let next_unrounded = frag.absolute_unrounded();
                stack.extend(kids.iter().map(|&kid| (kid, next, next_unrounded)));
            }
        }
    }

    /// `node` left its parent's child list: if it is not in the tree any
    /// more, forget its subtree.
    fn detached(&mut self, node: taffy::NodeId) {
        if self.taffy.contains(node) && self.taffy.parent(node).is_some() {
            // Moved under another parent, read there.
            return;
        }
        let mut stack = vec![node];
        while let Some(id) = stack.pop() {
            if id != node && self.taffy.contains(id) && self.taffy.parent(id).is_some() {
                continue;
            }
            if let Some(kids) = self.state.children.get(&id) {
                stack.extend(kids.iter().copied());
            }
            self.drop_frag(id);
        }
    }

    /// Forget what was read of `node` (removed from the tree, or detached).
    fn drop_frag(&mut self, node: taffy::NodeId) {
        self.state.children.remove(&node);
        let Some(frag) = self.state.frags.remove(&node) else {
            return;
        };
        self.stats.dropped += 1;
        let Some(dom) = frag.dom else {
            return;
        };
        if let Some(count) = self.state.box_counts.get_mut(&dom) {
            *count = count.saturating_sub(1);
            if *count == 0 {
                self.state.box_counts.remove(&dom);
            }
        }
        if self.state.winners.get(&dom) == Some(&node) {
            self.state.winners.remove(&dom);
            self.orphans.push(dom);
        }
    }

    /// The elements whose giving box was dropped and no box read since took
    /// over: without another box they have no values; with one, only a full
    /// read can tell which of its boxes comes last.
    fn settle_orphans(&mut self) {
        for dom in std::mem::take(&mut self.orphans) {
            if self.state.winners.contains_key(&dom) {
                continue;
            }
            if self.state.box_counts.contains_key(&dom) {
                self.conflict = true;
                return;
            }
            let geometry = &mut self.state.geometry;
            geometry.rects.remove(&dom);
            geometry.grid_overflow.remove(&dom);
            geometry.grid_tracks.remove(&dom);
            geometry.fractional_rects.remove(&dom);
            geometry.fractional_sizes.remove(&dom);
        }
    }
}
