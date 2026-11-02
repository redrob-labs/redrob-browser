//! Chrome's cookies into the profile (import_chrome.rs reads them): set
//! through the tabs' `CookieManager`, so signed-in sites stay signed in.

use cef::*;

use crate::import_chrome::ChromeCookie;

/// The address a cookie belongs to, for `set_cookie`.
pub fn url_of(c: &ChromeCookie) -> String {
    let host = c.host.trim_start_matches('.');
    let scheme = if c.secure { "https" } else { "http" };
    let path = if c.path.starts_with('/') { c.path.as_str() } else { "/" };
    format!("{scheme}://{host}{path}")
}

fn same_site(v: i32) -> CookieSameSite {
    use cef::sys::cef_cookie_same_site_t as S;
    match v {
        0 => S::CEF_COOKIE_SAME_SITE_NO_RESTRICTION,
        1 => S::CEF_COOKIE_SAME_SITE_LAX_MODE,
        2 => S::CEF_COOKIE_SAME_SITE_STRICT_MODE,
        _ => S::CEF_COOKIE_SAME_SITE_UNSPECIFIED,
    }
    .into()
}

/// Set `cookies` in the window's profile. Returns how many CEF took; call on
/// the window thread (CEF's UI thread).
pub fn import(cookies: &[ChromeCookie]) -> usize {
    let Some(manager) = crate::cef::request_context().and_then(|c| c.cookie_manager(None)) else {
        return 0;
    };
    let mut set = 0;
    for c in cookies {
        let cookie = Cookie {
            name: CefString::from(c.name.as_str()),
            value: CefString::from(c.value.as_str()),
            // A host cookie (no leading dot) is set without a domain.
            domain: CefString::from(if c.host.starts_with('.') {
                c.host.as_str()
            } else {
                ""
            }),
            path: CefString::from(c.path.as_str()),
            secure: c.secure as _,
            httponly: c.httponly as _,
            creation: Basetime { val: c.creation },
            last_access: Basetime { val: c.last_access },
            has_expires: (c.expires != 0) as _,
            expires: Basetime { val: c.expires },
            same_site: same_site(c.same_site),
            ..Default::default()
        };
        let url = CefString::from(url_of(c).as_str());
        if manager.set_cookie(Some(&url), Some(&cookie), None) == 1 {
            set += 1;
        }
    }
    manager.flush_store(None);
    set
}
