//! Find in page (Ctrl+F): Chromium searches and highlights; the window's
//! find bar shows "3/12" from `Event::FindResult`.

use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;

/// Search `browser`'s page for `text`. `next` continues the last search
/// (Enter in the find bar) instead of starting over.
pub fn find(browser: &Browser, text: &str, forward: bool, match_case: bool, next: bool) {
    let Some(host) = browser.host() else {
        return;
    };
    if text.is_empty() {
        host.stop_finding(1);
        return;
    }
    let text = CefString::from(text);
    host.find(Some(&text), forward as i32, match_case as i32, next as i32);
    if !next {
        // A new search counts the matches but selects none; Chrome's find
        // bar selects the first one ("1/3"), so step onto it.
        host.find(Some(&text), forward as i32, match_case as i32, 1);
    }
}

/// Close find: drop the highlight, keep what is selected.
pub fn stop(browser: &Browser) {
    if let Some(host) = browser.host() {
        host.stop_finding(0);
    }
}

wrap_find_handler! {
    struct Finds {
        sink: Sink,
    }

    impl FindHandler {
        fn on_find_result(
            &self,
            browser: Option<&mut Browser>,
            _identifier: ::std::os::raw::c_int,
            count: ::std::os::raw::c_int,
            _selection_rect: Option<&Rect>,
            active_match_ordinal: ::std::os::raw::c_int,
            _final_update: ::std::os::raw::c_int,
        ) {
            if let Some(b) = browser {
                self.sink.send(
                    b.identifier(),
                    Event::FindResult {
                        count,
                        active: active_match_ordinal,
                    },
                );
            }
        }
    }
}

pub fn new(sink: Sink) -> FindHandler {
    Finds::new(sink)
}
