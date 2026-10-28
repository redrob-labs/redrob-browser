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

/// Bind on loopback and serve clients. Returns the ws:// address.
pub async fn start(out: mpsc::UnboundedSender<String>, pending: Pending, events: broadcast::Sender<Value>) -> anyhow::Result<String> {
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
            tokio::spawn(async move {
                if let Ok(ws) = tokio_tungstenite::accept_async(tcp).await {
                    serve(ws, out, pending, events).await;
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
) {
    let (mut sink, mut stream) = ws.split();
    let (reply_tx, mut reply_rx) = mpsc::unbounded_channel::<String>();
    let sessions: Arc<Mutex<HashSet<String>>> = Default::default();

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
                Ok(ev) => {
                    let mine = match ev.get("sessionId").and_then(Value::as_str) {
                        Some(s) => ev_sessions.lock().unwrap().contains(s),
                        None => true,
                    };
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
        let Ok(mut req) = serde_json::from_str::<Value>(text.as_str()) else { continue };
        let original = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req["method"].as_str().unwrap_or_default().to_string();
        let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
        req["id"] = json!(id);
        let (tx, rx) = oneshot::channel();
        pending.lock().unwrap().insert(id, tx);
        if out.send(req.to_string()).is_err() {
            break;
        }
        let reply_tx = reply_tx.clone();
        let sessions = sessions.clone();
        tokio::spawn(async move {
            let Ok(mut reply) = rx.await else { return };
            if method == "Target.attachToTarget" {
                if let Some(s) = reply["result"]["sessionId"].as_str() {
                    sessions.lock().unwrap().insert(s.to_string());
                }
            }
            reply["id"] = original;
            let _ = reply_tx.send(reply.to_string());
        });
    }
    forward.abort();
    writer.abort();
}
