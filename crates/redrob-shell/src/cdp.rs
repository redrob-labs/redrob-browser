//! The window's CDP connection to the engine: one tab for now.
//!
//! The UI thread sends [`Command`]s; this task turns them into CDP calls and
//! sends decoded page frames and URL/title changes back as [`Update`]s.

use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::time::Duration;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

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
}

pub enum Update {
    Frame { width: u32, height: u32, rgba: Vec<u8> },
    Url(String),
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
    c.call(
        "Page.startScreencast",
        json!({ "format": "jpeg", "quality": 85, "everyNthFrame": 1 }),
    )
    .await?;

    let mut size = (1280u32, 800u32, 1.0f32);
    loop {
        tokio::select! {
            cmd = commands.recv() => {
                let Some(cmd) = cmd else { break };
                let needs_capture = handle(&mut c, cmd, &mut size, &updates).await;
                if needs_capture {
                    capture(&mut c, size, &updates).await;
                    repaint();
                }
            }
            ev = event_rx.recv() => {
                let Some(ev) = ev else { break };
                match ev["method"].as_str() {
                    Some("Page.screencastFrame") => {
                        let p = &ev["params"];
                        if let Some(id) = p["sessionId"].as_u64() {
                            c.send("Page.screencastFrameAck", json!({ "sessionId": id }));
                        }
                        if let Some(data) = p["data"].as_str() {
                            push_frame(data, &updates);
                            repaint();
                        }
                    }
                    Some("Page.frameNavigated") => {
                        let frame = &ev["params"]["frame"];
                        if frame.get("parentId").is_none() {
                            if let Some(url) = frame["url"].as_str() {
                                let _ = updates.send(Update::Url(url.to_string()));
                            }
                        }
                    }
                    Some("Page.loadEventFired") => {
                        if let Ok(v) = c.call("Runtime.evaluate", json!({ "expression": "document.title", "returnByValue": true })).await {
                            if let Some(t) = v["result"]["value"].as_str() {
                                let _ = updates.send(Update::Title(t.to_string()));
                            }
                        }
                        capture(&mut c, size, &updates).await;
                        repaint();
                    }
                    _ => {}
                }
            }
        }
    }
    Ok(())
}

/// Returns true when the page should be captured again afterwards.
async fn handle(c: &mut Conn, cmd: Command, size: &mut (u32, u32, f32), updates: &Sender<Update>) -> bool {
    let result: anyhow::Result<bool> = async {
        match cmd {
            Command::Navigate(url) => {
                c.call("Page.navigate", json!({ "url": url })).await?;
                Ok(true)
            }
            Command::Back => {
                step_history(c, -1).await?;
                Ok(true)
            }
            Command::Forward => {
                step_history(c, 1).await?;
                Ok(true)
            }
            Command::Reload => {
                c.call("Page.reload", json!({})).await?;
                Ok(true)
            }
            Command::Resize { width, height, scale } => {
                if (width, height, scale) == *size {
                    return Ok(false);
                }
                *size = (width, height, scale);
                c.call(
                    "Emulation.setDeviceMetricsOverride",
                    json!({ "width": width, "height": height, "deviceScaleFactor": scale, "mobile": false }),
                )
                .await?;
                Ok(true)
            }
            Command::Mouse { kind, x, y, button, clicks, modifiers } => {
                c.send(
                    "Input.dispatchMouseEvent",
                    json!({ "type": kind, "x": x, "y": y, "button": button, "clickCount": clicks, "modifiers": modifiers }),
                );
                Ok(kind != "mouseMoved")
            }
            Command::Wheel { x, y, dx, dy, modifiers } => {
                c.send(
                    "Input.dispatchMouseEvent",
                    json!({ "type": "mouseWheel", "x": x, "y": y, "deltaX": dx, "deltaY": dy, "modifiers": modifiers }),
                );
                Ok(true)
            }
            Command::Key { down, key, code, vk, modifiers } => {
                let kind = if down { "keyDown" } else { "keyUp" };
                let mut p = json!({ "type": kind, "key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers });
                if down && key == "Enter" {
                    p["text"] = json!("\r");
                }
                c.send("Input.dispatchKeyEvent", p);
                Ok(down)
            }
            Command::Text(text) => {
                c.send("Input.insertText", json!({ "text": text }));
                Ok(true)
            }
        }
    }
    .await;
    match result {
        Ok(again) => again,
        Err(e) => {
            let _ = updates.send(Update::Error(e.to_string()));
            false
        }
    }
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

/// Screencast frames are activity driven, so after input we ask for one.
async fn capture(c: &mut Conn, size: (u32, u32, f32), updates: &Sender<Update>) {
    let clip = json!({ "x": 0, "y": 0, "width": size.0, "height": size.1, "scale": 1 });
    if let Ok(shot) = c.call("Page.captureScreenshot", json!({ "format": "jpeg", "quality": 85, "clip": clip })).await {
        if let Some(data) = shot["data"].as_str() {
            push_frame(data, updates);
        }
    }
}

fn push_frame(data: &str, updates: &Sender<Update>) {
    let Ok(bytes) = base64::engine::general_purpose::STANDARD.decode(data) else { return };
    let Ok(img) = image::load_from_memory(&bytes) else { return };
    let img = img.to_rgba8();
    let _ = updates.send(Update::Frame { width: img.width(), height: img.height(), rgba: img.into_raw() });
}
