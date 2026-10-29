//! One window process, and so one engine, per profile.
//!
//! The engine gives every CDP connection its own pages (docs/AGENT.md), so
//! windows that should share tabs, cookies and history must share one engine
//! connection, which means one process. The first launch takes the profile's
//! instance lock and starts the engine; a later launch finds the lock held,
//! reads the running process's relay address from the profile folder and asks
//! it to open a window (`Redrob.openWindow`), then exits.
//!
//! The lock is an OS file lock, released by the OS when the process ends for
//! any reason, so a crash never leaves the profile locked.
//!
//! Incognito windows have their own lock and engine, which keeps nothing on
//! disk: they share each other's session and none of the profile's.

use std::path::PathBuf;
use std::time::{Duration, Instant};

use futures_util::{SinkExt, StreamExt};
use serde_json::{json, Value};
use tokio_tungstenite::tungstenite::Message;

pub struct Paths {
    /// Held for the life of the process that owns the engine.
    pub lock: PathBuf,
    /// The relay address that process writes once it listens.
    pub endpoint: PathBuf,
}

pub fn paths(incognito: bool) -> Paths {
    let dir = crate::profile::default_dir();
    if incognito {
        Paths {
            lock: dir.join("incognito.lock"),
            endpoint: dir.join("incognito-endpoint"),
        }
    } else {
        Paths {
            lock: dir.join("instance.lock"),
            endpoint: dir.join("engine").join("ws-endpoint"),
        }
    }
}

pub enum Claim {
    /// This process owns the profile: start the engine. Keep the file open.
    Owner(std::fs::File),
    /// The running process opened the window; this one is done.
    Handed,
}

/// Become the profile's process, or hand `url` (None: a new tab page) to the
/// one that already is.
pub fn claim(paths: &Paths, url: Option<&str>) -> anyhow::Result<Claim> {
    for p in [&paths.lock, &paths.endpoint] {
        if let Some(dir) = p.parent() {
            std::fs::create_dir_all(dir)?;
        }
    }
    // The running process may still be starting its engine: wait for its
    // address for a while, but take over at once if it exits meanwhile.
    let deadline = Instant::now() + Duration::from_secs(30);
    loop {
        let file = std::fs::OpenOptions::new()
            .create(true)
            .truncate(false)
            .write(true)
            .open(&paths.lock)?;
        match file.try_lock() {
            Ok(()) => {
                use std::io::Write;
                let _ = file.set_len(0);
                let _ = writeln!(&file, "{}", std::process::id());
                return Ok(Claim::Owner(file));
            }
            Err(std::fs::TryLockError::WouldBlock) => {}
            Err(std::fs::TryLockError::Error(e)) => {
                return Err(anyhow::anyhow!("lock {}: {e}", paths.lock.display()))
            }
        }
        drop(file);
        if let Ok(addr) = std::fs::read_to_string(&paths.endpoint) {
            match hand_over(addr.trim(), url) {
                Ok(()) => return Ok(Claim::Handed),
                Err(e) if Instant::now() > deadline => {
                    anyhow::bail!("Redrob Browser is already running but did not open a window: {e}")
                }
                Err(_) => {}
            }
        } else if Instant::now() > deadline {
            anyhow::bail!(
                "Redrob Browser is already running but has not published {}",
                paths.endpoint.display()
            );
        }
        std::thread::sleep(Duration::from_millis(200));
    }
}

fn hand_over(addr: &str, url: Option<&str>) -> anyhow::Result<()> {
    let rt = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()?;
    rt.block_on(async {
        let (mut ws, _) = tokio::time::timeout(
            Duration::from_secs(3),
            tokio_tungstenite::connect_async(addr),
        )
        .await??;
        let msg = json!({ "id": 1, "method": "Redrob.openWindow", "params": { "url": url } });
        ws.send(Message::Text(msg.to_string().into())).await?;
        let reply = tokio::time::timeout(Duration::from_secs(10), async {
            while let Some(Ok(m)) = ws.next().await {
                let Message::Text(text) = m else { continue };
                let Ok(v) = serde_json::from_str::<Value>(text.as_str()) else {
                    continue;
                };
                if v["id"] == 1 {
                    return Some(v);
                }
            }
            None
        })
        .await?
        .ok_or_else(|| anyhow::anyhow!("the connection closed"))?;
        let _ = ws.close(None).await;
        if let Some(e) = reply.get("error") {
            anyhow::bail!("{e}");
        }
        Ok(())
    })
}
