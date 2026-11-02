//! Hand an address-bar prompt (`> ...`) to Redrob Code.
//!
//! Redrob Code runs one shared local server per user (`redrob serve
//! --register`). It writes `~/.redrob/run/server.json` with its address and a
//! Basic password drawn fresh on every start, and answers 401 to anyone without
//! it. The window finds that record, or starts the server when none answers,
//! through `redrob-engine-client`, the crate every Rust Redrob app uses for this
//! (`docs/LOCAL-ENGINE-API.md` in redrob-code). It then opens a session there and
//! posts the prompt with `prompt_async`, telling the agent which tab the person
//! is on and how to reach this browser. Only loopback addresses are accepted.
//!
//! A server address set in redrob://settings is used as given; it is
//! authenticated with the shared server's password when it is that server, else
//! with `REDROB_SERVER_PASSWORD` / `REDROB_SERVER_USERNAME`, as `redrob attach`
//! does.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::sync::Mutex;
use std::time::Duration;

use base64::Engine as _;
use serde_json::{json, Value};

/// What the settings field held before the window found the server itself.
/// Treated as "find it automatically", like an empty field.
pub const DEFAULT_SERVER: &str = "http://127.0.0.1:4096";

/// The name the window attaches to the shared server under.
const APP: &str = "browser";
/// Minutes a server the window started stays up once nobody needs it.
const IDLE_EXIT_MINUTES: u32 = 10;

struct Target {
    host: String,
    port: u16,
    /// The `Authorization` header value, if the server needs one.
    auth: Option<String>,
}

/// Returns the Redrob Code session id the prompt went to.
pub fn send_prompt(
    server: &str,
    prompt: &str,
    tab_url: &str,
    tab_title: &str,
) -> anyhow::Result<String> {
    let target = target(server)?;
    let title: String = prompt.chars().take(60).collect();
    let session = post(&target, "/session", &json!({ "title": title }))?;
    let id = session["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Redrob Code did not return a session"))?
        .to_string();
    let context = format!(
        "The person typed this in Redrob Browser's address bar while on \"{tab_title}\" ({tab_url}).\n\
         Drive the browser with `redrob-browser tab list|open|go|read|click|type|key|scroll|eval|shot|markdown|close`.\n\
         Open your own tabs with `redrob-browser tab open`; they are marked as agent tabs.\n\
         Never ask for or type a password: ask the person to sign in, or use the browser's saved login."
    );
    let body = json!({ "parts": [ { "type": "text", "text": context }, { "type": "text", "text": prompt } ] });
    post(&target, &format!("/session/{id}/prompt_async"), &body)?;
    Ok(id)
}

fn automatic(server: &str) -> bool {
    let s = server.trim().trim_end_matches('/');
    s.is_empty() || s == DEFAULT_SERVER
}

fn target(server: &str) -> anyhow::Result<Target> {
    if automatic(server) {
        let record = match redrob_engine_client::current() {
            Some(r) => r,
            None => start()?,
        };
        eprintln!("agent: using the shared Redrob Code server {record}");
        let (host, port) = loopback(&record.url)?;
        stay_attached(&record);
        return Ok(Target {
            host,
            port,
            auth: Some(redrob_engine_client::authorization(&record.secret)),
        });
    }
    let (host, port) = loopback(server)?;
    let shared = redrob_engine_client::read_record()
        .filter(|r| loopback(&r.url).is_ok_and(|(_, p)| p == port));
    let auth = match shared {
        Some(r) => Some(redrob_engine_client::authorization(&r.secret)),
        None => std::env::var("REDROB_SERVER_PASSWORD")
            .ok()
            .filter(|p| !p.is_empty())
            .map(|password| {
                let user = std::env::var("REDROB_SERVER_USERNAME")
                    .ok()
                    .filter(|u| !u.is_empty())
                    .unwrap_or_else(|| "redrob".to_string());
                format!(
                    "Basic {}",
                    base64::engine::general_purpose::STANDARD.encode(format!("{user}:{password}"))
                )
            }),
    };
    eprintln!(
        "agent: using {host}:{port} ({})",
        if auth.is_some() {
            "with a password"
        } else {
            "without a password"
        }
    );
    Ok(Target { host, port, auth })
}

/// Start the shared server: `redrob service start --json`, as
/// `redrob_engine_client::connect_or_start_as` does, but without a console
/// window on Windows.
fn start() -> anyhow::Result<redrob_engine_client::Record> {
    if !redrob_engine_client::installed() {
        anyhow::bail!("{}", redrob_engine_client::Unavailable::NotInstalled);
    }
    let bin = redrob_engine_client::redrob_bin();
    eprintln!("agent: starting Redrob Code with {}", bin.display());
    let mut cmd = std::process::Command::new(&bin);
    cmd.args([
        "service",
        "start",
        "--json",
        "--idle-exit",
        &IDLE_EXIT_MINUTES.to_string(),
    ])
    .env("REDROB_APP", APP)
    .stdin(std::process::Stdio::null());
    let out = crate::startup::no_console(&mut cmd)
        .output()
        .map_err(|e| anyhow::anyhow!("could not run {}: {e}", bin.display()))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        anyhow::bail!(
            "`redrob service start` failed ({}): {}",
            out.status,
            err.trim()
        );
    }
    redrob_engine_client::parse_record_output(&String::from_utf8_lossy(&out.stdout))
        .map_err(|e| anyhow::anyhow!("{e}"))
}

/// Keep the window attached to the shared server (`POST /api/clients` and a
/// heartbeat), so the server does not leave on its idle timer while the agent
/// is still working on a prompt: the agent's own work sends it no requests.
/// The attachment lapses on its own when the window quits.
fn stay_attached(record: &redrob_engine_client::Record) {
    static ATTACHED: Mutex<Option<String>> = Mutex::new(None);
    let Ok(mut current) = ATTACHED.lock() else {
        return;
    };
    if current.as_deref() == Some(record.id.as_str()) {
        return;
    }
    *current = Some(record.id.clone());
    let record = record.clone();
    let _ = std::thread::Builder::new()
        .name("redrob-code-attach".into())
        .spawn(move || {
            let Ok((host, port)) = loopback(&record.url) else {
                return;
            };
            let target = Target {
                host,
                port,
                auth: Some(redrob_engine_client::authorization(&record.secret)),
            };
            let attach = || {
                let body = json!({ "app": APP, "pid": std::process::id() });
                post(&target, "/api/clients", &body).ok().and_then(|c| {
                    Some((
                        c["id"].as_str()?.to_string(),
                        c["ttlMs"].as_u64().unwrap_or(90_000),
                    ))
                })
            };
            let Some((mut id, ttl)) = attach() else {
                return;
            };
            loop {
                std::thread::sleep(Duration::from_millis((ttl / 3).max(5_000)));
                // A restarted server has a new record; its own attach call takes over.
                if ATTACHED.lock().ok().and_then(|g| g.clone()).as_deref() != Some(&record.id) {
                    return;
                }
                if post(&target, &format!("/api/clients/{id}/heartbeat"), &json!({})).is_err() {
                    match attach() {
                        Some((again, _)) => id = again,
                        None => return,
                    }
                }
            }
        });
}

fn loopback(server: &str) -> anyhow::Result<(String, u16)> {
    let u = url::Url::parse(server)?;
    let host = u.host_str().unwrap_or_default().to_string();
    if !matches!(host.as_str(), "127.0.0.1" | "localhost" | "[::1]" | "::1") {
        anyhow::bail!("Redrob Code must be on this machine (got {host})");
    }
    Ok((
        if host == "localhost" {
            "127.0.0.1".to_string()
        } else {
            host
        },
        u.port().unwrap_or(4096),
    ))
}

fn post(t: &Target, path: &str, body: &Value) -> anyhow::Result<Value> {
    let (host, port) = (&t.host, t.port);
    let mut s = TcpStream::connect((host.trim_matches(['[', ']']), port)).map_err(|_| {
        anyhow::anyhow!(
            "Redrob Code is not running on {host}:{port}. Start it with `redrob service start`."
        )
    })?;
    s.set_read_timeout(Some(Duration::from_secs(30)))?;
    let text = body.to_string();
    let auth = t
        .auth
        .as_deref()
        .map(|a| format!("Authorization: {a}\r\n"))
        .unwrap_or_default();
    write!(
        s,
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\n{auth}Content-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
        text.len()
    )?;
    let mut raw = Vec::new();
    s.read_to_end(&mut raw)?;
    let raw = String::from_utf8_lossy(&raw);
    let (head, rest) = raw.split_once("\r\n\r\n").unwrap_or((&raw, ""));
    let status: u16 = head
        .split_whitespace()
        .nth(1)
        .and_then(|c| c.parse().ok())
        .unwrap_or(0);
    let body = if head
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        dechunk(rest)
    } else {
        rest.to_string()
    };
    let body = body.trim();
    // Request bodies carry the person's prompt and tab: log only the size.
    eprintln!(
        "agent: POST {path} ({} bytes) -> {status} ({} bytes)",
        text.len(),
        body.len()
    );
    if !(200..300).contains(&status) {
        let mut why = reason(body);
        if status == 401 {
            why.push_str(if t.auth.is_some() {
                " (the password was refused)"
            } else {
                " (no password was sent: clear the server address in redrob://settings, or set REDROB_SERVER_PASSWORD)"
            });
        }
        eprintln!("agent: {path} answered {status}: {why}");
        anyhow::bail!("Redrob Code answered {status} for {path}: {why}");
    }
    Ok(serde_json::from_str(body).unwrap_or(Value::Null))
}

/// The readable part of an error body: its `message` (or `error.message`,
/// `data.message`) when it is JSON, else the text itself, cut short.
fn reason(body: &str) -> String {
    let v: Value = serde_json::from_str(body).unwrap_or(Value::Null);
    let msg = [
        &v["message"],
        &v["error"]["message"],
        &v["data"]["message"],
        &v["error"],
    ]
    .into_iter()
    .find_map(|m| m.as_str().map(str::to_string));
    let text = msg.unwrap_or_else(|| body.to_string());
    let text = text.trim();
    if text.is_empty() {
        return "no reason given".to_string();
    }
    let short: String = text.chars().take(300).collect();
    if short.len() < text.len() {
        format!("{short}...")
    } else {
        short
    }
}

fn dechunk(mut s: &str) -> String {
    let mut out = String::new();
    while let Some((size, rest)) = s.split_once("\r\n") {
        let n = usize::from_str_radix(size.trim(), 16).unwrap_or(0);
        if n == 0 || rest.len() < n {
            break;
        }
        out.push_str(&rest[..n]);
        s = rest[n..].trim_start_matches("\r\n");
    }
    out
}
