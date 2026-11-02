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
    struct Requests;

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
            _browser: Option<&mut Browser>,
            _frame: Option<&mut Frame>,
            request: Option<&mut Request>,
            allow_os_execution: Option<&mut ::std::os::raw::c_int>,
        ) {
            // mailto:, tel:, zoommtg: and the rest go to the program the
            // system has for them, after Chrome's "Open ...?" dialog, as in
            // Chrome. Without this a page with a resource handler gets
            // ERR_UNKNOWN_URL_SCHEME.
            let url = request.map(|r| super::text(&r.url())).unwrap_or_default();
            if let Some(allow) = allow_os_execution {
                *allow = external_ok(&url) as _;
            }
        }
    }
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
    struct Handler;

    impl RequestHandler {
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
            Some(Requests::new())
        }
    }
}

/// The tab's request handler.
pub fn new() -> RequestHandler {
    Handler::new()
}
