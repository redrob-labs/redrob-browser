//! Contains [TaffyTree](crate::tree::TaffyTree): the default implementation of [LayoutTree](crate::tree::LayoutTree), and the error type for Taffy.
#[cfg(not(feature = "std"))]
use slotmap::SecondaryMap;
#[cfg(feature = "std")]
use slotmap::SparseSecondaryMap as SecondaryMap;
use slotmap::{DefaultKey, SlotMap};

#[cfg(feature = "block_layout")]
use crate::block::BlockContext;
#[cfg(all(feature = "block_layout", feature = "float_layout"))]
use crate::compute::FloatBand;
use crate::geometry::Size;
use crate::style::{AvailableSpace, Display, Style};
use crate::sys::DefaultCheapStr;
use crate::tree::{
    Cache, ClearState, Layout, LayoutInput, LayoutOutput, LayoutPartialTree, NodeId, PrintTree, RoundTree, RunMode,
    TraversePartialTree, TraverseTree,
};
use crate::util::debug::{debug_log, debug_log_node};
use crate::util::sys::{new_vec_with_capacity, ChildrenVec, Vec};

use crate::compute::{
    compute_cached_layout, compute_hidden_layout, compute_leaf_layout, compute_root_layout, round_layout,
};
use crate::CacheTree;

#[cfg(feature = "block_layout")]
use crate::{compute::compute_block_layout, LayoutBlockContainer};
#[cfg(feature = "flexbox")]
use crate::{compute::compute_flexbox_layout, LayoutFlexboxContainer};
#[cfg(feature = "grid")]
use crate::{compute::compute_grid_layout, LayoutGridContainer};

#[cfg(all(feature = "detailed_layout_info", feature = "grid"))]
use crate::compute::grid::DetailedGridInfo;
#[cfg(feature = "detailed_layout_info")]
use crate::tree::layout::DetailedLayoutInfo;

/// The error Taffy generates on invalid operations
pub type TaffyResult<T> = Result<T, TaffyError>;

/// An error that occurs while trying to access or modify a node's children by index.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TaffyError {
    /// The parent node does not have a child at `child_index`. It only has `child_count` children
    ChildIndexOutOfBounds {
        /// The parent node whose child was being looked up
        parent: NodeId,
        /// The index that was looked up
        child_index: usize,
        /// The total number of children the parent has
        child_count: usize,
    },
    /// The parent node was not found in the [`TaffyTree`](crate::TaffyTree) instance.
    InvalidParentNode(NodeId),
    /// The child node was not found in the [`TaffyTree`](crate::TaffyTree) instance.
    InvalidChildNode(NodeId),
    /// The supplied node was not found in the [`TaffyTree`](crate::TaffyTree) instance.
    InvalidInputNode(NodeId),
}

impl core::fmt::Display for TaffyError {
    fn fmt(&self, f: &mut core::fmt::Formatter) -> core::fmt::Result {
        match self {
            TaffyError::ChildIndexOutOfBounds { parent, child_index, child_count } => {
                write!(f, "Index (is {child_index}) should be < child_count ({child_count}) for parent node {parent:?}")
            }
            TaffyError::InvalidParentNode(parent) => {
                write!(f, "Parent Node {parent:?} is not in the TaffyTree instance")
            }
            TaffyError::InvalidChildNode(child) => write!(f, "Child Node {child:?} is not in the TaffyTree instance"),
            TaffyError::InvalidInputNode(node) => write!(f, "Supplied Node {node:?} is not in the TaffyTree instance"),
        }
    }
}

#[cfg(feature = "std")]
impl std::error::Error for TaffyError {}

/// Global configuration values for a TaffyTree instance
#[derive(Debug, Clone, Copy)]
pub(crate) struct TaffyConfig {
    /// Whether to round layout values
    pub(crate) use_rounding: bool,
    /// Whether cache entries carry the subtree key they were computed under (see
    /// [`TaffyTree::enable_subtree_keys`])
    pub(crate) subtree_keys: bool,
    /// Whether a final layout may be served from a node's earlier final results, deferring
    /// the layout of its children (see [`TaffyTree::enable_deferred_performs`])
    pub(crate) defer_performs: bool,
    /// Resolves an opaque `calc()` handle against its percentage basis.
    #[cfg(feature = "calc")]
    pub(crate) calc_resolver: fn(*const (), f32) -> f32,
}

#[cfg(feature = "calc")]
fn default_calc_resolver(_value: *const (), _basis: f32) -> f32 {
    0.0
}

impl Default for TaffyConfig {
    fn default() -> Self {
        Self {
            use_rounding: true,
            subtree_keys: false,
            defer_performs: false,
            #[cfg(feature = "calc")]
            calc_resolver: default_calc_resolver,
        }
    }
}

/// Layout information for a given [`Node`](crate::node::Node)
///
/// Stored in a [`TaffyTree`].
#[derive(Debug, Clone, PartialEq)]
struct NodeData {
    /// The layout strategy used by this node
    pub(crate) style: Style,

    /// The always unrounded results of the layout computation. We must store this separately from the rounded
    /// layout to avoid errors from rounding already-rounded values. See <https://github.com/DioxusLabs/taffy/issues/501>.
    pub(crate) unrounded_layout: Layout,

    /// The final results of the layout computation.
    /// These may be rounded or unrounded depending on what the `use_rounding` config setting is set to.
    pub(crate) final_layout: Layout,

    /// Whether the node has context data associated with it or not
    pub(crate) has_context: bool,

    /// The cached results of the layout computation
    pub(crate) cache: Cache,

    /// The computation result from layout algorithm
    #[cfg(feature = "detailed_layout_info")]
    pub(crate) detailed_layout_info: DetailedLayoutInfo,

    /// Float exclusions that shortened this leaf's line boxes during its latest final layout
    #[cfg(all(feature = "block_layout", feature = "float_layout"))]
    pub(crate) float_bands: Vec<FloatBand>,

    /// The node is the root of an inline formatting context, laid out by the tree's inline
    /// layout function (see [`TaffyTree::set_inline_layout_function`]) instead of by its display.
    pub(crate) is_inline_root: bool,

    /// The node's layout places floats into, or reads floats from, the block formatting context
    /// it is laid out in. Such a layout depends on more than its `LayoutInput` and is not cached
    /// when laid out within a block formatting context.
    pub(crate) float_sensitive: bool,

    /// The float context (`BlockContext::float_key`) of the node's current layout request, or 0
    /// outside any float context. Cache entries carry the key they were computed under: a layout
    /// made beside floats is only reused beside the same floats at the same position.
    #[cfg(all(feature = "block_layout", feature = "float_layout"))]
    pub(crate) float_key: u64,

    /// `unrounded_layout` changed since `final_layout` was last rounded from it
    pub(crate) round_stale: bool,
    /// The node or a descendant needs rounding again (its layout or its children changed)
    pub(crate) round_subtree_stale: bool,
    /// The bits of the cumulative offset `final_layout` was rounded at
    pub(crate) round_origin: (u32, u32),
    /// The hash of `style`, `None` until needed after a change
    pub(crate) style_key: Option<u64>,
    /// What the node's measure function depends on, as the embedder keys it
    pub(crate) content_key: u64,
    /// The subtree key (see `subtree_key`), valid while `key_stale` is false
    pub(crate) subtree_key: u64,
    /// The node or a descendant changed since `subtree_key` was computed. A stale node's
    /// ancestors are all stale.
    pub(crate) key_stale: bool,
    /// The node's final layout was served from its earlier final results for this input, so
    /// its children do not hold the layouts that layout placed (see
    /// [`TaffyTree::enable_deferred_performs`])
    /// Its inputs are `last_perform`.
    pub(crate) deferred: bool,
    /// The inputs of the node's latest final layout request, and whether it was inside a block
    /// formatting context; `None` when it was laid out beside floats (it cannot be laid out
    /// again from these alone)
    pub(crate) last_perform: Option<(LayoutInput, bool)>,
    /// The `TaffyTree::place_epoch` of the last placement that placed this node
    pub(crate) placed_in: u32,
}

impl NodeData {
    /// Create the data for a new node
    #[must_use]
    pub const fn new(style: Style) -> Self {
        Self {
            style,
            cache: Cache::new(),
            unrounded_layout: Layout::new(),
            final_layout: Layout::new(),
            has_context: false,
            #[cfg(feature = "detailed_layout_info")]
            detailed_layout_info: DetailedLayoutInfo::None,
            #[cfg(all(feature = "block_layout", feature = "float_layout"))]
            float_bands: Vec::new(),
            is_inline_root: false,
            float_sensitive: false,
            #[cfg(all(feature = "block_layout", feature = "float_layout"))]
            float_key: 0,
            round_stale: true,
            round_subtree_stale: true,
            round_origin: (u32::MAX, u32::MAX),
            style_key: None,
            content_key: 0,
            subtree_key: 0,
            key_stale: true,
            deferred: false,
            last_perform: None,
            placed_in: 0,
        }
    }

    /// Marks a node and all of its ancestors as requiring relayout
    ///
    /// This clears any cached data and signals that the data must be recomputed.
    /// If the node was already marked as dirty, returns true
    #[inline]
    pub fn mark_dirty(&mut self) -> ClearState {
        self.cache.clear()
    }
}

/// An entire tree of UI nodes. The entry point to Taffy's high-level API.
///
/// Allows you to build a tree of UI nodes, run Taffy's layout algorithms over that tree, and then access the resultant layout.]
#[derive(Debug, Clone)]
pub struct TaffyTree<NodeContext = ()> {
    /// The [`NodeData`] for each node stored in this tree
    nodes: SlotMap<DefaultKey, NodeData>,

    /// Functions/closures that compute the intrinsic size of leaf nodes
    node_context_data: SecondaryMap<DefaultKey, NodeContext>,

    /// The children of each node
    ///
    /// The indexes in the outer vector correspond to the position of the parent [`NodeData`]
    children: SlotMap<DefaultKey, ChildrenVec<NodeId>>,

    /// The parents of each node
    ///
    /// The indexes in the outer vector correspond to the position of the child [`NodeData`]
    parents: SlotMap<DefaultKey, Option<NodeId>>,

    /// Layout mode configuration
    config: TaffyConfig,

    /// Lays out nodes marked as inline formatting context roots
    #[cfg(feature = "block_layout")]
    inline_layout: Option<InlineLayoutFn<NodeContext>>,

    /// Nodes whose children's layouts were deferred (some may have been placed since)
    deferred_nodes: Vec<NodeId>,
    /// Counts the calls that place every deferred node (see `NodeData::placed_in`)
    place_epoch: u32,
    /// The node a placement lays out again: it must not be served from earlier results
    force_perform: Option<NodeId>,
    /// The node the latest `compute_layout_with_measure` laid out as a root: its own layout is
    /// current whatever its ancestors wait for
    last_root: Option<NodeId>,
    /// The nodes created since [`TaffyTree::start_creation_log`], in creation order
    created: Option<Vec<NodeId>>,
    /// The changes made since [`TaffyTree::begin_journal`], oldest first
    journal: Option<Journal>,
}

/// One change recorded by the journal (see [`TaffyTree::begin_journal`])
#[derive(Debug, Clone)]
enum JournalOp {
    /// A node was created
    Created(NodeId),
    /// A node's style was replaced; the old style and its style key, when computed
    Style(NodeId, Style, Option<u64>),
    /// A node's child list was changed; the old list
    Children(NodeId, Vec<NodeId>),
    /// A node's inline-root flag was changed; the old flag
    InlineRoot(NodeId, bool),
}

/// The changes a [`TaffyTree`] recorded since [`TaffyTree::begin_journal`]
#[derive(Debug, Clone, Default)]
struct Journal {
    ops: Vec<JournalOp>,
    /// A change the journal cannot undo was made (a node was removed or its context changed)
    broken: bool,
}

/// The tree an [`InlineLayoutFn`] lays out an inline formatting context in. It gives access to the
/// inline root's children (atomic inline boxes, floats and out-of-flow boxes), which the function
/// lays out itself, and to their styles and contexts.
#[cfg(feature = "block_layout")]
pub trait InlineLayoutHost<NodeContext> {
    /// Lay out a child of the inline root (an inline box, a float or an out-of-flow box). The child
    /// establishes its own block formatting context.
    fn compute_child_layout(&mut self, node: NodeId, inputs: LayoutInput) -> LayoutOutput;
    /// Store the final position and size of a child
    fn set_unrounded_layout(&mut self, node: NodeId, layout: &Layout);
    /// The last stored layout of a node
    fn get_unrounded_layout(&self, node: NodeId) -> Layout;
    /// The style of a node
    fn style(&self, node: NodeId) -> &Style;
    /// The children of a node
    fn children(&self, node: NodeId) -> Vec<NodeId>;
    /// Resolve an opaque `calc()` handle against a percentage basis
    fn resolve_calc(&self, val: *const (), basis: f32) -> f32;
    /// The function that resolves opaque `calc()` handles
    fn calc_resolver(&self) -> fn(*const (), f32) -> f32;
    /// The context attached to a node, if any
    fn context(&mut self, node: NodeId) -> Option<&mut NodeContext>;
}

/// Lays out one inline formatting context root: `fn(host, node, inputs, block_ctx)`. `block_ctx` is
/// the block formatting context the root is laid out in when it does not establish its own.
#[cfg(feature = "block_layout")]
pub type InlineLayoutFn<NodeContext> =
    fn(&mut dyn InlineLayoutHost<NodeContext>, NodeId, LayoutInput, Option<&mut BlockContext<'_>>) -> LayoutOutput;

impl Default for TaffyTree {
    fn default() -> TaffyTree<()> {
        TaffyTree::new()
    }
}

/// Iterator that wraps a slice of nodes, lazily converting them to u64
pub struct TaffyTreeChildIter<'a>(core::slice::Iter<'a, NodeId>);
impl Iterator for TaffyTreeChildIter<'_> {
    type Item = NodeId;

    #[inline]
    fn next(&mut self) -> Option<Self::Item> {
        self.0.next().copied()
    }
}

// TraversePartialTree impl for TaffyTree
impl<NodeContext> TraversePartialTree for TaffyTree<NodeContext> {
    type ChildIter<'a>
        = TaffyTreeChildIter<'a>
    where
        Self: 'a;

    #[inline(always)]
    fn child_ids(&self, parent_node_id: NodeId) -> Self::ChildIter<'_> {
        TaffyTreeChildIter(self.children[parent_node_id.into()].iter())
    }

    #[inline(always)]
    fn child_count(&self, parent_node_id: NodeId) -> usize {
        self.children[parent_node_id.into()].len()
    }

    #[inline(always)]
    fn get_child_id(&self, parent_node_id: NodeId, id: usize) -> NodeId {
        self.children[parent_node_id.into()][id]
    }
}

// TraverseTree impl for TaffyTree
impl<NodeContext> TraverseTree for TaffyTree<NodeContext> {}

// CacheTree impl for TaffyTree
impl<NodeContext> CacheTree for TaffyTree<NodeContext> {
    fn cache_get(&self, node_id: NodeId, input: &LayoutInput) -> Option<LayoutOutput> {
        let node = &self.nodes[node_id.into()];
        node.cache.get_in_float_context(input, self.entry_tag(node, 0))
    }

    fn cache_store(&mut self, node_id: NodeId, input: &LayoutInput, layout_output: LayoutOutput) {
        let tag = self.entry_tag(&self.nodes[node_id.into()], 0);
        self.nodes[node_id.into()].cache.store_in_float_context(input, layout_output, tag)
    }

    fn cache_clear(&mut self, node_id: NodeId) {
        self.nodes[node_id.into()].cache.clear();
    }
}

// PrintTree impl for TaffyTree
impl<NodeContext> PrintTree for TaffyTree<NodeContext> {
    #[inline(always)]
    fn get_debug_label(&self, node_id: NodeId) -> &'static str {
        let node = &self.nodes[node_id.into()];
        let display = node.style.display;
        let num_children = self.child_count(node_id);

        match (num_children, display) {
            (_, Display::None) => "NONE",
            (0, _) => "LEAF",
            #[cfg(feature = "block_layout")]
            (_, Display::Block) => "BLOCK",
            #[cfg(feature = "flexbox")]
            (_, Display::Flex) => {
                use crate::FlexDirection;
                match node.style.flex_direction {
                    FlexDirection::Row | FlexDirection::RowReverse => "FLEX ROW",
                    FlexDirection::Column | FlexDirection::ColumnReverse => "FLEX COL",
                }
            }
            #[cfg(feature = "grid")]
            (_, Display::Grid) => "GRID",
        }
    }

    #[inline(always)]
    fn get_final_layout(&self, node_id: NodeId) -> Layout {
        if self.config.use_rounding {
            self.nodes[node_id.into()].final_layout
        } else {
            self.nodes[node_id.into()].unrounded_layout
        }
    }
}

/// View over the Taffy tree that holds the tree itself along with a reference to the context
/// and implements LayoutTree. This allows the context to be stored outside of the TaffyTree struct
/// which makes the lifetimes of the context much more flexible.
pub(crate) struct TaffyView<'t, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    /// A reference to the TaffyTree
    pub(crate) taffy: &'t mut TaffyTree<NodeContext>,
    /// The context provided for passing to measure functions if layout is run over this struct
    pub(crate) measure_function: MeasureFunction,
}

impl<NodeContext, MeasureFunction> TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    #[inline(always)]
    /// Unified implementation that both `LayoutPartialTree::compute_child_layout`
    /// and `LayoutBlockContainer::compute_block_child_layout` delegate to.
    fn compute_child_layout(
        &mut self,
        node_id: NodeId,
        inputs: LayoutInput,
        #[cfg(feature = "block_layout")] block_ctx: Option<&mut BlockContext<'_>>,
    ) -> LayoutOutput {
        // If RunMode is PerformHiddenLayout then this indicates that an ancestor node is `Display::None`
        // and thus that we should lay out this node using hidden layout regardless of it's own display style.
        if inputs.run_mode == RunMode::PerformHiddenLayout {
            debug_log!("HIDDEN");
            return compute_hidden_layout(self, node_id);
        }
        // A block formatting context without floats is one a layout cannot read anything from:
        // placing the children later in a fresh one lays them out the same.
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let (deferrable_context, in_block_context) =
            (block_ctx.as_ref().is_none_or(|ctx| !ctx.has_floats()), block_ctx.is_some());
        #[cfg(all(feature = "block_layout", not(feature = "float_layout")))]
        let (deferrable_context, in_block_context) = (true, block_ctx.is_some());
        #[cfg(not(feature = "block_layout"))]
        let (deferrable_context, in_block_context) = (true, false);

        // We run the following wrapped in "compute_cached_layout", which will check the cache for an entry matching the node and inputs and:
        //   - Return that entry if exists
        //   - Else call the passed closure (below) to compute the result
        //
        // A leaf with measured content (an inline formatting context) laid out in a block formatting
        // context that holds floats has its line boxes shortened by those floats. The bands depend on
        // the float context rather than on `inputs`, so such a layout bypasses the cache.
        #[cfg(all(feature = "block_layout", feature = "float_layout", feature = "std"))]
        let float_bands = {
            let node = &self.taffy.nodes[node_id.into()];
            let is_measured_leaf =
                node.has_context && node.style.display != Display::None && self.child_count(node_id) == 0;
            match block_ctx.as_ref() {
                Some(ctx) if is_measured_leaf && ctx.has_floats() => {
                    use crate::util::ResolveOrZero;
                    let style = &self.taffy.nodes[node_id.into()].style;
                    let calc = |val: *const (), basis: f32| (self.taffy.config.calc_resolver)(val, basis);
                    let padding = style.padding.resolve_or_zero(inputs.parent_size.width, calc);
                    let border = style.border.resolve_or_zero(inputs.parent_size.width, calc);
                    ctx.leaf_float_bands(
                        padding.top + border.top,
                        [padding.left + border.left, padding.right + border.right],
                    )
                }
                _ => Vec::new(),
            }
        };
        #[cfg(all(feature = "block_layout", feature = "float_layout", feature = "std"))]
        if inputs.run_mode == RunMode::PerformLayout && self.taffy.nodes[node_id.into()].has_context {
            self.taffy.nodes[node_id.into()].float_bands.clone_from(&float_bands);
        }

        // A layout that places floats into the block formatting context it is laid out in depends on
        // the float context it leaves behind as well as on `inputs`: it must run again rather than
        // reuse a cached result. One that only reads floats placed there earlier is cached under the
        // float context it read (`float_key`): a different context empties the node's cache first.
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let bypass_cache = {
            let node = &self.taffy.nodes[node_id.into()];
            let reads_floats = node.is_inline_root || node.style.display == Display::Block || node.has_context;
            let float_key = match block_ctx.as_ref() {
                Some(ctx) if ctx.has_floats() && reads_floats => ctx.float_key(),
                _ => 0,
            };
            let node = &mut self.taffy.nodes[node_id.into()];
            node.float_key = float_key;
            (block_ctx.is_some() && node.float_sensitive, float_key)
        };
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let (bypass_cache, float_key) = bypass_cache;
        #[cfg(not(all(feature = "block_layout", feature = "float_layout")))]
        let bypass_cache = false;
        #[cfg(not(all(feature = "block_layout", feature = "float_layout")))]
        let float_key = 0u64;

        if inputs.run_mode == RunMode::PerformLayout {
            self.taffy.nodes[node_id.into()].last_perform =
                (!bypass_cache && float_key == 0 && deferrable_context).then_some((inputs, in_block_context));
        }

        // A final layout this node made before, for these inputs and this subtree, whose
        // children have been laid out differently since: serve its output and place the
        // children only when something reads them (`TaffyTree::place_deferred`).
        if inputs.run_mode == RunMode::PerformLayout && !bypass_cache {
            let node = &self.taffy.nodes[node_id.into()];
            let tag = self.taffy.entry_tag(node, float_key);
            if node.cache.has_final_layout(&inputs, tag) {
                if node.deferred {
                    self.taffy.nodes[node_id.into()].deferred = false;
                }
            } else if self.taffy.config.defer_performs
                && deferrable_context
                && float_key == 0
                && self.taffy.force_perform != Some(node_id)
            {
                if let Some(output) = node.cache.get_final_history(&inputs, tag) {
                    let data = &mut self.taffy.nodes[node_id.into()];
                    if !data.deferred {
                        self.taffy.deferred_nodes.push(node_id);
                    }
                    data.deferred = true;
                    data.round_subtree_stale = true;
                    return output;
                }
            }
        }

        let compute = |tree: &mut Self, node_id: NodeId, inputs: LayoutInput| {
            let display_mode = tree.taffy.nodes[node_id.into()].style.display;
            let has_children = tree.child_count(node_id) > 0;
            #[cfg(feature = "std")]
            {
                let slot = usize::from(inputs.run_mode == RunMode::PerformLayout);
                ALGORITHM_RUNS[slot].fetch_add(1, core::sync::atomic::Ordering::Relaxed);
                ALGORITHM_CHILDREN[slot]
                    .fetch_add(tree.child_count(node_id) as u64, core::sync::atomic::Ordering::Relaxed);
            }

            #[cfg(feature = "block_layout")]
            if display_mode != Display::None && tree.taffy.nodes[node_id.into()].is_inline_root {
                if let Some(inline_layout) = tree.taffy.inline_layout {
                    return inline_layout(tree, node_id, inputs, block_ctx);
                }
            }

            debug_log!(display_mode);
            debug_log_node!(inputs);

            // Dispatch to a layout algorithm based on the node's display style and whether the node has children or not.
            match (display_mode, has_children) {
                (Display::None, _) => compute_hidden_layout(tree, node_id),
                #[cfg(feature = "block_layout")]
                (Display::Block, true) => compute_block_layout(tree, node_id, inputs, block_ctx),
                #[cfg(feature = "flexbox")]
                (Display::Flex, true) => compute_flexbox_layout(tree, node_id, inputs),
                #[cfg(feature = "grid")]
                (Display::Grid, true) => compute_grid_layout(tree, node_id, inputs),
                #[cfg(feature = "grid")]
                (Display::Grid, false) if {
                    let node = &tree.taffy.nodes[node_id.into()];
                    !node.has_context && (!node.style.grid_template_rows.is_empty()
                        || !node.style.grid_template_columns.is_empty())
                } => compute_grid_layout(tree, node_id, inputs),
                (_, false) => {
                    // Leaves resolve calc() padding, border, margin and sizes
                    // with the tree's resolver like every other algorithm.
                    let calc_resolver = tree.taffy.config.calc_resolver;
                    let node_key = node_id.into();
                    let style = &tree.taffy.nodes[node_key].style;
                    let has_context = tree.taffy.nodes[node_key].has_context;
                    let node_context = has_context.then(|| tree.taffy.node_context_data.get_mut(node_key)).flatten();
                    let measure_function = |known_dimensions, available_space| {
                        (tree.measure_function)(known_dimensions, available_space, node_id, node_context, style)
                    };
                    compute_leaf_layout(inputs, style, calc_resolver, measure_function)
                }
            }
        };

        // The bands follow from the float context, so a layout under them is cached with it.
        // The result is stored under the float key of this request, whatever a nested layout did.
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let compute = |tree: &mut Self, node_id: NodeId, inputs: LayoutInput| {
            let output = compute(tree, node_id, inputs);
            tree.taffy.nodes[node_id.into()].float_key = float_key;
            output
        };

        let compute = |tree: &mut Self, node_id: NodeId, inputs: LayoutInput| {
            if inputs.run_mode != RunMode::PerformLayout {
                return compute(tree, node_id, inputs);
            }
            tree.taffy.nodes[node_id.into()].deferred = false;
            let output = compute(tree, node_id, inputs);
            if !bypass_cache && tree.taffy.config.defer_performs {
                let children = tree.taffy.snapshot_children(node_id);
                tree.taffy.nodes[node_id.into()].cache.set_pending_children(children);
            }
            output
        };

        #[cfg(all(feature = "block_layout", feature = "float_layout", feature = "std"))]
        if !float_bands.is_empty() {
            let previous = LEAF_FLOAT_BANDS.with(|bands| bands.replace(float_bands));
            let output = if bypass_cache {
                #[cfg(feature = "std")]
                BYPASS_RUNS.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
                compute(self, node_id, inputs)
            } else {
                compute_cached_layout(self, node_id, inputs, compute)
            };
            LEAF_FLOAT_BANDS.with(|bands| bands.replace(previous));
            return output;
        }

        if bypass_cache {
            #[cfg(feature = "std")]
            BYPASS_RUNS.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
            return compute(self, node_id, inputs);
        }

        // If there was no cache match and a new result needs to be computed then that result will be added to the cache
        compute_cached_layout(self, node_id, inputs, compute)
    }
}

#[cfg(feature = "block_layout")]
impl<NodeContext, MeasureFunction> InlineLayoutHost<NodeContext> for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    fn compute_child_layout(&mut self, node: NodeId, inputs: LayoutInput) -> LayoutOutput {
        TaffyView::compute_child_layout(
            self,
            node,
            inputs,
            #[cfg(feature = "block_layout")]
            None,
        )
    }

    fn set_unrounded_layout(&mut self, node: NodeId, layout: &Layout) {
        self.taffy.store_unrounded_layout(node, layout);
    }

    fn get_unrounded_layout(&self, node: NodeId) -> Layout {
        self.taffy.nodes[node.into()].unrounded_layout
    }

    fn style(&self, node: NodeId) -> &Style {
        &self.taffy.nodes[node.into()].style
    }

    fn children(&self, node: NodeId) -> Vec<NodeId> {
        self.taffy.children[node.into()].iter().copied().collect()
    }

    fn resolve_calc(&self, val: *const (), basis: f32) -> f32 {
        (self.taffy.config.calc_resolver)(val, basis)
    }

    fn calc_resolver(&self) -> fn(*const (), f32) -> f32 {
        self.taffy.config.calc_resolver
    }

    fn context(&mut self, node: NodeId) -> Option<&mut NodeContext> {
        let key = node.into();
        if self.taffy.nodes[key].has_context {
            self.taffy.node_context_data.get_mut(key)
        } else {
            None
        }
    }
}

/// How many times a layout algorithm ran (measure, perform), and over how many children
#[cfg(feature = "std")]
static ALGORITHM_RUNS: [core::sync::atomic::AtomicU64; 2] =
    [const { core::sync::atomic::AtomicU64::new(0) }; 2];
#[cfg(feature = "std")]
static ALGORITHM_CHILDREN: [core::sync::atomic::AtomicU64; 2] =
    [const { core::sync::atomic::AtomicU64::new(0) }; 2];
/// How many of those runs bypassed the cache (float-sensitive boxes beside floats)
#[cfg(feature = "std")]
static BYPASS_RUNS: core::sync::atomic::AtomicU64 = core::sync::atomic::AtomicU64::new(0);
/// How many times caches were emptied up to the root (`TaffyTree::mark_dirty`)
#[cfg(feature = "std")]
static DIRTY_MARKS: core::sync::atomic::AtomicU64 = core::sync::atomic::AtomicU64::new(0);

/// Diagnostics: how many times a layout algorithm ran on a node since the process started, as
/// (measure runs, perform runs, runs that bypassed the cache, `mark_dirty` calls)
#[cfg(feature = "std")]
pub fn algorithm_runs() -> (u64, u64, u64, u64) {
    use core::sync::atomic::Ordering::Relaxed;
    (
        ALGORITHM_RUNS[0].load(Relaxed),
        ALGORITHM_RUNS[1].load(Relaxed),
        BYPASS_RUNS.load(Relaxed),
        DIRTY_MARKS.load(Relaxed),
    )
}

#[cfg(all(feature = "block_layout", feature = "float_layout", feature = "std"))]
std::thread_local! {
    static LEAF_FLOAT_BANDS: core::cell::RefCell<Vec<FloatBand>> = const { core::cell::RefCell::new(Vec::new()) };
}

/// The float exclusion bands that apply to the leaf currently being measured, relative to its
/// content box. Empty when no float intrudes. Only meaningful inside a measure function.
#[cfg(all(feature = "block_layout", feature = "float_layout", feature = "std"))]
pub fn current_leaf_float_bands() -> Vec<FloatBand> {
    LEAF_FLOAT_BANDS.with(|bands| bands.borrow().clone())
}

// TraversePartialTree impl for TaffyView
impl<NodeContext, MeasureFunction> TraversePartialTree for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    type ChildIter<'a>
        = TaffyTreeChildIter<'a>
    where
        Self: 'a;

    #[inline(always)]
    fn child_ids(&self, parent_node_id: NodeId) -> Self::ChildIter<'_> {
        self.taffy.child_ids(parent_node_id)
    }

    #[inline(always)]
    fn child_count(&self, parent_node_id: NodeId) -> usize {
        self.taffy.child_count(parent_node_id)
    }

    #[inline(always)]
    fn get_child_id(&self, parent_node_id: NodeId, child_index: usize) -> NodeId {
        self.taffy.get_child_id(parent_node_id, child_index)
    }
}

// TraverseTree impl for TaffyView
impl<NodeContext, MeasureFunction> TraverseTree for TaffyView<'_, NodeContext, MeasureFunction> where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>
{
}

// LayoutPartialTree impl for TaffyView
impl<NodeContext, MeasureFunction> LayoutPartialTree for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    type CoreContainerStyle<'a>
        = &'a Style
    where
        Self: 'a;

    type CustomIdent = DefaultCheapStr;

    #[inline(always)]
    fn get_core_container_style(&self, node_id: NodeId) -> Self::CoreContainerStyle<'_> {
        &self.taffy.nodes[node_id.into()].style
    }

    #[inline(always)]
    fn set_unrounded_layout(&mut self, node_id: NodeId, layout: &Layout) {
        self.taffy.store_unrounded_layout(node_id, layout);
    }

    #[inline(always)]
    fn resolve_calc_value(&self, val: *const (), basis: f32) -> f32 {
        (self.taffy.config.calc_resolver)(val, basis)
    }

    #[inline(always)]
    fn compute_child_layout(&mut self, node_id: NodeId, inputs: LayoutInput) -> LayoutOutput {
        self.compute_child_layout(
            node_id,
            inputs,
            #[cfg(feature = "block_layout")]
            None,
        )
    }
}

impl<NodeContext, MeasureFunction> CacheTree for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    fn cache_get(&self, node_id: NodeId, input: &LayoutInput) -> Option<LayoutOutput> {
        let node = &self.taffy.nodes[node_id.into()];
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let float_key = node.float_key;
        #[cfg(not(all(feature = "block_layout", feature = "float_layout")))]
        let float_key = 0;
        node.cache.get_in_float_context(input, self.taffy.entry_tag(node, float_key))
    }

    fn cache_store(&mut self, node_id: NodeId, input: &LayoutInput, layout_output: LayoutOutput) {
        let node = &self.taffy.nodes[node_id.into()];
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        let float_key = node.float_key;
        #[cfg(not(all(feature = "block_layout", feature = "float_layout")))]
        let float_key = 0;
        let tag = self.taffy.entry_tag(node, float_key);
        self.taffy.nodes[node_id.into()].cache.store_in_float_context(input, layout_output, tag)
    }

    fn cache_clear(&mut self, node_id: NodeId) {
        self.taffy.nodes[node_id.into()].cache.clear();
    }
}

#[cfg(feature = "block_layout")]
impl<NodeContext, MeasureFunction> LayoutBlockContainer for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    type BlockContainerStyle<'a>
        = &'a Style
    where
        Self: 'a;
    type BlockItemStyle<'a>
        = &'a Style
    where
        Self: 'a;

    #[inline(always)]
    fn get_block_container_style(&self, node_id: NodeId) -> Self::BlockContainerStyle<'_> {
        self.get_core_container_style(node_id)
    }

    #[inline(always)]
    fn get_block_child_style(&self, child_node_id: NodeId) -> Self::BlockItemStyle<'_> {
        self.get_core_container_style(child_node_id)
    }

    #[inline(always)]
    fn compute_block_child_layout(
        &mut self,
        node_id: NodeId,
        inputs: LayoutInput,
        block_ctx: Option<&mut BlockContext<'_>>,
    ) -> LayoutOutput {
        self.compute_child_layout(node_id, inputs, block_ctx)
    }
}

#[cfg(feature = "flexbox")]
impl<NodeContext, MeasureFunction> LayoutFlexboxContainer for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    type FlexboxContainerStyle<'a>
        = &'a Style
    where
        Self: 'a;
    type FlexboxItemStyle<'a>
        = &'a Style
    where
        Self: 'a;

    #[inline(always)]
    fn get_flexbox_container_style(&self, node_id: NodeId) -> Self::FlexboxContainerStyle<'_> {
        &self.taffy.nodes[node_id.into()].style
    }

    #[inline(always)]
    fn get_flexbox_child_style(&self, child_node_id: NodeId) -> Self::FlexboxItemStyle<'_> {
        &self.taffy.nodes[child_node_id.into()].style
    }
}

#[cfg(feature = "grid")]
impl<NodeContext, MeasureFunction> LayoutGridContainer for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    type GridContainerStyle<'a>
        = &'a Style
    where
        Self: 'a;
    type GridItemStyle<'a>
        = &'a Style
    where
        Self: 'a;

    #[inline(always)]
    fn get_grid_container_style(&self, node_id: NodeId) -> Self::GridContainerStyle<'_> {
        &self.taffy.nodes[node_id.into()].style
    }

    #[inline(always)]
    fn get_grid_child_style(&self, child_node_id: NodeId) -> Self::GridItemStyle<'_> {
        &self.taffy.nodes[child_node_id.into()].style
    }

    #[inline(always)]
    #[cfg(feature = "detailed_layout_info")]
    fn set_detailed_grid_info(&mut self, node_id: NodeId, detailed_grid_info: DetailedGridInfo) {
        self.taffy.nodes[node_id.into()].detailed_layout_info = DetailedLayoutInfo::Grid(Box::new(detailed_grid_info));
    }
}

// RoundTree impl for TaffyView
impl<NodeContext, MeasureFunction> RoundTree for TaffyView<'_, NodeContext, MeasureFunction>
where
    MeasureFunction:
        FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
{
    #[inline(always)]
    fn get_unrounded_layout(&self, node: NodeId) -> Layout {
        self.taffy.nodes[node.into()].unrounded_layout
    }

    #[inline(always)]
    fn rounding_is_current(&self, node_id: NodeId, cumulative_x: f32, cumulative_y: f32) -> bool {
        let node = &self.taffy.nodes[node_id.into()];
        !node.round_stale
            && !node.round_subtree_stale
            && node.round_origin == (cumulative_x.to_bits(), cumulative_y.to_bits())
    }

    #[inline(always)]
    fn note_rounded(&mut self, node_id: NodeId, cumulative_x: f32, cumulative_y: f32) {
        let node = &mut self.taffy.nodes[node_id.into()];
        node.round_stale = false;
        node.round_subtree_stale = false;
        node.round_origin = (cumulative_x.to_bits(), cumulative_y.to_bits());
    }

    #[inline(always)]
    fn set_final_layout(&mut self, node_id: NodeId, layout: &Layout) {
        self.taffy.nodes[node_id.into()].final_layout = *layout;
    }

    #[inline(always)]
    fn is_deferred(&self, node_id: NodeId) -> bool {
        self.taffy.nodes[node_id.into()].deferred
    }
}

#[allow(clippy::iter_cloned_collect)] // due to no-std support, we need to use `iter_cloned` instead of `collect`
impl<NodeContext> TaffyTree<NodeContext> {
    /// Creates a new [`TaffyTree`]
    ///
    /// The default capacity of a [`TaffyTree`] is 16 nodes.
    #[must_use]
    pub fn new() -> Self {
        Self::with_capacity(16)
    }

    /// Creates a new [`TaffyTree`] that can store `capacity` nodes before reallocation
    #[must_use]
    pub fn with_capacity(capacity: usize) -> Self {
        TaffyTree {
            // TODO: make this method const upstream,
            // so constructors here can be const
            nodes: SlotMap::with_capacity(capacity),
            children: SlotMap::with_capacity(capacity),
            parents: SlotMap::with_capacity(capacity),
            node_context_data: SecondaryMap::with_capacity(capacity),
            config: TaffyConfig::default(),
            #[cfg(feature = "block_layout")]
            inline_layout: None,
            deferred_nodes: Vec::new(),
            place_epoch: 0,
            force_perform: None,
            last_root: None,
            created: None,
            journal: None,
        }
    }

    /// Record every node created from now on (see [`Self::created_nodes`])
    pub fn start_creation_log(&mut self) {
        self.created = Some(Vec::new());
    }

    /// Stop recording created nodes
    pub fn stop_creation_log(&mut self) {
        self.created = None;
    }

    /// The nodes created since [`Self::start_creation_log`], in creation order
    pub fn created_nodes(&self) -> &[NodeId] {
        self.created.as_deref().unwrap_or(&[])
    }

    #[inline]
    fn note_created(&mut self, node: NodeId) {
        if let Some(created) = self.created.as_mut() {
            created.push(node);
        }
        if let Some(journal) = self.journal.as_mut() {
            journal.ops.push(JournalOp::Created(node));
        }
    }

    #[inline]
    fn journal_children(&mut self, parent: NodeId) {
        if let Some(journal) = self.journal.as_mut() {
            let old = self.children[parent.into()].iter().copied().collect();
            journal.ops.push(JournalOp::Children(parent, old));
        }
    }

    /// Record every change to styles and child lists, and every node created, from now on, so
    /// [`Self::rollback_journal`] can return the tree to its current state. Removing a node or
    /// changing a node's context cannot be undone: the journal is then broken.
    pub fn begin_journal(&mut self) {
        self.journal = Some(Journal::default());
    }

    /// Whether a journal is being kept and every change since it began can be undone
    pub fn journal_is_sound(&self) -> bool {
        self.journal.as_ref().is_some_and(|journal| !journal.broken)
    }

    /// Undo every change since [`Self::begin_journal`] (newest first) and stop keeping the
    /// journal. Cached results stay: they carry the subtree keys they were computed under.
    /// Returns false (and changes nothing) when there is no sound journal.
    pub fn rollback_journal(&mut self) -> bool {
        let Some(journal) = self.journal.take() else {
            return false;
        };
        if journal.broken {
            return false;
        }
        for op in journal.ops.into_iter().rev() {
            match op {
                JournalOp::Created(node) => {
                    let _ = self.remove(node);
                }
                JournalOp::Style(node, style, style_key) => {
                    // The node held this style (and its `calc()` handles) before: the results
                    // computed under it are still valid, whatever handles it brings back.
                    if let Some(data) = self.nodes.get_mut(node.into()) {
                        data.style = style;
                        data.style_key = style_key;
                        self.note_changed(node);
                    }
                }
                JournalOp::Children(parent, old) => {
                    if self.nodes.get(parent.into()).is_none() {
                        continue;
                    }
                    let current = core::mem::take(&mut self.children[parent.into()]);
                    for child in current.iter() {
                        if self.parents.get((*child).into()).is_some_and(|p| *p == Some(parent)) {
                            self.parents[(*child).into()] = None;
                        }
                    }
                    for &child in old.iter() {
                        self.parents[child.into()] = Some(parent);
                    }
                    self.children[parent.into()] = old.iter().copied().collect();
                    self.note_changed(parent);
                }
                JournalOp::InlineRoot(node, flag) => {
                    if self.nodes.get(node.into()).is_some() {
                        let _ = self.set_inline_root(node, flag);
                    }
                }
            }
        }
        true
    }

    /// Stop keeping the journal without undoing anything
    pub fn drop_journal(&mut self) {
        self.journal = None;
    }

    /// Enable rounding of layout values. Rounding is enabled by default.
    pub fn enable_rounding(&mut self) {
        self.config.use_rounding = true;
    }

    /// Disable rounding of layout values. Rounding is enabled by default.
    pub fn disable_rounding(&mut self) {
        self.config.use_rounding = false;
    }

    /// Installs the resolver used for opaque `calc()` handles.
    ///
    /// Every calc handle stored in a node style must be understood by
    /// `resolver` and remain alive for every layout computation performed by
    /// this tree. Taffy treats handles as opaque and never dereferences them.
    #[cfg(feature = "calc")]
    pub fn set_calc_resolver(&mut self, resolver: fn(*const (), f32) -> f32) {
        self.config.calc_resolver = resolver;
    }

    /// Creates and adds a new unattached leaf node to the tree, and returns the node of the new node
    pub fn new_leaf(&mut self, layout: Style) -> TaffyResult<NodeId> {
        let id = self.nodes.insert(NodeData::new(layout));
        let _ = self.children.insert(new_vec_with_capacity(0));
        let _ = self.parents.insert(None);
        self.note_created(id.into());

        Ok(id.into())
    }

    /// Creates and adds a new unattached leaf node to the tree, and returns the [`NodeId`] of the new node
    ///
    /// Creates and adds a new leaf node with a supplied context
    pub fn new_leaf_with_context(&mut self, layout: Style, context: NodeContext) -> TaffyResult<NodeId> {
        let mut data = NodeData::new(layout);
        data.has_context = true;

        let id = self.nodes.insert(data);
        self.node_context_data.insert(id, context);

        let _ = self.children.insert(new_vec_with_capacity(0));
        let _ = self.parents.insert(None);
        self.note_created(id.into());

        Ok(id.into())
    }

    /// Creates and adds a new node, which may have any number of `children`
    pub fn new_with_children(&mut self, layout: Style, children: &[NodeId]) -> TaffyResult<NodeId> {
        let id = NodeId::from(self.nodes.insert(NodeData::new(layout)));

        for child in children {
            self.parents[(*child).into()] = Some(id);
        }

        let _ = self.children.insert(children.iter().copied().collect::<_>());
        let _ = self.parents.insert(None);
        self.note_created(id);

        Ok(id)
    }

    /// Drops all nodes in the tree
    pub fn clear(&mut self) {
        self.nodes.clear();
        self.children.clear();
        self.parents.clear();
    }

    /// Remove a specific node from the tree and drop it
    ///
    /// Returns the id of the node removed.
    pub fn remove(&mut self, node: NodeId) -> TaffyResult<NodeId> {
        if let Some(journal) = self.journal.as_mut() {
            journal.broken = true;
        }
        let key = node.into();
        if let Some(parent) = self.parents[key] {
            if let Some(children) = self.children.get_mut(parent.into()) {
                children.retain(|f| *f != node);
            }
            if self.config.subtree_keys {
                self.note_changed(parent);
            }
        }

        // Remove "parent" references to a node when removing that node
        if let Some(children) = self.children.get(key) {
            for child in children.iter().copied() {
                self.parents[child.into()] = None;
            }
        }

        let _ = self.children.remove(key);
        let _ = self.parents.remove(key);
        let _ = self.nodes.remove(key);

        Ok(node)
    }

    /// Sets the context data associated with the node
    #[inline]
    pub fn set_node_context(&mut self, node: NodeId, measure: Option<NodeContext>) -> TaffyResult<()> {
        if let Some(journal) = self.journal.as_mut() {
            journal.broken = true;
        }
        let key = node.into();
        if let Some(measure) = measure {
            self.nodes[key].has_context = true;
            self.node_context_data.insert(key, measure);
        } else {
            self.nodes[key].has_context = false;
            self.node_context_data.remove(key);
        }

        self.mark_dirty(node)?;

        Ok(())
    }

    /// Gets a reference to the the context data associated with the node
    #[inline]
    pub fn get_node_context(&self, node: NodeId) -> Option<&NodeContext> {
        self.node_context_data.get(node.into())
    }

    /// The children of `parent`, without allocating. Empty for an unknown node.
    #[inline]
    pub fn child_slice(&self, parent: NodeId) -> &[NodeId] {
        self.children.get(parent.into()).map_or(&[], |children| children.as_slice())
    }

    /// Copy the layout cache and the computed layouts of `source_node` in
    /// `source` onto `node` in this tree.
    ///
    /// This lets a rebuilt tree skip layout of a subtree that has not changed
    /// since `source` was laid out. It is only sound when the two subtrees are
    /// equal: same styles, same structure, and leaves whose measure functions
    /// return the same sizes. The caller copies every node of the subtree.
    pub fn copy_layout_state<SourceContext>(
        &mut self,
        node: NodeId,
        source: &TaffyTree<SourceContext>,
        source_node: NodeId,
    ) -> TaffyResult<()> {
        let source_data =
            source.nodes.get(source_node.into()).ok_or(TaffyError::InvalidInputNode(source_node))?;
        let data = self.nodes.get_mut(node.into()).ok_or(TaffyError::InvalidInputNode(node))?;
        data.cache = source_data.cache.clone();
        data.unrounded_layout = source_data.unrounded_layout;
        data.final_layout = source_data.final_layout;
        data.round_stale = true;
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        {
            data.float_key = source_data.float_key;
            data.float_bands.clone_from(&source_data.float_bands);
        }
        #[cfg(feature = "detailed_layout_info")]
        {
            data.detailed_layout_info = source_data.detailed_layout_info.clone();
        }
        Ok(())
    }

    /// [`Self::copy_layout_state`], moving the cache and layout details out of `source_node`
    /// (left with an empty cache) instead of cloning them
    pub fn take_layout_state<SourceContext>(
        &mut self,
        node: NodeId,
        source: &mut TaffyTree<SourceContext>,
        source_node: NodeId,
    ) -> TaffyResult<()> {
        let source_data =
            source.nodes.get_mut(source_node.into()).ok_or(TaffyError::InvalidInputNode(source_node))?;
        let data = self.nodes.get_mut(node.into()).ok_or(TaffyError::InvalidInputNode(node))?;
        data.cache = core::mem::take(&mut source_data.cache);
        data.last_perform = source_data.last_perform;
        data.unrounded_layout = source_data.unrounded_layout;
        data.final_layout = source_data.final_layout;
        data.round_stale = true;
        #[cfg(all(feature = "block_layout", feature = "float_layout"))]
        {
            data.float_key = source_data.float_key;
            data.float_bands = core::mem::take(&mut source_data.float_bands);
        }
        #[cfg(feature = "detailed_layout_info")]
        {
            data.detailed_layout_info =
                core::mem::replace(&mut source_data.detailed_layout_info, DetailedLayoutInfo::None);
        }
        Ok(())
    }

    /// Gets a mutable reference to the the context data associated with the node
    #[inline]
    pub fn get_node_context_mut(&mut self, node: NodeId) -> Option<&mut NodeContext> {
        self.node_context_data.get_mut(node.into())
    }

    /// Gets mutable references to the the context data associated with the nodes. All keys must be valid and disjoint, otherwise None is returned.
    pub fn get_disjoint_node_context_mut<const N: usize>(
        &mut self,
        keys: [NodeId; N],
    ) -> Option<[&mut NodeContext; N]> {
        self.node_context_data.get_disjoint_mut(keys.map(|k| k.into()))
    }

    /// Adds a `child` node under the supplied `parent`
    pub fn add_child(&mut self, parent: NodeId, child: NodeId) -> TaffyResult<()> {
        self.journal_children(parent);
        let parent_key = parent.into();
        let child_key = child.into();
        self.parents[child_key] = Some(parent);
        self.children[parent_key].push(child);
        self.note_changed(parent);

        Ok(())
    }

    /// Inserts a `child` node at the given `child_index` under the supplied `parent`, shifting all children after it to the right.
    pub fn insert_child_at_index(&mut self, parent: NodeId, child_index: usize, child: NodeId) -> TaffyResult<()> {
        let parent_key = parent.into();

        let child_count = self.children[parent_key].len();
        if child_index > child_count {
            return Err(TaffyError::ChildIndexOutOfBounds { parent, child_index, child_count });
        }

        self.journal_children(parent);
        self.parents[child.into()] = Some(parent);
        self.children[parent_key].insert(child_index, child);
        self.note_changed(parent);

        Ok(())
    }

    /// Directly sets the `children` of the supplied `parent`
    pub fn set_children(&mut self, parent: NodeId, children: &[NodeId]) -> TaffyResult<()> {
        self.journal_children(parent);
        let parent_key = parent.into();

        // Remove node as parent from all its current children.
        for child in &self.children[parent_key] {
            self.parents[(*child).into()] = None;
        }

        // Build up relation node <-> child
        for &child in children {
            // Remove child from previous parent
            if let Some(previous_parent) = self.parents[child.into()] {
                self.remove_child(previous_parent, child).unwrap();
            }
            self.parents[child.into()] = Some(parent);
        }

        let parent_children = &mut self.children[parent_key];
        parent_children.clear();
        children.iter().for_each(|child| parent_children.push(*child));

        self.note_changed(parent);

        Ok(())
    }

    /// Removes the `child` of the parent `node`
    ///
    /// The child is not removed from the tree entirely, it is simply no longer attached to its previous parent.
    pub fn remove_child(&mut self, parent: NodeId, child: NodeId) -> TaffyResult<NodeId> {
        let index = self.children[parent.into()].iter().position(|n| *n == child).unwrap();
        self.remove_child_at_index(parent, index)
    }

    /// Removes the child at the given `index` from the `parent`
    ///
    /// The child is not removed from the tree entirely, it is simply no longer attached to its previous parent.
    pub fn remove_child_at_index(&mut self, parent: NodeId, child_index: usize) -> TaffyResult<NodeId> {
        let parent_key = parent.into();
        let child_count = self.children[parent_key].len();
        if child_index >= child_count {
            return Err(TaffyError::ChildIndexOutOfBounds { parent, child_index, child_count });
        }

        self.journal_children(parent);
        let child = self.children[parent_key].remove(child_index);
        self.parents[child.into()] = None;

        self.note_changed(parent);

        Ok(child)
    }

    /// Removes children at the given range from the `parent`
    ///
    /// Children are not removed from the tree entirely, they are simply no longer attached to their previous parent.
    ///
    /// Function will panic if given range is invalid. See [`core::slice::range`]
    pub fn remove_children_range<R>(&mut self, parent: NodeId, range: R) -> TaffyResult<()>
    where
        R: core::ops::RangeBounds<usize>,
    {
        self.journal_children(parent);
        let parent_key = parent.into();
        for child in self.children[parent_key].drain(range) {
            self.parents[child.into()] = None;
        }

        self.note_changed(parent);
        Ok(())
    }

    /// Replaces the child at the given `child_index` from the `parent` node with the new `child` node
    ///
    /// The child is not removed from the tree entirely, it is simply no longer attached to its previous parent.
    pub fn replace_child_at_index(
        &mut self,
        parent: NodeId,
        child_index: usize,
        new_child: NodeId,
    ) -> TaffyResult<NodeId> {
        let parent_key = parent.into();

        let child_count = self.children[parent_key].len();
        if child_index >= child_count {
            return Err(TaffyError::ChildIndexOutOfBounds { parent, child_index, child_count });
        }

        self.journal_children(parent);
        self.parents[new_child.into()] = Some(parent);
        let old_child = core::mem::replace(&mut self.children[parent_key][child_index], new_child);
        self.parents[old_child.into()] = None;

        self.note_changed(parent);

        Ok(old_child)
    }

    /// Returns the child node of the parent `node` at the provided `child_index`
    #[inline]
    pub fn child_at_index(&self, parent: NodeId, child_index: usize) -> TaffyResult<NodeId> {
        let parent_key = parent.into();
        let child_count = self.children[parent_key].len();
        if child_index >= child_count {
            return Err(TaffyError::ChildIndexOutOfBounds { parent, child_index, child_count });
        }

        Ok(self.children[parent_key][child_index])
    }

    /// Returns the total number of nodes in the tree
    #[inline]
    pub fn total_node_count(&self) -> usize {
        self.nodes.len()
    }

    /// Returns the `NodeId` of the parent node of the specified node (if it exists)
    ///
    /// - Return None if the specified node has no parent
    /// - Panics if the specified node does not exist
    #[inline]
    pub fn parent(&self, child_id: NodeId) -> Option<NodeId> {
        self.parents[child_id.into()]
    }

    /// Returns a list of children that belong to the parent node
    pub fn children(&self, parent: NodeId) -> TaffyResult<Vec<NodeId>> {
        Ok(self.children[parent.into()].clone())
    }

    /// Sets the [`Style`] of the provided `node`
    #[inline]
    pub fn set_style(&mut self, node: NodeId, style: Style) -> TaffyResult<()> {
        // With subtree keys the cached results stay: they carry the key of the subtree they were
        // computed in, so they serve again when the old style comes back. A `calc()` handle the
        // node did not hold before can be a freed handle's address with another value, so a
        // style that brings one empties the caches.
        let keep_cache = self.config.subtree_keys
            && super::subtree_key::calc_handles_kept(&self.nodes[node.into()].style, &style);
        let data = &mut self.nodes[node.into()];
        let old = core::mem::replace(&mut data.style, style);
        let old_key = data.style_key;
        if let Some(journal) = self.journal.as_mut() {
            journal.ops.push(JournalOp::Style(node, old, old_key));
        }
        let data = &mut self.nodes[node.into()];
        data.style_key = None;
        if keep_cache {
            self.note_changed(node);
        } else {
            self.mark_dirty(node)?;
        }
        Ok(())
    }

    /// Gets the [`Style`] of the provided `node`
    #[inline]
    pub fn style(&self, node: NodeId) -> TaffyResult<&Style> {
        Ok(&self.nodes[node.into()].style)
    }

    /// Return this node layout relative to its parent
    #[inline]
    pub fn layout(&self, node: NodeId) -> TaffyResult<&Layout> {
        self.dbg_check_read(node);
        if self.config.use_rounding {
            Ok(&self.nodes[node.into()].final_layout)
        } else {
            Ok(&self.nodes[node.into()].unrounded_layout)
        }
    }

    /// Store a node's unrounded layout, noting a change for the next rounding pass
    #[inline]
    fn store_unrounded_layout(&mut self, node: NodeId, layout: &Layout) {
        let data = &mut self.nodes[node.into()];
        if data.unrounded_layout != *layout || data.round_stale {
            data.unrounded_layout = *layout;
            self.note_layout_changed(node);
        }
    }

    /// The node's unrounded layout changed: round it and every node on its path from the root
    /// again (rounding skips a subtree whose layouts and offset are those it rounded last).
    fn note_layout_changed(&mut self, node: NodeId) {
        self.nodes[node.into()].round_stale = true;
        let mut current = self.parents[node.into()];
        while let Some(parent) = current {
            let data = &mut self.nodes[parent.into()];
            if data.round_subtree_stale {
                break;
            }
            data.round_subtree_stale = true;
            current = self.parents[parent.into()];
        }
    }

    /// Move a laid-out node by (dx, dy) relative to its parent, after layout
    /// (CSS fragmentation moves a box into a later column). The rounded
    /// layout moves by the rounded offset.
    pub fn translate_layout(&mut self, node: NodeId, dx: f32, dy: f32) {
        let data = &mut self.nodes[node.into()];
        data.unrounded_layout.location.x += dx;
        data.unrounded_layout.location.y += dy;
        data.final_layout.location.x += dx.round();
        data.final_layout.location.y += dy.round();
        self.note_layout_changed(node);
    }

    /// Returns this node layout with unrounded values relative to its parent.
    #[inline]
    pub fn unrounded_layout(&self, node: NodeId) -> &Layout {
        self.dbg_check_read(node);
        &self.nodes[node.into()].unrounded_layout
    }

    /// Get the "detailed layout info" for a node.
    ///
    /// Currently this is only implemented for CSS Grid containers where it contains
    /// the computed size of each grid track and the computed placement of each grid item
    #[cfg(feature = "detailed_layout_info")]
    #[inline]
    pub fn detailed_layout_info(&self, node_id: NodeId) -> &DetailedLayoutInfo {
        &self.nodes[node_id.into()].detailed_layout_info
    }

    /// Float exclusion bands that shortened the line boxes of a measured leaf during its latest
    /// final layout, relative to its content box. Empty when no float intruded.
    #[cfg(all(feature = "block_layout", feature = "float_layout"))]
    #[inline]
    pub fn leaf_float_bands(&self, node_id: NodeId) -> &[FloatBand] {
        &self.nodes[node_id.into()].float_bands
    }

    /// Set the function that lays out inline formatting context roots (see [`Self::set_inline_root`])
    #[cfg(feature = "block_layout")]
    pub fn set_inline_layout_function(&mut self, function: Option<InlineLayoutFn<NodeContext>>) {
        self.inline_layout = function;
    }

    /// Mark a node as the root of an inline formatting context. Its layout is computed by the
    /// tree's inline layout function; its children are the context's inline boxes.
    pub fn set_inline_root(&mut self, node_id: NodeId, is_inline_root: bool) -> TaffyResult<()> {
        let node = &mut self.nodes[node_id.into()];
        if node.is_inline_root != is_inline_root {
            node.is_inline_root = is_inline_root;
            if let Some(journal) = self.journal.as_mut() {
                journal.ops.push(JournalOp::InlineRoot(node_id, !is_inline_root));
            }
            self.mark_dirty(node_id)?;
        }
        Ok(())
    }

    /// Whether a node is the root of an inline formatting context
    pub fn is_inline_root(&self, node_id: NodeId) -> bool {
        self.nodes[node_id.into()].is_inline_root
    }

    /// Mark a node whose layout places floats into (or reads floats from) the block formatting
    /// context it belongs to, so that its layout is never served from the cache there.
    pub fn set_float_sensitive(&mut self, node_id: NodeId, float_sensitive: bool) {
        self.nodes[node_id.into()].float_sensitive = float_sensitive;
    }

    /// Key cache entries by the subtree they were computed in, instead of emptying a node's cache
    /// (and its ancestors') when its style or children change.
    ///
    /// A node's subtree key hashes its style, its content key (see [`Self::set_content_key`]),
    /// whether it is an inline root, and the subtree keys of its children. An entry is served only
    /// while the node's subtree key is the one it was stored under, so a layout pass after a
    /// style change computes again what the change reaches, and a pass after the old style is
    /// restored reuses what was computed under it. [`Self::copy_layout_state`] then also carries
    /// over entries a rebuilt tree can reuse wherever its subtree keys equal the old tree's.
    ///
    /// A node with a measure function must have a content key that changes whenever its measure
    /// function would answer differently, or the embedder must call [`Self::mark_dirty`].
    pub fn enable_subtree_keys(&mut self) {
        self.config.subtree_keys = true;
    }

    /// Set what the node's measure function depends on (see [`Self::enable_subtree_keys`])
    pub fn set_content_key(&mut self, node: NodeId, key: u64) {
        if self.nodes[node.into()].content_key != key {
            self.nodes[node.into()].content_key = key;
            self.note_changed(node);
        }
    }

    /// The subtree key of `node` (see [`Self::enable_subtree_keys`]), computed again for every
    /// stale node of its subtree
    pub fn subtree_key(&mut self, node: NodeId) -> u64 {
        self.refresh_subtree_keys(node);
        self.nodes[node.into()].subtree_key
    }

    /// The tag a cache entry of `node` is stored and looked up under: the float context, and the
    /// subtree key when subtree keys are enabled
    #[inline]
    fn entry_tag(&self, node: &NodeData, float_key: u64) -> u64 {
        if self.config.subtree_keys {
            let mut hash = super::subtree_key::KeyHasher::new();
            hash.write(float_key);
            hash.write(node.subtree_key);
            hash.finish()
        } else {
            float_key
        }
    }

    /// The node's style or children changed: its subtree key and every ancestor's are stale, and
    /// rounding visits it again. Without subtree keys, its cache and its ancestors' are emptied.
    fn note_changed(&mut self, node: NodeId) {
        if !self.config.subtree_keys {
            let _ = self.mark_dirty(node);
            return;
        }
        let mut current = Some(node);
        while let Some(id) = current {
            let data = &mut self.nodes[id.into()];
            if data.key_stale && data.round_subtree_stale {
                break;
            }
            data.key_stale = true;
            data.round_subtree_stale = true;
            current = self.parents[id.into()];
        }
    }

    /// Compute the subtree key of every stale node under `root` (children first)
    fn refresh_subtree_keys(&mut self, root: NodeId) {
        if !self.nodes[root.into()].key_stale {
            return;
        }
        let mut stack: Vec<(NodeId, bool)> = Vec::new();
        stack.push((root, false));
        while let Some((node, children_done)) = stack.pop() {
            if !children_done {
                stack.push((node, true));
                for &child in self.children[node.into()].iter() {
                    if self.nodes[child.into()].key_stale {
                        stack.push((child, false));
                    }
                }
                continue;
            }
            let mut hash = super::subtree_key::KeyHasher::new();
            let data = &mut self.nodes[node.into()];
            let style_key = match data.style_key {
                Some(key) => key,
                None => {
                    let key = super::subtree_key::style_key(&data.style);
                    data.style_key = Some(key);
                    key
                }
            };
            hash.write(style_key);
            hash.write(data.content_key);
            hash.write(u64::from(data.has_context) | u64::from(data.is_inline_root) << 1);
            let children = &self.children[node.into()];
            hash.write(children.len() as u64);
            for &child in children.iter() {
                hash.write(self.nodes[child.into()].subtree_key);
            }
            let data = &mut self.nodes[node.into()];
            data.subtree_key = hash.finish();
            data.key_stale = false;
        }
    }

    /// Forget every final layout `node` made, and keep its ancestors' only as earlier results:
    /// state the embedder keeps for the node's layout (an inline formatting context's lines) is
    /// gone, so the node must be laid out again before its layout is final
    pub fn drop_final_layouts(&mut self, node: NodeId) {
        self.nodes[node.into()].cache.drop_final_layouts();
        if let Some(parent) = self.parents[node.into()] {
            self.forget_final_layouts_to_root(parent);
        }
    }

    /// Empty the final layout entries of `node` and its ancestors: their results assumed
    /// layouts of `node`'s subtree that a layout of `node` alone has replaced. Size results stay.
    pub fn forget_final_layouts_to_root(&mut self, node: NodeId) {
        let mut current = Some(node);
        while let Some(id) = current {
            let data = &mut self.nodes[id.into()];
            data.cache.forget_final_layout();
            data.round_subtree_stale = true;
            current = self.parents[id.into()];
        }
    }

    /// Marks the layout of this node and its ancestors as outdated
    pub fn mark_dirty(&mut self, node: NodeId) -> TaffyResult<()> {
        fn mark_dirty_to_root(
            nodes: &mut SlotMap<DefaultKey, NodeData>,
            parents: &SlotMap<DefaultKey, Option<NodeId>>,
            node_key: DefaultKey,
        ) {
            // Always continue to the root: an empty cache does not mean the ancestors are dirty.
            // Nodes laid out beside floats (inline roots, float-sensitive boxes and blocks in a
            // block formatting context with floats) skip the cache, so theirs stays empty while
            // their ancestors keep cached results that must be invalidated. Iterative, so a deep
            // tree cannot overflow the stack.
            let mut current = Some(node_key);
            while let Some(key) = current {
                let _ = nodes[key].mark_dirty();
                // A changed style or child list changes what rounding visits below here.
                nodes[key].round_subtree_stale = true;
                nodes[key].key_stale = true;
                current = parents.get(key).copied().flatten().map(Into::into);
            }
        }

        #[cfg(feature = "std")]
        DIRTY_MARKS.fetch_add(1, core::sync::atomic::Ordering::Relaxed);
        mark_dirty_to_root(&mut self.nodes, &self.parents, node.into());

        Ok(())
    }

    /// Indicates whether the layout of this node needs to be recomputed
    #[inline]
    pub fn dirty(&self, node: NodeId) -> TaffyResult<bool> {
        Ok(self.nodes[node.into()].cache.is_empty())
    }

    /// Updates the stored layout of the provided `node` and its children
    pub fn compute_layout_with_measure<MeasureFunction>(
        &mut self,
        node_id: NodeId,
        available_space: Size<AvailableSpace>,
        measure_function: MeasureFunction,
    ) -> Result<(), TaffyError>
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        let use_rounding = self.config.use_rounding;
        if self.config.subtree_keys {
            self.refresh_subtree_keys(node_id);
        }
        self.last_root = Some(node_id);
        // Laying out a node that has a parent (a measuring pass over one subtree) treats it as a
        // root at the origin. Keep the location its parent gave it, and dirty it so the next
        // layout of the real root places it again instead of reusing a cached parent.
        let parent_location =
            self.parents[node_id.into()].map(|_| self.nodes[node_id.into()].unrounded_layout.location);
        let mut taffy_view = TaffyView { taffy: self, measure_function };
        compute_root_layout(&mut taffy_view, node_id, available_space);
        if use_rounding {
            round_layout(&mut taffy_view, node_id);
        }
        if let Some(location) = parent_location {
            self.nodes[node_id.into()].unrounded_layout.location = location;
            self.note_layout_changed(node_id);
            if self.config.subtree_keys {
                self.forget_final_layouts_to_root(node_id);
            } else {
                let _ = self.mark_dirty(node_id);
            }
        }
        Ok(())
    }

    /// Let a final layout be served from the node's earlier final results (the ones it made
    /// before its subtree or its inputs last changed, kept like its size results), without
    /// laying out its children again. A layout pass after a style change followed by a pass
    /// after the style is restored, as an embedder's fix-up passes do, then only lays out what
    /// the change reaches in both passes.
    ///
    /// The children of such a node keep the layouts of the node's last real layout until they
    /// are placed: before reading the layout of a node that may lie under one, call
    /// [`Self::place_deferred`], and [`Self::place_all_deferred`] before reading the results.
    /// Only nodes laid out outside an inherited block formatting context are deferred.
    pub fn enable_deferred_performs(&mut self) {
        self.config.defer_performs = true;
    }

    /// Debug (`OBSCURA_TAFFY_DEFER_CHECK`): report a read of a layout under a deferred node
    #[cfg(feature = "std")]
    fn dbg_check_read(&self, node: NodeId) {
        static ON: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
        if self.deferred_nodes.is_empty()
            || self.last_root == Some(node)
            || !*ON.get_or_init(|| std::env::var_os("OBSCURA_TAFFY_DEFER_CHECK").is_some())
            || self.deferred_ancestor(node).is_none()
        {
            return;
        }
        static SEEN: std::sync::Mutex<Vec<String>> = std::sync::Mutex::new(Vec::new());
        let trace = std::backtrace::Backtrace::force_capture().to_string();
        let frames: Vec<&str> = trace
            .lines()
            .filter(|line| line.contains("obscura_render::"))
            .map(|line| line.trim())
            .take(3)
            .collect();
        let key = frames.join(" <- ");
        let mut seen = SEEN.lock().unwrap();
        if !seen.contains(&key) {
            std::eprintln!("[defer-read] {key}");
            seen.push(key);
        }
    }

    #[cfg(not(feature = "std"))]
    fn dbg_check_read(&self, _node: NodeId) {}

    /// The nearest ancestor of `node` (not `node` itself) whose children wait to be placed
    pub fn deferred_ancestor(&self, node: NodeId) -> Option<NodeId> {
        if self.deferred_nodes.is_empty() {
            return None;
        }
        let mut current = self.parents.get(node.into()).copied().flatten();
        while let Some(id) = current {
            if self.nodes[id.into()].deferred {
                return Some(id);
            }
            current = self.parents[id.into()];
        }
        None
    }

    /// Lay out the children of `node` again with the inputs its layout was served for
    fn place_one<MeasureFunction>(&mut self, node: NodeId, measure_function: &mut MeasureFunction)
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        let data = &mut self.nodes[node.into()];
        let (true, Some((inputs, in_block_context))) = (data.deferred, data.last_perform) else {
            data.deferred = false;
            return;
        };
        if self.restore_children(node, &inputs) {
            return;
        }
        self.force_perform = Some(node);
        let mut view = TaffyView { taffy: self, measure_function: &mut *measure_function };
        #[cfg(feature = "block_layout")]
        {
            if in_block_context {
                let mut bfc = crate::compute::BlockFormattingContext::new();
                let mut root_context = bfc.root_block_context();
                let mut context = root_context.sub_context(0.0, [0.0, 0.0]);
                let _ = view.compute_child_layout(node, inputs, Some(&mut context));
            } else {
                let _ = view.compute_child_layout(node, inputs, None);
            }
        }
        #[cfg(not(feature = "block_layout"))]
        {
            let _ = in_block_context;
            let _ = view.compute_child_layout(node, inputs);
        }
        self.force_perform = None;
        self.nodes[node.into()].deferred = false;
        self.note_subtree_rounding_stale(node);
    }

    /// `node` and its ancestors round again
    fn note_subtree_rounding_stale(&mut self, node: NodeId) {
        let mut current = Some(node);
        while let Some(id) = current {
            let data = &mut self.nodes[id.into()];
            if data.round_subtree_stale && id != node {
                break;
            }
            data.round_subtree_stale = true;
            current = self.parents[id.into()];
        }
    }

    /// Whether a node's final layout only places its children's layouts, so the children's
    /// layouts and inputs restore it: not an inline formatting context (its line layout lives
    /// with the embedder), a measured leaf or a grid (its track sizes are layout details)
    fn children_restore_layout(&self, node: NodeId) -> bool {
        let data = &self.nodes[node.into()];
        !data.is_inline_root
            && !data.has_context
            && data.style.display != Display::Grid
            && !self.children[node.into()].is_empty()
    }

    /// The children's layouts and inputs as the node's current final layout placed them, if
    /// they restore it (see `Self::children_restore_layout`)
    pub(crate) fn snapshot_children(&self, node: NodeId) -> Option<Box<[super::cache::ChildSnapshot]>> {
        if !self.children_restore_layout(node) {
            return None;
        }
        self.children[node.into()]
            .iter()
            .map(|&child| {
                let data = &self.nodes[child.into()];
                let (input, in_block_context) = data.last_perform?;
                Some(super::cache::ChildSnapshot { layout: data.unrounded_layout, input, in_block_context })
            })
            .collect()
    }

    /// Place `node`'s children at the layouts its earlier final layout for `inputs` placed them
    /// at, when those are known; the children whose own final layout differs then wait to be
    /// placed in turn
    fn restore_children(&mut self, node: NodeId, inputs: &LayoutInput) -> bool {
        if !self.children_restore_layout(node) {
            return false;
        }
        let tag = self.entry_tag(&self.nodes[node.into()], 0);
        let Some(children) = self.nodes[node.into()].cache.restore_final_history(inputs, tag) else {
            return false;
        };
        let children: Vec<super::cache::ChildSnapshot> = children.to_vec();
        let child_ids: Vec<NodeId> = self.children[node.into()].iter().copied().collect();
        for (child, snapshot) in child_ids.into_iter().zip(children.iter()) {
            self.store_unrounded_layout(child, &snapshot.layout);
            let tag = self.entry_tag(&self.nodes[child.into()], 0);
            let data = &mut self.nodes[child.into()];
            data.last_perform = Some((snapshot.input, snapshot.in_block_context));
            let placed = snapshot.input.run_mode != RunMode::PerformLayout
                || data.cache.has_final_layout(&snapshot.input, tag);
            if placed {
                data.deferred = false;
            } else {
                if !data.deferred {
                    self.deferred_nodes.push(child);
                }
                let data = &mut self.nodes[child.into()];
                data.deferred = true;
                data.round_subtree_stale = true;
            }
        }
        self.nodes[node.into()].deferred = false;
        self.note_subtree_rounding_stale(node);
        true
    }

    /// Place every deferred ancestor of `node` from the root down, so `node`'s own layout is
    /// the one its parent's current layout gave it. Returns the root the path ends at.
    fn place_path<MeasureFunction>(&mut self, node: NodeId, measure_function: &mut MeasureFunction) -> NodeId
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        let mut path = Vec::new();
        let mut current = self.parents[node.into()];
        let mut root = node;
        while let Some(id) = current {
            path.push(id);
            root = id;
            current = self.parents[id.into()];
        }
        for &ancestor in path.iter().rev() {
            if self.nodes[ancestor.into()].deferred {
                self.place_one(ancestor, measure_function);
            }
        }
        root
    }

    /// Place the deferred ancestors of each of `nodes` (and with `children` the node itself), then
    /// round what changed, so reading their layouts (and their children's) reads the current ones
    pub fn place_deferred<MeasureFunction>(
        &mut self,
        nodes: &[NodeId],
        children: bool,
        mut measure_function: MeasureFunction,
    )
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        if self.deferred_nodes.is_empty() {
            return;
        }
        let mut roots: Vec<NodeId> = Vec::new();
        for &node in nodes {
            if self.nodes.get(node.into()).is_none() {
                continue;
            }
            let own = children && self.nodes[node.into()].deferred;
            if !own && self.deferred_ancestor(node).is_none() {
                continue;
            }
            let root = self.place_path(node, &mut measure_function);
            if children {
                self.place_one(node, &mut measure_function);
            }
            if !roots.contains(&root) {
                roots.push(root);
            }
        }
        self.round_placed(&roots, &mut measure_function);
    }

    /// A fresh epoch for a call that places deferred nodes (never 0, the epoch of no call)
    fn next_place_epoch(&mut self) -> u32 {
        self.place_epoch = self.place_epoch.wrapping_add(1).max(1);
        self.place_epoch
    }

    /// Whether the parent of `node` was placed by the call of `epoch`
    fn parent_placed_in(&self, node: NodeId, epoch: u32) -> bool {
        self.parents[node.into()].is_some_and(|parent| self.nodes[parent.into()].placed_in == epoch)
    }

    /// Place every deferred node under `root` and round the tree: afterwards every layout is
    /// the one the last layout pass made
    pub fn place_all_deferred<MeasureFunction>(&mut self, root: NodeId, mut measure_function: MeasureFunction)
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        if self.deferred_nodes.is_empty() {
            return;
        }
        let epoch = self.next_place_epoch();
        while !self.deferred_nodes.is_empty() {
            let pending = core::mem::take(&mut self.deferred_nodes);
            for node in pending {
                if self.nodes.get(node.into()).is_none_or(|data| !data.deferred) {
                    continue;
                }
                // A node whose parent this call placed lies under `root`, and every deferred
                // ancestor of it was placed before its parent was.
                if !self.parent_placed_in(node, epoch) {
                    // A node outside the tree under `root` keeps its layouts as they are.
                    let mut top = node;
                    while let Some(parent) = self.parents[top.into()] {
                        top = parent;
                    }
                    if top != root {
                        self.nodes[node.into()].deferred = false;
                        continue;
                    }
                    self.place_path(node, &mut measure_function);
                }
                self.place_one(node, &mut measure_function);
                self.nodes[node.into()].placed_in = epoch;
            }
        }
        self.round_placed(&[root], &mut measure_function);
    }

    /// Place every deferred node in the subtrees of `roots` (and the paths to them), so every
    /// layout in them is the one the last layout pass made
    pub fn place_all_deferred_under<MeasureFunction>(&mut self, roots: &[NodeId], mut measure_function: MeasureFunction)
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        if self.deferred_nodes.is_empty() || roots.is_empty() {
            return;
        }
        let mut tops: Vec<NodeId> = Vec::new();
        for &root in roots {
            if self.nodes.get(root.into()).is_none() {
                continue;
            }
            let top = self.place_path(root, &mut measure_function);
            if !tops.contains(&top) {
                tops.push(top);
            }
        }
        let epoch = self.next_place_epoch();
        loop {
            let mut placed_any = false;
            let pending = core::mem::take(&mut self.deferred_nodes);
            let mut keep = Vec::new();
            for node in pending {
                if self.nodes.get(node.into()).is_none_or(|data| !data.deferred) {
                    continue;
                }
                // A node whose parent this call placed lies in one of the subtrees, and every
                // deferred ancestor of it was placed before its parent was.
                if !self.parent_placed_in(node, epoch) {
                    let mut current = Some(node);
                    let mut inside = false;
                    while let Some(id) = current {
                        if roots.contains(&id) {
                            inside = true;
                            break;
                        }
                        current = self.parents[id.into()];
                    }
                    if !inside {
                        keep.push(node);
                        continue;
                    }
                    self.place_path(node, &mut measure_function);
                }
                self.place_one(node, &mut measure_function);
                self.nodes[node.into()].placed_in = epoch;
                placed_any = true;
            }
            keep.append(&mut self.deferred_nodes);
            self.deferred_nodes = keep;
            if !placed_any {
                break;
            }
        }
        self.round_placed(&tops, &mut measure_function);
    }

    /// Round the trees under `roots` again where placing changed layouts
    fn round_placed<MeasureFunction>(&mut self, roots: &[NodeId], measure_function: &mut MeasureFunction)
    where
        MeasureFunction:
            FnMut(Size<Option<f32>>, Size<AvailableSpace>, NodeId, Option<&mut NodeContext>, &Style) -> Size<f32>,
    {
        if !self.config.use_rounding {
            return;
        }
        for &root in roots {
            let mut view = TaffyView { taffy: self, measure_function: &mut *measure_function };
            round_layout(&mut view, root);
        }
    }

    /// Updates the stored layout of the provided `node` and its children
    pub fn compute_layout(&mut self, node: NodeId, available_space: Size<AvailableSpace>) -> Result<(), TaffyError> {
        self.compute_layout_with_measure(node, available_space, |_, _, _, _, _| Size::ZERO)
    }

    /// Prints a debug representation of the tree's layout
    #[cfg(feature = "std")]
    pub fn print_tree(&mut self, root: NodeId) {
        crate::util::print_tree(self, root)
    }

    /// Returns an instance of LayoutTree representing the TaffyTree
    #[cfg(test)]
    pub(crate) fn as_layout_tree(&mut self) -> impl LayoutPartialTree + CacheTree + '_ {
        TaffyView { taffy: self, measure_function: |_, _, _, _, _| Size::ZERO }
    }
}

#[cfg(test)]
mod tests {

    use super::*;
    use crate::style::{Dimension, Display, FlexDirection};
    use crate::style_helpers::*;
    use crate::util::sys;

    fn size_measure_function(
        known_dimensions: Size<Option<f32>>,
        _available_space: Size<AvailableSpace>,
        _node_id: NodeId,
        node_context: Option<&mut Size<f32>>,
        _style: &Style,
    ) -> Size<f32> {
        known_dimensions.unwrap_or(node_context.cloned().unwrap_or(Size::ZERO))
    }

    #[test]
    fn new_should_allocate_default_capacity() {
        const DEFAULT_CAPACITY: usize = 16; // This is the capacity defined in the `impl Default`
        let taffy: TaffyTree<()> = TaffyTree::new();

        assert!(taffy.children.capacity() >= DEFAULT_CAPACITY);
        assert!(taffy.parents.capacity() >= DEFAULT_CAPACITY);
        assert!(taffy.nodes.capacity() >= DEFAULT_CAPACITY);
    }

    #[test]
    fn test_with_capacity() {
        const CAPACITY: usize = 8;
        let taffy: TaffyTree<()> = TaffyTree::with_capacity(CAPACITY);

        assert!(taffy.children.capacity() >= CAPACITY);
        assert!(taffy.parents.capacity() >= CAPACITY);
        assert!(taffy.nodes.capacity() >= CAPACITY);
    }

    #[test]
    fn test_new_leaf() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let res = taffy.new_leaf(Style::default());
        assert!(res.is_ok());
        let node = res.unwrap();

        // node should be in the taffy tree and have no children
        assert!(taffy.child_count(node) == 0);
    }

    #[test]
    fn new_leaf_with_context() {
        let mut taffy: TaffyTree<Size<f32>> = TaffyTree::new();

        let res = taffy.new_leaf_with_context(Style::default(), Size::ZERO);
        assert!(res.is_ok());
        let node = res.unwrap();

        // node should be in the taffy tree and have no children
        assert!(taffy.child_count(node) == 0);
    }

    /// Test that new_with_children works as expected
    #[test]
    fn test_new_with_children() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        // node should have two children
        assert_eq!(taffy.child_count(node), 2);
        assert_eq!(taffy.children(node).unwrap()[0], child0);
        assert_eq!(taffy.children(node).unwrap()[1], child1);
    }

    #[test]
    fn remove_node_should_remove() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let node = taffy.new_leaf(Style::default()).unwrap();

        let _ = taffy.remove(node).unwrap();
    }

    #[test]
    fn remove_node_should_detach_hierarchy() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        // Build a linear tree layout: <0> <- <1> <- <2>
        let node2 = taffy.new_leaf(Style::default()).unwrap();
        let node1 = taffy.new_with_children(Style::default(), &[node2]).unwrap();
        let node0 = taffy.new_with_children(Style::default(), &[node1]).unwrap();

        // Both node0 and node1 should have 1 child nodes
        assert_eq!(taffy.children(node0).unwrap().as_slice(), &[node1]);
        assert_eq!(taffy.children(node1).unwrap().as_slice(), &[node2]);

        // Disconnect the tree: <0> <2>
        let _ = taffy.remove(node1).unwrap();

        // Both remaining nodes should have no child nodes
        assert!(taffy.children(node0).unwrap().is_empty());
        assert!(taffy.children(node2).unwrap().is_empty());
    }

    #[test]
    fn remove_last_node() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let parent = taffy.new_leaf(Style::default()).unwrap();
        let child = taffy.new_leaf(Style::default()).unwrap();
        taffy.add_child(parent, child).unwrap();

        taffy.remove(child).unwrap();
        taffy.remove(parent).unwrap();
    }

    #[test]
    fn set_measure() {
        let mut taffy: TaffyTree<Size<f32>> = TaffyTree::new();
        let node = taffy.new_leaf_with_context(Style::default(), Size { width: 200.0, height: 200.0 }).unwrap();
        taffy.compute_layout_with_measure(node, Size::MAX_CONTENT, size_measure_function).unwrap();
        assert_eq!(taffy.layout(node).unwrap().size.width, 200.0);

        taffy.set_node_context(node, Some(Size { width: 100.0, height: 100.0 })).unwrap();
        taffy.compute_layout_with_measure(node, Size::MAX_CONTENT, size_measure_function).unwrap();
        assert_eq!(taffy.layout(node).unwrap().size.width, 100.0);
    }

    #[test]
    fn set_measure_of_previously_unmeasured_node() {
        let mut taffy: TaffyTree<Size<f32>> = TaffyTree::new();
        let node = taffy.new_leaf(Style::default()).unwrap();
        taffy.compute_layout_with_measure(node, Size::MAX_CONTENT, size_measure_function).unwrap();
        assert_eq!(taffy.layout(node).unwrap().size.width, 0.0);

        taffy.set_node_context(node, Some(Size { width: 100.0, height: 100.0 })).unwrap();
        taffy.compute_layout_with_measure(node, Size::MAX_CONTENT, size_measure_function).unwrap();
        assert_eq!(taffy.layout(node).unwrap().size.width, 100.0);
    }

    /// Test that adding `add_child()` works
    #[test]
    fn add_child() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let node = taffy.new_leaf(Style::default()).unwrap();
        assert_eq!(taffy.child_count(node), 0);

        let child0 = taffy.new_leaf(Style::default()).unwrap();
        taffy.add_child(node, child0).unwrap();
        assert_eq!(taffy.child_count(node), 1);

        let child1 = taffy.new_leaf(Style::default()).unwrap();
        taffy.add_child(node, child1).unwrap();
        assert_eq!(taffy.child_count(node), 2);
    }

    #[test]
    fn insert_child_at_index() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let child2 = taffy.new_leaf(Style::default()).unwrap();

        let node = taffy.new_leaf(Style::default()).unwrap();
        assert_eq!(taffy.child_count(node), 0);

        taffy.insert_child_at_index(node, 0, child0).unwrap();
        assert_eq!(taffy.child_count(node), 1);
        assert_eq!(taffy.children(node).unwrap()[0], child0);

        taffy.insert_child_at_index(node, 0, child1).unwrap();
        assert_eq!(taffy.child_count(node), 2);
        assert_eq!(taffy.children(node).unwrap()[0], child1);
        assert_eq!(taffy.children(node).unwrap()[1], child0);

        taffy.insert_child_at_index(node, 1, child2).unwrap();
        assert_eq!(taffy.child_count(node), 3);
        assert_eq!(taffy.children(node).unwrap()[0], child1);
        assert_eq!(taffy.children(node).unwrap()[1], child2);
        assert_eq!(taffy.children(node).unwrap()[2], child0);
    }

    #[test]
    fn set_children() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        assert_eq!(taffy.child_count(node), 2);
        assert_eq!(taffy.children(node).unwrap()[0], child0);
        assert_eq!(taffy.children(node).unwrap()[1], child1);

        let child2 = taffy.new_leaf(Style::default()).unwrap();
        let child3 = taffy.new_leaf(Style::default()).unwrap();
        taffy.set_children(node, &[child2, child3]).unwrap();

        assert_eq!(taffy.child_count(node), 2);
        assert_eq!(taffy.children(node).unwrap()[0], child2);
        assert_eq!(taffy.children(node).unwrap()[1], child3);
    }

    /// Test that removing a child works
    #[test]
    fn remove_child() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        assert_eq!(taffy.child_count(node), 2);

        taffy.remove_child(node, child0).unwrap();
        assert_eq!(taffy.child_count(node), 1);
        assert_eq!(taffy.children(node).unwrap()[0], child1);

        taffy.remove_child(node, child1).unwrap();
        assert_eq!(taffy.child_count(node), 0);
    }

    #[test]
    fn remove_child_at_index() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        assert_eq!(taffy.child_count(node), 2);

        taffy.remove_child_at_index(node, 0).unwrap();
        assert_eq!(taffy.child_count(node), 1);
        assert_eq!(taffy.children(node).unwrap()[0], child1);

        taffy.remove_child_at_index(node, 0).unwrap();
        assert_eq!(taffy.child_count(node), 0);
    }

    #[test]
    fn remove_children_range() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let child2 = taffy.new_leaf(Style::default()).unwrap();
        let child3 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1, child2, child3]).unwrap();

        assert_eq!(taffy.child_count(node), 4);

        taffy.remove_children_range(node, 1..=2).unwrap();
        assert_eq!(taffy.child_count(node), 2);
        assert_eq!(taffy.children(node).unwrap(), [child0, child3]);
        for child in [child0, child3] {
            assert_eq!(taffy.parent(child), Some(node));
        }
        for child in [child1, child2] {
            assert_eq!(taffy.parent(child), None);
        }
    }

    // Related to: https://github.com/DioxusLabs/taffy/issues/510
    #[test]
    fn remove_child_updates_parents() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let parent = taffy.new_leaf(Style::default()).unwrap();
        let child = taffy.new_leaf(Style::default()).unwrap();

        taffy.add_child(parent, child).unwrap();

        taffy.remove(parent).unwrap();

        // Once the parent is removed this shouldn't panic.
        assert!(taffy.set_children(child, &[]).is_ok());
    }

    #[test]
    fn replace_child_at_index() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();

        let node = taffy.new_with_children(Style::default(), &[child0]).unwrap();
        assert_eq!(taffy.child_count(node), 1);
        assert_eq!(taffy.children(node).unwrap()[0], child0);

        taffy.replace_child_at_index(node, 0, child1).unwrap();
        assert_eq!(taffy.child_count(node), 1);
        assert_eq!(taffy.children(node).unwrap()[0], child1);
    }
    #[test]
    fn test_child_at_index() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let child2 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1, child2]).unwrap();

        assert!(if let Ok(result) = taffy.child_at_index(node, 0) { result == child0 } else { false });
        assert!(if let Ok(result) = taffy.child_at_index(node, 1) { result == child1 } else { false });
        assert!(if let Ok(result) = taffy.child_at_index(node, 2) { result == child2 } else { false });
    }
    #[test]
    fn test_child_count() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        assert!(taffy.child_count(node) == 2);
        assert!(taffy.child_count(child0) == 0);
        assert!(taffy.child_count(child1) == 0);
    }

    #[allow(clippy::vec_init_then_push)]
    #[test]
    fn test_children() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        let mut children = sys::Vec::new();
        children.push(child0);
        children.push(child1);

        let children_result = taffy.children(node).unwrap();
        assert_eq!(children_result, children);

        assert!(taffy.children(child0).unwrap().is_empty());
    }
    #[test]
    fn test_set_style() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let node = taffy.new_leaf(Style::default()).unwrap();
        assert_eq!(taffy.style(node).unwrap().display, Display::Flex);

        taffy.set_style(node, Style { display: Display::None, ..Style::default() }).unwrap();
        assert_eq!(taffy.style(node).unwrap().display, Display::None);
    }
    #[test]
    fn test_style() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let style = Style { display: Display::None, flex_direction: FlexDirection::RowReverse, ..Default::default() };

        let node = taffy.new_leaf(style.clone()).unwrap();

        let res = taffy.style(node);
        assert!(res.is_ok());
        assert!(res.unwrap() == &style);
    }
    #[test]
    fn test_layout() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let node = taffy.new_leaf(Style::default()).unwrap();

        // TODO: Improve this test?
        let res = taffy.layout(node);
        assert!(res.is_ok());
    }

    #[test]
    fn test_mark_dirty() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child0 = taffy.new_leaf(Style::default()).unwrap();
        let child1 = taffy.new_leaf(Style::default()).unwrap();
        let node = taffy.new_with_children(Style::default(), &[child0, child1]).unwrap();

        taffy.compute_layout(node, Size::MAX_CONTENT).unwrap();

        assert_eq!(taffy.dirty(child0), Ok(false));
        assert_eq!(taffy.dirty(child1), Ok(false));
        assert_eq!(taffy.dirty(node), Ok(false));

        taffy.mark_dirty(node).unwrap();
        assert_eq!(taffy.dirty(child0), Ok(false));
        assert_eq!(taffy.dirty(child1), Ok(false));
        assert_eq!(taffy.dirty(node), Ok(true));

        taffy.compute_layout(node, Size::MAX_CONTENT).unwrap();
        taffy.mark_dirty(child0).unwrap();
        assert_eq!(taffy.dirty(child0), Ok(true));
        assert_eq!(taffy.dirty(child1), Ok(false));
        assert_eq!(taffy.dirty(node), Ok(true));
    }

    #[test]
    fn compute_layout_should_produce_valid_result() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let node_result = taffy.new_leaf(Style {
            size: Size { width: Dimension::from_length(10f32), height: Dimension::from_length(10f32) },
            ..Default::default()
        });
        assert!(node_result.is_ok());
        let node = node_result.unwrap();
        let layout_result = taffy.compute_layout(
            node,
            Size { width: AvailableSpace::Definite(100.), height: AvailableSpace::Definite(100.) },
        );
        assert!(layout_result.is_ok());
    }

    #[test]
    fn make_sure_layout_location_is_top_left() {
        use crate::prelude::*;

        let mut taffy: TaffyTree<()> = TaffyTree::new();

        let node = taffy
            .new_leaf(Style {
                size: Size { width: Dimension::from_percent(1f32), height: Dimension::from_percent(1f32) },
                ..Default::default()
            })
            .unwrap();

        let root = taffy
            .new_with_children(
                Style {
                    size: Size { width: Dimension::from_length(100f32), height: Dimension::from_length(100f32) },
                    padding: Rect {
                        left: length(10f32),
                        right: length(20f32),
                        top: length(30f32),
                        bottom: length(40f32),
                    },
                    ..Default::default()
                },
                &[node],
            )
            .unwrap();

        taffy.compute_layout(root, Size::MAX_CONTENT).unwrap();

        // If Layout::location represents top-left coord, 'node' location
        // must be (due applied 'root' padding): {x: 10, y: 30}.
        //
        // It's important, since result will be different for each other
        // coordinate space:
        // - bottom-left:  {x: 10, y: 40}
        // - top-right:    {x: 20, y: 30}
        // - bottom-right: {x: 20, y: 40}
        let layout = taffy.layout(node).unwrap();
        assert_eq!(layout.location.x, 10f32);
        assert_eq!(layout.location.y, 30f32);
    }

    #[test]
    fn set_children_reparents() {
        let mut taffy: TaffyTree<()> = TaffyTree::new();
        let child = taffy.new_leaf(Style::default()).unwrap();
        let old_parent = taffy.new_with_children(Style::default(), &[child]).unwrap();

        let new_parent = taffy.new_leaf(Style::default()).unwrap();
        taffy.set_children(new_parent, &[child]).unwrap();

        assert!(taffy.children(old_parent).unwrap().is_empty());
    }
}
