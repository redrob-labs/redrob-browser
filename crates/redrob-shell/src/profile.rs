//! The profile on disk: bookmarks, history, the last session and settings in
//! one SQLite file, and the engine's cookies and localStorage next to it.
//!
//! Layout under the OS data folder:
//!
//! ```text
//! <data>/redrob-browser/Default/
//!   profile.sqlite   bookmarks, history, session, settings, downloads
//!   engine/          cookies.json and localStorage/, written by the engine
//!   Downloads -> the OS downloads folder, unless the person picked another
//! ```

use std::path::{Path, PathBuf};

use rusqlite::{params, Connection};

use crate::model::{Bookmark, HistoryEntry, Model};

pub struct Profile {
    pub dir: PathBuf,
    db: Connection,
}

/// A tab as it is restored on the next start.
pub struct SavedTab {
    pub url: String,
    pub title: String,
}

impl Profile {
    pub fn open_default() -> anyhow::Result<Self> {
        Self::open(&data_dir().join("redrob-browser").join("Default"))
    }

    pub fn open(dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(dir.join("engine"))?;
        restrict(dir);
        let db = Connection::open(dir.join("profile.sqlite"))?;
        db.execute_batch(
            "PRAGMA journal_mode = WAL;
             PRAGMA synchronous = NORMAL;
             CREATE TABLE IF NOT EXISTS bookmarks (
                 id INTEGER PRIMARY KEY,
                 url TEXT NOT NULL,
                 title TEXT NOT NULL DEFAULT '',
                 folder TEXT NOT NULL DEFAULT '',
                 position INTEGER NOT NULL,
                 added INTEGER NOT NULL
             );
             CREATE TABLE IF NOT EXISTS history (
                 url TEXT PRIMARY KEY,
                 title TEXT NOT NULL DEFAULT '',
                 visits INTEGER NOT NULL DEFAULT 1,
                 last_visit INTEGER NOT NULL
             );
             CREATE INDEX IF NOT EXISTS history_last_visit ON history(last_visit);
             CREATE TABLE IF NOT EXISTS session (
                 position INTEGER PRIMARY KEY,
                 url TEXT NOT NULL,
                 title TEXT NOT NULL DEFAULT '',
                 active INTEGER NOT NULL DEFAULT 0
             );
             CREATE TABLE IF NOT EXISTS settings (
                 key TEXT PRIMARY KEY,
                 value TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS downloads (
                 id INTEGER PRIMARY KEY,
                 url TEXT NOT NULL,
                 path TEXT NOT NULL,
                 bytes INTEGER NOT NULL DEFAULT 0,
                 total INTEGER,
                 state TEXT NOT NULL,
                 started INTEGER NOT NULL
             );",
        )?;
        Ok(Self { dir: dir.to_path_buf(), db })
    }

    /// Where the engine keeps cookies and localStorage for this profile.
    pub fn engine_dir(&self) -> PathBuf {
        self.dir.join("engine")
    }

    /// Bookmarks and the most recent history, into the model.
    pub fn load(&self, model: &mut Model) -> anyhow::Result<()> {
        let mut q = self.db.prepare("SELECT url, title, folder FROM bookmarks ORDER BY folder, position")?;
        model.bookmarks = q
            .query_map([], |r| Ok(Bookmark { url: r.get(0)?, title: r.get(1)?, folder: r.get(2)? }))?
            .collect::<Result<_, _>>()?;
        // Suggestions only need recent and frequent pages; the history page reads the table itself.
        let mut q = self
            .db
            .prepare("SELECT url, title, visits, last_visit FROM history ORDER BY last_visit DESC LIMIT 5000")?;
        model.history = q
            .query_map([], |r| {
                Ok(HistoryEntry { url: r.get(0)?, title: r.get(1)?, visits: r.get(2)?, last_visit: r.get::<_, i64>(3)? as u64 })
            })?
            .collect::<Result<_, _>>()?;
        Ok(())
    }

    pub fn save_bookmarks(&mut self, bookmarks: &[Bookmark]) -> anyhow::Result<()> {
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM bookmarks", [])?;
        let now = crate::model::now() as i64;
        for (i, b) in bookmarks.iter().enumerate() {
            tx.execute(
                "INSERT INTO bookmarks (url, title, folder, position, added) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![b.url, b.title, b.folder, i as i64, now],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    pub fn record_visit(&self, url: &str, title: &str) -> anyhow::Result<()> {
        self.db.execute(
            "INSERT INTO history (url, title, visits, last_visit) VALUES (?1, ?2, 1, ?3)
             ON CONFLICT(url) DO UPDATE SET visits = visits + 1, last_visit = excluded.last_visit,
                 title = CASE WHEN excluded.title = '' THEN title ELSE excluded.title END",
            params![url, title, crate::model::now() as i64],
        )?;
        Ok(())
    }

    /// Merge history from another browser: keep the higher visit count and the later visit.
    pub fn import_history(&mut self, entries: &[HistoryEntry]) -> anyhow::Result<()> {
        let tx = self.db.transaction()?;
        {
            let mut q = tx.prepare(
                "INSERT INTO history (url, title, visits, last_visit) VALUES (?1, ?2, ?3, ?4)
                 ON CONFLICT(url) DO UPDATE SET visits = max(visits, excluded.visits),
                     last_visit = max(last_visit, excluded.last_visit),
                     title = CASE WHEN title = '' THEN excluded.title ELSE title END",
            )?;
            for h in entries {
                q.execute(params![h.url, h.title, h.visits, h.last_visit as i64])?;
            }
        }
        tx.commit()?;
        Ok(())
    }

    pub fn set_history_title(&self, url: &str, title: &str) -> anyhow::Result<()> {
        self.db.execute("UPDATE history SET title = ?2 WHERE url = ?1", params![url, title])?;
        Ok(())
    }

    /// History newest first, for the history page. `query` filters by URL or title.
    pub fn history_page(&self, query: &str, limit: u32, offset: u32) -> anyhow::Result<Vec<HistoryEntry>> {
        let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let mut q = self.db.prepare(
            "SELECT url, title, visits, last_visit FROM history
             WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
             ORDER BY last_visit DESC LIMIT ?2 OFFSET ?3",
        )?;
        let rows = q
            .query_map(params![like, limit, offset], |r| {
                Ok(HistoryEntry { url: r.get(0)?, title: r.get(1)?, visits: r.get(2)?, last_visit: r.get::<_, i64>(3)? as u64 })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    }

    pub fn delete_history(&self, url: &str) -> anyhow::Result<()> {
        self.db.execute("DELETE FROM history WHERE url = ?1", params![url])?;
        Ok(())
    }

    /// Clear history newer than `since` (seconds since the epoch); 0 clears all.
    pub fn clear_history_since(&self, since: u64) -> anyhow::Result<()> {
        self.db.execute("DELETE FROM history WHERE last_visit >= ?1", params![since as i64])?;
        Ok(())
    }

    pub fn save_session(&mut self, model: &Model) -> anyhow::Result<()> {
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM session", [])?;
        for (i, t) in model.tabs.iter().enumerate() {
            if t.agent {
                // Agent tabs belong to the agent's task, not to the person's session.
                continue;
            }
            tx.execute(
                "INSERT INTO session (position, url, title, active) VALUES (?1, ?2, ?3, ?4)",
                params![i as i64, t.url, t.title, (i == model.active) as i64],
            )?;
        }
        tx.commit()?;
        Ok(())
    }

    /// The tabs open when the browser last closed, and which was active.
    pub fn load_session(&self) -> anyhow::Result<(Vec<SavedTab>, usize)> {
        let mut q = self.db.prepare("SELECT url, title, active FROM session ORDER BY position")?;
        let mut active = 0;
        let mut tabs = Vec::new();
        let rows = q.query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, String>(1)?, r.get::<_, i64>(2)?)))?;
        for row in rows {
            let (url, title, is_active) = row?;
            if is_active != 0 {
                active = tabs.len();
            }
            tabs.push(SavedTab { url, title });
        }
        Ok((tabs, active))
    }

    pub fn record_download(&self, d: &crate::model::DownloadItem) -> anyhow::Result<()> {
        self.db.execute(
            "INSERT INTO downloads (url, path, bytes, state, started) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![d.url, d.path, d.bytes as i64, d.state, crate::model::now() as i64],
        )?;
        Ok(())
    }

    pub fn setting(&self, key: &str) -> Option<String> {
        self.db
            .query_row("SELECT value FROM settings WHERE key = ?1", params![key], |r| r.get(0))
            .ok()
    }

    pub fn set_setting(&self, key: &str, value: &str) -> anyhow::Result<()> {
        self.db.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }
}

/// The OS per-user data folder.
pub fn data_dir() -> PathBuf {
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

/// The OS downloads folder.
pub fn downloads_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if let Some(dir) = std::env::var_os("XDG_DOWNLOAD_DIR").map(PathBuf::from).filter(|p| p.is_absolute()) {
        return dir;
    }
    home.join("Downloads")
}

/// The profile holds session cookies: keep other users on the machine out.
fn restrict(dir: &Path) {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(dir, std::fs::Permissions::from_mode(0o700));
    }
    #[cfg(not(unix))]
    let _ = dir;
}
