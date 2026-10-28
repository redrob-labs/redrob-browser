//! Paint damage between two prepared frames.
//!
//! Chromium repaints only what changed: paint invalidation records the old
//! and new visual rects of every box whose paint may differ. Obscura has no
//! retained paint layers, so [`DamageSnapshot`] compares what consecutive
//! prepared frames would paint instead of tracking every mutation:
//!
//! - every laid-out box has a visual rect in document coordinates (border
//!   box, inline fragments, `::before`/`::after`, transforms, scroll
//!   movement, outline and shadow), its computed style (compared with
//!   `==`) and a fingerprint of the rest of what paint reads for it: clips,
//!   scroll offset, selected image, canvas pixels, the text, attributes,
//!   styles and form state of DOM nodes it paints without boxes of their
//!   own, and its place in paint order;
//! - shaped text is compared line by line (glyphs, fonts, colors and
//!   positions), so a change inside a paragraph damages the lines that
//!   moved, and a box whose style changed also damages its lines;
//! - anything that can repaint the page without a box changing (viewport,
//!   loaded resources and fonts, the canvas background) damages the whole
//!   document.
//!
//! When unsure the answer is bigger, never smaller: `None` means "repaint
//! everything".

use std::collections::{HashMap, HashSet};
use std::fmt::Write as _;
use std::hash::{Hash, Hasher};

use obscura_dom::tree::{DomTree, NodeData, NodeId};

use super::{PreparedRender, ResolvedScrollState};
use crate::{LayoutStyle, Rect};

/// Past this many separate rects the damage is reported as their union.
const MAX_RECTS: usize = 24;
/// Rects closer than this merge, so a row of small changes is one rect.
const MERGE_SLOP: f32 = 32.0;

/// One painted thing: a box (`sub == 0`), one line of shaped text, or the
/// word-split text of one text node.
type Key = (u32, u32);
const SUB_WORDS: u32 = 0x4000_0000;
const SUB_LINE: u32 = 0x8000_0000;

/// One painted item: where, a fingerprint, and the box whose style it uses.
#[derive(Clone, Copy)]
struct Item {
    rect: Rect,
    hash: u64,
    owner: NodeId,
}

/// The DOM side of a frame: which boxes paint which nodes. It only changes
/// with the document's activity generation and its set of boxes.
#[derive(Default)]
struct Walk {
    activity: u64,
    /// Boxes in rendered order: box, nearest ancestor box, previous box,
    /// fingerprint of the DOM data it paints.
    boxes: Vec<(NodeId, Option<NodeId>, Option<NodeId>, u64)>,
    box_set: HashSet<NodeId>,
    /// Styled nodes without a box, and the box that paints them.
    owned: Vec<(NodeId, NodeId)>,
    /// Nearest box of every node without one.
    owner_of: HashMap<NodeId, NodeId>,
    canvases: Vec<NodeId>,
}

/// What the previous frame painted, kept between frames.
#[derive(Default)]
pub struct DamageSnapshot {
    started: bool,
    globals: u64,
    background: Option<(NodeId, NodeId, LayoutStyle)>,
    items: HashMap<Key, Item>,
    styles: HashMap<NodeId, LayoutStyle>,
    walk: Walk,
    /// [`PreparedRender::paint_epoch`] that `styles` and `text` describe.
    epoch: u64,
    /// Shaped lines and word runs of that epoch, in layout coordinates:
    /// key, owner box, ink rect, extra margin, fingerprint.
    text: Vec<(Key, NodeId, Rect, f32, u64)>,
}

impl DamageSnapshot {
    /// Record the frame `prepared` paints with `scroll` and return the
    /// document-space rects that may paint differently than the previous
    /// recorded frame. `None`: the whole document (also on the first call).
    ///
    /// `extra` folds in page state outside the prepared render (font count,
    /// surface color); `activity` is the document's mutation generation;
    /// `changed_resources` lists resource keys whose bytes changed since the
    /// previous frame (`None`: unknown); `canvas_pixels` fingerprints a
    /// `<canvas>` backing store.
    #[allow(clippy::too_many_arguments)]
    pub fn update(
        &mut self,
        tree: &DomTree,
        prepared: &PreparedRender,
        scroll: &ResolvedScrollState,
        extra: u64,
        activity: u64,
        changed_resources: Option<&[String]>,
        canvas_pixels: &dyn Fn(NodeId) -> Option<u64>,
    ) -> Option<Vec<Rect>> {
        let laid = &prepared.layout;
        let root = scroll.root_offset();

        let same_boxes = self.walk.box_set.len() == laid.rects.len()
            && laid.rects.keys().all(|id| self.walk.box_set.contains(id));
        if !self.started || self.walk.activity != activity || !same_boxes {
            self.walk = walk(tree, prepared, activity);
        }

        let mut globals = Fnv::default();
        globals.write_u64(extra);
        write_f32s(&mut globals, &[prepared.viewport.0, prepared.viewport.1]);
        // The canvas background (root or body) fills the whole surface.
        let background = super::canvas_background_source(tree, laid).and_then(|background| {
            let style = laid.styles.get(&background.source)?;
            Some((background.root, background.source, style))
        });
        let background_same = match (&self.background, &background) {
            (None, None) => true,
            (Some((r0, s0, style0)), Some((r1, s1, style1))) => {
                r0 == r1 && s0 == s1 && style0 == *style1
            }
            _ => false,
        };
        if !background_same {
            self.background = background.map(|(r, s, style)| (r, s, style.clone()));
        }
        let globals = globals.finish();
        let mut full = !self.started || globals != self.globals || !background_same;
        // Boxes painting a resource whose bytes changed.
        let mut resource_users = HashSet::new();
        if !full {
            match changed_resources {
                Some([]) => {}
                Some(changed) => match users_of(tree, prepared, &self.walk, changed) {
                    Some(users) => resource_users = users,
                    None => full = true,
                },
                None => full = true,
            }
        }

        // Styles: compare with the previous frame, cloning only changes. An
        // unchanged epoch has the same styles and text.
        let same_epoch = self.started && self.epoch == prepared.paint_epoch;
        let mut restyled: HashSet<NodeId> = HashSet::new();
        let mut live: HashSet<NodeId> = HashSet::with_capacity(laid.styles.len());
        let walk = &self.walk;
        let mut check_style =
            |id: NodeId, owner: NodeId, styles: &mut HashMap<NodeId, LayoutStyle>| {
                let Some(style) = laid.styles.get(&id) else {
                    return;
                };
                live.insert(id);
                match styles.get_mut(&id) {
                    Some(old) if old == style => {}
                    Some(old) => {
                        *old = style.clone();
                        restyled.insert(owner);
                    }
                    None => {
                        styles.insert(id, style.clone());
                        restyled.insert(owner);
                    }
                }
            };
        if !same_epoch {
            for (id, _, _, _) in &walk.boxes {
                check_style(*id, *id, &mut self.styles);
            }
            for (id, owner) in &walk.owned {
                check_style(*id, *owner, &mut self.styles);
            }
            self.styles.retain(|id, _| live.contains(id));
        }

        // Boxes.
        let mut items: HashMap<Key, Item> = HashMap::with_capacity(self.items.len());
        let mut generated: HashMap<NodeId, Rect> = HashMap::new();
        for g in &laid.generated_boxes {
            add_rect(&mut generated, g.host, g.rect);
        }
        for (id, owner, previous, data) in &walk.boxes {
            let (Some(rect), Some(style)) = (laid.rects.get(id), laid.styles.get(id)) else {
                continue;
            };
            let mut hash = Fnv::default();
            hash.write_u64(*data);
            hash.write_u32(owner.map_or(u32::MAX, NodeId::raw));
            hash.write_u32(previous.map_or(u32::MAX, NodeId::raw));
            hash_box_state(&mut hash, prepared, scroll, *id);
            if walk.canvases.contains(id) {
                hash.write_u64(canvas_pixels(*id).unwrap_or(0));
            }
            let mut local = *rect;
            if let Some(fragments) = laid.inline_fragments.get(id) {
                for fragment in fragments {
                    local = union(local, *fragment);
                }
            }
            if let Some(extra) = generated.get(id) {
                local = union(local, *extra);
            }
            let mut visual = visual_rect(prepared, scroll, root, *id, local, style);
            if style.display == crate::Display::Inline {
                // Glyph overhang (italics, accents) of the text it colors.
                visual = inflate(visual, 8.0);
            }
            items.insert(
                (id.raw(), 0),
                Item {
                    rect: visual,
                    hash: hash.finish(),
                    owner: *id,
                },
            );
        }

        if !same_epoch {
            self.text = measure_text(laid, walk);
        }
        for (key, owner, local, pad, hash) in &self.text {
            let Some(style) = laid.styles.get(owner) else {
                continue;
            };
            let rect = inflate(
                visual_rect(prepared, scroll, root, *owner, *local, style),
                *pad,
            );
            items.insert(
                *key,
                Item {
                    rect,
                    hash: *hash,
                    owner: *owner,
                },
            );
        }

        let old = std::mem::replace(&mut self.items, items);
        self.globals = globals;
        self.epoch = prepared.paint_epoch;
        self.started = true;
        if full {
            return None;
        }
        let mut out = Vec::new();
        for (key, item) in &self.items {
            match old.get(key) {
                None => out.push(item.rect),
                Some(before) => {
                    if before.hash != item.hash
                        || !same_rect(&before.rect, &item.rect)
                        || restyled.contains(&item.owner)
                        || resource_users.contains(&item.owner)
                    {
                        out.push(item.rect);
                        out.push(before.rect);
                    }
                }
            }
        }
        for (key, item) in &old {
            if !self.items.contains_key(key) {
                out.push(item.rect);
            }
        }
        Some(merge_rects(out))
    }
}

/// The boxes that paint any of `changed` (resource keys). Matched by the
/// key's file name in every style, selected image and attribute, which over-
/// approximates; `None` (repaint everything) when a key has no usable file
/// name or nothing on the page names it, since the reference may be one
/// paint cannot see (an image inside an SVG image, a font).
fn users_of(
    tree: &DomTree,
    prepared: &PreparedRender,
    walk: &Walk,
    changed: &[String],
) -> Option<HashSet<NodeId>> {
    let laid = &prepared.layout;
    let mut needles: Vec<Vec<String>> = Vec::new();
    for key in changed {
        if key.starts_with("data:") || key.starts_with("blob:") {
            return None;
        }
        let path = key.split(['?', '#']).next().unwrap_or("");
        let name = path.rsplit('/').next().unwrap_or("");
        if name.len() < 4 {
            return None;
        }
        let decoded = percent_decode(name);
        let mut forms = vec![name.to_string()];
        if decoded != name {
            forms.push(decoded);
        }
        needles.push(forms);
    }
    let mut found = vec![false; needles.len()];
    let mut users = HashSet::new();
    let mut check = |text: &str, owner: NodeId, users: &mut HashSet<NodeId>| {
        for (i, forms) in needles.iter().enumerate() {
            if forms.iter().any(|form| text.contains(form.as_str())) {
                found[i] = true;
                users.insert(owner);
            }
        }
    };
    let mut text = String::new();
    for (id, ..) in &walk.boxes {
        text.clear();
        if let Some(style) = laid.styles.get(id) {
            let _ = write!(text, "{style:?}");
        }
        if let Some(image) = prepared.selected_images.get(id) {
            let _ = write!(text, "{image:?}");
        }
        check(&text, *id, &mut users);
    }
    for (id, owner) in &walk.owned {
        text.clear();
        if let Some(style) = laid.styles.get(id) {
            let _ = write!(text, "{style:?}");
        }
        check(&text, *owner, &mut users);
    }
    let nodes = walk
        .boxes
        .iter()
        .map(|(id, ..)| (*id, *id))
        .chain(walk.owner_of.iter().map(|(id, owner)| (*id, *owner)));
    for (id, owner) in nodes {
        tree.with_node(id, |node| {
            for attr in node.attrs().unwrap_or_default() {
                check(&attr.value, owner, &mut users);
            }
        });
    }
    found.iter().all(|f| *f).then_some(users)
}

fn percent_decode(text: &str) -> String {
    let hex = |b: u8| (b as char).to_digit(16).map(|d| d as u8);
    let bytes = text.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let (Some(hi), Some(lo)) = (hex(bytes[i + 1]), hex(bytes[i + 2])) {
                out.push(hi * 16 + lo);
                i += 3;
                continue;
            }
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

/// Fingerprints of every shaped line and word-split text run, each with the
/// box whose position and style it follows.
fn measure_text(laid: &crate::DomLayout, walk: &Walk) -> Vec<(Key, NodeId, Rect, f32, u64)> {
    let mut out = Vec::new();
    let box_of = |id: NodeId| {
        if laid.rects.contains_key(&id) {
            Some(id)
        } else {
            walk.owner_of.get(&id).copied()
        }
    };
    let mut add_lines = |node: NodeId, slot: u32, idx: usize| {
        let Some(owner) = box_of(node) else {
            return;
        };
        let placement = laid.text_engine.item_placement(idx).unwrap_or([0.0; 3]);
        laid.text_engine.for_each_item_line(idx, |line, ink, run| {
            let mut hash = Fnv::default();
            write_f32s(&mut hash, &placement);
            hash_line(&mut hash, run);
            let sub = SUB_LINE | (slot.min(0x3fff) << 16) | (line.min(0xffff) as u32);
            out.push(((node.raw(), sub), owner, ink, 0.0, hash.finish()));
        });
    };
    for (node, idx) in &laid.ifc_items {
        add_lines(*node, 0, *idx);
    }
    for (node, list) in laid.run_ifc_items.iter().chain(laid.word_ifc_items.iter()) {
        for (slot, idx) in list.iter().enumerate() {
            add_lines(*node, slot as u32 + 1, *idx);
        }
    }
    for (node, runs) in &laid.text_runs {
        let Some(owner) = box_of(*node) else {
            continue;
        };
        let Some(mut local) = runs.first().map(|(r, _)| *r) else {
            continue;
        };
        let mut hash = Fnv::default();
        for (r, word) in runs {
            local = union(local, *r);
            write_f32s(&mut hash, &[r.x, r.y, r.width, r.height]);
            hash.write(word.as_bytes());
            hash.write_u8(0);
        }
        let pad = local.height.clamp(4.0, 64.0);
        out.push(((node.raw(), SUB_WORDS), owner, local, pad, hash.finish()));
    }
    out
}

/// Which boxes paint which DOM nodes, in rendered (flat tree) order.
fn walk(tree: &DomTree, prepared: &PreparedRender, activity: u64) -> Walk {
    let laid = &prepared.layout;
    // Text painted as shaped lines or words is fingerprinted per line, so
    // its DOM text need not damage the whole box that owns it.
    let has_lines =
        |id: &NodeId| laid.ifc_items.contains_key(id) || laid.run_ifc_items.contains_key(id);
    let mut out = Walk {
        activity,
        ..Walk::default()
    };
    let mut data: HashMap<NodeId, Fnv> = HashMap::new();
    let mut visited: Vec<bool> = Vec::new();
    let document = tree.document();
    // (node, nearest box, nearest block-level box)
    let mut stack: Vec<(NodeId, Option<NodeId>, Option<NodeId>)> = vec![(document, None, None)];
    let mut previous_box: Option<NodeId> = None;
    let limit = tree.len().saturating_add(1);
    let mut count = 0usize;
    while let Some((id, owner, block)) = stack.pop() {
        let index = id.index();
        if visited.len() <= index {
            visited.resize(index + 1, false);
        }
        if visited[index] {
            continue;
        }
        visited[index] = true;
        count += 1;
        if count > limit {
            break;
        }
        let mut owner = owner;
        let mut block = block;
        if laid.rects.contains_key(&id) {
            if let Some(style) = laid.styles.get(&id) {
                out.boxes.push((id, owner, previous_box, 0));
                out.box_set.insert(id);
                data.insert(id, Fnv::default());
                if style.display != crate::Display::Inline {
                    block = Some(id);
                }
                owner = Some(id);
                previous_box = Some(id);
            }
        } else if let Some(owner_id) = owner {
            out.owner_of.insert(id, owner_id);
            if laid.styles.contains_key(&id) {
                out.owned.push((id, owner_id));
            }
        }
        if let Some(owner_id) = owner {
            let in_lines = laid.text_runs.contains_key(&id)
                || laid.word_ifc_items.contains_key(&id)
                || has_lines(&owner_id)
                || block.as_ref().is_some_and(has_lines);
            if let Some(hash) = data.get_mut(&owner_id) {
                let is_canvas = hash_node_data(hash, tree, id, in_lines);
                if is_canvas && owner_id == id {
                    out.canvases.push(id);
                }
            }
        }
        let children = crate::dom::rendered_children(tree, id);
        for child in children.into_iter().rev() {
            stack.push((child, owner, block));
        }
    }
    // Boxes the flat-tree walk did not reach still paint.
    for id in laid.rects.keys() {
        if !out.box_set.contains(id) && laid.styles.contains_key(id) {
            let mut hash = Fnv::default();
            hash_node_data(&mut hash, tree, *id, false);
            data.insert(*id, hash);
            out.boxes.push((*id, None, None, 0));
            out.box_set.insert(*id);
        }
    }
    for entry in &mut out.boxes {
        entry.3 = data.get(&entry.0).map_or(0, Fnv::finish);
    }
    out
}

/// Paint state of one box that lives outside its computed style.
fn hash_box_state(
    hash: &mut Fnv,
    prepared: &PreparedRender,
    scroll: &ResolvedScrollState,
    id: NodeId,
) {
    let laid = &prepared.layout;
    if let Some(clip) = laid.clip_rects.get(&id) {
        debug_hash(hash, clip);
    }
    // Inherited clips are in viewport space: compare them in document
    // space, or every clipped box would look changed on each root scroll.
    if let Some(clip) = scroll.inherited_clip_for(id) {
        let root = scroll.root_offset();
        debug_hash(hash, &clip.shifted_with_corners(root.0, root.1));
    }
    if let Some(image) = prepared.selected_images.get(&id) {
        debug_hash(hash, image);
    }
    // A scroll container's scrollbars and clipped content follow its offset.
    if let Some(Some(container)) = prepared.scroll_tree.node_container.get(id.index()) {
        if let Some(offset) = scroll.container_offsets.get(container.index()) {
            write_f32s(hash, &[offset.0, offset.1]);
        }
    }
    hash.write_u8(u8::from(prepared.viewport_fixed.contains(&id)));
}

/// Attributes and live form state of one DOM node, and its text unless that
/// text is compared as shaped lines. Returns whether it is a `<canvas>`.
fn hash_node_data(hash: &mut Fnv, tree: &DomTree, id: NodeId, text_in_lines: bool) -> bool {
    hash.write_u32(id.raw());
    let mut form = false;
    let mut canvas = false;
    tree.with_node(id, |node| match &node.data {
        NodeData::Text { contents } => {
            hash.write_u8(1);
            if !text_in_lines {
                hash.write(contents.as_bytes());
            }
        }
        NodeData::Element { name, attrs, .. } => {
            hash.write_u8(2);
            let local = name.local.as_ref();
            hash.write(local.as_bytes());
            form = matches!(local, "input" | "textarea" | "select" | "option" | "button");
            canvas = local == "canvas";
            for attr in attrs {
                hash.write(attr.name.local.as_bytes());
                hash.write_u8(0xff);
                hash.write(attr.value.as_bytes());
                hash.write_u8(0xfe);
            }
        }
        _ => hash.write_u8(3),
    });
    if form {
        if let Some(state) = tree.form_control_state(id) {
            debug_hash(hash, &state);
        }
    }
    canvas
}

/// Everything a shaped line paints: geometry, glyphs, fonts and colors.
fn hash_line(hash: &mut Fnv, run: &cosmic_text::LayoutRun<'_>) {
    write_f32s(
        hash,
        &[run.line_y, run.line_top, run.line_height, run.line_w],
    );
    hash.write_u8(u8::from(run.rtl));
    for g in run.glyphs {
        hash.write_u64(((g.start as u64) << 32) | g.end as u64);
        hash.write_u32(u32::from(g.glyph_id) | (u32::from(g.font_is_variable) << 16));
        write_f32s(
            hash,
            &[
                g.font_size,
                g.x,
                g.y,
                g.w,
                g.x_offset,
                g.y_offset,
                g.line_height_opt.unwrap_or(-1.0),
                g.font_weight_axis_opt.unwrap_or(-1.0),
                g.font_optical_size_opt.unwrap_or(-1.0),
            ],
        );
        g.font_id.hash(hash);
        hash.write_u32(g.color_opt.map_or(0, |c| c.0));
        hash.write_u64(g.metadata as u64);
        hash.write_u8(u8::from(g.font_italic_axis));
        hash.write_u8(g.level.number());
        hash.write_u32(g.cache_key_flags.bits());
    }
}

/// Where `local` (layout coordinates of box `id`) is painted, in document
/// coordinates, including ink outside the box.
fn visual_rect(
    prepared: &PreparedRender,
    scroll: &ResolvedScrollState,
    root: (f32, f32),
    id: NodeId,
    local: Rect,
    style: &LayoutStyle,
) -> Rect {
    let laid = &prepared.layout;
    let translate = laid.translates.get(&id).copied().unwrap_or((0.0, 0.0));
    let mut rect = union(
        local,
        Rect {
            x: local.x + translate.0,
            y: local.y + translate.1,
            ..local
        },
    );
    if let Some(transform) = laid.transforms.get(&id) {
        rect = union(rect, transformed_bounds(transform, local));
        rect = union(rect, transformed_bounds(transform, rect));
    }
    let movement = scroll.movement_for(id);
    rect.x += movement.0 + root.0;
    rect.y += movement.1 + root.1;
    let rect = inflate(rect, ink_margin(style));
    // Nothing paints outside the overflow clips of its ancestors.
    match scroll.inherited_clip_for(id) {
        Some(clip) => clip
            .shifted_with_corners(root.0, root.1)
            .intersect_rect(&rect)
            .unwrap_or_default(),
        None => rect,
    }
}

fn ink_margin(style: &LayoutStyle) -> f32 {
    // Antialiasing and subpixel rounding.
    let mut margin = 2.0_f32;
    let outline = &style.outline;
    if outline.specified_width > 0.0 {
        margin += outline.specified_width + outline.offset.abs();
    }
    if let Some(shadow) = &style.box_shadow {
        if !shadow.inset {
            margin += shadow.offset_x.abs()
                + shadow.offset_y.abs()
                + shadow.blur.abs() * 2.0
                + shadow.spread.max(0.0);
        }
    }
    if margin.is_finite() {
        margin
    } else {
        f32::MAX / 4.0
    }
}

fn transformed_bounds(t: &crate::Affine2, r: Rect) -> Rect {
    let corners = [
        (r.x, r.y),
        (r.x + r.width, r.y),
        (r.x, r.y + r.height),
        (r.x + r.width, r.y + r.height),
    ];
    let mut min = (f32::INFINITY, f32::INFINITY);
    let mut max = (f32::NEG_INFINITY, f32::NEG_INFINITY);
    for (x, y) in corners {
        let px = t.a * x + t.c * y + t.e;
        let py = t.b * x + t.d * y + t.f;
        min = (min.0.min(px), min.1.min(py));
        max = (max.0.max(px), max.1.max(py));
    }
    if !(min.0.is_finite() && min.1.is_finite() && max.0.is_finite() && max.1.is_finite()) {
        return r;
    }
    Rect {
        x: min.0,
        y: min.1,
        width: max.0 - min.0,
        height: max.1 - min.1,
    }
}

fn add_rect(map: &mut HashMap<NodeId, Rect>, id: NodeId, rect: Rect) {
    map.entry(id)
        .and_modify(|r| *r = union(*r, rect))
        .or_insert(rect);
}

fn union(a: Rect, b: Rect) -> Rect {
    let x0 = a.x.min(b.x);
    let y0 = a.y.min(b.y);
    let x1 = (a.x + a.width).max(b.x + b.width);
    let y1 = (a.y + a.height).max(b.y + b.height);
    Rect {
        x: x0,
        y: y0,
        width: x1 - x0,
        height: y1 - y0,
    }
}

fn inflate(r: Rect, by: f32) -> Rect {
    Rect {
        x: r.x - by,
        y: r.y - by,
        width: r.width + 2.0 * by,
        height: r.height + 2.0 * by,
    }
}

fn same_rect(a: &Rect, b: &Rect) -> bool {
    (a.x - b.x).abs() < 0.01
        && (a.y - b.y).abs() < 0.01
        && (a.width - b.width).abs() < 0.01
        && (a.height - b.height).abs() < 0.01
}

fn near(a: &Rect, b: &Rect) -> bool {
    a.x - MERGE_SLOP <= b.x + b.width
        && b.x - MERGE_SLOP <= a.x + a.width
        && a.y - MERGE_SLOP <= b.y + b.height
        && b.y - MERGE_SLOP <= a.y + a.height
}

/// Drop empty rects, merge neighbours, and keep the list short. A rect of
/// unknown extent becomes one rect over everything.
fn merge_rects(rects: Vec<Rect>) -> Vec<Rect> {
    let mut out: Vec<Rect> = Vec::new();
    for mut r in rects {
        if !(r.x.is_finite() && r.y.is_finite() && r.width.is_finite() && r.height.is_finite()) {
            return vec![Rect {
                x: -1.0e7,
                y: -1.0e7,
                width: 2.0e7,
                height: 2.0e7,
            }];
        }
        if r.width <= 0.0 || r.height <= 0.0 {
            continue;
        }
        // Absorb every rect this one touches, repeatedly.
        loop {
            let before = out.len();
            out.retain(|o| {
                if near(o, &r) {
                    r = union(r, *o);
                    false
                } else {
                    true
                }
            });
            if out.len() == before {
                break;
            }
        }
        out.push(r);
    }
    if out.len() > MAX_RECTS {
        let all = out.iter().copied().reduce(union).expect("non-empty");
        return vec![all];
    }
    out
}

fn write_f32s(hash: &mut Fnv, values: &[f32]) {
    for v in values {
        hash.write_u32(v.to_bits());
    }
}

/// Feed a value's `Debug` form to the hash, so every field takes part.
fn debug_hash(hash: &mut Fnv, value: &dyn std::fmt::Debug) {
    let _ = write!(HashWriter(hash), "{value:?}");
}

struct HashWriter<'a>(&'a mut Fnv);

impl std::fmt::Write for HashWriter<'_> {
    fn write_str(&mut self, s: &str) -> std::fmt::Result {
        self.0.write(s.as_bytes());
        Ok(())
    }
}

/// 64-bit FNV-1a variant over 8-byte words: fast change detection. A
/// collision only costs one missed repaint of one item.
struct Fnv(u64);

impl Default for Fnv {
    fn default() -> Self {
        Self(0xcbf2_9ce4_8422_2325)
    }
}

impl Hasher for Fnv {
    fn finish(&self) -> u64 {
        self.0
    }

    fn write(&mut self, bytes: &[u8]) {
        let mut chunks = bytes.chunks_exact(8);
        for chunk in &mut chunks {
            let word = u64::from_le_bytes(chunk.try_into().expect("8 bytes"));
            self.0 = (self.0 ^ word).wrapping_mul(0x0000_0100_0000_01b3);
            self.0 ^= self.0 >> 29;
        }
        for byte in chunks.remainder() {
            self.0 = (self.0 ^ u64::from(*byte)).wrapping_mul(0x0000_0100_0000_01b3);
        }
    }
}
