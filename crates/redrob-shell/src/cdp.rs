//! The window's CDP connection to the engine.
//!
//! One WebSocket, one flattened session per tab. The UI thread sends
//! [`Command`]s; this task turns them into CDP calls and sends page changes
//! back as [`Update`]s tagged with the tab. Each tab's pixels come over its
//! own scene channel (compositor/), opened here with `Page.redrobSceneAttach`.

use std::collections::{HashMap, HashSet};
use std::sync::mpsc::Sender;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio::sync::{mpsc, oneshot};
use tokio_tungstenite::tungstenite::Message;

use crate::compositor::{Incoming, ScrollKey};
use crate::model::TabId;

/// Finds the sign-in form on the page and types into it. The values arrive
/// as call arguments, never inside the script text.
const FILL_LOGIN_JS: &str = r#"function (username, password) {
  const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
  const pw = [...document.querySelectorAll('input[type=password]')].find(visible);
  if (!pw) return 'no-form';
  const scope = pw.form || document;
  const fields = [...scope.querySelectorAll('input')].filter(visible);
  const before = fields.slice(0, fields.indexOf(pw)).reverse();
  const user = before.find((e) => /^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username');
  const set = (el, v) => {
    const proto = Object.getPrototypeOf(el);
    const setter = Object.getOwnPropertyDescriptor(proto, 'value');
    if (setter && setter.set) setter.set.call(el, v); else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  };
  if (user && username) set(user, username);
  set(pw, password);
  pw.focus();
  return 'filled';
}"#;

/// Runs in every document: when a form with a filled password field is
/// submitted, or a button next to one is clicked, report the sign-in to the
/// window so it can offer to save it. The binding is the only channel.
const LOGIN_SUBMIT_JS: &str = r#"(() => {
  if (typeof redrobLoginSubmit !== 'function') return;
  let last = '';
  const report = (scope) => {
    const pw = [...(scope || document).querySelectorAll('input[type=password]')].find((e) => e.value);
    if (!pw) return;
    const fields = [...(pw.form || document).querySelectorAll('input')];
    const before = fields.slice(0, fields.indexOf(pw)).reverse();
    const user = before.find((e) => e.value && (/^(text|email|tel|)$/i.test(e.type) || e.autocomplete === 'username'));
    const key = (user ? user.value : '') + '\u0000' + pw.value;
    if (key === last) return;
    last = key;
    redrobLoginSubmit(JSON.stringify({ origin: location.origin, username: user ? user.value : '', password: pw.value }));
  };
  addEventListener('submit', (e) => report(e.target), true);
  addEventListener('click', (e) => {
    const b = e.target && e.target.closest && e.target.closest('button, input[type=submit]');
    if (b) report(b.form || document);
  }, true);
})();"#;

const LOGIN_BINDING: &str = "redrobLoginSubmit";
/// `<video>`/`<audio>` ask the window to play through this binding.
const MEDIA_BINDING: &str = "redrobMedia";
/// A page asked for a DRM key system the engine does not have (docs/DRM.md).
const DRM_BINDING: &str = "redrobDrm";
/// MediaSource/SourceBuffer bytes and calls, delivered like media requests.
const MSE_BINDING: &str = "redrobMse";
/// After load the window starts muted `autoplay` media; autoplay with sound stays blocked.
/// Whether a text field (or an editable element) has focus, so arrow and
/// space keys belong to it instead of scrolling.
const EDITING_JS: &str = "(() => { let e = document.activeElement; while (e && e.shadowRoot && e.shadowRoot.activeElement) e = e.shadowRoot.activeElement; if (!e) return false; if (e.isContentEditable) return true; const t = e.tagName; if (t === 'TEXTAREA' || t === 'SELECT') return true; if (t !== 'INPUT') return false; return !/^(button|checkbox|radio|submit|reset|image|file|color|range)$/i.test(e.type || ''); })()";
const AUTOPLAY_JS: &str = "document.querySelectorAll('video[autoplay][muted], audio[autoplay][muted]').forEach((e) => { if (e.paused && e.muted) e.play().catch(() => {}); })";

/// Tab ids the engine side hands out for pages a page opened itself.
const POPUP_ID_BASE: TabId = 1 << 40;

pub enum Op {
    Open(String),
    Close,
    /// This tab is now the one on screen.
    Activate,
    Navigate(String),
    Back,
    Forward,
    Reload,
    Stop,
    Mouse {
        kind: &'static str,
        x: f32,
        y: f32,
        button: &'static str,
        clicks: u32,
        modifiers: u32,
    },
    Wheel {
        x: f32,
        y: f32,
        dx: f32,
        dy: f32,
        modifiers: u32,
        /// Front hit node under the pointer, echoed in `Event::WheelAnswer`.
        node: Option<u64>,
        /// Whether the window scrolled before asking (undo on cancel).
        scrolled: bool,
        smooth: bool,
    },
    /// The link under a page point, for a middle click (autoscroll.rs).
    LinkAt {
        x: f32,
        y: f32,
    },
    Key {
        down: bool,
        key: String,
        code: String,
        vk: u32,
        modifiers: u32,
    },
    Text(String),
    /// A scrolling key went to the page: scroll unless a text field has focus.
    ScrollKey(ScrollKey),
    /// The developer tools opened on this tab: start reporting network traffic.
    DevtoolsOpen,
    /// Run JavaScript typed into the console.
    Evaluate(String),
    /// Send the whole document tree for the Elements panel.
    GetDom,
    /// Computed and inline style of a node, for the Elements panel.
    NodeStyles(i64),
    /// Highlight a node on the page (Overlay.highlightNode), or clear it.
    Highlight(Option<i64>),
    /// Pick mode: the element at this page point; `commit` selects it,
    /// otherwise it is only highlighted.
    PickAt {
        x: f32,
        y: f32,
        commit: bool,
    },
    /// Tell the page's media element `id` how playback is going.
    MediaReport {
        id: u64,
        status: crate::media::Status,
    },
    /// Ask where these media elements are on screen.
    MediaRects(Vec<u64>),
    /// Run a media script in the page without reporting its result.
    MediaEval(String),
    /// Type a saved login into the page's sign-in form.
    FillLogin {
        username: String,
        password: zeroize::Zeroizing<String>,
    },
}

/// The browser window a command came from. Every window of the process
/// shares this one engine connection; a tab belongs to the window that last
/// opened or activated it, so a tab moved to another window keeps its target.
pub type WindowId = u64;

/// A window's way to the engine connection: every command it sends carries
/// its window id.
#[derive(Clone)]
pub struct Commands {
    pub window: WindowId,
    pub tx: mpsc::UnboundedSender<(WindowId, Command)>,
}

impl Commands {
    pub fn send(&self, cmd: Command) -> Result<(), mpsc::error::SendError<(WindowId, Command)>> {
        self.tx.send((self.window, cmd))
    }
}

pub enum Command {
    Tab(TabId, Op),
    /// Viewport in CSS pixels and the device scale factor, for every tab of
    /// the window that sent it.
    Resize {
        width: u32,
        height: u32,
        scale: f32,
    },
}

pub enum Event {
    /// A message on the tab's scene channel.
    Scene(Incoming),
    /// The tab's scene channel is open; messages to the engine go here.
    SceneLink(mpsc::UnboundedSender<redrob_scene::ClientMsg>),
    /// The engine gave no scene channel for the tab.
    SceneUnavailable(String),
    /// Scroll for a key the page did not use (`Op::ScrollKey`).
    ScrollKey(ScrollKey),
    /// The page's answer to a wheel event (`Op::Wheel`).
    WheelAnswer {
        node: Option<u64>,
        prevented: bool,
        scrolled: bool,
        at: (f32, f32),
        delta: (f32, f32),
        smooth: bool,
    },
    /// A different document.
    Navigated(String),
    /// Same document, new URL (fragment or history API).
    UrlChanged(String),
    Title(String),
    Loading(bool),
    /// The page opened a new window; show it as a new tab next to its opener.
    Opened {
        url: String,
        opener: Option<TabId>,
    },
    /// The person signed in on a page; the window may offer to save it.
    LoginSubmitted {
        origin: String,
        username: String,
        password: zeroize::Zeroizing<String>,
    },
    /// The tab's CDP target id, once it is attached.
    Target(String),
    Console {
        level: String,
        text: String,
    },
    NetRequest {
        id: String,
        method: String,
        url: String,
    },
    NetResponse {
        id: String,
        status: u16,
        mime: String,
    },
    Dom(Value),
    Styles(crate::devtools::Styles),
    /// Overlay.redrobHighlight: a box model to draw over the page, or null.
    Highlight(Value),
    /// The element a pick click landed on.
    Picked(i64),
    /// A media element asked for something: {op, id, src, currentTime, volume, muted, controls, loop, video}.
    Media(Value),
    /// Viewport rectangles (CSS pixels) of media elements; None when not rendered.
    MediaRects(Vec<(u64, Option<[f32; 4]>)>),
    /// The page wants a DRM key system (Widevine, PlayReady, FairPlay) the engine lacks.
    DrmRequested {
        key_system: String,
    },
    /// Result of FillLogin: "filled" or "no-form".
    Filled(String),
    /// The answer to `Op::LinkAt`: the link's absolute URL, if any.
    LinkAt(Option<String>),
    /// A file download began or changed state. Sent with tab 0.
    Download {
        guid: String,
        url: String,
        filename: String,
        state: String,
        path: String,
        bytes: u64,
    },
    Error(String),
}

pub struct Update {
    pub tab: TabId,
    pub event: Event,
}

type Pending = HashMap<u64, oneshot::Sender<Value>>;

struct Conn {
    out: mpsc::UnboundedSender<String>,
    pending: std::sync::Arc<std::sync::Mutex<Pending>>,
    next: u64,
}

impl Conn {
    async fn call(
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
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        self.out.send(msg.to_string())?;
        let reply = tokio::time::timeout(Duration::from_secs(60), rx).await??;
        if let Some(err) = reply.get("error") {
            anyhow::bail!("{method}: {err}");
        }
        Ok(reply.get("result").cloned().unwrap_or(Value::Null))
    }

    /// Send a command whose reply comes much later (a navigation replies at
    /// load) without holding up this loop, so events of the loading page
    /// are handled meanwhile. `on_error` gets an error reply.
    fn call_in_background(
        &mut self,
        session: Option<&str>,
        method: &str,
        params: Value,
        on_error: impl FnOnce(String) + Send + 'static,
    ) {
        self.next += 1;
        let id = self.next;
        let mut msg = json!({ "id": id, "method": method, "params": params });
        if let Some(s) = session {
            msg["sessionId"] = json!(s);
        }
        let (tx, rx) = oneshot::channel();
        self.pending.lock().unwrap().insert(id, tx);
        if let Err(e) = self.out.send(msg.to_string()) {
            on_error(e.to_string());
            return;
        }
        let method = method.to_string();
        tokio::spawn(async move {
            let error = match tokio::time::timeout(Duration::from_secs(60), rx).await {
                Ok(Ok(reply)) => reply.get("error").map(|err| format!("{method}: {err}")),
                Ok(Err(_)) => None,
                Err(_) => Some(format!("{method}: timed out")),
            };
            if let Some(error) = error {
                on_error(error);
            }
        });
    }

    /// Fire and forget: input events do not need their reply awaited.
    fn send(&mut self, session: Option<&str>, method: &str, params: Value) {
        self.next += 1;
        let mut msg = json!({ "id": self.next, "method": method, "params": params });
        if let Some(s) = session {
            msg["sessionId"] = json!(s);
        }
        let _ = self.out.send(msg.to_string());
    }
}

struct TabConn {
    session: String,
    target: String,
}

struct State {
    c: Conn,
    tabs: HashMap<TabId, TabConn>,
    by_session: HashMap<String, TabId>,
    /// Targets this window created, so their targetCreated is not taken for a popup.
    own_targets: HashSet<String>,
    /// The tab on screen in each window.
    active: HashMap<WindowId, TabId>,
    /// Each window's page area.
    sizes: HashMap<WindowId, (u32, u32, f32)>,
    /// Which window shows each tab.
    tab_window: HashMap<TabId, WindowId>,
    next_popup: TabId,
    updates: Sender<Update>,
    repaint: Arc<dyn Fn(Option<TabId>) + Send + Sync>,
}

impl State {
    fn emit(&self, tab: TabId, event: Event) {
        let _ = self.updates.send(Update { tab, event });
    }

    /// Navigate a tab without waiting for its load inside this loop.
    fn navigate_in_background(
        &mut self,
        tab: TabId,
        session: Option<&str>,
        method: &str,
        params: Value,
    ) {
        let updates = self.updates.clone();
        self.c
            .call_in_background(session, method, params, move |error| {
                let _ = updates.send(Update {
                    tab,
                    event: Event::Error(error),
                });
            });
    }

    fn session(&self, tab: TabId) -> Option<String> {
        self.tabs.get(&tab).map(|t| t.session.clone())
    }

    /// The page area of the tab's window, or of any window for a tab no
    /// window has shown yet (an agent's).
    fn size_of(&self, tab: TabId) -> (u32, u32, f32) {
        self.tab_window
            .get(&tab)
            .and_then(|w| self.sizes.get(w))
            .or_else(|| self.sizes.values().next())
            .copied()
            .unwrap_or((1280, 800, 1.0))
    }

    async fn attach(&mut self, tab: TabId, target: String) -> anyhow::Result<()> {
        let attached = self
            .c
            .call(
                None,
                "Target.attachToTarget",
                json!({ "targetId": target, "flatten": true }),
            )
            .await?;
        let session = attached["sessionId"]
            .as_str()
            .unwrap_or_default()
            .to_string();
        let s = Some(session.as_str());
        self.c.call(s, "Page.enable", json!({})).await?;
        self.c.call(s, "Runtime.enable", json!({})).await?;
        self.c
            .call(s, "Runtime.addBinding", json!({ "name": LOGIN_BINDING }))
            .await?;
        self.c
            .call(s, "Runtime.addBinding", json!({ "name": MEDIA_BINDING }))
            .await?;
        self.c
            .call(s, "Runtime.addBinding", json!({ "name": DRM_BINDING }))
            .await?;
        self.c
            .call(s, "Runtime.addBinding", json!({ "name": MSE_BINDING }))
            .await?;
        self.c
            .call(
                s,
                "Page.addScriptToEvaluateOnNewDocument",
                json!({ "source": LOGIN_SUBMIT_JS }),
            )
            .await?;
        let (w, h, scale) = self.size_of(tab);
        eprintln!("P7DBG attach size {w}x{h}@{scale}");
        self.c
            .call(
                s,
                "Emulation.setDeviceMetricsOverride",
                json!({ "width": w, "height": h, "deviceScaleFactor": scale, "mobile": false }),
            )
            .await?;
        self.by_session.insert(session.clone(), tab);
        self.emit(tab, Event::Target(target.clone()));
        if !crate::compositor::TabScene::debug_file() {
            self.attach_scene(tab, &session, &target).await;
        }
        self.tabs.insert(tab, TabConn { session, target });
        Ok(())
    }

    /// Open the tab's scene channel: the engine names a socket for it.
    async fn attach_scene(&mut self, tab: TabId, session: &str, target: &str) {
        let params = json!({ "targetId": target });
        let reply = match self
            .c
            .call(Some(session), "Page.redrobSceneAttach", params.clone())
            .await
        {
            Ok(v) => Ok(v),
            Err(_) => self.c.call(None, "Page.redrobSceneAttach", params).await,
        };
        let address = match reply {
            Ok(v) => ["address", "socket", "path"]
                .iter()
                .find_map(|k| v[*k].as_str().map(str::to_string))
                .ok_or_else(|| "Page.redrobSceneAttach returned no address".to_string()),
            Err(e) => Err(e.to_string()),
        };
        let result = match address {
            Ok(address) => {
                let updates = self.updates.clone();
                let repaint = self.repaint.clone();
                let deliver: Arc<dyn Fn(Incoming) + Send + Sync> = Arc::new(move |msg| {
                    let _ = updates.send(Update {
                        tab,
                        event: Event::Scene(msg),
                    });
                    repaint(Some(tab));
                });
                crate::compositor::connect(&address, deliver)
                    .await
                    .map_err(|e| format!("scene socket {address}: {e}"))
            }
            Err(e) => Err(e),
        };
        match result {
            Ok(link) => self.emit(tab, Event::SceneLink(link)),
            Err(e) => {
                eprintln!("redrob-browser: no scene for tab {tab}: {e}");
                self.emit(tab, Event::SceneUnavailable(e));
            }
        }
    }
}

pub async fn run(
    ws_url: String,
    endpoint_file: std::path::PathBuf,
    window: crate::relay::Window,
    mut commands: mpsc::UnboundedReceiver<(WindowId, Command)>,
    updates: Sender<Update>,
    repaint: impl Fn(Option<TabId>) + Send + Sync + 'static,
) -> anyhow::Result<()> {
    let repaint: Arc<dyn Fn(Option<TabId>) + Send + Sync> = Arc::new(repaint);
    let (ws, _) = tokio_tungstenite::connect_async(ws_url.as_str()).await?;
    let (mut sink, mut stream) = ws.split();
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let (event_tx, mut event_rx) = mpsc::unbounded_channel::<Value>();
    let pending: std::sync::Arc<std::sync::Mutex<Pending>> = Default::default();
    let (broadcast_tx, _) = tokio::sync::broadcast::channel::<Value>(1024);

    tokio::spawn(async move {
        while let Some(text) = out_rx.recv().await {
            if sink.send(Message::Text(text.into())).await.is_err() {
                break;
            }
        }
    });
    let pending_reader = pending.clone();
    let relay_events = broadcast_tx.clone();
    tokio::spawn(async move {
        while let Some(Ok(msg)) = stream.next().await {
            let Message::Text(text) = msg else { continue };
            let Ok(v) = serde_json::from_str::<Value>(text.as_str()) else {
                continue;
            };
            if let Some(id) = v.get("id").and_then(Value::as_u64) {
                if let Some(tx) = pending_reader.lock().unwrap().remove(&id) {
                    let _ = tx.send(v);
                }
            } else {
                let _ = relay_events.send(v.clone());
                let _ = event_tx.send(v);
            }
        }
    });

    // Agents and `redrob-browser tab` reach the person's tabs through this relay.
    let relay_url =
        crate::relay::start(out_tx.clone(), pending.clone(), broadcast_tx, window).await?;
    crate::write_private(&endpoint_file, &relay_url);

    let mut st = State {
        c: Conn {
            out: out_tx,
            pending,
            next: 0,
        },
        tabs: HashMap::new(),
        by_session: HashMap::new(),
        own_targets: HashSet::new(),
        active: HashMap::new(),
        sizes: HashMap::new(),
        tab_window: HashMap::new(),
        next_popup: POPUP_ID_BASE,
        updates,
        repaint: repaint.clone(),
    };
    st.c.call(
        None,
        "Target.setDiscoverTargets",
        json!({ "discover": true }),
    )
    .await?;
    let downloads = crate::profile::downloads_dir();
    st.c.call(
        None,
        "Browser.setDownloadBehavior",
        json!({ "behavior": "allow", "downloadPath": downloads.to_string_lossy(), "eventsEnabled": true }),
    )
    .await?;

    // Commands taken from the channel early while coalescing pointer moves.
    let mut backlog: std::collections::VecDeque<(WindowId, Command)> =
        std::collections::VecDeque::new();
    loop {
        // Wake the window showing the tab a command or event was about.
        if let Some(cmd) = backlog.pop_front() {
            let tab = command_tab(&cmd.1);
            run_command(&mut st, cmd, &mut commands, &mut backlog).await;
            repaint(tab);
            continue;
        }
        tokio::select! {
            cmd = commands.recv() => {
                let Some(cmd) = cmd else { break };
                let tab = command_tab(&cmd.1);
                run_command(&mut st, cmd, &mut commands, &mut backlog).await;
                repaint(tab);
            }
            ev = event_rx.recv() => {
                let Some(ev) = ev else { break };
                let tab = ev["sessionId"].as_str().and_then(|s| st.by_session.get(s).copied());
                on_event(&mut st, ev).await;
                repaint(tab);
            }
        }
    }
    Ok(())
}

fn is_move(cmd: &(WindowId, Command), tab: TabId) -> bool {
    matches!(cmd, (_, Command::Tab(t, Op::Mouse { kind: "mouseMoved", .. })) if *t == tab)
}

/// Run one command. A pointer move first absorbs the moves queued behind it
/// for the same tab, so the engine handles only the newest one: a page that
/// takes hundreds of milliseconds per move otherwise fell seconds behind the
/// pointer, and clicks waited behind the queue.
async fn run_command(
    st: &mut State,
    mut cmd: (WindowId, Command),
    commands: &mut tokio::sync::mpsc::UnboundedReceiver<(WindowId, Command)>,
    backlog: &mut std::collections::VecDeque<(WindowId, Command)>,
) {
    if let (
        _,
        Command::Tab(
            tab,
            Op::Mouse {
                kind: "mouseMoved", ..
            },
        ),
    ) = &cmd
    {
        let tab = *tab;
        while let Some(next) = backlog.front() {
            if !is_move(next, tab) {
                break;
            }
            cmd = backlog.pop_front().expect("front exists");
        }
        if backlog.is_empty() {
            while let Ok(next) = commands.try_recv() {
                if is_move(&next, tab) {
                    cmd = next;
                } else {
                    backlog.push_back(next);
                    break;
                }
            }
        }
    }
    let (window, cmd) = cmd;
    match cmd {
        Command::Resize {
            width,
            height,
            scale,
        } => resize(st, window, (width, height, scale)).await,
        Command::Tab(tab, op) => {
            if let Err(e) = handle(st, window, tab, op).await {
                st.emit(tab, Event::Error(e.to_string()));
            }
        }
    }
}

async fn resize(st: &mut State, window: WindowId, size: (u32, u32, f32)) {
    eprintln!("P7DBG resize {window:?} {size:?} known {:?} tabs {:?} tab_window {:?}", st.sizes, st.tabs.keys().collect::<Vec<_>>(), st.tab_window);
    if st.sizes.get(&window) == Some(&size) {
        return;
    }
    st.sizes.insert(window, size);
    let sessions: Vec<(TabId, String)> = st
        .tabs
        .iter()
        .filter(|(id, _)| st.tab_window.get(id) == Some(&window))
        .map(|(id, t)| (*id, t.session.clone()))
        .collect();
    for (tab, session) in sessions {
        let params = json!({ "width": size.0, "height": size.1, "deviceScaleFactor": size.2, "mobile": false });
        let r = st.c.call(Some(&session), "Emulation.setDeviceMetricsOverride", params).await;
        eprintln!("P7DBG resize result {r:?}");
        let v = st.c.call(Some(&session), "Runtime.evaluate", json!({"expression": "[innerWidth, innerHeight, location.href]", "returnByValue": true})).await;
        eprintln!("P7DBG after resize {v:?}");
        if let Err(e) = r
        {
            st.emit(tab, Event::Error(e.to_string()));
        }
    }
}

async fn handle(st: &mut State, window: WindowId, tab: TabId, op: Op) -> anyhow::Result<()> {
    if let Op::Open(url) = &op {
        st.tab_window.insert(tab, window);
        let created =
            st.c.call(None, "Target.createTarget", json!({ "url": "about:blank" }))
                .await?;
        let target = created["targetId"].as_str().unwrap_or_default().to_string();
        st.own_targets.insert(target.clone());
        st.attach(tab, target).await?;
        if url != "about:blank" {
            let session = st.session(tab);
            st.emit(tab, Event::Loading(true));
            st.navigate_in_background(
                tab,
                session.as_deref(),
                "Page.navigate",
                json!({ "url": url }),
            );
        }
        return Ok(());
    }
    let Some(session) = st.session(tab) else {
        return Ok(());
    };
    let s = Some(session.as_str());
    match op {
        Op::Open(_) => {}
        Op::Close => {
            if let Some(t) = st.tabs.remove(&tab) {
                st.by_session.remove(&t.session);
                st.own_targets.remove(&t.target);
                st.c.call(None, "Target.closeTarget", json!({ "targetId": t.target }))
                    .await?;
            }
            st.tab_window.remove(&tab);
            st.active.retain(|_, t| *t != tab);
        }
        Op::Activate => {
            // A tab handed to another window: same target and session, the
            // new window's page size.
            let before = st.size_of(tab);
            st.tab_window.insert(tab, window);
            let (w, h, scale) = st.size_of(tab);
            if before != (w, h, scale) {
                let params =
                    json!({ "width": w, "height": h, "deviceScaleFactor": scale, "mobile": false });
                st.c.call(s, "Emulation.setDeviceMetricsOverride", params)
                    .await?;
            }
            st.active.retain(|_, t| *t != tab);
            st.active.insert(window, tab);
            st.c.call(
                None,
                "Target.activateTarget",
                json!({ "targetId": st.tabs[&tab].target }),
            )
            .await?;
        }
        Op::Navigate(url) => {
            st.emit(tab, Event::Loading(true));
            st.navigate_in_background(tab, s, "Page.navigate", json!({ "url": url }));
        }
        Op::Back => step_history(st, &session, -1).await?,
        Op::Forward => step_history(st, &session, 1).await?,
        Op::Reload => {
            st.emit(tab, Event::Loading(true));
            st.navigate_in_background(tab, s, "Page.reload", json!({}));
        }
        Op::Stop => {
            st.c.call(s, "Page.stopLoading", json!({})).await?;
            st.emit(tab, Event::Loading(false));
        }
        Op::Mouse {
            kind,
            x,
            y,
            button,
            clicks,
            modifiers,
        } => {
            let params = json!({ "type": kind, "x": x, "y": y, "button": button, "clickCount": clicks, "modifiers": modifiers });
            if kind == "mouseMoved" {
                // Wait for the engine, so the next move is coalesced (run_command).
                st.c.call(s, "Input.dispatchMouseEvent", params).await?;
            } else {
                st.c.send(s, "Input.dispatchMouseEvent", params);
            }
            // What a click changes comes back on the scene channel.
        }
        Op::Wheel {
            x,
            y,
            dx,
            dy,
            modifiers,
            node,
            scrolled,
            smooth,
        } => {
            // The window scrolls (compositor/scroll.rs); the page only fires
            // its `wheel` listeners and says whether one cancelled it.
            let r = st
                .c
                .call(
                    s,
                    "Input.dispatchMouseEvent",
                    json!({ "type": "mouseWheel", "x": x, "y": y, "deltaX": dx, "deltaY": dy, "modifiers": modifiers, "redrobCompositorScrolls": true }),
                )
                .await?;
            let prevented = r["redrobDefaultPrevented"].as_bool() == Some(true);
            st.emit(
                tab,
                Event::WheelAnswer {
                    node,
                    prevented,
                    scrolled,
                    at: (x, y),
                    delta: (dx, dy),
                    smooth,
                },
            );
        }
        Op::Key {
            down,
            key,
            code,
            vk,
            modifiers,
        } => {
            let kind = if down { "keyDown" } else { "keyUp" };
            // Scrolling keys scroll in the window (Op::ScrollKey), not in the engine.
            let mut p = json!({ "type": kind, "key": key, "code": code, "windowsVirtualKeyCode": vk, "modifiers": modifiers, "redrobCompositorScrolls": true });
            if down && key == "Enter" {
                p["text"] = json!("\r");
            }
            st.c.call(s, "Input.dispatchKeyEvent", p).await?;
        }
        Op::ScrollKey(key) => {
            let r =
                st.c.call(
                    s,
                    "Runtime.evaluate",
                    json!({ "expression": EDITING_JS, "returnByValue": true }),
                )
                .await?;
            if r["result"]["value"].as_bool() == Some(false) {
                st.emit(tab, Event::ScrollKey(key));
            }
        }
        Op::Text(text) => {
            st.c.send(s, "Input.insertText", json!({ "text": text }));
        }
        Op::DevtoolsOpen => {
            st.c.call(s, "Network.enable", json!({})).await?;
        }
        Op::LinkAt { x, y } => {
            let expr = format!(
                "(() => {{ const e = document.elementFromPoint({x}, {y}); const a = e && e.closest && e.closest('a[href]'); return a ? a.href : null }})()"
            );
            let r =
                st.c.call(
                    s,
                    "Runtime.evaluate",
                    json!({ "expression": expr, "returnByValue": true }),
                )
                .await;
            let link = r
                .ok()
                .and_then(|r| r["result"]["value"].as_str().map(str::to_string));
            st.emit(tab, Event::LinkAt(link));
        }
        Op::Evaluate(expr) => {
            let r = st
                .c
                .call(s, "Runtime.evaluate", json!({ "expression": expr, "returnByValue": true, "awaitPromise": true, "replMode": true }))
                .await?;
            let (level, text) = if let Some(ex) = r.get("exceptionDetails") {
                (
                    "error",
                    ex["exception"]["description"]
                        .as_str()
                        .or(ex["text"].as_str())
                        .unwrap_or("Error")
                        .to_string(),
                )
            } else {
                ("result", remote_object_text(&r["result"]))
            };
            st.emit(
                tab,
                Event::Console {
                    level: level.to_string(),
                    text,
                },
            );
        }
        Op::GetDom => {
            let d =
                st.c.call(
                    s,
                    "DOM.getDocument",
                    json!({ "depth": -1, "pierce": false }),
                )
                .await?;
            st.emit(tab, Event::Dom(d["root"].clone()));
        }
        Op::NodeStyles(node) => {
            let computed =
                st.c.call(s, "CSS.getComputedStyleForNode", json!({ "nodeId": node }))
                    .await?;
            let matched =
                st.c.call(s, "CSS.getMatchedStylesForNode", json!({ "nodeId": node }))
                    .await?;
            st.emit(
                tab,
                Event::Styles(crate::devtools::Styles::from_cdp(node, &computed, &matched)),
            );
        }
        Op::Highlight(Some(node)) => st.c.send(
            s,
            "Overlay.highlightNode",
            json!({ "nodeId": node, "highlightConfig": {} }),
        ),
        Op::Highlight(None) => st.c.send(s, "Overlay.hideHighlight", json!({})),
        Op::PickAt { x, y, commit } => {
            let hit =
                st.c.call(s, "DOM.getNodeForLocation", json!({ "x": x, "y": y }))
                    .await;
            let node = hit.ok().and_then(|h| h["backendNodeId"].as_i64());
            match (commit, node) {
                (false, Some(n)) => st.c.send(
                    s,
                    "Overlay.highlightNode",
                    json!({ "nodeId": n, "highlightConfig": {} }),
                ),
                (false, None) => st.c.send(s, "Overlay.hideHighlight", json!({})),
                (true, _) => {
                    st.c.send(s, "Overlay.hideHighlight", json!({}));
                    if let Some(n) = node {
                        st.emit(tab, Event::Picked(n));
                    }
                }
            }
        }
        Op::MediaReport { id, status } => {
            let s_json = json!({
                "currentTime": status.current_time,
                "duration": if status.duration.is_finite() { json!(status.duration) } else { json!(null) },
                "paused": status.paused, "ended": status.ended,
                "width": status.width, "height": status.height,
                "readyState": status.ready_state, "error": status.error,
            });
            // duration null means unknown: the page sees NaN.
            let expr = format!(
                "(() => {{ const s = {s_json}; if (s.duration === null) s.duration = NaN; globalThis.__redrobMediaUpdate && __redrobMediaUpdate({id}, s); }})()"
            );
            st.c.send(s, "Runtime.evaluate", json!({ "expression": expr }));
        }
        Op::MediaRects(ids) => {
            let list = serde_json::to_string(&ids).unwrap_or_else(|_| "[]".to_string());
            let expr = format!(
                "JSON.stringify({list}.map((id) => {{ const e = globalThis.__redrobMediaElements && __redrobMediaElements.get(id); if (!e || !e.isConnected) return [id, null]; const r = e.getBoundingClientRect(); return [id, r.width > 0 ? [r.left, r.top, r.width, r.height] : null]; }}))"
            );
            let r =
                st.c.call(
                    s,
                    "Runtime.evaluate",
                    json!({ "expression": expr, "returnByValue": true }),
                )
                .await?;
            let rects: Vec<(u64, Option<[f32; 4]>)> = r["result"]["value"]
                .as_str()
                .and_then(|v| serde_json::from_str(v).ok())
                .unwrap_or_default();
            st.emit(tab, Event::MediaRects(rects));
        }
        Op::MediaEval(expr) => {
            st.c.send(s, "Runtime.evaluate", json!({ "expression": expr }));
        }
        Op::FillLogin { username, password } => {
            let doc =
                st.c.call(s, "Runtime.evaluate", json!({ "expression": "document" }))
                    .await?;
            let object_id = doc["result"]["objectId"]
                .as_str()
                .unwrap_or_default()
                .to_string();
            let args = json!([{ "value": username }, { "value": password.as_str() }]);
            let r = st
                .c
                .call(
                    s,
                    "Runtime.callFunctionOn",
                    json!({ "objectId": object_id, "functionDeclaration": FILL_LOGIN_JS, "arguments": args, "returnByValue": true }),
                )
                .await?;
            let outcome = r["result"]["value"]
                .as_str()
                .unwrap_or("no-form")
                .to_string();
            st.emit(tab, Event::Filled(outcome));
        }
    }
    Ok(())
}

fn command_tab(cmd: &Command) -> Option<TabId> {
    match cmd {
        Command::Tab(tab, _) => Some(*tab),
        Command::Resize { .. } => None,
    }
}

async fn on_event(st: &mut State, ev: Value) {
    let method = ev["method"].as_str().unwrap_or_default();
    let p = &ev["params"];

    if method == "Target.targetCreated" {
        let info = &p["targetInfo"];
        let target = info["targetId"].as_str().unwrap_or_default().to_string();
        if info["type"] != "page"
            || st.own_targets.contains(&target)
            || st.tabs.values().any(|t| t.target == target)
        {
            return;
        }
        let opener = info["openerId"].as_str().and_then(|o| {
            st.tabs
                .iter()
                .find(|(_, t)| t.target == o)
                .map(|(id, _)| *id)
        });
        st.next_popup += 1;
        let tab = st.next_popup;
        // A popup opens in its opener's window.
        if let Some(w) = opener.and_then(|o| st.tab_window.get(&o).copied()) {
            st.tab_window.insert(tab, w);
        }
        if st.attach(tab, target).await.is_ok() {
            let url = info["url"].as_str().unwrap_or("about:blank").to_string();
            st.emit(tab, Event::Opened { url, opener });
        }
        return;
    }

    if method == "Browser.downloadWillBegin" || method == "Browser.downloadProgress" {
        let begin = method == "Browser.downloadWillBegin";
        st.emit(
            0,
            Event::Download {
                guid: p["guid"].as_str().unwrap_or_default().to_string(),
                url: p["url"].as_str().unwrap_or_default().to_string(),
                filename: p["suggestedFilename"]
                    .as_str()
                    .unwrap_or_default()
                    .to_string(),
                state: if begin {
                    "inProgress".to_string()
                } else {
                    p["state"].as_str().unwrap_or_default().to_string()
                },
                path: p["filePath"].as_str().unwrap_or_default().to_string(),
                bytes: p["receivedBytes"].as_u64().unwrap_or(0),
            },
        );
        return;
    }

    let Some(tab) = ev["sessionId"]
        .as_str()
        .and_then(|s| st.by_session.get(s).copied())
    else {
        return;
    };
    match method {
        "Page.frameNavigated" => {
            let frame = &p["frame"];
            if frame.get("parentId").is_none() {
                st.emit(
                    tab,
                    Event::Navigated(frame["url"].as_str().unwrap_or_default().to_string()),
                );
            }
        }
        "Runtime.bindingCalled" if p["name"] == MEDIA_BINDING || p["name"] == MSE_BINDING => {
            if let Ok(v) = serde_json::from_str::<Value>(p["payload"].as_str().unwrap_or_default())
            {
                st.emit(tab, Event::Media(v));
            }
        }
        "Runtime.bindingCalled" if p["name"] == DRM_BINDING => {
            if let Ok(v) = serde_json::from_str::<Value>(p["payload"].as_str().unwrap_or_default())
            {
                let key_system = v["keySystem"].as_str().unwrap_or_default().to_string();
                st.emit(tab, Event::DrmRequested { key_system });
            }
        }
        "Runtime.bindingCalled" if p["name"] == LOGIN_BINDING => {
            // The payload carries a password: parse it here and never log it.
            let payload =
                zeroize::Zeroizing::new(p["payload"].as_str().unwrap_or_default().to_string());
            if let Ok(v) = serde_json::from_str::<Value>(&payload) {
                let password =
                    zeroize::Zeroizing::new(v["password"].as_str().unwrap_or_default().to_string());
                if !password.is_empty() {
                    st.emit(
                        tab,
                        Event::LoginSubmitted {
                            origin: v["origin"].as_str().unwrap_or_default().to_string(),
                            username: v["username"].as_str().unwrap_or_default().to_string(),
                            password,
                        },
                    );
                }
            }
        }
        "Runtime.consoleAPICalled" => {
            let level = match p["type"].as_str().unwrap_or("log") {
                "error" | "assert" => "error",
                "warning" => "warning",
                "info" => "info",
                "debug" => "debug",
                _ => "log",
            };
            let text = p["args"]
                .as_array()
                .map(|a| {
                    a.iter()
                        .map(remote_object_text)
                        .collect::<Vec<_>>()
                        .join(" ")
                })
                .unwrap_or_default();
            st.emit(
                tab,
                Event::Console {
                    level: level.to_string(),
                    text,
                },
            );
        }
        "Runtime.exceptionThrown" => {
            let d = &p["exceptionDetails"];
            let text = d["exception"]["description"]
                .as_str()
                .or(d["text"].as_str())
                .unwrap_or("Uncaught error")
                .to_string();
            st.emit(
                tab,
                Event::Console {
                    level: "error".to_string(),
                    text,
                },
            );
        }
        "Network.requestWillBeSent" => {
            st.emit(
                tab,
                Event::NetRequest {
                    id: p["requestId"].as_str().unwrap_or_default().to_string(),
                    method: p["request"]["method"].as_str().unwrap_or("GET").to_string(),
                    url: p["request"]["url"].as_str().unwrap_or_default().to_string(),
                },
            );
        }
        "Network.responseReceived" => {
            st.emit(
                tab,
                Event::NetResponse {
                    id: p["requestId"].as_str().unwrap_or_default().to_string(),
                    status: p["response"]["status"].as_u64().unwrap_or(0) as u16,
                    mime: p["response"]["mimeType"]
                        .as_str()
                        .unwrap_or_default()
                        .to_string(),
                },
            );
        }
        "Overlay.redrobHighlight" => st.emit(tab, Event::Highlight(p["model"].clone())),
        "Page.navigatedWithinDocument" => {
            if let Some(url) = p["url"].as_str() {
                st.emit(tab, Event::UrlChanged(url.to_string()));
            }
        }
        "Page.domContentEventFired" | "Page.loadEventFired" => {
            let session = st.session(tab);
            let title =
                st.c.call(
                    session.as_deref(),
                    "Runtime.evaluate",
                    json!({ "expression": "document.title", "returnByValue": true }),
                )
                .await;
            if let Ok(v) = title {
                if let Some(t) = v["result"]["value"].as_str() {
                    st.emit(tab, Event::Title(t.to_string()));
                }
            }
            if method == "Page.loadEventFired" {
                st.emit(tab, Event::Loading(false));
                st.c.send(
                    session.as_deref(),
                    "Runtime.evaluate",
                    json!({ "expression": AUTOPLAY_JS }),
                );
            }
        }
        _ => {}
    }
}

async fn step_history(st: &mut State, session: &str, delta: i64) -> anyhow::Result<()> {
    let h =
        st.c.call(Some(session), "Page.getNavigationHistory", json!({}))
            .await?;
    let index = h["currentIndex"].as_i64().unwrap_or(0) + delta;
    if index < 0 {
        return Ok(());
    }
    if let Some(entry) = h["entries"].get(index as usize) {
        st.c.call(
            Some(session),
            "Page.navigateToHistoryEntry",
            json!({ "entryId": entry["id"] }),
        )
        .await?;
    }
    Ok(())
}

/// A Runtime.RemoteObject as console text.
fn remote_object_text(o: &Value) -> String {
    if let Some(v) = o.get("value") {
        return match v {
            Value::String(s) => s.clone(),
            other => other.to_string(),
        };
    }
    if let Some(u) = o.get("unserializableValue").and_then(Value::as_str) {
        return u.to_string();
    }
    o["description"]
        .as_str()
        .map(str::to_string)
        .unwrap_or_else(|| o["type"].as_str().unwrap_or("undefined").to_string())
}
