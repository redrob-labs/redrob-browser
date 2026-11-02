//! The window's CDP relay: the one door agents use to reach the person's tabs.
//!
//! Window tabs are Chromium (CEF). The relay holds the only connection to
//! Chromium's DevTools protocol (the `--remote-debugging-pipe` pair on
//! Linux and macOS, cef/mod.rs) and gives each client its own browser
//! session on it (`Target.attachToBrowserTarget`), so clients see standard
//! CDP and never each other's sessions. It answers what only the window
//! can: `Redrob.login`, `Redrob.openWindow`, and `Target.createTarget`,
//! `Target.activateTarget` and `Target.closeTarget` for window tabs (an
//! agent tab is a window tab, opened by the window), and it adds which
//! window shows a tab to `Target.getTargets` replies.
//!
//! Security: only loopback peers, the secret path written owner-only to the
//! profile folder (cdp.rs), and no WebSocket handshake that carries an
//! `Origin` header or a non-loopback `Host` (a web page, or a DNS-rebound
//! name, must never reach the tabs).

use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::handshake::server::{ErrorResponse, Request, Response};
use tokio_tungstenite::tungstenite::Message;

/// An agent's `Redrob.login`: answered by the window, which alone holds the
/// vault, with a username and an outcome, never a password.
pub struct LoginRequest {
    pub target_id: String,
    pub username: Option<String>,
    pub reply: oneshot::Sender<Value>,
}

/// What an agent asks of the window's tabs, by CDP target id.
pub enum TabRequest {
    /// Open an agent tab; the reply is its target id once Chromium has one.
    Open {
        url: String,
        /// Leave the person's current tab in front.
        background: bool,
        /// In a new window.
        new_window: bool,
        reply: oneshot::Sender<Result<String, String>>,
    },
    /// Bring a tab to the front of its window. False: not a window tab.
    Activate {
        target: String,
        reply: oneshot::Sender<bool>,
    },
    /// Close a tab as the person would. False: not a window tab.
    Close {
        target: String,
        reply: oneshot::Sender<bool>,
    },
}

/// What the windows show of a tab, by CDP target id: which window (1 is the
/// first), whether an agent opened it and whether it is its window's front
/// tab. `Target.getTargets` replies carry it as `redrobWindow`,
/// `redrobAgent` and `redrobActive`.
#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub struct TabPlace {
    pub window: u32,
    pub agent: bool,
    pub active: bool,
}

pub type Places = Arc<Mutex<HashMap<String, TabPlace>>>;

/// How relay requests reach the window's UI thread.
#[derive(Clone)]
pub struct Window {
    pub login: std::sync::mpsc::Sender<LoginRequest>,
    /// `Redrob.openWindow`: a second launch of the browser asks this process
    /// for a window (instance.rs). The URL, or None for a new tab page.
    pub open_window: std::sync::mpsc::Sender<Option<String>>,
    /// Agents' tab requests; None passes `Target.createTarget`,
    /// `activateTarget` and `closeTarget` through to Chromium.
    pub tabs: Option<std::sync::mpsc::Sender<TabRequest>>,
    pub places: Places,
    pub wake: Arc<dyn Fn() + Send + Sync>,
}

/// Where Chromium's DevTools protocol is.
pub enum Upstream {
    /// The pipe pair: commands in, replies out, NUL after each message.
    Pipe {
        commands: std::fs::File,
        replies: std::fs::File,
    },
    /// A DevTools server on `127.0.0.1:<port>`.
    Port(u16),
}

impl From<crate::cef::DevTools> for Upstream {
    fn from(d: crate::cef::DevTools) -> Self {
        match d {
            crate::cef::DevTools::Pipe { commands, replies } => {
                Upstream::Pipe { commands, replies }
            }
            crate::cef::DevTools::Port(p) => Upstream::Port(p),
        }
    }
}

/// The relay's connection to Chromium, for the window's own calls that
/// only a DevTools client may make ([`trigger_action`]).
static WINDOW_HUB: std::sync::OnceLock<(Arc<Hub>, tokio::runtime::Handle)> =
    std::sync::OnceLock::new();

/// Have Chrome run extension `id`'s toolbar action on the page in Chrome
/// window `window` (each of the window's pages is a Chrome window with one
/// tab), as a click on Chrome's own toolbar icon does: the extension gets
/// `activeTab` (cef/handlers/extensions.rs). `Extensions.triggerAction`
/// answers DevTools clients only (CEF's own sessions are told "Method not
/// allowed"), and names the page by its "tab" target.
pub fn trigger_action(window: i64, id: String) {
    let Some((hub, rt)) = WINDOW_HUB.get() else {
        eprintln!("redrob-browser: extension action: no DevTools connection");
        return;
    };
    let hub = hub.clone();
    rt.spawn(async move {
        if let Err(e) = trigger(&hub, window, &id).await {
            eprintln!("redrob-browser: extension action: {e}");
        }
    });
}

async fn trigger(hub: &Hub, window: i64, id: &str) -> anyhow::Result<()> {
    let tabs = hub
        .call(
            None,
            "Target.getTargets",
            json!({ "filter": [{ "type": "tab" }] }),
        )
        .await?;
    let ids = tabs["targetInfos"]
        .as_array()
        .map(|all| {
            all.iter()
                .filter_map(|t| t["targetId"].as_str().map(str::to_string))
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();
    for tab in ids {
        let w = hub
            .call(
                None,
                "Browser.getWindowForTarget",
                json!({ "targetId": tab }),
            )
            .await;
        if w.ok().and_then(|w| w["windowId"].as_i64()) == Some(window) {
            hub.call(
                None,
                "Extensions.triggerAction",
                json!({ "id": id, "targetId": tab }),
            )
            .await?;
            return Ok(());
        }
    }
    anyhow::bail!("no tab in Chrome window {window}")
}

/// Bind on loopback and serve clients against Chromium. Returns the relay's
/// ws:// address, which carries its secret.
// tungstenite fixes the handshake callback's error type.
#[allow(clippy::result_large_err)]
pub async fn start(upstream: Upstream, window: Window) -> anyhow::Result<String> {
    let pipe = matches!(upstream, Upstream::Pipe { .. });
    let hub = Hub::connect(upstream).await?;
    let _ = WINDOW_HUB.set((hub.clone(), tokio::runtime::Handle::current()));
    // A pipe Chromium did not take stays silent: find out now. Silence
    // while Chromium's loop is not running (a window that cannot run its
    // passes) says nothing about the pipe.
    if pipe {
        let before = crate::cef::pumps();
        if let Err(e) = hub.call(None, "Browser.getVersion", json!({})).await {
            if crate::cef::pumps() - before >= 10 {
                crate::cef::pipe_failed(&e.to_string());
                anyhow::bail!("Chromium's DevTools pipe did not answer: {e}");
            }
            eprintln!("redrob-browser: DevTools pipe check skipped: Chromium's loop did not run");
        }
    }
    listen(hub, window).await
}

#[allow(clippy::result_large_err)]
async fn listen(hub: Arc<Hub>, window: Window) -> anyhow::Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    let mut secret = [0u8; 16];
    getrandom::fill(&mut secret).map_err(|e| anyhow::anyhow!("random: {e}"))?;
    let token: String = secret.iter().map(|b| format!("{b:02x}")).collect();
    let token: Arc<str> = token.into();
    let url = format!("ws://{addr}/devtools/browser/{token}");
    tokio::spawn(async move {
        while let Ok((tcp, peer)) = listener.accept().await {
            if !peer.ip().is_loopback() {
                continue;
            }
            let (window, hub, token) = (window.clone(), hub.clone(), token.clone());
            tokio::spawn(async move {
                let mut page = None;
                let callback = |req: &Request, resp: Response| {
                    page = check_handshake(req, &token)?;
                    Ok(resp)
                };
                let Ok(ws) = tokio_tungstenite::accept_hdr_async(tcp, callback).await else {
                    return;
                };
                if let Err(e) = serve(ws, hub, page.flatten(), window).await {
                    eprintln!("redrob-browser: relay client: {e}");
                }
            });
        }
    });
    Ok(url)
}

/// Refuse what a web page or a DNS-rebound host name would send, and every
/// client that does not know the secret. Ok(Some(target)): a one-tab
/// client (`/devtools/page/<targetId>?token=<secret>`, as the DevTools
/// front end connects); Ok(None): the browser address.
#[allow(clippy::result_large_err)]
fn check_handshake(req: &Request, token: &str) -> Result<Option<Option<String>>, ErrorResponse> {
    let h = req.headers();
    let host = h
        .get("host")
        .and_then(|v| v.to_str().ok())
        .unwrap_or_default();
    let name = match host.rsplit_once(':') {
        Some((n, port)) if port.chars().all(|c| c.is_ascii_digit()) => n,
        _ => host,
    };
    let loopback_host = matches!(name, "127.0.0.1" | "localhost" | "[::1]");
    let path = req.uri().path();
    let query_token = req
        .uri()
        .query()
        .unwrap_or_default()
        .split('&')
        .find_map(|kv| kv.strip_prefix("token="))
        .unwrap_or_default();
    let target = match path.strip_prefix("/devtools/") {
        Some(rest)
            if rest
                .strip_prefix("browser/")
                .is_some_and(|t| same(t, token)) =>
        {
            Some(None)
        }
        Some(rest) => rest
            .strip_prefix("page/")
            .filter(|id| !id.is_empty() && !id.contains('/') && same(query_token, token))
            .map(|id| Some(id.to_string())),
        None => None,
    };
    match target {
        Some(t) if loopback_host && !h.contains_key("origin") => Ok(Some(t)),
        _ => {
            let mut resp = ErrorResponse::new(Some("forbidden".into()));
            *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
            Err(resp)
        }
    }
}

/// Compare secrets in time that does not depend on where they differ.
fn same(a: &str, b: &str) -> bool {
    a.len() == b.len() && a.bytes().zip(b.bytes()).fold(0u8, |d, (x, y)| d | (x ^ y)) == 0
}

/// What Chromium sends one client.
enum ToClient {
    Msg(Value),
    /// Its session ended (the tab of a one-tab client closed).
    Closed,
}

struct Route {
    client: u64,
    tx: mpsc::UnboundedSender<ToClient>,
    /// The target the session is attached to, when known.
    target: Option<String>,
}

#[derive(Default)]
struct HubState {
    next_call: u64,
    next_client: u64,
    /// The relay's own calls on Chromium's root session, by id.
    calls: HashMap<u64, oneshot::Sender<Value>>,
    /// Every client session, flat: a client's browser (or page) session and
    /// the sessions it attached from there.
    sessions: HashMap<String, Route>,
}

/// The one connection to Chromium, shared by every client.
struct Hub {
    out: mpsc::UnboundedSender<String>,
    state: Mutex<HubState>,
}

impl Hub {
    async fn connect(upstream: Upstream) -> anyhow::Result<Arc<Hub>> {
        let (out, mut out_rx) = mpsc::unbounded_channel::<String>();
        let hub = Arc::new(Hub {
            out,
            state: Mutex::default(),
        });
        match upstream {
            Upstream::Pipe {
                mut commands,
                replies,
            } => {
                std::thread::Builder::new()
                    .name("devtools-write".into())
                    .spawn(move || {
                        use std::io::Write;
                        while let Some(m) = out_rx.blocking_recv() {
                            let mut b = m.into_bytes();
                            b.push(0);
                            if commands.write_all(&b).is_err() {
                                break;
                            }
                        }
                    })?;
                let reader = hub.clone();
                std::thread::Builder::new()
                    .name("devtools-read".into())
                    .spawn(move || {
                        use std::io::BufRead;
                        let mut r = std::io::BufReader::with_capacity(1 << 20, replies);
                        let mut buf = Vec::new();
                        loop {
                            buf.clear();
                            match r.read_until(0, &mut buf) {
                                Ok(0) | Err(_) => break,
                                Ok(_) => {}
                            }
                            if buf.last() == Some(&0) {
                                buf.pop();
                            }
                            if let Ok(v) = serde_json::from_slice::<Value>(&buf) {
                                reader.dispatch(v);
                            }
                        }
                        eprintln!("redrob-browser: Chromium closed the DevTools pipe");
                    })?;
            }
            Upstream::Port(port) => {
                let ws = connect(&browser_url(port).await?).await?;
                let (mut sink, mut stream) = ws.split();
                tokio::spawn(async move {
                    while let Some(m) = out_rx.recv().await {
                        if sink.send(Message::Text(m.into())).await.is_err() {
                            break;
                        }
                    }
                });
                let reader = hub.clone();
                tokio::spawn(async move {
                    while let Some(Ok(m)) = stream.next().await {
                        if let Message::Text(t) = m {
                            if let Ok(v) = serde_json::from_str::<Value>(t.as_str()) {
                                reader.dispatch(v);
                            }
                        }
                    }
                });
            }
        }
        Ok(hub)
    }

    fn state(&self) -> std::sync::MutexGuard<'_, HubState> {
        self.state.lock().unwrap_or_else(|e| e.into_inner())
    }

    /// Route one message from Chromium.
    fn dispatch(&self, v: Value) {
        let mut st = self.state();
        let method = v["method"].as_str().unwrap_or_default();
        let Some(session) = v["sessionId"].as_str() else {
            if let Some(id) = v["id"].as_u64() {
                if let Some(tx) = st.calls.remove(&id) {
                    let _ = tx.send(v);
                }
            } else if method == "Target.detachedFromTarget" {
                // A client's own session ended: its tab closed.
                if let Some(s) = v["params"]["sessionId"].as_str() {
                    if let Some(r) = st.sessions.remove(s) {
                        let _ = r.tx.send(ToClient::Closed);
                    }
                }
            }
            return;
        };
        let Some(route) = st.sessions.get(session) else {
            return;
        };
        let (client, tx) = (route.client, route.tx.clone());
        match method {
            "Target.attachedToTarget" => {
                if let Some(s) = v["params"]["sessionId"].as_str() {
                    let target = v["params"]["targetInfo"]["targetId"]
                        .as_str()
                        .map(str::to_string);
                    st.sessions.insert(
                        s.to_string(),
                        Route {
                            client,
                            tx: tx.clone(),
                            target,
                        },
                    );
                }
            }
            "Target.detachedFromTarget" => {
                if let Some(s) = v["params"]["sessionId"].as_str() {
                    st.sessions.remove(s);
                }
            }
            _ => {}
        }
        drop(st);
        let _ = tx.send(ToClient::Msg(v));
    }

    /// Call a method on Chromium's root session (or `session`).
    async fn call(
        &self,
        session: Option<&str>,
        method: &str,
        params: Value,
    ) -> anyhow::Result<Value> {
        let (tx, rx) = oneshot::channel();
        let id = {
            let mut st = self.state();
            st.next_call += 1;
            let id = st.next_call;
            st.calls.insert(id, tx);
            id
        };
        let mut m = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = session {
            m["sessionId"] = json!(s);
        }
        self.out
            .send(m.to_string())
            .map_err(|_| anyhow::anyhow!("Chromium's DevTools connection closed"))?;
        let v = tokio::time::timeout(Duration::from_secs(15), rx)
            .await
            .map_err(|_| anyhow::anyhow!("{method}: Chromium did not answer"))?
            .map_err(|_| anyhow::anyhow!("Chromium's DevTools connection closed"))?;
        if let Some(e) = v.get("error") {
            anyhow::bail!("{method}: {}", e["message"].as_str().unwrap_or("failed"));
        }
        Ok(v["result"].clone())
    }

    fn new_client(&self) -> u64 {
        let mut st = self.state();
        st.next_client += 1;
        st.next_client
    }

    fn owns(&self, client: u64, session: &str) -> bool {
        self.state()
            .sessions
            .get(session)
            .is_some_and(|r| r.client == client)
    }

    fn target_of(&self, session: &str) -> Option<String> {
        self.state().sessions.get(session)?.target.clone()
    }

    /// The client left: end its sessions.
    fn drop_client(&self, client: u64) -> Vec<String> {
        let mut st = self.state();
        let gone: Vec<String> = st
            .sessions
            .iter()
            .filter(|(_, r)| r.client == client)
            .map(|(s, _)| s.clone())
            .collect();
        for s in &gone {
            st.sessions.remove(s);
        }
        gone
    }
}

/// The browser-level WebSocket address of a DevTools server.
async fn browser_url(port: u16) -> anyhow::Result<String> {
    let v = http_get_json(port, "/json/version").await?;
    v["webSocketDebuggerUrl"]
        .as_str()
        .map(str::to_string)
        .ok_or_else(|| anyhow::anyhow!("DevTools on port {port} gave no browser address"))
}

async fn http_get_json(port: u16, path: &str) -> anyhow::Result<Value> {
    let mut s = TcpStream::connect(("127.0.0.1", port)).await?;
    s.write_all(
        format!("GET {path} HTTP/1.1\r\nHost: 127.0.0.1:{port}\r\nConnection: close\r\n\r\n")
            .as_bytes(),
    )
    .await?;
    // Chromium keeps the connection open: read up to Content-Length.
    let read = async {
        let mut raw = Vec::new();
        let mut buf = [0u8; 4096];
        loop {
            let n = s.read(&mut buf).await?;
            raw.extend_from_slice(&buf[..n]);
            let text = String::from_utf8_lossy(&raw);
            if let Some((head, body)) = text.split_once("\r\n\r\n") {
                let len = head
                    .lines()
                    .find_map(|l| {
                        let (k, v) = l.split_once(':')?;
                        k.eq_ignore_ascii_case("content-length")
                            .then(|| v.trim().parse::<usize>().ok())?
                    })
                    .unwrap_or(usize::MAX);
                if n == 0 || body.len() >= len {
                    return anyhow::Ok(body.to_string());
                }
            } else if n == 0 {
                anyhow::bail!("DevTools on port {port} closed the connection");
            }
        }
    };
    let body = tokio::time::timeout(Duration::from_secs(10), read).await??;
    Ok(serde_json::from_str(body.trim())?)
}

type Ws =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect(url: &str) -> anyhow::Result<Ws> {
    let (ws, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async(url),
    )
    .await??;
    Ok(ws)
}

async fn serve(
    ws: tokio_tungstenite::WebSocketStream<TcpStream>,
    hub: Arc<Hub>,
    page: Option<String>,
    window: Window,
) -> anyhow::Result<()> {
    let client = hub.new_client();
    let (tx, mut rx) = mpsc::unbounded_channel::<ToClient>();
    // The client's own session: the browser, or its one tab.
    let primary = match &page {
        None => {
            hub.call(None, "Target.attachToBrowserTarget", json!({}))
                .await?
        }
        Some(id) => {
            hub.call(
                None,
                "Target.attachToTarget",
                json!({ "targetId": id, "flatten": true }),
            )
            .await?
        }
    }["sessionId"]
        .as_str()
        .unwrap_or_default()
        .to_string();
    if primary.is_empty() {
        anyhow::bail!("Chromium gave no session");
    }
    hub.state().sessions.insert(
        primary.clone(),
        Route {
            client,
            tx: tx.clone(),
            target: page.clone(),
        },
    );

    let (mut sink, mut stream) = ws.split();
    let (to_client, mut to_client_rx) = mpsc::unbounded_channel::<Message>();
    let writer = tokio::spawn(async move {
        while let Some(m) = to_client_rx.recv().await {
            if sink.send(m).await.is_err() {
                break;
            }
        }
        let _ = sink.close().await;
    });

    // Replies to these (request id, client session) get the window's marks.
    let marks: Arc<Mutex<HashSet<(u64, Option<String>)>>> = Default::default();
    let reader_marks = marks.clone();
    let places = window.places.clone();
    let reader_tx = to_client.clone();
    let reader_primary = primary.clone();
    // The client's sessions that know of their page's open dialog.
    let told: Arc<Mutex<HashSet<String>>> = Default::default();
    let reader_told = told.clone();
    let reader = tokio::spawn(async move {
        while let Some(m) = rx.recv().await {
            let mut v = match m {
                ToClient::Msg(v) => v,
                ToClient::Closed => {
                    let _ = reader_tx.send(Message::Close(None));
                    break;
                }
            };
            if let Some(s) = v["sessionId"].as_str() {
                match v["method"].as_str() {
                    // Told already (dialog_opening): not twice.
                    Some("Page.javascriptDialogOpening")
                        if !reader_told.lock().unwrap().insert(s.to_string()) =>
                    {
                        continue;
                    }
                    Some("Page.javascriptDialogClosed") => {
                        reader_told.lock().unwrap().remove(s);
                    }
                    _ => {}
                }
            }
            if v["sessionId"] == reader_primary.as_str() {
                if let Some(o) = v.as_object_mut() {
                    o.remove("sessionId");
                }
            }
            if let Some(id) = v["id"].as_u64() {
                let key = (id, v["sessionId"].as_str().map(str::to_string));
                if reader_marks.lock().unwrap().remove(&key) {
                    mark_places(&mut v, &places);
                }
            }
            if reader_tx.send(Message::Text(v.to_string().into())).is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Close(_) => break,
            _ => continue,
        };
        let Ok(mut req) = serde_json::from_str::<Value>(text.as_str()) else {
            continue;
        };
        let original = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req["method"].as_str().unwrap_or_default().to_string();
        let session = req["sessionId"].as_str().map(str::to_string);
        let reply = |result| answer(&original, &session, result);
        if let Some(s) = &session {
            if !hub.owns(client, s) {
                let _ = to_client.send(reply(Err(format!("No session with given id: {s}"))));
                continue;
            }
        }
        let params = req["params"].clone();
        let tabs = window.tabs.clone();
        match method.as_str() {
            "Redrob.login" => {
                // Never forwarded: the window signs in and reports back.
                let target_id = params["targetId"]
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| session.as_deref().and_then(|s| hub.target_of(s)))
                    .or_else(|| page.clone())
                    .unwrap_or_default();
                let username = params["username"].as_str().map(str::to_string);
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
                let to_client = to_client.clone();
                let (original, session) = (original.clone(), session.clone());
                tokio::spawn(async move {
                    let result = if sent {
                        rx.await.unwrap_or_else(|_| json!({ "outcome": "failed" }))
                    } else {
                        json!({ "outcome": "failed" })
                    };
                    let _ = to_client.send(answer(&original, &session, Ok(result)));
                });
                continue;
            }
            "Redrob.openWindow" => {
                let url = params["url"].as_str().map(str::to_string);
                let ok = window.open_window.send(url).is_ok();
                (window.wake)();
                let _ = to_client.send(reply(if ok {
                    Ok(json!({}))
                } else {
                    Err("the browser is closing".into())
                }));
                continue;
            }
            "Redrob.chromeCommand" => {
                // A Chrome command (IDC_*, cef_command_ids.h) on the tab of
                // this session or of `targetId`, as its menu entry runs it.
                let target = params["targetId"]
                    .as_str()
                    .map(str::to_string)
                    .or_else(|| session.as_deref().and_then(|s| hub.target_of(s)))
                    .or_else(|| page.clone())
                    .unwrap_or_default();
                let command = params["command"].as_i64().unwrap_or(0) as i32;
                // `dry`: only whether Chrome has it enabled for the page.
                let dry = params["dry"].as_bool().unwrap_or(false);
                let (tx, rx) = oneshot::channel();
                let sent = command > 0
                    && crate::cef::browser_of(&target).is_some_and(|b| {
                        crate::cef::with_browser(b, move |browser| {
                            let _ = tx.send(if dry {
                                crate::cef::handlers::chrome::enabled(browser, command)
                            } else {
                                crate::cef::handlers::chrome::run(browser, command)
                            });
                        })
                    });
                let to_client = to_client.clone();
                let (original, session) = (original.clone(), session.clone());
                tokio::spawn(async move {
                    let result = match tokio::time::timeout(Duration::from_secs(5), rx).await {
                        _ if !sent => Err("no window tab for this target, or no command".into()),
                        Ok(Ok(enabled)) => Ok(json!({ "enabled": enabled })),
                        _ => Err("the window did not run the command".to_string()),
                    };
                    let _ = to_client.send(answer(&original, &session, result));
                });
                continue;
            }
            m if m.starts_with("Redrob.") => {
                let _ = to_client.send(reply(Err(format!("'{m}' wasn't found"))));
                continue;
            }
            "Target.createTarget" if tabs.is_some() => {
                let (tx, rx) = oneshot::channel();
                let sent = tabs
                    .expect("checked")
                    .send(TabRequest::Open {
                        url: params["url"].as_str().unwrap_or("about:blank").to_string(),
                        background: params["background"].as_bool().unwrap_or(false),
                        new_window: params["newWindow"].as_bool().unwrap_or(false),
                        reply: tx,
                    })
                    .is_ok();
                (window.wake)();
                let to_client = to_client.clone();
                let (original, session) = (original.clone(), session.clone());
                tokio::spawn(async move {
                    let result = match tokio::time::timeout(Duration::from_secs(15), rx).await {
                        _ if !sent => Err("the browser is closing".to_string()),
                        Ok(Ok(r)) => r.map(|id| json!({ "targetId": id })),
                        Ok(Err(_)) => Err("the window did not open the tab".to_string()),
                        Err(_) => Err("the window did not open the tab in 15 s".to_string()),
                    };
                    let _ = to_client.send(answer(&original, &session, result));
                });
                continue;
            }
            "Target.activateTarget" | "Target.closeTarget" if tabs.is_some() => {
                let target = params["targetId"].as_str().unwrap_or_default().to_string();
                let (tx, rx) = oneshot::channel();
                let r = if method == "Target.activateTarget" {
                    TabRequest::Activate {
                        target: target.clone(),
                        reply: tx,
                    }
                } else {
                    TabRequest::Close {
                        target: target.clone(),
                        reply: tx,
                    }
                };
                let sent = tabs.expect("checked").send(r).is_ok();
                (window.wake)();
                let mine = sent
                    && tokio::time::timeout(Duration::from_secs(5), rx)
                        .await
                        .is_ok_and(|r| r.unwrap_or(false));
                if mine {
                    let result = if method == "Target.closeTarget" {
                        json!({ "success": true })
                    } else {
                        json!({})
                    };
                    let _ = to_client.send(reply(Ok(result)));
                    continue;
                }
                // Not a window tab (a DevTools window, a worker): Chromium's.
            }
            "Target.getTargets" => {
                if let Some(id) = original.as_u64() {
                    marks.lock().unwrap().insert((id, session.clone()));
                }
            }
            "Page.handleJavaScriptDialog" => {
                // The dialog the window shows (every page dialog, since the
                // window answers them): answered as the person would, so
                // the window drops it too and every session that waits on
                // the page goes on, as in Chrome.
                let target = session
                    .as_deref()
                    .and_then(|s| hub.target_of(s))
                    .or_else(|| page.clone())
                    .unwrap_or_default();
                let answered = crate::cef::browser_of(&target).is_some_and(|b| {
                    crate::cef::handlers::jsdialog::answer_on(
                        b,
                        params["accept"].as_bool().unwrap_or(false),
                        params["promptText"].as_str(),
                    )
                });
                if answered {
                    let _ = to_client.send(reply(Ok(json!({}))));
                    continue;
                }
            }
            "Page.enable" => {
                // A session that turns Page on while its page shows a
                // dialog is told of it, as one that had it on before is.
                let key = session.clone().unwrap_or_else(|| primary.clone());
                let target = session
                    .as_deref()
                    .and_then(|s| hub.target_of(s))
                    .or_else(|| page.clone())
                    .unwrap_or_default();
                let open = crate::cef::browser_of(&target)
                    .and_then(crate::cef::handlers::jsdialog::open_on);
                if let Some(d) = open {
                    if told.lock().unwrap().insert(key) {
                        if session.is_none() {
                            req["sessionId"] = json!(primary);
                        }
                        if hub.out.send(req.to_string()).is_err() {
                            break;
                        }
                        let _ = to_client.send(dialog_opening(&target, &d, &session));
                        continue;
                    }
                }
            }
            _ => {}
        }
        if session.is_none() {
            req["sessionId"] = json!(primary);
        }
        if hub.out.send(req.to_string()).is_err() {
            break;
        }
    }
    reader.abort();
    drop(to_client);
    let _ = writer.await;
    // Child sessions end with the client's own.
    hub.drop_client(client);
    let _ = hub
        .call(
            None,
            "Target.detachFromTarget",
            json!({ "sessionId": primary }),
        )
        .await;
    Ok(())
}

/// `Page.javascriptDialogOpening` for a dialog the page already shows.
fn dialog_opening(
    target: &str,
    d: &crate::cef::handlers::jsdialog::Open,
    session: &Option<String>,
) -> Message {
    let mut m = json!({
        "method": "Page.javascriptDialogOpening",
        "params": {
            "url": d.url,
            // The main frame's id, which is the target's.
            "frameId": target,
            "message": d.message,
            "type": d.kind,
            "hasBrowserHandler": true,
            "defaultPrompt": d.default_prompt,
        },
    });
    if let Some(s) = session {
        m["sessionId"] = json!(s);
    }
    Message::Text(m.to_string().into())
}

/// A reply under the client's own request id (and session).
fn answer(id: &Value, session: &Option<String>, result: Result<Value, String>) -> Message {
    let mut r = match result {
        Ok(v) => json!({ "id": id, "result": v }),
        Err(e) => json!({ "id": id, "error": { "code": -32000, "message": e } }),
    };
    if let Some(s) = session {
        r["sessionId"] = json!(s);
    }
    Message::Text(r.to_string().into())
}

/// Tell the client which window each tab is in, which tabs are agent tabs
/// and which is in front.
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
            o.insert("redrobActive".into(), json!(place.active));
        }
    }
}

/// Against a real Chromium on a DevTools pipe, as the window's CEF is.
/// Skipped when no Chromium is found (`REDROB_TEST_CHROMIUM`, or Playwright's
/// download under ~/.cache/ms-playwright).
#[cfg(all(test, target_os = "linux"))]
pub(crate) mod tests {
    use super::*;
    use std::os::fd::{FromRawFd, IntoRawFd};
    use std::os::unix::process::CommandExt;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};

    pub struct Chromium {
        child: Child,
        dir: PathBuf,
        pub upstream: Option<Upstream>,
    }

    impl Drop for Chromium {
        fn drop(&mut self) {
            let _ = self.child.kill();
            let _ = self.child.wait();
            let _ = std::fs::remove_dir_all(&self.dir);
        }
    }

    fn binary() -> Option<PathBuf> {
        if let Some(p) = std::env::var_os("REDROB_TEST_CHROMIUM") {
            return Some(PathBuf::from(p));
        }
        let root = PathBuf::from(std::env::var_os("HOME")?).join(".cache/ms-playwright");
        let mut found: Vec<PathBuf> = std::fs::read_dir(root)
            .ok()?
            .flatten()
            .filter(|e| e.file_name().to_string_lossy().starts_with("chromium-"))
            .flat_map(|e| {
                ["chrome-linux64/chrome", "chrome-linux/chrome"].map(|b| e.path().join(b))
            })
            .filter(|p| p.is_file())
            .collect();
        found.sort();
        found.pop()
    }

    fn pipe() -> (std::fs::File, std::fs::File) {
        let mut fds = [0; 2];
        assert_eq!(unsafe { libc::pipe2(fds.as_mut_ptr(), libc::O_CLOEXEC) }, 0);
        unsafe {
            (
                std::fs::File::from_raw_fd(fds[0]),
                std::fs::File::from_raw_fd(fds[1]),
            )
        }
    }

    /// A headless Chromium speaking DevTools on a pipe, with no port.
    pub fn chromium() -> Option<Chromium> {
        let Some(bin) = binary() else {
            eprintln!("no Chromium binary: skipped");
            return None;
        };
        let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
            .join("../../target/relay-test")
            .join(format!(
                "{}-{:?}",
                std::process::id(),
                std::thread::current().id()
            ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).ok()?;
        let (cmd_r, commands) = pipe();
        let (replies, rep_w) = pipe();
        let (r, w) = (cmd_r.into_raw_fd(), rep_w.into_raw_fd());
        let mut cmd = Command::new(bin);
        cmd.args([
            "--headless=new",
            // This test host has no user namespaces; the pages are local data: URLs.
            "--no-sandbox",
            "--remote-debugging-pipe",
            "--no-first-run",
            "--no-default-browser-check",
        ])
        .arg(format!("--user-data-dir={}", dir.display()))
        .arg("about:blank")
        .stdout(Stdio::null())
        .stderr(Stdio::null());
        // SAFETY: only dup2 between fork and exec.
        unsafe {
            cmd.pre_exec(move || {
                if libc::dup2(r, 3) < 0 || libc::dup2(w, 4) < 0 {
                    return Err(std::io::Error::last_os_error());
                }
                Ok(())
            });
        }
        let child = cmd.spawn().ok()?;
        unsafe {
            libc::close(r);
            libc::close(w);
        }
        Some(Chromium {
            child,
            dir,
            upstream: Some(Upstream::Pipe { commands, replies }),
        })
    }

    struct Client {
        ws: Ws,
        next: u64,
    }

    impl Client {
        async fn call(&mut self, session: Option<&str>, method: &str, params: Value) -> Value {
            self.next += 1;
            let mut m = json!({ "id": self.next, "method": method, "params": params });
            if let Some(s) = session {
                m["sessionId"] = json!(s);
            }
            self.ws
                .send(Message::Text(m.to_string().into()))
                .await
                .unwrap();
            loop {
                let Message::Text(t) = self.ws.next().await.unwrap().unwrap() else {
                    continue;
                };
                let v: Value = serde_json::from_str(t.as_str()).unwrap();
                if v["id"] == self.next {
                    return v;
                }
            }
        }
    }

    struct Fake {
        window: Window,
        login: std::sync::mpsc::Receiver<LoginRequest>,
        open_window: std::sync::mpsc::Receiver<Option<String>>,
        tabs: std::sync::mpsc::Receiver<TabRequest>,
    }

    fn fake() -> Fake {
        let (login, login_rx) = std::sync::mpsc::channel();
        let (open_window, ow_rx) = std::sync::mpsc::channel();
        let (tabs, tabs_rx) = std::sync::mpsc::channel();
        Fake {
            window: Window {
                login,
                open_window,
                tabs: Some(tabs),
                places: Default::default(),
                wake: Arc::new(|| {}),
            },
            login: login_rx,
            open_window: ow_rx,
            tabs: tabs_rx,
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn relay_drives_chromium_tabs() {
        let Some(mut chrome) = chromium() else { return };
        let f = fake();
        let places = f.window.places.clone();
        let hub = Hub::connect(chrome.upstream.take().unwrap()).await.unwrap();
        let relay = listen(hub.clone(), f.window).await.unwrap();
        let mut c = Client {
            ws: connect(&relay).await.unwrap(),
            next: 0,
        };
        // The window opens its tab on Chromium itself, as the CEF window
        // does, and answers the relay with its id: here through a relay
        // that passes Target.createTarget through.
        let (login, _) = std::sync::mpsc::channel();
        let (open_window, _) = std::sync::mpsc::channel();
        let direct = listen(
            hub,
            Window {
                login,
                open_window,
                tabs: None,
                places: Default::default(),
                wake: Arc::new(|| {}),
            },
        )
        .await
        .unwrap();
        let mut w = Client {
            ws: connect(&direct).await.unwrap(),
            next: 0,
        };
        let page = "data:text/html,<title>t</title><input id=q><button onclick=\"document.title='clicked'\">Go</button>";
        let call = c.call(None, "Target.createTarget", json!({ "url": page }));
        let window_side = async {
            let req = tokio::task::spawn_blocking(move || (f.tabs.recv().unwrap(), f.tabs))
                .await
                .unwrap();
            let (TabRequest::Open { url, reply, .. }, tabs) = req else {
                panic!("not an open request")
            };
            let r = w
                .call(None, "Target.createTarget", json!({ "url": url }))
                .await;
            let id = r["result"]["targetId"].as_str().unwrap().to_string();
            reply.send(Ok(id.clone())).unwrap();
            (id, tabs)
        };
        let (r, (opened, tabs)) = tokio::join!(call, window_side);
        let id = r["result"]["targetId"].as_str().unwrap().to_string();
        assert_eq!(opened, id, "the relay answers with the window's tab");
        places.lock().unwrap().insert(
            id.clone(),
            TabPlace {
                window: 1,
                agent: true,
                active: false,
            },
        );

        let t = c.call(None, "Target.getTargets", json!({})).await;
        let info = t["result"]["targetInfos"]
            .as_array()
            .unwrap()
            .iter()
            .find(|i| i["targetId"] == id.as_str())
            .unwrap()
            .clone();
        assert_eq!(info["redrobWindow"], 1);
        assert_eq!(info["redrobAgent"], true);
        assert_eq!(info["redrobActive"], false);
        assert!(
            t.get("sessionId").is_none(),
            "the browser session stays hidden"
        );

        // Everything else is Chromium's own CDP, in sessions of this client.
        let a = c
            .call(
                None,
                "Target.attachToTarget",
                json!({ "targetId": id, "flatten": true }),
            )
            .await;
        let s = a["result"]["sessionId"].as_str().unwrap().to_string();
        let v = c
            .call(
                Some(&s),
                "Runtime.evaluate",
                json!({ "expression": "6*7", "returnByValue": true }),
            )
            .await;
        assert_eq!(v["result"]["result"]["value"], 42);
        assert_eq!(v["sessionId"], s.as_str());
        let shot = c
            .call(
                Some(&s),
                "Page.captureScreenshot",
                json!({ "format": "png" }),
            )
            .await;
        assert!(shot["result"]["data"]
            .as_str()
            .unwrap()
            .starts_with("iVBOR"));
        // Another client cannot use it.
        let v = w
            .call(
                Some(&s),
                "Runtime.evaluate",
                json!({ "expression": "1", "returnByValue": true }),
            )
            .await;
        assert!(v["error"].is_object(), "{v}");

        // Redrob.* stays in the relay.
        let r = c
            .call(
                None,
                "Redrob.openWindow",
                json!({ "url": "https://example.com/" }),
            )
            .await;
        assert_eq!(r["result"], json!({}));
        assert_eq!(
            f.open_window.recv().unwrap().as_deref(),
            Some("https://example.com/")
        );
        let login = std::thread::spawn(move || {
            let req = f.login.recv().unwrap();
            let target = req.target_id.clone();
            let _ = req.reply.send(json!({ "outcome": "no-login" }));
            target
        });
        let r = c.call(Some(&s), "Redrob.login", json!({})).await;
        assert_eq!(r["result"]["outcome"], "no-login");
        assert_eq!(login.join().unwrap(), id, "the session's tab");
        let r = c.call(None, "Redrob.sceneAttach", json!({})).await;
        assert!(r["error"].is_object());

        // One-tab clients (DevTools front end style) need the secret too.
        let base = relay.split("/devtools/").next().unwrap();
        let token = relay.rsplit('/').next().unwrap();
        assert!(connect(&format!("{base}/devtools/page/{id}"))
            .await
            .is_err());
        let mut p = Client {
            ws: connect(&format!("{base}/devtools/page/{id}?token={token}"))
                .await
                .unwrap(),
            next: 0,
        };
        let v = p
            .call(
                None,
                "Runtime.evaluate",
                json!({ "expression": "document.title", "returnByValue": true }),
            )
            .await;
        assert_eq!(v["result"]["result"]["value"], "t");

        // Activate and close go to the window; a tab it does not know goes
        // to Chromium.
        let window_side = tokio::task::spawn_blocking(move || {
            let TabRequest::Activate { target, reply } = tabs.recv().unwrap() else {
                panic!("not activate")
            };
            reply.send(true).unwrap();
            let TabRequest::Close { reply, .. } = tabs.recv().unwrap() else {
                panic!("not close")
            };
            reply.send(false).unwrap();
            target
        });
        let r = c
            .call(None, "Target.activateTarget", json!({ "targetId": id }))
            .await;
        assert_eq!(r["result"], json!({}));
        let r = c
            .call(None, "Target.closeTarget", json!({ "targetId": id }))
            .await;
        assert_eq!(r["result"]["success"], true);
        assert_eq!(window_side.await.unwrap(), id);
        // The one-tab client hears its tab is gone.
        let closed = tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                match p.ws.next().await {
                    None | Some(Err(_)) | Some(Ok(Message::Close(_))) => return,
                    _ => {}
                }
            }
        })
        .await;
        assert!(closed.is_ok());
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn relay_refuses_web_pages() {
        let Some(mut chrome) = chromium() else { return };
        let relay = start(chrome.upstream.take().unwrap(), fake().window)
            .await
            .unwrap();
        use tokio_tungstenite::tungstenite::client::IntoClientRequest;
        let mut req = relay.as_str().into_client_request().unwrap();
        req.headers_mut()
            .insert("origin", "https://evil.example".parse().unwrap());
        assert!(tokio_tungstenite::connect_async(req).await.is_err());
        let mut req = relay.as_str().into_client_request().unwrap();
        let port = relay.split(':').nth(2).unwrap().split('/').next().unwrap();
        req.headers_mut()
            .insert("host", format!("evil.example:{port}").parse().unwrap());
        assert!(tokio_tungstenite::connect_async(req).await.is_err());
        let guess = format!("{}0", relay.trim_end_matches(|c: char| c != '/'));
        assert!(connect(&guess).await.is_err(), "the secret is required");
        assert!(connect(&relay).await.is_ok());
    }
}
