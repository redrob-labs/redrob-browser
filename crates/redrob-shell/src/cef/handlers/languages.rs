//! The tab's request handler: the languages pages are asked for, and links
//! of schemes Chromium does not know (mailto:, tel:).
//!
//! The languages pages are asked for follow the window's language at once.
//!
//! `navigator.languages` and new pages follow Chromium's preference
//! (cef/mod.rs `apply_languages`), but CEF fixes the `Accept-Language` of
//! a page's requests when the page loads. So a page already open would keep
//! asking for the old language until it navigates; Chrome switches at once.
//! Requests that carry the header CEF computed for another of the window's
//! languages get the current one instead. A header the page set itself to
//! anything else is left alone.

use cef::*;

use crate::i18n::Lang;

/// The languages pages are asked for when the window speaks `lang`.
pub fn list(lang: Lang) -> &'static str {
    match lang {
        Lang::Ko => "ko-KR,ko,en-US,en",
        Lang::En => "en-US,en",
    }
}

/// The `Accept-Language` header Chromium makes of a language list
/// (`net::HttpUtil::GenerateAcceptLanguageHeader`): the first one plain,
/// then weights falling by 0.1, not below 0.1.
pub fn header(list: &str) -> String {
    let mut q = 10;
    let mut out = Vec::new();
    for lang in list.split(',').map(str::trim).filter(|l| !l.is_empty()) {
        if q == 10 {
            out.push(lang.to_string());
        } else {
            out.push(format!("{lang};q=0.{q}"));
        }
        if q > 1 {
            q -= 1;
        }
    }
    out.join(",")
}

/// What a request should carry instead of `sent`, if anything: the current
/// language's header when `sent` is missing or another language's.
pub fn replacement(sent: &str, now: Lang) -> Option<String> {
    let want = header(list(now));
    let stale = sent.is_empty()
        || [Lang::En, Lang::Ko]
            .iter()
            .any(|&l| l != now && header(list(l)) == sent);
    (stale && sent != want).then_some(want)
}

wrap_resource_request_handler! {
    struct Requests {
        sink: crate::cef::Sink,
    }

    impl ResourceRequestHandler {
        fn on_before_resource_load(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            request: Option<&mut Request>,
            _callback: Option<&mut Callback>,
        ) -> ReturnValue {
            if let Some(r) = request {
                let name = CefString::from("Accept-Language");
                let sent = super::text(&r.header_by_name(Some(&name)));
                if let Some(want) = replacement(&sent, crate::i18n::current()) {
                    r.set_header_by_name(Some(&name), Some(&CefString::from(want.as_str())), 1);
                }
            }
            ReturnValue::CONTINUE
        }

        fn on_protocol_execution(
            &self,
            browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            request: Option<&mut Request>,
            allow_os_execution: Option<&mut ::std::os::raw::c_int>,
        ) {
            // mailto:, tel:, zoommtg: and the rest go to the program the
            // system has for them once the person agrees, as in Chrome
            // ("Open xdg-email?"): the window asks (Event::External).
            // Chromium itself does nothing with them.
            if let Some(allow) = allow_os_execution {
                *allow = 0;
            }
            let url = request.map(|r| super::text(&r.url())).unwrap_or_default();
            let (Some(browser), true) = (browser, external_ok(&url)) else {
                return;
            };
            let origin = frame
                .map(|f| super::text(&f.url()))
                .and_then(|u| super::site_of(&u))
                .unwrap_or_default();
            ask(&self.sink, browser.identifier(), origin, url);
        }
    }
}

/// Open `url` with another program as the site's saved choice says, or ask.
fn ask(sink: &crate::cef::Sink, browser_id: i32, origin: String, url: String) {
    match super::features()
        .sites
        .get(&origin, &external_key(&url))
        .as_deref()
    {
        Some("allow") => super::external::launch(&url),
        Some("block") => {}
        _ => sink.send(browser_id, crate::cdp::Event::External { origin, url }),
    }
}

/// Schemes Chromium loads itself.
pub fn chromium_scheme(scheme: &str) -> bool {
    matches!(
        scheme,
        "http"
            | "https"
            | "file"
            | "ftp"
            | "data"
            | "blob"
            | "about"
            | "chrome"
            | "chrome-extension"
            | "chrome-untrusted"
            | "chrome-search"
            | "chrome-error"
            | "chrome-native"
            | "devtools"
            | "view-source"
            | "javascript"
            | "ws"
            | "wss"
            | "filesystem"
            | "redrob"
    ) || scheme.starts_with("web+")
        || scheme.starts_with("ext+")
}

/// Whether a site registered itself for `scheme` (registerProtocolHandler):
/// Chromium sends those links to it. Call on CEF's UI thread.
fn registered(scheme: &str) -> bool {
    use cef::{
        ImplDictionaryValue as _, ImplListValue as _, ImplPreferenceManager as _, ImplValue as _,
    };
    let Some(list) = crate::cef::request_context()
        .and_then(|c| {
            c.preference(Some(&CefString::from(
                "custom_handlers.registered_protocol_handlers",
            )))
        })
        .and_then(|v| v.list())
    else {
        return false;
    };
    (0..list.size()).any(|i| {
        list.dictionary(i)
            .map(|d| super::text(&d.string(Some(&CefString::from("protocol")))) == scheme)
            .unwrap_or(false)
    })
}

/// The key a site's "always open these links" is saved under.
pub fn external_key(url: &str) -> String {
    let scheme = url
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    format!("external.{scheme}")
}

/// Whether a URL of a scheme Chromium does not know may go to the system's
/// handler: any but the schemes that run code or read files, which Chrome
/// never hands out either.
pub fn external_ok(url: &str) -> bool {
    let scheme = url
        .split(':')
        .next()
        .unwrap_or_default()
        .to_ascii_lowercase();
    !scheme.is_empty()
        && !matches!(
            scheme.as_str(),
            "javascript" | "vbscript" | "file" | "data" | "shell" | "ms-msdt" | "search-ms"
        )
}

wrap_request_handler! {
    struct Handler {
        sink: crate::cef::Sink,
    }

    impl RequestHandler {
        fn on_before_browse(
            &self,
            browser: Option<&mut Browser>,
            frame: Option<&mut Frame>,
            request: Option<&mut Request>,
            _user_gesture: ::std::os::raw::c_int,
            _is_redirect: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            // A link only another program opens: ask, and leave the page
            // where it is (Chromium would show ERR_UNKNOWN_URL_SCHEME). A
            // scheme a site registered (registerProtocolHandler) is the
            // site's, and Chromium sends it there.
            let url = request.map(|r| super::text(&r.url())).unwrap_or_default();
            let scheme = super::external::scheme(&url);
            if chromium_scheme(&scheme) || !external_ok(&url) || registered(&scheme) {
                return 0;
            }
            let (Some(browser), Some(_)) = (browser, frame) else {
                return 0;
            };
            let origin = browser
                .main_frame()
                .map(|f| super::text(&f.url()))
                .and_then(|u| super::site_of(&u))
                .unwrap_or_default();
            ask(&self.sink, browser.identifier(), origin, url);
            1
        }

        fn resource_request_handler(
            &self,
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            _request: Option<&mut Request>,
            _is_navigation: ::std::os::raw::c_int,
            _is_download: ::std::os::raw::c_int,
            _request_initiator: Option<&CefString>,
            _disable_default_handling: Option<&mut ::std::os::raw::c_int>,
        ) -> Option<ResourceRequestHandler> {
            Some(Requests::new(self.sink.clone()))
        }
    }
}

/// The tab's request handler.
pub fn new(sink: crate::cef::Sink) -> RequestHandler {
    Handler::new(sink)
}
