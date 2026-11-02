//! Each tab's page as a Chrome browser that has Chrome's toolbar (Chrome
//! style on Linux and Windows, macOS opt-in; docs/CEF.md).
//!
//! CEF makes a page created inside a parent window (`set_as_child`) a
//! popup-type Chrome browser with no toolbar. Chrome keeps the extensions'
//! toolbar container there, and every path to an extension's action that
//! grants it `activeTab` goes through that container
//! (`Extensions.triggerAction` crashes without one). So each page is a CEF
//! Views window of its own instead: frameless, holding one Chrome style
//! `BrowserView` with Chrome's normal toolbar, which stays hidden (the
//! window draws its own). Before it is ever shown, its native window is
//! moved into the browser window's page area, as a window manager moves a
//! window into its frame; from there native.rs places, shows, hides and
//! re-parents it as it did the child pages (Windows: a `WS_CHILD` HWND;
//! macOS: a child NSWindow kept over the page area).
//!
//! Pages a page opens (`window.open`, `target=_blank`) are Views browsers
//! too: CEF asks the opener's view for their delegate and window
//! ([`PageView`]).

use std::cell::RefCell;
use std::collections::HashMap;

use cef::*;

use super::native::{self, Place};
use crate::model::TabId;

/// Whether pages are hosted this way: in Chrome style on Linux (X11
/// re-parenting) and Windows (the HWND made `WS_CHILD`, native.rs). macOS
/// only with `REDROB_MAC_HOSTED=1` ([`mac_opt_in`]): there the page's
/// window becomes a child window of the browser window, which also turns
/// macOS pages from Alloy to Chrome style. `REDROB_CHILD_PAGES` keeps the
/// earlier child pages everywhere.
pub fn enabled() -> bool {
    use std::sync::OnceLock;
    static ON: OnceLock<bool> = OnceLock::new();
    *ON.get_or_init(|| {
        (cfg!(any(target_os = "linux", windows)) || mac_opt_in())
            && native::chrome_style()
            && std::env::var_os("REDROB_CHILD_PAGES").is_none()
    })
}

/// macOS hosting is asked for (`REDROB_MAC_HOSTED=1`). Off by default
/// until it runs on a Mac: CEF cannot put a Chrome style page inside our
/// NSView (browser_host_create.cc, issue #3294), so the page is an NSWindow
/// of its own kept over the page area as a child window, and a click in it
/// makes that window key (the browser window's title bar dims meanwhile).
pub fn mac_opt_in() -> bool {
    cfg!(target_os = "macos")
        && std::env::var_os("REDROB_MAC_HOSTED").is_some_and(|v| v == "1")
        && std::env::var_os("REDROB_CHILD_PAGES").is_none()
}

thread_local! {
    /// Popups announced in `on_before_popup`, by their client, until CEF
    /// asks the opener's view for their delegate.
    static POPUP_CLIENTS: RefCell<HashMap<usize, TabId>> = RefCell::new(HashMap::new());
    /// The popup whose view CEF is creating now (between its delegate and
    /// `on_popup_browser_view_created`).
    static CREATING: RefCell<Option<TabId>> = const { RefCell::new(None) };
    /// The browsers hosted here, by id.
    static HOSTED: RefCell<std::collections::HashSet<i32>> = RefCell::new(Default::default());
    /// Pages whose window Chrome moved itself (fullscreen), to be put back.
    static REFIT: RefCell<Vec<TabId>> = const { RefCell::new(Vec::new()) };
}

/// Pages whose window Chrome resized itself since the last call
/// (`on_window_fullscreen_transition`): cdp.rs puts them back where they
/// belong.
pub fn take_refit() -> Vec<TabId> {
    REFIT.with_borrow_mut(std::mem::take)
}

fn client_key(client: &Client) -> usize {
    ImplClient::get_raw(client) as usize
}

/// The page `client` serves, tab `tab`, is about to be opened by a page
/// hosted here (client.rs `on_before_popup`).
pub fn expect_popup(client: &Client, tab: TabId) {
    POPUP_CLIENTS.with_borrow_mut(|p| p.insert(client_key(client), tab));
}

/// Whether `browser`'s page is hosted here (its pages open as Views
/// browsers too).
pub fn hosts(browser: &Browser) -> bool {
    let id = browser.identifier();
    HOSTED.with_borrow(|h| h.contains(&id))
}

/// Create tab `tab`'s page at `place` (hidden: `native` shows it). The
/// browser arrives in the client's `on_after_created`, as for child pages.
pub fn create(
    tab: TabId,
    place: Place,
    client: &mut Client,
    url: &str,
    settings: &BrowserSettings,
    context: Option<&mut RequestContext>,
) -> bool {
    let mut delegate = PageView::new(tab);
    let Some(view) = browser_view_create(
        Some(client),
        Some(&CefString::from(url)),
        Some(settings),
        None,
        context,
        Some(&mut delegate),
    ) else {
        return false;
    };
    open_window(tab, view, place)
}

/// A frameless top-level CEF window holding `view`, tab `tab`'s page,
/// moved into the page area of `place` as soon as it exists.
fn open_window(tab: TabId, view: BrowserView, place: Place) -> bool {
    let mut delegate = PageWindow::new(tab, view, place);
    window_create_top_level(Some(&mut delegate)).is_some()
}

wrap_browser_view_delegate! {
    struct PageView {
        tab: TabId,
    }

    impl ViewDelegate {
        fn on_window_changed(&self, view: Option<&mut View>, added: ::std::os::raw::c_int) {
            // Chrome's toolbar keeps the extensions' container; the
            // window draws its own toolbar, so Chrome's stays out of sight.
            if added != 1 || std::env::var_os("REDROB_CHROME_TOOLBAR").is_some() {
                return;
            }
            let toolbar = view
                .and_then(|v| v.as_browser_view())
                .and_then(|b| b.chrome_toolbar());
            if let Some(t) = toolbar {
                t.set_visible(0);
            }
        }
    }

    impl BrowserViewDelegate {
        fn chrome_toolbar_type(&self, _browser_view: Option<&mut BrowserView>) -> ChromeToolbarType {
            sys::cef_chrome_toolbar_type_t::CEF_CTT_NORMAL.into()
        }

        fn browser_runtime_style(&self) -> RuntimeStyle {
            sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_CHROME.into()
        }

        fn delegate_for_popup_browser_view(
            &self,
            _browser_view: Option<&mut BrowserView>,
            _settings: Option<&BrowserSettings>,
            client: Option<&mut Client>,
            is_devtools: ::std::os::raw::c_int,
        ) -> Option<BrowserViewDelegate> {
            if is_devtools == 1 {
                // A DevTools browser: a plain one in a window of its own
                // (`on_popup_browser_view_created`).
                return Some(DevToolsView::new());
            }
            let key = client_key(client?);
            let tab = POPUP_CLIENTS.with_borrow_mut(|p| p.remove(&key))?;
            CREATING.with_borrow_mut(|c| *c = Some(tab));
            Some(PageView::new(tab))
        }

        fn on_popup_browser_view_created(
            &self,
            _browser_view: Option<&mut BrowserView>,
            popup_browser_view: Option<&mut BrowserView>,
            is_devtools: ::std::os::raw::c_int,
        ) -> ::std::os::raw::c_int {
            if is_devtools == 1 {
                let Some(view) = popup_browser_view else { return 0 };
                let page = _browser_view
                    .and_then(|v| v.browser())
                    .and_then(|b| b.main_frame())
                    .map(|f| super::handlers::text(&f.url()))
                    .unwrap_or_default();
                let mut d = DevToolsWindow::new(view.clone(), devtools_title(&page));
                return window_create_top_level(Some(&mut d)).is_some() as _;
            }
            let tab = CREATING.with_borrow_mut(Option::take);
            let (Some(tab), Some(view)) = (tab, popup_browser_view) else {
                // DevTools, or a page Chrome opened by itself: CEF's own
                // window (client.rs `stray_client` adopts the latter).
                return 0;
            };
            let Some(place) = super::client::place_of(tab) else {
                return 0;
            };
            open_window(tab, view.clone(), place) as _
        }

        fn on_browser_created(&self, _browser_view: Option<&mut BrowserView>, browser: Option<&mut Browser>) {
            if let Some(b) = browser {
                HOSTED.with_borrow_mut(|h| h.insert(b.identifier()));
            }
        }

        fn on_browser_destroyed(&self, browser_view: Option<&mut BrowserView>, browser: Option<&mut Browser>) {
            let _ = self.tab;
            if let Some(b) = browser {
                HOSTED.with_borrow_mut(|h| h.remove(&b.identifier()));
            }
            // Its window goes with it.
            if let Some(w) = browser_view.and_then(|v| v.window()) {
                if w.is_closed() != 1 {
                    w.close();
                }
            }
        }
    }
}

wrap_window_delegate! {
    struct PageWindow {
        tab: TabId,
        view: BrowserView,
        place: Place,
    }

    impl ViewDelegate {}

    impl PanelDelegate {}

    impl WindowDelegate {
        fn on_window_created(&self, window: Option<&mut Window>) {
            let Some(w) = window else { return };
            w.add_child_view(Some(&mut View::from(&self.view)));
            match native::window_of(w) {
                Some(h) => native::embed(h, self.place, || w.show()),
                None => w.show(),
            }
        }

        fn initial_bounds(&self, _window: Option<&mut Window>) -> Rect {
            let [_, _, w, h] = self.place.rect;
            // Windows and macOS take it in DIPs (native.rs sets the size in
            // pixels once the window is in place); Linux in pixels.
            let s = if cfg!(target_os = "linux") {
                1.0
            } else {
                self.place.scale.max(0.1)
            };
            Rect {
                x: native::AWAY,
                y: native::AWAY,
                width: ((w as f32 / s).round() as i32).max(1),
                height: ((h as f32 / s).round() as i32).max(1),
            }
        }

        fn on_window_fullscreen_transition(
            &self,
            _window: Option<&mut Window>,
            _is_completed: ::std::os::raw::c_int,
        ) {
            // A page going fullscreen (a video's button, F11 in the page)
            // has Chrome size its window to the screen, in screen
            // coordinates; inside the browser window that misplaces it. It
            // stays over the page area, fullscreen there.
            // cdp.rs puts it back ([`take_refit`]).
            REFIT.with_borrow_mut(|r| r.push(self.tab));
        }

        fn initial_show_state(&self, _window: Option<&mut Window>) -> ShowState {
            sys::cef_show_state_t::CEF_SHOW_STATE_NORMAL.into()
        }

        fn is_frameless(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }

        fn can_resize(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }

        fn can_close(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }
    }
}

/// The DevTools window's title for the page at `url`, as Chrome names it.
fn devtools_title(url: &str) -> String {
    let page = url
        .strip_prefix("https://")
        .or_else(|| url.strip_prefix("http://"))
        .unwrap_or(url);
    format!("DevTools - {page}")
}

wrap_browser_view_delegate! {
    struct DevToolsView {}

    impl ViewDelegate {}

    impl BrowserViewDelegate {
        fn browser_runtime_style(&self) -> RuntimeStyle {
            // CEF refuses Alloy for DevTools.
            sys::cef_runtime_style_t::CEF_RUNTIME_STYLE_CHROME.into()
        }
    }
}

wrap_window_delegate! {
    struct DevToolsWindow {
        view: BrowserView,
        title: String,
    }

    impl ViewDelegate {}

    impl PanelDelegate {}

    impl WindowDelegate {
        fn on_window_created(&self, window: Option<&mut Window>) {
            let Some(w) = window else { return };
            w.add_child_view(Some(&mut View::from(&self.view)));
            w.set_title(Some(&CefString::from(self.title.as_str())));
            w.show();
        }

        fn initial_bounds(&self, _window: Option<&mut Window>) -> Rect {
            Rect {
                x: 0,
                y: 0,
                width: 1100,
                height: 760,
            }
        }

        fn initial_show_state(&self, _window: Option<&mut Window>) -> ShowState {
            sys::cef_show_state_t::CEF_SHOW_STATE_NORMAL.into()
        }

        fn can_resize(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }

        fn can_maximize(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }

        fn can_minimize(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }

        fn can_close(&self, _window: Option<&mut Window>) -> ::std::os::raw::c_int {
            1
        }
    }
}
