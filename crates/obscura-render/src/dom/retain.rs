//! The box tree kept from one layout to the next.
//!
//! A layout keeps its Taffy tree, the IFCs and measured leaves its boxes
//! name, and what `build` recorded per element (`BuildRecord`). The next
//! layout of the same document first undoes what the layout passes changed
//! after the build (`TaffyTree::rollback_journal`), so the tree is again the
//! one the build made, then builds again only the elements whose box can
//! differ: an element whose style, attributes, children or text changed, and
//! every element above one. Every other element keeps its subtree of boxes as
//! it is, with its cached layouts (Blink's LayoutObject tree, Servo's box
//! tree). The side tables `build` fills in build order (IFC nodes, generated
//! boxes, ...) are filled again in the same order: a kept element copies the
//! stretch its last build wrote.

use obscura_dom::tree::{DomTree, NodeId};
use taffy::TaffyTree;

use super::{rendered_parent, GeneratedBoxBuild, IfcRegistry, MulticolBuild};
use crate::HashMap;

/// How many build-order side tables `IfcRegistry` has.
const TABLES: usize = 5;

/// The lengths of the build-order side tables.
fn table_lens(items: &IfcRegistry) -> [usize; TABLES] {
    [
        items.ifc_nodes.len(),
        items.generated.len(),
        items.transparent_wrappers.len(),
        items.table_part_boxes.len(),
        items.multicol.len(),
    ]
}

fn sub(a: [usize; TABLES], b: [usize; TABLES]) -> [usize; TABLES] {
    std::array::from_fn(|i| a[i] - b[i])
}

fn add(a: [usize; TABLES], b: [usize; TABLES]) -> [usize; TABLES] {
    std::array::from_fn(|i| a[i] + b[i])
}

/// The build-order side tables of the layout a retained tree comes from.
#[derive(Default)]
pub(super) struct BuildTables {
    ifc_nodes: Vec<usize>,
    generated: Vec<GeneratedBoxBuild>,
    transparent_wrappers: Vec<NodeId>,
    table_part_boxes: Vec<(NodeId, Vec<NodeId>, Option<bool>)>,
    multicol: Vec<MulticolBuild>,
}

impl BuildTables {
    fn take(items: &mut IfcRegistry) -> Self {
        Self {
            ifc_nodes: std::mem::take(&mut items.ifc_nodes),
            generated: std::mem::take(&mut items.generated),
            transparent_wrappers: std::mem::take(&mut items.transparent_wrappers),
            table_part_boxes: std::mem::take(&mut items.table_part_boxes),
            multicol: std::mem::take(&mut items.multicol),
        }
    }

    /// Append the stretch `[start, start + len)` of each table to `items`.
    fn copy_into(&self, items: &mut IfcRegistry, start: [usize; TABLES], len: [usize; TABLES]) {
        let range = |i: usize| start[i]..start[i] + len[i];
        items.ifc_nodes.extend_from_slice(&self.ifc_nodes[range(0)]);
        items.generated.extend_from_slice(&self.generated[range(1)]);
        items
            .transparent_wrappers
            .extend_from_slice(&self.transparent_wrappers[range(2)]);
        items
            .table_part_boxes
            .extend_from_slice(&self.table_part_boxes[range(3)]);
        items.multicol.extend_from_slice(&self.multicol[range(4)]);
    }

    fn holds(&self, start: [usize; TABLES], len: [usize; TABLES]) -> bool {
        let lens = [
            self.ifc_nodes.len(),
            self.generated.len(),
            self.transparent_wrappers.len(),
            self.table_part_boxes.len(),
            self.multicol.len(),
        ];
        (0..TABLES).all(|i| start[i] + len[i] <= lens[i])
    }
}

/// What one `build` of an element made.
pub(super) struct BuildRecord {
    /// The box it returned.
    node: Option<taffy::NodeId>,
    /// The element whose `build` called this one (`None`: the root).
    builder: Option<NodeId>,
    /// Where its stretch of each build-order table starts, from the start
    /// of its builder's stretch (from 0 for the root).
    rel: [usize; TABLES],
    /// The length of its stretch of each table (its nested builds' too).
    len: [usize; TABLES],
    /// The boxes it created itself (not those of nested builds).
    own_nodes: Vec<taffy::NodeId>,
    /// The IFCs it created itself.
    own_ifcs: Vec<usize>,
    /// The elements its nested builds were for, in order.
    children: Vec<NodeId>,
    /// Whether its box can be kept: table parts are placed by their table.
    reusable: bool,
}

/// One `build` in progress.
struct Frame {
    dom: NodeId,
    /// Where this element's stretch started in the previous layout's
    /// tables, when known: its kept children copy from there.
    old_abs: Option<[usize; TABLES]>,
    new_start: [usize; TABLES],
    created_start: usize,
    ifc_start: usize,
    nested_created: Vec<(usize, usize)>,
    nested_ifcs: Vec<(usize, usize)>,
    children: Vec<NodeId>,
}

/// Elements whose style has a property a few whole-tree passes look for,
/// kept up to date from the styles each layout writes, so those passes visit
/// these elements instead of every style. An entry can be stale (the
/// element's style was dropped with its subtree): users check the style.
#[derive(Default)]
pub(crate) struct StyleIndex {
    /// Up to date with the styles of the layout the index was kept from.
    valid: bool,
    /// Percentage or `calc()` padding, own or on a `::before`/`::after`.
    pub(super) percent_padding: crate::HashSet<NodeId>,
    /// A `container-type` or `container-name`.
    pub(crate) containers: crate::HashSet<NodeId>,
    /// `position: absolute` (or fixed).
    pub(super) absolute: crate::HashSet<NodeId>,
    /// The candidates of a few post-layout passes, by `IndexKind`.
    kinds: [crate::HashSet<NodeId>; IndexKind::COUNT],
}

/// Styles some post-layout passes visit the boxes of (see
/// `BuildReuse::indexed_boxes`).
#[derive(Clone, Copy)]
pub(crate) enum IndexKind {
    /// `super::is_fit_content_candidate`.
    FitContent,
    /// `super::inline_percentage_height`.
    PercentHeight,
    /// An `auto` left or right margin.
    AutoMargin,
    /// `super::is_auto_height_column_flex`.
    ColumnFlex,
    /// `super::may_hold_full_span_column_subgrids`.
    Subgrid,
    /// A `::before`/`::after` with `position: absolute` and percentage
    /// padding.
    PositionedPseudoPadding,
}

impl IndexKind {
    const COUNT: usize = 6;
    const ALL: [Self; Self::COUNT] = [
        Self::FitContent,
        Self::PercentHeight,
        Self::AutoMargin,
        Self::ColumnFlex,
        Self::Subgrid,
        Self::PositionedPseudoPadding,
    ];

    pub(crate) fn matches(self, style: &crate::LayoutStyle) -> bool {
        match self {
            Self::FitContent => super::is_fit_content_candidate(style),
            Self::PercentHeight => super::inline_percentage_height(style).is_some(),
            Self::AutoMargin => style.margin_auto[1] || style.margin_auto[3],
            Self::ColumnFlex => super::is_auto_height_column_flex(style),
            Self::Subgrid => super::may_hold_full_span_column_subgrids(style),
            Self::PositionedPseudoPadding => [
                style.before_pseudo.as_deref(),
                style.after_pseudo.as_deref(),
            ]
            .into_iter()
            .flatten()
            .any(|pseudo| {
                pseudo.position == Some(taffy::Position::Absolute)
                    && pseudo.padding_percent.iter().any(Option::is_some)
            }),
        }
    }
}

impl StyleIndex {
    pub(super) fn has_percent_padding(style: &crate::LayoutStyle) -> bool {
        style.padding_percent.iter().any(Option::is_some)
            || style.padding_calc.iter().any(Option::is_some)
            || style
                .before_pseudo
                .as_deref()
                .is_some_and(|pseudo| pseudo.padding_percent.iter().any(Option::is_some))
            || style
                .after_pseudo
                .as_deref()
                .is_some_and(|pseudo| pseudo.padding_percent.iter().any(Option::is_some))
    }

    pub(crate) fn is_container(style: &crate::LayoutStyle) -> bool {
        style.container_type != crate::ContainerType::Normal || !style.container_names.is_empty()
    }

    fn set(&mut self, id: NodeId, style: Option<&crate::LayoutStyle>) {
        let toggle = |set: &mut crate::HashSet<NodeId>, on: bool| {
            if on {
                set.insert(id);
            } else {
                set.remove(&id);
            }
        };
        toggle(
            &mut self.percent_padding,
            style.is_some_and(Self::has_percent_padding),
        );
        toggle(&mut self.containers, style.is_some_and(Self::is_container));
        toggle(
            &mut self.absolute,
            style.is_some_and(|style| matches!(style.position, Some(taffy::Position::Absolute))),
        );
        for kind in IndexKind::ALL {
            toggle(
                &mut self.kinds[kind as usize],
                style.is_some_and(|style| kind.matches(style)),
            );
        }
    }

    /// Bring the index up to date: the styles of `ids` were written, or,
    /// when it is not valid, every style may have changed.
    pub(super) fn update(&mut self, ids: &[NodeId], styles: &crate::StyleTable) {
        if !self.valid {
            *self = Self {
                valid: true,
                ..Self::default()
            };
            for (&id, style) in styles {
                self.set(id, Some(style));
            }
            return;
        }
        for &id in ids {
            self.set(id, styles.get(&id));
        }
    }
}

/// The slots `defer_cyclic_flex_inline_sizes` rewrote before a build, with
/// the value written and whether the source was a plain percentage: those
/// writes are not noted by the style map (the layout undoes them), so a
/// retained build compares them with the previous build's instead.
pub(super) type Deferrals = HashMap<(NodeId, usize), (crate::Dimension, bool)>;

/// Which elements must be built again.
#[derive(Default)]
pub(crate) struct BuildDamage {
    /// Elements whose own box can differ (style, attributes, children, text).
    pub(crate) nodes: Vec<NodeId>,
    /// Elements whose attributes changed: what their children inherit as
    /// context changed as well.
    pub(crate) context: Vec<NodeId>,
    /// Roots of inserted subtrees: every node in them is new.
    pub(crate) subtrees: Vec<NodeId>,
}

impl BuildDamage {
    /// The elements `mutations` change the boxes of; `None` when one of
    /// them can change any box (a resource or a style sheet).
    pub(crate) fn of(mutations: &[super::RetainedStyleMutation]) -> Option<Self> {
        use super::{RetainedStyleMutation as M, TreeStyleMutation as T};
        let mut damage = Self::default();
        for mutation in mutations {
            match mutation {
                M::Tree(T::Insert {
                    node,
                    old_parent,
                    new_parent,
                }) => {
                    damage.subtrees.push(*node);
                    damage.nodes.push(*new_parent);
                    damage.nodes.extend(*old_parent);
                }
                M::Tree(T::Remove { old_parent, .. }) => damage.nodes.push(*old_parent),
                M::Tree(T::Text { node, parent }) => {
                    damage.nodes.push(*node);
                    damage.nodes.extend(*parent);
                }
                M::Attribute(attribute) => damage.context.push(attribute.node),
                M::Animation { .. } | M::WaapiAnimation { .. } => {}
                M::Resource | M::Stylesheet => return None,
            }
        }
        Some(damage)
    }
}

/// The state `build` keeps while it builds into a retained tree (in
/// `IfcRegistry::reuse` for the duration of the build).
pub(super) struct BuildReuse {
    records: HashMap<NodeId, BuildRecord>,
    old: BuildTables,
    /// The previous layout's records and tables may be reused.
    reuse: bool,
    /// By node index: the element's style changed (what its children's
    /// boxes read of their parent).
    style_dirty: Vec<bool>,
    /// By node index: the element or a rendered descendant must be built.
    subtree_dirty: Vec<bool>,
    frames: Vec<Frame>,
    /// By node index: built or kept in this layout.
    visited: Vec<bool>,
    /// Elements an earlier build built that may be gone now.
    gc: Vec<NodeId>,
    by_dom: HashMap<NodeId, taffy::NodeId>,
    /// Every box of each element (`id_map` inverted).
    boxes: HashMap<NodeId, Vec<taffy::NodeId>>,
    /// The deferred flex percentages the build saw (see `Deferrals`).
    deferrals: Deferrals,
    /// Elements whose style a pass wrote after the previous build, with
    /// their styles at that build (`None`: unknown, all count as changed).
    pending: Vec<NodeId>,
    pending_before: Option<super::stylemap::BeforeWrites>,
    /// Elements whose children or text changed (see `BuildDamage::nodes`).
    damage_nodes: Vec<NodeId>,
    /// What deferred flex percentages the build saw decided (see
    /// `super::DeferralMemo`).
    pub(super) deferral_memo: super::DeferralMemo,
    /// The elements with properties some passes look for.
    pub(super) index: StyleIndex,
    /// The box geometry the previous layout read (see `super::collect`).
    pub(super) collected: Option<super::collect::Collected>,
    /// The static-position probes, by element (see
    /// `super::ensure_static_probes`).
    pub(super) static_probes: HashMap<NodeId, taffy::NodeId>,
    pub(super) kept: usize,
    pub(super) built: usize,
    /// Why boxes were not kept (debug counts).
    misses: [usize; 8],
}

impl BuildReuse {
    fn new(
        tree: &DomTree,
        records: HashMap<NodeId, BuildRecord>,
        old: BuildTables,
        by_dom: HashMap<NodeId, taffy::NodeId>,
        reuse: bool,
    ) -> Self {
        let slots = tree.node_slot_count();
        Self {
            records,
            old,
            reuse,
            style_dirty: vec![false; slots],
            subtree_dirty: vec![false; slots],
            frames: Vec::new(),
            visited: vec![false; slots],
            gc: Vec::new(),
            by_dom,
            boxes: HashMap::default(),
            deferrals: Deferrals::default(),
            pending: Vec::new(),
            pending_before: None,
            damage_nodes: Vec::new(),
            deferral_memo: super::DeferralMemo::default(),
            index: StyleIndex::default(),
            collected: None,
            static_probes: HashMap::default(),
            kept: 0,
            built: 0,
            misses: [0; 8],
        }
    }

    fn mark_subtree(&mut self, tree: &DomTree, id: NodeId) {
        let mut current = Some(id);
        while let Some(node) = current {
            match self.subtree_dirty.get_mut(node.index()) {
                Some(slot) if !*slot => *slot = true,
                _ => break,
            }
            current = rendered_parent(tree, node);
        }
    }

    /// `id`'s style changed.
    pub(super) fn style_changed(&mut self, tree: &DomTree, id: NodeId) {
        if let Some(slot) = self.style_dirty.get_mut(id.index()) {
            *slot = true;
        }
        self.mark_subtree(tree, id);
    }

    /// `id`'s box must be built again (its children or text changed).
    pub(super) fn box_changed(&mut self, tree: &DomTree, id: NodeId) {
        self.mark_subtree(tree, id);
    }

    /// By node index: the node, an ancestor of it or one of its children had
    /// its style written (`written`, or after the previous build) or its
    /// children or text changed; `None` when the previous layout's decisions
    /// cannot be reused. For `super::defer_cyclic_flex_inline_sizes`.
    pub(super) fn deferral_affected(
        &self,
        tree: &DomTree,
        styles: &super::StyleMap,
    ) -> Option<(Vec<bool>, Vec<NodeId>)> {
        if !self.reuse {
            return None;
        }
        // Only writes that changed a style count (see `mark_style_changes`).
        let pending_before = self.pending_before.as_ref()?;
        let mut written: Vec<NodeId> = styles
            .changed_nodes()?
            .iter()
            .chain(&self.pending)
            .copied()
            .collect();
        written.sort_unstable_by_key(|id| id.index());
        written.dedup();
        written.retain(|id| match pending_before.get(id) {
            Some(old) => old.as_deref() != styles.get(id),
            None => !styles.is_as_before(id),
        });
        let mut affected = vec![false; tree.node_slot_count()];
        // Subtrees already walked.
        let mut walked = vec![false; tree.node_slot_count()];
        let mut stack = Vec::new();
        for &id in &written {
            if let Some(parent) = rendered_parent(tree, id) {
                if let Some(slot) = affected.get_mut(parent.index()) {
                    *slot = true;
                }
            }
            stack.push(id);
            while let Some(node) = stack.pop() {
                match walked.get_mut(node.index()) {
                    Some(slot) if !*slot => *slot = true,
                    _ => continue,
                }
                if let Some(slot) = affected.get_mut(node.index()) {
                    *slot = true;
                }
                stack.extend(super::rendered_children_ref(tree, node).iter().copied());
            }
        }
        for &id in &self.damage_nodes {
            if let Some(slot) = affected.get_mut(id.index()) {
                *slot = true;
            }
        }
        Some((affected, written))
    }

    /// Whether `index` is up to date with this layout's styles.
    pub(super) fn index_valid(&self) -> bool {
        self.index.valid
    }

    /// Bring the index up to date with the styles written so far.
    pub(super) fn refresh_index(&mut self, styles: &super::StyleMap) {
        if !self.index.valid {
            return;
        }
        match styles.changed_nodes() {
            Some(written) => {
                let written = written.to_vec();
                self.index.update(&written, styles);
            }
            None => self.index.valid = false,
        }
    }

    /// The boxes of the elements whose style is of `kind` (each element's
    /// every box), when the index is up to date.
    pub(super) fn indexed_boxes(
        &self,
        kind: IndexKind,
        styles: &crate::StyleTable,
    ) -> Option<Vec<(taffy::NodeId, NodeId)>> {
        if !self.index.valid {
            return None;
        }
        Some(
            self.index.kinds[kind as usize]
                .iter()
                .filter(|id| styles.get(id).is_some_and(|style| kind.matches(style)))
                .flat_map(|&id| {
                    self.boxes
                        .get(&id)
                        .into_iter()
                        .flatten()
                        .map(move |&node| (node, id))
                })
                .collect(),
        )
    }

    /// Every box of each of `elements`.
    pub(super) fn boxes_of(
        &self,
        elements: impl IntoIterator<Item = NodeId>,
    ) -> Vec<(taffy::NodeId, NodeId)> {
        elements
            .into_iter()
            .flat_map(|id| {
                self.boxes
                    .get(&id)
                    .into_iter()
                    .flatten()
                    .map(move |&node| (node, id))
            })
            .collect()
    }

    /// The elements whose style is of `kind`, when the index is up to date.
    pub(super) fn indexed_elements(
        &self,
        kind: IndexKind,
        styles: &crate::StyleTable,
    ) -> Option<Vec<NodeId>> {
        self.index.valid.then(|| {
            self.index.kinds[kind as usize]
                .iter()
                .copied()
                .filter(|id| styles.get(id).is_some_and(|style| kind.matches(style)))
                .collect()
        })
    }

    /// Whether some element's style is of `kind`, when known.
    pub(super) fn any_indexed(&self, kind: IndexKind, styles: &crate::StyleTable) -> Option<bool> {
        self.index.valid.then(|| {
            self.index.kinds[kind as usize]
                .iter()
                .any(|id| styles.get(id).is_some_and(|style| kind.matches(style)))
        })
    }

    fn style_dirty(&self, id: NodeId) -> bool {
        self.style_dirty.get(id.index()).copied().unwrap_or(true)
    }

    /// The box of `id` from the previous layout, when nothing it was built
    /// from changed; copies its stretch of the build-order tables.
    fn try_keep(
        &mut self,
        tree: &DomTree,
        id: NodeId,
        styles: &crate::StyleTable,
        taffy_tree: &TaffyTree<usize>,
        items: &mut IfcRegistry,
    ) -> Option<taffy::NodeId> {
        if !self.reuse {
            return None;
        }
        if self.subtree_dirty.get(id.index()).copied().unwrap_or(true)
            || self.visited.get(id.index()).copied().unwrap_or(true)
        {
            self.misses[0] += 1;
            return None;
        }
        let builder = self.frames.last().map(|frame| frame.dom);
        let builder_old = match self.frames.last() {
            Some(frame) => match frame.old_abs {
                Some(abs) => abs,
                None => {
                    self.misses[1] += 1;
                    return None;
                }
            },
            None => [0; TABLES],
        };
        let Some(record) = self.records.get(&id) else {
            self.misses[2] += 1;
            return None;
        };
        let Some(node) = record.node else {
            self.misses[3] += 1;
            return None;
        };
        if !record.reusable || record.builder != builder || taffy_tree.style(node).is_err() {
            self.misses[if !record.reusable {
                4
            } else if record.builder != builder {
                5
            } else {
                6
            }] += 1;
            return None;
        }
        // What the box reads of the elements above it: the nearest one
        // with a box, through `display: contents` ones.
        let mut parent = rendered_parent(tree, id);
        while let Some(p) = parent {
            if self.style_dirty(p) {
                self.misses[7] += 1;
                return None;
            }
            if !styles.get(&p).is_some_and(|style| style.display_contents) {
                break;
            }
            parent = rendered_parent(tree, p);
        }
        let old_abs = add(builder_old, record.rel);
        if !self.old.holds(old_abs, record.len) {
            return None;
        }
        let start = table_lens(items);
        self.old.copy_into(items, old_abs, record.len);
        let builder_new = self
            .frames
            .last()
            .map_or([0; TABLES], |frame| frame.new_start);
        let rel = sub(start, builder_new);
        if let Some(record) = self.records.get_mut(&id) {
            record.rel = rel;
        }
        if let Some(frame) = self.frames.last_mut() {
            frame.children.push(id);
        }
        if let Some(slot) = self.visited.get_mut(id.index()) {
            *slot = true;
        }
        self.kept += 1;
        Some(node)
    }

    /// Start building `id` again: drop what its previous build made itself.
    #[allow(clippy::too_many_arguments)]
    fn begin(
        &mut self,
        id: NodeId,
        taffy_tree: &mut TaffyTree<usize>,
        id_map: &mut HashMap<taffy::NodeId, NodeId>,
        items: &mut IfcRegistry,
    ) {
        let builder = self.frames.last().map(|frame| frame.dom);
        let builder_old = match self.frames.last() {
            Some(frame) => frame.old_abs,
            None => Some([0; TABLES]),
        };
        let mut old_abs = None;
        if let Some(record) = self.records.remove(&id) {
            if self.reuse && record.builder == builder {
                old_abs = builder_old.map(|base| add(base, record.rel));
            }
            self.release(&record, taffy_tree, id_map, items);
            self.gc.extend(record.children.iter().copied());
        }
        if let Some(slot) = self.visited.get_mut(id.index()) {
            *slot = true;
        }
        self.frames.push(Frame {
            dom: id,
            old_abs,
            new_start: table_lens(items),
            created_start: taffy_tree.created_nodes().len(),
            ifc_start: items.ifc.len(),
            nested_created: Vec::new(),
            nested_ifcs: Vec::new(),
            children: Vec::new(),
        });
    }

    /// `id`'s build returned `node`.
    fn end(
        &mut self,
        id: NodeId,
        node: Option<taffy::NodeId>,
        reusable: bool,
        taffy_tree: &TaffyTree<usize>,
        id_map: &HashMap<taffy::NodeId, NodeId>,
        items: &IfcRegistry,
    ) {
        let Some(frame) = self.frames.pop() else {
            return;
        };
        self.built += 1;
        let created = taffy_tree.created_nodes();
        let created_end = created.len();
        let ifc_end = items.ifc.len();
        let own_nodes = own_range(frame.created_start, created_end, &frame.nested_created)
            .map(|index| created[index])
            .collect::<Vec<_>>();
        let own_ifcs = own_range(frame.ifc_start, ifc_end, &frame.nested_ifcs).collect();
        for &own in &own_nodes {
            if let Some(&dom) = id_map.get(&own) {
                self.by_dom.insert(dom, own);
                self.boxes.entry(dom).or_default().push(own);
            }
        }
        let builder_new = self
            .frames
            .last()
            .map_or([0; TABLES], |parent| parent.new_start);
        if let Some(parent) = self.frames.last_mut() {
            parent
                .nested_created
                .push((frame.created_start, created_end));
            parent.nested_ifcs.push((frame.ifc_start, ifc_end));
            parent.children.push(id);
        }
        self.records.insert(
            id,
            BuildRecord {
                node,
                builder: self.frames.last().map(|parent| parent.dom),
                rel: sub(frame.new_start, builder_new),
                len: sub(table_lens(items), frame.new_start),
                own_nodes,
                own_ifcs,
                children: frame.children,
                reusable: reusable && node.is_some(),
            },
        );
    }

    /// Drop the boxes and IFCs a build made itself, and their side-table
    /// entries.
    fn release(
        &mut self,
        record: &BuildRecord,
        taffy_tree: &mut TaffyTree<usize>,
        id_map: &mut HashMap<taffy::NodeId, NodeId>,
        items: &mut IfcRegistry,
    ) {
        for &node in &record.own_nodes {
            if taffy_tree.style(node).is_err() {
                continue;
            }
            let _ = taffy_tree.remove(node);
            if let Some(dom) = id_map.remove(&node) {
                if self.by_dom.get(&dom) == Some(&node) {
                    self.by_dom.remove(&dom);
                }
                if let Some(boxes) = self.boxes.get_mut(&dom) {
                    boxes.retain(|&other| other != node);
                    if boxes.is_empty() {
                        self.boxes.remove(&dom);
                    }
                }
            }
            items.table_cols.remove(&node);
            items.fixed_table_cols.remove(&node);
            items.table_rows.remove(&node);
            items.table_captions.remove(&node);
            items.table_columns.remove(&node);
            items.anonymous_tables.remove(&node);
        }
        for &index in &record.own_ifcs {
            items.ifc.release(index);
        }
    }

    /// After the build: drop what earlier builds made for elements no
    /// build reached this time.
    fn collect_garbage(
        &mut self,
        taffy_tree: &mut TaffyTree<usize>,
        id_map: &mut HashMap<taffy::NodeId, NodeId>,
        items: &mut IfcRegistry,
    ) {
        let mut stack = std::mem::take(&mut self.gc);
        while let Some(id) = stack.pop() {
            if self.visited.get(id.index()).copied().unwrap_or(false) {
                continue;
            }
            let Some(record) = self.records.remove(&id) else {
                continue;
            };
            self.release(&record, taffy_tree, id_map, items);
            stack.extend(record.children.iter().copied());
        }
    }
}

/// The indices `[start, end)` outside the nested ranges (which are ordered
/// and disjoint).
fn own_range(
    start: usize,
    end: usize,
    nested: &[(usize, usize)],
) -> impl Iterator<Item = usize> + '_ {
    let mut cursor = start;
    let mut ranges = Vec::with_capacity(nested.len() + 1);
    for &(a, b) in nested {
        if a > cursor {
            ranges.push(cursor..a);
        }
        cursor = cursor.max(b);
    }
    if end > cursor {
        ranges.push(cursor..end);
    }
    ranges.into_iter().flatten()
}

/// Whether the box `build` makes for an element with `style` can be kept
/// while its builder builds again: a table's rows, cells and captions are
/// placed by the table's own build.
pub(super) fn box_is_reusable(style: &crate::LayoutStyle) -> bool {
    style.table_part.is_none() && !style.is_table_cell_box
}

/// `build`, keeping the previous layout's box of `id` when it can.
pub(super) fn build_reusing(
    tree: &DomTree,
    id: NodeId,
    taffy_tree: &mut TaffyTree<usize>,
    id_map: &mut HashMap<taffy::NodeId, NodeId>,
    engine: &mut crate::inline::TextEngine,
    ifc_items: &mut IfcRegistry,
    styles: &crate::StyleTable,
    build: impl FnOnce(
        &DomTree,
        NodeId,
        &mut TaffyTree<usize>,
        &mut HashMap<taffy::NodeId, NodeId>,
        &mut crate::inline::TextEngine,
        &mut IfcRegistry,
        &crate::StyleTable,
    ) -> Option<taffy::NodeId>,
) -> Option<taffy::NodeId> {
    let Some(mut reuse) = ifc_items.reuse.take() else {
        return build(tree, id, taffy_tree, id_map, engine, ifc_items, styles);
    };
    if let Some(node) = reuse.try_keep(tree, id, styles, taffy_tree, ifc_items) {
        ifc_items.reuse = Some(reuse);
        return Some(node);
    }
    reuse.begin(id, taffy_tree, id_map, ifc_items);
    ifc_items.reuse = Some(reuse);
    let node = build(tree, id, taffy_tree, id_map, engine, ifc_items, styles);
    let mut reuse = ifc_items.reuse.take()?;
    let reusable = styles.get(&id).is_some_and(box_is_reusable);
    reuse.end(id, node, reusable, taffy_tree, id_map, ifc_items);
    ifc_items.reuse = Some(reuse);
    node
}

/// Everything a layout keeps for the next layout of the same document to
/// build into (see the module docs).
pub(crate) struct RetainedLayoutTree {
    pub(super) taffy: TaffyTree<usize>,
    pub(super) root: taffy::NodeId,
    pub(super) root_dom: NodeId,
    pub(super) id_map: HashMap<taffy::NodeId, NodeId>,
    by_dom: HashMap<NodeId, taffy::NodeId>,
    boxes: HashMap<NodeId, Vec<taffy::NodeId>>,
    /// The side tables keyed by box (the build-order ones are in `tables`).
    registry: IfcRegistry,
    tables: BuildTables,
    records: HashMap<NodeId, BuildRecord>,
    /// Elements whose style a layout pass changed after the build: their
    /// boxes are built again next time.
    pending: Vec<NodeId>,
    /// The deferrals the build saw.
    deferrals: Deferrals,
    /// The styles of `pending` at the build (see `BuildReuse::pending`).
    pending_before: Option<super::stylemap::BeforeWrites>,
    deferral_memo: super::DeferralMemo,
    index: StyleIndex,
    collected: Option<super::collect::Collected>,
    static_probes: HashMap<NodeId, taffy::NodeId>,
    /// What the tree was built for.
    pub(super) viewport: (f32, f32),
    pub(super) needs_emoji_font: bool,
    /// The IFCs and measured leaves the boxes name, moved out of the
    /// layout's `DomLayout` when the next layout takes the tree.
    pub(crate) store: Option<crate::ifc::IfcStore>,
    pub(crate) engine: Option<crate::inline::TextEngine>,
    /// Which elements must be built again, from the mutations since.
    pub(crate) damage: Option<BuildDamage>,
}

/// Whether layouts keep their box tree for the next one.
pub(super) fn tree_retention_enabled() -> bool {
    static DISABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    !*DISABLED.get_or_init(|| std::env::var_os("OBSCURA_LAYOUT_NO_RETAIN_TREE").is_some())
}

/// What a layout starts its build from.
pub(super) struct BuildStart {
    pub(super) taffy: TaffyTree<usize>,
    pub(super) id_map: HashMap<taffy::NodeId, NodeId>,
    pub(super) engine: crate::inline::TextEngine,
    pub(super) items: IfcRegistry,
    /// The tree is the previous layout's, rolled back to its build.
    pub(super) retained: bool,
}

impl RetainedLayoutTree {
    /// Roll the tree back to what the previous build made and prepare the
    /// build to keep what it can. `None` when it cannot be reused.
    #[allow(clippy::too_many_arguments)]
    pub(super) fn start(
        mut self: Box<Self>,
        tree: &DomTree,
        root_dom: NodeId,
        viewport: (f32, f32),
        fonts: &[crate::inline::WebFont],
        needs_emoji_font: bool,
    ) -> Option<BuildStart> {
        let why = |reason: &str| {
            if crate::prof::enabled() {
                eprintln!("[timing] retained-tree dropped reason={reason}");
            }
        };
        let (Some(store), Some(engine), Some(damage)) =
            (self.store.take(), self.engine.take(), self.damage.take())
        else {
            why("missing");
            return None;
        };
        if self.root_dom != root_dom
            || self.viewport != viewport
            || self.needs_emoji_font != needs_emoji_font
            || !store.has_fonts(fonts, needs_emoji_font)
            || tree.has_shadow_roots()
            // Dropped IFCs leave holes; build afresh once they dominate.
            || store.len() > 2 * store.live() + 1024
        {
            why("inputs");
            return None;
        }
        if !self.taffy.rollback_journal() {
            why("journal");
            return None;
        }
        let mut items = std::mem::take(&mut self.registry);
        items.ifc = store;
        let mut reuse = BuildReuse::new(
            tree,
            std::mem::take(&mut self.records),
            std::mem::take(&mut self.tables),
            std::mem::take(&mut self.by_dom),
            true,
        );
        reuse.deferrals = std::mem::take(&mut self.deferrals);
        reuse.pending = std::mem::take(&mut self.pending);
        reuse.pending_before = self.pending_before.take();
        reuse.damage_nodes = damage.nodes.clone();
        reuse.deferral_memo = std::mem::take(&mut self.deferral_memo);
        reuse.index = std::mem::take(&mut self.index);
        reuse.boxes = std::mem::take(&mut self.boxes);
        reuse.collected = self.collected.take();
        reuse.static_probes = std::mem::take(&mut self.static_probes);
        if crate::prof::enabled() {
            eprintln!(
                "[timing] retained-tree damage nodes={} context={} subtrees={} pending={}",
                damage.nodes.len(),
                damage.context.len(),
                damage.subtrees.len(),
                self.pending.len()
            );
        }
        for &id in &damage.context {
            reuse.style_changed(tree, id);
        }
        for &id in &damage.nodes {
            reuse.box_changed(tree, id);
        }
        for &root in &damage.subtrees {
            reuse.style_changed(tree, root);
            for id in tree.descendants(root) {
                reuse.style_changed(tree, id);
            }
        }
        let mut taffy = std::mem::replace(&mut self.taffy, TaffyTree::new());
        taffy.start_creation_log();
        items.reuse = Some(Box::new(reuse));
        Some(BuildStart {
            taffy,
            id_map: std::mem::take(&mut self.id_map),
            engine,
            items,
            retained: true,
        })
    }
}

/// Note the styles written since the layout began (before the build): their
/// boxes are built again.
pub(super) fn mark_style_changes(
    items: &mut IfcRegistry,
    tree: &DomTree,
    styles: &crate::StyleTable,
    changes: super::stylemap::StyleChanges,
    before: Option<super::stylemap::BeforeWrites>,
    deferrals: Deferrals,
) {
    let Some(reuse) = items.reuse.as_mut() else {
        return;
    };
    let previous = std::mem::take(&mut reuse.deferrals);
    let differing: Vec<NodeId> = deferrals
        .iter()
        .filter(|(key, value)| previous.get(key) != Some(value))
        .chain(
            previous
                .iter()
                .filter(|(key, _)| !deferrals.contains_key(key)),
        )
        .map(|((node, _), _)| *node)
        .collect();
    for id in differing {
        reuse.style_changed(tree, id);
    }
    reuse.deferrals = deferrals;
    let mut written = match changes {
        super::stylemap::StyleChanges::All => {
            if crate::prof::enabled() {
                eprintln!("[timing] retained-tree full-rebuild reason=all-styles");
            }
            reuse.reuse = false;
            reuse.index.valid = false;
            reuse.index.update(&[], styles);
            return;
        }
        super::stylemap::StyleChanges::Nodes(nodes) => nodes,
    };
    // A written style is a change only when it differs from the style the
    // previous build saw: the style before this layout's first write, or for
    // one a pass wrote after the previous build, the style it had then.
    written.append(&mut reuse.pending);
    written.sort_unstable_by_key(|id| id.index());
    written.dedup();
    if !reuse.reuse {
        reuse.index.valid = false;
    }
    reuse.index.update(&written, styles);
    let pending_before = reuse.pending_before.take();
    let mut changed = 0;
    for id in written {
        let baseline = pending_before
            .as_ref()
            .and_then(|pending| pending.get(&id))
            .or_else(|| before.as_ref().and_then(|before| before.get(&id)));
        let unchanged = baseline.is_some_and(|old| old.as_deref() == styles.get(&id));
        if !unchanged {
            changed += 1;
            reuse.style_changed(tree, id);
        }
    }
    if crate::prof::enabled() {
        eprintln!("[timing] retained-tree style-changes={changed}");
    }
}

/// A build from scratch that records what it makes, so the next layout can
/// keep it.
pub(super) fn fresh_start(
    tree: &DomTree,
    mut taffy: TaffyTree<usize>,
    engine: crate::inline::TextEngine,
    mut items: IfcRegistry,
) -> BuildStart {
    taffy.start_creation_log();
    items.reuse = Some(Box::new(BuildReuse::new(
        tree,
        HashMap::default(),
        BuildTables::default(),
        HashMap::default(),
        false,
    )));
    BuildStart {
        taffy,
        id_map: HashMap::default(),
        engine,
        items,
        retained: false,
    }
}

/// After the build: drop what is gone, and return the boxes by element and
/// the boxes this build created (in creation order).
pub(super) fn finish_build(
    taffy: &mut TaffyTree<usize>,
    id_map: &mut HashMap<taffy::NodeId, NodeId>,
    items: &mut IfcRegistry,
    timing: bool,
) -> (HashMap<NodeId, taffy::NodeId>, Vec<taffy::NodeId>) {
    let Some(mut reuse) = items.reuse.take() else {
        let by_dom = id_map.iter().map(|(&t, &d)| (d, t)).collect();
        return (by_dom, Vec::new());
    };
    if reuse.reuse {
        crate::ifc::build::clear_offered_templates();
    }
    reuse.collect_garbage(taffy, id_map, items);
    let created = taffy
        .created_nodes()
        .iter()
        .copied()
        .filter(|&node| taffy.style(node).is_ok())
        .collect();
    taffy.stop_creation_log();
    if timing {
        eprintln!(
            "[timing] retained-build kept={} built={} records={} misses={:?} dirty={}",
            reuse.kept,
            reuse.built,
            reuse.records.len(),
            reuse.misses,
            reuse.subtree_dirty.iter().filter(|d| **d).count()
        );
    }
    let by_dom = std::mem::take(&mut reuse.by_dom);
    items.reuse = Some(reuse);
    (by_dom, created)
}

/// Keep this layout's tree for the next layout (see `RetainedLayoutTree`).
#[allow(clippy::too_many_arguments)]
pub(super) fn retain(
    taffy: TaffyTree<usize>,
    root: taffy::NodeId,
    root_dom: NodeId,
    id_map: HashMap<taffy::NodeId, NodeId>,
    by_dom: HashMap<NodeId, taffy::NodeId>,
    items: &mut IfcRegistry,
    styles: &crate::StyleTable,
    pending: Vec<NodeId>,
    pending_before: Option<super::stylemap::BeforeWrites>,
    viewport: (f32, f32),
    needs_emoji_font: bool,
) -> Option<Box<RetainedLayoutTree>> {
    let reuse = items.reuse.take()?;
    if !taffy.journal_is_sound() {
        if crate::prof::enabled() {
            eprintln!("[timing] retained-tree not-kept reason=journal");
        }
        return None;
    }
    let mut reuse = reuse;
    reuse.index.update(&pending, styles);
    let tables = BuildTables::take(items);
    let registry = IfcRegistry {
        table_cols: std::mem::take(&mut items.table_cols),
        fixed_table_cols: std::mem::take(&mut items.fixed_table_cols),
        table_rows: std::mem::take(&mut items.table_rows),
        table_captions: std::mem::take(&mut items.table_captions),
        table_columns: std::mem::take(&mut items.table_columns),
        anonymous_tables: std::mem::take(&mut items.anonymous_tables),
        ..IfcRegistry::default()
    };
    Some(Box::new(RetainedLayoutTree {
        taffy,
        root,
        root_dom,
        id_map,
        by_dom,
        boxes: reuse.boxes,
        registry,
        tables,
        records: reuse.records,
        deferrals: reuse.deferrals,
        deferral_memo: reuse.deferral_memo,
        index: reuse.index,
        collected: reuse.collected,
        static_probes: reuse.static_probes,
        pending,
        pending_before,
        viewport,
        needs_emoji_font,
        store: None,
        engine: None,
        damage: None,
    }))
}
