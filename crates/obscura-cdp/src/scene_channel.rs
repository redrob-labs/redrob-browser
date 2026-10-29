//! The scene channel (docs/COMPOSITOR.md): `Page.redrobSceneAttach` opens a
//! local socket for one tab and streams its compositor frames to the window.
//!
//! Messages are `redrob_scene::encode` frames both ways. The engine sends a
//! full `Frame` on first paint and after any content change (DOM, style,
//! layout, images, fonts, animations), coalesced per animation frame with at
//! most two frames the window has not presented, and a spatial-only `Delta`
//! when script only scrolled. Resources go out once per connection and are
//! dropped when no frame references them. The window reports its own
//! scrolling (`Scrolled`), which the page applies without relayout, and
//! presentation (`Presented`) for flow control.

use std::collections::{HashMap, HashSet};
use std::io::{ErrorKind, Read, Write};

use obscura_js::redrob_scene as rs;

use crate::dispatch::CdpContext;

/// At most this many frames may be on their way to the screen.
const MAX_UNPRESENTED: u64 = 2;
/// A client message larger than this is a protocol error.
const MAX_CLIENT_MESSAGE: usize = 1 << 20;

#[cfg(unix)]
type Listener = std::os::unix::net::UnixListener;
#[cfg(unix)]
type Stream = std::os::unix::net::UnixStream;
#[cfg(not(unix))]
type Listener = std::net::TcpListener;
#[cfg(not(unix))]
type Stream = std::net::TcpStream;

pub(crate) struct SceneStream {
    listener: Listener,
    /// What `Page.redrobSceneAttach` returned.
    pub address: String,
    #[cfg(unix)]
    path: std::path::PathBuf,
    client: Option<Stream>,
    read_buf: Vec<u8>,
    write_buf: Vec<u8>,
    epoch: u64,
    /// Epoch of the last full frame (deltas apply to it).
    frame_epoch: u64,
    presented: u64,
    sent_images: HashSet<u64>,
    sent_fonts: HashSet<u64>,
    /// Content signals of the last frame sent.
    activity: u64,
    scroll_generation: u64,
    paint_epoch: Option<u64>,
    needs_frame: bool,
    /// Device pixels per CSS pixel of the window (`rasterScale`).
    pub(crate) raster_scale: f32,
    /// The last frame's spatial tree, scroll node indices and the scrollers
    /// only script can move (a change there needs a new frame).
    spatial: Vec<rs::SpatialNode>,
    scroll_nodes: HashMap<u64, usize>,
    baked_scrollers: HashSet<u64>,
    /// Offsets of `baked_scrollers` the last frame was painted at.
    baked_offsets: HashMap<u64, (f32, f32)>,
    /// Media element id per video node, for `External` keys.
    media_ids: HashMap<u64, u64>,
    /// Offsets the window holds, per scroll node: what it reported or what
    /// the engine last told it to adopt.
    window_offsets: HashMap<u64, (f32, f32)>,
}

impl SceneStream {
    /// Open the channel for page `page_id`.
    pub(crate) fn bind(page_id: &str) -> std::io::Result<Self> {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let dir = std::env::var_os("XDG_RUNTIME_DIR")
                .map(std::path::PathBuf::from)
                .filter(|dir| dir.is_dir())
                .unwrap_or_else(std::env::temp_dir);
            static NEXT: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
            let serial = NEXT.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
            let tag: String = page_id
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .take(12)
                .collect();
            let path = dir.join(format!(
                "redrob-scene-{}-{tag}-{serial}.sock",
                std::process::id()
            ));
            let _ = std::fs::remove_file(&path);
            let listener = Listener::bind(&path)?;
            // Only this user may connect: the stream carries page content.
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))?;
            listener.set_nonblocking(true)?;
            Ok(Self::new(listener, path.display().to_string(), path))
        }
        #[cfg(not(unix))]
        {
            let _ = page_id;
            let listener = Listener::bind(("127.0.0.1", 0))?;
            listener.set_nonblocking(true)?;
            let address = listener.local_addr()?.to_string();
            Ok(Self::new(listener, address))
        }
    }

    fn new(
        listener: Listener,
        address: String,
        #[cfg(unix)] path: std::path::PathBuf,
    ) -> Self {
        Self {
            listener,
            address,
            #[cfg(unix)]
            path,
            client: None,
            read_buf: Vec::new(),
            write_buf: Vec::new(),
            epoch: 0,
            frame_epoch: 0,
            presented: 0,
            sent_images: HashSet::new(),
            sent_fonts: HashSet::new(),
            activity: 0,
            scroll_generation: 0,
            paint_epoch: None,
            needs_frame: true,
            raster_scale: 1.0,
            spatial: Vec::new(),
            scroll_nodes: HashMap::new(),
            baked_scrollers: HashSet::new(),
            baked_offsets: HashMap::new(),
            media_ids: HashMap::new(),
            window_offsets: HashMap::new(),
        }
    }

    pub(crate) fn transport(&self) -> &'static str {
        if cfg!(unix) {
            "unix"
        } else {
            "tcp"
        }
    }

    /// Accept a (re)connecting window: everything is sent again.
    fn accept(&mut self) {
        if self.client.is_some() {
            return;
        }
        let Ok((stream, _)) = self.listener.accept() else {
            return;
        };
        if stream.set_nonblocking(true).is_err() {
            return;
        }
        self.client = Some(stream);
        self.read_buf.clear();
        self.write_buf.clear();
        self.sent_images.clear();
        self.sent_fonts.clear();
        self.window_offsets.clear();
        self.presented = self.epoch;
        self.needs_frame = true;
    }

    fn disconnect(&mut self) {
        self.client = None;
        self.write_buf.clear();
        self.read_buf.clear();
    }

    /// Read whatever the window sent; complete messages are returned.
    fn read_messages(&mut self) -> Vec<rs::ClientMsg> {
        let mut out = Vec::new();
        let Some(client) = self.client.as_mut() else {
            return out;
        };
        let mut chunk = [0u8; 16 * 1024];
        let mut closed = false;
        loop {
            match client.read(&mut chunk) {
                Ok(0) => {
                    closed = true;
                    break;
                }
                Ok(read) => self.read_buf.extend_from_slice(&chunk[..read]),
                Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(_) => {
                    closed = true;
                    break;
                }
            }
        }
        loop {
            if self.read_buf.len() < 4 {
                break;
            }
            let len = u32::from_le_bytes(self.read_buf[..4].try_into().expect("4 bytes")) as usize;
            if len > MAX_CLIENT_MESSAGE {
                closed = true;
                break;
            }
            if self.read_buf.len() < 4 + len {
                break;
            }
            match rs::decode::<rs::ClientMsg>(&self.read_buf[4..4 + len]) {
                Ok(message) => out.push(message),
                Err(error) => tracing::debug!("scene channel: bad client message: {error}"),
            }
            self.read_buf.drain(..4 + len);
        }
        if closed {
            self.disconnect();
        }
        out
    }

    fn flush(&mut self) {
        let Some(client) = self.client.as_mut() else {
            return;
        };
        let mut failed = false;
        while !self.write_buf.is_empty() {
            match client.write(&self.write_buf) {
                Ok(0) => {
                    failed = true;
                    break;
                }
                Ok(written) => {
                    self.write_buf.drain(..written);
                }
                Err(error) if error.kind() == ErrorKind::WouldBlock => break,
                Err(error) if error.kind() == ErrorKind::Interrupted => continue,
                Err(_) => {
                    failed = true;
                    break;
                }
            }
        }
        if failed {
            self.disconnect();
        }
    }

    fn queue<T: serde::Serialize>(&mut self, message: &T) {
        self.write_buf.extend_from_slice(&rs::encode(message));
    }

    /// Send one full frame with the resources it needs, dropping the ones it
    /// no longer references.
    fn send_frame(&mut self, mut built: obscura_js::SceneFrame) {
        let mut resources = Vec::new();
        let images: HashSet<u64> = built.images.iter().map(|image| image.id.0).collect();
        let fonts: HashSet<u64> = built
            .fonts
            .iter()
            .map(|font| font.id.0)
            .chain(built.font_instances.iter().map(|instance| instance.id.0))
            .collect();
        for image in &built.images {
            if self.sent_images.insert(image.id.0) {
                resources.push(rs::Resource::Image {
                    id: image.id,
                    width: image.width,
                    height: image.height,
                    rgba: image.rgba.as_ref().clone(),
                });
            }
        }
        for font in &built.fonts {
            if self.sent_fonts.insert(font.id.0) {
                resources.push(rs::Resource::Font {
                    id: font.id,
                    data: font.data.bytes().to_vec(),
                    index: font.data.index(),
                });
            }
        }
        for instance in &built.font_instances {
            if self.sent_fonts.insert(instance.id.0) {
                resources.push(rs::Resource::FontInstance {
                    id: instance.id,
                    font: instance.font,
                    axes: instance.axes.clone(),
                });
            }
        }
        let stale_images: Vec<u64> = self.sent_images.difference(&images).copied().collect();
        for id in stale_images {
            self.sent_images.remove(&id);
            resources.push(rs::Resource::DropImage(rs::ImageId(id)));
        }
        let stale_fonts: Vec<u64> = self.sent_fonts.difference(&fonts).copied().collect();
        for id in stale_fonts {
            self.sent_fonts.remove(&id);
            resources.push(rs::Resource::DropFont(rs::FontId(id)));
        }
        if !resources.is_empty() {
            self.queue(&rs::SceneMsg::Resources(resources));
        }

        self.scroll_nodes = built.scroll_nodes.iter().copied().collect();
        self.baked_scrollers = built.baked_scrollers.iter().copied().collect();
        self.mark_page_scrolls(&mut built.frame.spatial);
        self.epoch += 1;
        self.frame_epoch = self.epoch;
        built.frame.epoch = self.epoch;
        self.spatial = built.frame.spatial.clone();
        self.queue(&rs::SceneMsg::Frame(built.frame));
    }

    /// Flag scroll nodes whose engine offset differs from what the window
    /// holds (script scrolled them), and remember the offsets sent.
    fn mark_page_scrolls(&mut self, spatial: &mut [rs::SpatialNode]) -> bool {
        let mut changed = false;
        for node in spatial.iter_mut() {
            if let rs::SpatialKind::Scroll {
                offset,
                offset_changed_by_page,
                node: dom,
                ..
            } = &mut node.kind
            {
                match self.window_offsets.get(dom) {
                    Some(window) if (window.0 - offset.0).abs() < 0.5 && (window.1 - offset.1).abs() < 0.5 => {
                        *offset_changed_by_page = false;
                    }
                    Some(_) => {
                        *offset_changed_by_page = true;
                        changed = true;
                    }
                    // A node new to the window starts at `offset`.
                    None => *offset_changed_by_page = false,
                }
                self.window_offsets.insert(*dom, *offset);
            }
        }
        changed
    }

    /// Script scrolled without changing content: send the spatial tree with
    /// the new offsets. False when a frame is needed instead.
    fn send_scroll_delta(&mut self, root: (f32, f32), elements: &[(u64, (f32, f32))]) -> bool {
        if self.spatial.is_empty() {
            return false;
        }
        let live: HashMap<u64, (f32, f32)> = elements.iter().copied().collect();
        // A script-only scroller is painted at its offset: moving it means
        // repainting, not a delta.
        for node in &self.baked_scrollers {
            if live.get(node) != self.baked_offsets.get(node) {
                return false;
            }
        }
        let mut spatial = self.spatial.clone();
        for (dom, index) in &self.scroll_nodes {
            let Some(node) = spatial.get_mut(*index) else {
                continue;
            };
            if let rs::SpatialKind::Scroll { offset, .. } = &mut node.kind {
                *offset = if *dom == 0 {
                    root
                } else {
                    live.get(dom).copied().unwrap_or((0.0, 0.0))
                };
            }
        }
        if !self.mark_page_scrolls(&mut spatial) {
            return true;
        }
        self.epoch += 1;
        self.spatial = spatial.clone();
        let delta = rs::FrameDelta {
            epoch: self.epoch,
            base_epoch: self.frame_epoch,
            spatial: Some(spatial),
            ..Default::default()
        };
        self.queue(&rs::SceneMsg::Delta(delta));
        true
    }
}

#[cfg(unix)]
impl Drop for SceneStream {
    fn drop(&mut self) {
        let _ = std::fs::remove_file(&self.path);
    }
}

/// `Page.redrobSceneAttach`: start streaming the session's tab.
pub(crate) fn attach(
    ctx: &mut CdpContext,
    session_id: &Option<String>,
    params: &serde_json::Value,
) -> Result<serde_json::Value, String> {
    let page_id = session_id
        .as_ref()
        .and_then(|session| ctx.sessions.get(session))
        .cloned()
        .ok_or("Page.redrobSceneAttach needs a page session")?;
    if !ctx.scenes.contains_key(&page_id) {
        let stream = SceneStream::bind(&page_id)
            .map_err(|error| format!("Page.redrobSceneAttach could not open the scene socket: {error}"))?;
        ctx.scenes.insert(page_id.clone(), stream);
    }
    let raster_scale = params
        .get("rasterScale")
        .and_then(|value| value.as_f64())
        .map(|value| value as f32)
        .or_else(|| ctx.get_page(&page_id).map(|page| page.device_scale_factor))
        .unwrap_or(1.0);
    let stream = ctx.scenes.get_mut(&page_id).expect("scene stream");
    if (stream.raster_scale - raster_scale).abs() > f32::EPSILON {
        stream.raster_scale = raster_scale;
        stream.needs_frame = true;
    }
    Ok(serde_json::json!({
        "transport": stream.transport(),
        "address": stream.address,
        "socketPath": if cfg!(unix) { serde_json::Value::String(stream.address.clone()) } else { serde_json::Value::Null },
    }))
}

/// `Page.redrobSceneDetach`: stop streaming the session's tab.
pub(crate) fn detach(ctx: &mut CdpContext, session_id: &Option<String>) {
    if let Some(page_id) = session_id
        .as_ref()
        .and_then(|session| ctx.sessions.get(session))
        .cloned()
    {
        ctx.scenes.remove(&page_id);
    }
}

pub(crate) fn has_scenes(ctx: &CdpContext) -> bool {
    !ctx.scenes.is_empty()
}

/// One animation frame of every scene channel on this connection.
pub(crate) fn pump(ctx: &mut CdpContext) {
    // Channels of closed tabs go away with their sockets.
    let live: HashSet<String> = ctx.pages.iter().map(|page| page.id.clone()).collect();
    let page_ids: Vec<String> = ctx.scenes.keys().cloned().collect();
    for page_id in page_ids {
        let Some(mut stream) = ctx.scenes.remove(&page_id) else {
            continue;
        };
        if !live.contains(&page_id) {
            // A navigation can hold the page outside the context for a
            // while; the channel goes only when no session names the tab.
            if ctx.sessions.values().any(|id| id == &page_id) {
                ctx.scenes.insert(page_id, stream);
            }
            continue;
        }
        stream.accept();
        if stream.client.is_some() {
            pump_stream(ctx, &page_id, &mut stream);
            stream.flush();
        }
        ctx.scenes.insert(page_id, stream);
    }
}

fn pump_stream(ctx: &mut CdpContext, page_id: &str, stream: &mut SceneStream) {
    let messages = stream.read_messages();
    let Some(page) = ctx.get_page_mut(page_id) else {
        return;
    };
    for message in messages {
        match message {
            rs::ClientMsg::Presented { epoch } => {
                stream.presented = stream.presented.max(epoch.min(stream.epoch));
            }
            rs::ClientMsg::Scrolled { node, offset } => {
                stream.window_offsets.insert(node, offset);
                page.apply_compositor_scroll(node, offset);
            }
        }
    }
    if stream.client.is_none() {
        return;
    }
    // Writes still queued from the last frame: the window is not reading.
    if stream.write_buf.len() > 64 << 20 {
        return;
    }
    let (activity, scroll_generation, dirty, paint_epoch) = page.scene_change_signals();
    let scrolled = scroll_generation != stream.scroll_generation;
    let activity_delta = activity.wrapping_sub(stream.activity);
    let scroll_delta = scroll_generation.wrapping_sub(stream.scroll_generation);
    let content_changed = stream.needs_frame
        || dirty
        || paint_epoch != stream.paint_epoch
        || activity_delta > scroll_delta
        || page.prepared_has_active_css_animations();
    if content_changed {
        if stream.epoch.saturating_sub(stream.presented) >= MAX_UNPRESENTED {
            stream.needs_frame = true;
            return;
        }
        match page.scene_frame(stream.raster_scale) {
            Ok(mut built) => {
                media_keys(page, &mut built.frame, &mut stream.media_ids);
                let (activity, scroll_generation, _, paint_epoch) = page.scene_change_signals();
                let (_, elements, _) = page.scroll_snapshot();
                let elements: HashMap<u64, (f32, f32)> = elements.into_iter().collect();
                stream.baked_offsets = built
                    .baked_scrollers
                    .iter()
                    .filter_map(|node| elements.get(node).map(|offset| (*node, *offset)))
                    .collect();
                stream.activity = activity;
                stream.scroll_generation = scroll_generation;
                stream.paint_epoch = paint_epoch;
                stream.needs_frame = false;
                tracing::debug!(
                    items = built.frame.items.len(),
                    hits = built.frame.hits.len(),
                    paint_ms = built.stats.paint_ms,
                    assemble_ms = built.stats.assemble_ms,
                    "scene frame"
                );
                stream.send_frame(built);
            }
            Err(error) => {
                tracing::debug!("scene frame failed: {error:?}");
                stream.needs_frame = true;
            }
        }
        return;
    }
    if scrolled {
        let (root, elements, generation) = page.scroll_snapshot();
        stream.scroll_generation = generation;
        stream.activity = activity;
        if !stream.send_scroll_delta(root, &elements) {
            stream.needs_frame = true;
        }
    }
}

/// `External` items name their element by node; the window knows a video
/// by its media id (`__redrobMediaElements`, docs/MEDIA.md). Rewrite keys.
fn media_keys(
    page: &mut obscura_browser::Page,
    frame: &mut rs::Frame,
    cache: &mut HashMap<u64, u64>,
) {
    for item in &mut frame.items {
        let rs::Item::External { key, .. } = &mut item.item else {
            continue;
        };
        let node = key.saturating_sub(1);
        let id = match cache.get(&node) {
            Some(id) => *id,
            None => {
                let code = format!(
                    "(function(){{var e=globalThis._wrap&&globalThis._wrap({node});return e&&e.__media?e.__media.id:0}})()"
                );
                // Script numbers arrive as JSON floats.
                let id = page.evaluate(&code).as_f64().map_or(0, |id| id as u64);
                if id != 0 {
                    cache.insert(node, id);
                }
                id
            }
        };
        *key = id;
    }
}
