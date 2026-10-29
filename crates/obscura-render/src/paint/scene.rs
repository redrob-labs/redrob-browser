//! GPU compositor frames (crates/redrob-scene, docs/COMPOSITOR.md).
//!
//! A scene is recorded from the same paint as a screenshot: the painter runs
//! over the whole document at zero scroll with a recording canvas that keeps
//! the ops and writes no pixels ([`crate::display_list::record_scene`]).
//! Every op carries the DOM node being painted, which places it in the
//! spatial tree: the document scroller, each `overflow: auto|scroll` element,
//! each `position: sticky` box, fixed content on the root, and a reference
//! frame per transformed subtree. Text arrives as glyph runs in the fonts the
//! engine shaped with, images by content id, and hit regions in paint order.
//!
//! Scrolling and sticky positioning are left to the compositor: compositor
//! scrollers are painted at offset zero without their own overflow clip, and
//! sticky boxes at their normal-flow position. Content that only script can
//! scroll (`overflow: hidden`) stays painted at its live offset.

use std::cell::RefCell;
use std::collections::{HashMap, HashSet};
use std::hash::{DefaultHasher, Hash, Hasher};
use std::sync::Arc;

use obscura_dom::tree::{DomTree, NodeId};
use redrob_scene as rs;
use tiny_skia::Pixmap;

use super::{
    canvas_background_source, paint_laid_dom_scrolled, CanvasSurfaceSource, CaptureError,
    PreparedRender, RenderResourceCache, ResolvedScrollState, SCENE_CONTENT_FLAG,
};
use crate::display_list::{self, Brush, Extend, Op, Rule, Verb};

// ---------------------------------------------------------------------------
// Fonts

/// Bytes of one font file the scene references.
enum FontBytes {
    Cosmic(Arc<cosmic_text::Font>),
    Static(&'static [u8]),
}

struct FontEntry {
    bytes: FontBytes,
    index: u32,
}

/// A font file the scene references, shared with the font registry.
#[derive(Clone)]
pub struct SceneFontData(Arc<FontEntry>);

// The font bytes are immutable once loaded; cosmic-text's `Font` keeps
// shaping state the scene never touches.
unsafe impl Send for SceneFontData {}
unsafe impl Sync for SceneFontData {}

impl SceneFontData {
    pub fn bytes(&self) -> &[u8] {
        match &self.0.bytes {
            FontBytes::Cosmic(font) => font.data(),
            FontBytes::Static(bytes) => bytes,
        }
    }

    pub fn index(&self) -> u32 {
        self.0.index
    }
}

#[derive(Default)]
struct FontRegistry {
    fonts: HashMap<u64, Arc<FontEntry>>,
    /// (data address, data length, face index) -> id, so a face is hashed
    /// once however many glyphs use it.
    by_address: HashMap<(usize, usize, u32), u64>,
    /// Variation instances: id -> (base font id, axes).
    instances: HashMap<u64, (u64, Vec<([u8; 4], f32)>)>,
}

thread_local! {
    static FONTS: RefCell<FontRegistry> = RefCell::new(FontRegistry::default());
}

/// A content id for a font face: stable across text engines and frames.
fn font_content_id(data: &[u8], index: u32) -> u64 {
    let mut hasher = DefaultHasher::new();
    data.len().hash(&mut hasher);
    index.hash(&mut hasher);
    data[..data.len().min(4096)].hash(&mut hasher);
    data[data.len().saturating_sub(4096)..].hash(&mut hasher);
    let step = (data.len() / 509).max(1);
    let mut i = 0;
    while i < data.len() {
        data[i].hash(&mut hasher);
        i += step;
    }
    hasher.finish()
}

fn register_font(bytes: FontBytes, index: u32) -> u64 {
    let (address, len) = {
        let data: &[u8] = match &bytes {
            FontBytes::Cosmic(font) => font.data(),
            FontBytes::Static(data) => data,
        };
        (data.as_ptr() as usize, data.len())
    };
    FONTS.with(|registry| {
        let mut registry = registry.borrow_mut();
        if let Some(&id) = registry.by_address.get(&(address, len, index)) {
            if registry.fonts.contains_key(&id) {
                return id;
            }
        }
        let data: &[u8] = match &bytes {
            FontBytes::Cosmic(font) => font.data(),
            FontBytes::Static(data) => data,
        };
        let id = font_content_id(data, index);
        registry.by_address.insert((address, len, index), id);
        registry
            .fonts
            .entry(id)
            .or_insert_with(|| Arc::new(FontEntry { bytes, index }));
        id
    })
}

/// Scene font id of a face cosmic-text shaped with.
pub(crate) fn cosmic_font_id(
    font_system: &mut cosmic_text::FontSystem,
    id: cosmic_text::fontdb::ID,
) -> Option<u64> {
    let index = font_system.db().face(id).map(|face| face.index)?;
    let font = font_system.get_font(id)?;
    Some(register_font(FontBytes::Cosmic(font), index))
}

/// Scene font id of one of the embedded fallback faces.
pub(crate) fn static_font_id(bytes: &'static [u8]) -> u64 {
    register_font(FontBytes::Static(bytes), 0)
}

/// Scene font id of a variable font at `axes`.
pub(crate) fn font_instance_id(base: u64, axes: &[([u8; 4], f32)]) -> u64 {
    if axes.is_empty() {
        return base;
    }
    let mut hasher = DefaultHasher::new();
    base.hash(&mut hasher);
    for (tag, value) in axes {
        tag.hash(&mut hasher);
        value.to_bits().hash(&mut hasher);
    }
    let id = hasher.finish();
    FONTS.with(|registry| {
        registry
            .borrow_mut()
            .instances
            .entry(id)
            .or_insert_with(|| (base, axes.to_vec()));
    });
    id
}

fn font_data(id: u64) -> Option<SceneFontData> {
    FONTS.with(|registry| registry.borrow().fonts.get(&id).cloned().map(SceneFontData))
}

fn font_instance(id: u64) -> Option<(u64, Vec<([u8; 4], f32)>)> {
    FONTS.with(|registry| registry.borrow().instances.get(&id).cloned())
}

/// The ab_glyph fallback text path as glyph runs.
#[allow(clippy::too_many_arguments)]
pub(crate) fn scene_draw_text(
    pixmap: &Pixmap,
    text: &str,
    origin: (f32, f32),
    color: [u8; 4],
    size: f32,
    is_bold: bool,
    font_bytes: &'static [u8],
    letter_spacing: f32,
    word_spacing: f32,
    clip: Option<crate::Rect>,
    clip_mask: Option<&tiny_skia::Mask>,
) -> bool {
    use ab_glyph::{Font, FontRef, PxScale, ScaleFont};
    if !display_list::scene_clip_known(clip_mask) {
        return false;
    }
    if color[3] == 0 {
        return true;
    }
    let Ok(font) = FontRef::try_from_slice(font_bytes) else {
        return false;
    };
    let scaled = font.as_scaled(PxScale::from(size));
    // ab_glyph scales by ascent - descent; the scene's size is the em size.
    let em = size * font.units_per_em().unwrap_or(1000.0) / font.height_unscaled().max(1.0);
    let mut x = origin.0;
    let y = origin.1 + scaled.ascent();
    let mut glyphs = Vec::new();
    let mut extent = (x, x);
    for c in text.chars() {
        if c.is_control() {
            continue;
        }
        let id = font.glyph_id(c);
        glyphs.push((id.0 as u32, x, y));
        x += scaled.h_advance(id)
            + if is_bold { 1.0 } else { 0.0 }
            + letter_spacing
            + if matches!(c, ' ' | '\u{00a0}') {
                word_spacing
            } else {
                0.0
            };
        extent.1 = x;
    }
    let clip = clip.map(|c| [c.x, c.y, c.width, c.height]);
    let font_id = static_font_id(font_bytes);
    display_list::emit_scene_op(
        pixmap,
        clip_mask,
        clip,
        Op::Glyphs {
            font: font_id,
            size: em,
            color: color.map(|c| c as f32 / 255.0),
            glyphs,
            synthetic_bold: is_bold,
            skew: 0.0,
            transform: display_list::IDENTITY,
        },
    );
    let node = display_list::current_node();
    if extent.1 > extent.0 {
        display_list::emit_scene_marker(
            pixmap,
            Op::Hit {
                node,
                rect: [
                    extent.0,
                    origin.1,
                    extent.1 - extent.0,
                    scaled.height().max(size),
                ],
                radii: [0.0; 4],
                clip,
                text: true,
                transform: display_list::IDENTITY,
            },
        );
    }
    true
}

// ---------------------------------------------------------------------------
// Output

/// An image a frame references: premultiplied RGBA8.
#[derive(Clone, Debug)]
pub struct SceneImageResource {
    pub id: rs::ImageId,
    pub width: u32,
    pub height: u32,
    pub rgba: Arc<Vec<u8>>,
}

/// A font file a frame references.
#[derive(Clone)]
pub struct SceneFontResource {
    pub id: rs::FontId,
    pub data: SceneFontData,
}

/// A variable-font instance a frame references.
#[derive(Clone, Debug)]
pub struct SceneFontInstance {
    pub id: rs::FontId,
    pub font: rs::FontId,
    pub axes: Vec<([u8; 4], f32)>,
}

/// One built frame and everything it references.
pub struct SceneFrame {
    /// `epoch` is 0; the channel numbers frames.
    pub frame: rs::Frame,
    pub images: Vec<SceneImageResource>,
    pub fonts: Vec<SceneFontResource>,
    pub font_instances: Vec<SceneFontInstance>,
    /// Scroll nodes: DOM node (0 for the document) -> index in
    /// `frame.spatial`, for spatial-only deltas when script scrolls.
    pub scroll_nodes: Vec<(u64, usize)>,
    /// Scroll nodes whose content only script can move (`overflow: hidden`)
    /// are not compositor scrollers; when script scrolls one of these the
    /// frame must be rebuilt rather than sent as a delta.
    pub baked_scrollers: Vec<u64>,
    pub stats: SceneStats,
}

#[derive(Clone, Copy, Debug, Default)]
pub struct SceneStats {
    pub paint_ms: f32,
    pub assemble_ms: f32,
    pub document: (u32, u32),
    pub ops: usize,
}

// ---------------------------------------------------------------------------
// Scroll state for scene paint

/// Scroll resolution for a scene paint, next to the live one.
struct SceneScroll {
    /// Painted state: compositor scrollers at zero, script-only scrollers live.
    paint: ResolvedScrollState,
    /// Live state, for the offsets the compositor starts from.
    live: ResolvedScrollState,
    /// Per ScrollId: the compositor scrolls it (root always).
    compositor: Vec<bool>,
    /// Per ScrollId: user-scrollable axes.
    axes: Vec<(bool, bool)>,
    /// Sticky frames the compositor positions, by element.
    sticky: HashMap<NodeId, crate::dom::SceneStickyFrame>,
    /// The overflow clip a sticky element inherited from outside before its
    /// clip chain restarted in the sticky frame.
    sticky_clips: HashMap<NodeId, crate::dom::OverflowClip>,
}

impl PreparedRender {
    fn resolve_scene_scroll_state(
        &self,
        tree: &DomTree,
        requested_root: (f32, f32),
        requested_elements: &HashMap<NodeId, (f32, f32)>,
    ) -> SceneScroll {
        let viewport = self.viewport;
        let live = self.resolve_scroll_state(tree, requested_root, requested_elements);
        let containers = &self.scroll_tree.containers;
        let mut compositor = vec![false; containers.len()];
        let mut axes = vec![(false, false); containers.len()];
        compositor[0] = true;
        axes[0] = self.root_user_axes(tree);
        let mut unclipped = HashSet::new();
        for (index, container) in containers.iter().enumerate().skip(1) {
            let Some(node) = container.node else {
                continue;
            };
            let Some(style) = self.layout.styles.get(&node) else {
                continue;
            };
            let user = crate::style::user_scrollable_axes(style);
            axes[index] = user;
            if user.0 || user.1 {
                compositor[index] = true;
                unclipped.insert(node);
            }
        }

        let offsets: Vec<(f32, f32)> = (0..containers.len())
            .map(|index| {
                if compositor[index] {
                    (0.0, 0.0)
                } else {
                    live.container_offsets
                        .get(index)
                        .copied()
                        .unwrap_or((0.0, 0.0))
                }
            })
            .collect();
        let mut cumulative = vec![(0.0, 0.0); offsets.len()];
        for index in 1..offsets.len() {
            let inherited = containers[index]
                .parent
                .map(|parent| cumulative[parent.index()])
                .unwrap_or((0.0, 0.0));
            cumulative[index] = (
                inherited.0 - offsets[index].0,
                inherited.1 - offsets[index].1,
            );
        }
        let node_len = self.scroll_tree.movement_owner.len();
        let mut node_movement = vec![(0.0, 0.0); node_len];
        for (index, owner) in self.scroll_tree.movement_owner.iter().copied().enumerate() {
            if let Some(owner) = owner {
                node_movement[index] = cumulative[owner.index()];
            }
        }

        let sticky: HashMap<NodeId, crate::dom::SceneStickyFrame> = self
            .sticky
            .scene_frames(viewport, &self.scroll_tree)
            .into_iter()
            .filter(|frame| {
                compositor
                    .get(frame.scroll_owner.index())
                    .copied()
                    .unwrap_or(false)
            })
            .map(|frame| (frame.id, frame))
            .collect();
        for (id, offset) in
            self.sticky
                .resolved_translations(viewport, &self.scroll_tree, &cumulative)
        {
            let positioned_by_compositor = self
                .sticky
                .owner_of(id)
                .is_some_and(|owner| sticky.contains_key(&owner));
            if positioned_by_compositor {
                continue;
            }
            if let Some(movement) = node_movement.get_mut(id.index()) {
                movement.0 += offset.0;
                movement.1 += offset.1;
            }
        }

        let mut inherited_clips = vec![None; node_len];
        let mut sticky_clips = HashMap::new();
        #[allow(clippy::too_many_arguments)]
        fn resolve_clips(
            tree: &DomTree,
            laid: &crate::DomLayout,
            movement: &[(f32, f32)],
            viewport_fixed: &HashSet<NodeId>,
            unclipped: &HashSet<NodeId>,
            sticky: &HashMap<NodeId, crate::dom::SceneStickyFrame>,
            id: NodeId,
            inherited: Option<crate::dom::OverflowClip>,
            out: &mut [Option<crate::dom::OverflowClip>],
            sticky_clips: &mut HashMap<NodeId, crate::dom::OverflowClip>,
        ) {
            let starts_viewport_fixed = viewport_fixed.contains(&id)
                && crate::dom::rendered_parent(tree, id)
                    .is_none_or(|parent| !viewport_fixed.contains(&parent));
            let mut inherited = if starts_viewport_fixed {
                None
            } else {
                inherited
            };
            if sticky.contains_key(&id) {
                // The sticky box moves; a clip from outside stays put, so it
                // becomes the sticky frame's boundary clip instead.
                if let Some(clip) = inherited.take() {
                    sticky_clips.insert(id, clip);
                }
            }
            if let Some(slot) = out.get_mut(id.index()) {
                *slot = inherited.clone();
            }
            let next = if unclipped.contains(&id) {
                // Content of a compositor scroller restarts its clip chain in
                // the scroll frame's space; the frame clip is the compositor's.
                None
            } else {
                match (laid.styles.get(&id), laid.rects.get(&id)) {
                    (Some(style), Some(rect))
                        if style.overflow_hidden && !style.overflow_propagated_to_viewport =>
                    {
                        let authored = laid.translates.get(&id).copied().unwrap_or((0.0, 0.0));
                        let scroll = movement.get(id.index()).copied().unwrap_or((0.0, 0.0));
                        let own = crate::dom::OverflowClip::for_box(
                            rect,
                            style,
                            authored.0 + scroll.0,
                            authored.1 + scroll.1,
                        );
                        Some(match inherited {
                            Some(clip) => clip.intersect(own),
                            None => own,
                        })
                    }
                    _ => inherited,
                }
            };
            for child in crate::dom::rendered_children(tree, id) {
                resolve_clips(
                    tree,
                    laid,
                    movement,
                    viewport_fixed,
                    unclipped,
                    sticky,
                    child,
                    next.clone(),
                    out,
                    sticky_clips,
                );
            }
        }
        if let Some(root_node) = tree
            .descendants(tree.document())
            .into_iter()
            .find(|id| tree.get_node(*id).is_some_and(|node| node.is_element()))
        {
            resolve_clips(
                tree,
                &self.layout,
                &node_movement,
                &self.viewport_fixed,
                &unclipped,
                &sticky,
                root_node,
                None,
                &mut inherited_clips,
                &mut sticky_clips,
            );
        }

        SceneScroll {
            paint: ResolvedScrollState {
                root_offset: (0.0, 0.0),
                container_offsets: offsets,
                node_movement,
                inherited_clips,
                scene_unclipped: Some(Arc::new(unclipped)),
            },
            live,
            compositor,
            axes,
            sticky,
            sticky_clips,
        }
    }

    /// Axes the person can scroll the document on: a root or body
    /// `overflow: hidden` propagated to the viewport locks that axis.
    fn root_user_axes(&self, tree: &DomTree) -> (bool, bool) {
        let mut axes = (true, true);
        for selector in ["html", "body"] {
            let Some(node) = tree.query_selector(selector).ok().flatten() else {
                continue;
            };
            let Some(style) = self.layout.styles.get(&node) else {
                continue;
            };
            if style.overflow_propagated_to_viewport {
                let user = crate::style::user_scrollable_axes(style);
                if style.clips_overflow_x() && !user.0 {
                    axes.0 = false;
                }
                if style.clips_overflow_y() && !user.1 {
                    axes.1 = false;
                }
            }
        }
        axes
    }
}

// ---------------------------------------------------------------------------
// Entry point

/// Build one compositor frame of the prepared document. `requested_root`
/// and `requested_elements` are the live scroll offsets (the compositor
/// starts from them); the paint itself is at zero scroll for every scroller
/// the compositor owns.
pub fn build_scene_prepared(
    tree: &DomTree,
    prepared: &mut PreparedRender,
    resources: &mut RenderResourceCache,
    requested_root: (f32, f32),
    requested_elements: &HashMap<NodeId, (f32, f32)>,
    surface_color: [u8; 4],
    canvas_surfaces: &dyn CanvasSurfaceSource,
    raster_scale: f32,
) -> Result<SceneFrame, CaptureError> {
    let started = std::time::Instant::now();
    let scroll = prepared.resolve_scene_scroll_state(tree, requested_root, requested_elements);
    let viewport = prepared.viewport;
    let content = prepared.content_size;
    let width = content.0.max(viewport.0).ceil().clamp(1.0, 16_384.0) as u32;
    let height = content.1.max(viewport.1).ceil().clamp(1.0, 65_536.0) as u32;
    let canvas_background = canvas_background_source(tree, &prepared.layout);
    let background = canvas_background
        .and_then(|canvas| prepared.layout.styles.get(&canvas.source))
        .and_then(|style| style.background_color)
        .filter(|color| color[3] == 255)
        .unwrap_or(surface_color);

    let (painted, list) = display_list::record_scene(|| {
        display_list::set_scene_raster_scale(raster_scale);
        // Never touched: the recording keeps ops, not pixels, so the
        // zeroed allocation stays virtual.
        let pixmap = Pixmap::new(width, height)?;
        crate::canvas::begin_root(&pixmap, [0, 0, 0, 0]);
        let PreparedRender {
            viewport,
            base_url,
            content_size,
            viewport_fixed,
            sticky,
            scroll_tree,
            selected_images,
            svg_fonts,
            layout,
            ..
        } = prepared;
        paint_laid_dom_scrolled(
            tree,
            *viewport,
            base_url.as_deref(),
            (0.0, 0.0),
            Some(&scroll.paint),
            None,
            pixmap,
            resources,
            selected_images,
            canvas_surfaces,
            svg_fonts,
            *content_size,
            viewport_fixed,
            sticky,
            scroll_tree,
            layout,
            None,
            None,
            None,
            None,
            None,
            Some((width as f32, height as f32)),
            (0.0, 0.0),
            1.0,
            false,
            canvas_background,
        )
    });
    painted.ok_or(CaptureError::PaintFailed)?;
    let list = list.ok_or(CaptureError::PaintFailed)?;
    let paint_ms = started.elapsed().as_secs_f32() * 1000.0;
    let assembled = std::time::Instant::now();
    let ops = list.ops.len();
    let mut builder = Builder::new(tree, prepared, &scroll);
    builder.run(&list);
    let mut out = builder.finish(&list, viewport, background);
    out.stats = SceneStats {
        paint_ms,
        assemble_ms: assembled.elapsed().as_secs_f32() * 1000.0,
        document: (width, height),
        ops,
    };
    Ok(out)
}

// ---------------------------------------------------------------------------
// Assembly: recorded ops -> spatial tree, items, hit regions

const IDENTITY: rs::Affine = [1.0, 0.0, 0.0, 1.0, 0.0, 0.0];

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum SpatialKey {
    Scroll(u32),
    Sticky(NodeId),
}

/// One clip a spatial node needs around everything in it: a scroll frame,
/// or the outside clip of a scroller or sticky box. Pushed innermost, in the
/// parent's space, so it does not move with the content.
#[derive(Clone, PartialEq)]
struct BoundaryClip {
    spatial: rs::SpatialId,
    item: rs::Item,
}

struct RefFrame {
    spatial: rs::SpatialId,
}

struct Builder<'a> {
    tree: &'a DomTree,
    prepared: &'a PreparedRender,
    scroll: &'a SceneScroll,
    spatial: Vec<rs::SpatialNode>,
    by_key: HashMap<SpatialKey, rs::SpatialId>,
    box_spatial: HashMap<NodeId, rs::SpatialId>,
    tag_spatial: HashMap<u64, rs::SpatialId>,
    boundaries: HashMap<rs::SpatialId, Arc<Vec<BoundaryClip>>>,
    items: Vec<rs::DisplayItem>,
    hits: Vec<rs::HitRegion>,
    refs: Vec<RefFrame>,
    /// Recorder clip pushes still open: how many items each one emitted.
    clip_counts: Vec<usize>,
    active_boundary: Vec<BoundaryClip>,
    used_images: HashSet<u64>,
    extra_images: Vec<SceneImageResource>,
    used_fonts: HashSet<u64>,
    scroll_nodes: Vec<(u64, usize)>,
    link_cache: HashMap<NodeId, Option<String>>,
}

impl<'a> Builder<'a> {
    fn new(tree: &'a DomTree, prepared: &'a PreparedRender, scroll: &'a SceneScroll) -> Self {
        let viewport = prepared.viewport;
        let (root_x, root_y) = scroll.live.root_offset;
        let content = prepared.content_size;
        let axes = scroll.axes[0];
        let root_scroll = rs::SpatialNode {
            id: rs::ROOT_SCROLL,
            parent: Some(rs::ROOT_SPATIAL),
            kind: rs::SpatialKind::Scroll {
                frame: rs::Rect {
                    x: 0.0,
                    y: 0.0,
                    w: viewport.0,
                    h: viewport.1,
                },
                content: (
                    if axes.0 {
                        content.0.max(viewport.0)
                    } else {
                        viewport.0
                    },
                    if axes.1 {
                        content.1.max(viewport.1)
                    } else {
                        viewport.1
                    },
                ),
                offset: (root_x, root_y),
                offset_changed_by_page: false,
                node: 0,
            },
        };
        Self {
            tree,
            prepared,
            scroll,
            spatial: vec![
                rs::SpatialNode {
                    id: rs::ROOT_SPATIAL,
                    parent: None,
                    kind: rs::SpatialKind::Reference {
                        transform: IDENTITY,
                    },
                },
                root_scroll,
            ],
            by_key: HashMap::new(),
            box_spatial: HashMap::new(),
            tag_spatial: HashMap::new(),
            boundaries: HashMap::new(),
            items: Vec::new(),
            hits: Vec::new(),
            refs: Vec::new(),
            clip_counts: Vec::new(),
            active_boundary: Vec::new(),
            used_images: HashSet::new(),
            extra_images: Vec::new(),
            used_fonts: HashSet::new(),
            scroll_nodes: vec![(0, 1)],
            link_cache: HashMap::new(),
        }
    }

    fn push_spatial(&mut self, parent: rs::SpatialId, kind: rs::SpatialKind) -> rs::SpatialId {
        let id = rs::SpatialId(self.spatial.len() as u32);
        self.spatial.push(rs::SpatialNode {
            id,
            parent: Some(parent),
            kind,
        });
        id
    }

    fn laid(&self) -> &'a crate::DomLayout {
        &self.prepared.layout
    }

    /// Nearest scroll container the compositor scrolls, from `sid` up.
    fn effective_owner(
        &self,
        mut sid: Option<crate::dom::ScrollId>,
    ) -> Option<crate::dom::ScrollId> {
        while let Some(id) = sid {
            if self
                .scroll
                .compositor
                .get(id.index())
                .copied()
                .unwrap_or(false)
            {
                return Some(id);
            }
            sid = self.prepared.scroll_tree.containers[id.index()].parent;
        }
        None
    }

    fn movement_owner(&self, node: NodeId) -> Option<crate::dom::ScrollId> {
        self.prepared
            .scroll_tree
            .movement_owner
            .get(node.index())
            .copied()
            .flatten()
    }

    /// Box translation in the scene paint: authored translates plus the
    /// movement of script-only scrollers.
    fn scene_translation(&self, node: NodeId) -> (f32, f32) {
        let base = self
            .laid()
            .translates
            .get(&node)
            .copied()
            .unwrap_or((0.0, 0.0));
        let movement = self
            .scroll
            .paint
            .node_movement
            .get(node.index())
            .copied()
            .unwrap_or((0.0, 0.0));
        (base.0 + movement.0, base.1 + movement.1)
    }

    fn spatial_for_owner(&mut self, owner: Option<crate::dom::ScrollId>) -> rs::SpatialId {
        match owner {
            Some(sid) => self.scroll_spatial(sid),
            None => rs::ROOT_SPATIAL,
        }
    }

    /// Spatial node of `node`'s own box.
    fn box_spatial(&mut self, node: NodeId) -> rs::SpatialId {
        if let Some(&id) = self.box_spatial.get(&node) {
            return id;
        }
        let owner = self.effective_owner(self.movement_owner(node));
        let sticky = self
            .prepared
            .sticky
            .owner_of(node)
            .filter(|frame| self.scroll.sticky.contains_key(frame))
            .filter(|&frame| self.effective_owner(self.movement_owner(frame)) == owner);
        let id = match sticky {
            Some(frame) => self.sticky_spatial(frame),
            None => self.spatial_for_owner(owner),
        };
        self.box_spatial.insert(node, id);
        id
    }

    /// Spatial node of an op tag (see `scene_node_id`).
    fn tag_spatial(&mut self, tag: u64) -> rs::SpatialId {
        if tag == 0 {
            return rs::ROOT_SCROLL;
        }
        if let Some(&id) = self.tag_spatial.get(&tag) {
            return id;
        }
        let node = NodeId::new(((tag & !SCENE_CONTENT_FLAG) - 1) as u32);
        let id = if tag & SCENE_CONTENT_FLAG != 0 {
            match self
                .prepared
                .scroll_tree
                .node_container
                .get(node.index())
                .copied()
                .flatten()
                .filter(|sid| self.scroll.compositor[sid.index()])
            {
                Some(sid) => self.scroll_spatial(sid),
                None => self.box_spatial(node),
            }
        } else {
            self.box_spatial(node)
        };
        self.tag_spatial.insert(tag, id);
        id
    }

    fn scroll_spatial(&mut self, sid: crate::dom::ScrollId) -> rs::SpatialId {
        if sid.index() == 0 {
            return rs::ROOT_SCROLL;
        }
        if let Some(&id) = self.by_key.get(&SpatialKey::Scroll(sid.0)) {
            return id;
        }
        let container = self.prepared.scroll_tree.containers[sid.index()];
        let Some(element) = container.node else {
            return rs::ROOT_SCROLL;
        };
        let parent = self.box_spatial(element);
        let laid = self.laid();
        let (Some(rect), Some(style)) = (laid.rects.get(&element), laid.styles.get(&element))
        else {
            return parent;
        };
        let (tx, ty) = self.scene_translation(element);
        let frame = rs::Rect {
            x: rect.x + tx + style.border.left,
            y: rect.y + ty + style.border.top,
            w: container.client_size.0,
            h: container.client_size.1,
        };
        let axes = self.scroll.axes[sid.index()];
        let content = (
            if axes.0 {
                container.content_size.0.max(frame.w)
            } else {
                frame.w
            },
            if axes.1 {
                container.content_size.1.max(frame.h)
            } else {
                frame.h
            },
        );
        let offset = self
            .scroll
            .live
            .container_offsets
            .get(sid.index())
            .copied()
            .unwrap_or((0.0, 0.0));
        let id = self.push_spatial(
            parent,
            rs::SpatialKind::Scroll {
                frame,
                content,
                offset,
                offset_changed_by_page: false,
                node: element.index() as u64,
            },
        );
        self.scroll_nodes
            .push((element.index() as u64, id.0 as usize));
        self.by_key.insert(SpatialKey::Scroll(sid.0), id);

        // Boundary: the scroller's outside clip, in the parent's space. The
        // compositor clips the scroller's subtree to `frame` itself.
        let mut boundary = (*self.boundary(parent)).clone();
        if let Some(clip) = self
            .scroll
            .paint
            .inherited_clips
            .get(element.index())
            .cloned()
            .flatten()
        {
            boundary.extend(overflow_clip_items(&clip, parent));
        }
        self.boundaries.insert(id, Arc::new(boundary));
        id
    }

    fn sticky_spatial(&mut self, element: NodeId) -> rs::SpatialId {
        if let Some(&id) = self.by_key.get(&SpatialKey::Sticky(element)) {
            return id;
        }
        let Some(frame) = self.scroll.sticky.get(&element).cloned() else {
            return rs::ROOT_SCROLL;
        };
        let owner = self.effective_owner(self.movement_owner(element));
        let parent = match frame
            .parent_sticky
            .filter(|parent| self.scroll.sticky.contains_key(parent))
            .filter(|&parent| self.effective_owner(self.movement_owner(parent)) == owner)
        {
            Some(parent_sticky) => self.sticky_spatial(parent_sticky),
            None => self.spatial_for_owner(owner),
        };
        let movement = self
            .scroll
            .paint
            .node_movement
            .get(element.index())
            .copied()
            .unwrap_or((0.0, 0.0));
        let normal = frame.normal;
        let rect = rs::Rect {
            x: normal.x + movement.0,
            y: normal.y + movement.1,
            w: normal.width,
            h: normal.height,
        };
        // The containing block bounds how far the box may move. When it is
        // the scroller itself, the bound is the scroller's whole content.
        let containing = if frame.containing_is_scrollport {
            match owner.filter(|sid| sid.index() != 0) {
                Some(sid) => {
                    let container = self.prepared.scroll_tree.containers[sid.index()];
                    let origin = container
                        .node
                        .and_then(|node| {
                            let laid = self.laid();
                            let rect = laid.rects.get(&node)?;
                            let style = laid.styles.get(&node)?;
                            let (tx, ty) = self.scene_translation(node);
                            Some((
                                rect.x + tx + style.border.left + style.padding.left,
                                rect.y + ty + style.border.top + style.padding.top,
                            ))
                        })
                        .unwrap_or((frame.containing.x, frame.containing.y));
                    crate::Rect {
                        x: origin.0,
                        y: origin.1,
                        width: container.content_size.0.max(frame.containing.width),
                        height: container.content_size.1.max(frame.containing.height),
                    }
                }
                None => frame.containing,
            }
        } else {
            crate::Rect {
                x: frame.containing.x + movement.0,
                y: frame.containing.y + movement.1,
                ..frame.containing
            }
        };
        let range =
            |start: f32, size: f32, margin_start: f32, margin_end: f32, pos: f32, len: f32| {
                let min = start + margin_start - pos;
                let max = start + size - margin_end - len - pos;
                (min.min(0.0), max.max(0.0))
            };
        let vertical_range = range(
            containing.y,
            containing.height,
            frame.margin.top,
            frame.margin.bottom,
            rect.y,
            rect.h,
        );
        let horizontal_range = range(
            containing.x,
            containing.width,
            frame.margin.left,
            frame.margin.right,
            rect.x,
            rect.w,
        );
        let id = self.push_spatial(
            parent,
            rs::SpatialKind::Sticky {
                frame: rect,
                margins: frame.insets,
                vertical_range,
                horizontal_range,
            },
        );
        self.by_key.insert(SpatialKey::Sticky(element), id);
        let mut boundary = (*self.boundary(parent)).clone();
        if let Some(clip) = self.scroll.sticky_clips.get(&element) {
            boundary.extend(overflow_clip_items(clip, parent));
        }
        self.boundaries.insert(id, Arc::new(boundary));
        id
    }

    fn boundary(&mut self, spatial: rs::SpatialId) -> Arc<Vec<BoundaryClip>> {
        if let Some(found) = self.boundaries.get(&spatial) {
            return found.clone();
        }
        let parent = self.spatial[spatial.0 as usize].parent;
        let inherited = match parent {
            Some(parent) => self.boundary(parent),
            None => Arc::new(Vec::new()),
        };
        self.boundaries.insert(spatial, inherited.clone());
        inherited
    }

    /// Pop every boundary clip, before a recorder push or pop.
    fn flush_boundary(&mut self) {
        for clip in self.active_boundary.drain(..).rev() {
            self.items.push(rs::DisplayItem {
                spatial: clip.spatial,
                item: rs::Item::PopClip,
            });
        }
    }

    /// Make the active boundary clips those `spatial` needs.
    fn ensure_boundary(&mut self, spatial: rs::SpatialId) {
        let wanted = self.boundary(spatial);
        let common = self
            .active_boundary
            .iter()
            .zip(wanted.iter())
            .take_while(|(a, b)| a == b)
            .count();
        while self.active_boundary.len() > common {
            let clip = self.active_boundary.pop().expect("active clip");
            self.items.push(rs::DisplayItem {
                spatial: clip.spatial,
                item: rs::Item::PopClip,
            });
        }
        for clip in &wanted[common..] {
            self.items.push(rs::DisplayItem {
                spatial: clip.spatial,
                item: clip.item.clone(),
            });
            self.active_boundary.push(clip.clone());
        }
    }

    fn op_spatial(&mut self, tag: u64) -> rs::SpatialId {
        match self.refs.last() {
            Some(reference) => reference.spatial,
            None => self.tag_spatial(tag),
        }
    }

    fn push_item(&mut self, spatial: rs::SpatialId, item: rs::Item) {
        self.items.push(rs::DisplayItem { spatial, item });
    }

    /// A child reference frame of `spatial` for an op whose transform the
    /// item cannot carry.
    fn local_frame(
        &mut self,
        spatial: rs::SpatialId,
        transform: &display_list::Affine,
    ) -> rs::SpatialId {
        let id = self.push_spatial(
            spatial,
            rs::SpatialKind::Reference {
                transform: *transform,
            },
        );
        let inherited = self.boundary(spatial);
        self.boundaries.insert(id, inherited);
        id
    }

    fn run(&mut self, list: &display_list::DisplayList) {
        for (index, op) in list.ops.iter().enumerate() {
            let tag = list.nodes.get(index).copied().unwrap_or(0);
            match op {
                Op::PushRef {
                    node, transform, ..
                } => {
                    let parent = self.op_spatial(*node);
                    let spatial = self.push_spatial(
                        parent,
                        rs::SpatialKind::Reference {
                            transform: *transform,
                        },
                    );
                    let inherited = self.boundary(parent);
                    self.boundaries.insert(spatial, inherited);
                    self.refs.push(RefFrame { spatial });
                }
                Op::PopRef => {
                    self.refs.pop();
                }
                Op::PushClip { clips } => {
                    self.flush_boundary();
                    let spatial = self.op_spatial(tag);
                    let mut count = 0;
                    for clip in clips {
                        let verbs = transform_verbs(&clip.path, &clip.transform);
                        let item = match axis_rect(&verbs) {
                            Some(rect) => rs::Item::PushClip {
                                rect,
                                radii: [0.0; 4],
                            },
                            None => rs::Item::PushClipPath {
                                verbs: scene_verbs(&verbs),
                                even_odd: clip.rule == Rule::EvenOdd,
                            },
                        };
                        self.push_item(spatial, item);
                        count += 1;
                    }
                    self.clip_counts.push(count);
                }
                Op::PopClip => {
                    self.flush_boundary();
                    let spatial = self.op_spatial(tag);
                    let count = self.clip_counts.pop().unwrap_or(0);
                    for _ in 0..count {
                        self.push_item(spatial, rs::Item::PopClip);
                    }
                }
                Op::PushLayer { opacity, blend } => {
                    self.flush_boundary();
                    let spatial = self.op_spatial(tag);
                    self.push_item(
                        spatial,
                        rs::Item::PushLayer {
                            opacity: *opacity,
                            blend: scene_blend(*blend),
                            transform: IDENTITY,
                        },
                    );
                }
                Op::PopLayer => {
                    self.flush_boundary();
                    let spatial = self.op_spatial(tag);
                    self.push_item(spatial, rs::Item::PopLayer);
                }
                Op::Hit {
                    node,
                    rect,
                    radii,
                    clip,
                    text,
                    transform,
                } => {
                    let spatial = self.op_spatial(tag);
                    self.hit(spatial, *node, rect, radii, *clip, *text, transform);
                }
                _ => {
                    let spatial = self.op_spatial(tag);
                    self.ensure_boundary(spatial);
                    self.draw(spatial, op, list);
                }
            }
        }
        self.flush_boundary();
    }

    #[allow(clippy::too_many_arguments)]
    fn hit(
        &mut self,
        spatial: rs::SpatialId,
        node: u64,
        rect: &[f32; 4],
        radii: &[f32; 4],
        clip: Option<[f32; 4]>,
        text: bool,
        transform: &display_list::Affine,
    ) {
        if node == 0 {
            return;
        }
        let mut id = NodeId::new(((node & !SCENE_CONTENT_FLAG) - 1) as u32);
        // Text hits name their text node or their container; cursor and
        // link come from the element.
        if !self.tree.get_node(id).is_some_and(|node| node.is_element()) {
            match crate::dom::rendered_parent(self.tree, id) {
                Some(parent) => id = parent,
                None => return,
            }
        }
        let Some(style) = self.laid().styles.get(&id) else {
            return;
        };
        if style.pointer_events_none.unwrap_or(false) || style.computed_visibility_hidden {
            return;
        }
        let rect = map_rect(transform, rect);
        let clip = clip.map(|clip| map_rect(transform, &clip));
        if rect.w <= 0.0 || rect.h <= 0.0 {
            return;
        }
        let link = self.link_for(id);
        self.hits.push(rs::HitRegion {
            spatial,
            rect,
            radii: *radii,
            clip,
            node: id.index() as u64,
            cursor: style.cursor.unwrap_or_default(),
            is_text: text,
            link,
        });
    }

    /// The `href` of the nearest link ancestor-or-self, resolved.
    fn link_for(&mut self, id: NodeId) -> Option<String> {
        if let Some(found) = self.link_cache.get(&id) {
            return found.clone();
        }
        let own = self
            .tree
            .with_node(id, |node| {
                let element = node.as_element()?;
                if !matches!(element.local.as_ref(), "a" | "area") {
                    return None;
                }
                node.get_attribute("href").map(|href| href.to_string())
            })
            .flatten();
        let found = match own {
            Some(href) => Some(resolve_link(&href, self.prepared.base_url.as_deref())),
            None => match self.tree.get_node(id).and_then(|node| node.parent) {
                Some(parent)
                    if self
                        .tree
                        .get_node(parent)
                        .is_some_and(|node| node.is_element()) =>
                {
                    self.link_for(parent)
                }
                _ => None,
            },
        };
        self.link_cache.insert(id, found.clone());
        found
    }

    fn draw(&mut self, spatial: rs::SpatialId, op: &Op, list: &display_list::DisplayList) {
        match op {
            Op::Fill {
                path,
                brush,
                rule,
                transform,
            } => self.fill(spatial, path, brush, *rule, transform),
            Op::Stroke {
                path,
                brush,
                style,
                transform,
            } => {
                let Brush::Solid { color } = brush else {
                    return;
                };
                let Some(outline) = display_list::path_of(path).and_then(|path| {
                    let stroke = tiny_skia::Stroke {
                        width: style.width,
                        miter_limit: style.miter_limit,
                        line_cap: match style.cap {
                            display_list::Cap::Butt => tiny_skia::LineCap::Butt,
                            display_list::Cap::Round => tiny_skia::LineCap::Round,
                            display_list::Cap::Square => tiny_skia::LineCap::Square,
                        },
                        line_join: match style.join {
                            display_list::Join::Miter => tiny_skia::LineJoin::Miter,
                            display_list::Join::MiterClip => tiny_skia::LineJoin::MiterClip,
                            display_list::Join::Round => tiny_skia::LineJoin::Round,
                            display_list::Join::Bevel => tiny_skia::LineJoin::Bevel,
                        },
                        dash: None,
                    };
                    let scale = transform_scale(transform).max(1.0);
                    path.stroke(&stroke, scale)
                }) else {
                    return;
                };
                let verbs = path_verbs(&outline);
                self.push_item(
                    spatial,
                    rs::Item::Path {
                        verbs: scene_verbs(&verbs),
                        brush: rs::Brush::Solid(*color),
                        even_odd: false,
                        transform: *transform,
                    },
                );
            }
            Op::Image {
                image,
                transform,
                opacity,
                smooth,
            } => {
                let Some(source) = list.scene_images.get(*image) else {
                    return;
                };
                self.used_images.insert(source.id);
                self.image(
                    spatial,
                    rs::ImageId(source.id),
                    (source.width, source.height),
                    transform,
                    *opacity,
                    *smooth,
                );
            }
            Op::Glyphs {
                font,
                size,
                color,
                glyphs,
                synthetic_bold,
                skew,
                transform,
            } => {
                if let Some((base, _)) = font_instance(*font) {
                    self.used_fonts.insert(base);
                }
                self.used_fonts.insert(*font);
                let (spatial, transform) = match translation_or_uniform(transform) {
                    Some(_) => (spatial, *transform),
                    None => (self.local_frame(spatial, transform), IDENTITY),
                };
                let scale = transform[0];
                let glyphs = glyphs
                    .iter()
                    .map(|&(id, x, y)| {
                        let (x, y) = apply(&transform, x, y);
                        rs::Glyph { id, x, y }
                    })
                    .collect();
                self.push_item(
                    spatial,
                    rs::Item::Text {
                        font: rs::FontId(*font),
                        size: size * scale,
                        color: *color,
                        glyphs,
                        synthetic_bold: *synthetic_bold,
                        skew: *skew,
                    },
                );
            }
            Op::BoxShadow {
                rect,
                radii,
                color,
                blur,
                offset,
                spread,
                inset,
                transform,
            } => {
                let (spatial, transform) = if is_translation(transform) {
                    (spatial, *transform)
                } else {
                    (self.local_frame(spatial, transform), IDENTITY)
                };
                // The compositor leaves an outset shadow out of its own box.
                let rect = map_rect(&transform, rect);
                self.push_item(
                    spatial,
                    rs::Item::BoxShadow {
                        rect,
                        radii: *radii,
                        color: *color,
                        blur: *blur,
                        offset: (offset[0], offset[1]),
                        spread: *spread,
                        inset: *inset,
                    },
                );
            }
            Op::External {
                key,
                rect,
                transform,
            } => {
                let (spatial, transform) = if is_axis_aligned(transform) {
                    (spatial, *transform)
                } else {
                    (self.local_frame(spatial, transform), IDENTITY)
                };
                let rect = map_rect(&transform, rect);
                self.push_item(spatial, rs::Item::External { key: *key, rect });
            }
            Op::PushClip { .. }
            | Op::PopClip
            | Op::PushLayer { .. }
            | Op::PopLayer
            | Op::Hit { .. }
            | Op::PushRef { .. }
            | Op::PopRef => {}
        }
    }

    fn image(
        &mut self,
        spatial: rs::SpatialId,
        id: rs::ImageId,
        size: (u32, u32),
        transform: &display_list::Affine,
        opacity: f32,
        smooth: bool,
    ) {
        let (spatial, transform) =
            if is_axis_aligned(transform) && transform[0] > 0.0 && transform[3] > 0.0 {
                (spatial, *transform)
            } else {
                (self.local_frame(spatial, transform), IDENTITY)
            };
        let (w, h) = (size.0 as f32, size.1 as f32);
        let dest = map_rect(&transform, &[0.0, 0.0, w, h]);
        let group = opacity < 1.0;
        if group {
            self.push_item(
                spatial,
                rs::Item::PushLayer {
                    opacity,
                    blend: rs::BlendMode::Normal,
                    transform: IDENTITY,
                },
            );
        }
        self.push_item(
            spatial,
            rs::Item::Image {
                image: id,
                dest,
                src: rs::Rect {
                    x: 0.0,
                    y: 0.0,
                    w,
                    h,
                },
                smooth,
            },
        );
        if group {
            self.push_item(spatial, rs::Item::PopLayer);
        }
    }

    fn fill(
        &mut self,
        spatial: rs::SpatialId,
        path: &[Verb],
        brush: &Brush,
        rule: Rule,
        transform: &display_list::Affine,
    ) {
        let even_odd = rule == Rule::EvenOdd;
        match brush {
            Brush::Solid { color } => {
                if is_translation(transform) {
                    let verbs = transform_verbs(path, transform);
                    if let Some(rect) = axis_rect(&verbs) {
                        self.push_item(
                            spatial,
                            rs::Item::Rect {
                                rect,
                                color: *color,
                            },
                        );
                        return;
                    }
                }
                self.push_item(
                    spatial,
                    rs::Item::Path {
                        verbs: scene_verbs(path),
                        brush: rs::Brush::Solid(*color),
                        even_odd,
                        transform: *transform,
                    },
                );
            }
            Brush::Linear {
                start,
                end,
                stops,
                extend,
                transform: gradient,
            } => {
                let t = display_list::concat(transform, gradient);
                if *extend != Extend::Pad || !is_similarity(&t) {
                    self.raster_fill(spatial, path, brush, rule, transform);
                    return;
                }
                let start = apply(&t, start[0], start[1]);
                let end = apply(&t, end[0], end[1]);
                let stops = scene_stops(stops);
                self.gradient_in_path(spatial, path, even_odd, transform, |rect| {
                    rs::Item::LinearGradient {
                        rect,
                        start,
                        end,
                        stops,
                    }
                });
            }
            Brush::Radial {
                start,
                start_radius,
                end,
                end_radius,
                stops,
                extend,
                transform: gradient,
            } => {
                let t = display_list::concat(transform, gradient);
                let concentric = (start[0] - end[0]).abs() < 1e-3
                    && (start[1] - end[1]).abs() < 1e-3
                    && start_radius.abs() < 1e-3;
                if *extend != Extend::Pad || !concentric || !is_axis_aligned(&t) {
                    self.raster_fill(spatial, path, brush, rule, transform);
                    return;
                }
                let center = apply(&t, end[0], end[1]);
                let radius = (end_radius * t[0].abs(), end_radius * t[3].abs());
                let stops = scene_stops(stops);
                self.gradient_in_path(spatial, path, even_odd, transform, |rect| {
                    rs::Item::RadialGradient {
                        rect,
                        center,
                        radius,
                        stops,
                    }
                });
            }
        }
    }

    /// A gradient item over `path`'s bounds, clipped to `path` unless the
    /// path is that rectangle.
    fn gradient_in_path(
        &mut self,
        spatial: rs::SpatialId,
        path: &[Verb],
        even_odd: bool,
        transform: &display_list::Affine,
        item: impl FnOnce(rs::Rect) -> rs::Item,
    ) {
        let verbs = transform_verbs(path, transform);
        if let Some(rect) = axis_rect(&verbs) {
            self.push_item(spatial, item(rect));
            return;
        }
        let Some(bounds) = verbs_bounds(&verbs) else {
            return;
        };
        self.push_item(
            spatial,
            rs::Item::PushClipPath {
                verbs: scene_verbs(&verbs),
                even_odd,
            },
        );
        self.push_item(spatial, item(bounds));
        self.push_item(spatial, rs::Item::PopClip);
    }

    /// Rasterize one fill the scene items cannot express (repeating or
    /// two-point gradients, skewed gradient spaces) and place it as an image.
    fn raster_fill(
        &mut self,
        spatial: rs::SpatialId,
        path: &[Verb],
        brush: &Brush,
        rule: Rule,
        transform: &display_list::Affine,
    ) {
        let verbs = transform_verbs(path, transform);
        let Some(bounds) = verbs_bounds(&verbs) else {
            return;
        };
        let x0 = bounds.x.floor();
        let y0 = bounds.y.floor();
        let width = ((bounds.x + bounds.w).ceil() - x0).clamp(1.0, 4096.0) as u32;
        let height = ((bounds.y + bounds.h).ceil() - y0).clamp(1.0, 4096.0) as u32;
        let Some(mut pixmap) = Pixmap::new(width, height) else {
            return;
        };
        let Some(tiny_path) = display_list::path_of(path) else {
            return;
        };
        let to_tile = |t: &display_list::Affine| {
            let m = display_list::concat(&[1.0, 0.0, 0.0, 1.0, -x0, -y0], t);
            tiny_skia::Transform::from_row(m[0], m[1], m[2], m[3], m[4], m[5])
        };
        let stops_of = |stops: &[display_list::Stop]| {
            stops
                .iter()
                .map(|stop| {
                    tiny_skia::GradientStop::new(
                        stop.offset,
                        tiny_skia::Color::from_rgba8(
                            stop.color[0],
                            stop.color[1],
                            stop.color[2],
                            stop.color[3],
                        ),
                    )
                })
                .collect::<Vec<_>>()
        };
        let spread = |extend: &Extend| match extend {
            Extend::Pad => tiny_skia::SpreadMode::Pad,
            Extend::Repeat => tiny_skia::SpreadMode::Repeat,
            Extend::Reflect => tiny_skia::SpreadMode::Reflect,
        };
        let gradient_transform = |g: &display_list::Affine| {
            tiny_skia::Transform::from_row(g[0], g[1], g[2], g[3], g[4], g[5])
        };
        let shader = match brush {
            Brush::Solid { .. } => return,
            Brush::Linear {
                start,
                end,
                stops,
                extend,
                transform: g,
            } => tiny_skia::LinearGradient::new(
                tiny_skia::Point::from_xy(start[0], start[1]),
                tiny_skia::Point::from_xy(end[0], end[1]),
                stops_of(stops),
                spread(extend),
                gradient_transform(g),
            ),
            Brush::Radial {
                start,
                start_radius,
                end,
                end_radius,
                stops,
                extend,
                transform: g,
            } => tiny_skia::RadialGradient::new(
                tiny_skia::Point::from_xy(start[0], start[1]),
                *start_radius,
                tiny_skia::Point::from_xy(end[0], end[1]),
                *end_radius,
                stops_of(stops),
                spread(extend),
                gradient_transform(g),
            ),
        };
        let Some(shader) = shader else {
            return;
        };
        let paint = tiny_skia::Paint {
            shader,
            anti_alias: true,
            ..tiny_skia::Paint::default()
        };
        let fill_rule = if rule == Rule::EvenOdd {
            tiny_skia::FillRule::EvenOdd
        } else {
            tiny_skia::FillRule::Winding
        };
        pixmap.fill_path(&tiny_path, &paint, fill_rule, to_tile(transform), None);
        let rgba = pixmap.take();
        let mut hasher = DefaultHasher::new();
        (width, height).hash(&mut hasher);
        rgba.hash(&mut hasher);
        let id = hasher.finish();
        if self.used_images.insert(id) {
            self.extra_images.push(SceneImageResource {
                id: rs::ImageId(id),
                width,
                height,
                rgba: Arc::new(rgba),
            });
        }
        self.push_item(
            spatial,
            rs::Item::Image {
                image: rs::ImageId(id),
                dest: rs::Rect {
                    x: x0,
                    y: y0,
                    w: width as f32,
                    h: height as f32,
                },
                src: rs::Rect {
                    x: 0.0,
                    y: 0.0,
                    w: width as f32,
                    h: height as f32,
                },
                smooth: false,
            },
        );
    }

    fn finish(
        self,
        list: &display_list::DisplayList,
        viewport: (f32, f32),
        background: [u8; 4],
    ) -> SceneFrame {
        let mut images: Vec<SceneImageResource> = list
            .scene_images
            .iter()
            .filter(|image| self.used_images.contains(&image.id))
            .map(|image| SceneImageResource {
                id: rs::ImageId(image.id),
                width: image.width,
                height: image.height,
                rgba: image.rgba.clone(),
            })
            .collect();
        images.extend(self.extra_images);
        let mut fonts = Vec::new();
        let mut font_instances = Vec::new();
        let mut used: Vec<u64> = self.used_fonts.into_iter().collect();
        used.sort_unstable();
        for id in used {
            if let Some(data) = font_data(id) {
                fonts.push(SceneFontResource {
                    id: rs::FontId(id),
                    data,
                });
            } else if let Some((base, axes)) = font_instance(id) {
                font_instances.push(SceneFontInstance {
                    id: rs::FontId(id),
                    font: rs::FontId(base),
                    axes,
                });
            }
        }
        let baked_scrollers = self
            .prepared
            .scroll_tree
            .containers
            .iter()
            .enumerate()
            .skip(1)
            .filter(|(index, _)| !self.scroll.compositor[*index])
            .filter_map(|(_, container)| container.node.map(|node| node.index() as u64))
            .collect();
        SceneFrame {
            frame: rs::Frame {
                epoch: 0,
                viewport,
                background: background.map(|c| c as f32 / 255.0),
                spatial: self.spatial,
                items: self.items,
                hits: self.hits,
            },
            images,
            fonts,
            font_instances,
            scroll_nodes: self.scroll_nodes,
            baked_scrollers,
            stats: SceneStats::default(),
        }
    }
}

// ---------------------------------------------------------------------------
// Geometry helpers

fn apply(t: &display_list::Affine, x: f32, y: f32) -> (f32, f32) {
    (t[0] * x + t[2] * y + t[4], t[1] * x + t[3] * y + t[5])
}

fn is_translation(t: &display_list::Affine) -> bool {
    t[0] == 1.0 && t[1] == 0.0 && t[2] == 0.0 && t[3] == 1.0
}

fn is_axis_aligned(t: &display_list::Affine) -> bool {
    t[1] == 0.0 && t[2] == 0.0
}

/// A translation or a uniform positive scale, which glyph runs carry by
/// scaling their size.
fn translation_or_uniform(t: &display_list::Affine) -> Option<f32> {
    (is_axis_aligned(t) && t[0] > 0.0 && (t[0] - t[3]).abs() < 1e-4).then_some(t[0])
}

/// Rotation + uniform scale (+ translation): maps a gradient line to a
/// gradient line.
fn is_similarity(t: &display_list::Affine) -> bool {
    let [a, b, c, d, _, _] = *t;
    (a * c + b * d).abs() < 1e-3 * (a * a + b * b).max(1e-6)
        && ((a * a + b * b) - (c * c + d * d)).abs() < 1e-3 * (a * a + b * b).max(1e-6)
}

fn transform_scale(t: &display_list::Affine) -> f32 {
    ((t[0] * t[0] + t[1] * t[1]).sqrt()).max((t[2] * t[2] + t[3] * t[3]).sqrt())
}

fn map_rect(t: &display_list::Affine, rect: &[f32; 4]) -> rs::Rect {
    let [x, y, w, h] = *rect;
    let corners = [
        apply(t, x, y),
        apply(t, x + w, y),
        apply(t, x, y + h),
        apply(t, x + w, y + h),
    ];
    let min_x = corners.iter().map(|p| p.0).fold(f32::INFINITY, f32::min);
    let max_x = corners
        .iter()
        .map(|p| p.0)
        .fold(f32::NEG_INFINITY, f32::max);
    let min_y = corners.iter().map(|p| p.1).fold(f32::INFINITY, f32::min);
    let max_y = corners
        .iter()
        .map(|p| p.1)
        .fold(f32::NEG_INFINITY, f32::max);
    rs::Rect {
        x: min_x,
        y: min_y,
        w: max_x - min_x,
        h: max_y - min_y,
    }
}

fn transform_verbs(verbs: &[Verb], t: &display_list::Affine) -> Vec<Verb> {
    if *t == IDENTITY {
        return verbs.to_vec();
    }
    verbs
        .iter()
        .map(|verb| match *verb {
            Verb::M(x, y) => {
                let (x, y) = apply(t, x, y);
                Verb::M(x, y)
            }
            Verb::L(x, y) => {
                let (x, y) = apply(t, x, y);
                Verb::L(x, y)
            }
            Verb::Q(x1, y1, x, y) => {
                let (x1, y1) = apply(t, x1, y1);
                let (x, y) = apply(t, x, y);
                Verb::Q(x1, y1, x, y)
            }
            Verb::C(x1, y1, x2, y2, x, y) => {
                let (x1, y1) = apply(t, x1, y1);
                let (x2, y2) = apply(t, x2, y2);
                let (x, y) = apply(t, x, y);
                Verb::C(x1, y1, x2, y2, x, y)
            }
            Verb::Z => Verb::Z,
        })
        .collect()
}

fn scene_verbs(verbs: &[Verb]) -> Vec<rs::Verb> {
    verbs
        .iter()
        .map(|verb| match *verb {
            Verb::M(x, y) => rs::Verb::M(x, y),
            Verb::L(x, y) => rs::Verb::L(x, y),
            Verb::Q(x1, y1, x, y) => rs::Verb::Q(x1, y1, x, y),
            Verb::C(x1, y1, x2, y2, x, y) => rs::Verb::C(x1, y1, x2, y2, x, y),
            Verb::Z => rs::Verb::Z,
        })
        .collect()
}

fn path_verbs(path: &tiny_skia::Path) -> Vec<Verb> {
    path.segments()
        .map(|segment| match segment {
            tiny_skia::PathSegment::MoveTo(p) => Verb::M(p.x, p.y),
            tiny_skia::PathSegment::LineTo(p) => Verb::L(p.x, p.y),
            tiny_skia::PathSegment::QuadTo(a, b) => Verb::Q(a.x, a.y, b.x, b.y),
            tiny_skia::PathSegment::CubicTo(a, b, c) => Verb::C(a.x, a.y, b.x, b.y, c.x, c.y),
            tiny_skia::PathSegment::Close => Verb::Z,
        })
        .collect()
}

/// The rectangle a path is, when it is one closed axis-aligned rectangle.
fn axis_rect(verbs: &[Verb]) -> Option<rs::Rect> {
    let mut points = Vec::with_capacity(5);
    for (index, verb) in verbs.iter().enumerate() {
        match *verb {
            Verb::M(x, y) if index == 0 => points.push((x, y)),
            Verb::L(x, y) if index > 0 => points.push((x, y)),
            Verb::Z if index == verbs.len() - 1 => {}
            _ => return None,
        }
    }
    if points.len() == 5 && points[4] == points[0] {
        points.pop();
    }
    if points.len() != 4 {
        return None;
    }
    let xs: Vec<f32> = points.iter().map(|p| p.0).collect();
    let ys: Vec<f32> = points.iter().map(|p| p.1).collect();
    // Each edge must be horizontal or vertical.
    for i in 0..4 {
        let (a, b) = (points[i], points[(i + 1) % 4]);
        if a.0 != b.0 && a.1 != b.1 {
            return None;
        }
    }
    let x0 = xs.iter().copied().fold(f32::INFINITY, f32::min);
    let x1 = xs.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    let y0 = ys.iter().copied().fold(f32::INFINITY, f32::min);
    let y1 = ys.iter().copied().fold(f32::NEG_INFINITY, f32::max);
    Some(rs::Rect {
        x: x0,
        y: y0,
        w: x1 - x0,
        h: y1 - y0,
    })
}

fn verbs_bounds(verbs: &[Verb]) -> Option<rs::Rect> {
    let mut min = (f32::INFINITY, f32::INFINITY);
    let mut max = (f32::NEG_INFINITY, f32::NEG_INFINITY);
    let mut add = |x: f32, y: f32| {
        min = (min.0.min(x), min.1.min(y));
        max = (max.0.max(x), max.1.max(y));
    };
    for verb in verbs {
        match *verb {
            Verb::M(x, y) | Verb::L(x, y) => add(x, y),
            Verb::Q(x1, y1, x, y) => {
                add(x1, y1);
                add(x, y);
            }
            Verb::C(x1, y1, x2, y2, x, y) => {
                add(x1, y1);
                add(x2, y2);
                add(x, y);
            }
            Verb::Z => {}
        }
    }
    (min.0.is_finite() && max.0 > min.0 && max.1 > min.1).then_some(rs::Rect {
        x: min.0,
        y: min.1,
        w: max.0 - min.0,
        h: max.1 - min.1,
    })
}

/// The clip items of an overflow clip chain, in `spatial`.
fn overflow_clip_items(
    clip: &crate::dom::OverflowClip,
    spatial: rs::SpatialId,
) -> Vec<BoundaryClip> {
    let bounds = clip.scene_bounds();
    let mut out = vec![BoundaryClip {
        spatial,
        item: rs::Item::PushClip {
            rect: rs::Rect {
                x: bounds.x,
                y: bounds.y,
                w: bounds.width,
                h: bounds.height,
            },
            radii: [0.0; 4],
        },
    }];
    let offset = clip.rounded_offset();
    let mut current = clip.rounded_chain().map(AsRef::as_ref);
    while let Some(node) = current {
        let rect = rs::Rect {
            x: node.clip.rect.x + offset.0,
            y: node.clip.rect.y + offset.1,
            w: node.clip.rect.width,
            h: node.clip.rect.height,
        };
        let radii = node.clip.radii;
        out.push(BoundaryClip {
            spatial,
            item: rs::Item::PushClip {
                rect,
                radii: [
                    radii.top_left.0,
                    radii.top_right.0,
                    radii.bottom_right.0,
                    radii.bottom_left.0,
                ],
            },
        });
        current = node.parent.as_deref();
    }
    out
}

fn scene_stops(stops: &[display_list::Stop]) -> Vec<rs::GradientStop> {
    stops
        .iter()
        .map(|stop| rs::GradientStop {
            offset: stop.offset,
            color: stop.color.map(|c| c as f32 / 255.0),
        })
        .collect()
}

fn scene_blend(blend: display_list::Blend) -> rs::BlendMode {
    use display_list::Blend as B;
    match blend {
        B::Multiply => rs::BlendMode::Multiply,
        B::Screen => rs::BlendMode::Screen,
        B::Overlay => rs::BlendMode::Overlay,
        B::Darken => rs::BlendMode::Darken,
        B::Lighten => rs::BlendMode::Lighten,
        B::ColorDodge => rs::BlendMode::ColorDodge,
        B::ColorBurn => rs::BlendMode::ColorBurn,
        B::HardLight => rs::BlendMode::HardLight,
        B::SoftLight => rs::BlendMode::SoftLight,
        B::Difference => rs::BlendMode::Difference,
        B::Exclusion => rs::BlendMode::Exclusion,
        B::Hue => rs::BlendMode::Hue,
        B::Saturation => rs::BlendMode::Saturation,
        B::Color => rs::BlendMode::Color,
        B::Luminosity => rs::BlendMode::Luminosity,
        _ => rs::BlendMode::Normal,
    }
}

fn resolve_link(href: &str, base: Option<&str>) -> String {
    let href = href.trim();
    base.and_then(|base| url::Url::parse(base).ok())
        .and_then(|base| base.join(href).ok())
        .map(|url| url.to_string())
        .unwrap_or_else(|| href.to_string())
}
