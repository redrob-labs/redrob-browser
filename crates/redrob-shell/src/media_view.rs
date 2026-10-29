//! The window's side of media playback: one player per playing element,
//! the current frame drawn over the page at the element's rectangle, and
//! simple controls for elements with the `controls` attribute.
//! Also: Media Source Extensions bytes, full-screen video over the whole
//! window, and WebVTT subtitles drawn at the bottom of the video.

use std::collections::HashMap;
use std::time::{Duration, Instant};

use base64::Engine as _;
use egui::{pos2, vec2, Color32, Rect, Sense, TextureHandle, TextureOptions};
use serde_json::Value;

use crate::cdp::Op;
use crate::media::{self, Player};
use crate::model::TabId;
use crate::webvtt;

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
    /// The showing subtitles or captions track, once one is chosen.
    cues: Option<webvtt::Cues>,
    /// The URL `cues` came from.
    track: String,
}

impl Item {
    fn new(player: Box<dyn Player>, v: &Value, src: String) -> Self {
        Item {
            player,
            texture: None,
            serial: 0,
            rect: None,
            controls: v["controls"].as_bool().unwrap_or(false),
            video: v["video"].as_bool().unwrap_or(true),
            looping: v["loop"].as_bool().unwrap_or(false),
            src,
            cues: None,
            track: String::new(),
        }
    }

    /// Load the first `default` (or showing) subtitles or captions track.
    fn pick_track(&mut self, v: &Value) {
        let Some(tracks) = v["tracks"].as_array() else {
            return;
        };
        let chosen = tracks.iter().find(|t| {
            matches!(t["kind"].as_str(), Some("subtitles" | "captions"))
                && (t["default"].as_bool() == Some(true) || t["mode"] == "showing")
        });
        let src = chosen.and_then(|t| t["src"].as_str()).unwrap_or_default();
        if src.is_empty() {
            self.cues = None;
            self.track.clear();
        } else if src != self.track {
            self.track = src.to_string();
            self.cues = Some(webvtt::load(src));
        }
    }
}

/// One tab's players, on their way to another window.
pub struct TabMedia {
    items: Vec<((TabId, u64), Item)>,
    pending: Vec<(TabId, Op)>,
}

#[derive(Default)]
pub struct Media {
    items: HashMap<(TabId, u64), Item>,
    last_poll: Option<Instant>,
    /// The element shown full screen, if any.
    fullscreen: Option<(TabId, u64)>,
    /// Whether the window itself is in full-screen mode for it.
    window_fullscreen: bool,
    /// Scripts for pages, sent on the next poll.
    pending: Vec<(TabId, Op)>,
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
                if let std::collections::hash_map::Entry::Vacant(e) = self.items.entry(key) {
                    let Some(player) = media::open(&src) else {
                        return;
                    };
                    e.insert(Item::new(player, v, src));
                }
                let item = self.items.get_mut(&key).expect("just inserted");
                item.controls = v["controls"].as_bool().unwrap_or(item.controls);
                item.pick_track(v);
                item.player.set_volume(
                    v["volume"].as_f64().unwrap_or(1.0),
                    v["muted"].as_bool().unwrap_or(false),
                );
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
                    i.player.set_volume(
                        v["volume"].as_f64().unwrap_or(1.0),
                        v["muted"].as_bool().unwrap_or(false),
                    );
                }
            }
            // Media Source Extensions: the element's MediaSource was attached.
            "mse-open" => {
                let stale = self.items.get(&key).is_some_and(|i| i.src != src);
                if stale {
                    self.items.remove(&key);
                }
                if let std::collections::hash_map::Entry::Vacant(e) = self.items.entry(key) {
                    let Some(player) = media::open_mse() else {
                        return;
                    };
                    e.insert(Item::new(player, v, src));
                }
            }
            "mse-add" => {
                if let Some(i) = self.items.get_mut(&key) {
                    i.player.mse_add(
                        v["sb"].as_u64().unwrap_or(0),
                        v["mime"].as_str().unwrap_or_default(),
                    );
                }
            }
            "mse-append" => {
                let data = v["data"].as_str().unwrap_or_default();
                let (Some(i), Ok(bytes)) = (
                    self.items.get_mut(&key),
                    base64::engine::general_purpose::STANDARD.decode(data),
                ) else {
                    return;
                };
                i.player.mse_append(v["sb"].as_u64().unwrap_or(0), bytes);
            }
            "mse-end" => {
                if let Some(i) = self.items.get_mut(&key) {
                    i.player.mse_end();
                }
            }
            "fullscreen" => {
                if v["on"].as_bool().unwrap_or(false) {
                    self.fullscreen = Some(key);
                } else if self.fullscreen == Some(key) {
                    self.fullscreen = None;
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

    /// A tab moves to another window: its players go with it, still playing.
    pub fn take_tab(&mut self, tab: TabId) -> TabMedia {
        let keys: Vec<_> = self.items.keys().filter(|(t, _)| *t == tab).copied().collect();
        let items = keys
            .into_iter()
            .filter_map(|k| self.items.remove(&k).map(|i| (k, i)))
            .collect();
        if self.fullscreen.is_some_and(|(t, _)| t == tab) {
            self.fullscreen = None;
        }
        let pending = self.pending.iter().filter(|(t, _)| *t == tab).count();
        let mut taken = Vec::with_capacity(pending);
        let mut kept = Vec::with_capacity(self.pending.len() - pending);
        for (t, op) in self.pending.drain(..) {
            if t == tab {
                taken.push((t, op));
            } else {
                kept.push((t, op));
            }
        }
        self.pending = kept;
        TabMedia {
            items,
            pending: taken,
        }
    }

    /// The other half of [`Media::take_tab`], in the window the tab moved to.
    pub fn put_tab(&mut self, media: TabMedia) {
        self.items.extend(media.items);
        self.pending.extend(media.pending);
    }

    /// A tab navigated or closed: its media stops.
    pub fn drop_tab(&mut self, tab: TabId) {
        self.items.retain(|(t, _), _| *t != tab);
        if self.fullscreen.is_some_and(|(t, _)| t == tab) {
            self.fullscreen = None;
        }
        self.pending.retain(|(t, _)| *t != tab);
    }

    pub fn is_empty(&self) -> bool {
        self.items.is_empty()
            && self.fullscreen.is_none()
            && !self.window_fullscreen
            && self.pending.is_empty()
    }

    /// Report state to pages and ask where active-tab elements are, a few times a second.
    pub fn poll(&mut self, active: Option<TabId>, mut op: impl FnMut(TabId, Op)) {
        for (tab, o) in self.pending.drain(..) {
            op(tab, o);
        }
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
        // Full screen belongs to one tab; switching tabs leaves it.
        if let Some((t, id)) = self.fullscreen.filter(|(t, _)| *t != tab) {
            self.exit_fullscreen(t, id);
        }
        self.sync_window(ui.ctx());
        let mut playing = false;
        let fullscreen = self.fullscreen;
        for (key, item) in &mut self.items {
            if key.0 != tab || fullscreen == Some(*key) {
                continue;
            }
            let status = item.player.status();
            playing |= !status.paused;
            let Some([x, y, w, h]) = item.rect else {
                continue;
            };
            let area = Rect::from_min_size(page.min + vec2(x, y), vec2(w, h)).intersect(page);
            if area.width() <= 0.0 || area.height() <= 0.0 {
                continue;
            }
            let full = Rect::from_min_size(page.min + vec2(x, y), vec2(w, h));
            if item.video {
                let painter = ui.painter().with_clip_rect(page);
                upload(ui.ctx(), item);
                draw_frame(&painter, item, full);
                draw_cue(&painter, item, full, status.current_time);
            }
            if item.controls {
                controls(ui, area, item, status);
            }
        }
        if let Some(key) = fullscreen {
            playing = true;
            if self.paint_fullscreen(ui.ctx(), key) {
                self.exit_fullscreen(key.0, key.1);
                self.sync_window(ui.ctx());
            }
        }
        playing
    }

    /// The video over the whole window, with its controls. Returns true when
    /// the person pressed Escape.
    fn paint_fullscreen(&mut self, ctx: &egui::Context, key: (TabId, u64)) -> bool {
        let screen = ctx.content_rect();
        let item = self.items.get_mut(&key);
        egui::Area::new(egui::Id::new("redrob-media-fullscreen"))
            .order(egui::Order::Foreground)
            .fixed_pos(screen.min)
            .show(ctx, |ui| {
                let (rect, _) = ui.allocate_exact_size(screen.size(), Sense::click());
                ui.painter().rect_filled(rect, 0.0, Color32::BLACK);
                if let Some(item) = item {
                    let status = item.player.status();
                    upload(ui.ctx(), item);
                    draw_frame(ui.painter(), item, rect);
                    draw_cue(ui.painter(), item, rect, status.current_time);
                    controls(ui, rect, item, status);
                }
                ui.input(|i| i.key_pressed(egui::Key::Escape))
            })
            .inner
    }

    /// Leave full screen and tell the page, which fires fullscreenchange.
    fn exit_fullscreen(&mut self, tab: TabId, id: u64) {
        self.fullscreen = None;
        let script = format!("globalThis.__redrobFullscreenExit && __redrobFullscreenExit({id})");
        self.pending.push((tab, Op::MediaEval(script)));
    }

    /// Put the window into (or out of) full-screen mode to match.
    fn sync_window(&mut self, ctx: &egui::Context) {
        let want = self.fullscreen.is_some();
        if want != self.window_fullscreen {
            self.window_fullscreen = want;
            ctx.send_viewport_cmd(egui::ViewportCommand::Fullscreen(want));
        }
    }
}

/// Upload a new decoded frame to the item's texture.
fn upload(ctx: &egui::Context, item: &mut Item) {
    let frame = item.player.frame();
    let Ok(f) = frame.lock() else { return };
    if f.serial != item.serial && f.width > 0 && f.rgba.len() == (f.width * f.height * 4) as usize {
        item.serial = f.serial;
        let img = egui::ColorImage::from_rgba_unmultiplied(
            [f.width as usize, f.height as usize],
            &f.rgba,
        );
        match &mut item.texture {
            Some(t) => t.set(img, TextureOptions::LINEAR),
            None => item.texture = Some(ctx.load_texture("video", img, TextureOptions::LINEAR)),
        }
    }
}

/// Black box with the frame letterboxed inside, keeping its aspect ratio.
fn draw_frame(painter: &egui::Painter, item: &Item, full: Rect) {
    painter.rect_filled(full, 0.0, Color32::BLACK);
    if let Some(tex) = &item.texture {
        let size = tex.size_vec2();
        let scale = (full.width() / size.x).min(full.height() / size.y);
        let shown = Rect::from_center_size(full.center(), size * scale);
        let uv = Rect::from_min_max(pos2(0.0, 0.0), pos2(1.0, 1.0));
        painter.image(tex.id(), shown, uv, Color32::WHITE);
    }
}

/// The subtitle cue showing now, centred near the bottom of the video.
fn draw_cue(painter: &egui::Painter, item: &Item, full: Rect, time: f64) {
    let Some(text) = item.cues.as_ref().and_then(|c| webvtt::active(c, time)) else {
        return;
    };
    let size = (full.height() * 0.045).clamp(12.0, 36.0);
    let galley = painter.layout(
        text,
        egui::FontId::proportional(size),
        Color32::WHITE,
        full.width() * 0.9,
    );
    let margin = if item.controls { 36.0 } else { 12.0 };
    let pos = pos2(
        full.center().x - galley.size().x / 2.0,
        full.bottom() - margin - galley.size().y,
    );
    let back = Rect::from_min_size(pos, galley.size()).expand(4.0);
    painter.rect_filled(back, 4.0, Color32::from_black_alpha(170));
    painter.galley(pos, galley, Color32::WHITE);
}

fn controls(ui: &mut egui::Ui, area: Rect, item: &mut Item, status: media::Status) {
    let bar = Rect::from_min_max(pos2(area.left(), area.bottom() - 28.0), area.max);
    let painter = ui.painter().with_clip_rect(area);
    painter.rect_filled(bar, 0.0, Color32::from_black_alpha(160));
    let button = Rect::from_min_size(bar.min, vec2(36.0, bar.height()));
    let label = if status.paused {
        crate::i18n::t("Play")
    } else {
        crate::i18n::t("Pause")
    };
    painter.text(
        button.center(),
        egui::Align2::CENTER_CENTER,
        label,
        egui::FontId::proportional(12.0),
        Color32::WHITE,
    );
    if ui
        .interact(
            button,
            ui.id().with(("media-play", &item.src)),
            Sense::click(),
        )
        .clicked()
    {
        if status.paused {
            item.player.play();
        } else {
            item.player.pause();
        }
    }
    let track = Rect::from_min_max(
        pos2(button.right() + 8.0, bar.center().y - 3.0),
        pos2(bar.right() - 70.0, bar.center().y + 3.0),
    );
    painter.rect_filled(track, 3.0, Color32::from_white_alpha(70));
    if status.duration.is_finite() && status.duration > 0.0 {
        let done = (status.current_time / status.duration).clamp(0.0, 1.0) as f32;
        painter.rect_filled(
            Rect::from_min_size(track.min, vec2(track.width() * done, track.height())),
            3.0,
            Color32::WHITE,
        );
        let r = ui.interact(
            track.expand2(vec2(0.0, 8.0)),
            ui.id().with(("media-seek", &item.src)),
            Sense::click(),
        );
        if let Some(p) = r.interact_pointer_pos().filter(|_| r.clicked()) {
            let frac = ((p.x - track.left()) / track.width()).clamp(0.0, 1.0) as f64;
            item.player.seek(frac * status.duration);
        }
        let time = format!(
            "{} / {}",
            clock(status.current_time),
            clock(status.duration)
        );
        painter.text(
            pos2(bar.right() - 6.0, bar.center().y),
            egui::Align2::RIGHT_CENTER,
            time,
            egui::FontId::proportional(11.0),
            Color32::WHITE,
        );
    }
}

fn clock(s: f64) -> String {
    let s = s.max(0.0) as u64;
    format!("{}:{:02}", s / 60, s % 60)
}
