//! Drive the tabs of the person's running browser window over the Chrome
//! DevTools Protocol. Window tabs are Chromium (CEF); the window's relay
//! (`crates/redrob-shell/src/relay.rs`) passes standard CDP through to it and
//! answers the `Redrob.*` methods itself. Used by `redrob-browser tab ...` and
//! by the MCP `window_*` tools.
//!
//! The relay address is in `<data>/redrob-browser/Default/engine/ws-endpoint`
//! (owner-only), or `REDROB_BROWSER_CDP` when set. Tabs opened here are agent
//! tabs: the window marks them so the person can tell them apart.

use std::path::PathBuf;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

/// A tab as `Target.getTargets` reports it, with the window's marks.
#[derive(Debug, Clone, PartialEq)]
pub struct Tab {
    pub id: String,
    pub url: String,
    pub title: String,
    /// Which window shows it (1 is the first), when the window says.
    pub window: Option<u64>,
    /// An agent opened it.
    pub agent: bool,
}

/// The relay address of the running window.
pub fn endpoint() -> anyhow::Result<String> {
    if let Ok(v) = std::env::var("REDROB_BROWSER_CDP") {
        return Ok(v);
    }
    let file = data_dir()
        .join("redrob-browser")
        .join("Default")
        .join("engine")
        .join("ws-endpoint");
    let text = std::fs::read_to_string(&file).map_err(|_| {
        anyhow::anyhow!(
            "Redrob Browser is not running (no {}). Start it with `redrob-browser`.",
            file.display()
        )
    })?;
    Ok(text.trim().to_string())
}

fn data_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if cfg!(target_os = "macos") {
        home.join("Library").join("Application Support")
    } else if cfg!(windows) {
        std::env::var_os("LOCALAPPDATA")
            .or_else(|| std::env::var_os("APPDATA"))
            .map(PathBuf::from)
            .unwrap_or(home)
    } else {
        std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| home.join(".local").join("share"))
    }
}

pub struct Cdp {
    ws: tokio_tungstenite::WebSocketStream<
        tokio_tungstenite::MaybeTlsStream<tokio::net::TcpStream>,
    >,
    next: u64,
}

impl Cdp {
    pub async fn connect(url: &str) -> anyhow::Result<Self> {
        let (ws, _) = tokio::time::timeout(
            Duration::from_secs(10),
            tokio_tungstenite::connect_async(url),
        )
        .await
        .map_err(|_| anyhow::anyhow!("Redrob Browser did not answer on {url}"))??;
        Ok(Self { ws, next: 0 })
    }

    /// Connect to the running window.
    pub async fn window() -> anyhow::Result<Self> {
        Self::connect(&endpoint()?).await
    }

    pub async fn call(
        &mut self,
        session: Option<&str>,
        method: &str,
        params: Value,
    ) -> anyhow::Result<Value> {
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
        tokio::time::timeout(Duration::from_secs(60), wait)
            .await
            .map_err(|_| anyhow::anyhow!("{method}: no answer in 60 s"))?
    }

    pub async fn attach(&mut self, target: &str) -> anyhow::Result<String> {
        let a = self
            .call(
                None,
                "Target.attachToTarget",
                json!({ "targetId": target, "flatten": true }),
            )
            .await?;
        Ok(a["sessionId"].as_str().unwrap_or_default().to_string())
    }

    pub async fn list(&mut self) -> anyhow::Result<Vec<Tab>> {
        let t = self.call(None, "Target.getTargets", json!({})).await?;
        Ok(t["targetInfos"]
            .as_array()
            .into_iter()
            .flatten()
            .filter(|i| i["type"] == "page")
            .map(|i| Tab {
                id: i["targetId"].as_str().unwrap_or("").to_string(),
                url: i["url"].as_str().unwrap_or("").to_string(),
                title: i["title"].as_str().unwrap_or("").to_string(),
                window: i["redrobWindow"].as_u64(),
                agent: i["redrobAgent"] == true,
            })
            .collect())
    }

    /// Open an agent tab; returns its id.
    pub async fn open(&mut self, url: &str) -> anyhow::Result<String> {
        let t = self
            .call(None, "Target.createTarget", json!({ "url": url }))
            .await?;
        Ok(t["targetId"].as_str().unwrap_or("").to_string())
    }

    pub async fn close(&mut self, id: &str) -> anyhow::Result<()> {
        self.call(None, "Target.closeTarget", json!({ "targetId": id }))
            .await?;
        Ok(())
    }

    /// Navigate and wait for the load event (at most 30 s).
    pub async fn go(&mut self, id: &str, url: &str) -> anyhow::Result<()> {
        let s = self.attach(id).await?;
        self.call(Some(&s), "Page.enable", json!({})).await?;
        let r = self
            .call(Some(&s), "Page.navigate", json!({ "url": url }))
            .await?;
        if let Some(e) = r["errorText"].as_str().filter(|e| !e.is_empty()) {
            anyhow::bail!("{url}: {e}");
        }
        let _ = tokio::time::timeout(Duration::from_secs(30), async {
            while let Some(Ok(Message::Text(t))) = self.ws.next().await {
                let Ok(v) = serde_json::from_str::<Value>(t.as_str()) else {
                    continue;
                };
                if v["method"] == "Page.loadEventFired" && v["sessionId"] == s.as_str() {
                    break;
                }
            }
        })
        .await;
        Ok(())
    }

    /// The page as an indented outline; elements carry `[ref=N]` handles.
    pub async fn read(&mut self, id: &str) -> anyhow::Result<String> {
        let s = self.attach(id).await?;
        let tree = self
            .call(Some(&s), "Accessibility.getFullAXTree", json!({}))
            .await?;
        Ok(outline(&tree))
    }

    pub async fn click(&mut self, id: &str, r#ref: i64) -> anyhow::Result<()> {
        let s = self.attach(id).await?;
        let (x, y) = self.center(&s, r#ref).await?;
        for kind in ["mouseMoved", "mousePressed", "mouseReleased"] {
            self.call(
                Some(&s),
                "Input.dispatchMouseEvent",
                json!({ "type": kind, "x": x, "y": y, "button": "left", "clickCount": 1 }),
            )
            .await?;
        }
        Ok(())
    }

    pub async fn type_text(
        &mut self,
        id: &str,
        r#ref: i64,
        text: &str,
        submit: bool,
    ) -> anyhow::Result<()> {
        let s = self.attach(id).await?;
        self.call(Some(&s), "DOM.focus", json!({ "backendNodeId": r#ref }))
            .await?;
        self.call(Some(&s), "Input.insertText", json!({ "text": text }))
            .await?;
        if submit {
            self.press_in(&s, "Enter").await?;
        }
        Ok(())
    }

    pub async fn key(&mut self, id: &str, key: &str) -> anyhow::Result<()> {
        let s = self.attach(id).await?;
        self.press_in(&s, key).await
    }

    pub async fn scroll(&mut self, id: &str, dy: f64) -> anyhow::Result<()> {
        let s = self.attach(id).await?;
        self.call(
            Some(&s),
            "Input.dispatchMouseEvent",
            json!({ "type": "mouseWheel", "x": 100, "y": 100, "deltaX": 0, "deltaY": dy }),
        )
        .await?;
        Ok(())
    }

    /// A PNG of the visible page, base64 as Chromium sends it.
    pub async fn shot(&mut self, id: &str) -> anyhow::Result<String> {
        let s = self.attach(id).await?;
        let shot = self
            .call(
                Some(&s),
                "Page.captureScreenshot",
                json!({ "format": "png" }),
            )
            .await?;
        Ok(shot["data"].as_str().unwrap_or("").to_string())
    }

    /// Evaluate a script (promises are awaited) and return its value as JSON.
    pub async fn eval(&mut self, id: &str, expression: &str) -> anyhow::Result<Value> {
        let s = self.attach(id).await?;
        let v = self
            .call(
                Some(&s),
                "Runtime.evaluate",
                json!({ "expression": expression, "returnByValue": true, "awaitPromise": true }),
            )
            .await?;
        if let Some(e) = v.get("exceptionDetails") {
            let text = e["exception"]["description"]
                .as_str()
                .or_else(|| e["text"].as_str())
                .unwrap_or("exception");
            anyhow::bail!("{text}");
        }
        Ok(v["result"]["value"].clone())
    }

    pub async fn markdown(&mut self, id: &str) -> anyhow::Result<String> {
        let v = self.eval(id, obscura_browser::HTML_TO_MARKDOWN_JS).await?;
        Ok(v.as_str().unwrap_or("").to_string())
    }

    /// `Redrob.login`: the window types a saved login; only the outcome and
    /// the username come back.
    pub async fn login(&mut self, id: &str, user: Option<&str>) -> anyhow::Result<Value> {
        let mut p = json!({ "targetId": id });
        if let Some(u) = user {
            p["username"] = json!(u);
        }
        self.call(None, "Redrob.login", p).await
    }

    async fn press_in(&mut self, s: &str, key: &str) -> anyhow::Result<()> {
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
        let mut down =
            json!({ "type": "keyDown", "key": key, "code": key, "windowsVirtualKeyCode": vk });
        if key == "Enter" {
            down["text"] = json!("\r");
        }
        self.call(Some(s), "Input.dispatchKeyEvent", down).await?;
        self.call(
            Some(s),
            "Input.dispatchKeyEvent",
            json!({ "type": "keyUp", "key": key, "code": key, "windowsVirtualKeyCode": vk }),
        )
        .await?;
        Ok(())
    }

    async fn center(&mut self, s: &str, backend: i64) -> anyhow::Result<(f64, f64)> {
        let _ = self
            .call(
                Some(s),
                "DOM.scrollIntoViewIfNeeded",
                json!({ "backendNodeId": backend }),
            )
            .await;
        let b = self
            .call(
                Some(s),
                "DOM.getBoxModel",
                json!({ "backendNodeId": backend }),
            )
            .await?;
        let q = b["model"]["content"]
            .as_array()
            .cloned()
            .unwrap_or_default();
        let f = |i: usize| q.get(i).and_then(Value::as_f64).unwrap_or(0.0);
        Ok(((f(0) + f(2)) / 2.0, (f(1) + f(5)) / 2.0))
    }
}

/// Accessibility tree as an indented outline. Each interesting node carries
/// its backend DOM node id as `[ref=N]`, which click and type accept.
pub fn outline(tree: &Value) -> String {
    let nodes = tree["nodes"].as_array().cloned().unwrap_or_default();
    let by_id: std::collections::HashMap<&str, &Value> = nodes
        .iter()
        .filter_map(|n| n["nodeId"].as_str().map(|id| (id, n)))
        .collect();
    let mut out = String::new();
    let Some(root) = nodes.first() else {
        return out;
    };
    walk(root, &by_id, 0, &mut out);
    out
}

fn walk(
    n: &Value,
    by_id: &std::collections::HashMap<&str, &Value>,
    depth: usize,
    out: &mut String,
) {
    let role = n["role"]["value"].as_str().unwrap_or("");
    let name = n["name"]["value"].as_str().unwrap_or("").trim();
    let skip = n["ignored"].as_bool() == Some(true)
        || matches!(
            role,
            "generic" | "none" | "StaticText" | "InlineTextBox" | ""
        );
    let next_depth = if skip { depth } else { depth + 1 };
    if !skip {
        let r = n["backendDOMNodeId"]
            .as_i64()
            .map(|id| format!(" [ref={id}]"))
            .unwrap_or_default();
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

/// MCP tool definitions for the window's tabs.
pub fn tools() -> Vec<Value> {
    let id = json!({ "type": "string", "description": "Tab id from window_tab_list" });
    let r#ref =
        json!({ "type": "integer", "description": "Element ref from window_snapshot ([ref=N])" });
    vec![
        json!({ "name": "window_tab_list", "description": "List the tabs of the person's Redrob Browser window: id, URL, title, window number and whether an agent opened it.", "inputSchema": { "type": "object", "properties": {} } }),
        json!({ "name": "window_tab_open", "description": "Open a new agent tab in the person's browser window and return its id.", "inputSchema": { "type": "object", "properties": { "url": { "type": "string" } }, "required": ["url"] } }),
        json!({ "name": "window_tab_close", "description": "Close a window tab.", "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] } }),
        json!({ "name": "window_navigate", "description": "Navigate a window tab and wait for it to load.", "inputSchema": { "type": "object", "properties": { "id": id, "url": { "type": "string" } }, "required": ["id", "url"] } }),
        json!({ "name": "window_snapshot", "description": "Outline of a window tab's page; elements carry [ref=N] handles for window_click and window_type.", "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] } }),
        json!({ "name": "window_click", "description": "Click an element of a window tab by ref.", "inputSchema": { "type": "object", "properties": { "id": id, "ref": r#ref }, "required": ["id", "ref"] } }),
        json!({ "name": "window_type", "description": "Focus an element of a window tab by ref and type text; submit presses Enter.", "inputSchema": { "type": "object", "properties": { "id": id, "ref": r#ref, "text": { "type": "string" }, "submit": { "type": "boolean" } }, "required": ["id", "ref", "text"] } }),
        json!({ "name": "window_press_key", "description": "Press a key (Enter, Tab, Escape, ArrowDown, ...) in a window tab.", "inputSchema": { "type": "object", "properties": { "id": id, "key": { "type": "string" } }, "required": ["id", "key"] } }),
        json!({ "name": "window_scroll", "description": "Scroll a window tab by dy CSS pixels (negative scrolls up).", "inputSchema": { "type": "object", "properties": { "id": id, "dy": { "type": "number" } }, "required": ["id", "dy"] } }),
        json!({ "name": "window_evaluate", "description": "Run JavaScript in a window tab and return the value as JSON.", "inputSchema": { "type": "object", "properties": { "id": id, "expression": { "type": "string" } }, "required": ["id", "expression"] } }),
        json!({ "name": "window_markdown", "description": "A window tab's page as Markdown.", "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] } }),
        json!({ "name": "window_screenshot", "description": "PNG of a window tab's visible page.", "inputSchema": { "type": "object", "properties": { "id": id }, "required": ["id"] } }),
        json!({ "name": "window_login", "description": "Sign in on a window tab with a login saved in the browser. The browser types the password; only the outcome and username come back.", "inputSchema": { "type": "object", "properties": { "id": id, "user": { "type": "string" } }, "required": ["id"] } }),
    ]
}

/// Run a `window_*` tool. None: not a window tool. Some(Ok(content)) is one
/// MCP content item.
pub async fn call_tool(name: &str, args: &Value) -> Option<Result<Value, String>> {
    if !name.starts_with("window_") {
        return None;
    }
    Some(run_tool(name, args).await.map_err(|e| e.to_string()))
}

async fn run_tool(name: &str, args: &Value) -> anyhow::Result<Value> {
    let s = |k: &str| -> anyhow::Result<String> {
        args[k]
            .as_str()
            .map(str::to_string)
            .ok_or_else(|| anyhow::anyhow!("'{k}' is required"))
    };
    let r = || -> anyhow::Result<i64> {
        args["ref"]
            .as_i64()
            .ok_or_else(|| anyhow::anyhow!("'ref' is required"))
    };
    let text = |t: String| json!({ "type": "text", "text": t });
    let mut c = Cdp::window().await?;
    Ok(match name {
        "window_tab_list" => {
            let tabs: Vec<Value> = c
                .list()
                .await?
                .into_iter()
                .map(|t| json!({ "id": t.id, "url": t.url, "title": t.title, "window": t.window, "agent": t.agent }))
                .collect();
            text(serde_json::to_string(&tabs)?)
        }
        "window_tab_open" => text(c.open(&s("url")?).await?),
        "window_tab_close" => {
            c.close(&s("id")?).await?;
            text("closed".into())
        }
        "window_navigate" => {
            c.go(&s("id")?, &s("url")?).await?;
            text("loaded".into())
        }
        "window_snapshot" => text(c.read(&s("id")?).await?),
        "window_click" => {
            c.click(&s("id")?, r()?).await?;
            text("clicked".into())
        }
        "window_type" => {
            let submit = args["submit"].as_bool().unwrap_or(false);
            c.type_text(&s("id")?, r()?, &s("text")?, submit).await?;
            text("typed".into())
        }
        "window_press_key" => {
            c.key(&s("id")?, &s("key")?).await?;
            text("pressed".into())
        }
        "window_scroll" => {
            let dy = args["dy"]
                .as_f64()
                .ok_or_else(|| anyhow::anyhow!("'dy' is required"))?;
            c.scroll(&s("id")?, dy).await?;
            text("scrolled".into())
        }
        "window_evaluate" => text(serde_json::to_string(
            &c.eval(&s("id")?, &s("expression")?).await?,
        )?),
        "window_markdown" => text(c.markdown(&s("id")?).await?),
        "window_screenshot" => {
            json!({ "type": "image", "data": c.shot(&s("id")?).await?, "mimeType": "image/png" })
        }
        "window_login" => {
            let user = args["user"].as_str();
            text(serde_json::to_string(&c.login(&s("id")?, user).await?)?)
        }
        _ => anyhow::bail!("Unknown tool: {name}"),
    })
}
