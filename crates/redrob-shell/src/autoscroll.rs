//! Middle-click autoscroll, as Chrome on Windows does it.
//!
//! - A middle click (press and release in place) on anything but a link
//!   starts autoscroll; the next click of any button, or Escape, stops it.
//! - Holding the middle button and moving scrolls while it is held; releasing
//!   it stops.
//! - The page scrolls toward the pointer, faster the farther the pointer is
//!   from where the click was, with a small dead zone around that point.
//! - A middle click on a link opens the link in a new background tab.
//!
//! Whether the click is on a link is asked of the page (`Op::LinkAt`), so the
//! middle press is held back from the page until that answer comes.

use std::time::Instant;

use egui::{Color32, Pos2, Rect, Stroke, Vec2};

/// Pixels around the anchor where the page does not move.
const DEAD_ZONE: f32 = 15.0;
/// Scroll speed in CSS px per second for each pixel past the dead zone.
const SPEED: f32 = 8.0;
const MAX_SPEED: f32 = 8000.0;
/// Wheel steps are sent to the engine at most this often.
const SEND_EVERY_SECS: f32 = 0.05;

#[derive(Default)]
pub struct Autoscroll {
    /// A middle press waiting for the page to say whether it hit a link.
    pending: Option<Pos2>,
    /// The middle button was released before the answer came.
    released_early: bool,
    anchor: Option<Pos2>,
    held: bool,
    moved: bool,
    last: Option<Instant>,
    unsent: Vec2,
    since_send: f32,
}

/// What the window must do this frame.
#[derive(Default)]
pub struct Step {
    /// Ask the page what is under this page-local point.
    pub ask_link_at: Option<(f32, f32)>,
    /// Scroll by this many CSS px now (window tiles), and send it as a wheel
    /// event at `wheel_at` when set.
    pub scroll: Vec2,
    pub wheel_at: Option<(f32, f32)>,
    pub wheel: Vec2,
}

impl Autoscroll {
    pub fn active(&self) -> bool {
        self.anchor.is_some()
    }

    /// Where autoscroll started: the box there is the one that scrolls.
    pub fn anchor(&self) -> Option<Pos2> {
        self.anchor
    }

    /// Take middle-button events (and the stopping click while active) out of
    /// `events` before they reach the page.
    pub fn filter(&mut self, events: &mut Vec<egui::Event>, rect: Rect) -> Step {
        let mut step = Step::default();
        events.retain(|ev| match ev {
            egui::Event::PointerButton {
                pos,
                button,
                pressed,
                ..
            } => {
                if self.anchor.is_some() {
                    if *button == egui::PointerButton::Middle && !*pressed {
                        // Dragged with the button held: releasing stops.
                        if self.held && self.moved {
                            self.stop();
                        }
                        self.held = false;
                    } else if *pressed {
                        self.stop();
                    }
                    return false;
                }
                if *button != egui::PointerButton::Middle {
                    return true;
                }
                if *pressed && rect.contains(*pos) {
                    self.pending = Some(*pos);
                    self.released_early = false;
                    self.held = true;
                    self.moved = false;
                    step.ask_link_at = Some(((pos.x - rect.left()), (pos.y - rect.top())));
                } else if !*pressed {
                    self.held = false;
                    if self.pending.is_some() {
                        self.released_early = true;
                    }
                }
                false
            }
            egui::Event::Key {
                key: egui::Key::Escape,
                pressed: true,
                ..
            } if self.anchor.is_some() => {
                self.stop();
                false
            }
            _ => true,
        });
        step
    }

    /// The page's answer to `ask_link_at`: the link's URL, if any. Returns the
    /// URL to open in a new tab.
    pub fn link_answer(&mut self, link: Option<String>) -> Option<String> {
        let at = self.pending.take()?;
        match link {
            Some(url) if !url.is_empty() => {
                self.held = false;
                Some(url)
            }
            _ => {
                self.anchor = Some(at);
                // Released before the answer and not dragged: toggle mode.
                if self.released_early {
                    self.held = false;
                }
                self.last = Some(Instant::now());
                self.unsent = Vec2::ZERO;
                self.since_send = 0.0;
                None
            }
        }
    }

    pub fn stop(&mut self) {
        self.anchor = None;
        self.pending = None;
        self.held = false;
        self.moved = false;
        self.last = None;
    }

    /// Advance one frame: how far to scroll for the pointer at `pointer`.
    pub fn tick(&mut self, pointer: Option<Pos2>, rect: Rect) -> Step {
        let mut step = Step::default();
        let (Some(anchor), Some(p)) = (self.anchor, pointer) else {
            return step;
        };
        let now = Instant::now();
        let dt = self
            .last
            .map_or(0.0, |t| now.duration_since(t).as_secs_f32())
            .min(0.1);
        self.last = Some(now);
        let d = p - anchor;
        if d.length() > DEAD_ZONE {
            self.moved = true;
        }
        let axis = |v: f32| {
            let past = v.abs() - DEAD_ZONE;
            if past <= 0.0 {
                0.0
            } else {
                (past * SPEED).min(MAX_SPEED) * v.signum()
            }
        };
        let v = Vec2::new(axis(d.x), axis(d.y));
        let delta = v * dt;
        step.scroll = delta;
        self.unsent += delta;
        self.since_send += dt;
        if self.since_send >= SEND_EVERY_SECS && self.unsent != Vec2::ZERO {
            step.wheel = self.unsent;
            step.wheel_at = Some((anchor.x - rect.left(), anchor.y - rect.top()));
            self.unsent = Vec2::ZERO;
            self.since_send = 0.0;
        }
        step
    }

    /// The anchor mark: a circle with arrows, like Chrome's.
    pub fn paint(&self, painter: &egui::Painter, ink: Color32, fill: Color32) {
        let Some(c) = self.anchor else { return };
        painter.circle(c, 14.0, fill, Stroke::new(1.0, ink));
        painter.circle_filled(c, 2.0, ink);
        for dir in [
            Vec2::new(0.0, -1.0),
            Vec2::new(0.0, 1.0),
            Vec2::new(-1.0, 0.0),
            Vec2::new(1.0, 0.0),
        ] {
            let tip = c + dir * 10.0;
            let side = Vec2::new(dir.y, -dir.x) * 3.5;
            let base = c + dir * 6.5;
            painter.add(egui::Shape::convex_polygon(
                vec![tip, base + side, base - side],
                ink,
                Stroke::NONE,
            ));
        }
    }
}
