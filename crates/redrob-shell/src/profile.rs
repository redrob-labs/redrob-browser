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
    /// The saved group's id (`SavedWindow::groups`).
    pub group: Option<u64>,
}

/// Where a window was on screen, in points: its outer top-left corner and
/// the size of its content area.
#[derive(Clone, Copy, PartialEq, Debug)]
pub struct Bounds {
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// A window as it is restored on the next start.
pub struct SavedWindow {
    pub tabs: Vec<SavedTab>,
    pub active: usize,
    pub bounds: Option<Bounds>,
    pub maximized: bool,
    /// Its tab groups, by the ids its tabs carry.
    pub groups: Vec<crate::model::Group>,
}

/// A window as it is saved: its tabs in strip order and which is active.
pub struct SessionWindow<'a> {
    pub model: &'a Model,
    pub bounds: Option<Bounds>,
    pub maximized: bool,
}

impl Profile {
    pub fn open_default() -> anyhow::Result<Self> {
        Self::open(&default_dir())
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
             CREATE TABLE IF NOT EXISTS session_windows (
                 window INTEGER PRIMARY KEY,
                 x REAL,
                 y REAL,
                 width REAL,
                 height REAL,
                 maximized INTEGER NOT NULL DEFAULT 0
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
        // Profiles from before several windows were saved: every tab is in window 0.
        let has_window: bool = db
            .prepare("SELECT 1 FROM pragma_table_info('session') WHERE name = 'window'")?
            .exists([])?;
        if !has_window {
            db.execute_batch("ALTER TABLE session ADD COLUMN window INTEGER NOT NULL DEFAULT 0")?;
        }
        // Tab groups: each saved tab's group, and the groups' names and colors.
        let has_group: bool = db
            .prepare("SELECT 1 FROM pragma_table_info('session') WHERE name = 'grp'")?
            .exists([])?;
        if !has_group {
            db.execute_batch("ALTER TABLE session ADD COLUMN grp INTEGER")?;
        }
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS session_groups (
                 id INTEGER PRIMARY KEY,
                 window INTEGER NOT NULL,
                 title TEXT NOT NULL DEFAULT '',
                 color TEXT NOT NULL DEFAULT 'grey',
                 collapsed INTEGER NOT NULL DEFAULT 0
             );",
        )?;
        Ok(Self {
            dir: dir.to_path_buf(),
            db,
        })
    }

    /// Bookmarks and the most recent history, into the model.
    pub fn load(&self, model: &mut Model) -> anyhow::Result<()> {
        let mut q = self
            .db
            .prepare("SELECT url, title, folder FROM bookmarks ORDER BY folder, position")?;
        model.bookmarks = q
            .query_map([], |r| {
                Ok(Bookmark {
                    url: r.get(0)?,
                    title: r.get(1)?,
                    folder: r.get(2)?,
                })
            })?
            .collect::<Result<_, _>>()?;
        // Suggestions only need recent and frequent pages; the history page reads the table itself.
        let mut q = self
            .db
            .prepare("SELECT url, title, visits, last_visit FROM history ORDER BY last_visit DESC LIMIT 5000")?;
        model.history = q
            .query_map([], |r| {
                Ok(HistoryEntry {
                    url: r.get(0)?,
                    title: r.get(1)?,
                    visits: r.get(2)?,
                    last_visit: r.get::<_, i64>(3)? as u64,
                })
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
        self.db.execute(
            "UPDATE history SET title = ?2 WHERE url = ?1",
            params![url, title],
        )?;
        Ok(())
    }

    /// History newest first, for the history page. `query` filters by URL or title.
    pub fn history_page(
        &self,
        query: &str,
        limit: u32,
        offset: u32,
    ) -> anyhow::Result<Vec<HistoryEntry>> {
        let like = format!("%{}%", query.replace('%', "\\%").replace('_', "\\_"));
        let mut q = self.db.prepare(
            "SELECT url, title, visits, last_visit FROM history
             WHERE url LIKE ?1 ESCAPE '\\' OR title LIKE ?1 ESCAPE '\\'
             ORDER BY last_visit DESC LIMIT ?2 OFFSET ?3",
        )?;
        let rows = q
            .query_map(params![like, limit, offset], |r| {
                Ok(HistoryEntry {
                    url: r.get(0)?,
                    title: r.get(1)?,
                    visits: r.get(2)?,
                    last_visit: r.get::<_, i64>(3)? as u64,
                })
            })?
            .collect::<Result<_, _>>()?;
        Ok(rows)
    }

    pub fn delete_history(&self, url: &str) -> anyhow::Result<()> {
        self.db
            .execute("DELETE FROM history WHERE url = ?1", params![url])?;
        Ok(())
    }

    /// Clear history newer than `since` (seconds since the epoch); 0 clears all.
    pub fn clear_history_since(&self, since: u64) -> anyhow::Result<()> {
        self.db.execute(
            "DELETE FROM history WHERE last_visit >= ?1",
            params![since as i64],
        )?;
        Ok(())
    }

    /// Save every window with its tabs, their order, the active tab and the
    /// window's place on screen. Positions run across windows, so the order
    /// of windows and of tabs within each comes back as it was.
    pub fn save_session(&mut self, windows: &[SessionWindow<'_>]) -> anyhow::Result<()> {
        let tx = self.db.transaction()?;
        tx.execute("DELETE FROM session", [])?;
        tx.execute("DELETE FROM session_windows", [])?;
        tx.execute("DELETE FROM session_groups", [])?;
        let mut position = 0i64;
        let mut saved_windows = 0i64;
        for w in windows {
            let mut saved_any = false;
            for (i, t) in w.model.tabs.iter().enumerate() {
                if t.agent {
                    // Agent tabs belong to the agent's task, not to the person's session.
                    continue;
                }
                tx.execute(
                    "INSERT INTO session (position, url, title, active, window, grp) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        position,
                        t.url,
                        t.title,
                        (i == w.model.active) as i64,
                        saved_windows,
                        t.group.map(|g| g as i64)
                    ],
                )?;
                position += 1;
                saved_any = true;
            }
            if !saved_any {
                continue;
            }
            for g in &w.model.groups {
                tx.execute(
                    "INSERT OR REPLACE INTO session_groups (id, window, title, color, collapsed) VALUES (?1, ?2, ?3, ?4, ?5)",
                    params![
                        g.id as i64,
                        saved_windows,
                        g.title,
                        g.color.key(),
                        g.collapsed as i64
                    ],
                )?;
            }
            let b = w.bounds;
            tx.execute(
                "INSERT INTO session_windows (window, x, y, width, height, maximized) VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    saved_windows,
                    b.map(|b| b.x as f64),
                    b.map(|b| b.y as f64),
                    b.map(|b| b.width as f64),
                    b.map(|b| b.height as f64),
                    w.maximized as i64
                ],
            )?;
            saved_windows += 1;
        }
        tx.commit()?;
        Ok(())
    }

    /// The windows open when the browser last closed, in order, each with its
    /// tabs and which was active.
    pub fn load_session(&self) -> anyhow::Result<Vec<SavedWindow>> {
        let mut q = self.db.prepare(
            "SELECT url, title, active, window, grp FROM session ORDER BY window, position",
        )?;
        let rows = q.query_map([], |r| {
            Ok((
                r.get::<_, String>(0)?,
                r.get::<_, String>(1)?,
                r.get::<_, i64>(2)?,
                r.get::<_, i64>(3)?,
                r.get::<_, Option<i64>>(4)?,
            ))
        })?;
        let mut windows: Vec<(i64, SavedWindow)> = Vec::new();
        for row in rows {
            let (url, title, is_active, window, group) = row?;
            if windows.last().is_none_or(|(w, _)| *w != window) {
                windows.push((
                    window,
                    SavedWindow {
                        tabs: Vec::new(),
                        active: 0,
                        bounds: None,
                        maximized: false,
                        groups: Vec::new(),
                    },
                ));
            }
            let w = &mut windows.last_mut().expect("just pushed").1;
            if is_active != 0 {
                w.active = w.tabs.len();
            }
            w.tabs.push(SavedTab {
                url,
                title,
                group: group.map(|g| g as u64),
            });
        }
        let mut q = self
            .db
            .prepare("SELECT id, window, title, color, collapsed FROM session_groups")?;
        let rows = q.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, i64>(1)?,
                r.get::<_, String>(2)?,
                r.get::<_, String>(3)?,
                r.get::<_, i64>(4)?,
            ))
        })?;
        for row in rows {
            let (id, window, title, color, collapsed) = row?;
            if let Some((_, w)) = windows.iter_mut().find(|(n, _)| *n == window) {
                w.groups.push(crate::model::Group {
                    id: id as u64,
                    title,
                    color: crate::model::GroupColor::from_key(&color),
                    collapsed: collapsed != 0,
                });
            }
        }
        let mut q = self
            .db
            .prepare("SELECT window, x, y, width, height, maximized FROM session_windows")?;
        let rows = q.query_map([], |r| {
            Ok((
                r.get::<_, i64>(0)?,
                r.get::<_, Option<f64>>(1)?,
                r.get::<_, Option<f64>>(2)?,
                r.get::<_, Option<f64>>(3)?,
                r.get::<_, Option<f64>>(4)?,
                r.get::<_, i64>(5)?,
            ))
        })?;
        for row in rows {
            let (window, x, y, width, height, maximized) = row?;
            if let Some((_, w)) = windows.iter_mut().find(|(id, _)| *id == window) {
                if let (Some(x), Some(y), Some(width), Some(height)) = (x, y, width, height) {
                    w.bounds = Some(Bounds {
                        x: x as f32,
                        y: y as f32,
                        width: width as f32,
                        height: height as f32,
                    });
                }
                w.maximized = maximized != 0;
            }
        }
        Ok(windows.into_iter().map(|(_, w)| w).collect())
    }

    pub fn record_download(&self, d: &crate::model::DownloadItem) -> anyhow::Result<()> {
        self.db.execute(
            "INSERT INTO downloads (url, path, bytes, state, started) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                d.url,
                d.path,
                d.bytes as i64,
                d.state,
                crate::model::now() as i64
            ],
        )?;
        Ok(())
    }

    pub fn setting(&self, key: &str) -> Option<String> {
        self.db
            .query_row(
                "SELECT value FROM settings WHERE key = ?1",
                params![key],
                |r| r.get(0),
            )
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

/// Per-site choices the person made: permissions and zoom. CEF handlers read
/// and write them on CEF's UI thread, so they have their own connection to
/// the profile's database. An incognito window keeps them in memory only.
#[derive(Clone)]
pub struct SiteSettings {
    db: std::sync::Arc<std::sync::Mutex<Connection>>,
}

impl SiteSettings {
    /// The choices saved in the profile at `dir`.
    pub fn open(dir: &Path) -> anyhow::Result<Self> {
        std::fs::create_dir_all(dir)?;
        Self::with(Connection::open(dir.join("profile.sqlite"))?)
    }

    /// Choices that last until the window closes (incognito).
    pub fn memory() -> Self {
        Self::with(Connection::open_in_memory().expect("in-memory SQLite"))
            .expect("in-memory site settings")
    }

    fn with(db: Connection) -> anyhow::Result<Self> {
        db.busy_timeout(std::time::Duration::from_secs(2))?;
        db.execute_batch(
            "CREATE TABLE IF NOT EXISTS site_settings (
                 origin TEXT NOT NULL,
                 key TEXT NOT NULL,
                 value TEXT NOT NULL,
                 PRIMARY KEY (origin, key)
             );",
        )?;
        Ok(Self {
            db: std::sync::Arc::new(std::sync::Mutex::new(db)),
        })
    }

    pub fn get(&self, origin: &str, key: &str) -> Option<String> {
        self.db
            .lock()
            .ok()?
            .query_row(
                "SELECT value FROM site_settings WHERE origin = ?1 AND key = ?2",
                params![origin, key],
                |r| r.get(0),
            )
            .ok()
    }

    /// Every choice saved for `origin` whose key starts with `prefix`.
    pub fn entries(&self, origin: &str, prefix: &str) -> Vec<(String, String)> {
        let Ok(db) = self.db.lock() else {
            return Vec::new();
        };
        let Ok(mut q) = db.prepare(
            "SELECT key, value FROM site_settings WHERE origin = ?1 AND substr(key, 1, length(?2)) = ?2 ORDER BY key",
        ) else {
            return Vec::new();
        };
        q.query_map(params![origin, prefix], |r| Ok((r.get(0)?, r.get(1)?)))
            .map(|rows| rows.flatten().collect())
            .unwrap_or_default()
    }

    /// Save `value`, or forget the choice when it is None.
    pub fn set(&self, origin: &str, key: &str, value: Option<&str>) {
        let Ok(db) = self.db.lock() else {
            return;
        };
        let _ = match value {
            Some(v) => db.execute(
                "INSERT INTO site_settings (origin, key, value) VALUES (?1, ?2, ?3)
                 ON CONFLICT(origin, key) DO UPDATE SET value = excluded.value",
                params![origin, key, v],
            ),
            None => db.execute(
                "DELETE FROM site_settings WHERE origin = ?1 AND key = ?2",
                params![origin, key],
            ),
        };
    }
}

/// The default profile's folder.
pub fn default_dir() -> PathBuf {
    data_dir().join("redrob-browser").join("Default")
}

/// The OS per-user data folder.
pub fn data_dir() -> PathBuf {
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

/// The OS downloads folder.
pub fn downloads_dir() -> PathBuf {
    let home = std::env::var_os("HOME")
        .or_else(|| std::env::var_os("USERPROFILE"))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("."));
    if let Some(dir) = std::env::var_os("XDG_DOWNLOAD_DIR")
        .map(PathBuf::from)
        .filter(|p| p.is_absolute())
    {
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
