//! The window's CDP relay: the one door agents use to reach the person's tabs.
//!
//! The engine gives every CDP connection its own pages and V8 isolates, so a
//! second connection would see none of the window's tabs. The window instead
//! listens on a loopback port and forwards each client's messages over its
//! own engine connection: request ids are renumbered so replies come back to
//! the right client, and events go to the client whose session they belong
//! to (browser-level events go to everyone).

use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::net::TcpListener;
use tokio::sync::{broadcast, mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

/// Relay request ids live far above the window's own.
static NEXT_ID: AtomicU64 = AtomicU64::new(1 << 48);

pub type Pending = Arc<Mutex<std::collections::HashMap<u64, oneshot::Sender<Value>>>>;

/// An agent's `Redrob.login`: answered by the window, which alone holds the
/// vault, with a username and an outcome, never a password.
pub struct LoginRequest {
    pub target_id: String,
    pub username: Option<String>,
    pub reply: oneshot::Sender<Value>,
}

/// What the windows show of a tab, by CDP target id: which window (1 is the
/// first) and whether an agent opened it. `Target.getTargets` replies carry
/// it as `redrobWindow` and `redrobAgent`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TabPlace {
    pub window: u32,
    pub agent: bool,
}

pub type Places = Arc<Mutex<std::collections::HashMap<String, TabPlace>>>;

/// How relay requests reach the window's UI thread.
#[derive(Clone)]
pub struct Window {
    pub login: std::sync::mpsc::Sender<LoginRequest>,
    /// `Redrob.openWindow`: a second launch of the browser asks this process
    /// for a window (instance.rs). The URL, or None for a new tab page.
    pub open_window: std::sync::mpsc::Sender<Option<String>>,
    pub places: Places,
    pub wake: Arc<dyn Fn() + Send + Sync>,
}

/// Bind on loopback and serve clients. Returns the ws:// address.
// tungstenite fixes the handshake callback's error type.
#[allow(clippy::result_large_err)]
pub async fn start(
    out: mpsc::UnboundedSender<String>,
    pending: Pending,
    events: broadcast::Sender<Value>,
    window: Window,
) -> anyhow::Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    tokio::spawn(async move {
        while let Ok((tcp, peer)) = listener.accept().await {
            if !peer.ip().is_loopback() {
                continue;
            }
            let out = out.clone();
            let pending = pending.clone();
            let events = events.subscribe();
            let window = window.clone();
            tokio::spawn(async move {
                let mut path = String::new();
                let callback = |req: &tokio_tungstenite::tungstenite::handshake::server::Request,
                                resp: tokio_tungstenite::tungstenite::handshake::server::Response| {
                    path = req.uri().path().to_string();
                    Ok(resp)
                };
                if let Ok(ws) = tokio_tungstenite::accept_hdr_async(tcp, callback).await {
                    // /devtools/page/<targetId>: a client that speaks to one tab
                    // without sessions, as the DevTools front end does.
                    let page = path.strip_prefix("/devtools/page/").map(str::to_string);
                    serve(ws, out, pending, events, page, window).await;
                }
            });
        }
    });
    Ok(format!("ws://{addr}/devtools/browser"))
}

async fn serve(
    ws: tokio_tungstenite::WebSocketStream<tokio::net::TcpStream>,
    out: mpsc::UnboundedSender<String>,
    pending: Pending,
    mut events: broadcast::Receiver<Value>,
    page: Option<String>,
    window: Window,
) {
    let (mut sink, mut stream) = ws.split();
    let (reply_tx, mut reply_rx) = mpsc::unbounded_channel::<String>();
    let sessions: Arc<Mutex<HashSet<String>>> = Default::default();

    // Page mode: attach once and speak for that session on the client's behalf.
    let mut page_session: Option<String> = None;
    if let Some(target) = &page {
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = oneshot::channel();
        pending.lock().unwrap().insert(id, tx);
        let msg = json!({ "id": id, "method": "Target.attachToTarget", "params": { "targetId": target, "flatten": true } });
        if out.send(msg.to_string()).is_err() {
            return;
        }
        let Ok(reply) = rx.await else { return };
        let Some(s) = reply["result"]["sessionId"].as_str() else {
            return;
        };
        sessions.lock().unwrap().insert(s.to_string());
        page_session = Some(s.to_string());
    }
    let page_mode = page_session.is_some();

    let writer = tokio::spawn(async move {
        while let Some(text) = reply_rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });

    let ev_tx = reply_tx.clone();
    let ev_sessions = sessions.clone();
    let forward = tokio::spawn(async move {
        loop {
            match events.recv().await {
                Ok(mut ev) => {
                    let mine = match ev.get("sessionId").and_then(Value::as_str) {
                        Some(s) => ev_sessions.lock().unwrap().contains(s),
                        // A one-tab client has no use for browser-wide events.
                        None => !page_mode,
                    };
                    if page_mode {
                        if let Some(o) = ev.as_object_mut() {
                            o.remove("sessionId");
                        }
                    }
                    if mine && ev_tx.send(ev.to_string()).is_err() {
                        break;
                    }
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(_) => break,
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let Message::Text(text) = msg else { continue };
        let Ok(mut req) = serde_json::from_str::<Value>(text.as_str()) else {
            continue;
        };
        let original = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req["method"].as_str().unwrap_or_default().to_string();
        if method == "Redrob.login" {
            // Never forwarded to the engine: the window signs in and reports back.
            let target_id = req["params"]["targetId"]
                .as_str()
                .map(str::to_string)
                .or_else(|| page.clone())
                .unwrap_or_default();
            let username = req["params"]["username"].as_str().map(str::to_string);
            let (tx, rx) = oneshot::channel();
            let sent = window
                .login
                .send(LoginRequest {
                    target_id,
                    username,
                    reply: tx,
                })
                .is_ok();
            (window.wake)();
            let reply_tx = reply_tx.clone();
            let original = req.get("id").cloned().unwrap_or(Value::Null);
            tokio::spawn(async move {
                let result = if sent {
                    rx.await.unwrap_or_else(|_| json!({ "outcome": "failed" }))
                } else {
                    json!({ "outcome": "failed" })
                };
                let _ = reply_tx.send(json!({ "id": original, "result": result }).to_string());
            });
            continue;
        }
        if method == "Redrob.openWindow" {
            let url = req["params"]["url"].as_str().map(str::to_string);
            let ok = window.open_window.send(url).is_ok();
            (window.wake)();
            let reply = if ok {
                json!({ "id": original, "result": {} })
            } else {
                json!({ "id": original, "error": { "code": -32000, "message": "the browser is closing" } })
            };
            let _ = reply_tx.send(reply.to_string());
            continue;
        }
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        req["id"] = json!(id);
        if let (Some(s), None) = (&page_session, req.get("sessionId")) {
            req["sessionId"] = json!(s);
        }
        let (tx, rx) = oneshot::channel();
        pending.lock().unwrap().insert(id, tx);
        if out.send(req.to_string()).is_err() {
            break;
        }
        let reply_tx = reply_tx.clone();
        let sessions = sessions.clone();
        let places = window.places.clone();
        tokio::spawn(async move {
            let Ok(mut reply) = rx.await else { return };
            if method == "Target.getTargets" {
                mark_places(&mut reply, &places);
            }
            if method == "Target.attachToTarget" {
                if let Some(s) = reply["result"]["sessionId"].as_str() {
                    sessions.lock().unwrap().insert(s.to_string());
                }
            }
            reply["id"] = original;
            if page_mode {
                if let Some(o) = reply.as_object_mut() {
                    o.remove("sessionId");
                }
            }
            let _ = reply_tx.send(reply.to_string());
        });
    }
    forward.abort();
    writer.abort();
}

/// Tell the client which window each tab is in and which tabs are agent tabs.
fn mark_places(reply: &mut Value, places: &Places) {
    let places = places.lock().unwrap();
    let Some(infos) = reply["result"]["targetInfos"].as_array_mut() else {
        return;
    };
    for info in infos {
        let place = info["targetId"].as_str().and_then(|id| places.get(id));
        if let (Some(place), Some(o)) = (place, info.as_object_mut()) {
            o.insert("redrobWindow".into(), json!(place.window));
            o.insert("redrobAgent".into(), json!(place.agent));
        }
    }
}
