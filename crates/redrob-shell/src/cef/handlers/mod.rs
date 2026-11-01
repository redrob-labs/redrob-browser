//! CEF handlers for browser features (owned by the features work, docs/CEF.md).
//!
//! Each file exposes a constructor that takes a `super::Sink` and returns the
//! CEF handler; `cef/client.rs` returns them from the matching `get_*_handler`.
//!
//! What the client wires, per handler:
//!
//! | client method | returns |
//! |---|---|
//! | `download_handler` | `download::new(sink, dir, ask)` |
//! | `permission_handler` | `permission::new(sink, sites)` |
//! | `jsdialog_handler` | `jsdialog::new(sink)` |
//! | `context_menu_handler` | `context_menu::new(sink)` |
//! | `find_handler` | `find::new(sink)` |
//! | `life_span_handler` | calls `life_span::on_before_popup` / `on_after_created` |
//! | `on_process_message_received` | calls `login::on_browser_message` |
//!
//! The app's render process handler calls `login::on_context_created` and
//! `login::on_renderer_message` (or returns `login::render_process_handler()`).
//! The app's `on_context_initialized` calls `widevine::install()`. Ops the
//! engine does not handle itself go to `run_op`; a navigation calls
//! `zoom::restore`. The window draws what these report with `ui::Prompts`.

pub mod context_menu;
pub mod download;
pub mod find;
pub mod jsdialog;
pub mod life_span;
pub mod login;
pub mod permission;
pub mod print;
pub mod ui;
pub mod widevine;
pub mod zoom;

use std::sync::{Arc, Mutex};

use cef::*;

use super::Sink;
use crate::cdp::{Event, Op};
use crate::profile::SiteSettings;

/// A CEF string as a Rust string.
pub(crate) fn text(s: &CefStringUserfree) -> String {
    CefString::from(s).to_string()
}

/// An optional CEF string argument as a Rust string.
pub(crate) fn arg(s: Option<&CefString>) -> String {
    s.map(|s| s.to_string()).unwrap_or_default()
}

wrap_task! {
    struct OnUi {
        job: Arc<Mutex<Option<Box<dyn FnOnce() + Send>>>>,
    }

    impl Task {
        fn execute(&self) {
            if let Some(job) = self.job.lock().ok().and_then(|mut j| j.take()) {
                job();
            }
        }
    }
}

/// Run `job` on CEF's UI thread: right away when already there, else posted.
/// Answers from the window (a permission, a dialog, a menu choice) arrive on
/// the window's thread and go through here.
pub(crate) fn on_ui(job: impl FnOnce() + Send + 'static) {
    if currently_on(ThreadId::UI) != 0 {
        job();
        return;
    }
    let mut task = OnUi::new(Arc::new(Mutex::new(Some(Box::new(job)))));
    post_task(ThreadId::UI, Some(&mut task));
}

/// A `Browser` the window may hold on to and act on later from its thread.
#[derive(Clone)]
pub struct BrowserRef(Browser);

impl BrowserRef {
    pub fn new(browser: &Browser) -> Self {
        BrowserRef(browser.clone())
    }

    /// Run `f` with the browser on CEF's UI thread, if it is still open.
    pub fn with(&self, f: impl FnOnce(&Browser) + Send + 'static) {
        let b = self.0.clone();
        on_ui(move || {
            if b.is_valid() != 0 {
                f(&b);
            }
        });
    }
}

/// Handle the feature ops (find, zoom, print, inspect, fill a login) for
/// `browser`. Returns false for ops that are not features.
pub fn run_op(sink: &Sink, browser: &Browser, op: &Op, sites: &SiteSettings) -> bool {
    match op {
        Op::Find {
            text,
            forward,
            match_case,
            next,
        } => find::find(browser, text, *forward, *match_case, *next),
        Op::StopFind => find::stop(browser),
        Op::Zoom(step) => {
            let percent = zoom::step(browser, *step, sites);
            sink.send(browser.identifier(), Event::Zoom(percent));
        }
        Op::Print => print::print(sink, browser),
        Op::Inspect { at } => context_menu::inspect(browser, *at),
        Op::FillLogin { username, password } => login::fill(browser, username, password),
        _ => return false,
    }
    true
}

/// `scheme://host[:port]` of a page, the key per-site choices are saved by.
pub(crate) fn site_of(url: &str) -> Option<String> {
    crate::vault::origin_of(url)
}


/// An empty folder for a test, under the build's target folder.
#[cfg(test)]
pub(crate) fn test_dir(name: &str) -> std::path::PathBuf {
    let dir = std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
        .join("../../target/test-scratch")
        .join(format!("{name}-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();
    dir
}
