//! The scene channel: framed `SceneMsg`s from the engine, `ClientMsg`s back.
//!
//! Messages are `u32` little-endian length + bincode body
//! (`redrob_scene::encode`). Resources are turned into vello images and
//! fonts on the reader task, so the UI thread only swaps them in.

use std::sync::Arc;

use redrob_scene::{ClientMsg, FontId, Frame, FrameDelta, ImageId, Resource, SceneMsg};
use tokio::io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt};
use tokio::sync::mpsc;
use vello::peniko::{Blob, FontData, ImageAlphaType, ImageData, ImageFormat};

/// A message longer than this is a broken stream, not a frame.
const MAX_MESSAGE: usize = 1 << 30;

pub enum Prepared {
    Image(ImageId, ImageData),
    Font(FontId, FontData),
    /// A variable font at fixed axis values: `id` draws with `font`'s
    /// file at these (OpenType tag, user value) settings.
    FontInstance {
        id: FontId,
        font: FontId,
        axes: Vec<([u8; 4], f32)>,
    },
    DropImage(ImageId),
    DropFont(FontId),
}

/// A scene message ready for the UI thread.
pub enum Incoming {
    Resources(Vec<Prepared>),
    Frame(Box<Frame>),
    Delta(Box<FrameDelta>),
    /// The channel closed or broke.
    Closed(String),
}

pub fn prepare(msg: SceneMsg) -> Incoming {
    match msg {
        SceneMsg::Frame(f) => Incoming::Frame(Box::new(f)),
        SceneMsg::Delta(d) => Incoming::Delta(Box::new(d)),
        SceneMsg::Resources(list) => Incoming::Resources(
            list.into_iter()
                .filter_map(|r| match r {
                    Resource::Image {
                        id,
                        width,
                        height,
                        rgba,
                    } => {
                        let expected = width as usize * height as usize * 4;
                        if width == 0 || height == 0 || rgba.len() != expected {
                            eprintln!("redrob-browser: scene image {} has a bad size", id.0);
                            return None;
                        }
                        Some(Prepared::Image(
                            id,
                            ImageData {
                                data: Blob::from(rgba),
                                format: ImageFormat::Rgba8,
                                alpha_type: ImageAlphaType::AlphaPremultiplied,
                                width,
                                height,
                            },
                        ))
                    }
                    Resource::Font { id, data, index } => {
                        // vello unwraps the face when drawing; refuse a bad one here.
                        if skrifa::FontRef::from_index(&data, index).is_err() {
                            eprintln!("redrob-browser: scene font {} is not a font", id.0);
                            return None;
                        }
                        Some(Prepared::Font(id, FontData::new(Blob::from(data), index)))
                    }
                    Resource::DropImage(id) => Some(Prepared::DropImage(id)),
                    Resource::DropFont(id) => Some(Prepared::DropFont(id)),
                    // Resources added to the contract later (FontInstance),
                    // read by name so this builds against either version.
                    #[allow(unreachable_patterns)]
                    other => font_instance(&other),
                })
                .collect(),
        ),
    }
}

/// A `Resource::FontInstance { id, font, axes }`, from its serde form.
fn font_instance(r: &Resource) -> Option<Prepared> {
    let v = serde_json::to_value(r).ok()?;
    let fi = v.get("FontInstance")?;
    let id = FontId(fi.get("id")?.as_u64()?);
    let font = FontId(fi.get("font")?.as_u64()?);
    let axes = fi
        .get("axes")?
        .as_array()?
        .iter()
        .filter_map(|a| {
            let tag = a.get(0)?.as_array()?;
            let mut t = [0u8; 4];
            for (i, b) in tag.iter().take(4).enumerate() {
                t[i] = b.as_u64()? as u8;
            }
            Some((t, a.get(1)?.as_f64()? as f32))
        })
        .collect();
    Some(Prepared::FontInstance { id, font, axes })
}

/// Read framed messages until the stream ends.
async fn read_loop<R: AsyncRead + Unpin>(mut r: R, deliver: &(dyn Fn(Incoming) + Send + Sync)) {
    let mut len = [0u8; 4];
    let mut body = Vec::new();
    let reason = loop {
        if let Err(e) = r.read_exact(&mut len).await {
            break e.to_string();
        }
        let n = u32::from_le_bytes(len) as usize;
        if n > MAX_MESSAGE {
            break format!("scene message of {n} bytes");
        }
        body.resize(n, 0);
        if let Err(e) = r.read_exact(&mut body).await {
            break e.to_string();
        }
        match redrob_scene::decode::<SceneMsg>(&body) {
            Ok(msg) => deliver(prepare(msg)),
            Err(e) => break format!("bad scene message: {e}"),
        }
    };
    deliver(Incoming::Closed(reason));
}

async fn write_loop<W: AsyncWrite + Unpin>(mut w: W, mut rx: mpsc::UnboundedReceiver<ClientMsg>) {
    while let Some(msg) = rx.recv().await {
        let mut bytes = redrob_scene::encode(&msg);
        // Send everything queued in one write: scroll updates come in bursts.
        while let Ok(next) = rx.try_recv() {
            bytes.extend(redrob_scene::encode(&next));
        }
        if w.write_all(&bytes).await.is_err() || w.flush().await.is_err() {
            break;
        }
    }
}

/// Open the scene socket at `address` (`unix:<path>`, a path, `tcp:<host:port>`
/// or `<host:port>`), start reading it, and return the sender for messages
/// to the engine. Each message read goes to `deliver`.
pub async fn connect(
    address: &str,
    deliver: Arc<dyn Fn(Incoming) + Send + Sync>,
) -> std::io::Result<mpsc::UnboundedSender<ClientMsg>> {
    let (tx, rx) = mpsc::unbounded_channel();
    let tcp = address.strip_prefix("tcp:").or_else(|| {
        (!address.starts_with('/') && !address.starts_with("unix:") && address.contains(':'))
            .then_some(address)
    });
    if let Some(addr) = tcp {
        let stream = tokio::net::TcpStream::connect(addr).await?;
        let _ = stream.set_nodelay(true);
        let (r, w) = stream.into_split();
        tokio::spawn(async move { read_loop(r, &*deliver).await });
        tokio::spawn(write_loop(w, rx));
        return Ok(tx);
    }
    #[cfg(unix)]
    {
        let path = address.strip_prefix("unix:").unwrap_or(address);
        let stream = tokio::net::UnixStream::connect(path).await?;
        let (r, w) = stream.into_split();
        tokio::spawn(async move { read_loop(r, &*deliver).await });
        tokio::spawn(write_loop(w, rx));
        Ok(tx)
    }
    #[cfg(not(unix))]
    {
        Err(std::io::Error::new(
            std::io::ErrorKind::Unsupported,
            format!("scene socket {address}: only TCP addresses work here"),
        ))
    }
}

/// Messages from a debug scene file: a JSON `SceneMsg` or array of them, or
/// framed bincode `SceneMsg`s as on the socket.
pub fn load_file(path: &std::path::Path) -> Result<Vec<Incoming>, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let first = bytes.iter().find(|b| !b.is_ascii_whitespace()).copied();
    let msgs: Vec<SceneMsg> = match first {
        Some(b'[') => serde_json::from_slice(&bytes).map_err(|e| e.to_string())?,
        Some(b'{') => vec![serde_json::from_slice(&bytes).map_err(|e| e.to_string())?],
        _ => {
            let mut out = Vec::new();
            let mut at = 0;
            while at + 4 <= bytes.len() {
                let n = u32::from_le_bytes(bytes[at..at + 4].try_into().unwrap()) as usize;
                let body = bytes
                    .get(at + 4..at + 4 + n)
                    .ok_or_else(|| "truncated scene file".to_string())?;
                out.push(redrob_scene::decode(body).map_err(|e| e.to_string())?);
                at += 4 + n;
            }
            out
        }
    };
    Ok(msgs.into_iter().map(prepare).collect())
}
