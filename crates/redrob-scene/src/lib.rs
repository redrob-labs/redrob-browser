//! Frame protocol between the engine and the window's GPU compositor.
//!
//! The design follows WebRender (Firefox/Servo) and Chromium's compositor:
//! the engine sends *what to draw* as a display list of items, each attached
//! to a node of a [`SpatialTree`]; the window rasterizes on the GPU and owns
//! scrolling. Scroll offsets, sticky positions and fixed boxes are resolved by
//! the compositor every frame, so scrolling never waits for the engine.
//! Hit-test regions carry the CSS `cursor` and the DOM node, so hovering
//! needs no round trip either.
//!
//! Resources (images, fonts) are sent once by id and cached by the client.
//! A frame update carries only what changed since the previous epoch.
//!
//! All coordinates are CSS pixels. Each item's coordinates are local to its
//! spatial node; the compositor maps them to the viewport.

use serde::{Deserialize, Serialize};

pub type Affine = [f32; 6]; // [sx, ky, kx, sy, tx, ty] as kurbo::Affine::new

#[derive(Clone, Copy, Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Rect {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, PartialOrd, Ord, Serialize, Deserialize)]
pub struct SpatialId(pub u32);

/// The root reference frame: the viewport's initial containing block,
/// not scrolled. Fixed-position content attaches here.
pub const ROOT_SPATIAL: SpatialId = SpatialId(0);
/// The root scroll frame (the document scroller). Always present.
pub const ROOT_SCROLL: SpatialId = SpatialId(1);

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct SpatialNode {
    pub id: SpatialId,
    pub parent: Option<SpatialId>,
    pub kind: SpatialKind,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum SpatialKind {
    /// A transform (CSS `transform`, or a plain offset), relative to the parent.
    Reference { transform: Affine },
    /// A scroll container. `frame` is its clip/viewport rect in the parent's
    /// space; `content` is the scrollable size. The compositor owns the live
    /// offset; `offset` is the engine's last known offset (JS scrollTo etc.).
    Scroll {
        frame: Rect,
        content: (f32, f32),
        offset: (f32, f32),
        /// The engine changed the offset (scrollTo/scrollIntoView); the
        /// compositor must adopt `offset` instead of its own.
        offset_changed_by_page: bool,
        /// DOM node of the scroller (0 for the document), for scroll events.
        node: u64,
    },
    /// `position: sticky`, as WebRender's StickyFrameInfo. `frame` is the
    /// box's normal-flow rect in the parent's space. Margins are the CSS
    /// insets (None = auto). `vertical_range`/`horizontal_range` bound the
    /// offset so the box stays inside its containing block.
    Sticky {
        frame: Rect,
        margins: [Option<f32>; 4], // top, right, bottom, left
        vertical_range: (f32, f32),
        horizontal_range: (f32, f32),
    },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct ImageId(pub u64);
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub struct FontId(pub u64);

#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum Resource {
    /// Premultiplied RGBA8, row-major.
    Image { id: ImageId, width: u32, height: u32, rgba: Vec<u8> },
    /// A font file (TTF/OTF/TTC bytes) and the face index inside it.
    Font { id: FontId, data: Vec<u8>, index: u32 },
    /// A variable font at fixed axis values (added, additive): Text items
    /// may name `id`; draw with `font`'s file at these `axes`
    /// (OpenType tag, user-space value). A client that ignores it can draw
    /// with `font` at its default instance.
    FontInstance { id: FontId, font: FontId, axes: Vec<([u8; 4], f32)> },
    /// The client may drop it.
    DropImage(ImageId),
    DropFont(FontId),
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum Brush {
    Solid([f32; 4]), // straight RGBA 0..1
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GradientStop {
    pub offset: f32,
    pub color: [f32; 4],
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum Verb {
    M(f32, f32),
    L(f32, f32),
    Q(f32, f32, f32, f32),
    C(f32, f32, f32, f32, f32, f32),
    Z,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub struct Glyph {
    pub id: u32,
    pub x: f32,
    pub y: f32,
}

#[derive(Clone, Copy, Debug, PartialEq, Serialize, Deserialize)]
pub enum BlendMode {
    Normal,
    Multiply,
    Screen,
    Overlay,
    Darken,
    Lighten,
    // Added for the engine (additive): the remaining CSS mix-blend-mode values.
    ColorDodge,
    ColorBurn,
    HardLight,
    SoftLight,
    Difference,
    Exclusion,
    Hue,
    Saturation,
    Color,
    Luminosity,
}

/// One display item. Painted in list order (painter's algorithm, already
/// sorted by the engine in CSS stacking order).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub enum Item {
    Rect { rect: Rect, color: [f32; 4] },
    RoundedRect { rect: Rect, radii: [f32; 4], color: [f32; 4] }, // tl,tr,br,bl
    Path { verbs: Vec<Verb>, brush: Brush, even_odd: bool, transform: Affine },
    Stroke { verbs: Vec<Verb>, color: [f32; 4], width: f32, transform: Affine },
    LinearGradient { rect: Rect, start: (f32, f32), end: (f32, f32), stops: Vec<GradientStop> },
    RadialGradient { rect: Rect, center: (f32, f32), radius: (f32, f32), stops: Vec<GradientStop> },
    BoxShadow { rect: Rect, radii: [f32; 4], color: [f32; 4], blur: f32, offset: (f32, f32), spread: f32, inset: bool },
    /// Draw `image` into `dest`, sampling `src` (in image pixels).
    Image { image: ImageId, dest: Rect, src: Rect, smooth: bool },
    /// Glyph run: `font` at `size` CSS px, glyph origins in local space.
    Text { font: FontId, size: f32, color: [f32; 4], glyphs: Vec<Glyph>, synthetic_bold: bool, skew: f32 },
    /// A region the window fills itself (video frame, canvas texture).
    External { key: u64, rect: Rect },
    PushClip { rect: Rect, radii: [f32; 4] },
    PushClipPath { verbs: Vec<Verb>, even_odd: bool },
    PopClip,
    PushLayer { opacity: f32, blend: BlendMode, transform: Affine },
    PopLayer,
}

/// An item with the spatial node its coordinates are in.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DisplayItem {
    pub spatial: SpatialId,
    pub item: Item,
}

/// CSS `cursor` values the compositor maps to OS cursors.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Default, Serialize, Deserialize)]
pub enum Cursor {
    #[default]
    Auto,
    Default,
    Pointer,
    Text,
    VerticalText,
    Wait,
    Progress,
    Help,
    Crosshair,
    Move,
    Grab,
    Grabbing,
    NotAllowed,
    NoDrop,
    ContextMenu,
    Cell,
    Copy,
    Alias,
    ZoomIn,
    ZoomOut,
    ColResize,
    RowResize,
    EResize,
    NResize,
    NeResize,
    NwResize,
    SResize,
    SeResize,
    SwResize,
    WResize,
    EwResize,
    NsResize,
    NeswResize,
    NwseResize,
    AllScroll,
    None,
}

/// A hit-test region, front-most last (same order as painting).
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct HitRegion {
    pub spatial: SpatialId,
    pub rect: Rect,
    pub radii: [f32; 4],
    /// Clip in the same spatial node (from overflow ancestors), if any.
    pub clip: Option<Rect>,
    /// DOM node id (obscura NodeId index) of the element.
    pub node: u64,
    /// Resolved CSS cursor. `Auto` means: text cursor over text, else default.
    pub cursor: Cursor,
    /// The region is over text (for `cursor: auto`).
    pub is_text: bool,
    /// `pointer-events: none` elements are not emitted at all.
    pub link: Option<String>,
}

/// One full frame. Sent on first paint and whenever the engine decides a
/// full rebuild is cheaper than a delta.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct Frame {
    pub epoch: u64,
    pub viewport: (f32, f32),
    pub background: [f32; 4],
    pub spatial: Vec<SpatialNode>,
    pub items: Vec<DisplayItem>,
    pub hits: Vec<HitRegion>,
}

/// A change set against the client's current frame. `items`/`hits` are
/// replaced wholesale when present (the engine diffs at item granularity
/// cheaply only for spatial-node changes; scrolling sends spatial only).
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct FrameDelta {
    pub epoch: u64,
    pub base_epoch: u64,
    pub spatial: Option<Vec<SpatialNode>>,
    pub items: Option<Vec<DisplayItem>>,
    pub hits: Option<Vec<HitRegion>>,
    pub viewport: Option<(f32, f32)>,
    pub background: Option<[f32; 4]>,
}

/// Engine -> window message on the scene channel.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum SceneMsg {
    Resources(Vec<Resource>),
    Frame(Frame),
    Delta(FrameDelta),
}

/// Window -> engine messages on the scene channel.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub enum ClientMsg {
    /// The compositor scrolled a scroller (node from SpatialKind::Scroll).
    /// The engine updates scrollTop/Left and fires `scroll` events; it does
    /// not need to send a new frame unless content depends on it.
    Scrolled { node: u64, offset: (f32, f32) },
    /// Frame `epoch` is on screen (flow control: at most 2 frames in flight).
    Presented { epoch: u64 },
}

/// Wire format: u32 little-endian length + bincode body.
pub fn encode<T: Serialize>(msg: &T) -> Vec<u8> {
    let body = bincode::serialize(msg).expect("scene message serializes");
    let mut out = Vec::with_capacity(body.len() + 4);
    out.extend_from_slice(&(body.len() as u32).to_le_bytes());
    out.extend_from_slice(&body);
    out
}

pub fn decode<'a, T: Deserialize<'a>>(body: &'a [u8]) -> Result<T, bincode::Error> {
    bincode::deserialize(body)
}

/// Sticky offset for one sticky node, given the scroll frame it sticks to
/// (its viewport rect in the same space as `frame`), as WebRender's
/// `calculate_sticky_offset`. Shared so engine (scrollIntoView, layout
/// queries) and compositor agree exactly.
pub fn sticky_offset(
    frame: Rect,
    margins: [Option<f32>; 4],
    vertical_range: (f32, f32),
    horizontal_range: (f32, f32),
    scroll_viewport: Rect,
) -> (f32, f32) {
    let mut dy = 0.0f32;
    if let Some(top) = margins[0] {
        let limit = scroll_viewport.y + top;
        if frame.y < limit {
            dy = limit - frame.y;
        }
    }
    if let Some(bottom) = margins[2] {
        let limit = scroll_viewport.y + scroll_viewport.h - bottom;
        if frame.y + frame.h > limit && dy == 0.0 {
            dy = limit - (frame.y + frame.h);
        }
    }
    let mut dx = 0.0f32;
    if let Some(left) = margins[3] {
        let limit = scroll_viewport.x + left;
        if frame.x < limit {
            dx = limit - frame.x;
        }
    }
    if let Some(right) = margins[1] {
        let limit = scroll_viewport.x + scroll_viewport.w - right;
        if frame.x + frame.w > limit && dx == 0.0 {
            dx = limit - (frame.x + frame.w);
        }
    }
    (
        dx.clamp(horizontal_range.0, horizontal_range.1),
        dy.clamp(vertical_range.0, vertical_range.1),
    )
}
