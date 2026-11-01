//! The window's CDP relay: the one door agents use to reach the person's tabs.
//!
//! Window tabs are Chromium (CEF), whose remote debugging endpoint already
//! lets many clients share the same pages. The relay listens on its own
//! loopback port and gives each client its own connection to that endpoint,
//! passing standard CDP through unchanged. It answers what only the window
//! can: `Redrob.login`, `Redrob.openWindow`, and `Target.createTarget` (an
//! agent tab is a window tab, opened by the window), and it adds which window
//! shows a tab to `Target.getTargets` replies.
//!
//! Security: only loopback peers, and no WebSocket handshake that carries an
//! `Origin` header or a non-loopback `Host` (a web page, or a DNS-rebound
//! name, must never reach the tabs). The relay address is written owner-only
//! to the profile folder (cdp.rs).

use std::collections::HashSet;
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
    /// `Target.createTarget` from an agent: the window opens an agent tab at
    /// this URL; the relay answers with the new tab's target id. None passes
    /// the method through to the DevTools endpoint.
    pub open_tab: Option<std::sync::mpsc::Sender<String>>,
    pub places: Places,
    pub wake: Arc<dyn Fn() + Send + Sync>,
}

/// Bind on loopback and serve clients against the Chromium DevTools endpoint
/// on `127.0.0.1:devtools_port`. Returns the relay's ws:// address.
pub async fn start(devtools_port: u16, window: Window) -> anyhow::Result<String> {
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    let addr = listener.local_addr()?;
    tokio::spawn(async move {
        while let Ok((tcp, peer)) = listener.accept().await {
            if !peer.ip().is_loopback() {
                continue;
            }
            let window = window.clone();
            tokio::spawn(async move {
                let mut path = String::new();
                let callback = |req: &Request, resp: Response| {
                    path = req.uri().path().to_string();
                    check_handshake(req).map(|()| resp)
                };
                let Ok(ws) = tokio_tungstenite::accept_hdr_async(tcp, callback).await else {
                    return;
                };
                // /devtools/page/<targetId>: a client that speaks to one tab
                // without sessions, as the DevTools front end does.
                let page = path.strip_prefix("/devtools/page/").map(str::to_string);
                if let Err(e) = serve(ws, devtools_port, page, window).await {
                    eprintln!("redrob-browser: relay client: {e}");
                }
            });
        }
    });
    Ok(format!("ws://{addr}/devtools/browser"))
}

/// Refuse what a web page or a DNS-rebound host name would send, as Chromium
/// does for its own endpoint.
#[allow(clippy::result_large_err)]
fn check_handshake(req: &Request) -> Result<(), ErrorResponse> {
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
    if h.contains_key("origin") || !loopback_host {
        let mut resp = ErrorResponse::new(Some("forbidden".into()));
        *resp.status_mut() = tokio_tungstenite::tungstenite::http::StatusCode::FORBIDDEN;
        return Err(resp);
    }
    Ok(())
}

/// The browser-level WebSocket address of the DevTools endpoint.
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
    let mut raw = Vec::new();
    tokio::time::timeout(Duration::from_secs(10), s.read_to_end(&mut raw)).await??;
    let raw = String::from_utf8_lossy(&raw);
    let body = raw.split_once("\r\n\r\n").map(|(_, b)| b).unwrap_or("");
    Ok(serde_json::from_str(body.trim())?)
}

type Upstream =
    tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>;

async fn connect(url: &str) -> anyhow::Result<Upstream> {
    let (ws, _) = tokio::time::timeout(
        Duration::from_secs(10),
        tokio_tungstenite::connect_async(url),
    )
    .await??;
    Ok(ws)
}

async fn serve(
    ws: tokio_tungstenite::WebSocketStream<TcpStream>,
    port: u16,
    page: Option<String>,
    window: Window,
) -> anyhow::Result<()> {
    let url = match &page {
        Some(id) => format!("ws://127.0.0.1:{port}/devtools/page/{id}"),
        None => browser_url(port).await?,
    };
    let upstream = connect(&url).await?;
    let (mut up_sink, mut up_stream) = upstream.split();
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

    // Replies to these (request id, session) get the window's marks.
    let marks: Arc<Mutex<HashSet<(u64, Option<String>)>>> = Default::default();
    let reader_marks = marks.clone();
    let places = window.places.clone();
    let reader_tx = to_client.clone();
    let reader = tokio::spawn(async move {
        while let Some(Ok(m)) = up_stream.next().await {
            let m = match m {
                Message::Text(t) => {
                    let marked =
                        serde_json::from_str::<Value>(t.as_str())
                            .ok()
                            .and_then(|mut v| {
                                let key = (
                                    v["id"].as_u64()?,
                                    v["sessionId"].as_str().map(str::to_string),
                                );
                                if !reader_marks.lock().unwrap().remove(&key) {
                                    return None;
                                }
                                mark_places(&mut v, &places);
                                Some(Message::Text(v.to_string().into()))
                            });
                    marked.unwrap_or(Message::Text(t))
                }
                Message::Binary(b) => Message::Binary(b),
                Message::Close(_) => break,
                _ => continue,
            };
            if reader_tx.send(m).is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = stream.next().await {
        let text = match msg {
            Message::Text(t) => t,
            Message::Binary(b) => {
                up_sink.send(Message::Binary(b)).await?;
                continue;
            }
            Message::Close(_) => break,
            _ => continue,
        };
        let Ok(req) = serde_json::from_str::<Value>(text.as_str()) else {
            up_sink.send(Message::Text(text)).await?;
            continue;
        };
        let original = req.get("id").cloned().unwrap_or(Value::Null);
        let method = req["method"].as_str().unwrap_or_default();
        let session = req["sessionId"].as_str().map(str::to_string);
        let reply = |result| answer(&original, &session, result);
        match method {
            "Redrob.login" => {
                // Never forwarded: the window signs in and reports back.
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
            }
            "Redrob.openWindow" => {
                let url = req["params"]["url"].as_str().map(str::to_string);
                let ok = window.open_window.send(url).is_ok();
                (window.wake)();
                let _ = to_client.send(reply(if ok {
                    Ok(json!({}))
                } else {
                    Err("the browser is closing".into())
                }));
            }
            m if m.starts_with("Redrob.") => {
                let _ = to_client.send(reply(Err(format!("'{m}' wasn't found"))));
            }
            "Target.createTarget" if window.open_tab.is_some() => {
                let url = req["params"]["url"]
                    .as_str()
                    .unwrap_or("about:blank")
                    .to_string();
                let open_tab = window.open_tab.clone().expect("checked");
                let wake = window.wake.clone();
                let to_client = to_client.clone();
                let (original, session) = (original.clone(), session.clone());
                tokio::spawn(async move {
                    let result = open_agent_tab(port, &url, &open_tab, &*wake)
                        .await
                        .map(|id| json!({ "targetId": id }))
                        .map_err(|e| e.to_string());
                    let _ = to_client.send(answer(&original, &session, result));
                });
            }
            _ => {
                if method == "Target.getTargets" {
                    if let Some(id) = original.as_u64() {
                        marks.lock().unwrap().insert((id, session));
                    }
                }
                up_sink.send(Message::Text(text)).await?;
            }
        }
    }
    reader.abort();
    drop(to_client);
    let _ = writer.await;
    let _ = up_sink.close().await;
    Ok(())
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

/// Ask the window for an agent tab and find its target: the page target that
/// was not there before.
async fn open_agent_tab(
    port: u16,
    url: &str,
    open_tab: &std::sync::mpsc::Sender<String>,
    wake: &(dyn Fn() + Send + Sync),
) -> anyhow::Result<String> {
    let mut c = connect(&browser_url(port).await?).await?;
    let before: HashSet<String> = pages(&mut c).await?.into_iter().map(|(id, _)| id).collect();
    open_tab
        .send(url.to_string())
        .map_err(|_| anyhow::anyhow!("the browser is closing"))?;
    wake();
    let deadline = tokio::time::Instant::now() + Duration::from_secs(15);
    while tokio::time::Instant::now() < deadline {
        let new: Vec<(String, String)> = pages(&mut c)
            .await?
            .into_iter()
            .filter(|(id, _)| !before.contains(id))
            .collect();
        if let Some((id, _)) = new.iter().find(|(_, u)| u == url).or_else(|| new.first()) {
            let _ = c.close(None).await;
            return Ok(id.clone());
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    anyhow::bail!("the window did not open the tab")
}

async fn pages(c: &mut Upstream) -> anyhow::Result<Vec<(String, String)>> {
    c.send(Message::Text(
        json!({ "id": 1, "method": "Target.getTargets" })
            .to_string()
            .into(),
    ))
    .await?;
    while let Some(m) = c.next().await {
        let Message::Text(t) = m? else { continue };
        let v: Value = serde_json::from_str(t.as_str())?;
        if v["id"] == 1 {
            return Ok(v["result"]["targetInfos"]
                .as_array()
                .into_iter()
                .flatten()
                .filter(|i| i["type"] == "page")
                .map(|i| {
                    (
                        i["targetId"].as_str().unwrap_or("").to_string(),
                        i["url"].as_str().unwrap_or("").to_string(),
                    )
                })
                .collect());
        }
    }
    anyhow::bail!("DevTools closed the connection")
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

/// Against a real Chromium DevTools endpoint, which speaks what CEF's does.
/// Skipped when no Chromium is found (`REDROB_TEST_CHROMIUM`, or Playwright's
/// download under ~/.cache/ms-playwright).
#[cfg(test)]
pub(crate) mod tests {
    use super::*;
    use std::path::PathBuf;
    use std::process::{Child, Command, Stdio};

    pub struct Chromium {
        child: Child,
        dir: PathBuf,
        pub port: u16,
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

    /// A headless Chromium with remote debugging on a free loopback port.
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
        let child = Command::new(bin)
            .args([
                "--headless=new",
                // This test host has no user namespaces; the pages are local data: URLs.
                "--no-sandbox",
                "--remote-debugging-port=0",
                "--no-first-run",
                "--no-default-browser-check",
            ])
            .arg(format!("--user-data-dir={}", dir.display()))
            .arg("about:blank")
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .ok()?;
        let mut c = Chromium {
            child,
            dir,
            port: 0,
        };
        for _ in 0..200 {
            if let Ok(t) = std::fs::read_to_string(c.dir.join("DevToolsActivePort")) {
                if let Some(p) = t.lines().next().and_then(|l| l.parse().ok()) {
                    c.port = p;
                    return Some(c);
                }
            }
            std::thread::sleep(Duration::from_millis(50));
        }
        panic!("Chromium did not open its DevTools port");
    }

    struct Client {
        ws: Upstream,
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
        open_tab: std::sync::mpsc::Receiver<String>,
    }

    fn fake() -> Fake {
        let (login, login_rx) = std::sync::mpsc::channel();
        let (open_window, ow_rx) = std::sync::mpsc::channel();
        let (open_tab, ot_rx) = std::sync::mpsc::channel();
        Fake {
            window: Window {
                login,
                open_window,
                open_tab: Some(open_tab),
                places: Default::default(),
                wake: Arc::new(|| {}),
            },
            login: login_rx,
            open_window: ow_rx,
            open_tab: ot_rx,
        }
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn relay_drives_chromium_tabs() {
        let Some(chrome) = chromium() else { return };
        let f = fake();
        let places = f.window.places.clone();
        let relay = start(chrome.port, f.window).await.unwrap();
        let mut c = Client {
            ws: connect(&relay).await.unwrap(),
            next: 0,
        };

        // The window answers createTarget: here a thread opens the tab on
        // Chromium directly, as the CEF window would, and marks it.
        let port = chrome.port;
        let opener = std::thread::spawn(move || {
            let url = f.open_tab.recv().unwrap();
            let rt = tokio::runtime::Runtime::new().unwrap();
            rt.block_on(async {
                let mut w = Client {
                    ws: connect(&browser_url(port).await.unwrap()).await.unwrap(),
                    next: 0,
                };
                let r = w
                    .call(None, "Target.createTarget", json!({ "url": url }))
                    .await;
                r["result"]["targetId"].as_str().unwrap().to_string()
            })
        });
        let page = "data:text/html,<title>t</title><input id=q><button onclick=\"document.title='clicked'\">Go</button>";
        let r = c
            .call(None, "Target.createTarget", json!({ "url": page }))
            .await;
        let id = r["result"]["targetId"].as_str().unwrap().to_string();
        assert_eq!(opener.join().unwrap(), id, "relay found the window's tab");
        places.lock().unwrap().insert(
            id.clone(),
            TabPlace {
                window: 1,
                agent: true,
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

        // Everything else is Chromium's own CDP.
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
        let r = c
            .call(None, "Redrob.login", json!({ "targetId": id }))
            .await;
        assert_eq!(r["result"]["outcome"], "no-login");
        assert_eq!(login.join().unwrap(), id);
        let r = c.call(None, "Redrob.sceneAttach", json!({})).await;
        assert!(r["error"].is_object());

        // One-tab clients (DevTools front end style).
        let mut p = Client {
            ws: connect(&format!("{}/page/{id}", relay.trim_end_matches("/browser")))
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

        let r = c
            .call(None, "Target.closeTarget", json!({ "targetId": id }))
            .await;
        assert_eq!(r["result"]["success"], true);
    }

    #[tokio::test(flavor = "multi_thread")]
    async fn relay_refuses_web_pages() {
        let Some(chrome) = chromium() else { return };
        let relay = start(chrome.port, fake().window).await.unwrap();
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
        assert!(connect(&relay).await.is_ok());
    }
}
