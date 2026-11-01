//! Pages that open pages: `target=_blank` links and `window.open`.
//!
//! The client's life-span handler calls these. A link or a plain
//! `window.open(url)` becomes `Event::Opened`: the window opens the URL in a
//! new tab next to its opener, as before CEF. A sign-in popup (`window.open`
//! with a size, or with no URL to write into) needs `window.opener` to send
//! its result back, so CEF makes that browser itself, off screen like every
//! tab, and `Event::Popup` asks the window to show it as a tab.

use cef::*;

use crate::cdp::Event;
use crate::cef::Sink;

/// Whether a new page must stay connected to its opener: popups the page
/// sized (sign-in windows) and blank windows the page writes into.
pub fn keeps_opener(disposition: WindowOpenDisposition, sized_popup: bool, url: &str) -> bool {
    disposition == WindowOpenDisposition::NEW_POPUP || sized_popup || url.is_empty() || url == "about:blank"
}

/// `LifeSpanHandler::on_before_popup`. Returns what the handler returns:
/// 1 cancels CEF's popup (the window opens the tab), 0 lets CEF make it.
#[allow(clippy::too_many_arguments)]
pub fn on_before_popup(
    sink: &Sink,
    browser: Option<&mut Browser>,
    target_url: Option<&CefString>,
    target_disposition: WindowOpenDisposition,
    popup_features: Option<&PopupFeatures>,
    window_info: Option<&mut WindowInfo>,
) -> ::std::os::raw::c_int {
    let url = super::arg(target_url);
    let opener = browser.map(|b| b.identifier());
    let sized = popup_features.is_some_and(|f| f.is_popup != 0);
    if keeps_opener(target_disposition, sized, &url) {
        if let Some(info) = window_info {
            // Drawn into the window like any tab, never a native window.
            info.windowless_rendering_enabled = 1;
            info.parent_window = 0;
        }
        return 0;
    }
    if target_disposition == WindowOpenDisposition::SAVE_TO_DISK {
        return 1;
    }
    let event = Event::Opened {
        url,
        opener: opener.and_then(|id| sink.tab_of(id)),
    };
    match opener {
        Some(id) if sink.tab_of(id).is_some() => sink.send(id, event),
        _ => sink.send_global(event),
    }
    1
}

/// `LifeSpanHandler::on_after_created`: a popup CEF made for its opener
/// asks the window for a tab. Returns true when `browser` was such a popup.
pub fn on_after_created(sink: &Sink, browser: Option<&mut Browser>) -> bool {
    let Some(browser) = browser else {
        return false;
    };
    if browser.is_popup() == 0 {
        return false;
    }
    let opener_id = browser.host().map(|h| h.opener_identifier()).unwrap_or(0);
    let opener = sink.tab_of(opener_id);
    let url = browser
        .main_frame()
        .map(|f| super::text(&f.url()))
        .unwrap_or_default();
    let event = Event::Popup {
        browser_id: browser.identifier(),
        url,
        opener,
    };
    match opener {
        Some(_) => sink.send(opener_id, event),
        None => sink.send_global(event),
    }
    true
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn links_open_tabs_and_sign_in_popups_keep_their_opener() {
        let tab = WindowOpenDisposition::NEW_FOREGROUND_TAB;
        assert!(!keeps_opener(tab, false, "https://example.com/"));
        assert!(!keeps_opener(WindowOpenDisposition::NEW_BACKGROUND_TAB, false, "https://a.b/"));
        assert!(keeps_opener(WindowOpenDisposition::NEW_POPUP, false, "https://accounts.google.com/"));
        assert!(keeps_opener(tab, true, "https://accounts.google.com/"));
        assert!(keeps_opener(tab, false, ""));
        assert!(keeps_opener(tab, false, "about:blank"));
    }
}
