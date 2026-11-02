//! `redrob-browser tab ...` and the MCP `window_*` tools against a real
//! Chromium DevTools endpoint, which speaks what the window's CEF tabs do.
//! Skipped when no Chromium is found (`REDROB_TEST_CHROMIUM`, or Playwright's
//! download under ~/.cache/ms-playwright).

use std::io::{BufRead, BufReader, Write};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::Duration;

use serde_json::{json, Value};

const CLI: &str = env!("CARGO_BIN_EXE_redrob-browser");
const PAGE: &str = "data:text/html,<title>form</title><input id=q aria-label=Query>\
<button onclick=\"document.title='clicked:'+document.getElementById('q').value\">Go</button>\
<h1>Hello window</h1>";

struct Chromium {
    child: Child,
    dir: PathBuf,
    ws: String,
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
        .flat_map(|e| ["chrome-linux64/chrome", "chrome-linux/chrome"].map(|b| e.path().join(b)))
        .filter(|p| p.is_file())
        .collect();
    found.sort();
    found.pop()
}

fn chromium(name: &str) -> Option<Chromium> {
    let Some(bin) = binary() else {
        eprintln!("no Chromium binary: skipped");
        return None;
    };
    let dir = PathBuf::from(env!("CARGO_TARGET_TMPDIR"))
        .join(format!("window-tabs-{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
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
        .unwrap();
    let mut c = Chromium {
        child,
        dir,
        ws: String::new(),
    };
    for _ in 0..200 {
        if let Ok(t) = std::fs::read_to_string(c.dir.join("DevToolsActivePort")) {
            let mut lines = t.lines();
            if let (Some(port), Some(path)) = (lines.next(), lines.next()) {
                c.ws = format!("ws://127.0.0.1:{port}{path}");
                return Some(c);
            }
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    panic!("Chromium did not open its DevTools port");
}

fn tab(chrome: &Chromium, args: &[&str]) -> String {
    let out = Command::new(CLI)
        .arg("tab")
        .args(args)
        .env("REDROB_BROWSER_CDP", &chrome.ws)
        .output()
        .unwrap();
    assert!(
        out.status.success(),
        "tab {args:?}: {}",
        String::from_utf8_lossy(&out.stderr)
    );
    String::from_utf8(out.stdout).unwrap()
}

/// The ref of the first outline line with this role.
fn find_ref(outline: &str, role: &str) -> String {
    outline
        .lines()
        .find(|l| l.trim_start().starts_with(&format!("- {role} ")))
        .and_then(|l| l.split("[ref=").nth(1))
        .map(|r| r.trim_end_matches(']').to_string())
        .unwrap_or_else(|| panic!("no {role} in\n{outline}"))
}

#[test]
fn cli_drives_chromium_tabs() {
    let Some(chrome) = chromium("cli") else {
        return;
    };
    let id = tab(&chrome, &["open", PAGE]).trim().to_string();
    assert!(!id.is_empty());
    assert!(tab(&chrome, &["list"]).lines().any(|l| l.starts_with(&id)));

    let outline = tab(&chrome, &["read", &id]);
    assert!(outline.contains("Hello window"), "{outline}");
    let input = find_ref(&outline, "textbox");
    let button = find_ref(&outline, "button");
    tab(&chrome, &["type", &id, &input, "redrob"]);
    tab(&chrome, &["click", &id, &button]);
    assert_eq!(
        tab(&chrome, &["eval", &id, "document.title"]).trim(),
        "\"clicked:redrob\""
    );
    tab(&chrome, &["key", &id, "Tab"]);

    let shot = chrome.dir.join("shot.png");
    tab(&chrome, &["shot", &id, shot.to_str().unwrap()]);
    assert_eq!(&std::fs::read(&shot).unwrap()[..4], b"\x89PNG");

    tab(
        &chrome,
        &[
            "go",
            &id,
            "data:text/html,<title>two</title><p>Second page</p>",
        ],
    );
    assert!(tab(&chrome, &["markdown", &id]).contains("Second page"));

    tab(&chrome, &["close", &id]);
    std::thread::sleep(Duration::from_millis(300));
    assert!(!tab(&chrome, &["list"]).contains(&id));
}

struct Mcp {
    child: Child,
    stdin: std::process::ChildStdin,
    out: BufReader<std::process::ChildStdout>,
    next: u64,
}

impl Mcp {
    fn call(&mut self, method: &str, params: Value) -> Value {
        self.next += 1;
        let msg = json!({ "jsonrpc": "2.0", "id": self.next, "method": method, "params": params });
        writeln!(self.stdin, "{msg}").unwrap();
        self.stdin.flush().unwrap();
        let mut line = String::new();
        self.out.read_line(&mut line).unwrap();
        serde_json::from_str(line.trim()).unwrap()
    }

    fn tool(&mut self, name: &str, args: Value) -> Value {
        let r = self.call("tools/call", json!({ "name": name, "arguments": args }));
        assert_ne!(r["result"]["isError"], true, "{name}: {r}");
        r["result"]["content"][0].clone()
    }
}

impl Drop for Mcp {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

#[test]
fn mcp_drives_chromium_tabs() {
    let Some(chrome) = chromium("mcp") else {
        return;
    };
    let mut child = Command::new(CLI)
        .arg("mcp")
        .env("REDROB_BROWSER_CDP", &chrome.ws)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .unwrap();
    let mut m = Mcp {
        stdin: child.stdin.take().unwrap(),
        out: BufReader::new(child.stdout.take().unwrap()),
        child,
        next: 0,
    };
    m.call(
        "initialize",
        json!({ "protocolVersion": "2024-11-05", "capabilities": {}, "clientInfo": { "name": "t", "version": "0" } }),
    );
    let tools = m.call("tools/list", json!({}));
    let names: Vec<&str> = tools["result"]["tools"]
        .as_array()
        .unwrap()
        .iter()
        .filter_map(|t| t["name"].as_str())
        .collect();
    for n in [
        "window_tab_list",
        "window_snapshot",
        "window_screenshot",
        "window_evaluate",
    ] {
        assert!(names.contains(&n), "{n} missing");
    }

    let id = m.tool("window_tab_open", json!({ "url": PAGE }))["text"]
        .as_str()
        .unwrap()
        .to_string();
    let list = m.tool("window_tab_list", json!({}));
    assert!(list["text"].as_str().unwrap().contains(&id));
    let outline = m.tool("window_snapshot", json!({ "id": id }))["text"]
        .as_str()
        .unwrap()
        .to_string();
    let input: i64 = find_ref(&outline, "textbox").parse().unwrap();
    let button: i64 = find_ref(&outline, "button").parse().unwrap();
    m.tool(
        "window_type",
        json!({ "id": id, "ref": input, "text": "mcp" }),
    );
    m.tool("window_click", json!({ "id": id, "ref": button }));
    let title = m.tool(
        "window_evaluate",
        json!({ "id": id, "expression": "document.title" }),
    );
    assert_eq!(title["text"], "\"clicked:mcp\"");
    let shot = m.tool("window_screenshot", json!({ "id": id }));
    assert_eq!(shot["type"], "image");
    assert!(shot["data"].as_str().unwrap().starts_with("iVBOR"));
    m.tool(
        "window_navigate",
        json!({ "id": id, "url": "data:text/html,<p>Second page</p>" }),
    );
    let md = m.tool("window_markdown", json!({ "id": id }));
    assert!(md["text"].as_str().unwrap().contains("Second page"));
    m.tool("window_tab_close", json!({ "id": id }));
}
