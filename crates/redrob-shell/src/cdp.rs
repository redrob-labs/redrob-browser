//! The window's CDP connection to the engine: one tab for now.
//!
//! The UI thread sends [`Command`]s; this task turns them into CDP calls and
//! sends painted tiles, scroll state and URL/title changes back as [`Update`]s.

use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::time::Duration;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::tiles::{TileKey, TILE};

pub enum Command {
    Navigate(String),
    Back,
    Forward,
    Reload,
    /// Viewport in CSS pixels and the device scale factor.
    Resize { width: u32, height: u32, scale: f32 },
    Mouse { kind: &'static str, x: f32, y: f32, button: &'static str, clicks: u32, modifiers: u32 },
    Wheel { x: f32, y: f32, dx: f32, dy: f32, modifiers: u32 },
    Key { down: bool, key: String, code: String, vk: u32, modifiers: u32 },
    Text(String),
    /// Paint these document tiles for this paint generation.
    Tiles { keys: Vec<TileKey>, generation: u64 },
}

pub enum Update {
    Tile { key: TileKey, generation: u64, image: egui::ColorImage },
    /// Pixels may have changed: repaint tiles.
    Invalidate,
    /// A different document: drop every tile.
    Navigated(String),
    /// The page's own scroll position and document size, in CSS pixels.
    Scroll { x: f32, y: f32, width: f32, height: f32 },
    Title(String),
    Error(String),
}

type Pending = HashMap<u64, oneshot::Sender<Value>>;

struct Conn {
    out: mpsc::UnboundedSender<String>,
    pending: std::sync::Arc<std::sync::Mutex<Pending>>,
    next: u64,
    session: Option<String>,
}

impl Conn {
    async fn call(&mut self, method: &str, params: Value) -> anyhow::Result<Value> {
        self.next += 1;
        let id = self.next;
        let mut msg = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = &self.session {
            msg["sessionId"] = json!(s);
        }
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.out.send(msg.to_string())?;
        let reply = tokio::time::timeout(Duration::from_secs(60), rx).await??;
        if let Some(err) = reply.get("error") {
            anyhow::bail!("{method}: {err}");
        }
        Ok(reply.get("result").cloned().unwrap_or(Value::Null))
    }

    /// Fire and forget: input events do not need their reply awaited.
    fn send(&mut self, method: &str, params: Value) {
        self.next += 1;
        let mut msg = json!({ "id": self.next, "method": method, "params": params });
        if let Some(s) = &self.session {
            msg["sessionId"] = json!(s);
        }
        let _ = self.out.send(msg.to_string());
    }
}

pub async fn run(
    ws_url: String,
    mut commands: mpsc::UnboundedReceiver<Command>,
    updates: Sender<Update>,
    repaint: impl Fn() + Send + 'static,
) -> anyhow::Result<()> {
    let (ws, _) = tokio_tungstenite::connect_async(ws_url.as_str()).await?;
    let (mut sink, mut stream) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<Value>();
    let pending: std::sync::Arc<std::sync::Mutex<Pending>> = Default::default();

    tokio::spawn(async move {
        while let Some(text) = out_rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });
    let pending_reader = pending.clone();
    tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            let Message::Text(text) = msg else { continue };
            let Ok(v) = serde_json::from_str::<Value>(text.as_str()) else { continue };
            if let Some(id) = v.get("id").and_then(Value::as_u64) {
                if let Some(tx) = pending_reader.lock().unwrap().remove(&id) {
                    let _ = tx.send(v);
                }
            } else {
                let _ = event_tx.send(v);
            }
        }
    });

    let mut c = Conn { out: out_tx, pending, next: 0, session: None };
    let target = c.call("Target.createTarget", json!({ "url": "about:blank" })).await?;
    let target_id = target["targetId"].as_str().unwrap_or_default().to_string();
    let attached = c
        .call("Target.attachToTarget", json!({ "targetId": target_id, "flatten": true }))
        .await?;
    c.session = attached["sessionId"].as_str().map(str::to_string);
    c.call("Page.enable", json!({})).await?;
    c.call("Runtime.enable", json!({})).await?;
    // Frames are only a signal here: the engine paints when the page changes.
    c.call("Page.startScreencast", json!({ "format": "jpeg", "quality": 1, "everyNthFrame": 1 }))
        .await?;

    let mut size = (1280u32, 800u32, 1.0f32);
    loop {
        tokio::select! {
            cmd = commands.recv() => {
                let Some(cmd) = cmd else { break };
                handle(&mut c, cmd, &mut size, &updates).await;
                repaint();
            }
            ev = event_rx.recv() => {
                let Some(ev) = ev else { break };
                match ev["method"].as_str() {
                    Some("Page.screencastFrame") => {
                        if let Some(id) = ev["params"]["sessionId"].as_u64() {
                            c.send("Page.screencastFrameAck", json!({ "sessionId": id }));
                        }
                        let _ = updates.send(Update::Invalidate);
                        repaint();
                    }
                    Some("Page.frameNavigated") => {
                        let frame = &ev["params"]["frame"];
                        if frame.get("parentId").is_none() {
                            let url = frame["url"].as_str().unwrap_or_default().to_string();
                            let _ = updates.send(Update::Navigated(url));
                            repaint();
                        }
                    }
                    Some("Page.navigatedWithinDocument") => {
                        if let Some(url) = ev["params"]["url"].as_str() {
                            let _ = updates.send(Update::Navigated(url.to_string()));
                        }
                    }
                    Some("Page.loadEventFired") | Some("Page.domContentEventFired") => {
                        if let Ok(v) = c.call("Runtime.evaluate", json!({ "expression": "document.title", "returnByValue": true })).await {
                            if let Some(t) = v["result"]["value"].as_str() {
                                let _ = updates.send(Update::Title(t.to_string()));
                            }
                        }
                        report_scroll(&mut c, &updates).await;
                        let _ = updates.send(Update::Invalidate);
                        repaint();
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

async fn handle(c: &mut Conn, cmd: Command, size: &mut (u32, u32, f32), updates: &Sender<Update>) {
    let result: anyhow::Result<()> = async {
        match cmd {
            Command::Navigate(url) => {
                c.call("Page.navigate", json!({ "url": url })).await?;
            }
            Command::Back => step_history(c, -1).await?,
            Command::Forward => step_history(c, 1).await?,
            Command::Reload => {
                c.call("Page.reload", json!({})).await?;
            }
            Command::Resize { width, height, scale } => {
                if (width, height, scale) != *size {
                    *size = (width, height, scale);
                    c.call(
                        "Emulation.setDeviceMetricsOverride",
                        json!({ "width": width, "height": height, "deviceScaleFactor": scale, "mobile": false }),
                    )
                    .await?;
                    report_scroll(c, updates).await;
                    let _ = updates.send(Update::Invalidate);
                }
            }
            Command::Mouse { kind, x, y, button, clicks, modifiers } => {
                c.send(
                    "Input.dispatchMouseEvent",
                    json!({ "type": kind, "x": x, "y": y, "button": button, "clickCount": clicks, "modifiers": modifiers }),
                );
                if kind == "mouseReleased" {
                    let _ = updates.send(Update::Invalidate);
                }
            }
            Command::Wheel { x, y, dx, dy, modifiers } => {
                // The page decides what scrolls (the document or an inner box);
                // the window then follows the document's real position.
                c.call(
                    "Input.dispatchMouseEvent",
                    json!({ "type": "mouseWheel", "x": x, "y": y, "deltaX": dx, "deltaY": dy, "modifiers": modifiers }),
                )
                .await?;
                report_scroll(c, updates).await;
            }
            Command::Key { down, key, code, vk, modifiers } => {
                let kind = if down { "keyDown" } else { "keyUp" };
                let mut p = json!({ "type": kind, "key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers });
                if down && key == "Enter" {
                    p["text"] = json!("\r");
                }
                c.call("Input.dispatchKeyEvent", p).await?;
                if down {
                    report_scroll(c, updates).await;
                    let _ = updates.send(Update::Invalidate);
                }
            }
            Command::Text(text) => {
                c.send("Input.insertText", json!({ "text": text }));
                let _ = updates.send(Update::Invalidate);
            }
            Command::Tiles { keys, generation } => {
                for key in keys {
                    let clip = json!({
                        "x": key.tx as f32 * TILE, "y": key.ty as f32 * TILE,
                        "width": TILE, "height": TILE, "scale": 1,
                    });
                    let shot = c
                        .call(
                            "Page.captureScreenshot",
                            json!({ "format": "png", "clip": clip, "captureBeyondViewport": true }),
                        )
                        .await?;
                    if let Some(image) = shot["data"].as_str().and_then(decode) {
                        let _ = updates.send(Update::Tile { key, generation, image });
                    }
                }
            }
        }
        Ok(())
    }
    .await;
    if let Err(e) = result {
        let _ = updates.send(Update::Error(e.to_string()));
    }
}

async fn report_scroll(c: &mut Conn, updates: &Sender<Update>) {
    let expr = "JSON.stringify([scrollX, scrollY, document.documentElement.scrollWidth, document.documentElement.scrollHeight])";
    let Ok(v) = c.call("Runtime.evaluate", json!({ "expression": expr, "returnByValue": true })).await else { return };
    let Some(s) = v["result"]["value"].as_str() else { return };
    let Ok(a) = serde_json::from_str::<[f32; 4]>(s) else { return };
    let _ = updates.send(Update::Scroll { x: a[0], y: a[1], width: a[2], height: a[3] });
}

async fn step_history(c: &mut Conn, delta: i64) -> anyhow::Result<()> {
    let h = c.call("Page.getNavigationHistory", json!({})).await?;
    let index = h["currentIndex"].as_i64().unwrap_or(0) + delta;
    if index < 0 {
        return Ok(());
    }
    if let Some(entry) = h["entries"].get(index as usize) {
        c.call("Page.navigateToHistoryEntry", json!({ "entryId": entry["id"] })).await?;
    }
    Ok(())
}

fn decode(data: &str) -> Option<egui::ColorImage> {
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).ok()?;
    let img = image::load_from_memory(&bytes).ok()?.to_rgba8();
    let size = [img.width() as usize, img.height() as usize];
    Some(egui::ColorImage::from_rgba_unmultiplied(size, img.as_raw()))
}
