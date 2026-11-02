//! Middle-click autoscroll, as Chrome on Windows does it.
//!
//! - A middle click (press and release in place) on anything but a link
//!   starts autoscroll; the next click of any button, or Escape, stops it.
//! - Holding the middle button and moving scrolls while it is held; releasing
//!   it stops.
//! - The page scrolls toward the pointer, faster the farther the pointer is
//!   from where the click was, with a small dead zone around that point.
//! - A middle click on a link opens the link in a new background tab.
//! - A middle click in a text field goes to the page (Linux pastes there).
//!
//! Chromium knows what is under the pointer (its status message and
//! cursor, cef/osr.rs), so the window decides at once; the page scrolls by
//! precise wheel events at the anchor. Chromium's own middle-click
//! autoscroll wedges an off-screen renderer, so it stays off.

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
    anchor: Option<Pos2>,
    held: bool,
    moved: bool,
    last: Option<Instant>,
    unsent: Vec2,
    since_send: f32,
}

/// What the window must do this frame: scroll the page by `wheel` CSS
/// pixels at the page point `wheel_at`.
#[derive(Default)]
pub struct Step {
    pub wheel_at: Option<(f32, f32)>,
    pub wheel: Vec2,
}

impl Autoscroll {
    pub fn active(&self) -> bool {
        self.anchor.is_some()
    }

    /// Take middle-button events (and the stopping click while active) out of
    /// `events` before they reach the page. `link`: the link under the
    /// pointer; `text`: a text field is. Returns a link to open in a new tab.
    pub fn filter(
        &mut self,
        events: &mut Vec<egui::Event>,
        rect: Rect,
        link: Option<&str>,
        text: bool,
    ) -> Option<String> {
        let mut open = None;
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
                if *button != egui::PointerButton::Middle || text {
                    return true;
                }
                if *pressed && rect.contains(*pos) {
                    match link.filter(|l| !l.is_empty()) {
                        Some(url) => open = Some(url.to_string()),
                        None => {
                            self.anchor = Some(*pos);
                            self.held = true;
                            self.moved = false;
                            self.last = Some(Instant::now());
                            self.unsent = Vec2::ZERO;
                            self.since_send = 0.0;
                        }
                    }
                } else if !*pressed {
                    self.held = false;
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
        open
    }

    pub fn stop(&mut self) {
        self.anchor = None;
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
