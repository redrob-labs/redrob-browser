//! Hand an address-bar prompt (`> ...`) to Redrob Code.
//!
//! Redrob Code runs a local HTTP server (`redrob serve`, default
//! http://127.0.0.1:4096). The window opens a session there and posts the
//! prompt with `prompt_async`, telling the agent which tab the person is on
//! and how to reach this browser. Only loopback addresses are accepted.

use std::io::{Read, Write};
use std::net::TcpStream;
use std::time::Duration;

use serde_json::{json, Value};

pub const DEFAULT_SERVER: &str = "http://127.0.0.1:4096";

/// Returns the Redrob Code session id the prompt went to.
pub fn send_prompt(
    server: &str,
    prompt: &str,
    tab_url: &str,
    tab_title: &str,
) -> anyhow::Result<String> {
    let (host, port) = loopback(server)?;
    let title: String = prompt.chars().take(60).collect();
    let session = post(&host, port, "/session", &json!({ "title": title }))?;
    let id = session["id"]
        .as_str()
        .ok_or_else(|| anyhow::anyhow!("Redrob Code did not return a session"))?
        .to_string();
    let context = format!(
        "The person typed this in Redrob Browser's address bar while on \"{tab_title}\" ({tab_url}).\n\
         Drive the browser with `redrob-browser tab list|open|go|read|click|type|key|scroll|shot|markdown|close`.\n\
         Open your own tabs with `redrob-browser tab open`; they are marked as agent tabs.\n\
         Never ask for or type a password: ask the person to sign in, or use the browser's saved login."
    );
    let body = json!({ "parts": [ { "type": "text", "text": context }, { "type": "text", "text": prompt } ] });
    post(&host, port, &format!("/session/{id}/prompt_async"), &body)?;
    Ok(id)
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

fn post(host: &str, port: u16, path: &str, body: &Value) -> anyhow::Result<Value> {
    let mut s = TcpStream::connect((host.trim_matches(['[', ']']), port)).map_err(|_| {
        anyhow::anyhow!(
            "Redrob Code is not running on {host}:{port}. Start it with `redrob serve`."
        )
    })?;
    s.set_read_timeout(Some(Duration::from_secs(30)))?;
    let text = body.to_string();
    write!(
        s,
        "POST {path} HTTP/1.1\r\nHost: {host}:{port}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{text}",
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
    if !(200..300).contains(&status) {
        anyhow::bail!("Redrob Code answered {status} for {path}");
    }
    let body = if head
        .to_ascii_lowercase()
        .contains("transfer-encoding: chunked")
    {
        dechunk(rest)
    } else {
        rest.to_string()
    };
    Ok(serde_json::from_str(body.trim()).unwrap_or(Value::Null))
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
