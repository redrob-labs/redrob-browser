//! Scrolling, owned by the window: wheel, keys, autoscroll and scrollbar
//! drags change offsets here and are sent to the engine as
//! `ClientMsg::Scrolled`. The engine's offsets are taken only when the page
//! itself scrolled (`offset_changed_by_page`).

use std::collections::HashMap;
use std::time::{Duration, Instant};

use redrob_scene::{ClientMsg, SpatialKind, ROOT_SCROLL};
use vello::kurbo::Point;

use super::spatial::Resolved;
use super::state::{max_offset, TabScene};

/// Smooth scrolls (wheel notches, keys) ease over this long.
const SMOOTH: Duration = Duration::from_millis(150);
/// Wheel events this close together keep scrolling the same box.
const LATCH: Duration = Duration::from_millis(300);
/// Arrow keys scroll this far, as in Chrome.
const ARROW: f32 = 40.0;

#[derive(Clone, Copy)]
struct Anim {
    from: (f32, f32),
    to: (f32, f32),
    start: Instant,
}

#[derive(Default)]
pub struct Scrolls {
    pos: HashMap<u64, (f32, f32)>,
    anim: HashMap<u64, Anim>,
    /// The offset the engine last heard of, per scroller.
    sent: HashMap<u64, (f32, f32)>,
    latch: Option<(u64, Instant)>,
    /// The scroller keys move: the innermost one last clicked in.
    focus: Option<u64>,
}

impl Scrolls {
    pub fn offsets(&self) -> &HashMap<u64, (f32, f32)> {
        &self.pos
    }

    pub fn offset(&self, node: u64) -> Option<(f32, f32)> {
        self.pos.get(&node).copied()
    }

    /// The engine sent a scroll node: take its offset when the page set it
    /// or the window has none yet, and keep the window's inside the range.
    pub fn adopt(&mut self, node: u64, offset: (f32, f32), by_page: bool, max: (f32, f32)) {
        let clamp = |o: (f32, f32)| (o.0.clamp(0.0, max.0), o.1.clamp(0.0, max.1));
        if by_page || !self.pos.contains_key(&node) {
            self.pos.insert(node, clamp(offset));
            self.anim.remove(&node);
            self.sent.insert(node, offset);
        } else if let Some(p) = self.pos.get_mut(&node) {
            *p = clamp(*p);
            if let Some(a) = self.anim.get_mut(&node) {
                a.to = clamp(a.to);
            }
        }
    }
}

/// Keys that scroll the page when no text field has focus.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ScrollKey {
    Up,
    Down,
    Left,
    Right,
    PageUp,
    PageDown,
    Home,
    End,
}

impl ScrollKey {
    pub fn from_key(key: egui::Key, shift: bool) -> Option<Self> {
        Some(match key {
            egui::Key::ArrowUp => Self::Up,
            egui::Key::ArrowDown => Self::Down,
            egui::Key::ArrowLeft => Self::Left,
            egui::Key::ArrowRight => Self::Right,
            egui::Key::PageUp => Self::PageUp,
            egui::Key::PageDown => Self::PageDown,
            egui::Key::Home => Self::Home,
            egui::Key::End => Self::End,
            egui::Key::Space if shift => Self::PageUp,
            egui::Key::Space => Self::PageDown,
            _ => return None,
        })
    }
}

#[derive(Clone, Copy)]
pub(super) struct Scroller {
    pub index: usize,
    pub node: u64,
    pub frame: redrob_scene::Rect,
    pub max: (f32, f32),
}

impl TabScene {
    pub(super) fn scroller(&self, i: usize) -> Option<Scroller> {
        let n = self.frame.as_ref()?.spatial.get(i)?;
        match &n.kind {
            SpatialKind::Scroll {
                frame,
                content,
                node,
                ..
            } => Some(Scroller {
                index: i,
                node: *node,
                frame: *frame,
                max: max_offset(frame, *content),
            }),
            _ => None,
        }
    }

    fn scroller_by_node(&self, node: u64) -> Option<Scroller> {
        let frame = self.frame.as_ref()?;
        (0..frame.spatial.len())
            .filter_map(|i| self.scroller(i))
            .find(|s| s.node == node)
    }

    fn root_scroller(&self) -> Option<Scroller> {
        self.index.get(&ROOT_SCROLL).and_then(|i| self.scroller(*i))
    }

    /// Every scroll frame that can move.
    pub(super) fn scrollers(&self) -> Vec<Scroller> {
        let n = self.frame.as_ref().map_or(0, |f| f.spatial.len());
        (0..n)
            .filter_map(|i| self.scroller(i))
            .filter(|s| s.max.0 > 0.0 || s.max.1 > 0.0)
            .collect()
    }

    pub(super) fn pos(&self, s: &Scroller) -> (f32, f32) {
        self.scroll.offset(s.node).unwrap_or((0.0, 0.0))
    }

    /// The scroll frames under page point `p`, innermost first, ending
    /// with the document.
    fn chain_at(&self, res: &Resolved, p: Point) -> Vec<Scroller> {
        let Some(frame) = &self.frame else {
            return Vec::new();
        };
        // The box under the pointer, else the deepest scroll frame there.
        let start = self.hit_index(res, p).map(|h| frame.hits[h].spatial).and_then(|id| self.index.get(&id).copied()).or_else(|| {
            self.scrollers()
                .into_iter()
                .filter(|s| {
                    res.scroll_rect(frame, s.index).is_some_and(|r| r.contains(p))
                        && res.visible_at(frame, s.index, p)
                })
                .max_by_key(|s| res.clip_chain(s.index).len())
                .map(|s| s.index)
        });
        let mut chain = Vec::new();
        let mut at = start;
        let mut steps = 0;
        while let Some(i) = at {
            if let Some(s) = self.scroller(i) {
                chain.push(s);
            }
            steps += 1;
            if steps > frame.spatial.len() {
                break;
            }
            at = res.parent.get(i).copied().flatten();
        }
        if let Some(root) = self.root_scroller() {
            if !chain.iter().any(|s| s.node == root.node) {
                chain.push(root);
            }
        }
        chain
    }

    fn can_scroll(&self, s: &Scroller, d: (f32, f32)) -> bool {
        let (x, y) = self.target(s);
        (d.0 > 0.0 && x < s.max.0 - 0.5)
            || (d.0 < 0.0 && x > 0.5)
            || (d.1 > 0.0 && y < s.max.1 - 0.5)
            || (d.1 < 0.0 && y > 0.5)
    }

    /// Where `s` is heading: its animation's end, else where it is.
    fn target(&self, s: &Scroller) -> (f32, f32) {
        self.scroll
            .anim
            .get(&s.node)
            .map_or_else(|| self.pos(s), |a| a.to)
    }

    /// Scroll the innermost box under `at` that can move by `delta` CSS px
    /// (a wheel, a touchpad, autoscroll). Returns whether anything moved.
    pub fn scroll_at(&mut self, res: &Resolved, at: (f32, f32), delta: (f32, f32), smooth: bool) -> bool {
        if delta == (0.0, 0.0) {
            return false;
        }
        let now = Instant::now();
        let latched = self
            .scroll
            .latch
            .filter(|(_, t)| now.duration_since(*t) < LATCH)
            .and_then(|(node, _)| self.scroller_by_node(node));
        let target = latched.or_else(|| {
            self.chain_at(res, Point::new(f64::from(at.0), f64::from(at.1)))
                .into_iter()
                .find(|s| self.can_scroll(s, delta))
        });
        match target {
            Some(s) => {
                self.scroll.latch = Some((s.node, now));
                self.scroll_by(&s, delta, smooth)
            }
            None => {
                self.scroll.latch = None;
                false
            }
        }
    }

    /// The pointer went down at `at`: keys now scroll the box there.
    pub fn pointer_down(&mut self, res: &Resolved, at: (f32, f32)) {
        self.scroll.focus = self
            .chain_at(res, Point::new(f64::from(at.0), f64::from(at.1)))
            .into_iter()
            .find(|s| s.max.0 > 0.0 || s.max.1 > 0.0)
            .map(|s| s.node);
    }

    /// A scrolling key the page did not take.
    pub fn scroll_key(&mut self, key: ScrollKey) -> bool {
        let focus = self.scroll.focus.and_then(|n| self.scroller_by_node(n));
        let delta_for = |s: &Scroller, pos: (f32, f32)| {
            let page = (s.frame.h * 0.875).max(s.frame.h - ARROW).max(ARROW);
            match key {
                ScrollKey::Up => (0.0, -ARROW),
                ScrollKey::Down => (0.0, ARROW),
                ScrollKey::Left => (-ARROW, 0.0),
                ScrollKey::Right => (ARROW, 0.0),
                ScrollKey::PageUp => (0.0, -page),
                ScrollKey::PageDown => (0.0, page),
                ScrollKey::Home => (0.0, -pos.1),
                ScrollKey::End => (0.0, s.max.1 - pos.1),
            }
        };
        let candidates = focus.into_iter().chain(self.root_scroller());
        for s in candidates {
            let d = delta_for(&s, self.target(&s));
            if self.can_scroll(&s, d) {
                return self.scroll_by(&s, d, true);
            }
        }
        false
    }

    fn scroll_by(&mut self, s: &Scroller, delta: (f32, f32), smooth: bool) -> bool {
        let base = self.target(s);
        let to = (
            (base.0 + delta.0).clamp(0.0, s.max.0),
            (base.1 + delta.1).clamp(0.0, s.max.1),
        );
        self.set_target(s, to, smooth)
    }

    fn set_target(&mut self, s: &Scroller, to: (f32, f32), smooth: bool) -> bool {
        let from = self.pos(s);
        if smooth && from != to {
            self.scroll.anim.insert(
                s.node,
                Anim {
                    from,
                    to,
                    start: Instant::now(),
                },
            );
        } else {
            self.scroll.anim.remove(&s.node);
            self.scroll.pos.insert(s.node, to);
        }
        self.changed();
        from != to
    }

    /// Put scroller `node` at `to` now (a scrollbar drag) or smoothly.
    pub(super) fn scroll_node_to(&mut self, node: u64, to: (f32, f32), smooth: bool) {
        if let Some(s) = self.scroller_by_node(node) {
            let to = (to.0.clamp(0.0, s.max.0), to.1.clamp(0.0, s.max.1));
            self.set_target(&s, to, smooth);
        }
    }

    /// Advance smooth scrolls; true while one runs.
    pub fn tick(&mut self) -> bool {
        if self.scroll.anim.is_empty() {
            return false;
        }
        let now = Instant::now();
        let mut done = Vec::new();
        for (node, a) in &self.scroll.anim {
            let t = now.duration_since(a.start).as_secs_f32() / SMOOTH.as_secs_f32();
            let p = if t >= 1.0 {
                done.push(*node);
                a.to
            } else {
                let e = 1.0 - (1.0 - t).powi(3);
                (
                    a.from.0 + (a.to.0 - a.from.0) * e,
                    a.from.1 + (a.to.1 - a.from.1) * e,
                )
            };
            self.scroll.pos.insert(*node, p);
        }
        for node in done {
            self.scroll.anim.remove(&node);
        }
        self.changed();
        !self.scroll.anim.is_empty()
    }

    /// Tell the engine about every offset it has not heard of yet.
    pub fn flush(&mut self) {
        let changed: Vec<(u64, (f32, f32))> = self
            .scroll
            .pos
            .iter()
            .filter(|(n, p)| self.scroll.sent.get(n) != Some(p))
            .map(|(n, p)| (*n, *p))
            .collect();
        for (node, offset) in changed {
            self.scroll.sent.insert(node, offset);
            self.send(ClientMsg::Scrolled { node, offset });
        }
    }
}
