//! The window's side of media playback: one player per playing element,
//! the current frame drawn over the page at the element's rectangle, and
//! simple controls for elements with the `controls` attribute.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use egui::{pos2, vec2, Color32, Rect, Sense, TextureHandle, TextureOptions};
use serde_json::Value;

use crate::cdp::Op;
use crate::media::{self, Player};
use crate::model::TabId;

const POLL: Duration = Duration::from_millis(250);

struct Item {
    player: Box<dyn Player>,
    texture: Option<TextureHandle>,
    serial: u64,
    /// Viewport rectangle in CSS pixels, None when off screen or hidden.
    rect: Option<[f32; 4]>,
    controls: bool,
    video: bool,
    looping: bool,
    src: String,
}

#[derive(Default)]
pub struct Media {
    items: HashMap<(TabId, u64), Item>,
    last_poll: Option<Instant>,
}

impl Media {
    /// A request from a page element.
    pub fn request(&mut self, tab: TabId, v: &Value) {
        let id = v["id"].as_u64().unwrap_or(0);
        let src = v["src"].as_str().unwrap_or_default().to_string();
        let key = (tab, id);
        match v["op"].as_str().unwrap_or_default() {
            "play" | "load" => {
                let stale = self.items.get(&key).is_some_and(|i| i.src != src);
                if stale {
                    self.items.remove(&key);
                }
                if !self.items.contains_key(&key) {
                    let Some(player) = media::open(&src) else { return };
                    self.items.insert(
                        key,
                        Item {
                            player,
                            texture: None,
                            serial: 0,
                            rect: None,
                            controls: v["controls"].as_bool().unwrap_or(false),
                            video: v["video"].as_bool().unwrap_or(true),
                            looping: v["loop"].as_bool().unwrap_or(false),
                            src,
                        },
                    );
                }
                let item = self.items.get_mut(&key).expect("just inserted");
                item.player.set_volume(v["volume"].as_f64().unwrap_or(1.0), v["muted"].as_bool().unwrap_or(false));
                if v["op"] == "play" {
                    item.player.play();
                }
            }
            "pause" => {
                if let Some(i) = self.items.get_mut(&key) {
                    i.player.pause();
                }
            }
            "seek" => {
                if let Some(i) = self.items.get_mut(&key) {
                    i.player.seek(v["currentTime"].as_f64().unwrap_or(0.0));
                }
            }
            "volume" => {
                if let Some(i) = self.items.get_mut(&key) {
                    i.player.set_volume(v["volume"].as_f64().unwrap_or(1.0), v["muted"].as_bool().unwrap_or(false));
                }
            }
            _ => {}
        }
    }

    pub fn set_rects(&mut self, tab: TabId, rects: Vec<(u64, Option<[f32; 4]>)>) {
        for (id, r) in rects {
            if let Some(i) = self.items.get_mut(&(tab, id)) {
                i.rect = r;
            }
        }
    }

    /// A tab navigated or closed: its media stops.
    pub fn drop_tab(&mut self, tab: TabId) {
        self.items.retain(|(t, _), _| *t != tab);
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
    }

    /// Report state to pages and ask where active-tab elements are, a few times a second.
    pub fn poll(&mut self, active: Option<TabId>, mut op: impl FnMut(TabId, Op)) {
        if self.last_poll.is_some_and(|t| t.elapsed() < POLL) {
            return;
        }
        self.last_poll = Some(Instant::now());
        let mut ids = Vec::new();
        for ((tab, id), item) in &mut self.items {
            let mut status = item.player.status();
            if status.ended && item.looping {
                item.player.seek(0.0);
                item.player.play();
                status.ended = false;
            }
            op(*tab, Op::MediaReport { id: *id, status });
            if Some(*tab) == active {
                ids.push(*id);
            }
        }
        if let (Some(tab), false) = (active, ids.is_empty()) {
            op(tab, Op::MediaRects(ids));
        }
    }

    /// Draw the active tab's video frames over the page, plus controls.
    /// Returns true while something plays, so the window keeps repainting.
    pub fn paint(&mut self, ui: &mut egui::Ui, page: Rect, tab: TabId) -> bool {
        let mut playing = false;
        for ((t, _), item) in &mut self.items {
            if *t != tab {
                continue;
            }
            let status = item.player.status();
            playing |= !status.paused;
            let Some([x, y, w, h]) = item.rect else { continue };
            let area = Rect::from_min_size(page.min + vec2(x, y), vec2(w, h)).intersect(page);
            if area.width() <= 0.0 || area.height() <= 0.0 {
                continue;
            }
            if item.video {
                let frame = item.player.frame();
                if let Ok(f) = frame.lock() {
                    if f.serial != item.serial && f.width > 0 && f.rgba.len() == (f.width * f.height * 4) as usize {
                        item.serial = f.serial;
                        let img = egui::ColorImage::from_rgba_unmultiplied([f.width as usize, f.height as usize], &f.rgba);
                        match &mut item.texture {
                            Some(t) => t.set(img, TextureOptions::LINEAR),
                            None => item.texture = Some(ui.ctx().load_texture("video", img, TextureOptions::LINEAR)),
                        }
                    }
                }
                let full = Rect::from_min_size(page.min + vec2(x, y), vec2(w, h));
                ui.painter().with_clip_rect(page).rect_filled(full, 0.0, Color32::BLACK);
                if let Some(tex) = &item.texture {
                    // Letterbox: keep the video's aspect ratio inside the element.
                    let size = tex.size_vec2();
                    let scale = (w / size.x).min(h / size.y);
                    let shown = Rect::from_center_size(full.center(), size * scale);
                    let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
                    ui.painter().with_clip_rect(page).image(tex.id(), shown, uv, Color32::WHITE);
                }
            }
            if item.controls {
                controls(ui, area, item, status);
            }
        }
        playing
    }
}

fn controls(ui: &mut egui::Ui, area: Rect, item: &mut Item, status: media::Status) {
    let bar = Rect::from_min_max(pos2(area.left(), area.bottom() - 28.0), area.max);
    let painter = ui.painter().with_clip_rect(area);
    painter.rect_filled(bar, 0.0, Color32::from_black_alpha(160));
    let button = Rect::from_min_size(bar.min, vec2(36.0, bar.height()));
    let label = if status.paused { crate::i18n::t("Play") } else { crate::i18n::t("Pause") };
    painter.text(button.center(), egui::Align2::CENTER_CENTER, label, egui::FontId::proportional(12.0), Color32::WHITE);
    if ui.interact(button, ui.id().with(("media-play", &item.src)), Sense::click()).clicked() {
        if status.paused {
            item.player.play();
        } else {
            item.player.pause();
        }
    }
    let track = Rect::from_min_max(pos2(button.right() + 8.0, bar.center().y - 3.0), pos2(bar.right() - 70.0, bar.center().y + 3.0));
    painter.rect_filled(track, 3.0, Color32::from_white_alpha(70));
    if status.duration.is_finite() && status.duration > 0.0 {
        let done = (status.current_time / status.duration).clamp(0.0, 1.0) as f32;
        painter.rect_filled(Rect::from_min_size(track.min, vec2(track.width() * done, track.height())), 3.0, Color32::WHITE);
        let r = ui.interact(track.expand2(vec2(0.0, 8.0)), ui.id().with(("media-seek", &item.src)), Sense::click());
        if let Some(p) = r.interact_pointer_pos().filter(|_| r.clicked()) {
            let frac = ((p.x - track.left()) / track.width()).clamp(0.0, 1.0) as f64;
            item.player.seek(frac * status.duration);
        }
        let time = format!("{} / {}", clock(status.current_time), clock(status.duration));
        painter.text(pos2(bar.right() - 6.0, bar.center().y), egui::Align2::RIGHT_CENTER, time, egui::FontId::proportional(11.0), Color32::WHITE);
    }
}

fn clock(s: f64) -> String {
    let s = s.max(0.0) as u64;
    format!("{}:{:02}", s / 60, s % 60)
}
