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
    }
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn headers_match_chromium() {
        assert_eq!(header(list(Lang::En)), "en-US,en;q=0.9");
        assert_eq!(
            header(list(Lang::Ko)),
            "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7"
        );
        assert_eq!(header("a,b,c,d,e,f,g,h,i,j,k,l"), "a,b;q=0.9,c;q=0.8,d;q=0.7,e;q=0.6,f;q=0.5,g;q=0.4,h;q=0.3,i;q=0.2,j;q=0.1,k;q=0.1,l;q=0.1");
    }

    #[test]
    fn only_stale_headers_change() {
        let ko = header(list(Lang::Ko));
        let en = header(list(Lang::En));
        assert_eq!(replacement(&en, Lang::Ko), Some(ko.clone()));
        assert_eq!(replacement(&ko, Lang::En), Some(en.clone()));
        assert_eq!(replacement("", Lang::En), Some(en.clone()));
        assert_eq!(replacement(&en, Lang::En), None);
        // A header the page chose itself stays.
        assert_eq!(replacement("fr-FR", Lang::Ko), None);
    }
}
