//! Import from Chrome and other Chromium-family browsers by reading their
//! profile files directly: `Bookmarks` (JSON) and `History` (SQLite).
//!
//! Files are copied before reading, because the browser may be running and
//! holding them locked. Saved passwords and cookies are encrypted with a key
//! the OS keeps; they go through the password vault, not this module.

use std::path::{Path, PathBuf};

use rusqlite::{Connection, OpenFlags};
use serde_json::Value;

use crate::model::{Bookmark, HistoryEntry};

/// Seconds between 1601-01-01 (Chrome's epoch) and 1970-01-01.
const WINDOWS_TO_UNIX_SECS: i64 = 11_644_473_600;

pub struct Source {
    pub name: &'static str,
    pub profile: PathBuf,
}

#[derive(Default)]
pub struct Imported {
    pub bookmarks: Vec<Bookmark>,
    pub history: Vec<HistoryEntry>,
}

/// Chromium-family profiles present on this machine, Chrome first.
pub fn sources() -> Vec<Source> {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_default();
    let candidates: Vec<(&'static str, PathBuf)> = if cfg!(target_os = "macos") {
        let base = home.join("Library").join("Application Support");
        vec![
            ("Chrome", base.join("Google/Chrome")),
            ("Chromium", base.join("Chromium")),
            ("Edge", base.join("Microsoft Edge")),
            ("Brave", base.join("BraveSoftware/Brave-Browser")),
        ]
    } else if cfg!(windows) {
        let local = std::env::var_os("LOCALAPPDATA").map(PathBuf::from).unwrap_or_else(|| home.join("AppData/Local"));
        vec![
            ("Chrome", local.join("Google/Chrome/User Data")),
            ("Chromium", local.join("Chromium/User Data")),
            ("Edge", local.join("Microsoft/Edge/User Data")),
            ("Brave", local.join("BraveSoftware/Brave-Browser/User Data")),
        ]
    } else {
        let config = std::env::var_os("XDG_CONFIG_HOME")
            .map(PathBuf::from)
            .filter(|p| p.is_absolute())
            .unwrap_or_else(|| home.join(".config"));
        vec![
            ("Chrome", config.join("google-chrome")),
            ("Chromium", config.join("chromium")),
            ("Edge", config.join("microsoft-edge")),
            ("Brave", config.join("BraveSoftware/Brave-Browser")),
        ]
    };
    candidates
        .into_iter()
        .map(|(name, dir)| Source { name, profile: dir.join("Default") })
        .filter(|s| s.profile.join("Bookmarks").exists() || s.profile.join("History").exists())
        .collect()
}

/// Read bookmarks and history from `source`, using `scratch` for copies.
pub fn import(source: &Source, scratch: &Path) -> anyhow::Result<Imported> {
    std::fs::create_dir_all(scratch)?;
    let mut out = Imported::default();
    let bookmarks = source.profile.join("Bookmarks");
    if bookmarks.exists() {
        let text = std::fs::read_to_string(&bookmarks)?;
        let json: Value = serde_json::from_str(&text)?;
        let roots = &json["roots"];
        let folder = format!("Imported from {}", source.name);
        // The bookmarks bar stays the bookmarks bar; everything else goes in a folder.
        walk(&roots["bookmark_bar"], "", &mut out.bookmarks);
        walk(&roots["other"], &folder, &mut out.bookmarks);
        walk(&roots["synced"], &format!("{folder}/Mobile"), &mut out.bookmarks);
    }
    let history = source.profile.join("History");
    if history.exists() {
        out.history = read_history(&history, scratch)?;
    }
    Ok(out)
}

fn walk(node: &Value, folder: &str, out: &mut Vec<Bookmark>) {
    let Some(children) = node["children"].as_array() else { return };
    for child in children {
        let name = child["name"].as_str().unwrap_or_default();
        match child["type"].as_str() {
            Some("url") => {
                if let Some(url) = child["url"].as_str() {
                    out.push(Bookmark { url: url.to_string(), title: name.to_string(), folder: folder.to_string() });
                }
            }
            Some("folder") => {
                let path = if folder.is_empty() { name.to_string() } else { format!("{folder}/{name}") };
                walk(child, &path, out);
            }
            _ => {}
        }
    }
}

fn read_history(path: &Path, scratch: &Path) -> anyhow::Result<Vec<HistoryEntry>> {
    let copy = scratch.join("History");
    std::fs::copy(path, &copy)?;
    // A running browser keeps recent writes in the WAL; copy it too when present.
    let wal = path.with_file_name("History-wal");
    let wal_copy = scratch.join("History-wal");
    let _ = std::fs::remove_file(&wal_copy);
    if wal.exists() {
        let _ = std::fs::copy(&wal, &wal_copy);
    }
    let db = Connection::open_with_flags(&copy, OpenFlags::SQLITE_OPEN_READ_WRITE)?;
    let mut q = db.prepare(
        "SELECT url, title, visit_count, last_visit_time FROM urls
         WHERE hidden = 0 AND url LIKE 'http%' ORDER BY last_visit_time DESC LIMIT 50000",
    )?;
    let rows = q
        .query_map([], |r| {
            let micros: i64 = r.get(3)?;
            Ok(HistoryEntry {
                url: r.get(0)?,
                title: r.get(1)?,
                visits: r.get::<_, i64>(2)?.max(1) as u32,
                last_visit: (micros / 1_000_000 - WINDOWS_TO_UNIX_SECS).max(0) as u64,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    drop(q);
    drop(db);
    let _ = std::fs::remove_file(&copy);
    let _ = std::fs::remove_file(&wal_copy);
    let _ = std::fs::remove_file(scratch.join("History-shm"));
    Ok(rows)
}
