//! `redrob-browser tab ...`: drive the tabs of the running browser window from
//! the command line, the way an agent does. See docs/AGENT.md.
//!
//! The window writes its engine's CDP address to
//! `<data>/redrob-browser/Default/engine/ws-endpoint` (owner-only). These
//! commands read it, or `REDROB_BROWSER_CDP` when set. Tabs opened here are
//! agent tabs: the window marks them so the person can tell them apart.

use std::path::PathBuf;
use std::time::Duration;

use base64::Engine as _;
use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

#[derive(clap::Subcommand)]
pub enum TabCmd {
    /// List open tabs: id, URL and title.
    List,
    /// Open a new agent tab and print its id.
    Open { url: String },
    /// Navigate a tab.
    Go { id: String, url: String },
    /// Print the page as an outline of elements with [ref=N] handles.
    Read { id: String },
    /// Click the element with this ref.
    Click { id: String, r#ref: i64 },
    /// Focus the element with this ref and type text into it.
    Type {
        id: String,
        r#ref: i64,
        text: String,
        /// Press Enter afterwards.
        #[arg(long)]
        submit: bool,
    },
    /// Press a key (Enter, Tab, Escape, ArrowDown, ...).
    Key { id: String, key: String },
    /// Scroll the page by this many CSS pixels (negative scrolls up).
    Scroll { id: String, dy: f64 },
    /// Save a PNG of the visible page.
    Shot { id: String, path: PathBuf },
    /// Print the page as Markdown.
    Markdown { id: String },
    /// Sign in with a login saved in the browser. The password is typed by
    /// the browser; this prints only the outcome and the username.
    Login {
        id: String,
        /// Which saved username, when the site has several.
        #[arg(long)]
        user: Option<String>,
    },
    /// Close a tab.
    Close { id: String },
}

pub async fn run(cmd: TabCmd) -> anyhow::Result<()> {
    let mut c = Cdp::connect(&endpoint()?).await?;
    match cmd {
        TabCmd::List => {
            let t = c.call(None, "Target.getTargets", json!({})).await?;
            for i in t["targetInfos"].as_array().into_iter().flatten().filter(|i| i["type"] == "page") {
                println!("{}\t{}\t{}", i["targetId"].as_str().unwrap_or(""), i["url"].as_str().unwrap_or(""), i["title"].as_str().unwrap_or(""));
            }
        }
        TabCmd::Open { url } => {
            let t = c.call(None, "Target.createTarget", json!({ "url": url })).await?;
            println!("{}", t["targetId"].as_str().unwrap_or(""));
        }
        TabCmd::Go { id, url } => {
            let s = c.attach(&id).await?;
            c.call(Some(&s), "Page.navigate", json!({ "url": url })).await?;
        }
        TabCmd::Read { id } => {
            let s = c.attach(&id).await?;
            let tree = c.call(Some(&s), "Accessibility.getFullAXTree", json!({})).await?;
            print!("{}", outline(&tree));
        }
        TabCmd::Click { id, r#ref } => {
            let s = c.attach(&id).await?;
            let (x, y) = c.center(&s, r#ref).await?;
            for kind in ["mouseMoved", "mousePressed", "mouseReleased"] {
                c.call(
                    Some(&s),
                    "Input.dispatchMouseEvent",
                    json!({ "type": kind, "x": x, "y": y, "button": "left", "clickCount": 1 }),
                )
                .await?;
            }
        }
        TabCmd::Type { id, r#ref, text, submit } => {
            let s = c.attach(&id).await?;
            c.call(Some(&s), "DOM.focus", json!({ "backendNodeId": r#ref })).await?;
            c.call(Some(&s), "Input.insertText", json!({ "text": text })).await?;
            if submit {
                press(&mut c, &s, "Enter").await?;
            }
        }
        TabCmd::Key { id, key } => {
            let s = c.attach(&id).await?;
            press(&mut c, &s, &key).await?;
        }
        TabCmd::Scroll { id, dy } => {
            let s = c.attach(&id).await?;
            c.call(
                Some(&s),
                "Input.dispatchMouseEvent",
                json!({ "type": "mouseWheel", "x": 100, "y": 100, "deltaX": 0, "deltaY": dy }),
            )
            .await?;
        }
        TabCmd::Shot { id, path } => {
            let s = c.attach(&id).await?;
            let shot = c.call(Some(&s), "Page.captureScreenshot", json!({ "format": "png" })).await?;
            let bytes = base64::engine::general_purpose::STANDARD.decode(shot["data"].as_str().unwrap_or(""))?;
            std::fs::write(&path, bytes)?;
            println!("{}", path.display());
        }
        TabCmd::Markdown { id } => {
            let s = c.attach(&id).await?;
            let expr = obscura_browser::HTML_TO_MARKDOWN_JS;
            let v = c.call(Some(&s), "Runtime.evaluate", json!({ "expression": expr, "returnByValue": true })).await?;
            println!("{}", v["result"]["value"].as_str().unwrap_or(""));
        }
        TabCmd::Login { id, user } => {
            let mut p = json!({ "targetId": id });
            if let Some(u) = user {
                p["username"] = json!(u);
            }
            let r = c.call(None, "Redrob.login", p).await?;
            println!("{}", serde_json::to_string(&r)?);
        }
        TabCmd::Close { id } => {
            c.call(None, "Target.closeTarget", json!({ "targetId": id })).await?;
        }
    }
    Ok(())
}

/// The CDP address of the running window's engine.
fn endpoint() -> anyhow::Result<String> {
    if let Ok(v) = std::env::var("REDROB_BROWSER_CDP") {
        return Ok(v);
    }
    let file = data_dir().join("redrob-browser").join("Default").join("engine").join("ws-endpoint");
    let text = std::fs::read_to_string(&file)
        .map_err(|_| anyhow::anyhow!("Redrob Browser is not running (no {}). Start it with `redrob-browser`.", file.display()))?;
    Ok(text.trim().to_string())
}

fn data_dir() -> PathBuf {
    let home = std::env::var_os("HOME").map(PathBuf::from).unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA").or_else(|| std::env::var_os("APPDATA")).map(PathBuf::from).unwrap_or(home)
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| home.join(".local").join("share"))
    }
}

async fn press(c: &mut Cdp, s: &str, key: &str) -> anyhow::Result<()> {
    let vk = match key {
        "Enter" => 13,
        "Tab" => 9,
        "Escape" => 27,
        "Backspace" => 8,
        "ArrowLeft" => 37,
        "ArrowUp" => 38,
        "ArrowRight" => 39,
        "ArrowDown" => 40,
        _ => 0,
    };
    let mut down = json!({ "type": "keyDown", "key": key, "code": key, "windowsVirtualKeyCode": vk });
    if key == "Enter" {
        down["text"] = json!("\r");
    }
    c.call(Some(s), "Input.dispatchKeyEvent", down).await?;
    c.call(Some(s), "Input.dispatchKeyEvent", json!({ "type": "keyUp", "key": key, "code": key, "windowsVirtualKeyCode": vk }))
        .await?;
    Ok(())
}

/// Accessibility tree as an indented outline. Each interesting node carries
/// its backend DOM node id as `[ref=N]`, which click and type accept.
fn outline(tree: &Value) -> String {
    let nodes = tree["nodes"].as_array().cloned().unwrap_or_default();
    let by_id: std::collections::HashMap<&str, &Value> =
        nodes.iter().filter_map(|n| n["nodeId"].as_str().map(|id| (id, n))).collect();
    let mut out = String::new();
    let Some(root) = nodes.first() else { return out };
    walk(root, &by_id, 0, &mut out);
    out
}

fn walk(n: &Value, by_id: &std::collections::HashMap<&str, &Value>, depth: usize, out: &mut String) {
    let role = n["role"]["value"].as_str().unwrap_or("");
    let name = n["name"]["value"].as_str().unwrap_or("").trim();
    let skip = n["ignored"].as_bool() == Some(true) || matches!(role, "generic" | "none" | "StaticText" | "InlineTextBox" | "");
    let next_depth = if skip { depth } else { depth + 1 };
    if !skip {
        let r = n["backendDOMNodeId"].as_i64().map(|id| format!(" [ref={id}]")).unwrap_or_default();
        let shown: String = name.chars().take(120).collect();
        out.push_str(&format!("{}- {role} \"{shown}\"{r}\n", "  ".repeat(depth)));
    } else if role == "StaticText" && !name.is_empty() {
        let shown: String = name.chars().take(200).collect();
        out.push_str(&format!("{}{shown}\n", "  ".repeat(depth)));
    }
    for child in n["childIds"].as_array().into_iter().flatten() {
        if let Some(c) = child.as_str().and_then(|id| by_id.get(id)) {
            walk(c, by_id, next_depth, out);
        }
    }
}

struct Cdp {
    ws: tokio_tungstenite::WebSocketStream<tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>>,
    next: u64,
}

impl Cdp {
    async fn connect(url: &str) -> anyhow::Result<Self> {
        let (ws, _) = tokio_tungstenite::connect_async(url).await?;
        Ok(Self { ws, next: 0 })
    }

    async fn call(&mut self, session: Option<&str>, method: &str, params: Value) -> anyhow::Result<Value> {
        self.next += 1;
        let id = self.next;
        let mut msg = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = session {
            msg["sessionId"] = json!(s);
        }
        self.ws.send(Message::Text(msg.to_string().into())).await?;
        let wait = async {
            while let Some(m) = self.ws.next().await {
                let Message::Text(t) = m? else { continue };
                let v: Value = serde_json::from_str(t.as_str())?;
                if v["id"].as_u64() == Some(id) {
                    if let Some(e) = v.get("error") {
                        anyhow::bail!("{method}: {e}");
                    }
                    return Ok(v["result"].clone());
                }
            }
            anyhow::bail!("the browser closed the connection")
        };
        tokio::time::timeout(Duration::from_secs(60), wait).await?
    }

    async fn attach(&mut self, target: &str) -> anyhow::Result<String> {
        let a = self.call(None, "Target.attachToTarget", json!({ "targetId": target, "flatten": true })).await?;
        Ok(a["sessionId"].as_str().unwrap_or_default().to_string())
    }

    async fn center(&mut self, s: &str, backend: i64) -> anyhow::Result<(f64, f64)> {
        let _ = self.call(Some(s), "DOM.scrollIntoViewIfNeeded", json!({ "backendNodeId": backend })).await;
        let b = self.call(Some(s), "DOM.getBoxModel", json!({ "backendNodeId": backend })).await?;
        let q = b["model"]["content"].as_array().cloned().unwrap_or_default();
        let f = |i: usize| q.get(i).and_then(Value::as_f64).unwrap_or(0.0);
        Ok(((f(0) + f(2)) / 2.0, (f(1) + f(5)) / 2.0))
    }
}
