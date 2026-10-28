//! What the window shows: tabs, bookmarks and history. Kept in memory for
//! now; the profile store makes bookmarks and history survive a restart.

use std::time::{SystemTime, UNIX_EPOCH};

use crate::tiles::TileCache;

pub type TabId = u64;

pub struct Tab {
    pub id: TabId,
    pub url: String,
    pub title: String,
    pub loading: bool,
    pub tiles: TileCache,
    /// Document scroll position and size in CSS pixels, as the page last reported them.
    pub scroll: (f32, f32),
    pub content: (f32, f32),
    /// Opened by the agent rather than the person; shown with a marker.
    pub agent: bool,
    pub devtools: crate::devtools::State,
    /// CDP target id, known once the window attached to the tab.
    pub target_id: String,
}

impl Tab {
    pub fn new(id: TabId, url: &str) -> Self {
        Self {
            id,
            url: url.to_string(),
            title: String::new(),
            loading: url != "about:blank",
            tiles: TileCache::default(),
            scroll: (0.0, 0.0),
            content: (0.0, 0.0),
            agent: false,
            devtools: Default::default(),
            target_id: String::new(),
        }
    }

    pub fn label(&self) -> &str {
        if !self.title.is_empty() {
            &self.title
        } else if self.url == "about:blank" {
            ""
        } else {
            &self.url
        }
    }
}

#[derive(Clone)]
pub struct Bookmark {
    pub url: String,
    pub title: String,
    /// Folder path, "" for the bookmarks bar itself.
    pub folder: String,
}

#[derive(Clone)]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub visits: u32,
    /// Seconds since the Unix epoch.
    pub last_visit: u64,
}

pub struct Suggestion {
    pub url: String,
    pub title: String,
    pub kind: SuggestionKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SuggestionKind {
    Typed,
    Bookmark,
    History,
    Search,
}

#[derive(Clone)]
pub struct DownloadItem {
    pub guid: String,
    pub url: String,
    pub filename: String,
    /// inProgress, completed or canceled.
    pub state: String,
    pub path: String,
    pub bytes: u64,
}

#[derive(Default)]
pub struct Model {
    /// Newest last.
    pub downloads: Vec<DownloadItem>,
    pub tabs: Vec<Tab>,
    pub active: usize,
    /// Most recently closed last: (url, title).
    pub closed: Vec<(String, String)>,
    pub bookmarks: Vec<Bookmark>,
    pub history: Vec<HistoryEntry>,
    next_id: TabId,
}

impl Model {
    pub fn alloc_id(&mut self) -> TabId {
        self.next_id += 1;
        self.next_id
    }

    pub fn active_tab(&self) -> Option<&Tab> {
        self.tabs.get(self.active)
    }

    pub fn active_tab_mut(&mut self) -> Option<&mut Tab> {
        self.tabs.get_mut(self.active)
    }

    pub fn tab_mut(&mut self, id: TabId) -> Option<&mut Tab> {
        self.tabs.iter_mut().find(|t| t.id == id)
    }

    pub fn index_of(&self, id: TabId) -> Option<usize> {
        self.tabs.iter().position(|t| t.id == id)
    }

    /// Insert after the active tab, the way people expect a new tab to land.
    pub fn insert_tab(&mut self, tab: Tab, activate: bool) {
        let at = if self.tabs.is_empty() { 0 } else { self.active + 1 };
        self.tabs.insert(at, tab);
        if activate || self.tabs.len() == 1 {
            self.active = at;
        } else if at <= self.active {
            self.active += 1;
        }
    }

    /// Returns the closed tab's id.
    pub fn close_tab(&mut self, index: usize) -> Option<TabId> {
        if index >= self.tabs.len() {
            return None;
        }
        let tab = self.tabs.remove(index);
        if tab.url != "about:blank" {
            self.closed.push((tab.url.clone(), tab.title.clone()));
            if self.closed.len() > 25 {
                self.closed.remove(0);
            }
        }
        if index < self.active {
            self.active -= 1;
        } else if self.active >= self.tabs.len() {
            self.active = self.tabs.len().saturating_sub(1);
        }
        Some(tab.id)
    }

    pub fn move_tab(&mut self, from: usize, to: usize) {
        if from >= self.tabs.len() || to >= self.tabs.len() || from == to {
            return;
        }
        let active_id = self.tabs[self.active].id;
        let tab = self.tabs.remove(from);
        self.tabs.insert(to, tab);
        self.active = self.index_of(active_id).unwrap_or(0);
    }

    pub fn is_bookmarked(&self, url: &str) -> bool {
        self.bookmarks.iter().any(|b| b.url == url)
    }

    pub fn toggle_bookmark(&mut self, url: &str, title: &str) {
        if let Some(i) = self.bookmarks.iter().position(|b| b.url == url) {
            self.bookmarks.remove(i);
        } else if url != "about:blank" {
            self.bookmarks.push(Bookmark { url: url.to_string(), title: title.to_string(), folder: String::new() });
        }
    }

    pub fn record_visit(&mut self, url: &str, title: &str) {
        if url == "about:blank" || url.is_empty() {
            return;
        }
        let now = now();
        if let Some(h) = self.history.iter_mut().find(|h| h.url == url) {
            h.visits += 1;
            h.last_visit = now;
            if !title.is_empty() {
                h.title = title.to_string();
            }
        } else {
            self.history.push(HistoryEntry { url: url.to_string(), title: title.to_string(), visits: 1, last_visit: now });
        }
    }

    pub fn set_history_title(&mut self, url: &str, title: &str) {
        if let Some(h) = self.history.iter_mut().find(|h| h.url == url) {
            h.title = title.to_string();
        }
    }

    /// Address bar suggestions for `input`: bookmarks first, then history by
    /// visits and recency, then a search. At most `limit`.
    pub fn suggest(&self, input: &str, limit: usize) -> Vec<Suggestion> {
        let q = input.trim().to_lowercase();
        let mut out = Vec::new();
        if q.is_empty() {
            return out;
        }
        let matches = |url: &str, title: &str| {
            let u = url.to_lowercase();
            let u = u.trim_start_matches("https://").trim_start_matches("http://").trim_start_matches("www.");
            u.starts_with(&q) || u.contains(&q) || title.to_lowercase().contains(&q)
        };
        for b in &self.bookmarks {
            if out.len() < limit && matches(&b.url, &b.title) {
                out.push(Suggestion { url: b.url.clone(), title: b.title.clone(), kind: SuggestionKind::Bookmark });
            }
        }
        let mut hist: Vec<&HistoryEntry> = self
            .history
            .iter()
            .filter(|h| matches(&h.url, &h.title) && !out.iter().any(|s| s.url == h.url))
            .collect();
        hist.sort_by(|a, b| b.visits.cmp(&a.visits).then(b.last_visit.cmp(&a.last_visit)));
        for h in hist {
            if out.len() + 1 >= limit {
                break;
            }
            out.push(Suggestion { url: h.url.clone(), title: h.title.clone(), kind: SuggestionKind::History });
        }
        out.push(Suggestion { url: search_url(input), title: input.trim().to_string(), kind: SuggestionKind::Search });
        out
    }
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

/// Address field text to a URL: a URL as typed, a bare host gets https, anything else is a search.
pub fn to_url(input: &str) -> String {
    let s = input.trim();
    if s.contains("://") || s.starts_with("about:") || s.starts_with("redrob:") {
        return s.to_string();
    }
    let host = s.split('/').next().unwrap_or("");
    if !s.contains(' ') && (host.contains('.') || host.starts_with("localhost")) {
        return format!("https://{s}");
    }
    search_url(s)
}

/// (id, name, URL with {q}) the person can choose in settings.
pub const SEARCH_ENGINES: &[(&str, &str, &str)] = &[
    ("duckduckgo", "DuckDuckGo", "https://duckduckgo.com/html/?q={q}"),
    ("google", "Google", "https://www.google.com/search?q={q}"),
    ("naver", "Naver", "https://search.naver.com/search.naver?query={q}"),
    ("bing", "Bing", "https://www.bing.com/search?q={q}"),
];

static SEARCH: std::sync::RwLock<&str> = std::sync::RwLock::new("https://duckduckgo.com/html/?q={q}");

pub fn set_search_engine(id: &str) {
    if let Some((_, _, url)) = SEARCH_ENGINES.iter().find(|(i, _, _)| *i == id) {
        if let Ok(mut s) = SEARCH.write() {
            *s = url;
        }
    }
}

pub fn search_url(q: &str) -> String {
    let template = SEARCH.read().map(|s| *s).unwrap_or(SEARCH_ENGINES[0].2);
    let q: String = q
        .trim()
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    template.replace("{q}", &q)
}
