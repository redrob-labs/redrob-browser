//! Downloads: where a file goes, its progress in the downloads panel, and
//! cancel, pause, resume and open from the window.
//!
//! Like before CEF, a file goes straight to the downloads folder under the
//! name the site suggests, made unique so nothing is overwritten. With
//! "ask where to save" on, Chromium's save dialog opens instead.

use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};

use cef::*;

use super::text;
use crate::cdp::Event;
use crate::cef::Sink;

/// What the window can do to a download.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Action {
    Cancel,
    Pause,
    Resume,
}

/// Running downloads by id, with the callback that controls each.
fn running() -> &'static Mutex<HashMap<String, DownloadItemCallback>> {
    static RUNNING: OnceLock<Mutex<HashMap<String, DownloadItemCallback>>> = OnceLock::new();
    RUNNING.get_or_init(Default::default)
}

/// Cancel, pause or resume the download `guid` (from `Event::Download`).
/// Returns false when it is no longer running.
pub fn control(guid: &str, action: Action) -> bool {
    let Some(cb) = running().lock().ok().and_then(|r| r.get(guid).cloned()) else {
        return false;
    };
    super::on_ui(move || match action {
        Action::Cancel => cb.cancel(),
        Action::Pause => cb.pause(),
        Action::Resume => cb.resume(),
    });
    true
}

/// Open a finished download with the program the OS picks for it.
pub fn open(path: &Path) -> std::io::Result<()> {
    open::that_detached(path)
}

/// Show a finished download in the file manager (its folder).
pub fn show_in_folder(path: &Path) -> std::io::Result<()> {
    open::that_detached(path.parent().unwrap_or(path))
}

/// `dir/name`, or `dir/name (1).ext`, `(2)`... when that file already exists.
pub fn unique_path(dir: &Path, name: &str) -> PathBuf {
    let name = safe_name(name);
    let first = dir.join(&name);
    if !first.exists() {
        return first;
    }
    let (stem, ext) = match name.rfind('.') {
        Some(i) if i > 0 => (&name[..i], &name[i..]),
        _ => (name.as_str(), ""),
    };
    (1..)
        .map(|n| dir.join(format!("{stem} ({n}){ext}")))
        .find(|p| !p.exists())
        .expect("some name is free")
}

/// A file name a site cannot use to leave the downloads folder.
pub fn safe_name(name: &str) -> String {
    let base = name.rsplit(['/', '\\']).next().unwrap_or_default();
    let cleaned: String = base
        .chars()
        .map(|c| match c {
            '<' | '>' | ':' | '"' | '|' | '?' | '*' => '_',
            c if c.is_control() => '_',
            c => c,
        })
        .collect();
    let cleaned = cleaned
        .trim()
        .trim_start_matches('.')
        .trim_end_matches(['.', ' ']);
    if cleaned.is_empty() {
        "download".to_string()
    } else {
        cleaned.to_string()
    }
}

/// The window's state word for a download, as the downloads panel reads it.
/// An interrupted download shows as failed, as before CEF.
pub fn state_of(complete: bool, canceled: bool, interrupted: bool, paused: bool) -> &'static str {
    if complete {
        "completed"
    } else if canceled || interrupted {
        "canceled"
    } else if paused {
        "paused"
    } else {
        "inProgress"
    }
}

/// Addresses the person chose "Save link as..." or "Save image as..." for:
/// their downloads open the save dialog, as in Chrome.
fn asked() -> &'static Mutex<Vec<String>> {
    static ASKED: OnceLock<Mutex<Vec<String>>> = OnceLock::new();
    ASKED.get_or_init(Default::default)
}

/// Download `url` from `browser`'s page and ask where to save it.
pub fn save_as(browser: &Browser, url: &str) {
    let Some(host) = browser.host() else {
        return;
    };
    if let Ok(mut a) = asked().lock() {
        a.push(url.to_string());
    }
    host.start_download(Some(&CefString::from(url)));
}

/// Whether the download of `url` (or the address it started from) was a
/// "Save as": once only.
fn take_asked(urls: &[String]) -> bool {
    let Ok(mut a) = asked().lock() else {
        return false;
    };
    match a.iter().position(|u| urls.contains(u)) {
        Some(i) => {
            a.remove(i);
            true
        }
        None => false,
    }
}

/// The folder the save dialog opens in: the downloads folder until the
/// person saved somewhere, then where they last saved, as in Chrome.
///
/// CEF hands Chromium's dialog the file name only, and Chromium starts it
/// in the profile's last selected folder (`selectfile.last_directory`),
/// the home folder until a dialog was used.
fn start_in(dir: &Path) {
    const LAST: &str = "selectfile.last_directory";
    let last = crate::cef::pref(LAST);
    if !crate::cef::pref_is_set(LAST) || !Path::new(&last).is_dir() {
        crate::cef::set_pref(LAST, &dir.to_string_lossy());
    }
}

wrap_download_handler! {
    struct Downloads {
        sink: Sink,
        dir: PathBuf,
        ask: bool,
    }

    impl DownloadHandler {
        fn can_download(
            &self,
            _browser: Option<&mut Browser>,
            _url: Option<&CefString>,
            _request_method: Option<&CefString>,
        ) -> ::std::os::raw::c_int {
            1
        }

        fn on_before_download(
            &self,
            _browser: Option<&mut Browser>,
            download_item: Option<&mut DownloadItem>,
            suggested_name: Option<&CefString>,
            callback: Option<&mut BeforeDownloadCallback>,
        ) -> ::std::os::raw::c_int {
            let Some(callback) = callback else {
                return 0;
            };
            let mut name = super::arg(suggested_name);
            let mut urls = Vec::new();
            if let Some(item) = download_item.as_deref() {
                if name.is_empty() {
                    name = text(&item.suggested_file_name());
                }
                urls.push(text(&item.url()));
                urls.push(text(&item.original_url()));
            }
            let ask = take_asked(&urls) || self.ask;
            if ask {
                start_in(&self.dir);
            }
            let _ = std::fs::create_dir_all(&self.dir);
            let path = unique_path(&self.dir, &name);
            let path = CefString::from(path.to_string_lossy().as_ref());
            callback.cont(Some(&path), ask as i32);
            1
        }

        fn on_download_updated(
            &self,
            _browser: Option<&mut Browser>,
            download_item: Option<&mut DownloadItem>,
            callback: Option<&mut DownloadItemCallback>,
        ) {
            let Some(item) = download_item else {
                return;
            };
            let guid = item.id().to_string();
            let state = state_of(
                item.is_complete() != 0,
                item.is_canceled() != 0,
                item.is_interrupted() != 0,
                item.is_paused() != 0,
            );
            if let Ok(mut r) = running().lock() {
                match (state, callback) {
                    ("inProgress" | "paused", Some(cb)) => {
                        r.insert(guid.clone(), cb.clone());
                    }
                    _ => {
                        r.remove(&guid);
                    }
                }
            }
            let path = text(&item.full_path());
            let filename = Path::new(&path)
                .file_name()
                .map(|n| n.to_string_lossy().into_owned())
                .unwrap_or_else(|| text(&item.suggested_file_name()));
            self.sink.send_global(Event::Download {
                guid,
                url: text(&item.url()),
                filename,
                state: state.to_string(),
                path,
                bytes: item.received_bytes().max(0) as u64,
            });
        }
    }
}

/// The download handler: files go to `dir` (the profile's downloads folder),
/// or Chromium's save dialog opens when `ask` is set.
pub fn new(sink: Sink, dir: PathBuf, ask: bool) -> DownloadHandler {
    Downloads::new(sink, dir, ask)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_stay_in_the_folder() {
        assert_eq!(safe_name("../../etc/passwd"), "passwd");
        assert_eq!(safe_name("..\\..\\boot.ini"), "boot.ini");
        assert_eq!(safe_name(".bashrc"), "bashrc");
        assert_eq!(safe_name("a:b?.txt"), "a_b_.txt");
        assert_eq!(safe_name(""), "download");
        assert_eq!(safe_name("..."), "download");
        assert_eq!(safe_name("report.pdf"), "report.pdf");
    }

    #[test]
    fn existing_files_are_not_overwritten() {
        let dir = super::super::test_dir("download");
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a.txt"));
        std::fs::write(dir.join("a.txt"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (1).txt"));
        std::fs::write(dir.join("a (1).txt"), "x").unwrap();
        assert_eq!(unique_path(&dir, "a.txt"), dir.join("a (2).txt"));
        std::fs::write(dir.join("noext"), "x").unwrap();
        assert_eq!(unique_path(&dir, "noext"), dir.join("noext (1)"));
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn states_match_the_downloads_panel() {
        assert_eq!(state_of(false, false, false, false), "inProgress");
        assert_eq!(state_of(true, false, false, false), "completed");
        assert_eq!(state_of(false, true, false, false), "canceled");
        assert_eq!(state_of(false, false, true, false), "canceled");
        assert_eq!(state_of(false, false, false, true), "paused");
    }

    #[test]
    fn unknown_download_is_not_controlled() {
        assert!(!control("no-such-download", Action::Cancel));
    }
}
