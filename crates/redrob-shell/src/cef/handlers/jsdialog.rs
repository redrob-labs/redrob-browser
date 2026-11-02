//! `alert`, `confirm`, `prompt` and "Leave site?": the page waits while the
//! window shows the dialog over the tab (`Event::Dialog`) and answers it.

use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};

use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum Kind {
    Alert,
    Confirm,
    /// `prompt()`, with the text the field starts with.
    Prompt { default_text: String },
    /// The page asks before it is left; `reload` when the person reloads.
    BeforeUnload { reload: bool },
}

/// A dialog for the window to show, carried by `Event::Dialog`.
pub struct Dialog {
    pub kind: Kind,
    /// The site that asks, shown as the dialog's title ("example.com says").
    pub origin: String,
    pub message: String,
    callback: JsdialogCallback,
    open: Arc<AtomicBool>,
}

impl Dialog {
    /// False once the page went away and the dialog no longer matters.
    pub fn is_open(&self) -> bool {
        self.open.load(Ordering::Relaxed)
    }

    /// OK (or Leave) with the prompt's text, or Cancel (or Stay).
    pub fn answer(self, ok: bool, text: &str) {
        if !self.open.swap(false, Ordering::Relaxed) {
            return;
        }
        let text = text.to_string();
        let callback = self.callback;
        super::on_ui(move || callback.cont(ok as i32, Some(&CefString::from(text.as_str()))));
    }
}

/// The dialogs each browser has open, so a reset (the page navigated or
/// closed) can drop them from the window.
fn open_dialogs() -> &'static Mutex<HashMap<i32, Vec<Arc<AtomicBool>>>> {
    static OPEN: OnceLock<Mutex<HashMap<i32, Vec<Arc<AtomicBool>>>>> = OnceLock::new();
    OPEN.get_or_init(Default::default)
}

fn close_all(browser: Option<&mut Browser>) {
    let Some(b) = browser else {
        return;
    };
    if let Some(list) = open_dialogs().lock().ok().and_then(|mut o| o.remove(&b.identifier())) {
        for open in list {
            open.store(false, Ordering::Relaxed);
        }
    }
}

/// The title Chrome gives a dialog: the page's host, or the whole origin for
/// anything that is not http(s).
pub fn title_of(origin_url: &str) -> String {
    match url::Url::parse(origin_url) {
        Ok(u) if matches!(u.scheme(), "http" | "https") => u
            .host_str()
            .map(|h| match u.port() {
                Some(p) => format!("{h}:{p}"),
                None => h.to_string(),
            })
            .unwrap_or_default(),
        _ => origin_url.to_string(),
    }
}

wrap_jsdialog_handler! {
    struct Dialogs {
        sink: Sink,
    }

    impl JsdialogHandler {
        fn on_jsdialog(
            &self,
            browser: Option<&mut Browser>,
            origin_url: Option<&CefString>,
            dialog_type: JsdialogType,
            message_text: Option<&CefString>,
            default_prompt_text: Option<&CefString>,
            callback: Option<&mut JsdialogCallback>,
            _suppress_message: Option<&mut ::std::os::raw::c_int>,
        ) -> ::std::os::raw::c_int {
            let kind = if dialog_type == JsdialogType::CONFIRM {
                Kind::Confirm
            } else if dialog_type == JsdialogType::PROMPT {
                Kind::Prompt {
                    default_text: super::arg(default_prompt_text),
                }
            } else {
                Kind::Alert
            };
            self.show(browser, kind, title_of(&super::arg(origin_url)), super::arg(message_text), callback)
        }

        fn on_before_unload_dialog(
            &self,
            browser: Option<&mut Browser>,
            message_text: Option<&CefString>,
            is_reload: ::std::os::raw::c_int,
            callback: Option<&mut JsdialogCallback>,
        ) -> ::std::os::raw::c_int {
            let origin = browser
                .as_deref()
                .and_then(|b| b.main_frame())
                .map(|f| title_of(&super::text(&f.url())))
                .unwrap_or_default();
            self.show(
                browser,
                Kind::BeforeUnload { reload: is_reload != 0 },
                origin,
                super::arg(message_text),
                callback,
            )
        }

        fn on_reset_dialog_state(&self, browser: Option<&mut Browser>) {
            close_all(browser);
        }

        fn on_dialog_closed(&self, browser: Option<&mut Browser>) {
            close_all(browser);
        }
    }
}

impl Dialogs {
    fn show(
        &self,
        browser: Option<&mut Browser>,
        kind: Kind,
        origin: String,
        message: String,
        callback: Option<&mut JsdialogCallback>,
    ) -> ::std::os::raw::c_int {
        let (Some(browser), Some(callback)) = (browser, callback) else {
            return 0;
        };
        let id = browser.identifier();
        if self.sink.tab_of(id).is_none() {
            // No tab to show it in: answer as if dismissed.
            callback.cont(0, None);
            return 1;
        }
        let open = Arc::new(AtomicBool::new(true));
        if let Ok(mut o) = open_dialogs().lock() {
            o.entry(id).or_default().push(open.clone());
        }
        self.sink.send(
            id,
            Event::Dialog(Dialog {
                kind,
                origin,
                message,
                callback: callback.clone(),
                open,
            }),
        );
        1
    }
}

pub fn new(sink: Sink) -> JsdialogHandler {
    Dialogs::new(sink)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn titles_name_the_site() {
        assert_eq!(title_of("https://www.example.com/a?b"), "www.example.com");
        assert_eq!(title_of("http://localhost:8080/"), "localhost:8080");
        assert_eq!(title_of("file:///home/a.html"), "file:///home/a.html");
        assert_eq!(title_of(""), "");
    }
}
