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
        let ready =
            std::env::temp_dir().join(format!("redrob-browser-ready-{}.json", std::process::id()));
        let _ = std::fs::remove_file(&ready);

        let child = Command::new(&exe)
            .args([
                "serve",
                "--host",
                "127.0.0.1",
                "--port",
                "0",
                "--storage-dir",
            ])
            .arg(storage)
            .arg("--ready-file")
            .arg(&ready)
            .args(
                system_font_dirs()
                    .into_iter()
                    .flat_map(|d| [std::ffi::OsString::from("--font-dir"), d.into_os_string()]),
            )
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
        let port = v["port"]
            .as_u64()
            .ok_or_else(|| anyhow::anyhow!("ready file has no port"))?;
        let path = v["websocket_path"].as_str().unwrap_or("/devtools/browser");
        Ok(Self {
            child,
            ws_url: format!("ws://{host}:{port}{path}"),
        })
    }
}

impl Drop for Engine {
    fn drop(&mut self) {
        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

fn sibling_binary(name: &str) -> PathBuf {
    let file = if cfg!(windows) {
        format!("{name}.exe")
    } else {
        name.to_string()
    };
    std::env::current_exe()
        .ok()
        .and_then(|p| p.parent().map(|d| d.join(&file)))
        .unwrap_or_else(|| PathBuf::from(file))
}

/// The OS font folders, so pages in Korean, Chinese, Japanese and other
/// scripts the engine's bundled fonts lack render with the system's faces.
fn system_font_dirs() -> Vec<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    let mut dirs: Vec<PathBuf> = Vec::new();
    if cfg!(target_os = "macos") {
        dirs.extend(["/System/Library/Fonts", "/Library/Fonts"].map(PathBuf::from));
        dirs.extend(home.map(|h| h.join("Library/Fonts")));
    } else if cfg!(windows) {
        let windir = std::env::var_os("WINDIR")
            .map(PathBuf::from)
            .unwrap_or_else(|| PathBuf::from("C:\\Windows"));
        dirs.push(windir.join("Fonts"));
        dirs.extend(
            std::env::var_os("LOCALAPPDATA")
                .map(|l| PathBuf::from(l).join("Microsoft\\Windows\\Fonts")),
        );
    } else {
        dirs.extend(["/usr/share/fonts", "/usr/local/share/fonts"].map(PathBuf::from));
        let data = std::env::var_os("XDG_DATA_HOME")
            .map(PathBuf::from)
            .or_else(|| home.as_ref().map(|h| h.join(".local/share")));
        dirs.extend(data.map(|d| d.join("fonts")));
        dirs.extend(home.map(|h| h.join(".fonts")));
    }
    // The engine refuses a folder that does not exist.
    dirs.retain(|d| d.is_dir());
    dirs
}
