//! Chromium (CEF) as the engine behind every window tab (docs/CEF.md).
//!
//! The window keeps its own contract with the engine: `cdp::Op` goes in,
//! `cdp::Update` comes out. This module answers that contract with CEF
//! instead of the Obscura child process.

pub mod handlers;

use std::collections::HashMap;
use std::sync::mpsc::Sender;
use std::sync::{Arc, Mutex};

use crate::cdp::{Event, Update};
use crate::model::TabId;

/// Where CEF callbacks report what happened to a tab.
///
/// CEF names a page by its browser identifier (`Browser::identifier()`); the
/// window names it by `TabId`. The map is filled when a tab's browser is
/// created and emptied when it closes.
#[derive(Clone)]
pub struct Sink {
    tx: Sender<Update>,
    tabs: Arc<Mutex<HashMap<i32, TabId>>>,
}

impl Sink {
    pub fn new(tx: Sender<Update>) -> Self {
        Sink { tx, tabs: Arc::default() }
    }

    pub fn bind(&self, browser_id: i32, tab: TabId) {
        self.tabs.lock().unwrap().insert(browser_id, tab);
    }

    pub fn unbind(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().remove(&browser_id)
    }

    pub fn tab_of(&self, browser_id: i32) -> Option<TabId> {
        self.tabs.lock().unwrap().get(&browser_id).copied()
    }

    /// Report `event` for the tab behind `browser_id`. Events for a browser
    /// the window does not know (closing, or not yet bound) are dropped.
    pub fn send(&self, browser_id: i32, event: Event) {
        if let Some(tab) = self.tab_of(browser_id) {
            let _ = self.tx.send(Update { tab, event });
        }
    }

    /// Report an event that belongs to no tab (downloads use tab 0).
    pub fn send_global(&self, event: Event) {
        let _ = self.tx.send(Update { tab: 0, event });
    }
}
