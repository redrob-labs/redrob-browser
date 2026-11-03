//! What the window shows: tabs, bookmarks and history. Kept in memory for
//! now; the profile store makes bookmarks and history survive a restart.

use std::time::{SystemTime, UNIX_EPOCH};

pub type TabId = u64;

/// A tab group, unique across every window of the process (a group keeps
/// its id when it moves to another window).
pub type GroupId = u64;

/// Chrome's tab group colors, in its order.
#[derive(Clone, Copy, PartialEq, Eq, Debug, Hash)]
pub enum GroupColor {
    Grey,
    Blue,
    Red,
    Yellow,
    Green,
    Pink,
    Purple,
    Cyan,
    Orange,
}

impl GroupColor {
    pub const ALL: [GroupColor; 9] = [
        GroupColor::Grey,
        GroupColor::Blue,
        GroupColor::Red,
        GroupColor::Yellow,
        GroupColor::Green,
        GroupColor::Pink,
        GroupColor::Purple,
        GroupColor::Cyan,
        GroupColor::Orange,
    ];

    /// What the session saves.
    pub fn key(self) -> &'static str {
        match self {
            GroupColor::Grey => "grey",
            GroupColor::Blue => "blue",
            GroupColor::Red => "red",
            GroupColor::Yellow => "yellow",
            GroupColor::Green => "green",
            GroupColor::Pink => "pink",
            GroupColor::Purple => "purple",
            GroupColor::Cyan => "cyan",
            GroupColor::Orange => "orange",
        }
    }

    pub fn from_key(key: &str) -> Self {
        Self::ALL
            .into_iter()
            .find(|c| c.key() == key)
            .unwrap_or(GroupColor::Grey)
    }

    /// The name shown in the group editor (English; i18n translates).
    pub fn name(self) -> &'static str {
        match self {
            GroupColor::Grey => "Grey",
            GroupColor::Blue => "Blue",
            GroupColor::Red => "Red",
            GroupColor::Yellow => "Yellow",
            GroupColor::Green => "Green",
            GroupColor::Pink => "Pink",
            GroupColor::Purple => "Purple",
            GroupColor::Cyan => "Cyan",
            GroupColor::Orange => "Orange",
        }
    }

    /// Chrome's colors for a light and a dark window.
    pub fn rgb(self, dark: bool) -> [u8; 3] {
        match (self, dark) {
            (GroupColor::Grey, false) => [0x5f, 0x63, 0x68],
            (GroupColor::Blue, false) => [0x1a, 0x73, 0xe8],
            (GroupColor::Red, false) => [0xd9, 0x30, 0x25],
            (GroupColor::Yellow, false) => [0xe3, 0x74, 0x00],
            (GroupColor::Green, false) => [0x18, 0x80, 0x38],
            (GroupColor::Pink, false) => [0xd0, 0x18, 0x84],
            (GroupColor::Purple, false) => [0xa1, 0x42, 0xf4],
            (GroupColor::Cyan, false) => [0x00, 0x7b, 0x83],
            (GroupColor::Orange, false) => [0xfa, 0x90, 0x3e],
            (GroupColor::Grey, true) => [0xda, 0xdc, 0xe0],
            (GroupColor::Blue, true) => [0x8a, 0xb4, 0xf8],
            (GroupColor::Red, true) => [0xf2, 0x8b, 0x82],
            (GroupColor::Yellow, true) => [0xfd, 0xd6, 0x63],
            (GroupColor::Green, true) => [0x81, 0xc9, 0x95],
            (GroupColor::Pink, true) => [0xff, 0x8b, 0xcb],
            (GroupColor::Purple, true) => [0xd7, 0xae, 0xfb],
            (GroupColor::Cyan, true) => [0x78, 0xd9, 0xec],
            (GroupColor::Orange, true) => [0xfc, 0xad, 0x70],
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct Group {
    pub id: GroupId,
    pub title: String,
    pub color: GroupColor,
    /// Only the group's chip shows in the strip.
    pub collapsed: bool,
}

/// Something closed that Ctrl+Shift+T brings back: a tab, or a whole group.
#[derive(Clone, Debug, PartialEq)]
pub enum Closed {
    Tab {
        url: String,
        title: String,
    },
    Group {
        title: String,
        color: GroupColor,
        tabs: Vec<(String, String)>,
    },
}

pub struct Tab {
    pub id: TabId,
    pub url: String,
    pub title: String,
    pub loading: bool,
    /// Opened by the agent rather than the person; shown with a marker.
    pub agent: bool,
    /// Chromium's DevTools target id, known once the tab's browser exists.
    pub target_id: String,
    /// The tab group it is in. A group's tabs sit next to each other.
    pub group: Option<GroupId>,
}

impl Tab {
    pub fn new(id: TabId, url: &str) -> Self {
        Self {
            id,
            url: url.to_string(),
            title: String::new(),
            loading: url != "about:blank",
            agent: false,
            target_id: String::new(),
            group: None,
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

/// The folder of "Other bookmarks", Chrome's second root: bookmarks not on
/// the bar. Its subfolders are `"{OTHER}/name"`.
pub const OTHER: &str = "\u{1}other";

/// Whether `folder` is "Other bookmarks" or inside it.
pub fn is_other(folder: &str) -> bool {
    folder == OTHER || folder.starts_with(&format!("{OTHER}/"))
}

/// A folder path as people read it: its root's name for the roots.
pub fn folder_label(folder: &str) -> String {
    let other = crate::i18n::t("Other bookmarks");
    if folder.is_empty() {
        crate::i18n::t("Bookmarks bar").to_string()
    } else if let Some(rest) = folder.strip_prefix(OTHER) {
        format!("{other}{rest}")
    } else {
        folder.to_string()
    }
}

#[derive(Clone)]
pub struct HistoryEntry {
    pub url: String,
    pub title: String,
    pub visits: u32,
    /// Seconds since the Unix epoch.
    pub last_visit: u64,
}

#[derive(Clone)]
pub struct Suggestion {
    pub url: String,
    pub title: String,
    pub kind: SuggestionKind,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum SuggestionKind {
    /// The address as typed.
    Url,
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
    /// Most recently closed last.
    pub closed: Vec<Closed>,
    pub bookmarks: Vec<Bookmark>,
    pub history: Vec<HistoryEntry>,
    /// This window's tab groups.
    pub groups: Vec<Group>,
}

/// Tab ids are unique across every window of the process, so a tab keeps its
/// id (and its engine session) when it moves to another window.
static NEXT_TAB_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static NEXT_GROUP_ID: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);

/// How many closed tabs and groups Ctrl+Shift+T remembers.
const MAX_CLOSED: usize = 25;

pub fn alloc_group_id() -> GroupId {
    NEXT_GROUP_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1
}

impl Model {
    pub fn alloc_id(&mut self) -> TabId {
        NEXT_TAB_ID.fetch_add(1, std::sync::atomic::Ordering::Relaxed) + 1
    }

    pub fn remember_closed(&mut self, c: Closed) {
        self.closed.push(c);
        if self.closed.len() > MAX_CLOSED {
            self.closed.remove(0);
        }
    }

    /// Take a tab out to hand it to another window. Unlike [`Model::close_tab`]
    /// it is not remembered as closed. A group it leaves empty goes too.
    pub fn take_tab(&mut self, index: usize) -> Option<Tab> {
        if index >= self.tabs.len() {
            return None;
        }
        let tab = self.tabs.remove(index);
        if index < self.active {
            self.active -= 1;
        } else if self.active >= self.tabs.len() {
            self.active = self.tabs.len().saturating_sub(1);
        }
        self.prune_groups();
        Some(tab)
    }

    pub fn group(&self, id: GroupId) -> Option<&Group> {
        self.groups.iter().find(|g| g.id == id)
    }

    pub fn group_mut(&mut self, id: GroupId) -> Option<&mut Group> {
        self.groups.iter_mut().find(|g| g.id == id)
    }

    /// Where the group's tabs are in the strip.
    pub fn group_range(&self, id: GroupId) -> Option<std::ops::Range<usize>> {
        let first = self.tabs.iter().position(|t| t.group == Some(id))?;
        let len = self.tabs[first..]
            .iter()
            .take_while(|t| t.group == Some(id))
            .count();
        Some(first..first + len)
    }

    /// Whether the tab at `index` shows in the strip (not in a collapsed group).
    pub fn tab_shown(&self, index: usize) -> bool {
        self.tabs
            .get(index)
            .and_then(|t| t.group)
            .and_then(|g| self.group(g))
            .is_none_or(|g| !g.collapsed)
    }

    /// Groups without tabs go, as in Chrome.
    pub fn prune_groups(&mut self) {
        let tabs = &self.tabs;
        self.groups
            .retain(|g| tabs.iter().any(|t| t.group == Some(g.id)));
    }

    /// The color for a new group: the one fewest groups use, Chrome's way.
    fn next_color(&self) -> GroupColor {
        GroupColor::ALL
            .into_iter()
            .min_by_key(|c| self.groups.iter().filter(|g| g.color == *c).count())
            .unwrap_or(GroupColor::Grey)
    }

    /// Put the tabs at `indices` in a new group, together where the first
    /// of them is. Returns the group.
    pub fn new_group(&mut self, indices: &[usize]) -> Option<GroupId> {
        let mut indices: Vec<usize> = indices
            .iter()
            .copied()
            .filter(|i| *i < self.tabs.len())
            .collect();
        indices.sort_unstable();
        indices.dedup();
        let first = *indices.first()?;
        let id = alloc_group_id();
        let color = self.next_color();
        self.groups.push(Group {
            id,
            title: String::new(),
            color,
            collapsed: false,
        });
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let mut taken = Vec::new();
        for i in indices.iter().rev() {
            taken.push(self.tabs.remove(*i));
        }
        taken.reverse();
        // A group never splits another one: land after the group the first
        // tab sat in, when it was in the middle of one.
        let mut at = first.min(self.tabs.len());
        while at > 0
            && at < self.tabs.len()
            && self.tabs[at].group.is_some()
            && self.tabs[at].group == self.tabs[at - 1].group
        {
            at += 1;
        }
        for (k, mut t) in taken.into_iter().enumerate() {
            t.group = Some(id);
            self.tabs.insert(at + k, t);
        }
        if let Some(a) = active_id.and_then(|a| self.index_of(a)) {
            self.active = a;
        }
        self.prune_groups();
        Some(id)
    }

    /// A group made from tabs just opened (bookmarks, history): `title` and
    /// the tabs `ids`, which must sit together already.
    pub fn group_tabs(&mut self, ids: &[TabId], title: &str) -> Option<GroupId> {
        let indices: Vec<usize> = ids.iter().filter_map(|id| self.index_of(*id)).collect();
        let g = self.new_group(&indices)?;
        if let Some(group) = self.group_mut(g) {
            group.title = title.to_string();
        }
        Some(g)
    }

    /// Move the tab at `index` to the end of group `g` and into it.
    pub fn add_to_group(&mut self, index: usize, g: GroupId) {
        if index >= self.tabs.len() || self.group(g).is_none() {
            return;
        }
        if self.tabs[index].group == Some(g) {
            return;
        }
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let mut tab = self.tabs.remove(index);
        tab.group = Some(g);
        let at = self.group_range(g).map_or(self.tabs.len(), |r| r.end);
        self.tabs.insert(at, tab);
        if let Some(a) = active_id.and_then(|a| self.index_of(a)) {
            self.active = a;
        }
        self.prune_groups();
    }

    /// Take the tab at `index` out of its group, to just after the group.
    pub fn remove_from_group(&mut self, index: usize) {
        let Some(g) = self.tabs.get(index).and_then(|t| t.group) else {
            return;
        };
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let mut tab = self.tabs.remove(index);
        tab.group = None;
        let at = self.group_range(g).map_or(index, |r| r.end);
        self.tabs.insert(at.min(self.tabs.len()), tab);
        if let Some(a) = active_id.and_then(|a| self.index_of(a)) {
            self.active = a;
        }
        self.prune_groups();
    }

    /// Every tab of `g` leaves it; the group goes.
    pub fn ungroup(&mut self, g: GroupId) {
        for t in &mut self.tabs {
            if t.group == Some(g) {
                t.group = None;
            }
        }
        self.groups.retain(|x| x.id != g);
    }

    /// Collapse or expand group `g`. Collapsing a group with the tab on
    /// screen moves to the nearest tab outside it; false when there is
    /// none (the window opens a new tab, as Chrome does).
    pub fn set_collapsed(&mut self, g: GroupId, collapsed: bool) -> bool {
        let Some(group) = self.group_mut(g) else {
            return true;
        };
        group.collapsed = collapsed;
        if !collapsed || self.tabs.get(self.active).and_then(|t| t.group) != Some(g) {
            return true;
        }
        let Some(r) = self.group_range(g) else {
            return true;
        };
        let after = (r.end..self.tabs.len()).find(|i| self.tab_shown(*i));
        let before = (0..r.start).rev().find(|i| self.tab_shown(*i));
        match after.or(before) {
            Some(i) => {
                self.active = i;
                true
            }
            None => false,
        }
    }

    /// The tab after (or before, `back`) the active one that shows in the
    /// strip, for Ctrl+Tab and Ctrl+Shift+Tab.
    pub fn next_shown(&self, back: bool) -> Option<usize> {
        let n = self.tabs.len();
        (1..n)
            .map(|k| {
                if back {
                    (self.active + n - k) % n
                } else {
                    (self.active + k) % n
                }
            })
            .find(|i| self.tab_shown(*i))
    }

    /// Move group `g`'s tabs so the first lands at `to` (an index in the
    /// strip without the group's tabs).
    pub fn move_group(&mut self, g: GroupId, to: usize) {
        let Some(r) = self.group_range(g) else {
            return;
        };
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let block: Vec<Tab> = self.tabs.drain(r).collect();
        let mut at = to.min(self.tabs.len());
        // Never inside another group.
        while at > 0
            && at < self.tabs.len()
            && self.tabs[at].group.is_some()
            && self.tabs[at].group == self.tabs[at - 1].group
        {
            at += 1;
        }
        for (k, t) in block.into_iter().enumerate() {
            self.tabs.insert(at + k, t);
        }
        if let Some(a) = active_id.and_then(|a| self.index_of(a)) {
            self.active = a;
        }
    }

    /// Take group `g` and its tabs out, to hand them to another window.
    pub fn take_group(&mut self, g: GroupId) -> Option<(Group, Vec<Tab>)> {
        let r = self.group_range(g)?;
        let group = self.group(g)?.clone();
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let tabs: Vec<Tab> = self.tabs.drain(r.clone()).collect();
        self.groups.retain(|x| x.id != g);
        self.active = match active_id.and_then(|a| self.index_of(a)) {
            Some(a) => a,
            None => r.start.min(self.tabs.len().saturating_sub(1)),
        };
        Some((group, tabs))
    }

    /// Put a group from another window in at `at`, its first tab active
    /// when `activate`.
    pub fn insert_group(&mut self, group: Group, tabs: Vec<Tab>, at: usize, activate: bool) {
        let mut at = at.min(self.tabs.len());
        while at > 0
            && at < self.tabs.len()
            && self.tabs[at].group.is_some()
            && self.tabs[at].group == self.tabs[at - 1].group
        {
            at += 1;
        }
        let active_id = self.tabs.get(self.active).map(|t| t.id);
        let first = tabs.first().map(|t| t.id);
        let g = group.id;
        if !self.groups.iter().any(|x| x.id == g) {
            self.groups.push(group);
        }
        for (k, mut t) in tabs.into_iter().enumerate() {
            t.group = Some(g);
            self.tabs.insert(at + k, t);
        }
        let want = if activate { first } else { active_id };
        if let Some(a) = want
            .and_then(|a| self.index_of(a))
            .or(first.and_then(|a| self.index_of(a)))
        {
            self.active = a;
        }
    }

    /// Put a tab from another window in at `at`, active, joining the group
    /// it lands inside of (if any).
    pub fn insert_tab_at(&mut self, mut tab: Tab, at: usize) {
        let at = at.min(self.tabs.len());
        tab.group = None;
        self.tabs.insert(at, tab);
        self.active = at;
        self.regroup(at);
    }

    /// Chrome's rule for a tab dropped at `index`: between two tabs of one
    /// group it joins that group; next to its own group's tabs it stays in
    /// it; anywhere else it is in none.
    pub fn regroup(&mut self, index: usize) {
        let Some(own) = self.tabs.get(index).map(|t| t.group) else {
            return;
        };
        let left = index
            .checked_sub(1)
            .and_then(|i| self.tabs.get(i))
            .and_then(|t| t.group);
        let right = self.tabs.get(index + 1).and_then(|t| t.group);
        let group = if left.is_some() && left == right {
            left
        } else if own.is_some() && (own == left || own == right) {
            own
        } else {
            None
        };
        self.set_tab_group(index, group);
    }

    fn set_tab_group(&mut self, index: usize, group: Option<GroupId>) {
        self.tabs[index].group = group;
        // Dropped into a collapsed group: it opens, the tab shows.
        if let Some(g) = group.and_then(|g| self.group_mut(g)) {
            g.collapsed = false;
        }
        self.prune_groups();
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
        let at = if self.tabs.is_empty() {
            0
        } else {
            self.active + 1
        };
        let mut tab = tab;
        // Opened from a grouped tab, it joins the group (Chrome's rule for
        // links), which also keeps the group's tabs together.
        tab.group = self.tabs.get(self.active).and_then(|t| t.group);
        if let Some(g) = tab.group.and_then(|g| self.group_mut(g)) {
            g.collapsed = false;
        }
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
            self.remember_closed(Closed::Tab {
                url: tab.url.clone(),
                title: tab.title.clone(),
            });
        }
        if index < self.active {
            self.active -= 1;
        } else if self.active >= self.tabs.len() {
            self.active = self.tabs.len().saturating_sub(1);
        }
        self.prune_groups();
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

    /// Move one tab and decide its group by where it landed.
    pub fn move_tab_regroup(&mut self, from: usize, to: usize) {
        self.move_tab(from, to);
        if to < self.tabs.len() {
            self.regroup(to);
        }
    }

    pub fn is_bookmarked(&self, url: &str) -> bool {
        self.bookmarks.iter().any(|b| b.url == url)
    }

    pub fn toggle_bookmark(&mut self, url: &str, title: &str) {
        if let Some(i) = self.bookmarks.iter().position(|b| b.url == url) {
            self.bookmarks.remove(i);
        } else if url != "about:blank" {
            self.bookmarks.push(Bookmark {
                url: url.to_string(),
                title: title.to_string(),
                folder: String::new(),
            });
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
            self.history.push(HistoryEntry {
                url: url.to_string(),
                title: title.to_string(),
                visits: 1,
                last_visit: now,
            });
        }
    }

    pub fn set_history_title(&mut self, url: &str, title: &str) {
        if let Some(h) = self.history.iter_mut().find(|h| h.url == url) {
            h.title = title.to_string();
        }
    }

    /// Address bar suggestions for `input` (see [`SuggestIndex::suggest`]).
    #[cfg(test)]
    pub fn suggest(&self, input: &str, limit: usize) -> Vec<Suggestion> {
        SuggestIndex::new(self).suggest(input, limit)
    }

    /// Forget a history entry (Shift+Delete on an address bar suggestion).
    pub fn remove_history(&mut self, url: &str) {
        self.history.retain(|h| h.url != url);
    }
}

/// Bookmarks and history ready for the address bar to search as the
/// person types: lowercased once, history in the order rows are offered
/// (visits, then the last visit). Made when the address bar takes the
/// keyboard, so a letter typed costs one pass over it that stops at the
/// first rows that fit, not lowercasing and sorting every row.
pub struct SuggestIndex {
    bookmarks: Vec<IndexRow>,
    history: Vec<IndexRow>,
}

struct IndexRow {
    url: String,
    title: String,
    /// The address lowercased, without its scheme and `www.`.
    url_key: String,
    title_key: String,
}

impl IndexRow {
    fn new(url: &str, title: &str) -> Self {
        let u = url.to_lowercase();
        let url_key = u
            .trim_start_matches("https://")
            .trim_start_matches("http://")
            .trim_start_matches("www.")
            .to_string();
        IndexRow {
            url: url.to_string(),
            title: title.to_string(),
            url_key,
            title_key: title.to_lowercase(),
        }
    }

    fn matches(&self, q: &str) -> bool {
        self.url_key.contains(q) || self.title_key.contains(q)
    }
}

impl SuggestIndex {
    pub fn new(model: &Model) -> Self {
        let mut history: Vec<&HistoryEntry> = model.history.iter().collect();
        history.sort_by(|a, b| {
            b.visits
                .cmp(&a.visits)
                .then(b.last_visit.cmp(&a.last_visit))
        });
        SuggestIndex {
            bookmarks: model
                .bookmarks
                .iter()
                .map(|b| IndexRow::new(&b.url, &b.title))
                .collect(),
            history: history
                .into_iter()
                .map(|h| IndexRow::new(&h.url, &h.title))
                .collect(),
        }
    }

    /// A history row went (Shift+Delete).
    pub fn remove_history(&mut self, url: &str) {
        self.history.retain(|h| h.url != url);
    }

    /// Address bar suggestions for `input`, as Chrome orders them: what was
    /// typed first (a search, or the address when it is one), then
    /// bookmarks, then history by visits and recency, and the search last
    /// when the first row is the address. At most `limit`.
    pub fn suggest(&self, input: &str, limit: usize) -> Vec<Suggestion> {
        crate::trace::time("suggest", || self.suggest_untimed(input, limit))
    }

    fn suggest_untimed(&self, input: &str, limit: usize) -> Vec<Suggestion> {
        let q = input.trim().to_lowercase();
        let mut out = Vec::new();
        if q.is_empty() || limit == 0 {
            return out;
        }
        let typed = to_url(input);
        let search = Suggestion {
            url: search_url(input),
            title: input.trim().to_string(),
            kind: SuggestionKind::Search,
        };
        let is_search = typed == search.url;
        let (first, last) = if is_search {
            (search, None)
        } else {
            let url = Suggestion {
                url: typed.clone(),
                title: String::new(),
                kind: SuggestionKind::Url,
            };
            (url, Some(search))
        };
        out.push(first);
        // Room left for the rows that match.
        let room = limit.saturating_sub(1 + usize::from(last.is_some()));
        let mut rows: Vec<Suggestion> = Vec::new();
        let picked = |rows: &[Suggestion], kind, list: &[IndexRow], room: usize| {
            let mut add = Vec::new();
            for r in list {
                if rows.len() + add.len() >= room {
                    break;
                }
                if r.url != typed
                    && r.matches(&q)
                    && !rows.iter().any(|s: &Suggestion| s.url == r.url)
                {
                    add.push(Suggestion {
                        url: r.url.clone(),
                        title: r.title.clone(),
                        kind,
                    });
                }
            }
            add
        };
        let b = picked(&rows, SuggestionKind::Bookmark, &self.bookmarks, room);
        rows.extend(b);
        let h = picked(&rows, SuggestionKind::History, &self.history, room);
        rows.extend(h);
        out.extend(rows);
        out.extend(last);
        out
    }
}

pub fn now() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Whether `url` (without its scheme and `www.`) starts with `typed`
/// (lowercase): the address Tab completes to.
pub fn completes(url: &str, typed: &str) -> bool {
    let u = url.to_lowercase();
    let u = u
        .trim_start_matches("https://")
        .trim_start_matches("http://")
        .trim_start_matches("www.");
    !typed.is_empty() && (u.starts_with(typed) || url.to_lowercase().starts_with(typed))
}

/// Address field text to a URL: a URL as typed, a bare host gets https, anything else is a search.
pub fn to_url(input: &str) -> String {
    let s = input.trim();
    if s.contains("://")
        || s.starts_with("about:")
        || s.starts_with("redrob:")
        || s.starts_with("data:")
    {
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
    (
        "duckduckgo",
        "DuckDuckGo",
        "https://duckduckgo.com/html/?q={q}",
    ),
    ("google", "Google", "https://www.google.com/search?q={q}"),
    (
        "naver",
        "Naver",
        "https://search.naver.com/search.naver?query={q}",
    ),
    ("bing", "Bing", "https://www.bing.com/search?q={q}"),
];

static SEARCH: std::sync::RwLock<&str> =
    std::sync::RwLock::new("https://duckduckgo.com/html/?q={q}");

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
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                (b as char).to_string()
            }
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    template.replace("{q}", &q)
}
