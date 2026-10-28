//! Starts the engine as a child process and learns where its CDP server listens.
//!
//! The window is a CDP client of the engine, the same way an agent is. Every
//! action a person takes in the window goes through the protocol an agent
//! uses, so nothing a person can do is out of the agent's reach.

use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::time::{Duration, Instant};

pub struct Engine {
    child: Child,
    pub ws_url: String,
}

impl Engine {
    /// Spawn `redrob-browser serve` next to this binary on a free loopback port,
    /// keeping cookies and localStorage in `storage`.
    pub fn start(storage: &std::path::Path) -> anyhow::Result<Self> {
        let exe = sibling_binary("redrob-browser");
        let ready = std::env::temp_dir().join(format!("redrob-browser-ready-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&ready);

        let child = Command::new(&exe)
            .args(["serve", "--host", "127.0.0.1", "--port", "0", "--storage-dir"])
            .arg(storage)
            .arg("--ready-file")
            .arg(&ready)
            .stdin(Stdio::null())
            .stdout(Stdio::null())
            .stderr(Stdio::inherit())
            .spawn()
            .map_err(|e| anyhow::anyhow!("start engine {}: {e}", exe.display()))?;

        let deadline = Instant::now() + Duration::from_secs(20);
        let record = loop {
            if let Ok(bytes) = std::fs::read(&ready) {
                break bytes;
            }
            if Instant::now() > deadline {
                anyhow::bail!("engine did not report ready within 20s");
            }
            std::thread::sleep(Duration::from_millis(50));
        };
        let _ = std::fs::remove_file(&ready);

        let v: serde_json::Value = serde_json::from_slice(&record)?;
        let host = v["host"].as_str().unwrap_or("127.0.0.1");
        let port = v["port"].as_u64().ok_or_else(|| anyhow::anyhow!("ready file has no port"))?;
        let path = v["websocket_path"].as_str().unwrap_or("/devtools/browser");
        Ok(Self { child, ws_url: format!("ws://{host}:{port}{path}") })
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn sibling_binary(name: &str) -> PathBuf {
    let file = if cfg!(windows) { format!("{name}.exe") } else { name.to_string() };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(&file)))
        .unwrap_or_else(|| PathBuf::from(file))
}
