//! CEF handlers for browser features (owned by the features work, docs/CEF.md).
//!
//! Each file exposes a constructor that takes a `super::Sink` and returns the
//! CEF handler; `cef/client.rs` returns them from the matching `get_*_handler`.
//! The window draws what they report with `ui::Prompts`; ops the engine does
//! not handle itself go to [`run_op`].

pub mod chrome;
pub mod context_menu;
pub mod cookies;
pub mod download;
pub mod extensions;
pub mod external;
pub mod find;
pub mod jsdialog;
pub mod languages;
pub mod permission;
pub mod print;
pub mod reader;
pub mod site_info;
pub mod spelling;
pub mod ui;
pub mod widevine;
pub mod zoom;

use std::path::PathBuf;
use std::sync::{Arc, Mutex, OnceLock};

use cef::*;

use super::Sink;
use crate::cdp::{Event, Op};
use crate::profile::SiteSettings;

/// What the handlers need from the window's profile, set once at start.
pub struct Features {
    /// Permission and zoom choices per site.
    pub sites: SiteSettings,
    /// Where downloads go.
    pub downloads: PathBuf,
}

static FEATURES: OnceLock<Features> = OnceLock::new();

/// Set the profile's feature settings. Call before the first tab opens.
pub fn configure(f: Features) {
    let _ = FEATURES.set(f);
}

/// The profile's feature settings; memory-only ones when none were set.
pub fn features() -> &'static Features {
    FEATURES.get_or_init(|| Features {
        sites: SiteSettings::memory(),
        downloads: crate::profile::downloads_dir(),
    })
}

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
/// Answers from the window (a permission, a dialog, a menu choice) go
/// through here.
pub(crate) fn on_ui(job: impl FnOnce() + Send + 'static) {
    if currently_on(ThreadId::UI) != 0 {
        job();
        return;
    }
    let mut task = OnUi::new(Arc::new(Mutex::new(Some(Box::new(job)))));
    post_task(ThreadId::UI, Some(&mut task));
}

/// Handle a feature op (find, zoom, print) for `browser`.
pub fn run_op(sink: &Sink, browser: &Browser, op: Op) {
    match op {
        Op::Find {
            text,
            forward,
            match_case,
            next,
        } => find::find(browser, &text, forward, match_case, next),
        Op::StopFind => find::stop(browser),
        Op::Zoom(step) => {
            let percent = zoom::step(browser, step, &features().sites);
            sink.send(browser.identifier(), Event::Zoom(percent));
        }
        Op::Print => print::print(sink, browser),
        Op::Reader => reader::toggle(browser),
        Op::Chrome(command) => {
            if crate::cef::native::chrome_style() {
                chrome::run(browser, command);
            }
        }
        Op::Edit(e) => {
            let frame = browser.focused_frame().or_else(|| browser.main_frame());
            if let Some(f) = frame {
                match e {
                    crate::cdp::Edit::Cut => f.cut(),
                    crate::cdp::Edit::Copy => f.copy(),
                    crate::cdp::Edit::Paste => f.paste(),
                }
            }
        }
        Op::Commands => {
            let chrome = crate::cef::native::chrome_style();
            let on = |c: i32| chrome && chrome::enabled(browser, c);
            let commands = crate::cdp::PageCommands {
                translate: on(chrome::id::SHOW_TRANSLATE),
                save: on(chrome::id::SAVE_PAGE),
                task_manager: on(chrome::id::TASK_MANAGER),
            };
            crate::cdp::trace(format_args!("page commands: {commands:?}"));
            sink.send(browser.identifier(), Event::Commands(commands));
        }
        _ => {}
    }
}

/// The main frame of `browser` moved to `url`: give it its site's zoom.
pub fn on_address_change(sink: &Sink, browser: &Browser, url: &str) {
    if !(url.starts_with("http://") || url.starts_with("https://")) {
        return;
    }
    let before = browser
        .host()
        .map(|h| zoom::percent_of(h.zoom_level()))
        .unwrap_or(100);
    let p = zoom::restore(browser, url, &features().sites);
    if p != before {
        sink.send(browser.identifier(), Event::Zoom(p));
    }
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
